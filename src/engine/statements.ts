/**
 * Three-statement model: projects Income Statement, Balance Sheet and Cash
 * Flow Statement from a base (last actual) year plus per-year forecast
 * assumptions, and derives the UFCF inputs the DCF consumes.
 *
 * Design note — the model is *articulated by construction*: every non-cash
 * balance-sheet item is projected from a driver or a roll-forward, and cash is
 * the balancing item (Cash = Liabilities + Equity − non-cash assets). The cash
 * flow statement is then decomposed from those same deltas, so it always ties
 * to the change in cash and the balance check is always 0. This is the core
 * fix for the source sheet's fragility, where the user had to hand-balance.
 *
 * Pure module — no UI/store imports.
 */
import type { ForecastYear } from './types';

/** Last actual year — seeds ratios and roll-forwards. */
export interface BaseYear {
  fiscalYear: number;
  revenue: number;
  cogs: number;
  // Balance sheet (opening balances for the first forecast year)
  cash: number;
  accountsReceivable: number;
  inventories: number;
  otherCurrentAssets: number;
  ppe: number;
  otherNonCurrentAssets: number;
  accountsPayable: number;
  otherCurrentLiabilities: number;
  deferredRevenue: number;
  commercialPaper: number;
  longTermDebt: number;
  otherNonCurrentLiabilities: number;
  retainedEarnings: number;
  otherComprehensiveIncome: number;
  commonStock: number;
}

/** One forecast year's assumptions. Ratios are fractions (0.25 = 25%). */
export interface ForecastAssumptions {
  fiscalYear: number;
  // Income statement drivers
  revenueGrowth: number;
  grossMargin: number;
  rdPctSales: number;
  sgaPctSales: number;
  taxRate: number;
  da: number;
  interestIncome: number;
  interestExpense: number;
  otherExpenses: number;
  stockBasedComp: number;
  capex: number;
  // Financing
  dividends: number;
  shareRepurchases: number;
  longTermDebtChange: number;
  commercialPaperChange: number;
  commonStockIssued: number;
  // Balance-sheet driver ratios
  arPctRevenue: number;
  invPctCogs: number;
  otherCurrentAssetsPctRevenue: number;
  apPctCogs: number;
  otherCurrentLiabilitiesPctRevenue: number;
  deferredRevenuePctRevenue: number;
  otherNonCurrentAssetsPctRevenue: number;
  otherNonCurrentLiabilitiesPctRevenue: number;
}

export interface IncomeStatement {
  fiscalYear: number;
  revenue: number;
  cogs: number;
  grossProfit: number;
  rd: number;
  sga: number;
  da: number;
  ebit: number;
  ebitda: number;
  interestIncome: number;
  interestExpense: number;
  otherExpenses: number;
  pretaxProfit: number;
  taxes: number;
  netIncome: number;
}

export interface BalanceSheet {
  fiscalYear: number;
  cash: number;
  accountsReceivable: number;
  inventories: number;
  otherCurrentAssets: number;
  ppe: number;
  otherNonCurrentAssets: number;
  totalAssets: number;
  accountsPayable: number;
  otherCurrentLiabilities: number;
  deferredRevenue: number;
  commercialPaper: number;
  longTermDebt: number;
  otherNonCurrentLiabilities: number;
  totalLiabilities: number;
  retainedEarnings: number;
  otherComprehensiveIncome: number;
  commonStock: number;
  totalEquity: number;
  balanceCheck: number;
  netWorkingCapital: number;
}

export interface CashFlowStatement {
  fiscalYear: number;
  netIncome: number;
  da: number;
  stockBasedComp: number;
  changeInWorkingCapital: number;
  changeInOtherNonCurrent: number;
  cashFromOperations: number;
  capex: number;
  cashFromInvesting: number;
  debtChange: number;
  commonStockIssued: number;
  dividends: number;
  shareRepurchases: number;
  cashFromFinancing: number;
  netChangeInCash: number;
}

export interface YearStatements {
  incomeStatement: IncomeStatement;
  balanceSheet: BalanceSheet;
  cashFlow: CashFlowStatement;
}

export interface StatementsResult {
  years: YearStatements[];
  /** UFCF inputs for the DCF, one per forecast year. */
  dcfYears: ForecastYear[];
}

function balanceSheetOf(b: BaseYear): Pick<
  BalanceSheet,
  | 'accountsReceivable' | 'inventories' | 'otherCurrentAssets' | 'ppe'
  | 'otherNonCurrentAssets' | 'accountsPayable' | 'otherCurrentLiabilities'
  | 'deferredRevenue' | 'commercialPaper' | 'longTermDebt'
  | 'otherNonCurrentLiabilities' | 'retainedEarnings'
  | 'otherComprehensiveIncome' | 'commonStock' | 'cash'
> {
  return {
    cash: b.cash,
    accountsReceivable: b.accountsReceivable,
    inventories: b.inventories,
    otherCurrentAssets: b.otherCurrentAssets,
    ppe: b.ppe,
    otherNonCurrentAssets: b.otherNonCurrentAssets,
    accountsPayable: b.accountsPayable,
    otherCurrentLiabilities: b.otherCurrentLiabilities,
    deferredRevenue: b.deferredRevenue,
    commercialPaper: b.commercialPaper,
    longTermDebt: b.longTermDebt,
    otherNonCurrentLiabilities: b.otherNonCurrentLiabilities,
    retainedEarnings: b.retainedEarnings,
    otherComprehensiveIncome: b.otherComprehensiveIncome,
    commonStock: b.commonStock,
  };
}

export function buildStatements(
  base: BaseYear,
  assumptions: ForecastAssumptions[],
): StatementsResult {
  const years: YearStatements[] = [];
  const dcfYears: ForecastYear[] = [];

  // Prior-period state, seeded from the base year.
  let prevRevenue = base.revenue;
  let prev = balanceSheetOf(base);

  for (const a of assumptions) {
    // ---- Income statement ----
    const revenue = prevRevenue * (1 + a.revenueGrowth);
    const grossProfit = revenue * a.grossMargin;
    const cogs = revenue - grossProfit;
    const rd = revenue * a.rdPctSales;
    const sga = revenue * a.sgaPctSales;
    const ebit = grossProfit - rd - sga - a.da;
    const ebitda = ebit + a.da;
    const pretaxProfit = ebit + a.interestIncome - a.interestExpense - a.otherExpenses;
    const taxes = pretaxProfit * a.taxRate;
    const netIncome = pretaxProfit - taxes;

    const incomeStatement: IncomeStatement = {
      fiscalYear: a.fiscalYear, revenue, cogs, grossProfit, rd, sga, da: a.da,
      ebit, ebitda, interestIncome: a.interestIncome, interestExpense: a.interestExpense,
      otherExpenses: a.otherExpenses, pretaxProfit, taxes, netIncome,
    };

    // ---- Balance sheet (non-cash items from drivers / roll-forwards) ----
    const accountsReceivable = revenue * a.arPctRevenue;
    const inventories = cogs * a.invPctCogs;
    const otherCurrentAssets = revenue * a.otherCurrentAssetsPctRevenue;
    const ppe = prev.ppe + a.capex - a.da; // schedule: BoP + capex − depreciation
    const otherNonCurrentAssets = revenue * a.otherNonCurrentAssetsPctRevenue;

    const accountsPayable = cogs * a.apPctCogs;
    const otherCurrentLiabilities = revenue * a.otherCurrentLiabilitiesPctRevenue;
    const deferredRevenue = revenue * a.deferredRevenuePctRevenue;
    const commercialPaper = prev.commercialPaper + a.commercialPaperChange;
    const longTermDebt = prev.longTermDebt + a.longTermDebtChange;
    const otherNonCurrentLiabilities = revenue * a.otherNonCurrentLiabilitiesPctRevenue;

    const retainedEarnings =
      prev.retainedEarnings + netIncome - a.dividends - a.shareRepurchases;
    const otherComprehensiveIncome = prev.otherComprehensiveIncome;
    const commonStock = prev.commonStock + a.stockBasedComp + a.commonStockIssued;

    const nonCashAssets =
      accountsReceivable + inventories + otherCurrentAssets + ppe + otherNonCurrentAssets;
    const totalLiabilities =
      accountsPayable + otherCurrentLiabilities + deferredRevenue +
      commercialPaper + longTermDebt + otherNonCurrentLiabilities;
    const totalEquity = retainedEarnings + otherComprehensiveIncome + commonStock;

    // Cash is the balancing item → balance check is 0 by construction.
    const cash = totalLiabilities + totalEquity - nonCashAssets;
    const totalAssets = cash + nonCashAssets;

    const netWorkingCapital =
      (accountsReceivable + inventories + otherCurrentAssets) -
      (accountsPayable + otherCurrentLiabilities + deferredRevenue);

    const balanceSheet: BalanceSheet = {
      fiscalYear: a.fiscalYear, cash, accountsReceivable, inventories,
      otherCurrentAssets, ppe, otherNonCurrentAssets, totalAssets,
      accountsPayable, otherCurrentLiabilities, deferredRevenue, commercialPaper,
      longTermDebt, otherNonCurrentLiabilities, totalLiabilities,
      retainedEarnings, otherComprehensiveIncome, commonStock, totalEquity,
      balanceCheck: totalAssets - (totalLiabilities + totalEquity),
      netWorkingCapital,
    };

    // ---- Cash flow statement (decomposed from the same deltas) ----
    const dAR = accountsReceivable - prev.accountsReceivable;
    const dInv = inventories - prev.inventories;
    const dOtherCA = otherCurrentAssets - prev.otherCurrentAssets;
    const dAP = accountsPayable - prev.accountsPayable;
    const dOtherCL = otherCurrentLiabilities - prev.otherCurrentLiabilities;
    const dDefRev = deferredRevenue - prev.deferredRevenue;
    const dOtherNCA = otherNonCurrentAssets - prev.otherNonCurrentAssets;
    const dOtherNCL = otherNonCurrentLiabilities - prev.otherNonCurrentLiabilities;

    const changeInWorkingCapital =
      -dAR - dInv - dOtherCA + dAP + dOtherCL + dDefRev;
    const changeInOtherNonCurrent = -dOtherNCA + dOtherNCL;
    const cashFromOperations =
      netIncome + a.da + a.stockBasedComp + changeInWorkingCapital + changeInOtherNonCurrent;
    const cashFromInvesting = -a.capex;
    const debtChange = a.longTermDebtChange + a.commercialPaperChange;
    const cashFromFinancing =
      debtChange + a.commonStockIssued - a.dividends - a.shareRepurchases;
    const netChangeInCash = cashFromOperations + cashFromInvesting + cashFromFinancing;

    const cashFlow: CashFlowStatement = {
      fiscalYear: a.fiscalYear, netIncome, da: a.da, stockBasedComp: a.stockBasedComp,
      changeInWorkingCapital, changeInOtherNonCurrent, cashFromOperations,
      capex: a.capex, cashFromInvesting, debtChange, commonStockIssued: a.commonStockIssued,
      dividends: a.dividends, shareRepurchases: a.shareRepurchases, cashFromFinancing,
      netChangeInCash,
    };

    years.push({ incomeStatement, balanceSheet, cashFlow });
    dcfYears.push({
      fiscalYear: a.fiscalYear, revenue, ebit, da: a.da, taxRate: a.taxRate,
      netWorkingCapital, capex: a.capex,
    });

    prevRevenue = revenue;
    prev = {
      cash, accountsReceivable, inventories, otherCurrentAssets, ppe,
      otherNonCurrentAssets, accountsPayable, otherCurrentLiabilities,
      deferredRevenue, commercialPaper, longTermDebt, otherNonCurrentLiabilities,
      retainedEarnings, otherComprehensiveIncome, commonStock,
    };
  }

  return { years, dcfYears };
}
