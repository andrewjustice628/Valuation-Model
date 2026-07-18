/**
 * Pulls a company's latest annual as-reported financials from Finnhub and maps
 * them to our canonical base-year fields (mapping is shared, pure, tested code
 * in src/lib/financials.ts). Key stays server-side. Values are raw dollars.
 */
import { mapReportedFinancials, deriveReportedSeed, type ReportedFinancials } from '../../src/lib/financials';
import { mapYahooTimeseries, deriveYahooSeed, YAHOO_TS_FIELDS } from '../../src/lib/yahooFinancials';
import { deriveBalanceSheetSeed } from '../../src/lib/seed';

export const config = { path: '/api/financials' };

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36';

/** Best-effort Yahoo session cookie (timeseries usually works without a crumb). */
async function yahooCookie(): Promise<string> {
  try {
    const r = await fetch('https://fc.yahoo.com/', { headers: { 'User-Agent': UA } });
    const sc =
      typeof r.headers.getSetCookie === 'function'
        ? r.headers.getSetCookie()
        : [r.headers.get('set-cookie')].filter((c): c is string => !!c);
    return sc.map((c) => c.split(';')[0]).join('; ');
  } catch {
    return '';
  }
}

interface TsPoint {
  asOfDate?: string;
  reportedValue?: { raw?: number };
  currencyCode?: string;
}

/**
 * International fallback: Yahoo fundamentals-timeseries. Flattens each series
 * to its latest annual value into a { baseFieldName: number } record.
 */
async function fetchYahooFinancials(symbol: string) {
  const cookie = await yahooCookie();
  const types = YAHOO_TS_FIELDS.map((f) => `annual${f}`).join(',');
  const now = Math.floor(Date.now() / 1000);
  const period1 = now - 6 * 365 * 24 * 3600;
  const url =
    `https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(symbol)}` +
    `?symbol=${encodeURIComponent(symbol)}&type=${types}&period1=${period1}&period2=${now}&merge=false`;

  const res = await fetch(url, { headers: { 'User-Agent': UA, ...(cookie ? { cookie } : {}) } });
  if (!res.ok) throw new Error(`timeseries ${res.status}`);
  const data = (await res.json()) as {
    timeseries?: { result?: Array<Record<string, unknown> & { meta?: { type?: string[] } }> };
  };
  const series = data.timeseries?.result ?? [];

  const values: Record<string, number> = {};
  let revenueHistory: Array<{ year: number; revenue: number }> = [];
  let endDate: string | null = null;
  let currency: string | null = null;

  for (const s of series) {
    const type = s.meta?.type?.[0];
    if (!type) continue;
    const arr = s[type];
    if (!Array.isArray(arr)) continue;
    const points = (arr as TsPoint[]).filter(
      (p) => p && p.reportedValue && typeof p.reportedValue.raw === 'number',
    );
    if (points.length === 0) continue;
    points.sort((a, b) => (b.asOfDate ?? '').localeCompare(a.asOfDate ?? ''));
    const p = points[0];
    values[type.replace(/^annual/, '')] = p.reportedValue!.raw as number;
    if (!endDate || (p.asOfDate ?? '') > endDate) endDate = p.asOfDate ?? endDate;
    if (!currency && p.currencyCode) currency = p.currencyCode;
    if (type === 'annualTotalRevenue') {
      revenueHistory = points.map((q) => ({
        year: Number((q.asOfDate ?? '').slice(0, 4)),
        revenue: q.reportedValue!.raw as number,
      }));
    }
  }

  return { values, revenueHistory, endDate, currency };
}

interface ReportRow {
  year?: number;
  form?: string;
  endDate?: string;
  report?: ReportedFinancials;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

export default async (req: Request): Promise<Response> => {
  const symbol = (new URL(req.url).searchParams.get('symbol') ?? '').trim().toUpperCase();
  if (!symbol) return json({ error: 'Missing "symbol" query parameter.' }, 400);

  const key = process.env.FINNHUB_API_KEY;
  if (!key) return json({ error: 'Server is missing FINNHUB_API_KEY.' }, 500);

  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/stock/financials-reported?symbol=${encodeURIComponent(symbol)}` +
        `&freq=annual&token=${encodeURIComponent(key)}`,
    );
    if (!res.ok) return json({ error: `Provider error (${res.status}).` }, 502);
    const data = (await res.json()) as { data?: ReportRow[] };
    const reports = (data.data ?? []).filter((r) => r.report);

    if (reports.length > 0) {
      // SEC filer — use the latest annual report by end date.
      reports.sort((a, b) => (b.endDate ?? '').localeCompare(a.endDate ?? ''));
      const latest = reports[0];
      const mapped = mapReportedFinancials(latest.report ?? {});
      const seed = { ...deriveBalanceSheetSeed(mapped.values as Record<string, number>), ...deriveReportedSeed(reports) };
      return json({
        symbol,
        source: 'sec',
        fiscalYear: Number((latest.endDate ?? '').slice(0, 4)) || latest.year || null,
        form: latest.form ?? null,
        endDate: latest.endDate ?? null,
        currency: 'USD',
        seed,
        ...mapped,
      });
    }

    // No SEC filing — try the international Yahoo Finance fallback.
    try {
      const y = await fetchYahooFinancials(symbol);
      const mapped = mapYahooTimeseries(y.values);
      if (mapped.found.length > 0) {
        const seed = { ...deriveBalanceSheetSeed(mapped.values as Record<string, number>), ...deriveYahooSeed(y.values, y.revenueHistory) };
        return json({
          symbol,
          source: 'yahoo',
          fiscalYear: y.endDate ? Number(y.endDate.slice(0, 4)) : null,
          form: 'Yahoo Finance',
          endDate: y.endDate,
          currency: y.currency,
          seed,
          ...mapped,
        });
      }
    } catch {
      // fall through to the manual-entry message
    }

    return json(
      {
        error:
          `Couldn't auto-fill "${symbol}" from an SEC filing or the international ` +
          `(Yahoo) fallback. Enter the base year manually — price and shares still ` +
          `fill via "Fetch quote".`,
      },
      404,
    );
  } catch {
    return json({ error: 'Failed to reach market-data provider.' }, 502);
  }
};
