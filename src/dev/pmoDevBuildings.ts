/**
 * RRH dev-only layout over existing PMO building zones.
 * A building occupies its author-positioned site; a pedestrian stops at a
 * separately certified walking approach. No route is invented to the building
 * center, which may be deliberately outside walkable paint.
 */
import {
  type BrushGraph, type PmoTerrainConnector, type SpatialPoint,
  planBrushCorridorRoute, type RouteFailure,
} from '../render/spatialMeta/pmoBrushCorridors';

export const TEST_BUILDING_NAMES = ['Reception', 'Food', 'Drinks', 'Relax', 'Ocean View'] as const;
export type TestBuildingName = typeof TEST_BUILDING_NAMES[number];

export interface TestBuilding {
  readonly id: string;
  readonly pmoSiteId: string;
  readonly pmoSiteName: string;
  readonly name: TestBuildingName;
  /** Exact PMO building_* skeleton anchor, NOT a paint-stroke center. */
  readonly position: SpatialPoint;
  /** Certified route endpoint within existing PMO pedestrian paint. */
  readonly arrivalPoint: SpatialPoint | null;
  readonly siteIndex: number;
  readonly anchorNodeId: number;
  readonly routeStatus: 'READY' | RouteFailure;
  readonly routePointCount: number;
  readonly routeDistance: number | null;
  readonly routePoints: readonly SpatialPoint[];
  readonly routeUsesHelpers: number;
}
export interface BuildingScenario {
  readonly seed: number;
  readonly entryPoint: SpatialPoint;
  readonly beachAttachmentCertified: boolean;
  readonly distanceToAuthoredBeachEnd: number;
  readonly buildings: readonly TestBuilding[];
  readonly failures: readonly string[];
  readonly stats: {
    readonly authoredSiteCount: number;
    readonly sitesWithWalkApproach: number;
    readonly walkNodeCount: number;
    readonly reachableBuildings: number;
    readonly unreachableBuildings: number;
  };
}

export function seededRandom(seed: number): () => number {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw Error('PMO_DEV_BAD_SEED');
  let state = (seed >>> 0) || 0x9e3779b9;
  return () => {
    state ^= (state << 13);
    state ^= (state >>> 17);
    state ^= (state << 5);
    state >>>= 0;
    return state / 0x100000000;
  };
}
export function seedFromUrl(search: string, newSeed: () => number): number {
  const query = new URLSearchParams(search);
  const raw = query.get('seed');
  if (raw === null) return newSeed() >>> 0;
  if (!/^\d{1,10}$/.test(raw) || Number(raw) > 0xffffffff) throw Error('PMO_DEV_BAD_QUERY_SEED');
  return Number(raw) >>> 0;
}
const horizontal = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const distance = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const finite = (p: readonly number[]) => p.length === 3 && p.every(Number.isFinite);

/** Component membership is an optimization, never an alternative route certificate. */
function connectedTo(graph: BrushGraph, entryId: number): Set<number> {
  const seen = new Set<number>([entryId]), queue = [entryId];
  for (let head = 0; head < queue.length; head++) {
    for (const edge of graph.neighbors[queue[head]]) {
      if (!seen.has(edge.to)) { seen.add(edge.to); queue.push(edge.to); }
    }
  }
  return seen;
}

export interface CanonicalPmoBuildingSite {
  readonly id: string;
  readonly name: string;
  readonly anchor: SpatialPoint;
}
interface SiteCandidate {
  index: number;
  id: string;
  name: string;
  center: SpatialPoint;
  near: readonly number[];
  reachable: readonly number[];
}

/** Candidate approaches follow RRH's real PMO layout contract (0.48–1.6m
 *  horizontal, <=0.12m vertical); they are not "building coordinates". */
function inventorySites(graph: BrushGraph, positions: readonly CanonicalPmoBuildingSite[], component: Set<number>): SiteCandidate[] {
  return positions.map((site, index) => {
    const center = site.anchor;
    const near = graph.nodes.filter(node => {
      const dx = horizontal(node.point, center);
      return dx >= 0.48 - 1e-8 && dx <= 1.6 + 1e-8 && Math.abs(node.point[1] - center[1]) <= 0.12;
    }).sort((a, b) => horizontal(a.point, center) - horizontal(b.point, center));
    return {
      index, id:site.id, name:site.name, center: [...center],
      near: near.map(n => n.id),
      reachable: near.filter(n => component.has(n.id)).map(n => n.id),
    };
  });
}

export function generatePmoDevBuildings(
  graph: BrushGraph,
  connector: PmoTerrainConnector,
  seed: number,
  options: {
    readonly desiredEntry?: SpatialPoint;
    readonly minBuildingSpacing?: number;
    readonly jitterRadius?: number; // Deprecated; authored PMO centers are not jittered.
    readonly labels?: readonly TestBuildingName[];
    readonly requireReachable?: boolean;
    readonly allowedSites?: readonly CanonicalPmoBuildingSite[];
  } = {},
): BuildingScenario {
  const random = seededRandom(seed);
  const labels = options.labels ?? TEST_BUILDING_NAMES;
  const spacing = options.minBuildingSpacing ?? 0.65;
  if (!Number.isFinite(spacing) || spacing <= 0) throw Error('PMO_DEV_UNSAFE_PLACEMENT_OPTIONS');
  if (!graph.nodes.length) throw Error('PMO_DEV_NO_WALKABLE_NODE');
  if (!options.allowedSites?.length || options.allowedSites.some(site =>
    !site.id || !/^building_\d+$/.test(site.name) || !finite(site.anchor)) ||
    new Set(options.allowedSites.map(site=>site.id)).size !== options.allowedSites.length)
    throw Error('PMO_DEV_AUTHORED_BUILDING_SITES_REQUIRED');
  const zones = options.allowedSites;
  if (zones.length < labels.length) throw Error(`PMO_DEV_NOT_ENOUGH_AUTHORED_ZONES:${zones.length}/${labels.length}`);

  const foot = options.desiredEntry ?? [1.6739, -2.2456, 4.5734];
  const entry = [...graph.nodes].sort((a, b) => distance(a.point, foot) - distance(b.point, foot))[0];
  const component = connectedTo(graph, entry.id);
  const inventory = inventorySites(graph, zones, component);
  const failures: string[] = [];

  // Shuffle all PMO sites first. Prefer valid beach-connected approaches but
  // keep inaccessible authored sites visible if fewer than five are certified.
  // There is no probabilistic retry exhaustion or demand for a walking node
  // inside the building's actual footprint.
  const shuffled = [...inventory];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  // No availability-biased sort: every one of the 9 authored sites is selectable.
  // An unreachable selection remains VISIBLE and explicitly BLOCKED, not erased.

  const selected: SiteCandidate[] = [];
  for (const site of shuffled) {
    if (selected.some(other => horizontal(other.center, site.center) < spacing &&
      Math.abs(other.center[1] - site.center[1]) < 0.6)) continue;
    selected.push(site);
    if (selected.length === labels.length) break;
  }
  if (selected.length !== labels.length) {
    throw Error(`PMO_DEV_AUTHORED_SITE_COLLISION:${selected.length}/${labels.length}`);
  }

  const buildings: TestBuilding[] = selected.map((site, i) => {
    const label = labels[i];
    // A non-reachable approach may be used only to demonstrate an explicit
    // blocked route, never to move a pedestrian.
    const choices = site.reachable.length ? site.reachable : site.near;
    let route: ReturnType<typeof planBrushCorridorRoute> = {
      status: 'UNAUTHORIZED_ENDPOINT', reason: 'NO_AUTHORED_WALK_APPROACH',
    };
    let approach: SpatialPoint | null = null;
    let nodeId = -1;
    for (const id of choices.slice(0, 10)) {
      const node = graph.nodes[id];
      const attempt = planBrushCorridorRoute(graph, connector, entry.point, node.point);
      if (!approach || attempt.status === 'READY') {
        approach = [...node.point]; nodeId = id; route = attempt;
      }
      if (attempt.status === 'READY') break;
    }
    if (route.status !== 'READY') failures.push(`SITE_${site.index + 1}:${label}:${route.reason}`);
    return {
      id: `dev-${label.toLowerCase().replace(/\s+/g, '-')}`,
      pmoSiteId:site.id,pmoSiteName:site.name,
      name: label, position: [...site.center], arrivalPoint: approach,
      siteIndex: site.index, anchorNodeId: nodeId, routeStatus: route.status,
      routePointCount: route.status === 'READY' ? route.points.length : 0,
      routeDistance: route.status === 'READY' ? route.distance : null,
      routePoints: route.status === 'READY' ? route.points : [],
      routeUsesHelpers: route.status === 'READY' ? route.steps.filter(s => s.kind !== 'walk').length : 0,
    };
  });
  const beachDistance = distance(entry.point, foot);
  const withinFootprint = graph.stamps.some(s => horizontal(s.center, foot) <= s.radius &&
    Math.abs(s.center[1] - foot[1]) <= graph.rules.paintHeightTolerance);
  const beachAttachmentCertified = beachDistance <= 0.25 && withinFootprint &&
    connector.verify(foot, entry.point) && connector.verify(entry.point, foot);
  return {
    seed: seed >>> 0, entryPoint: [...entry.point], beachAttachmentCertified,
    distanceToAuthoredBeachEnd: beachDistance, buildings, failures,
    stats: {
      authoredSiteCount: inventory.length,
      sitesWithWalkApproach: inventory.filter(s => s.near.length > 0).length,
      walkNodeCount: graph.nodes.length,
      reachableBuildings: buildings.filter(b => b.routeStatus === 'READY').length,
      unreachableBuildings: buildings.filter(b => b.routeStatus !== 'READY').length,
    },
  };
}

/** Nine-site health is independent of the five randomly assigned service buildings. */
export function auditPmoBuildingSiteReachability(graph:BrushGraph,connector:PmoTerrainConnector,
  beach:SpatialPoint,sites:readonly CanonicalPmoBuildingSite[]){
  const entry=[...graph.nodes].sort((a,b)=>distance(a.point,beach)-distance(b.point,beach))[0];
  if(!entry)return sites.map(site=>({id:site.id,name:site.name,reachable:false,reason:'EMPTY_COMPILED_GRAPH'}));
  const component=connectedTo(graph,entry.id);
  return inventorySites(graph,sites,component).map(site=>{
    if(!site.near.length)return {id:site.id,name:site.name,reachable:false,reason:'NO_PMO_WALK_APPROACH'};
    if(!site.reachable.length)return {id:site.id,name:site.name,reachable:false,reason:'NO_BEACH_COMPONENT_CONNECTION'};
    for(const id of site.reachable.slice(0,10)){
      const route=planBrushCorridorRoute(graph,connector,entry.point,graph.nodes[id].point);
      if(route.status==='READY')return {id:site.id,name:site.name,reachable:true,reason:'READY'};
    }
    return {id:site.id,name:site.name,reachable:false,reason:'NO_CERTIFIED_ENDPOINT_ROUTE'};
  });
}
