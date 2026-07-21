import { describe, it, expect } from 'vitest';
import { runFinancialValuation } from './financialValuation';

const baseInput = {
  bookValuePerShare: 100,
  roe: 0.12,
  payoutRatio: 0.5,
  highGrowthYears: 10,
  terminalGrowth: 0.025,
  costOfEquity: 0.10,
};

describe('runFinancialValuation (two-stage)', () => {
  it('sustainable growth = ROE × (1 − payout)', () => {
    expect(runFinancialValuation(baseInput).gHigh).toBeCloseTo(0.06, 10);
  });

  it('handles high ROE / low payout where g > cost of equity (single-stage would break)', () => {
    // ROE 18%, payout 20% → g = 14.4% > coe 10% — two-stage still returns a finite value.
    const r = runFinancialValuation({ ...baseInput, roe: 0.18, payoutRatio: 0.2 });
    expect(r.gHigh).toBeCloseTo(0.144, 10);
    expect(Number.isFinite(r.ddmPerShare)).toBe(true);
    expect(r.ddmPerShare).toBeGreaterThan(0);
    expect(r.valid).toBe(true);
  });

  it('steady-state justified P/B = (ROE − terminal g)/(coe − terminal g)', () => {
    const r = runFinancialValuation(baseInput);
    expect(r.justifiedPb).toBeCloseTo((0.12 - 0.025) / (0.10 - 0.025), 8);
    expect(r.pbPerShare).toBeCloseTo(100 * r.justifiedPb, 6);
  });

  it('higher ROE increases the DDM value', () => {
    const lo = runFinancialValuation({ ...baseInput, roe: 0.10 }).ddmPerShare;
    const hi = runFinancialValuation({ ...baseInput, roe: 0.16 }).ddmPerShare;
    expect(hi).toBeGreaterThan(lo);
  });

  it('invalid when cost of equity ≤ terminal growth', () => {
    const r = runFinancialValuation({ ...baseInput, costOfEquity: 0.02, terminalGrowth: 0.05 });
    expect(r.valid).toBe(false);
    expect(r.ddmPerShare).toBeNaN();
  });
});
