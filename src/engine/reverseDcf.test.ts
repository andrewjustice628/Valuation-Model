import { describe, it, expect } from 'vitest';
import { impliedRevenueGrowth } from './reverseDcf';
import { buildStatements, type BaseYear, type ForecastAssumptions } from './statements';
import { runDcf } from './dcf';

const base: BaseYear = {
  fiscalYear: 2025, revenue: 1000, cogs: 600,
  rd: 0, sga: 150, da: 50, interestIncome: 0, interestExpense: 10, otherExpenses: 0, taxes: 40,
  cash: 100, accountsReceivable: 100, inventories: 60, otherCurrentAssets: 20, ppe: 500, otherNonCurrentAssets: 50,
  accountsPayable: 60, otherCurrentLiabilities: 40, deferredRevenue: 30, commercialPaper: 0, longTermDebt: 200,
  otherNonCurrentLiabilities: 60, retainedEarnings: 300, otherComprehensiveIncome: 10, commonStock: 170,
};
const mkA = (fiscalYear: number): ForecastAssumptions => ({
  fiscalYear, revenueGrowth: 0.05, grossMargin: 0.4, rdPctSales: 0, sgaPctSales: 0.15, taxRate: 0.21,
  da: 50, interestIncome: 0, interestExpense: 10, otherExpenses: 0, stockBasedComp: 0, capex: 60,
  dividends: 0, shareRepurchases: 0, longTermDebtChange: 0, commercialPaperChange: 0, commonStockIssued: 0,
  arPctRevenue: 0.1, invPctCogs: 0.1, otherCurrentAssetsPctRevenue: 0.02, apPctCogs: 0.1,
  otherCurrentLiabilitiesPctRevenue: 0.04, deferredRevenuePctRevenue: 0.03,
  otherNonCurrentAssetsPctRevenue: 0.05, otherNonCurrentLiabilitiesPctRevenue: 0.06,
});
const assumptions = [2026, 2027, 2028, 2029, 2030].map(mkA);
const wacc = { costOfDebt: 0.05, taxRate: 0.21, riskFreeRate: 0.04, beta: 1.1, marketReturn: 0.1, weightEquity: 0.8, weightDebt: 0.2 };
const common = { base, assumptions, wacc, stub: 1, longTermGrowth: 0.025,
  bridge: { debt: 200, convertibleStock: 0, preferredStock: 0, minorityInterest: 0, cashAndEquivalents: 100, equityInvestments: 0 },
  sharesOutstanding: 1000 };

// Forward value at a known growth, to reverse-solve back to it.
const valueAtGrowth = (g: number) => {
  const { dcfYears } = buildStatements(base, assumptions.map((a) => ({ ...a, revenueGrowth: g })));
  return runDcf({ years: dcfYears, ...common }).equityValuePerShare;
};

describe('impliedRevenueGrowth', () => {
  it('recovers the growth that produces a given price', () => {
    const target = valueAtGrowth(0.08);
    const g = impliedRevenueGrowth({ ...common, targetPerShare: target });
    expect(g).not.toBeNull();
    expect(g!).toBeCloseTo(0.08, 4);
  });

  it('a higher price implies higher growth', () => {
    const g1 = impliedRevenueGrowth({ ...common, targetPerShare: valueAtGrowth(0.03) })!;
    const g2 = impliedRevenueGrowth({ ...common, targetPerShare: valueAtGrowth(0.12) })!;
    expect(g2).toBeGreaterThan(g1);
  });

  it('returns null when the price is unreachable in range', () => {
    expect(impliedRevenueGrowth({ ...common, targetPerShare: 1e9 })).toBeNull();
    expect(impliedRevenueGrowth({ ...common, targetPerShare: 0 })).toBeNull();
  });
});
