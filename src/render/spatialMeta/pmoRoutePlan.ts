/** PMO-governed world-space route assessment. No gameplay state or renderer state is stored here.
 * A synthetic/virtual PMO link is authorized by the editor but not terrain collision proof.
 */
import type { SpatialPoint, SpatialRegistry } from './registry';
import type { NavigationGraph, NavEdge } from './navigation';
import { routeNavigation } from './navigation';
import { isPmoPaintAuthorized, readPmoWalkAuthorization } from './pmoWorldBindings';

export type PmoRouteConfidence = 'terrain-walk' | 'authored-transition' | 'virtual-unverified' | 'graph-unverified';
export type PmoRouteStatus = 'READY' | 'REVIEW_REQUIRED' | 'UNREACHABLE' | 'UNAUTHORIZED_ENDPOINT';
export interface PmoRouteAssessment {
  status: PmoRouteStatus;
  confidence: PmoRouteConfidence | null;
  /** Full points derived from authored coordinates and graph; no legacy fallback. */
  points: SpatialPoint[];
  traversedEdges: NavEdge[];
  graphNodeIds: string[];
  issues: string[];
  /** Only true if all walking segments, including endpoint snap links, passed the supplied terrain check. */
  terrainVerified: boolean;
}
export interface PmoRouteRequest {
  start: SpatialPoint;
  goal: SpatialPoint;
  /** Source paint PMO IDs, optionally constraining the endpoint search. */
  startPaintId?: string;
  goalPaintId?: string;
  /** Deliberate preview permission only; never implies collision safety. */
  allowVirtual?: boolean;
  /** Independently compiled from the exact island terrain mesh. Not a synthetic augmented graph. */
  certifiedTerrainGraph?: NavigationGraph;
  snapRadius?: number;
  /** Verify terrain and PMO paint over the short segments joining exact endpoints to graph samples. */
  verifyConnector?: (from: SpatialPoint, to: SpatialPoint) => boolean;
}

const d3 = (a: SpatialPoint, b: SpatialPoint) => Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const clone = (p: SpatialPoint): SpatialPoint => [p[0],p[1],p[2]];
const same = (a: SpatialPoint,b: SpatialPoint) => d3(a,b) < 1e-8;
const blocked = (status: PmoRouteStatus, issue: string): PmoRouteAssessment =>
  ({status,confidence:null,points:[],traversedEdges:[],graphNodeIds:[],issues:[issue],terrainVerified:false});

/** Select from nearby graph nodes, checking actual route connectivity rather than guessing one nearest anchor. */
export function planPmoRoute(registry: SpatialRegistry, graph: NavigationGraph, request: PmoRouteRequest): PmoRouteAssessment {
  const {start,goal} = request;
  if (![...start,...goal].every(Number.isFinite)) throw Error('Nonfinite PMO route endpoint');
  const radius = request.snapRadius ?? 0.44;
  if (!(radius > 0 && radius <= 1.5)) throw Error('Invalid endpoint snap radius');
  const stamps = readPmoWalkAuthorization(registry);
  if (!isPmoPaintAuthorized(stamps,start) || !isPmoPaintAuthorized(stamps,goal))
    return blocked('UNAUTHORIZED_ENDPOINT','One or both endpoints are outside PMO authorized walk paint');
  const virtualSources = new Set(registry.objects.filter(o =>
    (o.metadata.navigation as Record<string,unknown>|undefined)?.virtual === true).map(o=>o.id));
  const syntheticNode = (id:string) => id.startsWith('authorized-');
  const syntheticEdge = (from:string,e:NavEdge) => syntheticNode(from) || syntheticNode(e.to) || virtualSources.has(e.sourceId);
  // Prevent a shortest virtual shortcut from hiding an available terrain route.
  const usable:NavigationGraph = request.allowVirtual ? graph : {
    schemaVersion:1,issues:graph.issues,
    nodes:Object.fromEntries(Object.entries(graph.nodes).filter(([id])=>!syntheticNode(id))),
    outgoing:Object.fromEntries(Object.entries(graph.outgoing).filter(([id])=>!syntheticNode(id))
      .map(([id,edges])=>[id,edges.filter(e=>!syntheticEdge(id,e))]))
  };
  const candidates = (point: SpatialPoint, sourceId?: string) => Object.values(usable.nodes)
    .filter(n => n.role === 'walk' && (!sourceId || n.sourceId===sourceId) && d3(n.position,point)<=radius)
    .sort((a,b)=>d3(a.position,point)-d3(b.position,point)||a.id.localeCompare(b.id))
    .slice(0,5);
  const starts = candidates(start,request.startPaintId), goals = candidates(goal,request.goalPaintId);
  if (!starts.length || !goals.length) return blocked('UNREACHABLE','No graph node attached to an authorized endpoint');
  type Winner={ route: ReturnType<typeof routeNavigation>,a:typeof starts[number],b:typeof goals[number],cost:number };
  const certified=request.certifiedTerrainGraph;
  // PMO_TERRAIN_FIRST_V1: shortest graph routes can have uncertified endpoint
  // connectors or special transitions even when a longer, fully walkable route exists.
  // Prefer a path composed ONLY of exact independently terrain-certified walk edges,
  // with both exact-endpoint connectors sampled, before diagnostic/preview routing.
  if (certified) {
    const certifiedWalk:NavigationGraph={schemaVersion:1,issues:certified.issues,nodes:{},outgoing:{}};
    for (const [id,node] of Object.entries(usable.nodes)) {
      if (certified.nodes[id] && !syntheticNode(id)) {
        certifiedWalk.nodes[id]=node;
        certifiedWalk.outgoing[id]=[];
      }
    }
    for (const [id,edges] of Object.entries(usable.outgoing)) {
      if (!certifiedWalk.nodes[id]) continue;
      certifiedWalk.outgoing[id]=edges.filter(edge=>
        !!certifiedWalk.nodes[edge.to] && edge.mode==='walk' && !syntheticEdge(id,edge) &&
        certified.outgoing[id]?.some(e=>e.to===edge.to && e.mode==='walk' && e.sourceId===edge.sourceId));
    }
    const startOk=new Map<string,boolean>(),goalOk=new Map<string,boolean>();
    for (const a of starts) startOk.set(a.id,!!certifiedWalk.nodes[a.id] &&
      (same(start,a.position) || request.verifyConnector?.(start,a.position)===true));
    for (const b of goals) goalOk.set(b.id,!!certifiedWalk.nodes[b.id] &&
      (same(goal,b.position) || request.verifyConnector?.(b.position,goal)===true));
    let accepted:Winner|null=null;
    for (const a of starts) {
      if (!startOk.get(a.id)) continue;
      for (const b of goals) {
        if (!goalOk.get(b.id)) continue;
        const route=routeNavigation(certifiedWalk,a.id,b.id);
        if (!route.found || route.totalCost===null) continue;
        const cost=route.totalCost+d3(start,a.position)+d3(goal,b.position);
        if (!accepted || cost<accepted.cost-1e-8 ||
          (Math.abs(cost-accepted.cost)<1e-8 && `${a.id}/${b.id}`<`${accepted.a.id}/${accepted.b.id}`))
          accepted={route,a,b,cost};
      }
    }
    if (accepted) {
      const points=[clone(start),...accepted.route.points.map(clone),clone(goal)]
        .filter((p,i,all)=>i===0||!same(p,all[i-1]));
      return {status:'READY',confidence:'terrain-walk',points,
        traversedEdges:[...accepted.route.edges],graphNodeIds:[...accepted.route.nodes],
        issues:[],terrainVerified:true};
    }
  }
  // If no independently certified walking path exists, keep the original
  // shortest-graph diagnostic, including blocked virtual/special connector issues.
  let winner:Winner|null=null;
  for (const a of starts) for (const b of goals) {
    const route=routeNavigation(usable,a.id,b.id);
    if (!route.found || route.totalCost===null) continue;
    const cost=route.totalCost+d3(start,a.position)+d3(goal,b.position);
    if (!winner || cost<winner.cost-1e-8 || (Math.abs(cost-winner.cost)<1e-8 && `${a.id}/${b.id}`<`${winner.a.id}/${winner.b.id}`))
      winner={route,a,b,cost};
  }
  if (!winner) return blocked('UNREACHABLE','No connected PMO graph route between authorized endpoints');
  const result=winner.route;
  const virtual=result.nodes.some(syntheticNode) ||
    result.edges.some((e,i)=>syntheticEdge(result.nodes[i],e));
  if (virtual && !request.allowVirtual) return blocked('UNREACHABLE','Route requires unverified virtual PMO segments');
  const hasTransition=result.edges.some(edge=>edge.mode!=='walk');
  const baseContainsRoute=!!certified && result.nodes.every(id=>!!certified.nodes[id]) &&
    result.edges.every((edge,i)=>certified.outgoing[result.nodes[i]]?.some(e=>
      e.to===edge.to && e.mode===edge.mode && e.sourceId===edge.sourceId));
  const confidence:PmoRouteConfidence=virtual?'virtual-unverified':hasTransition?'authored-transition':
    baseContainsRoute?'terrain-walk':'graph-unverified';
  const startSnapVerified=same(start,winner.a.position) || request.verifyConnector?.(start,winner.a.position)===true;
  const endSnapVerified=same(goal,winner.b.position) || request.verifyConnector?.(winner.b.position,goal)===true;
  // A terrain compiler validates grid walk edges; typed bridges/lifts/stairs and synthetic
  // edges still require specific real-world geometry/animation acceptance before READY.
  const terrainVerified=confidence==='terrain-walk' && startSnapVerified && endSnapVerified;
  const points=[clone(start),...result.points.map(clone),clone(goal)].filter((p,i,all)=>i===0||!same(p,all[i-1]));
  const issues:string[]=[];
  if (virtual) issues.push('VIRTUAL_PMO_ROUTE_NOT_TERRAIN_COLLISION_PROVEN');
  if (hasTransition) issues.push('SPECIAL_TRANSITION_NEEDS_3D_GEOMETRY_ACCEPTANCE');
  if (!baseContainsRoute) issues.push('ROUTE_NOT_CERTIFIED_BY_ISLAND_TERRAIN_GRAPH');
  if (!startSnapVerified || !endSnapVerified) issues.push('ENDPOINT_CONNECTOR_UNVERIFIED');
  return {status:terrainVerified?'READY':'REVIEW_REQUIRED',confidence,points,
    traversedEdges:[...result.edges],graphNodeIds:[...result.nodes],issues,terrainVerified};
}
