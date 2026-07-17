import { describe, it, expect } from 'vitest';
import { mapReportedFinancials, type ReportedFinancials } from './financials';

// Realistic Finnhub financials-reported shape: concepts prefixed "us-gaap_",
// values in raw dollars, first (undimensioned) occurrence is the consolidated.
const report: ReportedFinancials = {
  ic: [
    { concept: 'us-gaap_RevenueFromContractWithCustomerExcludingAssessedTax', value: 383285000000 },
    { concept: 'us-gaap_CostOfGoodsAndServicesSold', value: 214137000000 },
  ],
  bs: [
    { concept: 'us-gaap_CashAndCashEquivalentsAtCarryingValue', value: 29965000000 },
    { concept: 'us-gaap_MarketableSecuritiesCurrent', value: 31590000000 },
    { concept: 'us-gaap_AccountsReceivableNetCurrent', value: 29508000000 },
    { concept: 'us-gaap_InventoryNet', value: 6331000000 },
    { concept: 'us-gaap_OtherAssetsCurrent', value: 14695000000 },
    { concept: 'us-gaap_PropertyPlantAndEquipmentNet', value: 43715000000 },
    { concept: 'us-gaap_OtherAssetsNoncurrent', value: 64758000000 },
    { concept: 'us-gaap_AccountsPayableCurrent', value: 62611000000 },
    { concept: 'us-gaap_OtherLiabilitiesCurrent', value: 58829000000 },
    { concept: 'us-gaap_ContractWithCustomerLiabilityCurrent', value: 8061000000 },
    { concept: 'us-gaap_LongTermDebtNoncurrent', value: 95281000000 },
    { concept: 'us-gaap_LongTermDebtCurrent', value: 9822000000 },
    { concept: 'us-gaap_OtherLiabilitiesNoncurrent', value: 49848000000 },
    { concept: 'us-gaap_RetainedEarningsAccumulatedDeficit', value: -214000000 },
    { concept: 'us-gaap_AccumulatedOtherComprehensiveIncomeLossNetOfTax', value: -11452000000 },
    { concept: 'us-gaap_CommonStocksIncludingAdditionalPaidInCapital', value: 73812000000 },
  ],
};

describe('mapReportedFinancials', () => {
  const mapped = mapReportedFinancials(report);

  it('maps by us-gaap concept regardless of taxonomy prefix', () => {
    expect(mapped.values.revenue).toBe(383285000000);
    expect(mapped.values.cogs).toBe(214137000000);
  });
  it('sums component groups (cash + marketable securities)', () => {
    expect(mapped.values.cash).toBe(29965000000 + 31590000000);
  });
  it('sums current + non-current long-term debt', () => {
    expect(mapped.values.longTermDebt).toBe(95281000000 + 9822000000);
  });
  it('uses the combined common-stock-incl-APIC tag when present', () => {
    expect(mapped.values.commonStock).toBe(73812000000);
  });
  it('preserves negative balances (retained earnings deficit)', () => {
    expect(mapped.values.retainedEarnings).toBe(-214000000);
  });
  it('reports fields with no matching concept as missing', () => {
    expect(mapped.missing).toContain('commercialPaper');
    expect(mapped.found).toContain('revenue');
    expect(mapped.values.commercialPaper).toBeUndefined();
  });

  it('separate CommonStockValue + APIC are summed', () => {
    const m = mapReportedFinancials({
      bs: [
        { concept: 'us-gaap_CommonStockValue', value: 100 },
        { concept: 'us-gaap_AdditionalPaidInCapital', value: 900 },
      ],
    });
    expect(m.values.commonStock).toBe(1000);
  });
});
