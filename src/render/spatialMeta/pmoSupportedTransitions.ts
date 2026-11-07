/** Terrain-derived graph plus identity-checked physical stair/bridge surfaces. No gameplay authority. */
import type { NavigationGraph, NavEdge } from './navigation';
import { routeNavigation } from './navigation';
import type { SpatialPoint, SpatialRegistry } from './registry';
import type { PmoStructure } from './pmoTransitionStructures';
import type { PmoTransitionAccess } from './pmoTransitionAccess';
import type {PmoLandingExtension} from './pmoLandingRepair';
import type {PmoDockExtension} from './pmoTransitionDockRepair';
import { samplePmoStructureSurface } from './pmoTransitionSurface';
interface SupportedSurface { kind:'stairs'|'bridge'; edgeId:string; points:SpatialPoint[]; endNodeIds?:readonly [string,string]; }
export interface PmoSupportedGraph {
  graph:NavigationGraph;
  surfaces:Readonly<Record<string,SupportedSurface>>;
  acceptedSourceIds:string[];
  rejectedSourceIds:string[];
}
const dist=(a:SpatialPoint,b:SpatialPoint)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const copy=(p:SpatialPoint):SpatialPoint=>[p[0],p[1],p[2]];
const near=(a:SpatialPoint,b:SpatialPoint,limit=0.081)=>dist(a,b)<=limit;
export function buildPmoSupportedGraph(registry:SpatialRegistry,graph:NavigationGraph,structures:readonly PmoStructure[],accesses:readonly PmoTransitionAccess[],landings:readonly PmoLandingExtension[]=[],docks:readonly PmoDockExtension[]=[]):PmoSupportedGraph {
  const surfaces:Record<string,SupportedSurface>={};
  const rejectedSourceIds:string[]=[];
  const seen=new Set<string>();
  for(const structure of structures){
    const access=accesses.find(a=>a.sourceId===structure.sourceId&&a.edgeId===structure.edgeId);
    const p0='portal:'+structure.edgeId+':0',p1='portal:'+structure.edgeId+':1';
    const linked=!!access&&access.kind===structure.kind&&access.attached&&access.geometryContinuous&&
      !!access.walkNodeIds[0]&&!!access.walkNodeIds[1]&&
      graph.nodes[p0]?.role==='portal'&&graph.nodes[p1]?.role==='portal'&&
      graph.nodes[p0].sourceId===structure.sourceId&&graph.nodes[p1].sourceId===structure.sourceId&&
      near(graph.nodes[p0].position,structure.from,0.00001)&&near(graph.nodes[p1].position,structure.to,0.00001)&&
      (graph.outgoing[p0]||[]).some(e=>e.to===p1&&e.mode===structure.kind&&e.sourceId===structure.sourceId)&&
      (graph.outgoing[p1]||[]).some(e=>e.to===p0&&e.mode===structure.kind&&e.sourceId===structure.sourceId);
    if(seen.has(structure.sourceId)||!linked||structure.kind==='lift'){rejectedSourceIds.push(structure.sourceId);continue;}
    seen.add(structure.sourceId);
    const result=samplePmoStructureSurface(structure,access!);
    if(!result.surfaceSampled||result.points.length<3||!near(result.points[0],structure.from)||!near(result.points[result.points.length-1],structure.to)){rejectedSourceIds.push(structure.sourceId);continue;}
    surfaces[structure.sourceId]={kind:structure.kind,edgeId:structure.edgeId,points:result.points.map(copy)};
  }
  // Derivative landing is physically rendered and integrated into the SAME
  // compiled graph. Its own portal IDs and exact sampled tread surfaces are
  // checked before promoting the helper as a supported special movement.
  for(const landing of landings){
    const a=graph.nodes[landing.portalA],b=graph.nodes[landing.portalB];
    const forward=(graph.outgoing[landing.portalA]??[]).some(e=>e.mode==='stairs'&&e.sourceId===landing.id&&e.to===landing.portalB);
    const reverse=(graph.outgoing[landing.portalB]??[]).some(e=>e.mode==='stairs'&&e.sourceId===landing.id&&e.to===landing.portalA);
    if(!a||!b||!near(a.position,landing.from,1e-5)||!near(b.position,landing.to,1e-5)||
      !forward||!reverse||landing.treads.length<3||landing.physicalSamples.length<5||
      !near(landing.physicalSamples[0],landing.from)||
      !near(landing.physicalSamples[landing.physicalSamples.length-1],landing.to)){
      rejectedSourceIds.push(landing.id);continue;
    }
    surfaces[landing.id]={kind:'stairs',edgeId:landing.edgeId,
      points:landing.physicalSamples.map(copy)};
  }
  for(const dock of docks){
    const a=graph.nodes[dock.walkNodeId],b=graph.nodes[dock.portalId];
    const f=(graph.outgoing[dock.walkNodeId]??[]).some(e=>e.to===dock.portalId&&e.sourceId===dock.id&&e.mode===dock.kind);
    const r=(graph.outgoing[dock.portalId]??[]).some(e=>e.to===dock.walkNodeId&&e.sourceId===dock.id&&e.mode===dock.kind);
    if(!a||!b||!f||!r||!near(a.position,dock.from,1e-5)||!near(b.position,dock.to,1e-5)||
      dock.physicalSamples.length<3) {rejectedSourceIds.push(dock.id);continue;}
    surfaces[dock.id]={kind:dock.kind,edgeId:dock.edgeId,points:dock.physicalSamples.map(copy),endNodeIds:[dock.walkNodeId,dock.portalId]};
  }
  const virtualSources=new Set(registry.objects.filter(o=>(o.metadata.navigation as {virtual?:unknown}|undefined)?.virtual===true).map(o=>o.id));
  const nodes=Object.fromEntries(Object.entries(graph.nodes).filter(([id])=>!id.startsWith('authorized-')));
  const outgoing:NavigationGraph['outgoing']={};
  for(const [id,edges]of Object.entries(graph.outgoing)){
    if(!nodes[id])continue;
    outgoing[id]=edges.filter(edge=>{
      if(!nodes[edge.to]||virtualSources.has(edge.sourceId))return false;
      if(edge.mode==='walk')return true;
      const supported=surfaces[edge.sourceId];
      if(!supported||edge.mode!==supported.kind)return false;
      const dock=docks.find(d=>d.id===edge.sourceId);
      if(dock)return (id===dock.walkNodeId&&edge.to===dock.portalId)||
        (id===dock.portalId&&edge.to===dock.walkNodeId);
      const p0='portal:'+supported.edgeId+':0',p1='portal:'+supported.edgeId+':1';
      return (id===p0&&edge.to===p1)||(id===p1&&edge.to===p0);
    });
  }
  return {graph:{schemaVersion:1,nodes,outgoing,issues:[...graph.issues]},surfaces,acceptedSourceIds:Object.keys(surfaces).sort(),rejectedSourceIds};
}
export interface PmoSupportedRoute { points:SpatialPoint[]; traversedEdges:NavEdge[]; graphNodeIds:string[]; specialSourceIds:string[]; }
/** Expand certified support into world-space waypoints; never interpolate directly across an unsupported gap. */
export function routePmoSupportedGraph(view:PmoSupportedGraph,fromId:string,toId:string):PmoSupportedRoute|null {
  const route=routeNavigation(view.graph,fromId,toId);
  if(!route.found||route.nodes.length<2)return null;
  const points:SpatialPoint[]=[copy(view.graph.nodes[fromId].position)],special=new Set<string>();
  const append=(p:SpatialPoint)=>{if(!near(points[points.length-1],p,0.000001))points.push(copy(p));};
  for(let i=0;i<route.edges.length;i++){
    const e=route.edges[i],from=route.nodes[i],to=route.nodes[i+1];
    if(e.to!==to)return null;
    if(e.mode==='walk'){append(view.graph.nodes[to].position);continue;}
    const support=view.surfaces[e.sourceId];
    if(!support||support.kind!==e.mode)return null;
    const p0=support.endNodeIds?.[0]??'portal:'+support.edgeId+':0',p1=support.endNodeIds?.[1]??'portal:'+support.edgeId+':1';
    const forward=from===p0&&to===p1;
    if(!forward&&!(from===p1&&to===p0))return null;
    const samples=forward?support.points:[...support.points].reverse();
    if(!near(points[points.length-1],samples[0])||!near(samples[samples.length-1],view.graph.nodes[to].position))return null;
    for(const p of samples)append(p);
    append(view.graph.nodes[to].position);special.add(e.sourceId);
  }
  if(points.length>8192||!points.every(p=>p.every(Number.isFinite)))return null;
  return {points,traversedEdges:route.edges,graphNodeIds:route.nodes,specialSourceIds:[...special]};
}
