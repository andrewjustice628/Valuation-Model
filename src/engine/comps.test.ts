import { describe, it, expect } from 'vitest';
import { runComps } from './comps';

describe('runComps (EV/EBITDA multiples)', () => {
  const res = runComps({
    multipleName: 'EV/EBITDA',
    companyMetric: 275,
    peerMultiples: [10, 12, 14, 16, 18],
    netDebt: 150,
    sharesOutstanding: 1000,
  });

  it('average multiple', () => expect(res.averageMultiple).toBe(14));
  it('enterprise value = metric * average', () => expect(res.enterpriseValue).toBe(3850));
  it('equity value = EV - net debt', () => expect(res.equityValue).toBe(3700));
  it('per share', () => expect(res.equityValuePerShare).toBe(3.7));

  it('ignores blank/non-finite peer multiples', () => {
    const r = runComps({
      multipleName: 'EV/EBITDA',
      companyMetric: 100,
      peerMultiples: [10, NaN, 20],
      netDebt: 0,
      sharesOutstanding: 100,
    });
    expect(r.averageMultiple).toBe(15);
  });
});
