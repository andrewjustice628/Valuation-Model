/**
 * Maps Yahoo Finance's fundamentals-timeseries data onto our canonical
 * base-year fields — the international fallback when a company has no SEC
 * filing. Yahoo's legacy quoteSummary balance-sheet module is deprecated
 * (returns empty), so we use the timeseries endpoint's field taxonomy.
 *
 * Pure module; the Netlify function does the network fetch, flattens each
 * series to its latest annual value, and passes a { baseFieldName: number }
 * record here. Values are in the company's reporting currency, actual units.
 */
import type { MappedFinancials, MappableField } from './financials';
import { effectiveTaxRate, revenueGrowthFromHistory, type ForecastSeed } from './seed';
import { computeHistoricalYear, type HistoricalYear } from './historicals';

/** Yahoo timeseries base field names we request (each prefixed "annual"). */
export const YAHOO_TS_FIELDS = [
  'TotalRevenue', 'CostOfRevenue', 'NetIncome',
  // Income-statement / cash-flow lines used to seed the forecast:
  'ResearchAndDevelopment', 'SellingGeneralAndAdministration', 'TaxProvision', 'PretaxIncome',
  'ReconciledDepreciation', 'CapitalExpenditure', 'StockBasedCompensation',
  'CommonStockDividendPaid', 'RepurchaseOfCapitalStock', 'InterestExpense',
  'InterestIncome', 'InterestIncomeNonOperating',
  // Historical balance-sheet / cash-flow totals:
  'TotalAssets', 'TotalLiabilitiesNetMinorityInterest', 'StockholdersEquity',
  'OperatingCashFlow', 'InvestingCashFlow', 'FinancingCashFlow', 'ChangesInCash',
  'CashAndCashEquivalents', 'OtherShortTermInvestments', 'CashCashEquivalentsAndShortTermInvestments',
  'AccountsReceivable', 'Receivables', 'Inventory', 'OtherCurrentAssets',
  'NetPPE', 'Goodwill', 'OtherIntangibleAssets', 'OtherNonCurrentAssets',
  'AccountsPayable', 'Payables', 'OtherCurrentLiabilities', 'OtherCurrentLiabilitiesTotal',
  'CurrentDeferredRevenue', 'CurrentDeferredLiabilities',
  'CommercialPaper', 'LongTermDebt', 'LongTermDebtAndCapitalLeaseObligation',
  'CurrentDebt', 'CurrentDebtAndCapitalLeaseObligation',
  'OtherNonCurrentLiabilities', 'TotalNonCurrentLiabilitiesNetMinorityInterest',
  'RetainedEarnings', 'CommonStock', 'AdditionalPaidInCapital', 'CommonStockEquity',
  'GainsLossesNotAffectingRetainedEarnings',
] as const;

export function mapYahooTimeseries(v: Record<string, number>): MappedFinancials {
  const values: Partial<Record<MappableField, number>> = {};
  const found: MappableField[] = [];
  const missing: MappableField[] = [];

  const n = (key: string): number | undefined =>
    typeof v[key] === 'number' && Number.isFinite(v[key]) ? v[key] : undefined;

  // Sum whatever components are present; "found" if at least one is.
  const set = (field: MappableField, ...parts: (number | undefined)[]) => {
    const present = parts.filter((p): p is number => p !== undefined);
    if (present.length === 0) {
      missing.push(field);
      return;
    }
    values[field] = present.reduce((a, b) => a + b, 0);
    found.push(field);
  };

  set('revenue', n('TotalRevenue'));
  set('cogs', n('CostOfRevenue'));
  set('rd', n('ResearchAndDevelopment'));
  set('sga', n('SellingGeneralAndAdministration'));
  set('da', n('ReconciledDepreciation'));
  set('interestIncome', n('InterestIncome') ?? n('InterestIncomeNonOperating'));
  set('interestExpense', n('InterestExpense'));
  set('taxes', n('TaxProvision'));
  set('otherExpenses'); // not cleanly exposed by Yahoo → manual
  set('cash', n('CashAndCashEquivalents') ?? n('CashCashEquivalentsAndShortTermInvestments'), n('OtherShortTermInvestments'));
  set('accountsReceivable', n('AccountsReceivable') ?? n('Receivables'));
  set('inventories', n('Inventory'));
  set('otherCurrentAssets', n('OtherCurrentAssets'));
  set('ppe', n('NetPPE'));
  set('otherNonCurrentAssets', n('OtherNonCurrentAssets'), n('Goodwill'), n('OtherIntangibleAssets'));
  set('accountsPayable', n('AccountsPayable') ?? n('Payables'));
  set('otherCurrentLiabilities', n('OtherCurrentLiabilities') ?? n('OtherCurrentLiabilitiesTotal'));
  set('deferredRevenue', n('CurrentDeferredRevenue') ?? n('CurrentDeferredLiabilities'));
  set('commercialPaper', n('CommercialPaper'));
  set(
    'longTermDebt',
    n('LongTermDebt') ?? n('LongTermDebtAndCapitalLeaseObligation'),
    n('CurrentDebt') ?? n('CurrentDebtAndCapitalLeaseObligation'),
  );
  set('otherNonCurrentLiabilities', n('OtherNonCurrentLiabilities'));
  set('retainedEarnings', n('RetainedEarnings'));
  set('otherComprehensiveIncome', n('GainsLossesNotAffectingRetainedEarnings'));
  set('commonStock', n('CommonStock') ?? n('CommonStockEquity'), n('AdditionalPaidInCapital'));

  return { values, found, missing };
}

/** Derive forecast seed (IS/CF ratios + revenue growth) from Yahoo timeseries. */
export function deriveYahooSeed(
  v: Record<string, number>,
  revenueHistory: Array<{ year: number; revenue: number }>,
): ForecastSeed {
  const seed: ForecastSeed = {};
  const num = (k: string): number | undefined =>
    typeof v[k] === 'number' && Number.isFinite(v[k]) ? v[k] : undefined;
  const set = (k: keyof ForecastSeed, val: number | undefined) => {
    if (typeof val === 'number' && Number.isFinite(val)) seed[k] = val;
  };

  const rev = num('TotalRevenue');
  if (rev && rev > 0) {
    const rd = num('ResearchAndDevelopment');
    const sga = num('SellingGeneralAndAdministration');
    if (rd !== undefined) set('rdPctSales', rd / rev);
    if (sga !== undefined) set('sgaPctSales', sga / rev);
  }
  set('taxRate', effectiveTaxRate(num('TaxProvision'), num('PretaxIncome')));
  set('da', num('ReconciledDepreciation'));
  // Yahoo cash-flow outflows are negative — take magnitudes.
  const capex = num('CapitalExpenditure');
  if (capex !== undefined) set('capex', Math.abs(capex));
  set('stockBasedComp', num('StockBasedCompensation'));
  const div = num('CommonStockDividendPaid');
  if (div !== undefined) set('dividends', Math.abs(div));
  const bb = num('RepurchaseOfCapitalStock');
  if (bb !== undefined) set('shareRepurchases', Math.abs(bb));
  const ie = num('InterestExpense');
  if (ie !== undefined) set('interestExpense', Math.abs(ie));
  const ii = num('InterestIncome') ?? num('InterestIncomeNonOperating');
  if (ii !== undefined) set('interestIncome', Math.abs(ii));

  const growth = revenueGrowthFromHistory(revenueHistory);
  if (growth !== undefined) seed.revenueGrowth = growth;
  return seed;
}

/** Full canonical base-year fields per year (up to last 5) for the input grid. */
export function deriveYahooBaseHistory(byYear: Record<number, Record<string, number>>): Array<Record<string, number>> {
  return Object.keys(byYear)
    .map(Number)
    .filter((y) => Number.isFinite(y))
    .sort((a, b) => a - b)
    .slice(-5)
    .map((y) => ({ fiscalYear: y, ...mapYahooTimeseries(byYear[y]).values }));
}

/** Historical income statements (up to last 5 years) from Yahoo per-year data. */
export function deriveYahooHistoricals(byYear: Record<number, Record<string, number>>): HistoricalYear[] {
  return Object.keys(byYear)
    .map(Number)
    .filter((y) => Number.isFinite(y))
    .sort((a, b) => a - b)
    .slice(-5)
    .map((y) => {
      const v = byYear[y];
      return computeHistoricalYear({
        fiscalYear: y,
        revenue: v.TotalRevenue,
        cogs: v.CostOfRevenue,
        rd: v.ResearchAndDevelopment,
        sga: v.SellingGeneralAndAdministration,
        da: v.ReconciledDepreciation,
        netIncome: v.NetIncome,
        totalAssets: v.TotalAssets,
        totalLiabilities: v.TotalLiabilitiesNetMinorityInterest,
        totalEquity: v.StockholdersEquity ?? v.CommonStockEquity,
        cash: v.CashAndCashEquivalents,
        accountsReceivable: v.AccountsReceivable ?? v.Receivables,
        inventories: v.Inventory,
        otherCurrentAssets: v.OtherCurrentAssets,
        accountsPayable: v.AccountsPayable ?? v.Payables,
        otherCurrentLiabilities: v.OtherCurrentLiabilities,
        deferredRevenue: v.CurrentDeferredRevenue ?? v.CurrentDeferredLiabilities,
        cashFromOperations: v.OperatingCashFlow,
        cashFromInvesting: v.InvestingCashFlow,
        cashFromFinancing: v.FinancingCashFlow,
        netChangeInCash: v.ChangesInCash,
      });
    });
}
