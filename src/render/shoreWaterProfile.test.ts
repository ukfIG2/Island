import { describe, expect, it } from 'vitest';
import { DEFAULT_SHORE_WATER_PROFILE, shoreWaterAlphaAtDistance } from './shoreWaterProfile';

describe('coastal water opacity gradient', () => {
  it('gradually reveals the shoreline while keeping the open sea opaque', () => {
    const edge = shoreWaterAlphaAtDistance(0, 1);
    const middle = shoreWaterAlphaAtDistance(DEFAULT_SHORE_WATER_PROFILE.fadeWidth / 2, 1);
    const sea = shoreWaterAlphaAtDistance(DEFAULT_SHORE_WATER_PROFILE.fadeWidth, 1);
    expect(edge).toBe(DEFAULT_SHORE_WATER_PROFILE.edgeOpacity);
    expect(middle).toBeCloseTo((edge + 1) / 2);
    expect(sea).toBe(1);
    expect(shoreWaterAlphaAtDistance(100, 1)).toBe(1);
  });

  it('does not replace the independently computed island cutout', () => {
    expect(shoreWaterAlphaAtDistance(0, 0)).toBe(0);
    expect(shoreWaterAlphaAtDistance(0, 0.5)).toBeCloseTo(0.36);
    expect(shoreWaterAlphaAtDistance(0, 0.5, DEFAULT_SHORE_WATER_PROFILE, false)).toBe(0.5);
  });

  it('rejects invalid distance and fade settings', () => {
    expect(() => shoreWaterAlphaAtDistance(Number.NaN, 1)).toThrow('INVALID_SHORE_WATER_PROFILE');
    expect(() => shoreWaterAlphaAtDistance(1, 1, { ...DEFAULT_SHORE_WATER_PROFILE, fadeWidth: 0 })).toThrow();
  });
});
