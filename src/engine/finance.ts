/**
 * Pure financial primitives. No UI/store imports.
 */

/**
 * Present value of a single future amount.
 *
 * PV = FV / (1 + rate)^nper
 *
 * Note (spec Q5): Excel's PV(rate, nper, 0, fv) returns the *negative* of this
 * (cash-flow sign convention). We use the mathematically positive present value
 * so Enterprise Value reads as a positive number. Documented as an intentional
 * deviation from the sheet's Excel-sign behavior.
 */
export function presentValue(rate: number, nper: number, futureValue: number): number {
  return futureValue / Math.pow(1 + rate, nper);
}

/** Average of a numeric list; returns NaN for an empty list (caller guards). */
export function average(xs: number[]): number {
  if (xs.length === 0) return NaN;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/**
 * Blume-adjusted beta: nudges a raw regression beta toward the market's 1.0,
 * reflecting that betas mean-revert over time. adjusted = ⅔·raw + ⅓·1.0
 * (Bloomberg's default). Preferred over a raw single-stock beta for forward-
 * looking discounting.
 */
export function blumeAdjustedBeta(rawBeta: number): number {
  return (2 / 3) * rawBeta + 1 / 3;
}

/** Round to `dp` decimal places (display only — never in the compute chain). */
export function round(x: number, dp = 2): number {
  const f = Math.pow(10, dp);
  return Math.round(x * f) / f;
}
