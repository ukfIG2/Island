/** Derived spatial navigation projection. The authored SpatialRegistry remains the sole source. */
import type { SpatialRegistry, SpatialPoint, SpatialMetaObject } from './registry';

export type TransitionKind = 'stairs' | 'bridge' | 'lift';
export type NavigationProblem = 'NO_WALKABLE_AREA' | 'NO_TERRAIN_SURFACE' | 'BLOCKED' |
  'PORTAL_UNATTACHED' | 'TRANSITION_UNTYPED' | 'INVALID_TRANSITION' | 'UNREACHABLE';

export interface TerrainProjector {
  /** Exact island terrain hit near this coordinate (never ocean/other scene meshes). Null = no trustworthy surface. */
  project(x: number, z: number, nearY: number): SpatialPoint | null;
}
export interface NavigationOptions {
  /** Grid sampling density. Smaller values cost more time and memory. */
  sampleStep?: number;
  /** Maximum allowed height difference between the sampled surface and author paint. */
  paintToleranceY?: number;
  /** Maximum grade of ordinary walking; special transition edges ignore this. */
  maxGrade?: number;
  /** Maximum absolute vertical jump on a single sampled walking segment. */
  maxStepHeight?: number;
  /** Maximum portal-to-walkable node attachment distance (horizontal). */
  portalSnapRadius?: number;
  /** If true, typed transition metadata is mandatory; legacy name guessing never applies. */
  strictTransitionTypes?: boolean;
}
export interface NavNode {
  id: string;
  position: SpatialPoint;
  sourceId: string;
  role: 'walk' | 'portal';
}
export interface NavEdge {
  to: string;
  cost: number;
  mode: 'walk' | TransitionKind;
  sourceId: string;
}
export interface NavIssue {
  code: NavigationProblem;
  message: string;
  sourceId?: string;
}
export interface NavigationGraph {
  nodes: Record<string, NavNode>;
  outgoing: Record<string, NavEdge[]>;
  issues: NavIssue[];
  /** Derived graph schema version, not a cache invalidation revision. */
  schemaVersion: 1;
}
export interface RouteResult {
  found: boolean;
  points: SpatialPoint[];
  nodes: string[];
  edges: NavEdge[];
  totalCost: number | null;
  reason?: NavigationProblem;
}

const DEFAULTS: Required<NavigationOptions> = {
  sampleStep: 0.28, paintToleranceY: 0.52, maxGrade: 0.72,
  maxStepHeight: 0.20, portalSnapRadius: 0.58, strictTransitionTypes: false
};
const hypotXZ = (a: SpatialPoint, b: SpatialPoint) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const dist = (a: SpatialPoint, b: SpatialPoint) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const asObject = (x: unknown): Record<string, unknown> | null =>
  x !== null && typeof x === 'object' && !Array.isArray(x) ? x as Record<string, unknown> : null;
const isPoint = (p: SpatialPoint | null): p is SpatialPoint =>
  !!p && p.length === 3 && p.every(Number.isFinite);

interface PaintStamp { x: number; y: number; z: number; radius: number; sourceId: string }
function stampsOf(obj: SpatialMetaObject): PaintStamp[] {
  if (obj.geometry.type !== 'paint') return [];
  return obj.geometry.strokes.flatMap(stroke => stroke.points.map(([x, y, z]) =>
    ({ x, y, z, radius: stroke.radius, sourceId: obj.id })));
}
function accessFlags(obj: SpatialMetaObject): Record<string, unknown> | null {
  return asObject(obj.metadata.navigation);
}
function classifyTransition(obj: SpatialMetaObject, strict: boolean): TransitionKind | null {
  const declared = accessFlags(obj)?.transition;
  if (declared === 'bridge' || declared === 'stairs' || declared === 'lift') return declared;
  if (strict) return null;
  // Legacy import only. Names never become a permanent closed vocabulary.
  const label = obj.name.toLowerCase();
  if (/\b(bridge|мост)\b/.test(label)) return 'bridge';
  if (/\b(stairs|staircase|лестниц|ступень)/.test(label)) return 'stairs';
  if (/\b(lift|elevator|лифт)\b/.test(label)) return 'lift';
  return null;
}
function isWalk(obj: SpatialMetaObject): boolean {
  const f = accessFlags(obj);
  return f?.walkable === true || (f?.walkable !== false && obj.name === 'zone_pawns_can_move');
}
function isBlock(obj: SpatialMetaObject): boolean {
  const f = accessFlags(obj);
  return f?.blocked === true || f?.collision === 'exclude';
}

/** Read-only, deterministic graph compilation; never edits JSON or creates gameplay state. */
export function compileNavigation(
  registry: SpatialRegistry, terrain: TerrainProjector, options: NavigationOptions = {}
): NavigationGraph {
  const cfg = { ...DEFAULTS, ...options };
  if (!(cfg.sampleStep > 0 && cfg.paintToleranceY > 0 && cfg.maxGrade >= 0 &&
    cfg.maxStepHeight > 0 && cfg.portalSnapRadius > 0)) throw new Error('Bad navigation options');
  const graph: NavigationGraph = { nodes: {}, outgoing: {}, issues: [], schemaVersion: 1 };
  if (registry.schemaVersion !== 1 || registry.coordinateSpace !== 'world') throw new Error('Incompatible spatial registry');
  const walk = registry.objects.filter(isWalk).flatMap(stampsOf);
  const blocked = registry.objects.filter(isBlock).flatMap(stampsOf);
  if (!walk.length) graph.issues.push({ code: 'NO_WALKABLE_AREA', message: 'No authorized walkable paints' });

  // A discrete sample counts only if terrain is hit and lies within a painted three-dimensional footprint.
  const within = (p: SpatialPoint, stamp: PaintStamp) =>
    Math.hypot(p[0] - stamp.x, p[2] - stamp.z) <= stamp.radius + 1e-8 &&
    Math.abs(p[1] - stamp.y) <= cfg.paintToleranceY;
  const allowed = (p: SpatialPoint) => walk.some(s => within(p, s)) && !blocked.some(s => within(p, s));
  const addNode = (node: NavNode) => { graph.nodes[node.id] = node; graph.outgoing[node.id] = []; };
  const addEdge = (a: string, b: string, mode: NavEdge['mode'], sourceId: string, surcharge = 0) => {
    const cost = dist(graph.nodes[a].position, graph.nodes[b].position) + surcharge;
    graph.outgoing[a].push({ to: b, cost, mode, sourceId });
  };
  const unique = new Set<string>();
  for (const [idx, stamp] of walk.entries()) {
    // Quantize into a stable coordinate lattice; multiple strokes may occupy the same sample.
    const startX = Math.ceil((stamp.x - stamp.radius) / cfg.sampleStep);
    const endX = Math.floor((stamp.x + stamp.radius) / cfg.sampleStep);
    const startZ = Math.ceil((stamp.z - stamp.radius) / cfg.sampleStep);
    const endZ = Math.floor((stamp.z + stamp.radius) / cfg.sampleStep);
    for (let xi = startX; xi <= endX; xi++) for (let zi = startZ; zi <= endZ; zi++) {
      const x = xi * cfg.sampleStep, z = zi * cfg.sampleStep;
      if (Math.hypot(x - stamp.x, z - stamp.z) > stamp.radius + 1e-8) continue;
      const pt = terrain.project(x, z, stamp.y);
      if (!isPoint(pt) || !allowed(pt)) continue;
      const key = `${xi}:${zi}:${Math.round(pt[1] / cfg.maxStepHeight)}`;
      if (unique.has(key)) continue;
      unique.add(key);
      addNode({ id: `walk:${key}`, position: pt, sourceId: stamp.sourceId, role: 'walk' });
    }
    if (idx === 0 && walk.length && !Object.keys(graph.nodes).length) {
      graph.issues.push({ code: 'NO_TERRAIN_SURFACE', message: 'First walk stamp yielded no terrain hits', sourceId: stamp.sourceId });
    }
  }
  // Every ordinary edge is re-sampled. Its interior must remain over painted, unobstructed terrain.
  function safeWalk(a: SpatialPoint, b: SpatialPoint): boolean {
    const len = hypotXZ(a, b);
    if (len < 1e-9) return Math.abs(a[1] - b[1]) < 1e-8;
    const n = Math.ceil(len / (cfg.sampleStep * 0.5));
    let prev = a;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const expectedY = a[1] + (b[1] - a[1]) * t;
      const p = terrain.project(a[0] + (b[0] - a[0]) * t, a[2] + (b[2] - a[2]) * t, expectedY);
      if (!isPoint(p) || !allowed(p)) return false;
      const step = hypotXZ(prev, p);
      const dh = Math.abs(p[1] - prev[1]);
      if (dh > cfg.maxStepHeight + 1e-8 || (step > 1e-8 && dh / step > cfg.maxGrade + 1e-8)) return false;
      prev = p;
    }
    return Math.abs(prev[1] - b[1]) <= cfg.maxStepHeight;
  }
  const walks = Object.values(graph.nodes);
  for (let i = 0; i < walks.length; i++) for (let j = i + 1; j < walks.length; j++) {
    if (hypotXZ(walks[i].position, walks[j].position) > cfg.sampleStep * 1.52) continue;
    if (!safeWalk(walks[i].position, walks[j].position)) continue;
    addEdge(walks[i].id, walks[j].id, 'walk', walks[i].sourceId);
    addEdge(walks[j].id, walks[i].id, 'walk', walks[j].sourceId);
  }

  for (const obj of registry.objects) {
    if (obj.geometry.type !== 'skeleton' || !obj.geometry.edges.length) continue;
    const kind = classifyTransition(obj, cfg.strictTransitionTypes);
    if (!kind) {
      graph.issues.push({ code: 'TRANSITION_UNTYPED', sourceId: obj.id,
        message: `${obj.name}: skeleton edges have no navigation.transition type` });
      continue;
    }
    if (!accessFlags(obj)?.transition) graph.issues.push({
      code: 'TRANSITION_UNTYPED', sourceId: obj.id,
      message: `${obj.name}: transition type inferred from legacy name; set metadata.navigation.transition` });
    for (const edge of obj.geometry.edges) {
      const positions = [obj.geometry.points[edge.from], obj.geometry.points[edge.to]];
      if (!positions.every(isPoint)) {
        graph.issues.push({ code: 'INVALID_TRANSITION', sourceId: obj.id, message: `Invalid endpoint in ${edge.id}` });
        continue;
      }
      const portalIds: string[] = [];
      let unattached = false;
      for (let k = 0; k < 2; k++) {
        const p = positions[k];
        const id = `portal:${edge.id}:${k}`;
        // Author coordinates remain canonical. Do not silently move portals to the nearest painting.
        const candidates = walks.filter(n =>
          hypotXZ(n.position, p) <= cfg.portalSnapRadius &&
          Math.abs(n.position[1] - p[1]) <= cfg.paintToleranceY &&
          safeWalk(n.position, p));
        const closest = candidates.sort((x, y) => dist(x.position, p) - dist(y.position, p))[0];
        if (!closest) { unattached = true; break; }
        addNode({ id, position: p, sourceId: obj.id, role: 'portal' });
        addEdge(id, closest.id, 'walk', obj.id);
        addEdge(closest.id, id, 'walk', obj.id);
        portalIds.push(id);
      }
      if (unattached) {
        for (const id of portalIds) {
          delete graph.nodes[id]; delete graph.outgoing[id];
          for (const other of Object.values(graph.outgoing)) for (let i = other.length - 1; i >= 0; i--)
            if (other[i].to === id) other.splice(i, 1);
        }
        graph.issues.push({ code: 'PORTAL_UNATTACHED', sourceId: obj.id,
          message: `${obj.name}: portal ${edge.id} cannot reach authorized walkable surface` });
        continue;
      }
      addEdge(portalIds[0], portalIds[1], kind, obj.id);
      if (!edge.directed) addEdge(portalIds[1], portalIds[0], kind, obj.id);
    }
  }
  return graph;
}

/** Exact A* on a derived graph, with no teleportation across unconnected nodes. */
export function routeNavigation(graph: NavigationGraph, start: string, goal: string): RouteResult {
  const empty = (reason: NavigationProblem): RouteResult =>
    ({ found: false, points: [], nodes: [], edges: [], totalCost: null, reason });
  if (!graph.nodes[start] || !graph.nodes[goal]) return empty('UNREACHABLE');
  const open = new Set([start]), closed = new Set<string>();
  const cost = new Map([[start, 0]]), prev = new Map<string, { id: string; edge: NavEdge }>();
  while (open.size) {
    let u: string | null = null, best = Infinity;
    for (const id of open) {
      const score = (cost.get(id) ?? Infinity) + dist(graph.nodes[id].position, graph.nodes[goal].position);
      if (score < best) { best = score; u = id; }
    }
    if (u === null) break;
    if (u === goal) {
      const ids = [goal], edges: NavEdge[] = [];
      while (ids[0] !== start) {
        const step = prev.get(ids[0]); if (!step) return empty('UNREACHABLE');
        ids.unshift(step.id); edges.unshift(step.edge);
      }
      return { found: true, nodes: ids, points: ids.map(id => graph.nodes[id].position),
        edges, totalCost: cost.get(goal) ?? 0 };
    }
    open.delete(u); closed.add(u);
    for (const edge of graph.outgoing[u]) {
      if (closed.has(edge.to)) continue;
      const alternative = (cost.get(u) ?? Infinity) + edge.cost;
      if (alternative + 1e-10 < (cost.get(edge.to) ?? Infinity)) {
        cost.set(edge.to, alternative); prev.set(edge.to, { id: u, edge }); open.add(edge.to);
      }
    }
  }
  return empty('UNREACHABLE');
}

export function closestWalkNode(graph: NavigationGraph, point: SpatialPoint, radius = 1): string | null {
  const nodes = Object.values(graph.nodes).filter(n => n.role === 'walk' && dist(n.position, point) <= radius);
  nodes.sort((a, b) => dist(a.position, point) - dist(b.position, point));
  return nodes[0]?.id ?? null;
}
