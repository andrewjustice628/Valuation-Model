import { describe, it, expect } from 'vitest';
import { runDcf, computeWacc, computeNetDebt } from './dcf';
import type { DcfInputs } from './types';

/**
 * Golden-parity test against a real filled model: "Verification of Model" (YUM!
 * Brands, $ millions, FY2025 base). Confirms the DCF engine reproduces the
 * spreadsheet's outputs to the dollar given the same inputs.
 *
 * NWC note: the sheet adds ΔNWC to UFCF; the engine subtracts it (standard).
 * To feed identical UFCF, the netWorkingCapital series below is constructed so
 * the engine's −ΔNWC equals the sheet's +ΔNWC (verified: UFCF matches exactly).
 */
const wacc = {
  costOfDebt: 0.049,
  taxRate: 0.21,
  riskFreeRate: 0.043,
  beta: 0.64,
  marketReturn: 0.1166,
  weightEquity: 0.761,
  weightDebt: 0.239,
};

const nwc = [0, -814.82017197749883, -1746.3556551335369, -2805.6996946947184, -4004.6665968273738];
const ebit = [2755.5916500000008, 2934.7051072499994, 3125.4609392212487, 3328.6159002706318, 3544.9759337882219];
const da = [218.69775, 232.91310375, 248.05245549374996, 264.17586510084374, 281.34729633239857];
const revenue = [8747.91, 9316.5241499999993, 9922.098219749998, 10567.034604033748, 11253.891853295941];
const capex = [349.9164, 372.660966, 396.88392878999991, 422.68138416134991, 450.15567413183766];
const fy = [2026, 2027, 2028, 2029, 2030];

const input: DcfInputs = {
  years: fy.map((fiscalYear, i) => ({
    fiscalYear, revenue: revenue[i], ebit: ebit[i], da: da[i],
    taxRate: 0.21, netWorkingCapital: nwc[i], capex: capex[i],
  })),
  wacc,
  stub: 0.71,
  longTermGrowth: 0.025,
  bridge: { debt: 11872, convertibleStock: 0, preferredStock: 0, minorityInterest: 0, cashAndEquivalents: 709, equityInvestments: 0 },
  sharesOutstanding: 276.43,
  terminalBasis: 'nominal',
};

describe('Golden parity — YUM verification workbook', () => {
  const res = runDcf(input);

  it('WACC matches (7.7821%)', () => expect(computeWacc(wacc).wacc).toBeCloseTo(0.077820834, 8));
  it('net debt matches (11,163)', () => expect(computeNetDebt(input.bridge)).toBe(11163));

  it('reproduces UFCF stream exactly', () => {
    const expectedUfcf = [2045.6987535, 2993.4893444549984, 3251.8181518445745, 3530.4450817144743, 3830.689512025911];
    res.years.forEach((y, i) => expect(y.ufcf).toBeCloseTo(expectedUfcf[i], 4));
  });

  it('PV of forecast period (12,029.71)', () => expect(res.pvOfForecast).toBeCloseTo(12029.705238, 2));
  it('terminal value (74,335.38)', () => expect(res.terminalValue).toBeCloseTo(74335.379669, 2));
  it('PV of terminal value (52,227.74)', () => expect(res.pvOfTerminalValue).toBeCloseTo(52227.735945, 2));
  it('enterprise value (64,257.44)', () => expect(res.enterpriseValue).toBeCloseTo(64257.441183, 2));
  it('equity value (53,094.44)', () => expect(res.equityValue).toBeCloseTo(53094.441183, 2));
  it('equity value per share ($192.07)', () => expect(res.equityValuePerShare).toBeCloseTo(192.07192122, 5));
});
