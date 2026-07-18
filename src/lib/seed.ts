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
 * Geometric-average (CAGR) year-over-year revenue growth over up to the last 5
 * annual periods (6 data points), using as many as are available. Returns
 * undefined with fewer than two points. Geometric — not arithmetic — so a
 * volatile history doesn't overstate the trend:
 *   CAGR = (revenue_last / revenue_first)^(1 / periods) − 1
 */
export function revenueGrowthFromHistory(history: Array<{ year: number; revenue: number }>): number | undefined {
  const pts = history
    .filter((p) => finite(p.year) && finite(p.revenue) && p.revenue > 0)
    .sort((a, b) => a.year - b.year)
    .slice(-6); // last 6 points → up to 5 annual growth periods ("past 5 years")
  if (pts.length < 2) return undefined;
  const first = pts[0].revenue;
  const last = pts[pts.length - 1].revenue;
  const periods = pts.length - 1;
  const cagr = Math.pow(last / first, 1 / periods) - 1;
  return Number.isFinite(cagr) ? cagr : undefined;
}

/**
 * Dollar-denominated seed fields. On auto-fill these ramp across the forecast
 * at the geometric revenue-growth rate — value in forecast year k = actual ×
 * (1 + g)^k — so they grow (or shrink) with the business rather than sitting
 * flat. Ratio/percentage fields are held flat (they are already relative).
 */
export const RAMP_SEED_FIELDS = [
  'da', 'capex', 'stockBasedComp', 'dividends', 'shareRepurchases',
  'interestIncome', 'interestExpense',
] as const;

/** Effective tax rate from taxes / pretax, clamped to a sane 0–60%. */
export function effectiveTaxRate(taxes: number | undefined, pretax: number | undefined): number | undefined {
  if (!finite(taxes) || !finite(pretax) || pretax === 0) return undefined;
  const r = taxes / pretax;
  if (!Number.isFinite(r)) return undefined;
  return Math.min(0.6, Math.max(0, r));
}
