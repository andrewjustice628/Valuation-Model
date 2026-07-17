/**
 * Pluggable valuation-method registry.
 *
 * Each technique (DCF, comps, and later DDM / residual income / …) implements
 * ValuationMethod and registers itself. The UI renders whatever is registered
 * and shows every method's equity-value-per-share side by side. Adding a
 * technique means adding one module here — the core never changes.
 */
import { runDcf } from './dcf';
import { runComps } from './comps';
import type { DcfInputs, CompsInputs } from './types';

export interface ValuationMethod<TInput = unknown, TResult = unknown> {
  id: string;
  label: string;
  /** Longer description shown in the UI. */
  summary: string;
  run: (input: TInput) => TResult;
  /** Pull the headline equity value per share out of this method's result. */
  perShare: (result: TResult) => number;
}

export const dcfMethod: ValuationMethod<DcfInputs, ReturnType<typeof runDcf>> = {
  id: 'dcf',
  label: 'Discounted Cash Flow',
  summary:
    'Unlevered FCF discounted at WACC with a perpetuity-growth terminal value.',
  run: runDcf,
  perShare: (r) => r.equityValuePerShare,
};

export const compsMethod: ValuationMethod<CompsInputs, ReturnType<typeof runComps>> = {
  id: 'comps',
  label: 'Comparable Companies',
  summary: 'Average peer multiple applied to a company metric (e.g. EV/EBITDA).',
  run: runComps,
  perShare: (r) => r.equityValuePerShare,
};

/** All registered methods, in display order. Append new techniques here. */
export const VALUATION_METHODS: ValuationMethod[] = [
  dcfMethod as ValuationMethod,
  compsMethod as ValuationMethod,
];
