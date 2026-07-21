import { describe, it, expect } from 'vitest';
import { runDdm } from './ddm';
import { runFcfe } from './fcfe';
import { runJustifiedPb } from './justifiedPb';

describe('runDdm', () => {
  it('single-year Gordon: PV(div) + PV(terminal)', () => {
    // 1 year, div=100, stub=1, coe=10%, g=2%. terminal = 100*1.02/0.08 = 1275.
    const r = runDdm({ dividends: [100], costOfEquity: 0.1, stub: 1, terminalGrowth: 0.02, sharesOutstanding: 100 });
    const pvDiv = 100 / 1.1;
    const pvTv = (100 * 1.02) / 0.08 / 1.1;
    expect(r.equityValue).toBeCloseTo(pvDiv + pvTv, 6);
    expect(r.perShare).toBeCloseTo((pvDiv + pvTv) / 100, 6);
  });
  it('NaN when cost of equity ≤ growth', () => {
    expect(runDdm({ dividends: [100], costOfEquity: 0.02, stub: 1, terminalGrowth: 0.05, sharesOutstanding: 100 }).perShare).toBeNaN();
  });
});

describe('runFcfe', () => {
  it('FCFE = NI + D&A − capex − ΔNWC + net borrowing', () => {
    const r = runFcfe({
      years: [{ netIncome: 200, da: 50, capex: 60, changeInNwc: 10, netBorrowing: 20 }],
      costOfEquity: 0.1, stub: 1, terminalGrowth: 0.02, sharesOutstanding: 100,
    });
    const fcfe0 = 200 + 50 - 60 - 10 + 20; // 200
    expect(r.fcfe[0]).toBe(fcfe0);
    const pv = fcfe0 / 1.1 + ((fcfe0 * 1.02) / 0.08) / 1.1;
    expect(r.equityValue).toBeCloseTo(pv, 6);
  });
});

describe('runJustifiedPb', () => {
  it('justified P/B = (ROE − g)/(r − g); value = book × P/B', () => {
    const r = runJustifiedPb({ bookEquity: 1000, roe: 0.15, costOfEquity: 0.10, growth: 0.03, sharesOutstanding: 100 });
    expect(r.justifiedPb).toBeCloseTo((0.15 - 0.03) / (0.10 - 0.03), 8); // 1.714
    expect(r.equityValue).toBeCloseTo(1000 * r.justifiedPb, 6);
    expect(r.perShare).toBeCloseTo((1000 * r.justifiedPb) / 100, 6);
  });
  it('P/B > 1 when ROE > cost of equity, < 1 when below', () => {
    expect(runJustifiedPb({ bookEquity: 1000, roe: 0.14, costOfEquity: 0.1, growth: 0.02, sharesOutstanding: 100 }).justifiedPb).toBeGreaterThan(1);
    expect(runJustifiedPb({ bookEquity: 1000, roe: 0.07, costOfEquity: 0.1, growth: 0.02, sharesOutstanding: 100 }).justifiedPb).toBeLessThan(1);
  });
});
