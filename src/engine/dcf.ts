/**
 * Discounted Cash Flow valuation. Pure functions; mirrors the DCF sheet.
 */
import { presentValue } from './finance';
import type {
  DcfInputs,
  DcfResult,
  DcfYearDetail,
  NetDebtBridge,
  WaccAssumptions,
  WaccResult,
} from './types';

/** WACC via CAPM (DCF sheet rows 33–47). */
export function computeWacc(a: WaccAssumptions): WaccResult {
  const costOfDebtAfterTax = a.costOfDebt * (1 - a.taxRate);
  const marketRiskPremium = a.marketReturn - a.riskFreeRate;
  const costOfEquity = a.riskFreeRate + a.beta * marketRiskPremium;
  const wacc = costOfDebtAfterTax * a.weightDebt + costOfEquity * a.weightEquity;
  return { costOfDebtAfterTax, marketRiskPremium, costOfEquity, wacc };
}

/** Net Debt = gross debt & equivalents − nonoperating assets. */
export function computeNetDebt(b: NetDebtBridge): number {
  const grossDebt = b.debt + b.convertibleStock + b.preferredStock + b.minorityInterest;
  const nonOperating = b.cashAndEquivalents + b.equityInvestments;
  return grossDebt - nonOperating;
}

export function runDcf(input: DcfInputs): DcfResult {
  const { years, stub, longTermGrowth: g, sharesOutstanding } = input;
  const wacc = computeWacc(input.wacc);
  const r = wacc.wacc;
  const basis = input.terminalBasis ?? 'nominal';

  const detail: DcfYearDetail[] = years.map((y, i) => {
    const ebitda = y.ebit + y.da;
    const ebitdaMargin = y.revenue === 0 ? NaN : ebitda / y.revenue; // spec Q2 fix
    const nopat = y.ebit - y.ebit * y.taxRate;
    const priorNwc = i === 0 ? y.netWorkingCapital : years[i - 1].netWorkingCapital;
    // ΔNWC as a use of cash: an increase reduces UFCF.
    const changeInNwc = y.netWorkingCapital - priorNwc;
    const ufcf = nopat + y.da - changeInNwc - y.capex;
    const ufcfStubAdjusted = i === 0 ? ufcf * stub : ufcf;
    const discountPeriod = i + stub; // Y1: stub, Y2: 1+stub, … Y5: 4+stub
    const pv = presentValue(r, discountPeriod, ufcfStubAdjusted);
    return {
      ...y,
      ebitda,
      ebitdaMargin,
      nopat,
      changeInNwc,
      ufcf,
      ufcfStubAdjusted,
      discountPeriod,
      presentValue: pv,
    };
  });

  const pvOfForecast = detail.reduce((s, y) => s + y.presentValue, 0);

  const last = detail[detail.length - 1];
  const terminalPeriod = detail.length - 1 + stub; // discounted like the final year
  // 'nominal' (default, spec Q1 fix): grow the last year's nominal UFCF.
  // 'faithful': reproduce the sheet growing the PV of the last year.
  const terminalFcf =
    basis === 'faithful' ? last.presentValue * (1 + g) : last.ufcf * (1 + g);
  const terminalValue = terminalFcf / (r - g);
  const pvOfTerminalValue = presentValue(r, terminalPeriod, terminalValue);

  const enterpriseValue = pvOfForecast + pvOfTerminalValue;
  const netDebt = computeNetDebt(input.bridge);
  const equityValue = enterpriseValue - netDebt;
  const equityValuePerShare =
    sharesOutstanding === 0 ? NaN : equityValue / sharesOutstanding;

  return {
    wacc,
    years: detail,
    pvOfForecast,
    terminalValue,
    pvOfTerminalValue,
    enterpriseValue,
    netDebt,
    equityValue,
    equityValuePerShare,
  };
}
