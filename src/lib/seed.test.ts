import { describe, it, expect } from 'vitest';
import { deriveBalanceSheetSeed, revenueGrowthFromHistory, effectiveTaxRate } from './seed';
import { deriveReportedSeed } from './financials';
import { deriveYahooSeed } from './yahooFinancials';

describe('deriveBalanceSheetSeed', () => {
  const s = deriveBalanceSheetSeed({
    revenue: 1000, cogs: 600, accountsReceivable: 150, inventories: 90,
    accountsPayable: 120, otherCurrentAssets: 20,
  });
  it('gross margin from revenue and COGS', () => expect(s.grossMargin).toBeCloseTo(0.4, 10));
  it('A/R as % of revenue', () => expect(s.arPctRevenue).toBeCloseTo(0.15, 10));
  it('inventory as % of COGS', () => expect(s.invPctCogs).toBeCloseTo(0.15, 10));
  it('A/P as % of COGS', () => expect(s.apPctCogs).toBeCloseTo(0.2, 10));
  it('omits ratios with no data', () => expect(s.deferredRevenuePctRevenue).toBeUndefined());
});

describe('revenueGrowthFromHistory', () => {
  it('averages recent YoY growth', () => {
    const g = revenueGrowthFromHistory([
      { year: 2022, revenue: 100 },
      { year: 2023, revenue: 110 },
      { year: 2024, revenue: 121 },
    ]);
    expect(g).toBeCloseTo(0.1, 10);
  });
  it('undefined with fewer than two points', () => {
    expect(revenueGrowthFromHistory([{ year: 2024, revenue: 100 }])).toBeUndefined();
  });
});

describe('effectiveTaxRate', () => {
  it('taxes / pretax', () => expect(effectiveTaxRate(21, 100)).toBeCloseTo(0.21, 10));
  it('clamps to 0–60%', () => expect(effectiveTaxRate(90, 100)).toBe(0.6));
  it('guards divide-by-zero', () => expect(effectiveTaxRate(21, 0)).toBeUndefined());
});

describe('deriveReportedSeed (Finnhub as-reported)', () => {
  const reports = [
    {
      endDate: '2024-09-30', year: 2024,
      report: {
        ic: [
          { concept: 'us-gaap_RevenueFromContractWithCustomerExcludingAssessedTax', value: 400 },
          { concept: 'us-gaap_ResearchAndDevelopmentExpense', value: 40 },
          { concept: 'us-gaap_SellingGeneralAndAdministrativeExpense', value: 60 },
          { concept: 'us-gaap_IncomeTaxExpenseBenefit', value: 25 },
          { concept: 'us-gaap_IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest', value: 100 },
        ],
        cf: [
          { concept: 'us-gaap_PaymentsToAcquirePropertyPlantAndEquipment', value: 30 },
          { concept: 'us-gaap_ShareBasedCompensation', value: 12 },
          { concept: 'us-gaap_PaymentsOfDividendsCommonStock', value: 15 },
          { concept: 'us-gaap_PaymentsForRepurchaseOfCommonStock', value: 50 },
        ],
      },
    },
    { endDate: '2023-09-30', year: 2023, report: { ic: [{ concept: 'us-gaap_Revenues', value: 360 }] } },
  ];
  const s = deriveReportedSeed(reports);
  it('R&D and SG&A as % of sales', () => {
    expect(s.rdPctSales).toBeCloseTo(0.1, 10);
    expect(s.sgaPctSales).toBeCloseTo(0.15, 10);
  });
  it('effective tax rate', () => expect(s.taxRate).toBeCloseTo(0.25, 10));
  it('capex/SBC/dividends/buybacks from cash flow', () => {
    expect(s.capex).toBe(30);
    expect(s.stockBasedComp).toBe(12);
    expect(s.dividends).toBe(15);
    expect(s.shareRepurchases).toBe(50);
  });
  it('revenue growth from history (400/360 - 1)', () => expect(s.revenueGrowth).toBeCloseTo(400 / 360 - 1, 10));
});

describe('deriveYahooSeed', () => {
  const s = deriveYahooSeed(
    {
      TotalRevenue: 500,
      ResearchAndDevelopment: 25,
      SellingGeneralAndAdministration: 75,
      TaxProvision: 40,
      PretaxIncome: 200,
      ReconciledDepreciation: 18,
      CapitalExpenditure: -35, // outflow (negative)
      StockBasedCompensation: 10,
      CommonStockDividendPaid: -20,
      RepurchaseOfCapitalStock: -60,
    },
    [
      { year: 2023, revenue: 450 },
      { year: 2024, revenue: 500 },
    ],
  );
  it('R&D / SG&A percentages', () => {
    expect(s.rdPctSales).toBeCloseTo(0.05, 10);
    expect(s.sgaPctSales).toBeCloseTo(0.15, 10);
  });
  it('tax rate', () => expect(s.taxRate).toBeCloseTo(0.2, 10));
  it('takes magnitudes of cash outflows', () => {
    expect(s.capex).toBe(35);
    expect(s.dividends).toBe(20);
    expect(s.shareRepurchases).toBe(60);
  });
  it('revenue growth from history', () => expect(s.revenueGrowth).toBeCloseTo(500 / 450 - 1, 10));
});
