/** A bounded, physically supported connection from the authored beach arrival to
 * the existing upper PMO footpath. We never add an ordinary walk link over a
 * failed terrain grade, nor alter the authoring registry. If support cannot be
 * shown on the actual GLB and approved paint, compilation fails closed.
 */
import type { NavigationGraph, NavNode, TerrainProjector } from './navigation';
import type { SpatialPoint, SpatialRegistry } from './registry';
import type { PmoTerrainConnector } from './pmoBrushCorridors';
import type { PmoStructure } from './pmoTransitionStructures';
import type { PmoLandingExtension, PmoLandingTread } from './pmoLandingRepair';
import { drawableDock } from './pmoTransitionDockRepair';

const xz = (a:SpatialPoint,b:SpatialPoint)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
const d3 = (a:SpatialPoint,b:SpatialPoint)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const clone = (a:SpatialPoint):SpatialPoint=>[a[0],a[1],a[2]];
const mix = (a:SpatialPoint,b:SpatialPoint,t:number):SpatialPoint=>[
  a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];

export interface BeachNetworkJoinResult {
  graph:NavigationGraph;
  extensions:readonly PmoLandingExtension[];
  diagnostics:readonly string[];
}

function reachable(graph:NavigationGraph,start:string,allowed?:ReadonlySet<string>):Set<string>{
  const out=new Set<string>([start]),queue=[start];
  for(let i=0;i<queue.length;i++)for(const edge of graph.outgoing[queue[i]]??[]){
    if(edge.mode!=='walk'&&(!allowed||!allowed.has(edge.sourceId)))continue;
    if(!graph.nodes[edge.to]||out.has(edge.to))continue;
    // Both directions must be present. Do not treat a one-way spur as two-way access.
    if(!(graph.outgoing[edge.to]??[]).some(e=>e.to===queue[i]&&e.sourceId===edge.sourceId&&e.mode===edge.mode))continue;
    out.add(edge.to);queue.push(edge.to);
  }
  return out;
}

/** Geometric review of the *actual* face of a new short stone deck, at 6mm
 * longitudinal samples. The same samples become the displayed and travelled
 * carrier; paint admission alone never implies safe ground clearance.
 */
function certifyBuiltSurface(a:SpatialPoint,b:SpatialPoint,connector:PmoTerrainConnector,
  terrain:TerrainProjector):{samples:SpatialPoint[];treads:PmoLandingTread[]}|null{
  const horizontal=xz(a,b),rise=Math.abs(a[1]-b[1]);
  if(horizontal<0.32||horizontal>0.76||rise>0.17||rise/horizontal>0.55)return null;
  if(!drawableDock(a,b,connector,terrain))return null;
  const count=Math.ceil(horizontal/.006);
  for(let i=0;i<=count;i++){
    const p=mix(a,b,i/count),projected=connector.project(p);
    const surface=terrain.project(p[0],p[2],p[1]);
    if(!projected||!surface||d3(projected,p)>0.24)return null;
    // An architectural deck may span a sharp rock seam, but not be buried
    // in it or hover over a substantial void. This bound is stricter than
    // drawableDock's coarse raycast and applies at the actor resolution.
    if(surface[1]-p[1]>0.042||p[1]-surface[1]>0.20)return null;
  }
  const treads:PmoLandingTread[]=[],samples:SpatialPoint[]=[clone(a)];
  const segments=Math.max(8,Math.ceil(horizontal/.032),Math.ceil(rise/.035));
  if(segments>50)return null;
  const yaw=Math.atan2(b[0]-a[0],b[2]-a[2]);
  for(let i=0;i<segments;i++){
    const left=mix(a,b,i/segments),right=mix(a,b,(i+1)/segments);
    const top=right[1],mid=mix(left,right,0.5);
    // Physical stair samples and visible top are IDENTICAL by construction.
    treads.push({center:[mid[0],top-.017,mid[2]],yaw,length:horizontal/segments*1.15,width:.30,top});
    samples.push([mid[0],top,mid[2]]);
  }
  samples.push(clone(b));
  if(samples.slice(1).some((p,i)=>d3(p,samples[i])>.075||Math.abs(p[1]-samples[i][1])>.055))return null;
  return {samples,treads};
}

/** The only eligible entrance is the published first beach stair, and the only
 * destination is a walk component demonstrably reaching the building_2 anchor.
 * The bounding window constrains construction to the actual upper entry seam.
 */
export function joinBeachGatewayToMainWalk(graph:NavigationGraph, registry:SpatialRegistry,
  structures:readonly PmoStructure[], connector:PmoTerrainConnector,
  terrain:TerrainProjector, landings:readonly PmoLandingExtension[]):BeachNetworkJoinResult {
  const not=(why:string):BeachNetworkJoinResult=>({graph,extensions:[],diagnostics:[`PMO_MAIN_GATEWAY_JOIN_REJECTED:${why}`]});
  const beachStair=structures.find(s=>s.kind==='stairs'&&s.from[1]<-1.65&&s.to[1]>s.from[1]+.6);
  const site=registry.objects.find(o=>o.name==='building_2');
  if(!beachStair||!site||site.geometry.type!=='skeleton')return not('AUTHORED_ANCHORS_MISSING');
  const anchor=Object.values(site.geometry.points)[0];
  if(!anchor)return not('SECOND_SITE_ANCHOR_MISSING');
  const walkNodes=Object.values(graph.nodes).filter(n=>n.role==='walk');
  // Anchor reachability to the ACTUAL beach-side stair portal. The nearest
  // walk node to the upper stair head can belong to a disconnected component;
  // treating that node as "beach" made an already-connected false positive.
  const beachPortal=`portal:${beachStair.edgeId}:0`;
  if(!graph.nodes[beachPortal])return not('AUTHORED_BEACH_STAIR_PORT_MISSING');
  const allowed=new Set([...landings.map(l=>l.id),beachStair.sourceId]);
  const beachConnected=reachable(graph,beachPortal,allowed);
  const ring=walkNodes.filter(n=>xz(n.position,anchor)>=.48-1e-6&&xz(n.position,anchor)<=.58+1e-6&&Math.abs(n.position[1]-anchor[1])<=.12);
  if(!ring.length)return not('MAIN_PATH_BUILDING2_APPROACH_MISSING');
  const mainConnected=new Set<string>();
  // One of the published, physically painted site_2 approaches anchors the
  // second side. A nearest random island node is never sufficient proof.
  for(const n of ring){for(const id of reachable(graph,n.id,allowed))mainConnected.add(id);}
  if([...ring].some(n=>beachConnected.has(n.id)))return {graph,extensions:[],diagnostics:['PMO_MAIN_GATEWAY_ALREADY_CONNECTED']};
  const inBeach=(n:NavNode)=>beachConnected.has(n.id)&&n.position[0]>=1.65&&n.position[0]<=2.34&&
    n.position[2]>=3.10&&n.position[2]<=3.43&&n.position[1]>=-1.24&&n.position[1]<=-.85;
  const inMain=(n:NavNode)=>mainConnected.has(n.id)&&!beachConnected.has(n.id)&&
    n.position[0]>=1.55&&n.position[0]<=2.37&&n.position[2]>=2.48&&n.position[2]<=2.92&&
    n.position[1]>=-1.20&&n.position[1]<=-.82;
  let selection:null|{a:NavNode;b:NavNode;data:NonNullable<ReturnType<typeof certifyBuiltSurface>>;score:number}=null;
  const beachCandidates=walkNodes.filter(inBeach),mainCandidates=walkNodes.filter(inMain);
  let candidatePairs=0,nearPairs=0,surfaceRejects=0;
  for(const a of beachCandidates)for(const b of mainCandidates){
    candidatePairs++;
    const horizontal=xz(a.position,b.position);
    if(horizontal<.32||horizontal>.76||d3(a.position,b.position)>.80)continue;
    nearPairs++;
    const data=certifyBuiltSurface(a.position,b.position,connector,terrain);
    if(!data){surfaceRejects++;continue;}
    const score=horizontal+Math.abs(a.position[1]-b.position[1])*.22+
      xz(a.position,[2.05,-1.02,3.20])*.12+xz(b.position,[1.97,-.98,2.67])*.12;
    if(!selection||score<selection.score)selection={a,b,data,score};
  }
  if(!selection)return not(`NO_COLLISION_FREE_APPROVED_PHYSICAL_SURFACE:beachCandidates=${beachCandidates.length}:mainCandidates=${mainCandidates.length}:pairs=${candidatePairs}:near=${nearPairs}:surfaceRejects=${surfaceRejects}:beachPortal=${beachPortal}`);
  const {a,b,data}=selection;
  const id=`pmo-gateway:${beachStair.sourceId}:main-path`;
  const edgeId=`${beachStair.edgeId}:main-path`;
  const p0=`portal:${edgeId}:0`,p1=`portal:${edgeId}:1`;
  if(graph.nodes[p0]||graph.nodes[p1])return not('PORTAL_CONFLICT');
  const nodes={...graph.nodes,
    [p0]:{id:p0,role:'portal' as const,sourceId:id,position:clone(a.position)},
    [p1]:{id:p1,role:'portal' as const,sourceId:id,position:clone(b.position)}};
  const outgoing=Object.fromEntries(Object.entries(graph.outgoing).map(([key,edges])=>[key,[...edges]]));
  const cost=d3(a.position,b.position);
  outgoing[p0]=[{to:a.id,mode:'walk' as const,cost:0,sourceId:id},{to:p1,mode:'stairs' as const,cost,sourceId:id}];
  outgoing[p1]=[{to:b.id,mode:'walk' as const,cost:0,sourceId:id},{to:p0,mode:'stairs' as const,cost,sourceId:id}];
  outgoing[a.id]=[...(outgoing[a.id]??[]),{to:p0,mode:'walk',cost:0,sourceId:id}];
  outgoing[b.id]=[...(outgoing[b.id]??[]),{to:p1,mode:'walk',cost:0,sourceId:id}];
  const extension:PmoLandingExtension={id,sourceId:beachStair.sourceId,edgeId,portalA:p0,portalB:p1,
    from:clone(a.position),to:clone(b.position),physicalSamples:data.samples,treads:data.treads};
  return {graph:{...graph,nodes,outgoing},extensions:[extension],
    diagnostics:[`PMO_MAIN_GATEWAY_PHYSICAL_JOIN:${a.id}->${b.id}:length=${cost.toFixed(3)}:samples=${data.samples.length}`]};
}
