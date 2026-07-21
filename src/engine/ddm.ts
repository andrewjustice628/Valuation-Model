/**
 * Dividend Discount Model — discount the forecast dividends at the cost of
 * equity, with a perpetuity-growth terminal value. Values equity directly (no
 * net-debt bridge). Best for dividend payers, utilities, and financials.
 */
import { presentValue } from './finance';

export interface DdmInput {
  dividends: number[]; // forecast total dividends per year
  costOfEquity: number;
  stub: number;
  terminalGrowth: number;
  sharesOutstanding: number;
}

export interface DdmResult {
  equityValue: number;
  perShare: number;
  pvForecast: number;
  pvTerminal: number;
}

export function runDdm(i: DdmInput): DdmResult {
  const r = i.costOfEquity;
  const g = i.terminalGrowth;
  const n = i.dividends.length;
  if (n === 0) return { equityValue: NaN, perShare: NaN, pvForecast: NaN, pvTerminal: NaN };

  const pvForecast = i.dividends.reduce(
    (sum, d, k) => sum + presentValue(r, k + i.stub, k === 0 ? d * i.stub : d),
    0,
  );
  const last = i.dividends[n - 1];
  const terminalValue = r > g ? (last * (1 + g)) / (r - g) : NaN;
  const pvTerminal = presentValue(r, n - 1 + i.stub, terminalValue);
  const equityValue = pvForecast + pvTerminal;
  const perShare = i.sharesOutstanding > 0 ? equityValue / i.sharesOutstanding : NaN;
  return { equityValue, perShare, pvForecast, pvTerminal };
}
