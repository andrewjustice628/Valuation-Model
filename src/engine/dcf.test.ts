import { describe, it, expect } from 'vitest';
import { computeWacc, computeNetDebt, runDcf } from './dcf';
import type { DcfInputs } from './types';

const wacc = {
  costOfDebt: 0.05,
  taxRate: 0.21,
  riskFreeRate: 0.04,
  beta: 1.2,
  marketReturn: 0.1,
  weightEquity: 0.8,
  weightDebt: 0.2,
};

const input: DcfInputs = {
  years: [
    { fiscalYear: 2026, revenue: 1000, ebit: 200, da: 50, taxRate: 0.21, netWorkingCapital: 100, capex: 60 },
    { fiscalYear: 2027, revenue: 1100, ebit: 220, da: 55, taxRate: 0.21, netWorkingCapital: 110, capex: 66 },
  ],
  wacc,
  stub: 1,
  longTermGrowth: 0.025,
  bridge: { debt: 300, convertibleStock: 0, preferredStock: 0, minorityInterest: 0, cashAndEquivalents: 150, equityInvestments: 0 },
  sharesOutstanding: 1000,
};

describe('computeWacc (CAPM)', () => {
  const r = computeWacc(wacc);
  it('cost of debt after tax', () => expect(r.costOfDebtAfterTax).toBeCloseTo(0.0395, 10));
  it('market risk premium', () => expect(r.marketRiskPremium).toBeCloseTo(0.06, 10));
  it('cost of equity', () => expect(r.costOfEquity).toBeCloseTo(0.112, 10));
  it('wacc', () => expect(r.wacc).toBeCloseTo(0.0975, 10));
});

describe('computeNetDebt', () => {
  it('gross debt minus nonoperating', () => {
    expect(computeNetDebt(input.bridge)).toBe(150);
  });
});

describe('runDcf — UFCF build (spec Q2/Q3 fixes applied)', () => {
  const res = runDcf(input);
  it('EBITDA = EBIT + D&A', () => expect(res.years[0].ebitda).toBe(250));
  it('EBITDA margin = EBITDA / Revenue', () => expect(res.years[0].ebitdaMargin).toBeCloseTo(0.25, 10));
  it('NOPAT = EBIT * (1 - tax)', () => expect(res.years[0].nopat).toBeCloseTo(158, 10));
  it('year 1 ΔNWC uses itself as prior (0)', () => expect(res.years[0].changeInNwc).toBe(0));
  it('year 2 ΔNWC = 110 - 100', () => expect(res.years[1].changeInNwc).toBe(10));
  it('year 1 UFCF = NOPAT + D&A - ΔNWC - capex', () => expect(res.years[0].ufcf).toBeCloseTo(148, 10));
  it('year 2 UFCF', () => expect(res.years[1].ufcf).toBeCloseTo(152.8, 10));
});

describe('runDcf — discounting & bridge (independent recomputation)', () => {
  const res = runDcf(input);
  const r = 0.0975;
  const g = 0.025;
  const ufcf1 = 148;
  const ufcf2 = 152.8;
  const pv1 = ufcf1 / Math.pow(1 + r, 1);
  const pv2 = ufcf2 / Math.pow(1 + r, 2);
  const pvForecast = pv1 + pv2;
  const tv = (ufcf2 * (1 + g)) / (r - g);
  const pvTv = tv / Math.pow(1 + r, 2);
  const ev = pvForecast + pvTv;
  const equity = ev - 150;
  const perShare = equity / 1000;

  it('PV of forecast period', () => expect(res.pvOfForecast).toBeCloseTo(pvForecast, 8));
  it('terminal value (grows nominal last-year UFCF)', () => expect(res.terminalValue).toBeCloseTo(tv, 6));
  it('PV of terminal value', () => expect(res.pvOfTerminalValue).toBeCloseTo(pvTv, 6));
  it('enterprise value', () => expect(res.enterpriseValue).toBeCloseTo(ev, 6));
  it('equity value = EV - net debt', () => expect(res.equityValue).toBeCloseTo(equity, 6));
  it('equity value per share', () => expect(res.equityValuePerShare).toBeCloseTo(perShare, 8));

  it('internal identities hold', () => {
    expect(res.enterpriseValue).toBeCloseTo(res.pvOfForecast + res.pvOfTerminalValue, 10);
    expect(res.equityValue).toBeCloseTo(res.enterpriseValue - res.netDebt, 10);
    expect(res.equityValuePerShare).toBeCloseTo(res.equityValue / input.sharesOutstanding, 10);
  });
});

describe('runDcf — faithful terminal basis reproduces the sheet quirk', () => {
  it('faithful grows the PV of the last year (spec Q1)', () => {
    const faithful = runDcf({ ...input, terminalBasis: 'faithful' });
    const nominal = runDcf(input);
    // The faithful (buggy) TV is smaller because it grows an already-discounted number.
    expect(faithful.terminalValue).toBeLessThan(nominal.terminalValue);
  });
});
