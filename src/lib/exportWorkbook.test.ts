import { describe, it, expect } from 'vitest';
import { buildSheets } from './exportWorkbook';
import { buildStatements, type BaseYear, type ForecastAssumptions } from '../engine/statements';
import { runDcf } from '../engine/dcf';
import { runComps } from '../engine/comps';

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
const statements = buildStatements(base, assumptions);
const dcf = runDcf({ years: statements.dcfYears, wacc: { costOfDebt: 0.05, taxRate: 0.21, riskFreeRate: 0.04, beta: 1.1, marketReturn: 0.1, weightEquity: 0.8, weightDebt: 0.2 }, stub: 1, longTermGrowth: 0.025, bridge: { debt: 200, convertibleStock: 0, preferredStock: 0, minorityInterest: 0, cashAndEquivalents: 100, equityInvestments: 0 }, sharesOutstanding: 1000 });
const compsResult = runComps({ multipleName: 'EV/EBITDA', companyMetric: 300, peerMultiples: [10, 14], netDebt: dcf.netDebt, sharesOutstanding: 1000 });
const company = { name: 'Test Co', ticker: 'TST', unit: 'Millions', sharePrice: 12, sharesOutstanding: 1000 };

describe('buildSheets', () => {
  const sheets = buildSheets({ company, assumptions, statements, historicals: [], dcf, compsResult });

  it('produces the expected sheets', () => {
    expect(sheets.map((s) => s.name)).toEqual(['Summary', 'Assumptions', 'Income Statement', 'Balance Sheet', 'Cash Flow', 'DCF']);
  });
  it('summary carries the company name and per-share value', () => {
    const flat = sheets[0].rows.flat();
    expect(flat).toContain('Test Co');
    expect(sheets[0].rows.find((r) => r[0] === 'DCF value / share')?.[1]).toBeCloseTo(dcf.equityValuePerShare, 6);
  });
  it('income statement row spans header + 5 forecast columns (no historicals here)', () => {
    const rev = sheets[2].rows.find((r) => r[0] === 'Revenue')!;
    expect(rev).toHaveLength(6); // label + 5 forecast years
    expect(rev[1]).toBeCloseTo(statements.years[0].incomeStatement.revenue, 6);
  });
  it('DCF sheet includes value per share', () => {
    expect(sheets[5].rows.find((r) => r[0] === 'Value / share')?.[1]).toBeCloseTo(dcf.equityValuePerShare, 6);
  });
});
