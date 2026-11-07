/** Pure presentation defaults shared by shader setup and scene diagnostics. */
export interface ShoreWaterProfile {
  /** Water opacity at the shoreline; open sea always returns to opacity 1. */
  edgeOpacity: number;
  /** World-space distance from the coastline over which opacity recovers. */
  fadeWidth: number;
  /** Optional subtle blend toward the existing shallow water color. */
  tintStrength: number;
}

export const DEFAULT_SHORE_WATER_PROFILE: Readonly<ShoreWaterProfile> = {
  edgeOpacity: 0.72,
  fadeWidth: 1.4,
  tintStrength: 0.06
};

/**
 * CPU reference for the GLSL shoreline alpha transition.
 * Visibility is the independent land-cutout alpha supplied by the SDF mask.
 */
export function shoreWaterAlphaAtDistance(
  signedDistance: number,
  landVisibility: number,
  profile: ShoreWaterProfile = DEFAULT_SHORE_WATER_PROFILE,
  enabled = true
): number {
  if (![signedDistance, landVisibility, profile.edgeOpacity, profile.fadeWidth, profile.tintStrength].every(Number.isFinite) || profile.fadeWidth <= 0) {
    throw new Error('INVALID_SHORE_WATER_PROFILE');
  }
  const visibility = Math.max(0, Math.min(1, landVisibility));
  if (!enabled) return visibility;
  const x = Math.max(0, Math.min(1, Math.max(0, signedDistance) / profile.fadeWidth));
  const farWeight = x * x * (3 - 2 * x);
  const edgeOpacity = Math.max(0, Math.min(1, profile.edgeOpacity));
  return visibility * (edgeOpacity + (1 - edgeOpacity) * farWeight);
}
