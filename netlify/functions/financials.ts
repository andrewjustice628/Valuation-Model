/**
 * Pulls a company's latest annual as-reported financials from Finnhub and maps
 * them to our canonical base-year fields (mapping is shared, pure, tested code
 * in src/lib/financials.ts). Key stays server-side. Values are raw dollars.
 */
import { mapReportedFinancials, type ReportedFinancials } from '../../src/lib/financials';

export const config = { path: '/api/financials' };

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
    if (reports.length === 0) return json({ error: `No filings found for "${symbol}".` }, 404);

    // Latest annual report by end date.
    reports.sort((a, b) => (b.endDate ?? '').localeCompare(a.endDate ?? ''));
    const latest = reports[0];
    const mapped = mapReportedFinancials(latest.report ?? {});
    const fiscalYear = Number((latest.endDate ?? '').slice(0, 4)) || latest.year || null;

    return json({
      symbol,
      fiscalYear,
      form: latest.form ?? null,
      endDate: latest.endDate ?? null,
      ...mapped,
    });
  } catch {
    return json({ error: 'Failed to reach market-data provider.' }, 502);
  }
};
