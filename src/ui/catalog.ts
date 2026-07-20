/**
 * Field catalog. Each canonical field carries a default label and `aka` synonyms
 * — the guidance behind the label-mapping layer: whatever a company's report
 * calls a line item, the help text helps the user map it here, and they can
 * rename the field to match their own wording.
 */
import type { BaseYear, ForecastAssumptions } from '../engine/statements';
import type { NetDebtBridge, WaccAssumptions } from '../engine/types';

export interface FieldDef<K extends string = string> {
  id: K;
  label: string;
  aka?: string;
  percent?: boolean;
}

export const BASE_FIELDS: FieldDef<keyof BaseYear>[] = [
  { id: 'revenue', label: 'Revenue', aka: 'Net sales, Total revenue' },
  { id: 'cogs', label: 'COGS', aka: 'Cost of sales, Cost of revenue' },
  { id: 'rd', label: 'R&D Expense', aka: 'Research & development' },
  { id: 'sga', label: 'SG&A Expense', aka: 'Selling, general & admin' },
  { id: 'da', label: 'Depreciation & Amortization' },
  { id: 'interestIncome', label: 'Interest Income' },
  { id: 'interestExpense', label: 'Interest Expense' },
  { id: 'otherExpenses', label: 'Other Expenses' },
  { id: 'taxes', label: 'Income Taxes', aka: 'Income tax expense' },
  { id: 'cash', label: 'Cash & Equivalents', aka: 'Incl. marketable securities' },
  { id: 'accountsReceivable', label: 'Accounts Receivable', aka: 'Trade receivables' },
  { id: 'inventories', label: 'Inventories', aka: 'Inventory' },
  { id: 'otherCurrentAssets', label: 'Other Current Assets' },
  { id: 'ppe', label: 'PP&E (net)', aka: 'Property, plant & equipment' },
  { id: 'otherNonCurrentAssets', label: 'Other Non-Current Assets', aka: 'Goodwill, intangibles' },
  { id: 'accountsPayable', label: 'Accounts Payable', aka: 'Trade payables' },
  { id: 'otherCurrentLiabilities', label: 'Other Current Liabilities' },
  { id: 'deferredRevenue', label: 'Deferred Revenue', aka: 'Current + non-current' },
  { id: 'commercialPaper', label: 'Commercial Paper' },
  { id: 'longTermDebt', label: 'Long-Term Debt', aka: 'Incl. current portion' },
  { id: 'otherNonCurrentLiabilities', label: 'Other Non-Current Liabilities' },
  { id: 'retainedEarnings', label: 'Retained Earnings' },
  { id: 'otherComprehensiveIncome', label: 'Other Comprehensive Income', aka: 'AOCI' },
  { id: 'commonStock', label: 'Common Stock / APIC' },
];

interface AssumptionGroup {
  title: string;
  fields: FieldDef<keyof ForecastAssumptions>[];
}

export const ASSUMPTION_GROUPS: AssumptionGroup[] = [
  {
    title: 'Income statement drivers',
    fields: [
      { id: 'revenueGrowth', label: 'Revenue Growth', percent: true },
      { id: 'grossMargin', label: 'Gross Profit Margin', percent: true },
      { id: 'rdPctSales', label: 'R&D (% of sales)', percent: true },
      { id: 'sgaPctSales', label: 'SG&A (% of sales)', percent: true },
      { id: 'taxRate', label: 'Tax Rate', percent: true },
      { id: 'da', label: 'Depreciation & Amortization' },
      { id: 'interestIncome', label: 'Interest Income' },
      { id: 'interestExpense', label: 'Interest Expense' },
      { id: 'otherExpenses', label: 'Other Expenses' },
    ],
  },
  {
    title: 'Cash flow & financing',
    fields: [
      { id: 'stockBasedComp', label: 'Stock-Based Compensation' },
      { id: 'capex', label: 'Capital Expenditures' },
      { id: 'dividends', label: 'Common Dividends' },
      { id: 'shareRepurchases', label: 'Share Repurchases' },
      { id: 'longTermDebtChange', label: 'Long-Term Debt Change', aka: '+ issue / − repay' },
      { id: 'commercialPaperChange', label: 'Commercial Paper Change' },
      { id: 'commonStockIssued', label: 'Common Stock Issued', aka: 'Beyond SBC' },
    ],
  },
  {
    title: 'Balance-sheet ratios',
    fields: [
      { id: 'arPctRevenue', label: 'A/R (% of revenue)', percent: true },
      { id: 'invPctCogs', label: 'Inventory (% of COGS)', percent: true },
      { id: 'otherCurrentAssetsPctRevenue', label: 'Other CA (% of revenue)', percent: true },
      { id: 'apPctCogs', label: 'A/P (% of COGS)', percent: true },
      { id: 'otherCurrentLiabilitiesPctRevenue', label: 'Other CL (% of revenue)', percent: true },
      { id: 'deferredRevenuePctRevenue', label: 'Deferred Rev (% of revenue)', percent: true },
      { id: 'otherNonCurrentAssetsPctRevenue', label: 'Other NCA (% of revenue)', percent: true },
      { id: 'otherNonCurrentLiabilitiesPctRevenue', label: 'Other NCL (% of revenue)', percent: true },
    ],
  },
];

export const WACC_FIELDS: FieldDef<keyof WaccAssumptions>[] = [
  { id: 'costOfDebt', label: 'Cost of Debt', percent: true },
  { id: 'taxRate', label: 'Tax Rate', percent: true },
  { id: 'riskFreeRate', label: 'Risk-Free Rate', percent: true },
  { id: 'beta', label: 'Beta' },
  { id: 'marketReturn', label: 'Market Return', percent: true },
  { id: 'weightEquity', label: 'Equity Weight', percent: true },
  { id: 'weightDebt', label: 'Debt Weight', percent: true },
];

// Debt and cash are taken from the base year (long-term debt + commercial
// paper, and cash) — these are the additional net-debt bridge items only.
export const BRIDGE_FIELDS: FieldDef<keyof NetDebtBridge>[] = [
  { id: 'convertibleStock', label: 'Convertible Stock' },
  { id: 'preferredStock', label: 'Preferred Stock' },
  { id: 'minorityInterest', label: 'Noncontrolling (Minority) Interests' },
  { id: 'equityInvestments', label: 'Equity Investments' },
];
