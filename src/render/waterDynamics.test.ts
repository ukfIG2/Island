import { describe, expect, it } from 'vitest';
import { WATER_MOTION_PRESETS, WaterMotionController, validateWaterMotion } from './waterDynamics';

describe('water presentation-only motion foundation', () => {
  it('keeps original ocean neutral in the current calm preset', () => {
    const c = new WaterMotionController();
    expect(c.values).toEqual(WATER_MOTION_PRESETS.calm);
    expect(c.values.waveHeightScale).toBe(1);
    expect(c.values.waveFrequencyScale).toBe(1);
    expect(c.values.waveSpeedScale).toBe(1);
    expect(c.values.chopStrength + c.values.swellStrength + c.values.foamStrength).toBe(0);
  });

  it('smoothly changes state without reassigning the values object', () => {
    const c = new WaterMotionController();
    const ref = c.values;
    c.usePreset('rough', 2);
    c.tick(0.25);
    expect(c.values).toBe(ref);
    expect(c.values.waveHeightScale).toBeGreaterThan(1);
    expect(c.values.waveHeightScale).toBeLessThan(WATER_MOTION_PRESETS.rough.waveHeightScale);
    for (let i = 0; i < 7; i++) c.tick(0.25);
    expect(c.values.waveHeightScale).toBe(WATER_MOTION_PRESETS.rough.waveHeightScale);
  });

  it('keeps accumulated phase continuous while speed changes', () => {
    const c = new WaterMotionController(14);
    c.usePreset('windy', 0);
    const phase = c.phaseSeconds;
    c.tick(0.1);
    expect(c.phaseSeconds - phase).toBeCloseTo(0.14);
  });

  it('supports retargeting mid-transition and can return to the exact calm preset', () => {
    const c = new WaterMotionController();
    c.usePreset('rough', 2);
    c.tick(0.2);
    const before = c.values.waveHeightScale;
    c.usePreset('calm', 0.5);
    expect(c.values.waveHeightScale).toBe(before);
    c.tick(0.25);
    c.tick(0.25);
    expect(c.values).toEqual(WATER_MOTION_PRESETS.calm);
  });

  it('validates custom inputs and rejects nonfinite frame/time values', () => {
    const c = new WaterMotionController();
    expect(() => c.tick(-1)).toThrow('INVALID_WATER_FRAME_DELTA');
    expect(() => c.useCustom({ foamStrength: Number.NaN })).toThrow('INVALID_WATER_MOTION_PARAMETER:foamStrength');
    expect(() => c.usePreset('breeze', Number.POSITIVE_INFINITY)).toThrow('INVALID_WATER_TRANSITION_DURATION');
    expect(validateWaterMotion({ ...WATER_MOTION_PRESETS.calm, foamStrength: 10 }).foamStrength).toBe(1);
  });
});
