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
  const equityValue = bookEquity * justifiedPb;
  const perShare = sharesOutstanding > 0 ? equityValue / sharesOutstanding : NaN;
  return { justifiedPb, equityValue, perShare };
}
