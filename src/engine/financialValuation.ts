/**
 * Two-stage financial valuation for banks/insurers. Book value (and therefore
 * earnings and dividends) compound at the sustainable growth rate g = ROE ×
 * (1 − payout) for a finite high-growth stage, then fade to a terminal growth
 * rate. This removes the single-stage constraint that g < cost of equity — only
 * the terminal rate must be below it. Pure module.
 *
 * Also returns a steady-state justified P/B (using terminal growth), a more
 * conservative always-valid cross-check.
 */
export interface FinancialValuationInput {
  bookValuePerShare: number;
  roe: number;
  payoutRatio: number;
  highGrowthYears: number;
  terminalGrowth: number;
  costOfEquity: number;
}

export interface FinancialValuationResult {
  ddmPerShare: number; // two-stage dividend discount value
  pbPerShare: number; // steady-state justified P/B value
  justifiedPb: number; // steady-state justified P/B multiple
  gHigh: number; // sustainable high-stage growth
  valid: boolean; // cost of equity must exceed terminal growth
}

export function runFinancialValuation(i: FinancialValuationInput): FinancialValuationResult {
  const { bookValuePerShare: bv, roe, payoutRatio: p, terminalGrowth: gt, costOfEquity: r } = i;
  const n = Math.max(0, Math.round(i.highGrowthYears));
  const gHigh = roe * (1 - p);
  const valid = r > gt;

  let ddmPerShare = NaN;
  if (valid && bv > 0) {
    let pv = 0;
    let dps = roe * bv * p; // DPS in year 1 = EPS1 × payout, EPS1 = ROE × BV0
    let lastDps = dps;
    for (let t = 1; t <= n; t++) {
      pv += dps / Math.pow(1 + r, t);
      lastDps = dps;
      dps *= 1 + gHigh; // book/EPS/dividends compound at the sustainable rate
    }
    const terminalValue = (lastDps * (1 + gt)) / (r - gt);
    pv += terminalValue / Math.pow(1 + r, n);
    ddmPerShare = pv;
  }

  const justifiedPb = valid ? (roe - gt) / (r - gt) : NaN;
  const pbPerShare = justifiedPb > 0 && bv > 0 ? bv * justifiedPb : NaN;

  return { ddmPerShare, pbPerShare, justifiedPb, gHigh, valid };
}
