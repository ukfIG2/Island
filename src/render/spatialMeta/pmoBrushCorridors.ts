/**
 * PMO brush-first pedestrian routing. Pure navigation domain: NO scene mutation,
 * animation, guest lifecycle, reward or proof of actual actor motion.
 * The production integration must supply makePmoTerrainConnector(registry,terrain).
 */
export type SpatialPoint = [number, number, number];
export type HelperKind = 'stairs' | 'bridge' | 'lift';

/** Mirrors the existing RRH readPmoWalkAuthorization() output. */
export interface PmoWalkStamp {
  readonly center: readonly [number, number, number];
  readonly radius: number;
  readonly sourceId: string;
}

/** Mirrors the existing RRH makePmoTerrainConnector(). */
export interface PmoTerrainConnector {
  project(candidate: SpatialPoint): SpatialPoint | null;
  verify(from: SpatialPoint, to: SpatialPoint): boolean;
}

/** A helper is a physically owned, capacity-limited transition, not a paint stroke. */
export interface PmoRouteHelper {
  readonly id: string;
  readonly sourceId: string;
  readonly edgeId: string;
  readonly kind: HelperKind;
  readonly from: SpatialPoint;
  readonly to: SpatialPoint;
  readonly capacity: number;
}

export interface CompileOptions {
  /** Matches native RRH terrain walking rule; never raise to force connectivity. */
  readonly maxGrade?: number;
  readonly maxStepY?: number;
  /** Local sampling inside PMO marks, not a global world-heightfield graph. */
  readonly step?: number;
  readonly maxWalkLink?: number;
  readonly maxNodes?: number;
  readonly paintHeightTolerance?: number;
  /** Trusted integration-only hook: must check physical structure + actor travel authorization. */
  readonly authorizeHelper?: (helper: PmoRouteHelper) => boolean;
}

export interface BrushNode {
  readonly id: number;
  readonly point: SpatialPoint;
  readonly sources: readonly string[];
}

export interface BrushEdge {
  readonly to: number;
  readonly cost: number;
  readonly kind: 'walk' | HelperKind;
  readonly helperId?: string;
}

export interface BrushGraph {
  readonly nodes: readonly BrushNode[];
  readonly neighbors: readonly (readonly BrushEdge[])[];
  readonly stamps: readonly PmoWalkStamp[];
  readonly helpers: Readonly<Record<string, PmoRouteHelper>>;
  readonly rejectedHelpers: readonly { id: string; reason: string }[];
  readonly rules: Readonly<{ maxGrade: number; maxStepY: number; step: number; maxWalkLink: number; paintHeightTolerance: number }>;
}

export type RouteFailure = 'UNAUTHORIZED_ENDPOINT' | 'UNREACHABLE' | 'UNCERTIFIED_HELPER';
export type RouteStep = { readonly kind: 'walk' | HelperKind; readonly from: SpatialPoint; readonly to: SpatialPoint; readonly helperId?: string; readonly brushSourceIds: readonly string[] };
export type RouteResult =
  | { readonly status: 'READY'; readonly points: readonly SpatialPoint[]; readonly steps: readonly RouteStep[]; readonly distance: number; readonly brushSourceIds: readonly string[] }
  | { readonly status: RouteFailure; readonly reason: string };

const finite = (p: readonly number[]): p is SpatialPoint => p.length === 3 && p.every(Number.isFinite);
const distXZ = (a: readonly number[], b: readonly number[]): number => Math.hypot(a[0] - b[0], a[2] - b[2]);
const dist3 = (a: readonly number[], b: readonly number[]): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

function paintSourceIds(stamps: readonly PmoWalkStamp[], p: SpatialPoint, heightTolerance: number): string[] {
  const ids = new Set<string>();
  for (const s of stamps) if (distXZ(s.center, p) <= s.radius + 1e-8 && Math.abs(s.center[1] - p[1]) <= heightTolerance) ids.add(s.sourceId);
  return Array.from(ids).sort();
}

/** A disjoint height layer must never be merged just because X/Z overlap. */
function bucketKey(x: number, z: number, step: number): string {
  return `${Math.floor(x / step)},${Math.floor(z / step)}`;
}

export function compilePmoBrushCorridors(
  stampsInput: readonly PmoWalkStamp[],
  connector: PmoTerrainConnector,
  helperInput: readonly PmoRouteHelper[] = [],
  options: CompileOptions = {},
): BrushGraph {
  const rules = {
    maxGrade: options.maxGrade ?? 0.72,
    maxStepY: options.maxStepY ?? 0.20,
    step: options.step ?? 0.14,
    maxWalkLink: options.maxWalkLink ?? 0.215,
    paintHeightTolerance: options.paintHeightTolerance ?? 0.52,
  };
  if (!(rules.maxGrade > 0 && rules.maxGrade <= 0.72 && rules.maxStepY > 0 && rules.maxStepY <= 0.20 && rules.step > 0 && rules.step <= 0.20 && rules.maxWalkLink >= rules.step && rules.maxWalkLink <= 0.32)) throw Error('PMO_NAVIGATION_RULES_UNSAFE');
  const maxNodes = options.maxNodes ?? 60000;
  if (!Number.isInteger(maxNodes) || maxNodes < 1) throw Error('PMO_NAVIGATION_NODE_LIMIT_INVALID');
  const stamps = stampsInput.filter(s => finite(s.center) && Number.isFinite(s.radius) && s.radius > 0 && s.sourceId.length > 0);
  const points: SpatialPoint[] = [];
  const sources: Set<string>[] = [];
  const spatial = new Map<string, number[]>();
  const keyOf = (p: readonly number[]) => bucketKey(p[0], p[2], rules.step);

  const add = (candidate: SpatialPoint): number | null => {
    const projected = connector.project(candidate);
    if (!projected || !finite(projected) || distXZ(projected, candidate) > rules.step * 0.3) return null;
    const sourceIds = paintSourceIds(stamps, projected, rules.paintHeightTolerance);
    if (!sourceIds.length) return null;
    const key = keyOf(projected);
    for (const i of spatial.get(key) ?? []) {
      if (distXZ(points[i], projected) < rules.step * 0.20 && Math.abs(points[i][1] - projected[1]) < 0.07) {
        sourceIds.forEach(s => sources[i].add(s));
        return i;
      }
    }
    if (points.length >= maxNodes) throw Error('PMO_NAVIGATION_NODE_LIMIT');
    const index = points.length;
    points.push([projected[0], projected[1], projected[2]]);
    sources.push(new Set(sourceIds));
    const items = spatial.get(key) ?? [];
    items.push(index);
    spatial.set(key, items);
    return index;
  };

  // Sample only painted envelopes. Overlap + height consistency is checked later;
  // being painted never by itself implies connectivity.
  for (const s of stamps) {
    add([...s.center] as SpatialPoint);
    const imin = Math.ceil((s.center[0] - s.radius) / rules.step), imax = Math.floor((s.center[0] + s.radius) / rules.step);
    const jmin = Math.ceil((s.center[2] - s.radius) / rules.step), jmax = Math.floor((s.center[2] + s.radius) / rules.step);
    for (let i = imin; i <= imax; i++) for (let j = jmin; j <= jmax; j++) {
      const x = i * rules.step, z = j * rules.step;
      if (Math.hypot(x - s.center[0], z - s.center[2]) <= s.radius + 1e-9) add([x, s.center[1], z]);
    }
  }

  const edges: BrushEdge[][] = points.map(() => []);
  const accepted = new Map<string, PmoRouteHelper>();
  const rejectedHelpers: { id: string; reason: string }[] = [];
  const canWalk = (a: SpatialPoint, b: SpatialPoint): boolean => {
    const dx = distXZ(a, b), dy = Math.abs(b[1] - a[1]);
    return dx > 1e-8 && dx <= rules.maxWalkLink + 1e-8 && dy <= rules.maxStepY + 1e-8 && dy / dx <= rules.maxGrade + 1e-8 &&
      connector.verify(a, b) && connector.verify(b, a);
  };
  const linkWalk = (a: number, b: number): void => {
    if (!canWalk(points[a], points[b])) return;
    const cost = dist3(points[a], points[b]);
    edges[a].push({ to: b, cost, kind: 'walk' });
    edges[b].push({ to: a, cost, kind: 'walk' });
  };

  // Spatial hash: avoid O(N^2) neighbor checks for large authored PMO registries.
  const reach = Math.ceil(rules.maxWalkLink / rules.step) + 1;
  for (let a = 0; a < points.length; a++) {
    const p = points[a], bi = Math.floor(p[0] / rules.step), bj = Math.floor(p[2] / rules.step);
    for (let di = -reach; di <= reach; di++) for (let dj = -reach; dj <= reach; dj++) {
      const key = `${bi + di},${bj + dj}`;
      for (const b of spatial.get(key) ?? []) if (b > a && distXZ(p, points[b]) <= rules.maxWalkLink + 1e-8) linkWalk(a, b);
    }
  }

  // Special infrastructure is never inferred from brush overlaps. Its identity,
  // real endpoints and runtime certification require a separate trusted owner.
  for (const helper of helperInput) {
    let reason = '';
    if (!helper.id || !helper.edgeId || !helper.sourceId || !finite(helper.from) || !finite(helper.to) || !Number.isInteger(helper.capacity) || helper.capacity < 1 || !['bridge', 'stairs', 'lift'].includes(helper.kind)) reason = 'INVALID_HELPER';
    else if (accepted.has(helper.id)) reason = 'DUPLICATE_HELPER_ID';
    else if (!options.authorizeHelper?.(helper)) reason = 'UNTRUSTED_OR_UNCERTIFIED_HELPER';
    if (reason) { rejectedHelpers.push({ id: helper.id, reason }); continue; }
    // Exact authored ports must attach to both authorized PMO paint areas.
    const a = add(helper.from), b = add(helper.to);
    if (a === null || b === null || a === b || dist3(points[a], helper.from) > 0.12 || dist3(points[b], helper.to) > 0.12) {
      rejectedHelpers.push({ id: helper.id, reason: 'HELPER_PORT_UNATTACHED' });
      continue;
    }
    // Newly added ports require walk edges, but cannot bypass ordinary rules.
    while (edges.length < points.length) edges.push([]);
    for (const index of [a, b]) {
      const p = points[index];
      for (let j = 0; j < points.length; j++) if (j !== index && distXZ(p, points[j]) <= rules.maxWalkLink + 1e-8 && !edges[index].some(e => e.to === j && e.kind === 'walk')) linkWalk(index, j);
    }
    const cost = dist3(points[a], points[b]);
    edges[a].push({ to: b, kind: helper.kind, helperId: helper.id, cost });
    edges[b].push({ to: a, kind: helper.kind, helperId: helper.id, cost });
    accepted.set(helper.id, helper);
  }

  return {
    nodes: points.map((point, id) => ({ id, point, sources: [...sources[id]].sort() })),
    neighbors: edges,
    stamps,
    helpers: Object.fromEntries(accepted),
    rejectedHelpers,
    rules,
  };
}

export function planBrushCorridorRoute(
  graph: BrushGraph, connector: PmoTerrainConnector, start: SpatialPoint, goal: SpatialPoint,
  snapDistance = 0.26,
  certifyAttachment?: (from:SpatialPoint,to:SpatialPoint)=>boolean,
): RouteResult {
  const { rules } = graph;
  if (!finite(start) || !finite(goal)) return { status: 'UNAUTHORIZED_ENDPOINT', reason: 'NONFINITE_ENDPOINT' };
  if (!paintSourceIds(graph.stamps, start, rules.paintHeightTolerance).length || !paintSourceIds(graph.stamps, goal, rules.paintHeightTolerance).length)
    return { status: 'UNAUTHORIZED_ENDPOINT', reason: 'OUTSIDE_PMO_PAINT' };
  const ok = (a: SpatialPoint, b: SpatialPoint): boolean => {
    const dx = distXZ(a, b), dy = Math.abs(a[1] - b[1]);
    return dx <= snapDistance + 1e-8 && dy <= rules.maxStepY + 1e-8 && (dx < 1e-8 ? dy < 1e-8 : dy / dx <= rules.maxGrade + 1e-8) && connector.verify(a, b) && connector.verify(b, a) && (!certifyAttachment || certifyAttachment(a,b));
  };
  const starters = graph.nodes.filter(n => ok(start,n.point)).map(n => n.id);
  const finishers = graph.nodes.filter(n => ok(n.point,goal)).map(n => n.id);
  if (!starters.length || !finishers.length) return { status: 'UNAUTHORIZED_ENDPOINT', reason: 'NO_CERTIFIED_PMO_ATTACHMENT' };
  const finishSet = new Set(finishers), n = graph.nodes.length;
  const distances = new Float64Array(n).fill(Infinity);
  const previous = new Int32Array(n).fill(-1);
  const previousEdge: (BrushEdge | undefined)[] = Array(n);
  const used = new Uint8Array(n);
  // A small heap keeps large crowd route queries subquadratic.
  const heap: { id: number; dist: number }[] = [];
  const push = (item: { id: number; dist: number }) => { heap.push(item); let i = heap.length - 1; while (i) { const j = (i - 1) >> 1; if (heap[j].dist <= heap[i].dist) break; [heap[j], heap[i]] = [heap[i], heap[j]]; i = j; } };
  const pop = (): { id: number; dist: number } | undefined => { if (!heap.length) return undefined; const v = heap[0], last = heap.pop()!; if (heap.length) { heap[0] = last; let i = 0; for (;;) { let j = i * 2 + 1; if (j >= heap.length) break; if (j + 1 < heap.length && heap[j + 1].dist < heap[j].dist) j++; if (heap[i].dist <= heap[j].dist) break; [heap[i], heap[j]] = [heap[j], heap[i]]; i = j; } } return v; };
  for (const i of starters) { const cost = dist3(start, graph.nodes[i].point); if (cost < distances[i]) { distances[i] = cost; push({ id: i, dist: cost }); } }
  let found = -1;
  while (heap.length) {
    const next = pop()!, u = next.id;
    if (used[u] || next.dist > distances[u] + 1e-8) continue;
    used[u] = 1;
    if (finishSet.has(u)) { found = u; break; }
    for (const edge of graph.neighbors[u]) {
      if (used[edge.to]) continue;
      const candidate = distances[u] + edge.cost;
      if (candidate < distances[edge.to]) { distances[edge.to] = candidate; previous[edge.to] = u; previousEdge[edge.to] = edge; push({ id: edge.to, dist: candidate }); }
    }
  }
  if (found < 0) return { status: 'UNREACHABLE', reason: 'NO_TERRAIN_CERTIFIED_PMO_PATH' };
  const path: number[] = [];
  for (let u = found; u >= 0; u = previous[u]) path.push(u);
  path.reverse();
  const points = [start, ...path.map(i => graph.nodes[i].point), goal];
  const steps: RouteStep[] = [];
  const step = (kind: 'walk' | HelperKind, from: SpatialPoint, to: SpatialPoint, helperId: string | undefined, sources: readonly string[]) => steps.push({ kind, from, to, helperId, brushSourceIds: sources });
  step('walk', start, graph.nodes[path[0]].point, undefined, graph.nodes[path[0]].sources);
  for (let k = 1; k < path.length; k++) {
    const from = path[k - 1], to = path[k], edge = previousEdge[to]!;
    step(edge.kind, graph.nodes[from].point, graph.nodes[to].point, edge.helperId, graph.nodes[to].sources);
  }
  step('walk', graph.nodes[path[path.length - 1]].point, goal, undefined, graph.nodes[path[path.length - 1]].sources);
  const brushSourceIds = Array.from(new Set(path.flatMap(i => graph.nodes[i].sources)));
  return { status: 'READY', points, steps, brushSourceIds, distance: distances[found] + dist3(graph.nodes[found].point, goal) };
}

/** Spawn inside sampled PMO paint, with terrain re-projection and collision spacing. */
export function chooseCertifiedBrushSpawn(
  graph: BrushGraph, connector: PmoTerrainConnector,
  options: { sourceId?: string; occupied?: readonly SpatialPoint[]; separation?: number; seed?: number; attempts?: number } = {},
): SpatialPoint | null {
  const nodes = graph.nodes.filter(n => !options.sourceId || n.sources.includes(options.sourceId));
  if (!nodes.length) return null;
  let seed = (options.seed ?? 0x9e3779b9) >>> 0;
  const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 0x100000000; };
  const { step, maxGrade, maxStepY, paintHeightTolerance } = graph.rules;
  const occupied = options.occupied ?? [], separation = options.separation ?? 0.12;
  const attempts = Math.max(1, Math.min(2500, options.attempts ?? 80));
  for (let k = 0; k < attempts; k++) {
    const base = nodes[Math.floor(random() * nodes.length)].point;
    const angle = random() * Math.PI * 2, radius = step * 0.34 * Math.sqrt(random());
    const candidate: SpatialPoint = [base[0] + Math.cos(angle) * radius, base[1], base[2] + Math.sin(angle) * radius];
    const p = connector.project(candidate);
    if (!p || !finite(p) || distXZ(p, candidate) > step * 0.2) continue;
    const availableSources = paintSourceIds(graph.stamps, p, paintHeightTolerance);
    if (!(options.sourceId ? availableSources.includes(options.sourceId) : availableSources.length > 0)) continue;
    const d = distXZ(p, base), dy = Math.abs(p[1] - base[1]);
    if (dy > maxStepY || (d > 1e-8 && dy / d > maxGrade) || !connector.verify(base, p) || !connector.verify(p, base)) continue;
    if (occupied.some(other => dist3(p, other) < separation)) continue;
    return p;
  }
  return null;
}

/** Capacity and FIFO reservation only: must NOT advance an actor or emit a Core witness. */
export class HelperQueue {
  private readonly agents = new Map<string, Set<string>>();
  private readonly waiting = new Map<string, string[]>();
  constructor(private readonly helpers: Readonly<Record<string, PmoRouteHelper>>) {}
  enter(helperId: string, agentId: string): boolean {
    const helper = this.helpers[helperId];
    if (!helper || !agentId) return false;
    const inside = this.agents.get(helperId) ?? new Set<string>();
    const pending = this.waiting.get(helperId) ?? [];
    this.agents.set(helperId, inside); this.waiting.set(helperId, pending);
    if (inside.has(agentId)) return true;
    if (!pending.includes(agentId)) pending.push(agentId);
    if (inside.size >= helper.capacity || pending[0] !== agentId) return false;
    pending.shift(); inside.add(agentId); return true;
  }
  leave(helperId: string, agentId: string): void { this.agents.get(helperId)?.delete(agentId); }
  cancel(helperId: string, agentId: string): void {
    this.agents.get(helperId)?.delete(agentId);
    const queue = this.waiting.get(helperId); if (queue) this.waiting.set(helperId, queue.filter(id => id !== agentId));
  }
  status(helperId: string): { active: readonly string[]; pending: readonly string[] } {
    return { active: [...(this.agents.get(helperId) ?? [])], pending: [...(this.waiting.get(helperId) ?? [])] };
  }
}
