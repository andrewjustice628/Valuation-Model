/**
 * Market-data proxy (Netlify Function, v2). Keeps the Finnhub API key
 * server-side — the browser only ever calls /api/quote?symbol=TICKER.
 *
 * The key is read from the FINNHUB_API_KEY environment variable:
 *   - locally: a .env file in the repo root (gitignored) + `netlify dev`
 *   - production: Netlify → Site settings → Environment variables
 * It is NEVER shipped in the client bundle.
 */
export const config = { path: '/api/quote' };

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

  const at = (path: string) =>
    `https://finnhub.io/api/v1/${path}&token=${encodeURIComponent(key)}`;

  try {
    const [quoteRes, profileRes, metricRes] = await Promise.all([
      fetch(at(`quote?symbol=${encodeURIComponent(symbol)}`)),
      fetch(at(`stock/profile2?symbol=${encodeURIComponent(symbol)}`)),
      fetch(at(`stock/metric?symbol=${encodeURIComponent(symbol)}&metric=all`)),
    ]);
    if (!quoteRes.ok || !profileRes.ok) {
      return json({ error: `Provider error (${quoteRes.status}/${profileRes.status}).` }, 502);
    }
    const quote = (await quoteRes.json()) as { c?: number; pc?: number };
    const profile = (await profileRes.json()) as {
      name?: string; ticker?: string; shareOutstanding?: number; currency?: string; finnhubIndustry?: string;
    };
    const metric = metricRes.ok ? ((await metricRes.json()) as { metric?: Record<string, unknown> }).metric : undefined;
    const beta = typeof metric?.beta === 'number' && Number.isFinite(metric.beta) ? metric.beta : null;

    // Finnhub reports shareOutstanding in millions.
    const sharesOutstanding =
      typeof profile.shareOutstanding === 'number' ? profile.shareOutstanding * 1e6 : null;

    if (!profile.name && !quote.c) {
      return json({ error: `No data for symbol "${symbol}".` }, 404);
    }

    return json({
      symbol,
      name: profile.name ?? symbol,
      price: quote.c ?? null,
      previousClose: quote.pc ?? null,
      sharesOutstanding,
      currency: profile.currency ?? null,
      industry: profile.finnhubIndustry ?? null,
      beta,
    });
  } catch {
    return json({ error: 'Failed to reach market-data provider.' }, 502);
  }
};
