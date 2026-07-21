/**
 * Reverse DCF — solve for the flat annual revenue growth rate that makes the
 * DCF equity value per share equal a target (the current market price). Answers
 * "what growth is the market pricing in?". Pure module; bisection over growth
 * (value is monotonically increasing in growth).
 */
import { buildStatements, type BaseYear, type ForecastAssumptions } from './statements';
import { runDcf } from './dcf';
import type { NetDebtBridge, WaccAssumptions } from './types';

export interface ReverseDcfInput {
  base: BaseYear;
  assumptions: ForecastAssumptions[];
  wacc: WaccAssumptions;
  stub: number;
  longTermGrowth: number;
  bridge: NetDebtBridge;
  sharesOutstanding: number;
  terminalBasis?: 'nominal' | 'faithful';
  targetPerShare: number;
}

/** Returns the implied uniform revenue growth, or null if outside a sane range. */
export function impliedRevenueGrowth(input: ReverseDcfInput): number | null {
  const valueAt = (g: number): number => {
    const assumptions = input.assumptions.map((a) => ({ ...a, revenueGrowth: g }));
    const { dcfYears } = buildStatements(input.base, assumptions);
    return runDcf({
      years: dcfYears, wacc: input.wacc, stub: input.stub, longTermGrowth: input.longTermGrowth,
      bridge: input.bridge, sharesOutstanding: input.sharesOutstanding, terminalBasis: input.terminalBasis,
    }).equityValuePerShare;
  };

  const target = input.targetPerShare;
  if (!Number.isFinite(target) || target <= 0) return null;

  let lo = -0.5;
  let hi = 1.0;
  const vLo = valueAt(lo);
  const vHi = valueAt(hi);
  if (!Number.isFinite(vLo) || !Number.isFinite(vHi)) return null;
  // Value rises with growth; if the price is outside the achievable range, no solution.
  if (target < vLo || target > vHi) return null;

  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const v = valueAt(mid);
    if (v < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
