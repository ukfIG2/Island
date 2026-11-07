/**
 * Spatial entity bindings for Resort Empire.
 *
 * PMO authored coordinates are world-placement authority. Core still owns game
 * entity state. This module is read-only: it neither changes a registry nor
 * places gameplay objects by proximity to legacy world anchors.
 */
import type { SpatialRegistry, SpatialMetaObject, SpatialPoint } from './registry';

export type PmoObjectId = string;
export type CoreSpatialKey = string;
export interface PmoEntityBinding {
  /** Stable gameplay identity, e.g. service:reception or worker:<id>. */
  coreKey: CoreSpatialKey;
  /** Existing PMO object ID; never a world position or approximate name. */
  pmoId: PmoObjectId;
  /** Optional named port within metadata.spatial.ports. */
  portId?: string;
}
export interface PmoPlacement {
  coreKey: CoreSpatialKey;
  pmoId: PmoObjectId;
  /** Authoritative world position read directly from the PMO. */
  position: SpatialPoint;
  /** Port identity, when resolved, not an independently maintained offset. */
  portId?: string;
  pmoRevision: number;
}
export type PmoBindingIssueCode = 'MISSING_PMO' | 'NO_PLACEMENT' | 'AMBIGUOUS_PLACEMENT' | 'MISSING_PORT' | 'BAD_PORT' | 'DUPLICATE_CORE_KEY';
export interface PmoBindingIssue { coreKey: string; pmoId: string; code: PmoBindingIssueCode }
export interface PmoBindingResolution { placements: Record<string, PmoPlacement>; issues: PmoBindingIssue[] }

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const point = (value: unknown): value is SpatialPoint =>
  Array.isArray(value) && value.length === 3 && value.every(v => typeof v === 'number' && Number.isFinite(v));
function spatial(obj: SpatialMetaObject): Record<string, unknown> {
  return record(obj.metadata.spatial) ? obj.metadata.spatial : {};
}
/** Explicit author metadata wins. A unique skeleton point is an existing author-defined placement. */
function resolveAnchor(obj: SpatialMetaObject): SpatialPoint | PmoBindingIssueCode {
  const meta = spatial(obj);
  if (obj.geometry.type !== 'skeleton') return 'NO_PLACEMENT';
  const anchorId = meta.anchorPointId;
  if (typeof anchorId === 'string') {
    const p = obj.geometry.points[anchorId];
    return p ? [...p] : 'NO_PLACEMENT';
  }
  const values = Object.values(obj.geometry.points);
  if (values.length === 1) return [...values[0]];
  return values.length > 1 ? 'AMBIGUOUS_PLACEMENT' : 'NO_PLACEMENT';
}
/** No fallbacks to old hardcoded coordinates, no nearest-PMO matching. */
export function resolvePmoEntityBindings(registry: SpatialRegistry, bindings: readonly PmoEntityBinding[]): PmoBindingResolution {
  if (registry.schemaVersion !== 1 || registry.coordinateSpace !== 'world') throw new Error('Unsupported PMO registry');
  const byId = new Map(registry.objects.map(obj => [obj.id, obj]));
  const placements: Record<string, PmoPlacement> = {};
  const issues: PmoBindingIssue[] = [];
  const seen = new Set<string>();
  for (const binding of bindings) {
    if (seen.has(binding.coreKey)) {
      delete placements[binding.coreKey];
      issues.push({coreKey:binding.coreKey,pmoId:binding.pmoId,code:'DUPLICATE_CORE_KEY'});
      continue;
    }
    seen.add(binding.coreKey);
    const obj = byId.get(binding.pmoId);
    if (!obj) { issues.push({coreKey:binding.coreKey,pmoId:binding.pmoId,code:'MISSING_PMO'}); continue; }
    let position: SpatialPoint | PmoBindingIssueCode;
    if (binding.portId !== undefined) {
      const ports = spatial(obj).ports;
      if (!record(ports) || !(binding.portId in ports)) position = 'MISSING_PORT';
      else { const port = ports[binding.portId]; position = point(port) ? [...port] : 'BAD_PORT'; }
    } else position = resolveAnchor(obj);
    if (typeof position === 'string') {
      issues.push({coreKey:binding.coreKey,pmoId:binding.pmoId,code:position});
      continue;
    }
    placements[binding.coreKey] = {coreKey:binding.coreKey,pmoId:obj.id,position,portId:binding.portId,pmoRevision:obj.revision};
  }
  return {placements,issues};
}

export interface PmoWalkStamp { center: SpatialPoint; radius: number; sourceId: string }
/** Only explicitly marked traversable PMO paint; never interpret green areas as walkable by color. */
export function readPmoWalkAuthorization(registry: SpatialRegistry): PmoWalkStamp[] {
  const stamps: PmoWalkStamp[] = [];
  for (const obj of registry.objects) {
    const nav = record(obj.metadata.navigation) ? obj.metadata.navigation : {};
    if (obj.geometry.type !== 'paint' || nav.walkable === false || nav.blocked === true) continue;
    if (nav.walkable !== true && obj.name !== 'zone_pawns_can_move') continue;
    for (const stroke of obj.geometry.strokes) for (const p of stroke.points) {
      stamps.push({center:[...p],radius:stroke.radius,sourceId:obj.id});
    }
  }
  return stamps;
}
/** A paint membership check is NOT proof of collision-free movement between two stamps. */
export function isPmoPaintAuthorized(stamps: readonly PmoWalkStamp[], p: SpatialPoint, toleranceY = 0.52): boolean {
  return stamps.some(s => Math.hypot(s.center[0]-p[0],s.center[2]-p[2]) <= s.radius &&
    Math.abs(s.center[1]-p[1]) <= toleranceY);
}
/** Exportable site inventory, but the runtime resolves identity by ID, never by sequential name. */
export function inventoryPmoBuildingSites(registry: SpatialRegistry): Array<{id:string; name:string; anchor: SpatialPoint}> {
  return registry.objects.flatMap(obj => {
    if (!/^building_\d+$/.test(obj.name)) return [];
    const anchor = resolveAnchor(obj);
    return typeof anchor === 'string' ? [] : [{id:obj.id,name:obj.name,anchor}];
  });
}
