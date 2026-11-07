/** A pair of physical, visible approach surfaces at the exit of the AUTHORED
 * 6 -> 7 bridge. This repair is specific to the published PMO/GLB topology.
 * It does not authorize ordinary walking outside paint or invent a teleport.
 */
import type { NavigationGraph, NavNode, TerrainProjector, NavEdge } from './navigation';
import type { SpatialRegistry, SpatialPoint } from './registry';
import type { PmoStructure } from './pmoTransitionStructures';
import type { PmoTerrainConnector } from './pmoBrushCorridors';
import type { PmoLandingExtension } from './pmoLandingRepair';
import type { PmoDockExtension } from './pmoTransitionDockRepair';
import { drawableDock } from './pmoTransitionDockRepair';

const dist = (a:SpatialPoint,b:SpatialPoint) => Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const horizontal = (a:SpatialPoint,b:SpatialPoint) => Math.hypot(a[0]-b[0],a[2]-b[2]);
const copy = (v:SpatialPoint):SpatialPoint => [...v];

export interface Bridge7RepairResult {
  readonly graph: NavigationGraph;
  readonly extensions: readonly PmoLandingExtension[];
  readonly docks: readonly PmoDockExtension[];
  readonly diagnostics: readonly string[];
}

/** Refuse changes to a different island layout; these are measured seam probes,
 * not a second authored registry. The sourceId remains the authored bridge ID.
 */
export function repairAuthoredBridge7Bank(
  initial:NavigationGraph, registry:SpatialRegistry, structures:readonly PmoStructure[],
  connector:PmoTerrainConnector, terrain:TerrainProjector,
):Bridge7RepairResult {
  const failed = (code:string):Bridge7RepairResult => ({graph:initial,extensions:[],docks:[],diagnostics:[code]});
  const author=registry.objects.find(o=>o.name==='bridge from place_6 to place_7'&&o.geometry.type==='skeleton');
  const site=registry.objects.find(o=>o.name==='building_7'&&o.geometry.type==='skeleton');
  const bridge=structures.find(s=>s.sourceId===author?.id&&s.kind==='bridge');
  if(!bridge||!site||site.geometry.type!=='skeleton')return failed('PMO_BRIDGE7_AUTHORED_OBJECT_MISSING');
  const buildingAnchor=Object.values(site.geometry.points)[0];
  if(!buildingAnchor)return failed('PMO_BRIDGE7_BUILDING_ANCHOR_MISSING');
  if(dist(bridge.to,[-0.0104,-0.0295,-3.4471])>.002||
     dist(bridge.from,[1.8613,0.2132,-2.6254])>.002)
    return failed('PMO_BRIDGE7_UNEXPECTED_AUTHORED_GEOMETRY');
  const walkers=Object.values(initial.nodes).filter(n=>n.role==='walk');
  // Anchors are observations of the published GLB mesh, not new authoring.
  const probes:readonly SpatialPoint[]=[
    [-0.84,-0.215071,-3.22],
    [-0.84,-0.361601,-3.36],
    [-1.68,-0.408847,-3.50],
  ];
  const selected:NavNode[]=[];
  for(const target of probes){
    const options=walkers.filter(n=>horizontal(n.position,target)<0.019&&
      Math.abs(n.position[1]-target[1])<0.033)
      .sort((a,b)=>dist(a.position,target)-dist(b.position,target));
    if(!options.length)return failed('PMO_BRIDGE7_GLB_SEAM_NOT_FOUND');
    const node=options[0];
    const hit=connector.project(node.position);
    if(!hit||dist(hit,node.position)>.028)return failed('PMO_BRIDGE7_TERRAIN_NOT_CERTIFIED');
    selected.push(node);
  }
  if(new Set(selected.map(n=>n.id)).size!==3)return failed('PMO_BRIDGE7_DUPLICATED_ANCHOR');
  // The entry must be locally tied to the actual authored bridge exit.
  if(horizontal(selected[0].position,bridge.to)>1.1||
     horizontal(selected[2].position,buildingAnchor)>0.75)
    return failed('PMO_BRIDGE7_NOT_LOCAL_TO_AUTHORED_TRANSIT');
  const graph:NavigationGraph={...initial,nodes:{...initial.nodes},outgoing:Object.fromEntries(
    Object.entries(initial.outgoing).map(([id,edges])=>[id,[...edges]]))};
  const extensions:PmoLandingExtension[]=[];
  // Connect the ORIGINAL near bridge portal from an ALREADY BEACH-REACHABLE
  // walk on the building_6 side. Do not treat an isolated local portal snap
  // as evidence that this bridge is usable.
  const beachPaint=registry.objects.filter(o=>o.name==='zone_main_beach'||o.name==='zone_main_beach_entries')
    .flatMap(o=>o.geometry.type==='paint'?o.geometry.strokes.flatMap(s=>s.points):[]);
  const beachWalk=walkers.map(n=>({n,d:Math.min(...beachPaint.map(p=>dist(n.position,p)))}))
    .sort((a,b)=>a.d-b.d)[0];
  if(!beachWalk||beachWalk.d>0.55)return failed('PMO_BRIDGE7_BEACH_WALK_NOT_FOUND');
  const reach=new Set<string>([beachWalk.n.id]),pending=[beachWalk.n.id];
  for(let i=0;i<pending.length;i++)for(const e of graph.outgoing[pending[i]]??[]){
    if(!graph.nodes[e.to]||reach.has(e.to))continue;
    if(!(graph.outgoing[e.to]??[]).some(r=>r.to===pending[i]&&r.mode===e.mode&&r.sourceId===e.sourceId))continue;
    reach.add(e.to);pending.push(e.to);
  }
  const approachCandidates=walkers.filter(n=>reach.has(n.id)&&horizontal(n.position,bridge.from)<1.70&&
    dist(n.position,bridge.from)<1.83&&horizontal(n.position,bridge.from)<horizontal(n.position,bridge.to))
    .sort((a,b)=>dist(a.position,bridge.from)-dist(b.position,bridge.from));
  let approach:{node:NavNode;surface:NonNullable<ReturnType<typeof drawableDock>>}|null=null;
  for(const node of approachCandidates){
    // Choose only a genuinely verified structure, not an unreachable adjacent
    // walk lattice cell. The surface is rendered by PmoTransitionStructures.
    const surface=drawableDock(node.position,bridge.from,connector,terrain);
    if(surface){approach={node,surface};break;}
  }
  if(!approach)return failed('PMO_BRIDGE7_NEAR_BANK_NO_PHYSICAL_DOCK');
  const originalPortalId=`portal:${bridge.edgeId}:0`;
  if(!graph.nodes[originalPortalId])return failed('PMO_BRIDGE7_ORIGINAL_PORT_MISSING');
  const dockId=`pmo-bridge7-near-bank:${bridge.sourceId}`;
  const dockCost=dist(approach.node.position,bridge.from);
  graph.outgoing[approach.node.id]=[...(graph.outgoing[approach.node.id]??[]),
    {to:originalPortalId,cost:dockCost,mode:approach.surface.kind,sourceId:dockId}];
  graph.outgoing[originalPortalId]=[...(graph.outgoing[originalPortalId]??[]),
    {to:approach.node.id,cost:dockCost,mode:approach.surface.kind,sourceId:dockId}];
  const docks:PmoDockExtension[]=[{id:dockId,structureSourceId:bridge.sourceId,edgeId:`${bridge.edgeId}:near-bank`,
    side:0,portalId:originalPortalId,walkNodeId:approach.node.id,kind:approach.surface.kind,
    from:copy(approach.node.position),to:copy(bridge.from),
    physicalSamples:approach.surface.physicalSamples.map(copy),
    treads:approach.surface.treads.map(t=>({...t,center:copy(t.center)}))}];
  for(let i=0;i<2;i++){
    const a=selected[i],b=selected[i+1];
    const surface=drawableDock(a.position,b.position,connector,terrain);
    if(!surface||surface.physicalSamples.length<4||surface.treads.length<3)
      return failed(`PMO_BRIDGE7_PHYSICAL_SPAN_FAILED:${i}`);
    const id=`pmo-bridge7-access:${bridge.sourceId}:${i}`;
    const edgeId=`${bridge.edgeId}:bank-access:${i}`;
    const p0=`portal:${edgeId}:0`,p1=`portal:${edgeId}:1`;
    if(graph.nodes[p0]||graph.nodes[p1])return failed('PMO_BRIDGE7_DUPLICATE');
    graph.nodes[p0]={id:p0,role:'portal',sourceId:id,position:copy(a.position)};
    graph.nodes[p1]={id:p1,role:'portal',sourceId:id,position:copy(b.position)};
    // This is a constructed helper, not unpainted ordinary walking.
    const across:NavEdge={to:p1,cost:dist(a.position,b.position),mode:'stairs',sourceId:id};
    graph.outgoing[p0]=[{to:a.id,cost:0,mode:'walk',sourceId:id},across];
    graph.outgoing[p1]=[{to:b.id,cost:0,mode:'walk',sourceId:id},
      {to:p0,cost:across.cost,mode:'stairs',sourceId:id}];
    graph.outgoing[a.id]=[...(graph.outgoing[a.id]??[]),{to:p0,cost:0,mode:'walk',sourceId:id}];
    graph.outgoing[b.id]=[...(graph.outgoing[b.id]??[]),{to:p1,cost:0,mode:'walk',sourceId:id}];
    extensions.push({id,sourceId:bridge.sourceId,edgeId,portalA:p0,portalB:p1,
      from:copy(a.position),to:copy(b.position),physicalSamples:surface.physicalSamples.map(copy),
      treads:surface.treads.map(t=>({...t,center:copy(t.center),top:t.center[1]+.017}))});
  }
  return {graph,extensions,docks,diagnostics:[
    `PMO_BRIDGE7_NEAR_BANK_DOCK:${approach.node.id}:${dockCost.toFixed(3)}`,
    ...extensions.map(x=>`PMO_BRIDGE7_PHYSICAL_ACCESS:${x.id}:${dist(x.from,x.to).toFixed(3)}`)]};
}
