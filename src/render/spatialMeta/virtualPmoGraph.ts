/**
 * Operator-authorized PMO mobility overlay.
 * Intentionally permits suspended links and movement to building interior anchors.
 * This is a derived, replaceable renderer/navigation projection, never Core authority.
 * Original authored PMOs are not changed. Routes are intentionally NOT claimed to
 * be terrain-collision-proven, unlike the BVH-projected base graph.
 */
import type { SpatialRegistry, SpatialPoint } from './registry';
import type { NavigationGraph, NavNode, NavEdge, RouteResult } from './navigation';

const horizontal = (a: SpatialPoint, b: SpatialPoint) => Math.hypot(a[0]-b[0], a[2]-b[2]);
const length = (a: SpatialPoint, b: SpatialPoint) => Math.hypot(a[0]-b[0], a[1]-b[1], a[2]-b[2]);
const isPoint = (p: unknown): p is SpatialPoint => Array.isArray(p) && p.length === 3 && p.every(x=>typeof x==='number' && Number.isFinite(x));

export interface AuthorizedNavigationResult {
  graph: NavigationGraph;
  virtualLinks: number;
  anchoredToTerrain: number;
  missingEndpoints: string[];
  /** True only when there are no synthetic edge segments. */
  entirelyTerrainProven: false;
}

/**
 * The augmented PMO registry contains 37 unchanged authored PMOs and an appended
 * operator-authorized navigation layer with `metadata.navigation.virtual=true`.
 * This adapter explicitly recovers virtual walk stamps when the terrain mesh has
 * no trustworthy hit; its routes must be presented as virtual/authorized paths.
 */
export function mergeOperatorPmoNavigation(base: NavigationGraph, registry: SpatialRegistry): AuthorizedNavigationResult {
  if (registry.schemaVersion !== 1 || registry.coordinateSpace !== 'world') throw new Error('PMO registry is not in world coordinates');
  const nodes: Record<string,NavNode> = {...base.nodes};
  const outgoing: Record<string,NavEdge[]> = Object.fromEntries(Object.entries(base.outgoing).map(([id,edges])=>[id,[...edges]]));
  const stamps: {id:string; p:SpatialPoint; radius:number; sourceId:string}[] = [];
  for (const obj of registry.objects) {
    if (obj.geometry.type !== 'paint') continue;
    if (!(obj.name === 'zone_pawns_can_move' || obj.metadata?.navigation && (obj.metadata.navigation as Record<string,unknown>).walkable === true)) continue;
    if ((obj.metadata?.navigation as Record<string,unknown> | undefined)?.blocked === true) continue;
    for (const stroke of obj.geometry.strokes) for (const [i,p] of stroke.points.entries()) {
      if (!isPoint(p)) continue;
      stamps.push({id:`authorized-stamp:${stroke.id}:${i}`,p,radius:stroke.radius,sourceId:obj.id});
    }
  }
  const addNode=(id:string,p:SpatialPoint,sourceId:string,role:'walk'|'portal')=>{
    if (!nodes[id]) {nodes[id]={id,position:p,sourceId,role};outgoing[id]=[];}
  };
  const edge=(a:string,b:string,sourceId:string,mode:NavEdge['mode'])=>{
    if (a===b || outgoing[a]?.some(x=>x.to===b && x.sourceId===sourceId)) return;
    outgoing[a].push({to:b,sourceId,mode,cost:length(nodes[a].position,nodes[b].position)});
  };
  for (const s of stamps) addNode(s.id,s.p,s.sourceId,'walk');
  let anchoredToTerrain=0;
  const surface=Object.values(base.nodes).filter(x=>x.role==='walk');
  for (const s of stamps) {
    const candidates=surface.filter(n=>horizontal(n.position,s.p)<=Math.min(s.radius,.5) && Math.abs(n.position[1]-s.p[1])<=.55);
    candidates.sort((a,b)=>length(a.position,s.p)-length(b.position,s.p));
    if(candidates[0]) {
      // This local seam joins the BVH-proven mesh and the user-authorized air corridor.
      edge(s.id,candidates[0].id,s.sourceId,'walk');
      edge(candidates[0].id,s.id,s.sourceId,'walk');
      anchoredToTerrain++;
    }
  }
  for(let i=0;i<stamps.length;i++) for(let j=0;j<i;j++) {
    const a=stamps[i],b=stamps[j],dx=horizontal(a.p,b.p),dy=Math.abs(a.p[1]-b.p[1]);
    if(dx>a.radius+b.radius || dy>.45 || (dx>1e-8 && dy/dx>.65)) continue;
    // Authored overlapping paint carries operator authorization for continuity.
    edge(a.id,b.id,a.sourceId,'walk');edge(b.id,a.id,b.sourceId,'walk');
  }
  const nearestStamp=(p:SpatialPoint,radius=.1)=>{
    const list=stamps.filter(s=>length(s.p,p)<=radius).sort((a,b)=>length(a.p,p)-length(b.p,p));
    return list[0]?.id ?? null;
  };
  const missingEndpoints:string[]=[];
  let virtualLinks=0;
  for(const obj of registry.objects) {
    if(obj.geometry.type!=='skeleton') continue;
    const nav=obj.metadata.navigation as Record<string,unknown>|undefined;
    if(nav?.virtual!==true || nav?.generated!==true) continue;
    const kind=nav.transition;
    if(kind!=='bridge'&&kind!=='stairs'&&kind!=='lift') continue;
    for(const e of obj.geometry.edges) {
      const a=obj.geometry.points[e.from],b=obj.geometry.points[e.to];
      if(!isPoint(a)||!isPoint(b)){missingEndpoints.push(`${obj.id}:${e.id}:invalid`);continue;}
      // Stamped bridge endpoints are exact authored world positions. Building
      // interiors are extra terminal nodes, never nudged to surrounding terrain.
      const aid=nearestStamp(a)??`authorized-portal:${obj.id}:${e.id}:a`;
      const bid=nearestStamp(b)??`authorized-portal:${obj.id}:${e.id}:b`;
      addNode(aid,a,obj.id,aid.startsWith('authorized-stamp:')?'walk':'portal');
      addNode(bid,b,obj.id,bid.startsWith('authorized-stamp:')?'walk':'portal');
      edge(aid,bid,obj.id,kind);
      if(!e.directed) edge(bid,aid,obj.id,kind);
      virtualLinks++;
    }
  }
  return {graph:{nodes,outgoing,issues:[...base.issues],schemaVersion:1},virtualLinks,anchoredToTerrain,missingEndpoints,entirelyTerrainProven:false};
}

/** Include exact original manually authored transition endpoints in visual route. */
export function expandAuthorizedRoute(result: RouteResult, registry: SpatialRegistry): SpatialPoint[] {
  if(!result.found || result.points.length===0) return [];
  const byId=new Map(registry.objects.map(o=>[o.id,o]));
  const points:SpatialPoint[]=[result.points[0]];
  for(let i=0;i<result.edges.length;i++) {
    const e=result.edges[i], obj=byId.get(e.sourceId);
    const nav=obj?.metadata.navigation as Record<string,unknown>|undefined;
    const via=nav?.via;
    if(Array.isArray(via) && via.length && via.every(isPoint)) {
      const mid=via as SpatialPoint[];
      const from=points[points.length-1], to=result.points[i+1];
      const forward=length(from,mid[0])+length(to,mid[mid.length-1]);
      const reverse=length(from,mid[mid.length-1])+length(to,mid[0]);
      points.push(...(forward<=reverse?mid:mid.slice().reverse()));
    }
    points.push(result.points[i+1]);
  }
  return points;
}
