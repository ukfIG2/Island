/** Derived navigation surfaces must not cross an occupied construction footprint.
 * In particular, the authored place 3 -> 8 bridge has a tight approach next
 * to building_3.  The terrain mesh alone cannot detect a movable building.
 * These circles are conservative DEV placement envelopes, not new PMO sites.
 */
import type { SpatialPoint } from './registry';

export function planarDistanceToSegment(
  center: SpatialPoint, a: SpatialPoint, b: SpatialPoint,
): number {
  const dx=b[0]-a[0], dz=b[2]-a[2];
  const d=dx*dx+dz*dz;
  const t=d<1e-12?0:Math.max(0,Math.min(1,
    ((center[0]-a[0])*dx+(center[2]-a[2])*dz)/d));
  return Math.hypot(center[0]-a[0]-t*dx,center[2]-a[2]-t*dz);
}

export function avoidsBuildingFootprint(
  a:SpatialPoint,b:SpatialPoint,building:SpatialPoint,
  clearance=0.31,
):boolean {
  // Same-level only: a deck far above/below a building does not hit its volume.
  const upper=Math.max(a[1],b[1]),lower=Math.min(a[1],b[1]);
  if(upper<building[1]-0.08||lower>building[1]+0.75)return true;
  return planarDistanceToSegment(building,a,b)>=clearance;
}
