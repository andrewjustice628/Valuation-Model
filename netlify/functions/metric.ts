/**
 * Peer valuation-multiple proxy. Given a symbol and a multiple name, returns
 * that multiple from Finnhub's basic-financials metrics. Key stays server-side.
 * Returns { value: null } when the provider doesn't expose the multiple (free
 * tier gaps are common) — the client then leaves the field for manual entry.
 */
export const config = { path: '/api/metric' };

const CANDIDATE_KEYS: Record<string, string[]> = {
  'EV/EBITDA': ['evEbitdaTTM', 'evEbitdaAnnual', 'currentEv/ebitdaTTM'],
  'P/E': ['peTTM', 'peBasicExclExtraTTM', 'peAnnual'],
  'P/S': ['psTTM', 'psAnnual'],
  'P/B': ['pbQuarterly', 'pbAnnual', 'pb'],
  'EV/Sales': ['evSalesTTM', 'currentEv/salesTTM'],
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

export default async (req: Request): Promise<Response> => {
  const params = new URL(req.url).searchParams;
  const symbol = (params.get('symbol') ?? '').trim().toUpperCase();
  const multipleName = params.get('multiple') ?? 'EV/EBITDA';
  if (!symbol) return json({ error: 'Missing "symbol" query parameter.' }, 400);

  const key = process.env.FINNHUB_API_KEY;
  if (!key) return json({ error: 'Server is missing FINNHUB_API_KEY.' }, 500);

  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/stock/metric?symbol=${encodeURIComponent(symbol)}` +
        `&metric=all&token=${encodeURIComponent(key)}`,
    );
    if (!res.ok) return json({ error: `Provider error (${res.status}).` }, 502);
    const data = (await res.json()) as { metric?: Record<string, unknown> };
    const metric = data.metric ?? {};
    const keys = CANDIDATE_KEYS[multipleName] ?? [];
    let value: number | null = null;
    for (const k of keys) {
      const v = metric[k];
      if (typeof v === 'number' && Number.isFinite(v)) {
        value = v;
        break;
      }
    }
    return json({ symbol, multipleName, value });
  } catch {
    return json({ error: 'Failed to reach market-data provider.' }, 502);
  }
};
