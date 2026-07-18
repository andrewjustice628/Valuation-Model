/**
 * Derives forecast-assumption starting points ("seed") from a company's actual
 * statements, so an auto-filled model opens shaped like the real company rather
 * than generic placeholders. Pure module; source-specific extraction lives in
 * financials.ts (Finnhub) and yahooFinancials.ts (Yahoo).
 */
import type { ForecastAssumptions } from '../engine/statements';

/** Subset of forecast assumptions that can be derived from actuals. */
export type ForecastSeed = Partial<
  Pick<
    ForecastAssumptions,
    | 'revenueGrowth' | 'grossMargin' | 'rdPctSales' | 'sgaPctSales' | 'taxRate'
    | 'da' | 'capex' | 'stockBasedComp' | 'dividends' | 'shareRepurchases'
    | 'interestIncome' | 'interestExpense'
    | 'arPctRevenue' | 'invPctCogs' | 'otherCurrentAssetsPctRevenue'
    | 'apPctCogs' | 'otherCurrentLiabilitiesPctRevenue' | 'deferredRevenuePctRevenue'
    | 'otherNonCurrentAssetsPctRevenue' | 'otherNonCurrentLiabilitiesPctRevenue'
  >
>;

const finite = (x: number | undefined): x is number => typeof x === 'number' && Number.isFinite(x);

/**
 * Balance-sheet ratios + gross margin from canonical base-year values.
 * Works for either data source since it consumes the mapped base fields.
 */
export function deriveBalanceSheetSeed(base: Record<string, number>): ForecastSeed {
  const s: ForecastSeed = {};
  const rev = base.revenue;
  const cogs = base.cogs;
  if (finite(rev) && rev > 0) {
    if (finite(cogs)) s.grossMargin = (rev - cogs) / rev;
    if (finite(base.accountsReceivable)) s.arPctRevenue = base.accountsReceivable / rev;
    if (finite(base.otherCurrentAssets)) s.otherCurrentAssetsPctRevenue = base.otherCurrentAssets / rev;
    if (finite(base.otherCurrentLiabilities)) s.otherCurrentLiabilitiesPctRevenue = base.otherCurrentLiabilities / rev;
    if (finite(base.deferredRevenue)) s.deferredRevenuePctRevenue = base.deferredRevenue / rev;
    if (finite(base.otherNonCurrentAssets)) s.otherNonCurrentAssetsPctRevenue = base.otherNonCurrentAssets / rev;
    if (finite(base.otherNonCurrentLiabilities)) s.otherNonCurrentLiabilitiesPctRevenue = base.otherNonCurrentLiabilities / rev;
  }
  if (finite(cogs) && cogs > 0) {
    if (finite(base.inventories)) s.invPctCogs = base.inventories / cogs;
    if (finite(base.accountsPayable)) s.apPctCogs = base.accountsPayable / cogs;
  }
  return s;
}

/**
 * Average year-over-year revenue growth from a history of {year, revenue}.
 * Uses up to the last 3 transitions; returns undefined if insufficient data.
 */
export function revenueGrowthFromHistory(history: Array<{ year: number; revenue: number }>): number | undefined {
  const pts = history
    .filter((p) => finite(p.year) && finite(p.revenue) && p.revenue > 0)
    .sort((a, b) => a.year - b.year);
  if (pts.length < 2) return undefined;
  const growths: number[] = [];
  for (let i = 1; i < pts.length; i++) growths.push(pts[i].revenue / pts[i - 1].revenue - 1);
  const recent = growths.slice(-3);
  return recent.reduce((a, b) => a + b, 0) / recent.length;
}

/** Effective tax rate from taxes / pretax, clamped to a sane 0–60%. */
export function effectiveTaxRate(taxes: number | undefined, pretax: number | undefined): number | undefined {
  if (!finite(taxes) || !finite(pretax) || pretax === 0) return undefined;
  const r = taxes / pretax;
  if (!Number.isFinite(r)) return undefined;
  return Math.min(0.6, Math.max(0, r));
}
