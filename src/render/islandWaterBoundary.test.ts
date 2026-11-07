import { describe, expect, it } from 'vitest';

import { buildSignedShoreDistances, keepLargestLandMass } from './islandWaterBoundary';

describe('replaceable island water boundary foundation', () => {
  it('retains the island rather than separate offshore props', () => {
    const coverage = new Uint8Array([
      1, 1, 0, 0, 0,
      1, 1, 0, 0, 0,
      0, 0, 0, 0, 0,
      0, 0, 0, 0, 1,
      0, 0, 0, 0, 0
    ]);
    const island = keepLargestLandMass(coverage, 5, 5);
    expect(Array.from(island).reduce((a, b) => a + b, 0)).toBe(4);
    expect(island[19]).toBe(0);
    expect(island[0]).toBe(1);
  });

  it('produces negative distances on solid ground and positive distances at sea', () => {
    const coverage = new Uint8Array(25);
    coverage[12] = 1;
    const distances = buildSignedShoreDistances(coverage, 5, 5, 0.25);
    expect(distances[12]).toBeCloseTo(-0.25);
    expect(distances[11]).toBeCloseTo(0.25);
    expect(distances[0]).toBeGreaterThan(distances[11]);
  });

  it('does not silently accept malformed source grids', () => {
    expect(() => keepLargestLandMass(new Uint8Array(2), 3, 3)).toThrow();
    expect(() => buildSignedShoreDistances(new Uint8Array(9), 3, 3, 0)).toThrow();
  });
});
