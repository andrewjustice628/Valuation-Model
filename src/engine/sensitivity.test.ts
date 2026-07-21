import { describe, it, expect } from 'vitest';
import { sensitivityMatrix, centeredAxis } from './sensitivity';
import { runDcf } from './dcf';
import type { DcfInputs } from './types';

const input: DcfInputs = {
  years: [2026, 2027, 2028, 2029, 2030].map((fiscalYear, i) => ({
    fiscalYear, revenue: 1000 * 1.05 ** (i + 1), ebit: 200 * 1.05 ** (i + 1), da: 50,
    taxRate: 0.21, netWorkingCapital: 100, capex: 60,
  })),
  wacc: { costOfDebt: 0.05, taxRate: 0.21, riskFreeRate: 0.04, beta: 1.1, marketReturn: 0.1, weightEquity: 0.8, weightDebt: 0.2 },
  stub: 1, longTermGrowth: 0.025,
  bridge: { debt: 200, convertibleStock: 0, preferredStock: 0, minorityInterest: 0, cashAndEquivalents: 100, equityInvestments: 0 },
  sharesOutstanding: 1000,
};

describe('centeredAxis', () => {
  it('centers n odd values on the center', () => {
    expect(centeredAxis(0.09, 0.005, 5)).toEqual([0.08, 0.085, 0.09, 0.095, 0.1].map((x) => expect.closeTo(x, 10)));
  });
});

describe('sensitivityMatrix', () => {
  const m = sensitivityMatrix(input, { n: 5 });

  it('is 5×5 with base at the center', () => {
    expect(m.waccValues).toHaveLength(5);
    expect(m.colValues).toHaveLength(5);
    expect(m.colKind).toBe('growth');
    expect(m.baseRow).toBe(2);
    expect(m.baseCol).toBe(2);
  });

  it('center cell equals the base DCF per-share', () => {
    const base = runDcf(input).equityValuePerShare;
    expect(m.perShare[2][2]).toBeCloseTo(base, 6);
  });

  it('value falls as WACC rises (down a column)', () => {
    for (let col = 0; col < 5; col++) {
      for (let row = 1; row < 5; row++) {
        expect(m.perShare[row][col]).toBeLessThan(m.perShare[row - 1][col]);
      }
    }
  });

  it('value rises as terminal growth rises (across a row)', () => {
    for (let row = 0; row < 5; row++) {
      for (let col = 1; col < 5; col++) {
        expect(m.perShare[row][col]).toBeGreaterThan(m.perShare[row][col - 1]);
      }
    }
  });

  it('uses an exit-multiple column axis when that method is selected', () => {
    const em = sensitivityMatrix({ ...input, terminalMethod: 'exitMultiple', exitMultiple: 12 }, { n: 5 });
    expect(em.colKind).toBe('multiple');
    expect(em.colValues[2]).toBeCloseTo(12, 6);
    // Higher exit multiple → higher value across a row.
    for (let col = 1; col < 5; col++) expect(em.perShare[2][col]).toBeGreaterThan(em.perShare[2][col - 1]);
  });
});
