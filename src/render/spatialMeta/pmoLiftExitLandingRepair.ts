/** One physical, visible disembarkation stair adjacent to the AUTHORED lift 5->6.
 *
 * The lift's high dock currently ends on a small terrace. A narrow steep
 * terrain seam separates that terrace from the existing PMO-painted walk to
 * building_6. This compiler extends only the authored lift exit; it never
 * changes PMO, authorizes generic terrain, or moves a portal to another site.
 */
import type {NavigationGraph, NavNode, TerrainProjector} from './navigation';
import type {SpatialRegistry, SpatialPoint} from './registry';
import type {PmoStructure} from './pmoTransitionStructures';
import type {PmoTerrainConnector} from './pmoBrushCorridors';
import type {PmoLandingExtension} from './pmoLandingRepair';
import {drawableDock} from './pmoTransitionDockRepair';

const xz=(a:SpatialPoint,b:SpatialPoint)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
const d3=(a:SpatialPoint,b:SpatialPoint)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const copy=(p:SpatialPoint):SpatialPoint=>[...p];
export interface LiftExitLandingRepair {
  graph:NavigationGraph;
  extensions:readonly PmoLandingExtension[];
  diagnostics:readonly string[];
}
export function repairAuthoredLiftExitLanding(graph:NavigationGraph,registry:SpatialRegistry,
  structures:readonly PmoStructure[],connector:PmoTerrainConnector,
  terrain:TerrainProjector):LiftExitLandingRepair {
  const failed=(reason:string):LiftExitLandingRepair=>({graph,extensions:[],diagnostics:[reason]});
  const liftId=registry.objects.find(o=>o.name==='lift from place_5 to place_6'&&o.geometry.type==='skeleton')?.id;
  const lift=structures.find(s=>s.sourceId===liftId&&s.kind==='lift');
  const building=registry.objects.find(o=>o.name==='building_6'&&o.geometry.type==='skeleton');
  if(!lift||!building||building.geometry.type!=='skeleton')return failed('PMO_LIFT_EXIT_AUTHORING_MISSING');
  const destination=Object.values(building.geometry.points)[0];
  if(!destination)return failed('PMO_LIFT_EXIT_BUILDING_ANCHOR_MISSING');
  // Only the real high dock, with a graph-certified physical attachment.
  const highSide=lift.from[1]>lift.to[1]?0:1;
  const high=highSide===0?lift.from:lift.to;
  const portalId=`portal:${lift.edgeId}:${highSide}`;
  const portal=graph.nodes[portalId];
  if(!portal||d3(portal.position,high)>1e-5)return failed('PMO_LIFT_EXIT_PORTAL_MISSING');
  const nearWalks=(graph.outgoing[portalId]??[]).map(e=>graph.nodes[e.to])
    .filter((n):n is NavNode=>!!n&&n.role==='walk'&&xz(n.position,high)<.48&&
      Math.abs(n.position[1]-high[1])<.12);
  const walks=Object.values(graph.nodes).filter(n=>n.role==='walk');
  type Candidate={a:NavNode;b:NavNode;surface:NonNullable<ReturnType<typeof drawableDock>>;score:number};
  let best:Candidate|null=null;
  for(const a of nearWalks) for(const b of walks){
    if(a.id===b.id)continue;
    const h=xz(a.position,b.position),rise=Math.abs(a.position[1]-b.position[1]);
    if(h<.09||h>.32||rise<.10||rise>.32||rise/h<=.72)continue;
    if(d3(b.position,destination)>=d3(a.position,destination)-.045)continue;
    if(xz(b.position,high)>.75)continue;
    const pa=connector.project(a.position),pb=connector.project(b.position);
    if(!pa||!pb||d3(pa,a.position)>.025||d3(pb,b.position)>.025)continue;
    const surface=drawableDock(a.position,b.position,connector,terrain);
    if(!surface||surface.kind!=='stairs'||surface.treads.length<3)continue;
    const score=h+rise*.15+d3(b.position,destination)*.02;
    if(!best||score<best.score)best={a,b,surface,score};
  }
  if(!best)return failed('PMO_LIFT_EXIT_NO_PHYSICAL_STAIR');
  const {a,b,surface}=best;
  const id=`pmo-lift-exit:${lift.sourceId}`;
  const edgeId=`${lift.edgeId}:physical-exit-landing`;
  const portalA=`portal:${edgeId}:0`,portalB=`portal:${edgeId}:1`;
  if(graph.nodes[portalA]||graph.nodes[portalB])return failed('PMO_LIFT_EXIT_DUPLICATE');
  const nodes={...graph.nodes,
    [portalA]:{id:portalA,position:copy(a.position),role:'portal' as const,sourceId:id},
    [portalB]:{id:portalB,position:copy(b.position),role:'portal' as const,sourceId:id}};
  const outgoing=Object.fromEntries(Object.entries(graph.outgoing).map(([key,edges])=>[key,[...edges]]));
  outgoing[portalA]=[{to:a.id,cost:0,mode:'walk' as const,sourceId:id},
    {to:portalB,cost:d3(a.position,b.position),mode:'stairs' as const,sourceId:id}];
  outgoing[portalB]=[{to:b.id,cost:0,mode:'walk' as const,sourceId:id},
    {to:portalA,cost:d3(a.position,b.position),mode:'stairs' as const,sourceId:id}];
  outgoing[a.id]=[...(outgoing[a.id]??[]),{to:portalA,cost:0,mode:'walk' as const,sourceId:id}];
  outgoing[b.id]=[...(outgoing[b.id]??[]),{to:portalB,cost:0,mode:'walk' as const,sourceId:id}];
  const extension:PmoLandingExtension={id,sourceId:lift.sourceId,edgeId,
    portalA,portalB,from:copy(a.position),to:copy(b.position),
    physicalSamples:surface.physicalSamples.map(copy),
    treads:surface.treads.map(t=>({...t,center:copy(t.center),top:t.center[1]+.017}))};
  return {graph:{...graph,nodes,outgoing},extensions:[extension],diagnostics:[
    `PMO_LIFT_EXIT_PHYSICAL_STAIR:${lift.sourceId}:${a.id}->${b.id}:${xz(a.position,b.position).toFixed(3)}`]};
}
