/**
 * Monte Carlo simulation over the DCF. Rather than a single point estimate,
 * this samples the highest-leverage value drivers from probability
 * distributions, re-runs the full three-statement → DCF engine for each trial,
 * and returns the resulting distribution of equity value per share.
 *
 * The four drivers (each an additive normal shock, in the driver's own units):
 *   - revenue growth   — one draw shared across all forecast years (a company
 *                        that grows faster tends to do so throughout, so the
 *                        years are correlated, not independent)
 *   - gross margin     — one shared draw applied to every year's gross margin
 *   - WACC             — a draw applied to the discount rate directly
 *   - terminal growth  — a draw applied to the perpetuity growth rate
 *
 * A driver with standard deviation 0 is held fixed. Trials that produce a
 * non-finite or blown-up value (e.g. a shocked WACC at or below terminal
 * growth) are discarded and counted, so the reported distribution is clean.
 *
 * Pure module — no UI/store imports. The RNG is injected so runs are
 * reproducible under test.
 */
import type { WaccAssumptions, NetDebtBridge } from './types';
import type { BaseYear, ForecastAssumptions } from './statements';
import { buildStatements } from './statements';
import { runDcf } from './dcf';

export interface MonteCarloConfig {
  trials: number;
  /** Std dev of the additive shock to each year's revenue growth (e.g. 0.03 = ±3pp). */
  revenueGrowthSd: number;
  /** Std dev of the additive shock to gross margin. */
  marginSd: number;
  /** Std dev of the additive shock to WACC. */
  waccSd: number;
  /** Std dev of the additive shock to terminal (perpetuity) growth. */
  terminalGrowthSd: number;
}

export interface MonteCarloInputs {
  base: BaseYear;
  assumptions: ForecastAssumptions[];
  wacc: WaccAssumptions;
  /** Deterministic base-case WACC (the value the point-estimate DCF used). */
  baseWacc: number;
  stub: number;
  longTermGrowth: number;
  bridge: NetDebtBridge;
  sharesOutstanding: number;
  terminalBasis?: 'nominal' | 'faithful';
  terminalMethod?: 'perpetuity' | 'exitMultiple';
  exitMultiple?: number;
  config: MonteCarloConfig;
  /** Uniform [0,1) source. Inject a seeded generator for reproducibility. */
  rng: () => number;
  /** Current market price, to report P(undervalued). Null when unknown. */
  sharePrice?: number | null;
}

export interface HistogramBin {
  start: number;
  end: number;
  count: number;
}

export interface MonteCarloResult {
  /** Trials requested. */
  trials: number;
  /** Trials that produced a usable (finite) value. */
  usable: number;
  /** Trials discarded for a non-finite / blown-up result. */
  discarded: number;
  mean: number;
  stdDev: number;
  min: number;
  max: number;
  /** Percentiles of value per share (p5 … p95). */
  p5: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
  /** P(intrinsic value > current price) — probability the stock is undervalued. */
  probUndervalued: number | null;
  histogram: HistogramBin[];
}

/** Standard-normal draw via Box–Muller from two uniforms. */
function normal(rng: () => number): number {
  let u = rng();
  // Guard against log(0).
  if (u < 1e-12) u = 1e-12;
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Linear-interpolated percentile of a pre-sorted ascending array. */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  if (sorted.length === 1) return sorted[0];
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function runMonteCarlo(input: MonteCarloInputs): MonteCarloResult {
  const { config, rng } = input;
  const trials = Math.max(0, Math.floor(config.trials));
  const perpetuity = (input.terminalMethod ?? 'perpetuity') === 'perpetuity';
  const values: number[] = [];
  let discarded = 0;

  for (let i = 0; i < trials; i++) {
    const gShock = config.revenueGrowthSd > 0 ? normal(rng) * config.revenueGrowthSd : 0;
    const mShock = config.marginSd > 0 ? normal(rng) * config.marginSd : 0;
    const wShock = config.waccSd > 0 ? normal(rng) * config.waccSd : 0;
    const tShock = config.terminalGrowthSd > 0 ? normal(rng) * config.terminalGrowthSd : 0;

    const trialWacc = input.baseWacc + wShock;
    const trialTerminalGrowth = input.longTermGrowth + tShock;

    // In perpetuity mode a discount rate at or below terminal growth makes the
    // Gordon denominator collapse — discard rather than emit a garbage value.
    if (perpetuity && trialWacc - trialTerminalGrowth <= 0.005) {
      discarded++;
      continue;
    }

    const shockedAssumptions = input.assumptions.map((a) => ({
      ...a,
      revenueGrowth: a.revenueGrowth + gShock,
      grossMargin: a.grossMargin + mShock,
    }));

    const statements = buildStatements(input.base, shockedAssumptions);
    const dcf = runDcf({
      years: statements.dcfYears,
      wacc: input.wacc,
      waccOverride: trialWacc,
      stub: input.stub,
      longTermGrowth: trialTerminalGrowth,
      bridge: input.bridge,
      sharesOutstanding: input.sharesOutstanding,
      terminalBasis: input.terminalBasis,
      terminalMethod: input.terminalMethod,
      exitMultiple: input.exitMultiple,
    });

    const v = dcf.equityValuePerShare;
    if (Number.isFinite(v)) values.push(v);
    else discarded++;
  }

  const usable = values.length;
  if (usable === 0) {
    return {
      trials, usable: 0, discarded,
      mean: NaN, stdDev: NaN, min: NaN, max: NaN,
      p5: NaN, p25: NaN, p50: NaN, p75: NaN, p95: NaN,
      probUndervalued: null, histogram: [],
    };
  }

  const mean = values.reduce((a, b) => a + b, 0) / usable;
  const variance = usable > 1
    ? values.reduce((s, v) => s + (v - mean) ** 2, 0) / (usable - 1)
    : 0;
  const stdDev = Math.sqrt(variance);

  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];

  const price = input.sharePrice;
  const probUndervalued = typeof price === 'number' && price > 0
    ? values.filter((v) => v > price).length / usable
    : null;

  // Histogram over the central mass [p1, p99] so a few outliers don't squash
  // the bars; values beyond the range fall into the edge bins.
  const BINS = 40;
  const lo = percentile(sorted, 1);
  const hi = percentile(sorted, 99);
  const span = hi - lo;
  const histogram: HistogramBin[] = [];
  if (span > 0) {
    const width = span / BINS;
    for (let b = 0; b < BINS; b++) {
      histogram.push({ start: lo + b * width, end: lo + (b + 1) * width, count: 0 });
    }
    for (const v of values) {
      let b = Math.floor((v - lo) / width);
      if (b < 0) b = 0;
      if (b >= BINS) b = BINS - 1;
      histogram[b].count++;
    }
  } else {
    // Degenerate (all values equal) — one bin.
    histogram.push({ start: lo, end: hi, count: usable });
  }

  return {
    trials, usable, discarded,
    mean, stdDev, min, max,
    p5: percentile(sorted, 5),
    p25: percentile(sorted, 25),
    p50: percentile(sorted, 50),
    p75: percentile(sorted, 75),
    p95: percentile(sorted, 95),
    probUndervalued, histogram,
  };
}

/**
 * Mulberry32 — a tiny seeded PRNG. Deterministic given a seed, so a simulation
 * re-runs identically (important for reproducible reports and tests).
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
