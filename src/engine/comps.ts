/**
 * Comparable-companies (multiples) valuation. Mirrors the Additional Valuation
 * sheet: apply the average peer multiple to a company metric → EV → equity.
 */
import { average } from './finance';
import type { CompsInputs, CompsResult } from './types';

export function runComps(input: CompsInputs): CompsResult {
  const peers = input.peerMultiples.filter((m) => Number.isFinite(m));
  const averageMultiple = peers.length === 0 ? NaN : average(peers);
  const enterpriseValue = input.companyMetric * averageMultiple;
  const equityValue = enterpriseValue - input.netDebt;
  const equityValuePerShare =
    input.sharesOutstanding === 0 ? NaN : equityValue / input.sharesOutstanding;
  return { averageMultiple, enterpriseValue, equityValue, equityValuePerShare };
}
