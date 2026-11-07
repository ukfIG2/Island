export type GuestMotionStage = 'queue' | 'active' | 'served';

/** Preserve legacy queue motion; allow active PMO arrival only on a certified route. */
export function guestShouldTraverseArrivalRoute(stage: GuestMotionStage, pmoEnabled: boolean, routePointCount: number): boolean {
  return pmoEnabled ? routePointCount >= 2 && (stage === 'queue' || stage === 'active') : stage === 'queue';
}
