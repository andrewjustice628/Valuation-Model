import { describe, it, expect } from 'vitest';
import { mapYahooFinancials } from './yahooFinancials';

// Yahoo quoteSummary shape: fields are { raw, fmt }; missing fields absent.
const income = {
  totalRevenue: { raw: 574000000000 },
  costOfRevenue: { raw: 350000000000 },
};
const balance = {
  cash: { raw: 8000000000 },
  shortTermInvestments: { raw: 2000000000 },
  netReceivables: { raw: 15000000000 },
  inventory: { raw: 10000000000 },
  otherCurrentAssets: { raw: 3000000000 },
  propertyPlantEquipment: { raw: 30000000000 },
  goodWill: { raw: 20000000000 },
  intangibleAssets: { raw: 5000000000 },
  accountsPayable: { raw: 18000000000 },
  otherCurrentLiab: { raw: 12000000000 },
  longTermDebt: { raw: 25000000000 },
  shortLongTermDebt: { raw: 4000000000 },
  otherLiab: { raw: 9000000000 },
  retainedEarnings: { raw: 40000000000 },
  otherStockholderEquity: { raw: -3000000000 },
  commonStock: { raw: 1000000000 },
  capitalSurplus: { raw: 6000000000 },
};

describe('mapYahooFinancials', () => {
  const mapped = mapYahooFinancials(income, balance);

  it('maps income statement fields', () => {
    expect(mapped.values.revenue).toBe(574000000000);
    expect(mapped.values.cogs).toBe(350000000000);
  });
  it('sums cash + short-term investments', () => {
    expect(mapped.values.cash).toBe(10000000000);
  });
  it('sums other non-current assets components', () => {
    expect(mapped.values.otherNonCurrentAssets).toBe(20000000000 + 5000000000);
  });
  it('sums long-term + current debt', () => {
    expect(mapped.values.longTermDebt).toBe(29000000000);
  });
  it('sums common stock + capital surplus (APIC)', () => {
    expect(mapped.values.commonStock).toBe(7000000000);
  });
  it('flags fields Yahoo does not provide as missing', () => {
    expect(mapped.missing).toContain('deferredRevenue');
    expect(mapped.missing).toContain('commercialPaper');
  });
  it('handles a bare number as well as {raw}', () => {
    const m = mapYahooFinancials({ totalRevenue: 100 }, {});
    expect(m.values.revenue).toBe(100);
  });
});
