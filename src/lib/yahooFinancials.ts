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

/** Yahoo timeseries base field names we request (each prefixed "annual"). */
export const YAHOO_TS_FIELDS = [
  'TotalRevenue', 'CostOfRevenue',
  'CashAndCashEquivalents', 'OtherShortTermInvestments', 'CashCashEquivalentsAndShortTermInvestments',
  'AccountsReceivable', 'Receivables', 'Inventory', 'OtherCurrentAssets',
  'NetPPE', 'Goodwill', 'OtherIntangibleAssets', 'OtherNonCurrentAssets',
  'AccountsPayable', 'Payables', 'OtherCurrentLiabilities', 'CurrentDeferredRevenue',
  'CommercialPaper', 'LongTermDebt', 'CurrentDebt', 'OtherNonCurrentLiabilities',
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
  set('cash', n('CashAndCashEquivalents') ?? n('CashCashEquivalentsAndShortTermInvestments'), n('OtherShortTermInvestments'));
  set('accountsReceivable', n('AccountsReceivable') ?? n('Receivables'));
  set('inventories', n('Inventory'));
  set('otherCurrentAssets', n('OtherCurrentAssets'));
  set('ppe', n('NetPPE'));
  set('otherNonCurrentAssets', n('OtherNonCurrentAssets'), n('Goodwill'), n('OtherIntangibleAssets'));
  set('accountsPayable', n('AccountsPayable') ?? n('Payables'));
  set('otherCurrentLiabilities', n('OtherCurrentLiabilities'));
  set('deferredRevenue', n('CurrentDeferredRevenue'));
  set('commercialPaper', n('CommercialPaper'));
  set('longTermDebt', n('LongTermDebt'), n('CurrentDebt'));
  set('otherNonCurrentLiabilities', n('OtherNonCurrentLiabilities'));
  set('retainedEarnings', n('RetainedEarnings'));
  set('otherComprehensiveIncome', n('GainsLossesNotAffectingRetainedEarnings'));
  set('commonStock', n('CommonStock') ?? n('CommonStockEquity'), n('AdditionalPaidInCapital'));

  return { values, found, missing };
}
