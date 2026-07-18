import { describe, it, expect } from 'vitest';
import { mapYahooTimeseries } from './yahooFinancials';

// Flattened fundamentals-timeseries values (latest annual per base field),
// in the company's reporting currency.
const v: Record<string, number> = {
  TotalRevenue: 93000000000,
  CostOfRevenue: 47000000000,
  CashAndCashEquivalents: 8000000000,
  OtherShortTermInvestments: 2000000000,
  AccountsReceivable: 12000000000,
  Inventory: 10000000000,
  OtherCurrentAssets: 3000000000,
  NetPPE: 30000000000,
  Goodwill: 30000000000,
  OtherIntangibleAssets: 20000000000,
  OtherNonCurrentAssets: 5000000000,
  AccountsPayable: 18000000000,
  OtherCurrentLiabilities: 12000000000,
  LongTermDebt: 25000000000,
  CurrentDebt: 4000000000,
  OtherNonCurrentLiabilities: 9000000000,
  RetainedEarnings: 40000000000,
  GainsLossesNotAffectingRetainedEarnings: -3000000000,
  CommonStock: 1000000000,
  AdditionalPaidInCapital: 6000000000,
};

describe('mapYahooTimeseries', () => {
  const mapped = mapYahooTimeseries(v);

  it('maps revenue and COGS', () => {
    expect(mapped.values.revenue).toBe(93000000000);
    expect(mapped.values.cogs).toBe(47000000000);
  });
  it('sums cash + short-term investments', () => {
    expect(mapped.values.cash).toBe(10000000000);
  });
  it('sums PP&E-adjacent other non-current assets', () => {
    expect(mapped.values.otherNonCurrentAssets).toBe(5000000000 + 30000000000 + 20000000000);
  });
  it('sums long-term + current debt', () => {
    expect(mapped.values.longTermDebt).toBe(29000000000);
  });
  it('sums common stock + APIC', () => {
    expect(mapped.values.commonStock).toBe(7000000000);
  });
  it('maps AOCI from GainsLossesNotAffectingRetainedEarnings', () => {
    expect(mapped.values.otherComprehensiveIncome).toBe(-3000000000);
  });
  it('flags absent fields as missing', () => {
    expect(mapped.missing).toContain('deferredRevenue');
    expect(mapped.missing).toContain('commercialPaper');
  });
  it('falls back to CashCashEquivalentsAndShortTermInvestments', () => {
    const m = mapYahooTimeseries({ CashCashEquivalentsAndShortTermInvestments: 500 });
    expect(m.values.cash).toBe(500);
  });
  it('falls back to capital-lease debt variants (IFRS filers)', () => {
    const m = mapYahooTimeseries({
      LongTermDebtAndCapitalLeaseObligation: 20000,
      CurrentDebtAndCapitalLeaseObligation: 3000,
    });
    expect(m.values.longTermDebt).toBe(23000);
  });
});
