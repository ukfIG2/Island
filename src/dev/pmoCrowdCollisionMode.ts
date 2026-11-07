/** DEV crowd-only A/B experiment. Disabled by default, opt back in using ?crowdCollision=on.
 * This changes only pedestrian-to-pedestrian spacing; terrain and lift checks remain enabled. */
export function crowdCollisionSpacing(search = ''): number {
  return new URLSearchParams(search).get('crowdCollision') === 'on' ? 0.085 : 0;
}
