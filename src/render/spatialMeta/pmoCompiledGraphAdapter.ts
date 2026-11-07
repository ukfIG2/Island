import type {PmoLiftTransit} from './pmoLiftTransit';
import type {PmoDockExtension} from './pmoTransitionDockRepair';
/**
 * Shared production + audit adapter: convert the production, terrain-compiled NavigationGraph
 * into the pedestrian engine's edge layout WITHOUT re-sampling/building a second
 * navigation network. Authoritative PMO IDs and compiled walk edges are retained.
 * Transition edges require separately verified, visible physical supports.
 */
import type {NavigationGraph} from './navigation';
import type {BrushGraph, BrushEdge, PmoRouteHelper, PmoTerrainConnector, SpatialPoint} from './pmoBrushCorridors';
import type {PmoWalkStamp} from './pmoWorldBindings';
import type {PmoStructure} from './pmoTransitionStructures';
import type {PmoTransitionAccess} from './pmoTransitionAccess';
import type {PmoLandingExtension} from './pmoLandingRepair';
import {sampleAuthoredStairTreads} from './pmoTestStairCertification';
import {samplePmoStructureSurface} from './pmoTransitionSurface';

const d3=(a:readonly number[],b:readonly number[])=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const point=(p:readonly number[]):SpatialPoint=>[p[0],p[1],p[2]];
export interface CompiledTestGraph {
  graph: BrushGraph;
  /** Verified physical paths, indexed by the original source PMO ID. */
  physical: ReadonlyMap<string, readonly SpatialPoint[]>;
  accepted: readonly string[];
  rejected: readonly string[];
  sourceNodeCount:number;
}
export function adaptCompiledPmoGraph(
  compiled: NavigationGraph, connector:PmoTerrainConnector,
  stamps:readonly PmoWalkStamp[], structures:readonly PmoStructure[],
  accesses:readonly PmoTransitionAccess[],landings:readonly PmoLandingExtension[]=[],lifts?:PmoLiftTransit,docks:readonly PmoDockExtension[]=[]
):CompiledTestGraph {
  const physical=new Map<string,readonly SpatialPoint[]>();
  const accepted:string[]=[], rejected:string[]=[];
  const supported=new Map<string,PmoRouteHelper>();
  for(const structure of structures){
    const access=accesses.find(a=>a.sourceId===structure.sourceId&&a.edgeId===structure.edgeId);
    if(!access?.attached || !access.geometryContinuous || !access.eligibleForPhysicalReview){
      rejected.push(`${structure.sourceId}:UNVERIFIED_PORT_OR_STRUCTURE`);continue;
    }
    if(structure.kind==='lift'&&!lifts?.has(structure.sourceId)){
      rejected.push(`${structure.sourceId}:NO_RUNTIME_CERTIFIED_LIFT_CABIN`);continue;
    }
    const start=connector.project(point(structure.from)), end=connector.project(point(structure.to));
    const certifiedDock=(side:0|1)=>docks.some(d=>d.structureSourceId===structure.sourceId&&d.side===side&&
      d3(d.to,side===0?structure.from:structure.to)<0.00001&&d.physicalSamples.length>=3);
    if(!(start&&d3(start,structure.from)<=.035)&&!certifiedDock(0)||
       !(end&&d3(end,structure.to)<=.035)&&!certifiedDock(1)){
      rejected.push(`${structure.sourceId}:ISLAND_PORT_UNATTACHED_NO_PHYSICAL_DOCK`);continue;
    }
    let samples:readonly SpatialPoint[]|null=null;
    if(structure.kind==='stairs')samples=sampleAuthoredStairTreads(structure);
    if(structure.kind==='lift')samples=[point(structure.from),
      point(structure.from.map((v,i)=>(v+structure.to[i])/2)),point(structure.to)];
    if(structure.kind==='bridge'){
      const native=samplePmoStructureSurface(structure,access);
      if(native.surfaceSampled) samples=native.points;
      else {rejected.push(`${structure.sourceId}:${native.issues.join('|')}`);continue;}
    }
    if(!samples || samples.length<3){rejected.push(`${structure.sourceId}:NO_CERTIFIED_PHYSICAL_SURFACE`);continue;}
    const p0=`portal:${structure.edgeId}:0`,p1=`portal:${structure.edgeId}:1`;
    if(!compiled.nodes[p0]||!compiled.nodes[p1]||
       !(compiled.outgoing[p0]||[]).some(e=>e.to===p1&&e.mode===structure.kind&&e.sourceId===structure.sourceId)||
       !(compiled.outgoing[p1]||[]).some(e=>e.to===p0&&e.mode===structure.kind&&e.sourceId===structure.sourceId)){
      rejected.push(`${structure.sourceId}:COMPILED_TRANSITION_EDGE_MISSING`);continue;
    }
    physical.set(structure.sourceId,samples);
    supported.set(structure.sourceId,{id:structure.sourceId,sourceId:structure.sourceId,
      edgeId:structure.edgeId,kind:structure.kind,from:point(structure.from),to:point(structure.to),capacity:structure.kind==='lift'?1:15});
    accepted.push(structure.sourceId);
  }
  for(const landing of landings){
    if(!compiled.nodes[landing.portalA]||!compiled.nodes[landing.portalB]||
      !(compiled.outgoing[landing.portalA]??[]).some(e=>e.to===landing.portalB&&e.mode==='stairs'&&e.sourceId===landing.id)){
      rejected.push(landing.id+':LANDING_NOT_IN_PRODUCTION_GRAPH');continue;
    }
    physical.set(landing.id,landing.physicalSamples);
    supported.set(landing.id,{id:landing.id,sourceId:landing.id,edgeId:landing.edgeId,
      kind:'stairs',from:[...landing.from],to:[...landing.to],capacity:15});
    accepted.push(landing.id);
  }
  for(const dock of docks){
    const from=compiled.nodes[dock.walkNodeId],to=compiled.nodes[dock.portalId];
    const f=(compiled.outgoing[dock.walkNodeId]??[]).some(e=>e.to===dock.portalId&&e.sourceId===dock.id&&e.mode===dock.kind);
    const r=(compiled.outgoing[dock.portalId]??[]).some(e=>e.to===dock.walkNodeId&&e.sourceId===dock.id&&e.mode===dock.kind);
    if(!from||!to||!f||!r||d3(from.position,dock.from)>.00001||d3(to.position,dock.to)>.00001||
       dock.physicalSamples.length<3||dock.treads.length<2){
      rejected.push(dock.id+':INVALID_PHYSICAL_DOCK');continue;
    }
    physical.set(dock.id,dock.physicalSamples);
    supported.set(dock.id,{id:dock.id,sourceId:dock.id,edgeId:dock.edgeId,
      kind:dock.kind,from:point(dock.from),to:point(dock.to),capacity:15});
    accepted.push(dock.id);
  }
  const entryIds=Object.keys(compiled.nodes).filter(id=>{
    const node=compiled.nodes[id];
    return node.role==='walk' || (node.role==='portal'&&(supported.has(node.sourceId)||
      (compiled.outgoing[id]??[]).some(e=>supported.has(e.sourceId))));
  }).sort();
  const indices=new Map(entryIds.map((id,i)=>[id,i]));
  const nodes=entryIds.map((id,i)=>({id:i,point:point(compiled.nodes[id].position),sources:[compiled.nodes[id].sourceId]}));
  const neighbors:BrushEdge[][]=entryIds.map(()=>[]);
  for(const [i,id] of entryIds.entries())for(const e of compiled.outgoing[id]??[]){
    const j=indices.get(e.to);if(j===undefined)continue;
    const start=nodes[i].point, end=nodes[j].point;
    if(e.mode==='walk'){
      if(!connector.verify(start,end)||!connector.verify(end,start))continue;
      neighbors[i].push({to:j,cost:d3(start,end),kind:'walk'});
    } else {
      const helper=supported.get(e.sourceId);
      if(!helper||e.mode!==helper.kind)continue;
      neighbors[i].push({to:j,cost:d3(start,end),kind:helper.kind,helperId:helper.id});
    }
  }
  return {
    graph:{nodes,neighbors,stamps:stamps.map(s=>({center:point(s.center),radius:s.radius,sourceId:s.sourceId})),
      helpers:Object.fromEntries(supported),rejectedHelpers:rejected.map(value=>({id:value.split(':')[0],reason:value})),
      rules:{step:0.18,maxWalkLink:0.32,maxGrade:0.72,maxStepY:0.20,paintHeightTolerance:0.52}},
    physical,accepted,rejected,sourceNodeCount:Object.keys(compiled.nodes).length,
  };
}
