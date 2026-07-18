import { describe, it, expect } from 'vitest';
import { computeHistoricalYear } from './historicals';

describe('computeHistoricalYear', () => {
  it('computes income-statement lines', () => {
    const h = computeHistoricalYear({
      fiscalYear: 2024, revenue: 1000, cogs: 400, rd: 100, sga: 150, da: 50, netIncome: 220,
    });
    expect(h.grossProfit).toBe(600);
    expect(h.ebit).toBe(300);
    expect(h.ebitda).toBe(350);
    expect(h.netIncome).toBe(220);
  });
  it('passes through balance-sheet totals and checks balance', () => {
    const h = computeHistoricalYear({
      fiscalYear: 2024, totalAssets: 1000, totalLiabilities: 600, totalEquity: 400, cash: 120,
    });
    expect(h.totalAssets).toBe(1000);
    expect(h.balanceCheck).toBe(0); // 1000 - (600 + 400)
    expect(h.cash).toBe(120);
  });
  it('derives net working capital from available components', () => {
    const h = computeHistoricalYear({
      fiscalYear: 2024, accountsReceivable: 150, inventories: 90, accountsPayable: 120,
    });
    expect(h.netWorkingCapital).toBe(120); // (150 + 90) - 120
  });
  it('passes through cash-flow totals', () => {
    const h = computeHistoricalYear({
      fiscalYear: 2024, cashFromOperations: 300, cashFromInvesting: -120, cashFromFinancing: -100, netChangeInCash: 80,
    });
    expect(h.cashFromOperations).toBe(300);
    expect(h.netChangeInCash).toBe(80);
  });
  it('returns nulls when data is absent', () => {
    const h = computeHistoricalYear({ fiscalYear: 2024 });
    expect(h.revenue).toBeNull();
    expect(h.totalAssets).toBeNull();
    expect(h.balanceCheck).toBeNull();
    expect(h.netWorkingCapital).toBeNull();
    expect(h.cashFromOperations).toBeNull();
  });
});
