/**
 * Client-side market-data access. Pluggable provider interface so the source
 * can be swapped without touching the UI. The default provider calls our own
 * Netlify Function (/api/quote), which holds the API key server-side.
 *
 * Every consumer must tolerate failure and fall back to manual entry — the
 * calculator never hard-breaks if the quote can't be fetched.
 */
export interface Quote {
  symbol: string;
  name: string;
  /** Current price (falls back to previousClose if unavailable). */
  price: number | null;
  previousClose: number | null;
  sharesOutstanding: number | null;
  currency: string | null;
}

export interface MarketDataProvider {
  id: string;
  label: string;
  fetchQuote(symbol: string): Promise<Quote>;
  /** A peer valuation multiple; null when the provider doesn't expose it. */
  fetchMultiple(symbol: string, multipleName: string): Promise<number | null>;
  /** Latest annual reported financials mapped to canonical base-year fields. */
  fetchFinancials(symbol: string): Promise<MappedFinancialsResponse>;
}

export interface MappedFinancialsResponse {
  symbol: string;
  source: 'sec' | 'yahoo' | null;
  fiscalYear: number | null;
  form: string | null;
  endDate: string | null;
  currency: string | null;
  values: Record<string, number>;
  found: string[];
  missing: string[];
}

/** Default provider: our Netlify Function proxy (key hidden server-side). */
export const netlifyQuoteProvider: MarketDataProvider = {
  id: 'netlify-finnhub',
  label: 'Finnhub (via Netlify function)',
  async fetchQuote(symbol: string): Promise<Quote> {
    const res = await fetch(`/api/quote?symbol=${encodeURIComponent(symbol)}`);
    const data = (await res.json().catch(() => ({}))) as Partial<Quote> & { error?: string };
    if (!res.ok) throw new Error(data.error ?? `Quote request failed (${res.status}).`);
    return {
      symbol: data.symbol ?? symbol,
      name: data.name ?? symbol,
      price: data.price ?? null,
      previousClose: data.previousClose ?? null,
      sharesOutstanding: data.sharesOutstanding ?? null,
      currency: data.currency ?? null,
    };
  },
  async fetchMultiple(symbol: string, multipleName: string): Promise<number | null> {
    const res = await fetch(
      `/api/metric?symbol=${encodeURIComponent(symbol)}&multiple=${encodeURIComponent(multipleName)}`,
    );
    const data = (await res.json().catch(() => ({}))) as { value?: number | null; error?: string };
    if (!res.ok) throw new Error(data.error ?? `Metric request failed (${res.status}).`);
    return typeof data.value === 'number' && Number.isFinite(data.value) ? data.value : null;
  },
  async fetchFinancials(symbol: string): Promise<MappedFinancialsResponse> {
    const res = await fetch(`/api/financials?symbol=${encodeURIComponent(symbol)}`);
    const data = (await res.json().catch(() => ({}))) as Partial<MappedFinancialsResponse> & { error?: string };
    if (!res.ok) throw new Error(data.error ?? `Financials request failed (${res.status}).`);
    return {
      symbol: data.symbol ?? symbol,
      source: data.source ?? null,
      fiscalYear: data.fiscalYear ?? null,
      form: data.form ?? null,
      endDate: data.endDate ?? null,
      currency: data.currency ?? null,
      values: data.values ?? {},
      found: data.found ?? [],
      missing: data.missing ?? [],
    };
  },
};

export const activeProvider: MarketDataProvider = netlifyQuoteProvider;
