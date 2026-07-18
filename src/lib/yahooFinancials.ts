/**
 * Maps Yahoo Finance's quoteSummary statement objects onto our canonical
 * base-year fields. Used as the international fallback when a company has no
 * SEC filing (Finnhub's source). Pure module; the network/crumb fetching lives
 * in the Netlify function.
 *
 * Yahoo statement values look like { raw: number, fmt: string } (or are absent).
 * Values are in the company's reporting currency and actual units.
 */
import type { MappedFinancials, MappableField } from './financials';

export interface YahooValue {
  raw?: number;
}
export type YahooStatement = Record<string, YahooValue | number | undefined>;

/** Pull a numeric value from a Yahoo field ({raw} | number | absent). */
function num(stmt: YahooStatement | undefined, key: string): number | undefined {
  const v = stmt?.[key];
  if (v == null) return undefined;
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  const r = v.raw;
  return typeof r === 'number' && Number.isFinite(r) ? r : undefined;
}

export function mapYahooFinancials(
  income: YahooStatement | undefined,
  balance: YahooStatement | undefined,
): MappedFinancials {
  const values: Partial<Record<MappableField, number>> = {};
  const found: MappableField[] = [];
  const missing: MappableField[] = [];

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

  set('revenue', num(income, 'totalRevenue'));
  set('cogs', num(income, 'costOfRevenue'));
  set('cash', num(balance, 'cash'), num(balance, 'shortTermInvestments'));
  set('accountsReceivable', num(balance, 'netReceivables'));
  set('inventories', num(balance, 'inventory'));
  set('otherCurrentAssets', num(balance, 'otherCurrentAssets'));
  set('ppe', num(balance, 'propertyPlantEquipment'));
  set(
    'otherNonCurrentAssets',
    num(balance, 'otherAssets'),
    num(balance, 'goodWill'),
    num(balance, 'intangibleAssets'),
    num(balance, 'longTermInvestments'),
  );
  set('accountsPayable', num(balance, 'accountsPayable'));
  set('otherCurrentLiabilities', num(balance, 'otherCurrentLiab'));
  set('deferredRevenue'); // not in Yahoo's legacy schema → manual
  set('commercialPaper'); // not available → manual
  set('longTermDebt', num(balance, 'longTermDebt'), num(balance, 'shortLongTermDebt'));
  set('otherNonCurrentLiabilities', num(balance, 'otherLiab'));
  set('retainedEarnings', num(balance, 'retainedEarnings'));
  set('otherComprehensiveIncome', num(balance, 'otherStockholderEquity'));
  set('commonStock', num(balance, 'commonStock'), num(balance, 'capitalSurplus'));

  return { values, found, missing };
}
