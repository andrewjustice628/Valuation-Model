import { describe, it, expect } from 'vitest';
import { bottomUpBeta } from './bottomUpBeta';

describe('bottomUpBeta', () => {
  it('unlevers, averages, relevers', () => {
    // One peer: βL 1.2, D/E 0.5, tax 0.21 → βU = 1.2/(1+0.79×0.5) = 0.86022
    const r = bottomUpBeta([{ leveredBeta: 1.2, deRatio: 0.5 }], 0.3, 0.21);
    expect(r.assetBeta).toBeCloseTo(1.2 / (1 + 0.79 * 0.5), 8);
    // relever at target D/E 0.3
    expect(r.releveredBeta).toBeCloseTo(r.assetBeta * (1 + 0.79 * 0.3), 8);
    expect(r.count).toBe(1);
  });

  it('averages unlevered betas across peers', () => {
    const r = bottomUpBeta([{ leveredBeta: 1.0, deRatio: 0 }, { leveredBeta: 1.2, deRatio: 1 }], 0, 0.21);
    const u1 = 1.0; // D/E 0 → unlevered = levered
    const u2 = 1.2 / (1 + 0.79 * 1);
    expect(r.assetBeta).toBeCloseTo((u1 + u2) / 2, 8);
    expect(r.releveredBeta).toBeCloseTo(r.assetBeta, 8); // targetDE 0 → relevered = asset
  });

  it('relevering above the peer D/E raises beta', () => {
    const lowLev = bottomUpBeta([{ leveredBeta: 1.0, deRatio: 0.2 }], 0.1, 0.21).releveredBeta;
    const highLev = bottomUpBeta([{ leveredBeta: 1.0, deRatio: 0.2 }], 1.0, 0.21).releveredBeta;
    expect(highLev).toBeGreaterThan(lowLev);
  });

  it('ignores peers missing beta or D/E', () => {
    const r = bottomUpBeta([{ leveredBeta: NaN, deRatio: 0.5 }, { leveredBeta: 1.1, deRatio: 0.4 }], 0.4, 0.21);
    expect(r.count).toBe(1);
  });

  it('NaN when no valid peers', () => {
    expect(bottomUpBeta([], 0.5, 0.21).releveredBeta).toBeNaN();
  });
});
