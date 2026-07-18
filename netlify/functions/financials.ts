/**
 * Pulls a company's latest annual as-reported financials from Finnhub and maps
 * them to our canonical base-year fields (mapping is shared, pure, tested code
 * in src/lib/financials.ts). Key stays server-side. Values are raw dollars.
 */
import { mapReportedFinancials, type ReportedFinancials } from '../../src/lib/financials';
import { mapYahooFinancials, type YahooStatement } from '../../src/lib/yahooFinancials';

export const config = { path: '/api/financials' };

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36';

/** International fallback: Yahoo Finance quoteSummary (needs a cookie + crumb). */
async function fetchYahooFinancials(symbol: string) {
  // 1. Obtain a session cookie.
  const cookieRes = await fetch('https://fc.yahoo.com/', { headers: { 'User-Agent': UA } });
  const setCookies =
    typeof cookieRes.headers.getSetCookie === 'function'
      ? cookieRes.headers.getSetCookie()
      : [cookieRes.headers.get('set-cookie')].filter((c): c is string => !!c);
  const cookie = setCookies.map((c) => c.split(';')[0]).join('; ');
  if (!cookie) throw new Error('no cookie');

  // 2. Exchange it for a crumb.
  const crumbRes = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
    headers: { 'User-Agent': UA, cookie },
  });
  const crumb = (await crumbRes.text()).trim();
  if (!crumb || crumb.includes('<') || crumb.length > 32) throw new Error('no crumb');

  // 3. Pull the statements.
  const url =
    `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}` +
    `?modules=incomeStatementHistory,balanceSheetHistory,price&crumb=${encodeURIComponent(crumb)}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA, cookie } });
  if (!res.ok) throw new Error(`quoteSummary ${res.status}`);
  const data = (await res.json()) as {
    quoteSummary?: { result?: Array<Record<string, any>> };
  };
  const result = data.quoteSummary?.result?.[0];
  if (!result) throw new Error('no result');
  const income = (result.incomeStatementHistory?.incomeStatementHistory?.[0] ?? {}) as YahooStatement;
  const balance = (result.balanceSheetHistory?.balanceSheetStatements?.[0] ?? {}) as YahooStatement;
  const endDate: string | null =
    balance?.endDate?.fmt ?? income?.endDate?.fmt ?? null;
  const currency: string | null = result.price?.financialCurrency ?? result.price?.currency ?? null;
  return { income, balance, endDate, currency };
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
      return json({
        symbol,
        source: 'sec',
        fiscalYear: Number((latest.endDate ?? '').slice(0, 4)) || latest.year || null,
        form: latest.form ?? null,
        endDate: latest.endDate ?? null,
        currency: 'USD',
        ...mapped,
      });
    }

    // No SEC filing — try the international Yahoo Finance fallback.
    try {
      const y = await fetchYahooFinancials(symbol);
      const mapped = mapYahooFinancials(y.income, y.balance);
      if (mapped.found.length > 0) {
        return json({
          symbol,
          source: 'yahoo',
          fiscalYear: y.endDate ? Number(y.endDate.slice(0, 4)) : null,
          form: 'Yahoo Finance',
          endDate: y.endDate,
          currency: y.currency,
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
