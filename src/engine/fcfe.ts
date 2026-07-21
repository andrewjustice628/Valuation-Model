/**
 * Free Cash Flow to Equity — levered DCF that discounts equity cash flows at
 * the cost of equity, giving equity value directly (no net-debt bridge).
 * FCFE = Net income + D&A − Capex − ΔNWC + net borrowing.
 */
import { presentValue } from './finance';

export interface FcfeYear {
  netIncome: number;
  da: number;
  capex: number;
  changeInNwc: number;
  netBorrowing: number;
}

export interface FcfeInput {
  years: FcfeYear[];
  costOfEquity: number;
  stub: number;
  terminalGrowth: number;
  sharesOutstanding: number;
}

export interface FcfeResult {
  fcfe: number[];
  equityValue: number;
  perShare: number;
  pvForecast: number;
  pvTerminal: number;
}

export function runFcfe(i: FcfeInput): FcfeResult {
  const r = i.costOfEquity;
  const g = i.terminalGrowth;
  const fcfe = i.years.map((y) => y.netIncome + y.da - y.capex - y.changeInNwc + y.netBorrowing);
  const n = fcfe.length;
  if (n === 0) return { fcfe, equityValue: NaN, perShare: NaN, pvForecast: NaN, pvTerminal: NaN };

  const pvForecast = fcfe.reduce((sum, f, k) => sum + presentValue(r, k + i.stub, k === 0 ? f * i.stub : f), 0);
  const last = fcfe[n - 1];
  const terminalValue = r > g ? (last * (1 + g)) / (r - g) : NaN;
  const pvTerminal = presentValue(r, n - 1 + i.stub, terminalValue);
  const equityValue = pvForecast + pvTerminal;
  const perShare = i.sharesOutstanding > 0 ? equityValue / i.sharesOutstanding : NaN;
  return { fcfe, equityValue, perShare, pvForecast, pvTerminal };
}
