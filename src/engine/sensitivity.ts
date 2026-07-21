/**
 * Sensitivity analysis — the classic WACC × terminal-growth data table.
 * Re-runs the DCF across a grid of the two assumptions the value is most
 * sensitive to, returning a matrix of equity-value-per-share. Pure module.
 */
import { runDcf, computeWacc } from './dcf';
import type { DcfInputs } from './types';

export interface SensitivityResult {
  waccValues: number[]; // rows
  colValues: number[]; // columns (terminal growth OR exit multiple)
  colKind: 'growth' | 'multiple';
  perShare: number[][]; // perShare[waccIndex][colIndex]
  baseRow: number; // index of the current WACC
  baseCol: number; // index of the current column value
}

/** n values centered on `center`, spaced by `step` (n should be odd). */
export function centeredAxis(center: number, step: number, n: number): number[] {
  const half = Math.floor(n / 2);
  const out: number[] = [];
  for (let i = -half; i <= half; i++) out.push(center + i * step);
  return out;
}

export function sensitivityMatrix(
  input: DcfInputs,
  opts: { waccStep?: number; growthStep?: number; multipleStep?: number; n?: number } = {},
): SensitivityResult {
  const n = opts.n ?? 5;
  const waccStep = opts.waccStep ?? 0.005;
  const baseWacc = input.waccOverride ?? computeWacc(input.wacc).wacc;
  const waccValues = centeredAxis(baseWacc, waccStep, n).map((w) => Math.max(0.0001, w));

  const isMultiple = (input.terminalMethod ?? 'perpetuity') === 'exitMultiple';
  const colKind: 'growth' | 'multiple' = isMultiple ? 'multiple' : 'growth';
  const colValues = isMultiple
    ? centeredAxis(input.exitMultiple ?? 10, opts.multipleStep ?? 1, n).map((m) => Math.max(0.1, m))
    : centeredAxis(input.longTermGrowth, opts.growthStep ?? 0.005, n).map((g) => Math.max(0, g));

  const perShare = waccValues.map((w) =>
    colValues.map((c) =>
      runDcf({ ...input, waccOverride: w, ...(isMultiple ? { exitMultiple: c } : { longTermGrowth: c }) }).equityValuePerShare,
    ),
  );

  return { waccValues, colValues, colKind, perShare, baseRow: Math.floor(n / 2), baseCol: Math.floor(n / 2) };
}
