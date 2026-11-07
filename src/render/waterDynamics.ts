/**
 * Resort Empire — presentation-only water behavior parameters.
 * Does NOT replace existing ResortOcean shader or modify gameplay authority.
 * The `calm` preset is a neutral transform of the CURRENT ocean shader:
 * all original multipliers remain 1; every supplemental effect remains 0.
 */
export interface WaterMotionParameters {
  /** Scales the height of waves already produced by the current ocean shader. */
  waveHeightScale: number;
  /** Scales the spatial frequency of waves in the existing shader. */
  waveFrequencyScale: number;
  /** Advances wave phase faster/slower; use an accumulated phase, not time * speed. */
  waveSpeedScale: number;
  /** Additional high-frequency wind chop, independent of existing waves. */
  chopStrength: number;
  /** Additional broad, low-frequency swell. */
  swellStrength: number;
  /** Additional crest foam; 0 leaves existing foam exactly as it is. */
  foamStrength: number;
  /** Multiplier of existing moving glints, 1 retains the existing appearance. */
  shimmerScale: number;
  /** Direction for ADDITIONAL motion layers, not an absolute camera/world rotation. */
  directionRadians: number;
}

/** Deliberately provisional look-development values; not canonical gameplay tuning. */
export const WATER_MOTION_PRESETS = {
  calm: {
    waveHeightScale: 1, waveFrequencyScale: 1, waveSpeedScale: 1,
    chopStrength: 0, swellStrength: 0, foamStrength: 0,
    shimmerScale: 1, directionRadians: 0
  },
  breeze: {
    waveHeightScale: 1.18, waveFrequencyScale: 1.08, waveSpeedScale: 1.1,
    chopStrength: 0.15, swellStrength: 0.05, foamStrength: 0.04,
    shimmerScale: 1.06, directionRadians: 0.3
  },
  swell: {
    waveHeightScale: 1.22, waveFrequencyScale: 0.85, waveSpeedScale: 0.8,
    chopStrength: 0.04, swellStrength: 0.62, foamStrength: 0.1,
    shimmerScale: 0.95, directionRadians: 1.1
  },
  windy: {
    waveHeightScale: 1.55, waveFrequencyScale: 1.35, waveSpeedScale: 1.4,
    chopStrength: 0.58, swellStrength: 0.15, foamStrength: 0.32,
    shimmerScale: 1.15, directionRadians: -0.6
  },
  rough: {
    waveHeightScale: 2.0, waveFrequencyScale: 1.4, waveSpeedScale: 1.55,
    chopStrength: 0.85, swellStrength: 0.85, foamStrength: 0.7,
    shimmerScale: 0.8, directionRadians: -0.9
  }
} as const satisfies Record<string, WaterMotionParameters>;

export type WaterMotionPreset = keyof typeof WATER_MOTION_PRESETS;
export type WaterMotionSelection = WaterMotionPreset | 'custom';

const LIMITS = {
  waveHeightScale: [0.5, 3],
  waveFrequencyScale: [0.5, 2.5],
  waveSpeedScale: [0.4, 2.5],
  chopStrength: [0, 1.5],
  swellStrength: [0, 1.5],
  foamStrength: [0, 1],
  shimmerScale: [0.35, 1.65],
  directionRadians: [-Math.PI, Math.PI]
} as const satisfies Record<keyof WaterMotionParameters, readonly [number, number]>;

const KEYS = Object.keys(LIMITS) as (keyof WaterMotionParameters)[];
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const angleDelta = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const wrapAngle = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));
const easing = (t: number) => t * t * (3 - 2 * t);

export function validateWaterMotion(input: WaterMotionParameters): WaterMotionParameters {
  const out = {} as Record<keyof WaterMotionParameters, number>;
  for (const key of KEYS) {
    const value = input[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`INVALID_WATER_MOTION_PARAMETER:${key}`);
    }
    const [min, max] = LIMITS[key];
    out[key] = clamp(value, min, max);
  }
  out.directionRadians = wrapAngle(out.directionRadians);
  return out;
}

/**
 * One mutable controller per Ocean instance; drive only from R3F useFrame(delta).
 * Stable `.values` identity permits updating existing shader uniforms without
 * triggering React renders, geometry rebuilding or game-core state changes.
 */
export class WaterMotionController {
  readonly values: WaterMotionParameters;
  phaseSeconds: number;
  selection: WaterMotionSelection = 'calm';

  private from: WaterMotionParameters;
  private target: WaterMotionParameters;
  private elapsed = 0;
  private duration = 0;

  constructor(initialPhaseSeconds = 0) {
    if (!Number.isFinite(initialPhaseSeconds) || initialPhaseSeconds < 0) {
      throw new Error('INVALID_WATER_INITIAL_PHASE');
    }
    this.values = { ...WATER_MOTION_PRESETS.calm };
    this.from = { ...this.values };
    this.target = { ...this.values };
    this.phaseSeconds = initialPhaseSeconds;
  }

  usePreset(name: WaterMotionPreset, transitionSeconds = 3.5): void {
    this.retarget(WATER_MOTION_PRESETS[name], transitionSeconds);
    this.selection = name;
  }

  useCustom(overrides: Partial<WaterMotionParameters>, transitionSeconds = 3.5): void {
    // Custom sliders inherit CURRENT target, not calm: untouched knobs remain steady.
    this.retarget({ ...this.target, ...overrides }, transitionSeconds);
    this.selection = 'custom';
  }

  private retarget(next: WaterMotionParameters, seconds: number): void {
    if (!Number.isFinite(seconds) || seconds < 0) {
      throw new Error('INVALID_WATER_TRANSITION_DURATION');
    }
    const safe = validateWaterMotion(next);
    this.from = { ...this.values };
    this.target = safe;
    this.elapsed = 0;
    this.duration = seconds;
    if (seconds === 0) this.interpolate(1);
  }

  /** Safe while a tab is paused; no giant phase jump when rendering resumes. */
  tick(deltaSeconds: number): WaterMotionParameters {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
      throw new Error('INVALID_WATER_FRAME_DELTA');
    }
    const dt = Math.min(deltaSeconds, 0.25);
    if (this.elapsed < this.duration) {
      this.elapsed = Math.min(this.duration, this.elapsed + dt);
      this.interpolate(easing(this.elapsed / this.duration));
    }
    this.phaseSeconds += dt * this.values.waveSpeedScale;
    return this.values;
  }

  private interpolate(t: number): void {
    // Snap to exact target values at completion. Trigonometric angle wrapping
    // otherwise leaves tiny residuals (e.g. 3.47e-18 instead of zero).
    if (t >= 1) {
      for (const key of KEYS) this.values[key] = this.target[key];
      return;
    }
    for (const key of KEYS) {
      if (key === 'directionRadians') continue;
      this.values[key] = this.from[key] + (this.target[key] - this.from[key]) * t;
    }
    this.values.directionRadians = wrapAngle(
      this.from.directionRadians + angleDelta(this.from.directionRadians, this.target.directionRadians) * t
    );
  }
}
