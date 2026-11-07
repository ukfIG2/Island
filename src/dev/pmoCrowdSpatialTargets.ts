/** DEV crowd: derive distinct certified destinations from the existing compiled
 * PMO graph/paint. No new walk network, fake platform or mesh offset.
 */
import {localQueueWanderPools} from './pmoCrowdQueueDiffusion';
import type {BrushGraph,PmoTerrainConnector,SpatialPoint} from '../render/spatialMeta/pmoBrushCorridors';
const xz=(a:readonly number[],b:readonly number[])=>Math.hypot(a[0]-b[0],a[2]-b[2]);
const dist=(a:readonly number[],b:readonly number[])=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const seed=(id:string)=>{let x=2166136261;for(let i=0;i<id.length;i++)x=Math.imul(x^id.charCodeAt(i),16777619);return x>>>0;};
export interface CrowdSpatialPlan {servicePositions:SpatialPoint[];beachPositions:SpatialPoint[];wanders:SpatialPoint[];wanderBySite:SpatialPoint[][];separatedServices:number;separatedBeach:number;}
/** Stable site distribution mirrors PmoCrowdFerrySession, retaining its service identities. */
export const ferrySite=(i:number,sites:number)=>(i*7+Math.floor(i/sites))%sites;
function bothWays(graph:BrushGraph,at:SpatialPoint,certify:(a:SpatialPoint,b:SpatialPoint)=>boolean):Uint8Array {
  const flags=new Uint8Array(graph.nodes.length);
  let closest=-1,best=.24;
  for(const node of graph.nodes){
    const d=dist(node.point,at);
    if(d<best&&certify(node.point,at)&&certify(at,node.point)){closest=node.id;best=d;}
  }
  if(closest<0)return flags;
  const reverse:number[][]=graph.nodes.map(()=>[]);
  for(let i=0;i<graph.neighbors.length;i++)for(const e of graph.neighbors[i])reverse[e.to].push(i);
  const flood=(back:boolean)=>{
    const seen=new Uint8Array(graph.nodes.length),q=[closest];seen[closest]=1;
    for(let k=0;k<q.length;k++)for(const to of back?reverse[q[k]]:graph.neighbors[q[k]].map(e=>e.to)){
      if(!seen[to]){seen[to]=1;q.push(to);}
    }
    return seen;
  };
  const forward=flood(false),backward=flood(true);
  for(let i=0;i<flags.length;i++)flags[i]=forward[i]&&backward[i]?1:0;
  return flags;
}
export function buildCrowdSpatialPlan(graph:BrushGraph,connector:PmoTerrainConnector,
  launch:SpatialPoint,sites:readonly SpatialPoint[],count:number,
  certify:(a:SpatialPoint,b:SpatialPoint)=>boolean):CrowdSpatialPlan {
  const servicePositions:SpatialPoint[]=Array.from({length:count},(_,i)=>[...sites[ferrySite(i,sites.length)]]);
  const beachPositions:SpatialPoint[]=Array.from({length:count},()=>[...launch]);
  const beachConnected=bothWays(graph,launch,certify);
  const available:SpatialPoint[][]=[];
  const serviceReachability:Uint8Array[]=[];
  const PACK_GAP=.135; // Rendering capsule ~0.094m wide; keep close without a single stack.
  const inPaint=(p:SpatialPoint)=>!graph.stamps.length||graph.stamps.some(s=>
    xz(p,s.center)<=s.radius+1e-6&&Math.abs(p[1]-s.center[1])<=graph.rules.paintHeightTolerance);
  for(let site=0;site<sites.length;site++){
    const center=sites[site];
    const canReach=bothWays(graph,center,certify);
    serviceReachability.push(canReach);
    const reachable=graph.nodes.filter(n=>canReach[n.id]&&xz(n.point,center)<1.28&&
      Math.abs(n.point[1]-center[1])<.20);
    // Use PMO as AREA: graph nodes are on a 0.14m lattice, but the painted
    // surface between them is walkable as well. Generate a tighter hex pack,
    // then certify the projection and both attachments to the EXISTING graph.
    const eligible:SpatialPoint[]=[];
    const candidates:{point:SpatialPoint;radius:number}[]=[];
    const axis=seed('site-'+site)%6283/1000;
    const ca=Math.cos(axis),sa=Math.sin(axis);
    const limit=11;
    for(let q=-limit;q<=limit;q++)for(let r=-limit;r<=limit;r++){
      const ring=Math.max(Math.abs(q),Math.abs(r),Math.abs(q+r));
      if(ring>limit)continue;
      const dx=PACK_GAP*(q+r/2),dz=PACK_GAP*Math.sqrt(3)/2*r;
      const candidate:SpatialPoint=[center[0]+ca*dx-sa*dz,center[1],
        center[2]+sa*dx+ca*dz];
      if(xz(candidate,center)>1.02)continue;
      candidates.push({point:candidate,radius:xz(candidate,center)});
    }
    candidates.sort((a,b)=>a.radius-b.radius);
    for(const candidate of candidates){
      const point=connector.project(candidate.point);
      if(!point||!point.every(Number.isFinite)||xz(point,candidate.point)>.025||
        Math.abs(point[1]-center[1])>.18||!inPaint(point))continue;
      // A locally anchored point is never granted connectivity merely by
      // being inside paint. Require directed walk both ways to a proven node.
      const anchor=reachable.find(n=>xz(n.point,point)<.21&&
        Math.abs(n.point[1]-point[1])<.13&&
        certify(n.point,point)&&certify(point,n.point));
      if(!anchor||eligible.some(p=>Math.abs(p[1]-point[1])<.18&&xz(p,point)<.097))continue;
      eligible.push([...point]);
      if(eligible.length>=96)break;
    }
    // Conservative safety net when the real platform is too narrow for a
    // dense continuous pack: certified original nodes, never fabricated space.
    for(const n of reachable.sort((a,b)=>dist(a.point,center)-dist(b.point,center))){
      if(eligible.length>=96)break;
      if(eligible.some(p=>Math.abs(p[1]-n.point[1])<.18&&xz(p,n.point)<.097))continue;
      eligible.push([...n.point]);
    }
    available.push(eligible);
  }
  const used:SpatialPoint[]=[];
  for(let i=0;i<count;i++){
    const site=ferrySite(i,sites.length),pool=available[site];
    // Compact, actual physical queue footprints; each candidate is already
    // anchored bidirectionally to the compiled graph. Close packed hex rings
    // put the first waiting rows at the service point rather than spreading
    // them along an arbitrary graph scanline.
    const chosen=pool.find(p=>!used.some(u=>Math.abs(p[1]-u[1])<.18&&xz(p,u)<.098));
    if(!chosen)continue;
    servicePositions[i]=[...chosen];used.push(chosen);
  }
  const beachPool=graph.nodes.filter(n=>beachConnected[n.id]&&xz(n.point,launch)<=1.0&&Math.abs(n.point[1]-launch[1])<.12)
    .sort((a,b)=>xz(a.point,launch)-xz(b.point,launch));
  const safeBeach:SpatialPoint[]=[];
  for(const n of beachPool.slice(0,160)){
    if(safeBeach.some(p=>xz(p,n.point)<.105))continue;
    safeBeach.push([...n.point]);
    if(safeBeach.length>=count)break;
  }
  for(let i=0;i<count;i++)if(safeBeach.length)beachPositions[i]=[...safeBeach[i%safeBeach.length]];
  // Local walk-connected PMO marks around each service; no global sightseeing.
  // Directional WALK connectivity matters: a guest may have a legal outward
  // path to a PMO mark without any permitted return along the audited graph.
  // Keep only marks in the service site's strongly connected walk region.
  // Service targets above are attached bidirectionally to nodes in that same
  // region, so the guest can return without being stranded mid-wave.
  const candidates=localQueueWanderPools(graph,sites);
  const wanderBySite=candidates.map((pool,site)=>{
    const reachableBack=serviceReachability[site];
    const safeNodes=new Set(graph.nodes.filter(n=>reachableBack[n.id])
      .map(n=>n.point.join(',')));
    return pool.filter(p=>safeNodes.has(p.join(',')));
  });
  const wanders=wanderBySite.flat();
  return {servicePositions,beachPositions,wanders,wanderBySite,
    separatedServices:servicePositions.filter((p,i)=>xz(p,sites[ferrySite(i,sites.length)])>.12).length,
    separatedBeach:beachPositions.filter(p=>xz(p,launch)>.12).length};
}
