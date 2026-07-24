import { describe, it, expect } from 'vitest';
import { runMonteCarlo, mulberry32, type MonteCarloInputs } from './monteCarlo';
import type { BaseYear, ForecastAssumptions } from './statements';
import type { WaccAssumptions, NetDebtBridge } from './types';

const base: BaseYear = {
  fiscalYear: 2023, revenue: 1000, cogs: 600, rd: 40, sga: 150, da: 50,
  interestIncome: 0, interestExpense: 10, otherExpenses: 0, taxes: 30,
  cash: 100, accountsReceivable: 80, inventories: 60, otherCurrentAssets: 20,
  ppe: 400, otherNonCurrentAssets: 50, accountsPayable: 70, otherCurrentLiabilities: 40,
  deferredRevenue: 30, commercialPaper: 0, longTermDebt: 200, otherNonCurrentLiabilities: 60,
  retainedEarnings: 300, otherComprehensiveIncome: 0, commonStock: 130,
};

function mkAssumptions(): ForecastAssumptions[] {
  return Array.from({ length: 5 }, (_, i) => ({
    fiscalYear: 2024 + i,
    revenueGrowth: 0.05, grossMargin: 0.4, rdPctSales: 0.04, sgaPctSales: 0.15,
    taxRate: 0.21, da: 50, interestIncome: 0, interestExpense: 10, otherExpenses: 0,
    stockBasedComp: 0, capex: 60, dividends: 0, shareRepurchases: 0,
    longTermDebtChange: 0, commercialPaperChange: 0, commonStockIssued: 0,
    arPctRevenue: 0.08, invPctCogs: 0.1, otherCurrentAssetsPctRevenue: 0.02,
    apPctCogs: 0.11, otherCurrentLiabilitiesPctRevenue: 0.04, deferredRevenuePctRevenue: 0.03,
    otherNonCurrentAssetsPctRevenue: 0.05, otherNonCurrentLiabilitiesPctRevenue: 0.06,
  }));
}

const wacc: WaccAssumptions = {
  costOfDebt: 0.05, taxRate: 0.21, riskFreeRate: 0.04, beta: 1,
  marketReturn: 0.09, weightEquity: 0.8, weightDebt: 0.2,
};

const bridge: NetDebtBridge = {
  debt: 200, convertibleStock: 0, preferredStock: 0, minorityInterest: 0,
  cashAndEquivalents: 100, equityInvestments: 0,
};

function baseInputs(overrides: Partial<MonteCarloInputs> = {}): MonteCarloInputs {
  return {
    base, assumptions: mkAssumptions(), wacc, baseWacc: 0.08, stub: 1,
    longTermGrowth: 0.025, bridge, sharesOutstanding: 100,
    config: { trials: 2000, revenueGrowthSd: 0.02, marginSd: 0.02, waccSd: 0.01, terminalGrowthSd: 0.005 },
    rng: mulberry32(42),
    ...overrides,
  };
}

describe('runMonteCarlo', () => {
  it('is deterministic for a fixed seed', () => {
    const a = runMonteCarlo(baseInputs({ rng: mulberry32(7) }));
    const b = runMonteCarlo(baseInputs({ rng: mulberry32(7) }));
    expect(a.mean).toBe(b.mean);
    expect(a.p50).toBe(b.p50);
  });

  it('produces ordered percentiles and a positive spread', () => {
    const r = runMonteCarlo(baseInputs());
    expect(r.usable).toBeGreaterThan(0);
    expect(r.p5).toBeLessThanOrEqual(r.p25);
    expect(r.p25).toBeLessThanOrEqual(r.p50);
    expect(r.p50).toBeLessThanOrEqual(r.p75);
    expect(r.p75).toBeLessThanOrEqual(r.p95);
    expect(r.min).toBeLessThanOrEqual(r.p5);
    expect(r.max).toBeGreaterThanOrEqual(r.p95);
    expect(r.stdDev).toBeGreaterThan(0);
  });

  it('collapses to a point when all shocks are zero', () => {
    const r = runMonteCarlo(baseInputs({
      config: { trials: 500, revenueGrowthSd: 0, marginSd: 0, waccSd: 0, terminalGrowthSd: 0 },
    }));
    expect(r.stdDev).toBeCloseTo(0, 6);
    expect(r.p5).toBeCloseTo(r.p95, 6);
  });

  it('reports P(undervalued) between 0 and 1 and consistent with price', () => {
    const r = runMonteCarlo(baseInputs({ sharePrice: 1e9 }));
    expect(r.probUndervalued).toBe(0); // price absurdly high → never undervalued
    const r2 = runMonteCarlo(baseInputs({ sharePrice: 0.01 }));
    expect(r2.probUndervalued).toBe(1); // price ~0 → always undervalued
    const r3 = runMonteCarlo(baseInputs({ sharePrice: undefined }));
    expect(r3.probUndervalued).toBeNull();
  });

  it('histogram counts sum to usable trials', () => {
    const r = runMonteCarlo(baseInputs());
    const total = r.histogram.reduce((s, b) => s + b.count, 0);
    expect(total).toBe(r.usable);
  });

  it('discards trials where the shocked WACC collapses onto terminal growth', () => {
    // Huge WACC shock around a low base rate → many discards, but it must not throw.
    const r = runMonteCarlo(baseInputs({
      baseWacc: 0.03,
      config: { trials: 1000, revenueGrowthSd: 0, marginSd: 0, waccSd: 0.05, terminalGrowthSd: 0 },
    }));
    expect(r.discarded).toBeGreaterThan(0);
    expect(r.usable + r.discarded).toBe(1000);
  });
});

describe('mulberry32', () => {
  it('returns uniforms in [0,1)', () => {
    const rng = mulberry32(123);
    for (let i = 0; i < 100; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
