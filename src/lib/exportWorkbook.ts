/**
 * Builds the sheet data (arrays of rows) for an Excel export of the full model.
 * Pure module — the actual xlsx writing (SheetJS) is lazy-loaded in the UI.
 */
import type { StatementsResult, YearStatements, ForecastAssumptions } from '../engine/statements';
import type { DcfResult, CompsResult } from '../engine/types';
import type { HistoricalYear } from './historicals';

export interface CompanyInfoLike {
  name: string;
  ticker: string;
  unit: string;
  sharePrice: number;
  sharesOutstanding: number;
}

export interface ExportInput {
  company: CompanyInfoLike;
  assumptions: ForecastAssumptions[];
  statements: StatementsResult;
  historicals: HistoricalYear[];
  dcf: DcfResult;
  compsResult: CompsResult;
  methods?: { label: string; perShare: number }[];
}

export interface Sheet {
  name: string;
  rows: (string | number)[][];
}

type Cell = string | number;
const num = (v: number | null | undefined): Cell => (typeof v === 'number' && Number.isFinite(v) ? v : '');

export function buildSheets({ company, assumptions, statements, historicals, dcf, compsResult, methods }: ExportInput): Sheet[] {
  const histY = historicals.map((h) => `${h.fiscalYear}A`);
  const foreY = statements.years.map((y) => `${y.incomeStatement.fiscalYear}E`);

  const summary: Sheet = {
    name: 'Summary',
    rows: [
      ['Valuation Summary'],
      ['Company', company.name],
      ['Ticker', company.ticker],
      ['Unit', company.unit],
      ['Share price', num(company.sharePrice)],
      ['Shares outstanding', num(company.sharesOutstanding)],
      [],
      ['Value / share by method'],
      ...(methods && methods.length
        ? methods.map((m) => [m.label, num(m.perShare)])
        : [['DCF value / share', num(dcf.equityValuePerShare)], ['Comps value / share', num(compsResult.equityValuePerShare)]]),
      [],
      ['WACC', num(dcf.wacc.wacc)],
      ['PV of forecast', num(dcf.pvOfForecast)],
      ['Terminal value', num(dcf.terminalValue)],
      ['PV of terminal value', num(dcf.pvOfTerminalValue)],
      ['Implied exit multiple', num(dcf.impliedExitMultiple)],
      ['Implied perpetuity growth', num(dcf.impliedPerpetuityGrowth)],
      ['Enterprise value', num(dcf.enterpriseValue)],
      ['Net debt', num(dcf.netDebt)],
      ['Equity value', num(dcf.equityValue)],
    ],
  };

  const assumptionRows: [string, keyof ForecastAssumptions][] = [
    ['Revenue growth', 'revenueGrowth'], ['Gross margin', 'grossMargin'], ['R&D % of sales', 'rdPctSales'],
    ['SG&A % of sales', 'sgaPctSales'], ['Tax rate', 'taxRate'], ['D&A', 'da'], ['Capex', 'capex'],
    ['Stock-based comp', 'stockBasedComp'], ['Dividends', 'dividends'], ['Buybacks', 'shareRepurchases'],
    ['Interest income', 'interestIncome'], ['Interest expense', 'interestExpense'],
    ['A/R % of revenue', 'arPctRevenue'], ['Inventory % of COGS', 'invPctCogs'], ['A/P % of COGS', 'apPctCogs'],
  ];
  const assumptionsSheet: Sheet = {
    name: 'Assumptions',
    rows: [
      ['Assumptions', ...foreY],
      ...assumptionRows.map(([label, key]) => [label, ...assumptions.map((a) => num(a[key] as number))]),
    ],
  };

  const stmtSheet = (
    name: string,
    rows: { label: string; h: (h: HistoricalYear) => number | null; f: (y: YearStatements) => number }[],
  ): Sheet => ({
    name,
    rows: [
      [name, ...histY, ...foreY],
      ...rows.map((r) => [r.label, ...historicals.map((h) => num(r.h(h))), ...statements.years.map((y) => num(r.f(y)))]),
    ],
  });

  const incomeStatement = stmtSheet('Income Statement', [
    { label: 'Revenue', h: (h) => h.revenue, f: (y) => y.incomeStatement.revenue },
    { label: 'Gross Profit', h: (h) => h.grossProfit, f: (y) => y.incomeStatement.grossProfit },
    { label: 'EBIT', h: (h) => h.ebit, f: (y) => y.incomeStatement.ebit },
    { label: 'EBITDA', h: (h) => h.ebitda, f: (y) => y.incomeStatement.ebitda },
    { label: 'Net Income', h: (h) => h.netIncome, f: (y) => y.incomeStatement.netIncome },
  ]);
  const balanceSheet = stmtSheet('Balance Sheet', [
    { label: 'Total Assets', h: (h) => h.totalAssets, f: (y) => y.balanceSheet.totalAssets },
    { label: 'Total Liabilities', h: (h) => h.totalLiabilities, f: (y) => y.balanceSheet.totalLiabilities },
    { label: 'Total Equity', h: (h) => h.totalEquity, f: (y) => y.balanceSheet.totalEquity },
    { label: 'Cash', h: (h) => h.cash, f: (y) => y.balanceSheet.cash },
    { label: 'Net Working Capital', h: (h) => h.netWorkingCapital, f: (y) => y.balanceSheet.netWorkingCapital },
    { label: 'Balance Check', h: (h) => h.balanceCheck, f: (y) => y.balanceSheet.balanceCheck },
  ]);
  const cashFlow = stmtSheet('Cash Flow', [
    { label: 'Cash from Ops', h: (h) => h.cashFromOperations, f: (y) => y.cashFlow.cashFromOperations },
    { label: 'Cash from Investing', h: (h) => h.cashFromInvesting, f: (y) => y.cashFlow.cashFromInvesting },
    { label: 'Cash from Financing', h: (h) => h.cashFromFinancing, f: (y) => y.cashFlow.cashFromFinancing },
    { label: 'Net Change in Cash', h: (h) => h.netChangeInCash, f: (y) => y.cashFlow.netChangeInCash },
  ]);

  const dcfSheet: Sheet = {
    name: 'DCF',
    rows: [
      ['DCF', ...dcf.years.map((y) => y.fiscalYear)],
      ['Revenue', ...dcf.years.map((y) => num(y.revenue))],
      ['EBIT', ...dcf.years.map((y) => num(y.ebit))],
      ['D&A', ...dcf.years.map((y) => num(y.da))],
      ['Unlevered FCF', ...dcf.years.map((y) => num(y.ufcf))],
      ['PV of UFCF', ...dcf.years.map((y) => num(y.presentValue))],
      [],
      ['WACC', num(dcf.wacc.wacc)],
      ['PV of forecast', num(dcf.pvOfForecast)],
      ['Terminal value', num(dcf.terminalValue)],
      ['PV of terminal value', num(dcf.pvOfTerminalValue)],
      ['Enterprise value', num(dcf.enterpriseValue)],
      ['Net debt', num(dcf.netDebt)],
      ['Equity value', num(dcf.equityValue)],
      ['Value / share', num(dcf.equityValuePerShare)],
    ],
  };

  return [summary, assumptionsSheet, incomeStatement, balanceSheet, cashFlow, dcfSheet];
}
