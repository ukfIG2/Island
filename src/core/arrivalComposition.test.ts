import { describe, expect, it } from 'vitest';

import {
  arrivalCompositionForWave,
  arrivalCraftProjection,
  arrivalProgress
} from './arrivalComposition';


describe('arrival composition', () => {
  it('gives the scripted campaign distinct physical arrival regimes', () => {
    expect(arrivalCompositionForWave(1).source).toBe('small-boat');
    expect(arrivalCompositionForWave(2).source).toBe('speedboats');
    expect(arrivalCompositionForWave(3).source).toBe('ferry');
    expect(arrivalCompositionForWave(7).source).toBe('seaplane');
  });

  it('projects progress only from authoritative released demand', () => {
    expect(arrivalProgress('awaiting', 4, 8)).toBe(0);
    expect(arrivalProgress('incoming', 2, 8)).toBe(0.25);
    expect(arrivalProgress('draining', 6, 8)).toBe(0.75);
    expect(arrivalProgress('complete', 8, 8)).toBe(1);
  });

  it('uses source-specific craft geometry without changing demand totals', () => {
    const speedboats = arrivalCraftProjection(2, 'incoming', 4, 8);
    const ferry = arrivalCraftProjection(3, 'incoming', 4, 8);
    expect(speedboats).toHaveLength(3);
    expect(ferry).toHaveLength(1);
    expect(speedboats[0].progress).toBeGreaterThan(speedboats[1].progress);
    expect(ferry[0].progress).toBeCloseTo(0.45);
  });
});
