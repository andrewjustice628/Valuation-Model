import { describe, it, expect } from 'vitest';
import { runDiagnostics } from './diagnostics';
import { runDcf } from './dcf';
import { buildStatements, type BaseYear, type ForecastAssumptions } from './statements';

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
const wacc = { costOfDebt: 0.05, taxRate: 0.21, riskFreeRate: 0.04, beta: 1.1, marketReturn: 0.1, weightEquity: 0.8, weightDebt: 0.2 };
const statements = buildStatements(base, [2026, 2027, 2028, 2029, 2030].map(mkA));
const mkDcf = (over: Partial<Parameters<typeof runDcf>[0]> = {}) =>
  runDcf({ years: statements.dcfYears, wacc, stub: 1, longTermGrowth: 0.025,
    bridge: { debt: 200, convertibleStock: 0, preferredStock: 0, minorityInterest: 0, cashAndEquivalents: 100, equityInvestments: 0 },
    sharesOutstanding: 1000, ...over });

describe('runDiagnostics', () => {
  it('clean model raises no errors', () => {
    const findings = runDiagnostics({ dcf: mkDcf(), statements, longTermGrowth: 0.025, sharePrice: 0 });
    expect(findings.filter((f) => f.level === 'error')).toHaveLength(0);
  });

  it('flags WACC ≤ terminal growth as an error', () => {
    const findings = runDiagnostics({ dcf: mkDcf(), statements, longTermGrowth: 0.10, sharePrice: 0 });
    expect(findings.some((f) => f.level === 'error' && /WACC/.test(f.title))).toBe(true);
  });

  it('warns on negative equity value (net debt swamps EV)', () => {
    const dcf = mkDcf({ bridge: { debt: 999999, convertibleStock: 0, preferredStock: 0, minorityInterest: 0, cashAndEquivalents: 0, equityInvestments: 0 } });
    const findings = runDiagnostics({ dcf, statements, longTermGrowth: 0.025, sharePrice: 0 });
    expect(findings.some((f) => f.level === 'warn' && /negative/i.test(f.title))).toBe(true);
  });

  it('warns on an unreasonably high terminal growth rate', () => {
    const findings = runDiagnostics({ dcf: mkDcf(), statements, longTermGrowth: 0.06, sharePrice: 0 });
    expect(findings.some((f) => /terminal growth/i.test(f.title))).toBe(true);
  });

  it('flags a large working-capital swing (the YUM-style NWC problem)', () => {
    // NWC jumps ~200 on ~1050 revenue in year 2 → >8% of revenue.
    const spikedYears = statements.dcfYears.map((y, i) => ({ ...y, netWorkingCapital: i === 1 ? y.netWorkingCapital + 200 : y.netWorkingCapital }));
    const dcf = runDcf({ years: spikedYears, wacc, stub: 1, longTermGrowth: 0.025,
      bridge: { debt: 200, convertibleStock: 0, preferredStock: 0, minorityInterest: 0, cashAndEquivalents: 100, equityInvestments: 0 }, sharesOutstanding: 1000 });
    const findings = runDiagnostics({ dcf, statements, longTermGrowth: 0.025, sharePrice: 0 });
    expect(findings.some((f) => /working-capital/i.test(f.title))).toBe(true);
  });

  it('reports upside/downside vs market as info', () => {
    const findings = runDiagnostics({ dcf: mkDcf(), statements, longTermGrowth: 0.025, sharePrice: 5 });
    expect(findings.some((f) => f.level === 'info' && /(Upside|Downside)/.test(f.title))).toBe(true);
  });
});
