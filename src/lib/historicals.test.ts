import { describe, it, expect } from 'vitest';
import { computeHistoricalIS } from './historicals';

describe('computeHistoricalIS', () => {
  it('computes gross profit, EBIT, EBITDA, net income', () => {
    const h = computeHistoricalIS({
      fiscalYear: 2024, revenue: 1000, cogs: 400, rd: 100, sga: 150, da: 50, netIncome: 220,
    });
    expect(h.grossProfit).toBe(600); // 1000 - 400
    expect(h.ebit).toBe(300); // 600 - 100 - 150 - 50
    expect(h.ebitda).toBe(350); // 300 + 50
    expect(h.netIncome).toBe(220);
  });
  it('treats missing R&D/SG&A/D&A as zero', () => {
    const h = computeHistoricalIS({ fiscalYear: 2024, revenue: 1000, cogs: 400 });
    expect(h.grossProfit).toBe(600);
    expect(h.ebit).toBe(600);
    expect(h.ebitda).toBe(600);
  });
  it('returns nulls when revenue/COGS are absent', () => {
    const h = computeHistoricalIS({ fiscalYear: 2024, netIncome: 50 });
    expect(h.revenue).toBeNull();
    expect(h.grossProfit).toBeNull();
    expect(h.ebit).toBeNull();
    expect(h.netIncome).toBe(50);
  });
});
