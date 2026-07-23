/**
 * Returns a peer's levered (equity) beta and debt/equity ratio for bottom-up
 * beta. From Finnhub basic financials; key stays server-side. D/E is best-effort
 * (field coverage varies) — null when unavailable, for manual entry.
 */
export const config = { path: '/api/beta' };

const DE_KEYS = [
  'totalDebt/totalEquityQuarterly', 'totalDebt/totalEquityAnnual',
  'longTermDebt/equityQuarterly', 'longTermDebt/equityAnnual',
];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export default async (req: Request): Promise<Response> => {
  const symbol = (new URL(req.url).searchParams.get('symbol') ?? '').trim().toUpperCase();
  if (!symbol) return json({ error: 'Missing "symbol" query parameter.' }, 400);
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return json({ error: 'Server is missing FINNHUB_API_KEY.' }, 500);

  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/stock/metric?symbol=${encodeURIComponent(symbol)}&metric=all&token=${encodeURIComponent(key)}`,
    );
    if (!res.ok) return json({ error: `Provider error (${res.status}).` }, 502);
    const metric = ((await res.json()) as { metric?: Record<string, unknown> }).metric ?? {};
    const beta = typeof metric.beta === 'number' && Number.isFinite(metric.beta) ? metric.beta : null;
    let deRatio: number | null = null;
    for (const k of DE_KEYS) {
      const v = metric[k];
      if (typeof v === 'number' && Number.isFinite(v)) {
        // Finnhub reports these as percentages (e.g. 150 = 1.5×); normalize to a ratio.
        deRatio = v > 5 ? v / 100 : v;
        break;
      }
    }
    return json({ symbol, beta, deRatio });
  } catch {
    return json({ error: 'Failed to reach market-data provider.' }, 502);
  }
};
