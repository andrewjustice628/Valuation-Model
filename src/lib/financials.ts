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
import { effectiveTaxRate, revenueGrowthFromHistory, type ForecastSeed } from './seed';
import { computeHistoricalYear, type HistoricalYear } from './historicals';

const NET_INCOME_CONCEPTS = ['NetIncomeLoss', 'ProfitLoss', 'NetIncomeLossAvailableToCommonStockholdersBasic'];
const COGS_CONCEPTS = ['CostOfGoodsAndServicesSold', 'CostOfRevenue', 'CostOfGoodsSold', 'CostOfSales'];
const HIST_CONCEPTS = {
  totalAssets: ['Assets'],
  totalLiabilities: ['Liabilities'],
  totalEquity: ['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'],
  cash: ['CashAndCashEquivalentsAtCarryingValue', 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents'],
  cfo: ['NetCashProvidedByUsedInOperatingActivities'],
  cfi: ['NetCashProvidedByUsedInInvestingActivities'],
  cff: ['NetCashProvidedByUsedInFinancingActivities'],
  netChangeInCash: [
    'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsPeriodIncreaseDecreaseIncludingExchangeRateEffect',
    'CashAndCashEquivalentsPeriodIncreaseDecrease',
  ],
};

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
  rd: [['ResearchAndDevelopmentExpense']],
  sga: [['SellingGeneralAndAdministrativeExpense', 'GeneralAndAdministrativeExpense']],
  da: [['DepreciationDepletionAndAmortization', 'DepreciationAmortizationAndAccretionNet', 'DepreciationAndAmortization']],
  interestIncome: [['InvestmentIncomeInterest', 'InterestAndDividendIncomeOperating']],
  interestExpense: [['InterestExpense', 'InterestExpenseDebt']],
  otherExpenses: [['OtherNonoperatingIncomeExpense']],
  taxes: [['IncomeTaxExpenseBenefit']],
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

// ---- Forecast seed from as-reported income statement + cash flow ----

const SEED_CONCEPTS = {
  revenue: ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues', 'RevenueFromContractWithCustomerIncludingAssessedTax', 'SalesRevenueNet'],
  rd: ['ResearchAndDevelopmentExpense'],
  sga: ['SellingGeneralAndAdministrativeExpense', 'GeneralAndAdministrativeExpense'],
  tax: ['IncomeTaxExpenseBenefit'],
  pretax: [
    'IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest',
    'IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments',
  ],
  da: ['DepreciationDepletionAndAmortization', 'DepreciationAmortizationAndAccretionNet', 'DepreciationAndAmortization'],
  capex: ['PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsForCapitalImprovements', 'PaymentsToAcquireProductiveAssets'],
  sbc: ['ShareBasedCompensation'],
  dividends: ['PaymentsOfDividendsCommonStock', 'PaymentsOfDividends'],
  buybacks: ['PaymentsForRepurchaseOfCommonStock'],
  interestExpense: ['InterestExpense', 'InterestExpenseDebt'],
  interestIncome: ['InvestmentIncomeInterest', 'InterestAndDividendIncomeOperating'],
};

function lookupOf(report: ReportedFinancials): Map<string, number> {
  const m = new Map<string, number>();
  for (const arr of [report.ic, report.bs, report.cf]) {
    if (!arr) continue;
    for (const item of arr) {
      const tag = normalize(item.concept);
      const num = typeof item.value === 'number' ? item.value : parseFloat(String(item.value));
      if (tag && Number.isFinite(num) && !m.has(tag)) m.set(tag, num);
    }
  }
  return m;
}

const firstOf = (m: Map<string, number>, cands: string[]): number | undefined => {
  for (const c of cands) {
    const v = m.get(c.toLowerCase());
    if (v !== undefined) return v;
  }
  return undefined;
};

export interface ReportLike {
  year?: number;
  endDate?: string;
  report?: ReportedFinancials;
}

/** Derive income-statement / cash-flow ratios + revenue growth from filings. */
export function deriveReportedSeed(reports: ReportLike[]): ForecastSeed {
  const withReport = reports.filter((r) => r.report);
  if (withReport.length === 0) return {};
  const sorted = [...withReport].sort((a, b) => (b.endDate ?? '').localeCompare(a.endDate ?? ''));
  const latest = lookupOf(sorted[0].report!);
  const seed: ForecastSeed = {};

  const rev = firstOf(latest, SEED_CONCEPTS.revenue);
  const set = (k: keyof ForecastSeed, v: number | undefined) => {
    if (typeof v === 'number' && Number.isFinite(v)) seed[k] = v;
  };
  if (rev && rev > 0) {
    const rd = firstOf(latest, SEED_CONCEPTS.rd);
    const sga = firstOf(latest, SEED_CONCEPTS.sga);
    if (rd !== undefined) set('rdPctSales', rd / rev);
    if (sga !== undefined) set('sgaPctSales', sga / rev);
  }
  set('taxRate', effectiveTaxRate(firstOf(latest, SEED_CONCEPTS.tax), firstOf(latest, SEED_CONCEPTS.pretax)));
  set('da', firstOf(latest, SEED_CONCEPTS.da));
  set('capex', firstOf(latest, SEED_CONCEPTS.capex));
  set('stockBasedComp', firstOf(latest, SEED_CONCEPTS.sbc));
  set('dividends', firstOf(latest, SEED_CONCEPTS.dividends));
  set('shareRepurchases', firstOf(latest, SEED_CONCEPTS.buybacks));
  set('interestExpense', firstOf(latest, SEED_CONCEPTS.interestExpense));
  set('interestIncome', firstOf(latest, SEED_CONCEPTS.interestIncome));

  const history = sorted
    .map((r) => ({ year: Number((r.endDate ?? '').slice(0, 4)) || r.year || 0, revenue: firstOf(lookupOf(r.report!), SEED_CONCEPTS.revenue) ?? NaN }))
    .filter((p) => p.year && Number.isFinite(p.revenue));
  const growth = revenueGrowthFromHistory(history);
  if (growth !== undefined) seed.revenueGrowth = growth;

  return seed;
}

/** Full canonical base-year fields per year (up to last 5) for the input grid. */
export function deriveReportedBaseHistory(reports: ReportLike[]): Array<Record<string, number>> {
  return reports
    .filter((r) => r.report)
    .map((r) => ({
      fiscalYear: Number((r.endDate ?? '').slice(0, 4)) || r.year || 0,
      ...mapReportedFinancials(r.report!).values,
    }))
    .filter((x) => x.fiscalYear)
    .sort((a, b) => a.fiscalYear - b.fiscalYear)
    .slice(-5);
}

/** Historical income statements (up to last 5 years) from as-reported filings. */
export function deriveReportedHistoricals(reports: ReportLike[]): HistoricalYear[] {
  return reports
    .filter((r) => r.report)
    .map((r) => {
      const m = lookupOf(r.report!);
      return computeHistoricalYear({
        fiscalYear: Number((r.endDate ?? '').slice(0, 4)) || r.year || 0,
        revenue: firstOf(m, SEED_CONCEPTS.revenue),
        cogs: firstOf(m, COGS_CONCEPTS),
        rd: firstOf(m, SEED_CONCEPTS.rd),
        sga: firstOf(m, SEED_CONCEPTS.sga),
        da: firstOf(m, SEED_CONCEPTS.da),
        netIncome: firstOf(m, NET_INCOME_CONCEPTS),
        totalAssets: firstOf(m, HIST_CONCEPTS.totalAssets),
        totalLiabilities: firstOf(m, HIST_CONCEPTS.totalLiabilities),
        totalEquity: firstOf(m, HIST_CONCEPTS.totalEquity),
        cash: firstOf(m, HIST_CONCEPTS.cash),
        accountsReceivable: firstOf(m, MAP.accountsReceivable[0]),
        inventories: firstOf(m, MAP.inventories[0]),
        otherCurrentAssets: firstOf(m, MAP.otherCurrentAssets[0]),
        accountsPayable: firstOf(m, MAP.accountsPayable[0]),
        otherCurrentLiabilities: firstOf(m, MAP.otherCurrentLiabilities[0]),
        deferredRevenue: firstOf(m, MAP.deferredRevenue[0]),
        cashFromOperations: firstOf(m, HIST_CONCEPTS.cfo),
        cashFromInvesting: firstOf(m, HIST_CONCEPTS.cfi),
        cashFromFinancing: firstOf(m, HIST_CONCEPTS.cff),
        netChangeInCash: firstOf(m, HIST_CONCEPTS.netChangeInCash),
      });
    })
    .filter((h) => h.fiscalYear)
    .sort((a, b) => a.fiscalYear - b.fiscalYear)
    .slice(-5);
}
