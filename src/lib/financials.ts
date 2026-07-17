/**
 * Maps a company's *as-reported* financial statement (Finnhub
 * financials-reported, sourced from SEC filings) onto our canonical base-year
 * line items — keyed by standardized us-GAAP concept, so it works across
 * companies regardless of the labels they use in their filings.
 *
 * Pure module (no network / UI). Shared by the client type layer and the
 * Netlify function; unit-tested with a realistic payload shape.
 */
import type { BaseYear } from '../engine/statements';

export interface ReportedItem {
  concept?: string;
  label?: string;
  value?: number | string;
  unit?: string;
}
export interface ReportedFinancials {
  bs?: ReportedItem[];
  ic?: ReportedItem[];
  cf?: ReportedItem[];
}

export type MappableField = Exclude<keyof BaseYear, 'fiscalYear'>;

export interface MappedFinancials {
  values: Partial<Record<MappableField, number>>;
  found: MappableField[];
  missing: MappableField[];
}

/**
 * Each field is a list of concept "groups". Within a group the first matching
 * concept wins; groups are summed (e.g. current + non-current debt). A field
 * counts as "found" only if its primary (first) group matched.
 */
const MAP: Record<MappableField, string[][]> = {
  revenue: [['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues', 'RevenueFromContractWithCustomerIncludingAssessedTax', 'SalesRevenueNet', 'Revenue']],
  cogs: [['CostOfGoodsAndServicesSold', 'CostOfRevenue', 'CostOfGoodsSold', 'CostOfSales']],
  cash: [
    ['CashAndCashEquivalentsAtCarryingValue', 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents'],
    ['MarketableSecuritiesCurrent', 'ShortTermInvestments', 'AvailableForSaleSecuritiesCurrent'],
  ],
  accountsReceivable: [['AccountsReceivableNetCurrent', 'ReceivablesNetCurrent', 'AccountsAndOtherReceivablesNetCurrent']],
  inventories: [['InventoryNet', 'InventoryFinishedGoodsNetOfReserves']],
  otherCurrentAssets: [['OtherAssetsCurrent', 'PrepaidExpenseAndOtherAssetsCurrent']],
  ppe: [['PropertyPlantAndEquipmentNet']],
  otherNonCurrentAssets: [
    ['OtherAssetsNoncurrent'],
    ['Goodwill'],
    ['IntangibleAssetsNetExcludingGoodwill', 'FiniteLivedIntangibleAssetsNet'],
  ],
  accountsPayable: [['AccountsPayableCurrent', 'AccountsPayableTradeCurrent']],
  otherCurrentLiabilities: [['OtherLiabilitiesCurrent', 'AccruedLiabilitiesCurrent']],
  deferredRevenue: [
    ['ContractWithCustomerLiabilityCurrent', 'DeferredRevenueCurrent'],
    ['ContractWithCustomerLiabilityNoncurrent', 'DeferredRevenueNoncurrent'],
  ],
  commercialPaper: [['CommercialPaper']],
  longTermDebt: [
    ['LongTermDebtNoncurrent', 'LongTermDebt'],
    ['LongTermDebtCurrent', 'LongTermDebtAndCapitalLeaseObligationsCurrent'],
  ],
  otherNonCurrentLiabilities: [['OtherLiabilitiesNoncurrent']],
  retainedEarnings: [['RetainedEarningsAccumulatedDeficit']],
  otherComprehensiveIncome: [['AccumulatedOtherComprehensiveIncomeLossNetOfTax']],
  commonStock: [
    ['CommonStocksIncludingAdditionalPaidInCapital', 'CommonStockValue'],
    ['AdditionalPaidInCapital', 'AdditionalPaidInCapitalCommonStock'],
  ],
};

/** Strip the taxonomy prefix ("us-gaap_", "ifrs-full_") and lowercase. */
function normalize(concept?: string): string {
  return (concept ?? '').replace(/^[^_]*_/, '').toLowerCase();
}

export function mapReportedFinancials(report: ReportedFinancials): MappedFinancials {
  const lookup = new Map<string, number>();
  for (const arr of [report.ic, report.bs, report.cf]) {
    if (!arr) continue;
    for (const item of arr) {
      const tag = normalize(item.concept);
      const num = typeof item.value === 'number' ? item.value : parseFloat(String(item.value));
      // First occurrence wins (usually the consolidated, undimensioned value).
      if (tag && Number.isFinite(num) && !lookup.has(tag)) lookup.set(tag, num);
    }
  }

  const values: Partial<Record<MappableField, number>> = {};
  const found: MappableField[] = [];
  const missing: MappableField[] = [];

  for (const field of Object.keys(MAP) as MappableField[]) {
    let sum = 0;
    let primaryHit = false;
    MAP[field].forEach((candidates, groupIndex) => {
      for (const c of candidates) {
        const v = lookup.get(c.toLowerCase());
        if (v !== undefined) {
          sum += v;
          if (groupIndex === 0) primaryHit = true;
          break;
        }
      }
    });
    if (primaryHit) {
      values[field] = sum;
      found.push(field);
    } else {
      missing.push(field);
    }
  }

  return { values, found, missing };
}
