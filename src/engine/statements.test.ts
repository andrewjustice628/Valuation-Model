import { describe, it, expect } from 'vitest';
import { buildStatements, type BaseYear, type ForecastAssumptions } from './statements';
import { runDcf } from './dcf';

const base: BaseYear = {
  fiscalYear: 2025, revenue: 1000, cogs: 600,
  cash: 100, accountsReceivable: 150, inventories: 80, otherCurrentAssets: 20,
  ppe: 500, otherNonCurrentAssets: 50,
  accountsPayable: 90, otherCurrentLiabilities: 40, deferredRevenue: 30,
  commercialPaper: 0, longTermDebt: 200, otherNonCurrentLiabilities: 60,
  retainedEarnings: 300, otherComprehensiveIncome: 10, commonStock: 170,
};

const ratios = {
  arPctRevenue: 0.15, invPctCogs: 0.12, otherCurrentAssetsPctRevenue: 0.02,
  apPctCogs: 0.15, otherCurrentLiabilitiesPctRevenue: 0.04, deferredRevenuePctRevenue: 0.03,
  otherNonCurrentAssetsPctRevenue: 0.05, otherNonCurrentLiabilitiesPctRevenue: 0.06,
};

const y1: ForecastAssumptions = {
  fiscalYear: 2026, revenueGrowth: 0.1, grossMargin: 0.4, rdPctSales: 0.05,
  sgaPctSales: 0.15, taxRate: 0.2, da: 50, interestIncome: 5, interestExpense: 10,
  otherExpenses: 15, stockBasedComp: 15, capex: 80, dividends: 20, shareRepurchases: 10,
  longTermDebtChange: 0, commercialPaperChange: 0, commonStockIssued: 0, ...ratios,
};
const y2: ForecastAssumptions = {
  ...y1, fiscalYear: 2027, revenueGrowth: 0.08, grossMargin: 0.41, da: 55,
  capex: 85, dividends: 22, shareRepurchases: 12,
};

describe('buildStatements — income statement', () => {
  const { years } = buildStatements(base, [y1, y2]);
  const is = years[0].incomeStatement;
  it('revenue grows at the growth rate', () => expect(is.revenue).toBeCloseTo(1100, 8));
  it('gross profit = revenue * margin', () => expect(is.grossProfit).toBeCloseTo(440, 8));
  it('EBIT = GP - R&D - SG&A - D&A', () => expect(is.ebit).toBeCloseTo(170, 8));
  it('EBITDA = EBIT + D&A', () => expect(is.ebitda).toBeCloseTo(220, 8));
  it('net income after interest/other/tax', () => expect(is.netIncome).toBeCloseTo(120, 8));
});

describe('buildStatements — balance sheet articulation', () => {
  const { years } = buildStatements(base, [y1, y2]);
  it('year 1 spot values', () => {
    const bs = years[0].balanceSheet;
    expect(bs.ppe).toBeCloseTo(530, 8);
    expect(bs.cash).toBeCloseTo(175.8, 8);
    expect(bs.netWorkingCapital).toBeCloseTo(90.2, 8);
    expect(bs.retainedEarnings).toBeCloseTo(390, 8);
  });
  it('balance check is 0 for every year', () => {
    for (const y of years) expect(y.balanceSheet.balanceCheck).toBeCloseTo(0, 6);
  });
});

describe('buildStatements — cash flow ties to change in cash', () => {
  const { years } = buildStatements(base, [y1, y2]);
  it('year 1 CFO and net change', () => {
    expect(years[0].cashFlow.cashFromOperations).toBeCloseTo(185.8, 8);
    expect(years[0].cashFlow.netChangeInCash).toBeCloseTo(75.8, 8);
  });
  it('net change in cash equals ΔCash each year', () => {
    let prevCash = base.cash;
    for (const y of years) {
      expect(y.cashFlow.netChangeInCash).toBeCloseTo(y.balanceSheet.cash - prevCash, 6);
      prevCash = y.balanceSheet.cash;
    }
  });
});

describe('buildStatements — feeds the DCF', () => {
  it('dcfYears run through runDcf and produce a finite per-share value', () => {
    const { dcfYears } = buildStatements(base, [y1, y2]);
    expect(dcfYears).toHaveLength(2);
    expect(dcfYears[0]).toMatchObject({ fiscalYear: 2026, revenue: 1100, ebit: 170, capex: 80 });
    const res = runDcf({
      years: dcfYears,
      wacc: { costOfDebt: 0.05, taxRate: 0.2, riskFreeRate: 0.04, beta: 1.1, marketReturn: 0.1, weightEquity: 0.8, weightDebt: 0.2 },
      stub: 1, longTermGrowth: 0.025,
      bridge: { debt: 200, convertibleStock: 0, preferredStock: 0, minorityInterest: 0, cashAndEquivalents: 175.8, equityInvestments: 0 },
      sharesOutstanding: 1000,
    });
    expect(Number.isFinite(res.equityValuePerShare)).toBe(true);
  });
});
