/**
 * ROE-driven justified price-to-book — the standard shortcut for valuing banks
 * and insurers, where EBITDA/FCF don't apply. From the residual-income model:
 *   justified P/B = (ROE − g) / (cost of equity − g)
 *   equity value  = book equity × justified P/B
 */
export interface JustifiedPbInput {
  bookEquity: number;
  roe: number;
  costOfEquity: number;
  growth: number;
  sharesOutstanding: number;
}

export interface JustifiedPbResult {
  justifiedPb: number;
  equityValue: number;
  perShare: number;
}

export function runJustifiedPb(i: JustifiedPbInput): JustifiedPbResult {
  const { bookEquity, roe, costOfEquity: r, growth: g, sharesOutstanding } = i;
  const justifiedPb = r > g ? (roe - g) / (r - g) : NaN;
  // The model is only meaningful with a positive P/B (ROE > growth) and
  // positive book equity; otherwise the per-share figure isn't interpretable.
  const applicable = Number.isFinite(justifiedPb) && justifiedPb > 0 && bookEquity > 0 && sharesOutstanding > 0;
  const equityValue = applicable ? bookEquity * justifiedPb : NaN;
  const perShare = applicable ? equityValue / sharesOutstanding : NaN;
  return { justifiedPb, equityValue, perShare };
}
