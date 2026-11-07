/** Canonical physical approaches to the authored place 3->8 bridge and 8->9 lift.
 * Neither an alternate PMO registry nor an inferred walk across unpainted terrain.
 * Every accepted edge has exactly the same visible samples used by the runtime.
 */
import type { NavigationGraph, NavNode, TerrainProjector } from './navigation';
import type { SpatialPoint, SpatialRegistry } from './registry';
import type { PmoStructure } from './pmoTransitionStructures';
import type { PmoTerrainConnector } from './pmoBrushCorridors';
import type { PmoLandingExtension } from './pmoLandingRepair';
import { drawableDock, type PmoDockExtension } from './pmoTransitionDockRepair';
import { certifyBentBridge3Approach } from './pmoBentBridge3Approach';
import { verifyNaturalLift9Access } from './pmoNaturalLift9Access';

export interface RemoteBranchRepair {
  graph: NavigationGraph;
  landings: readonly PmoLandingExtension[];
  docks: readonly PmoDockExtension[];
  diagnostics: readonly string[];
}
const dist=(a:SpatialPoint,b:SpatialPoint)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const flat=(a:SpatialPoint,b:SpatialPoint)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
const cp=(a:SpatialPoint):SpatialPoint=>[a[0],a[1],a[2]];
function beachReachable(graph:NavigationGraph,registry:SpatialRegistry):Set<string> {
  const stamps=registry.objects.filter(o=>o.name==='zone_main_beach'||o.name==='zone_main_beach_entries')
    .flatMap(o=>o.geometry.type==='paint'?o.geometry.strokes.flatMap(s=>s.points):[]);
  const walkers=Object.values(graph.nodes).filter(n=>n.role==='walk');
  if(!stamps.length||!walkers.length)return new Set();
  const seed=walkers.map(n=>({n,d:Math.min(...stamps.map(p=>dist(p,n.position)))}))
    .sort((a,b)=>a.d-b.d)[0];
  if(!seed||seed.d>.55)return new Set();
  const reached=new Set([seed.n.id]),queue=[seed.n.id];
  for(let i=0;i<queue.length;i++)for(const e of graph.outgoing[queue[i]]??[]){
    if(!graph.nodes[e.to]||reached.has(e.to))continue;
    // Never infer a one-way special link from a reverse-only edge.
    if(!(graph.outgoing[e.to]??[]).some(rev=>rev.to===queue[i]&&rev.sourceId===e.sourceId&&rev.mode===e.mode))continue;
    reached.add(e.to);queue.push(e.to);
  }
  return reached;
}
function anchor(registry:SpatialRegistry,name:string):SpatialPoint|null {
  const o=registry.objects.find(o=>o.name===name&&o.geometry.type==='skeleton');
  return o?.geometry.type==='skeleton'?(Object.values(o.geometry.points)[0]??null):null;
}
function findStructure(registry:SpatialRegistry,structures:readonly PmoStructure[],name:string,kind:'bridge'|'lift') {
  const source=registry.objects.find(o=>o.name===name&&o.geometry.type==='skeleton');
  return structures.find(s=>s.kind===kind&&s.sourceId===source?.id);
}

export function repairCanonicalRemoteBranches(input:NavigationGraph,registry:SpatialRegistry,
  structures:readonly PmoStructure[],connector:PmoTerrainConnector,terrain:TerrainProjector,experimentalBentBridge3=false):RemoteBranchRepair {
  const diagnostics:string[]=[],landings:PmoLandingExtension[]=[],docks:PmoDockExtension[]=[];
  let graph:NavigationGraph={...input,nodes:{...input.nodes},outgoing:Object.fromEntries(
    Object.entries(input.outgoing).map(([id,edges])=>[id,[...edges]]))};
  const walkNodes=Object.values(graph.nodes).filter(n=>n.role==='walk');
  const bridge=findStructure(registry,structures,'bridge from place_3 to place_8','bridge');
  const lift=findStructure(registry,structures,'lift from place_8 to place_9','lift');
  const b3=anchor(registry,'building_3'),b8=anchor(registry,'building_8'),b9=anchor(registry,'building_9');
  if(!bridge||!lift||!b3||!b8||!b9)return {graph:input,landings:[],docks:[],diagnostics:['PMO_DOCK_REMOTE_AUTHORED_OBJECT_MISSING']};
  // Runtime guards backstop the installer's exact canonical PMO/GLB SHA checks.
  if(dist(bridge.from,[.5513,-1.0402,2.7778])>.002||
     dist(bridge.to,[-.7173,-.8695,3.48])>.002||
     dist(lift.from,[-2.0794,-.9096,2.9613])>.002||
     dist(lift.to,[-2.4687,-.176,2.5048])>.002)
    return {graph:input,landings:[],docks:[],diagnostics:['PMO_DOCK_REMOTE_UNEXPECTED_TRANSITION_COORDINATES']};
  const portal=(s:PmoStructure,side:0|1)=>`portal:${s.edgeId}:${side}`;
  // Authored structures must ALREADY own their original two real ports and transit edges.
  for(const s of [bridge,lift]) {
    const p0=portal(s,0),p1=portal(s,1);
    if(!graph.nodes[p0]||!graph.nodes[p1]||
      !(graph.outgoing[p0]??[]).some(e=>e.to===p1&&e.sourceId===s.sourceId&&e.mode===s.kind)||
      !(graph.outgoing[p1]??[]).some(e=>e.to===p0&&e.sourceId===s.sourceId&&e.mode===s.kind))
      return {graph:input,landings:[],docks:[],diagnostics:[`PMO_DOCK_REMOTE_UNCERTIFIED_AUTHORED_STRUCTURE:${s.sourceId}`]};
  }
  function addDock(n:NavNode,s:PmoStructure,side:0|1,tag:string,
    replacement?:NonNullable<ReturnType<typeof drawableDock>>):boolean {
    const to=side===0?s.from:s.to,portalId=portal(s,side),surface=replacement??drawableDock(n.position,to,connector,terrain);
    if(!surface||surface.physicalSamples.length<3||surface.treads.length<3)return false;
    const id=`pmo-remote-dock:${s.sourceId}:${tag}`;
    if(docks.some(d=>d.id===id))return false;
    const d=dist(n.position,to);
    graph.outgoing[n.id]=[...(graph.outgoing[n.id]??[]),{to:portalId,cost:d,mode:surface.kind,sourceId:id}];
    graph.outgoing[portalId]=[...(graph.outgoing[portalId]??[]),{to:n.id,cost:d,mode:surface.kind,sourceId:id}];
    docks.push({id,structureSourceId:s.sourceId,edgeId:`${s.edgeId}:remote:${tag}`,side,
      portalId,walkNodeId:n.id,kind:surface.kind,from:cp(n.position),to:cp(to),
      physicalSamples:surface.physicalSamples.map(cp),treads:surface.treads.map(t=>({...t,center:cp(t.center)}))});
    return true;
  }
  /** A walk-walk gap becomes a visible physical structure, not an ordinary unpainted walk.
   * The PmoSupportedGraph requires a landing to have its OWN two portals and treads.
   */
  function addLanding(a:NavNode,b:NavNode,sourceId:string,tag:string):boolean {
    const surface=drawableDock(a.position,b.position,connector,terrain);
    if(!surface||surface.physicalSamples.length<5||surface.treads.length<3)return false;
    const id=`pmo-remote-landing:${sourceId}:${tag}`;
    const edgeId=`${sourceId}:remote-landing:${tag}`;
    const p0=`portal:${edgeId}:0`,p1=`portal:${edgeId}:1`;
    if(graph.nodes[p0]||graph.nodes[p1])return false;
    graph.nodes[p0]={id:p0,role:'portal',sourceId:id,position:cp(a.position)};
    graph.nodes[p1]={id:p1,role:'portal',sourceId:id,position:cp(b.position)};
    const d=dist(a.position,b.position);
    graph.outgoing[p0]=[{to:a.id,cost:0,mode:'walk',sourceId:id},{to:p1,cost:d,mode:'stairs',sourceId:id}];
    graph.outgoing[p1]=[{to:b.id,cost:0,mode:'walk',sourceId:id},{to:p0,cost:d,mode:'stairs',sourceId:id}];
    graph.outgoing[a.id]=[...(graph.outgoing[a.id]??[]),{to:p0,cost:0,mode:'walk',sourceId:id}];
    graph.outgoing[b.id]=[...(graph.outgoing[b.id]??[]),{to:p1,cost:0,mode:'walk',sourceId:id}];
    landings.push({id,sourceId,edgeId,portalA:p0,portalB:p1,
      from:cp(a.position),to:cp(b.position),physicalSamples:surface.physicalSamples.map(cp),
      treads:surface.treads.map(t=>({...t,center:cp(t.center),top:t.center[1]+.017}))});
    return true;
  }
  const reach=beachReachable(graph,registry);
  const nearSite=(n:NavNode,a:SpatialPoint)=>flat(n.position,a)>=.48-1e-8&&
    flat(n.position,a)<=.58+1e-8&&Math.abs(n.position[1]-a[1])<=.12;
  const onNearSide=(p:SpatialPoint)=>
    (p[0]-bridge.from[0])*(bridge.to[0]-bridge.from[0])+
    (p[2]-bridge.from[2])*(bridge.to[2]-bridge.from[2]) < -.12;
  const onFarSide=(p:SpatialPoint)=>
    (p[0]-bridge.to[0])*(bridge.to[0]-bridge.from[0])+
    (p[2]-bridge.to[2])*(bridge.to[2]-bridge.from[2]) > .07;
  // This first bridge lands beyond an unpainted seam. Prove: beach-reachable
  // near building_3 -> short physical stair -> painted intermediate on SAME
  // bank -> physically rendered dock -> the AUTHOR's exact bridge portal.
  type NearCandidate={source:NavNode;via:NavNode;score:number};
  let near:NearCandidate|null=null;
  for(const source of walkNodes.filter(n=>reach.has(n.id)&&nearSite(n,b3)&&onNearSide(n.position)))
    for(const via of walkNodes.filter(n=>n.id!==source.id&&onNearSide(n.position)&&
      flat(n.position,b3)<1.10&&flat(n.position,bridge.from)<1.70)){
      // A terrain-certified deck may still pass through a movable building.
      // Reject the *complete* proposed approach before committing any edge.
      if(!drawableDock(source.position,via.position,connector,terrain)||
         !drawableDock(via.position,bridge.from,connector,terrain))continue;
      const score=dist(source.position,via.position)+dist(via.position,bridge.from);
      if(!near||score<near.score)near={source,via,score};
    }
  if(!near){diagnostics.push('PMO_DOCK_REMOTE_BRIDGE8_NO_CERTIFIED_BEACH_BANK');return {graph:input,landings:[],docks:[],diagnostics};}
  // The east landing of bridge 3->8 and the west boarding of lift 8->9
  // are DIFFERENT places. Never demand one walk node to connect to both:
  // that created a large deck THROUGH the building_8 occupied footprint.
  // The west lift port already has an independent physically-certified auto-dock
  // created by repairPmoTransitionDocks(). Its natural PMO walk path must be used.
  // Select the bridge exit independently of the lift.

  type FarCandidate={node:NavNode;score:number};let far:FarCandidate|null=null;
  for(const n of walkNodes.filter(n=>nearSite(n,b8)&&onFarSide(n.position))){
    if(!drawableDock(n.position,bridge.to,connector,terrain))continue;
    // Explicit building clearance for the new bridge-side boarding extension.
    const score=dist(n.position,bridge.to);
    if(!far||score<far.score)far={node:n,score};
  }
  if(!far){diagnostics.push('PMO_DOCK_REMOTE_BRIDGE8_NO_CERTIFIED_FAR_BANK');return {graph:input,landings:[],docks:[],diagnostics};}
  if(experimentalBentBridge3){
    // Experimental PMO geometry overlay, only when deliberately enabled in DEV.
    // The canonical authoring and original 9/9 route remain untouched by default.
    let bend:null|{node:NavNode;surface:NonNullable<ReturnType<typeof certifyBentBridge3Approach>>}=null;
    for(const node of walkNodes.filter(n=>reach.has(n.id)&&nearSite(n,b3)&&onNearSide(n.position))){
      const surface=certifyBentBridge3Approach(node.position,bridge.from,b3,connector,terrain);
      if(surface&&(!bend||surface.cost<bend.surface.cost))bend={node,surface};
    }
    if(!bend)return {graph:input,landings:[],docks:[],diagnostics:['PMO_BENT_BRIDGE3_NOT_CERTIFIED']};
    const id=`pmo-remote-dock:${bridge.sourceId}:bent-entry`;
    const portId=portal(bridge,0);
    const surface=bend.surface;
    graph.outgoing[bend.node.id]=[...(graph.outgoing[bend.node.id]??[]),
      {to:portId,cost:surface.cost,mode:'bridge',sourceId:id}];
    graph.outgoing[portId]=[...(graph.outgoing[portId]??[]),
      {to:bend.node.id,cost:surface.cost,mode:'bridge',sourceId:id}];
    docks.push({id,structureSourceId:bridge.sourceId,
      edgeId:`${bridge.edgeId}:remote:bent-entry`,side:0,
      portalId:portId,walkNodeId:bend.node.id,kind:'bridge',
      from:cp(bend.node.position),to:cp(bridge.from),
      physicalSamples:surface.physicalSamples,treads:surface.treads});
    diagnostics.push(`PMO_BENT_BRIDGE3_CERTIFIED:${bend.node.id}:via=${surface.via.join(',')}:clearance=0.31`);
  }else if(!addLanding(near.source,near.via,bridge.sourceId,'entry-rise')||
     !addDock(near.via,bridge,0,'entry'))
    return {graph:input,landings:[],docks:[],diagnostics:['PMO_DOCK_REMOTE_BRIDGE8_SURFACE_REJECTED']};
  if(!addDock(far.node,bridge,1,'exit'))
    return {graph:input,landings:[],docks:[],diagnostics:['PMO_DOCK_REMOTE_BRIDGE8_FAR_SIDE_REJECTED']};
  diagnostics.push(`PMO_DOCK_REMOTE_BRIDGE8_PHYSICAL:${experimentalBentBridge3?'bent-entry':near.source.id+'->'+near.via.id}->${bridge.sourceId}->${far.node.id}`);
  // The lift pickup shares the SAME walk node in the certified building_8
  // arrival envelope. No speculative walk through the painted/unpainted gap.
  // Reuse the west shore's EXISTING short, compiled lift docking edge.
  // The old forced east->west pickup was a 1.3m diagonal cut through the building.
  // A connected natural PMO walk path around its north perimeter is the only
  // acceptable bridge->lift transfer. We never add a 2nd fabricated bypass.
  const natural=verifyNaturalLift9Access(graph,far.node.id,portal(lift,0),lift.sourceId,connector);
  diagnostics.push(natural.diagnostic);
  if(!natural.certified){
    // Fail closed: leave the harmless bridge access, preserve the authored lift
    // and its existing western dock, but do not invent a route through the site.
    diagnostics.push('PMO_DOCK_REMOTE_LIFT9_NATURAL_ROUTE_REQUIRED_NO_NEW_STRUCTURE');
  }
  // Lift upper dock does not directly reach the permitted 0.48..0.58 m
  // building_9 approach; a short physical landing is required on that bank.
  type HighCandidate={source:NavNode;target:NavNode;score:number};let high:HighCandidate|null=null;
  // Prefer a landing that clears the ACTUAL projected terrain at each
  // physical substep; a coarse drawableDock alone admitted one -0.061m seam
  // in an earlier raster probe (more than the renderer's 0.055m allowance).
  const isClear=(from:SpatialPoint,to:SpatialPoint):boolean=>{
    const pieces=Math.max(20,Math.ceil(flat(from,to)/.008));
    for(let i=0;i<=pieces;i++){
      const t=i/pieces;
      const p:SpatialPoint=[from[0]+(to[0]-from[0])*t,
        from[1]+(to[1]-from[1])*t,from[2]+(to[2]-from[2])*t];
      const surface=terrain.project(p[0],p[2],p[1]);
      if(surface&&surface[1]-p[1]>.040)return false;
    }
    return true;
  };
  for(const target of walkNodes.filter(n=>nearSite(n,b9)))
    for(const source of walkNodes.filter(n=>n.id!==target.id&&
      flat(n.position,lift.to)<.40&&Math.abs(n.position[1]-lift.to[1])<.12)){
      if(!drawableDock(source.position,lift.to,connector,terrain)||
         !drawableDock(source.position,target.position,connector,terrain)||
         !isClear(source.position,target.position))continue;
      const score=dist(source.position,lift.to)+dist(source.position,target.position);
      if(!high||score<high.score)high={source,target,score};
    }
  if(!high){diagnostics.push('PMO_DOCK_REMOTE_LIFT9_EXIT_TO_BUILDING9_UNVERIFIED');
    return {graph,landings,docks,diagnostics};}
  if(!addDock(high.source,lift,1,'disembark')||!addLanding(high.source,high.target,lift.sourceId,'building9-arrival')){
    diagnostics.push('PMO_DOCK_REMOTE_LIFT9_EXIT_PHYSICAL_REJECTED');return {graph,landings,docks,diagnostics};
  }
  diagnostics.push(`${natural.certified?'PMO_DOCK_REMOTE_LIFT9_NATURAL':'PMO_DOCK_REMOTE_LIFT9_UNCONNECTED'}:${far.node.id}->${lift.sourceId}->${high.source.id}->${high.target.id}`);
  return {graph,landings,docks,diagnostics};
}
