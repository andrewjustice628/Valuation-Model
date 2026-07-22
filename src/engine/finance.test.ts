import { describe, it, expect } from 'vitest';
import { presentValue, blumeAdjustedBeta } from './finance';

describe('presentValue', () => {
  it('discounts a future amount', () => {
    expect(presentValue(0.1, 2, 121)).toBeCloseTo(100, 8);
  });
});

describe('blumeAdjustedBeta', () => {
  it('pulls a low beta toward 1.0', () => {
    expect(blumeAdjustedBeta(0.56)).toBeCloseTo((2 / 3) * 0.56 + 1 / 3, 10); // ≈ 0.707
    expect(blumeAdjustedBeta(0.56)).toBeGreaterThan(0.56);
  });
  it('pulls a high beta toward 1.0', () => {
    expect(blumeAdjustedBeta(1.6)).toBeLessThan(1.6);
    expect(blumeAdjustedBeta(1.6)).toBeGreaterThan(1.0);
  });
  it('leaves a beta of 1.0 unchanged', () => {
    expect(blumeAdjustedBeta(1)).toBeCloseTo(1, 10);
  });
});
