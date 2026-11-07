/** PMO-native proposed gameplay layout. PMO owns positions, Core owns services. */
import type { NormalWaveNeedId } from '../../core/state';
import type { SpatialPoint, SpatialRegistry } from './registry';
import { getSpatialSnapshot, validateSpatialRegistry } from './registry';
import { readPmoWalkAuthorization, resolvePmoEntityBindings, inventoryPmoBuildingSites } from './pmoWorldBindings';
import authored from '../../../semantic/evidence/pmo/registry-authored-2026-10-21.json';

/** Gameplay-layout assignment, NOT author-supplied semantic labels on building PMOs.
 * Stable IDs do not change if the editor renames a site or moves its authored anchor.
 * Stage one: beach services occupy first tier; view service uses upper plateau.
 */
export const GAMEPLAY_SITE_ASSIGNMENTS: Record<NormalWaveNeedId, string> = {
  reception: 'pmo-519d1658-cfbc-46da-829a-9fa14366c789', // building_1
  food: 'pmo-5570d5ee-3a4d-41aa-abcc-f44be507d694',      // building_2
  drinks: 'pmo-0e856759-fe15-4241-bb2a-46cfbc64a5c4',    // building_3
  relax: 'pmo-1212f1c6-6012-415b-abd4-7f8dc8751f0a',     // building_4
  oceanView: 'pmo-0a36f1a4-c8de-440d-acae-0fe8240b6325' // building_6
};

export interface PmoServiceSite {
  pmoId: string;
  center: SpatialPoint;
  /** Existing authored walkability stamp rather than old entrance coordinate. */
  entrance: SpatialPoint;
  queue: SpatialPoint;
  embedded: boolean;
  sourceWalkPmoId: string;
}
export interface PmoServiceLayoutResult {
  services: Partial<Record<NormalWaveNeedId, PmoServiceSite>>;
  errors: string[];
  authority: 'live-registry' | 'authored-snapshot';
}

/** Live browser authoring wins in normal gameplay. The DEV pathfinding route
 * explicitly pins the committed PMO snapshot instead of browser storage.
 * An empty brand-new browser uses the
 * immutable exact exported PMO snapshot; a partially edited live registry never
 * silently falls back to older coordinates or restores deleted objects. */
/** The DEV pathfinding route never consumes a browser-editable PMO or a user-pasted
 * export. It reads the committed 2026-10-21 authority shipped with RRH and
 * compiles it through the very same production NavigationScope as the game.
 * This is not a second handwritten registry or a new navigation graph.
 */
const canonicalPmo = validateSpatialRegistry(authored);
export function getCanonicalPmoForPathfinding(): SpatialRegistry {
  if (inventoryPmoBuildingSites(canonicalPmo).length !== 9 ||
      !canonicalPmo.objects.some(o => o.name === 'zone_pawns_can_move'))
    throw new Error('PMO_CANONICAL_AUTHORITY_INCOMPLETE');
  return canonicalPmo;
}
export function getPublishedPmoRegistry(): { registry: SpatialRegistry; authority: PmoServiceLayoutResult['authority'] } {
  if (typeof window !== 'undefined' && /^\/pathfinding-test\/?$/.test(window.location.pathname)) {
    return {registry:getCanonicalPmoForPathfinding(),authority:'authored-snapshot'};
  }
  const live = getSpatialSnapshot().registry;
  if (live.objects.length) return { registry: live, authority: 'live-registry' };
  return { registry: validateSpatialRegistry(authored), authority: 'authored-snapshot' };
}

/** This is an explicit layout policy, not implicit spatial identity matching.
 * Routes still require separate graph connectivity/terrain validation. */
export function resolvePmoServiceLayout(
  registry: SpatialRegistry,
  assignments: Record<NormalWaveNeedId, string> = GAMEPLAY_SITE_ASSIGNMENTS,
  authority: PmoServiceLayoutResult['authority'] = 'live-registry'
): PmoServiceLayoutResult {
  const entries = Object.entries(assignments) as [NormalWaveNeedId, string][];
  const result = resolvePmoEntityBindings(registry, entries.map(([key, pmoId]) => ({ coreKey: key, pmoId })));
  const stamps = readPmoWalkAuthorization(registry);
  const services: PmoServiceLayoutResult['services'] = {};
  const errors = result.issues.map(x => `${x.coreKey}:${x.pmoId}:${x.code}`);
  const occupied = new Set<string>();
 // Reserve physical walk positions, not their shared PMO paint object ID.
 const reservedEntranceKeys = new Set<string>();
  for (const [key, pmoId] of entries) {
    if (occupied.has(pmoId)) { errors.push(`${key}:DUPLICATE_SITE:${pmoId}`); continue; }
    occupied.add(pmoId);
    const placement = result.placements[key];
    if (!placement) continue;
    const [x, y, z] = placement.position;
    const nearby = stamps.map(s => ({
      stamp: s,
      distance: Math.hypot(s.center[0] - x, s.center[2] - z),
      height: Math.abs(s.center[1] - y)
    })).filter(q => q.distance >= 0.48 && q.distance <= 1.6 && q.height <= 0.12)
      .sort((a, b) => a.distance - b.distance);
    if (!nearby.length) { errors.push(`${key}:NO_AUTHORED_WALK_APPROACH:${pmoId}`); continue; }
    const approach = nearby.map(candidate => candidate.stamp).find(stamp =>
   !reservedEntranceKeys.has(JSON.stringify(stamp.center)));
 if (!approach) { errors.push(`${key}:NO_DISTINCT_AUTHORED_WALK_APPROACH:${pmoId}`); continue; }
 reservedEntranceKeys.add(JSON.stringify(approach.center));
    const at: SpatialPoint = [...approach.center];
    services[key] = {
      pmoId, center: [...placement.position], entrance: at,
      queue: [...at], sourceWalkPmoId: approach.sourceId,
      embedded: key === 'reception' || key === 'relax' || key === 'oceanView'
    };
  }
  return { services, errors, authority };
}
