/**
 * Bottom-up (industry) beta. Unlever each peer's equity beta by its capital
 * structure, average to an industry asset (unlevered) beta, then relever at the
 * target company's D/E. More robust than a single-stock regression beta because
 * it averages out idiosyncratic noise. Pure module.
 *
 *   unlevered = levered / (1 + (1 − tax) × D/E)
 *   relevered = assetBeta × (1 + (1 − tax) × targetD/E)
 */
export interface BetaPeerInput {
  leveredBeta: number;
  deRatio: number; // debt / equity, as a fraction (0.5 = 50%)
}

export interface BottomUpBetaResult {
  assetBeta: number; // average unlevered beta
  releveredBeta: number; // relevered at the target's D/E
  count: number; // peers actually used
}

export function bottomUpBeta(peers: BetaPeerInput[], targetDE: number, taxRate: number): BottomUpBetaResult {
  const valid = peers.filter(
    (p) => Number.isFinite(p.leveredBeta) && Number.isFinite(p.deRatio) && p.deRatio >= 0,
  );
  if (valid.length === 0) return { assetBeta: NaN, releveredBeta: NaN, count: 0 };

  const t = taxRate;
  const unlevered = valid.map((p) => p.leveredBeta / (1 + (1 - t) * p.deRatio));
  const assetBeta = unlevered.reduce((a, b) => a + b, 0) / unlevered.length;
  const releveredBeta = assetBeta * (1 + (1 - t) * Math.max(0, targetDE));
  return { assetBeta, releveredBeta, count: valid.length };
}
