/** Beach-rooted admission of physically rendered docks to AUTHORED PMO portals.
 *
 * The first dock compiler deliberately chooses the nearest surface. That is
 * insufficient: the nearest surface may belong to an isolated walk component.
 * This pass only adds a deck where the walk-side node is already connected to
 * the beach by admitted walk/surface edges. After each dock, it recomputes the
 * reachable set so new levels may serve as sources for later authored links.
 * No authored JSON is mutated; no unpainted ordinary walking is authorized.
 */
import type { NavigationGraph, NavEdge, NavNode, TerrainProjector } from './navigation';
import type { SpatialPoint, SpatialRegistry } from './registry';
import type { PmoTerrainConnector } from './pmoBrushCorridors';
import type { PmoStructure } from './pmoTransitionStructures';
import type { PmoLandingExtension } from './pmoLandingRepair';
import { drawableDock, type PmoDockExtension } from './pmoTransitionDockRepair';
import { assessPmoTransitionAccess } from './pmoTransitionAccess';
import { samplePmoStructureSurface } from './pmoTransitionSurface';
import { PmoLiftTransit } from './pmoLiftTransit';

const xz = (a: SpatialPoint,b: SpatialPoint) => Math.hypot(a[0]-b[0],a[2]-b[2]);
const d3 = (a: SpatialPoint,b: SpatialPoint) => Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const cp=(p:SpatialPoint):SpatialPoint=>[...p];

export interface ReachableDockRepair {
  graph: NavigationGraph;
  extensions: readonly PmoDockExtension[];
  diagnostics: readonly string[];
  reachableWalksBefore: number;
  reachableWalksAfter: number;
}

export function repairBeachReachableDocks(
  source: NavigationGraph, registry: SpatialRegistry,
  structures: readonly PmoStructure[], connector: PmoTerrainConnector,
  terrain: TerrainProjector, existingDocks: readonly PmoDockExtension[],
  landings: readonly PmoLandingExtension[],
): ReachableDockRepair {
  const graph:NavigationGraph={...source,nodes:{...source.nodes},outgoing:Object.fromEntries(
    Object.entries(source.outgoing).map(([id,edges])=>[id,[...edges]]))};
  const diagnostics:string[]=[],extensions:PmoDockExtension[]=[];
  const beach=registry.objects.filter(o=>o.name==='zone_main_beach'||o.name==='zone_main_beach_entries');
  const centers=beach.flatMap(o=>o.geometry.type==='paint'?
    o.geometry.strokes.flatMap(s=>s.points.map(p=>({point:p,radius:s.radius}))):[]);
  const walks=Object.values(graph.nodes).filter(n=>n.role==='walk');
  const seeds=walks.filter(n=>centers.some(c=>
    xz(n.position,c.point)<=c.radius+0.02&&Math.abs(n.position[1]-c.point[1])<=0.30));
  if(seeds.length===0){
    return {graph,extensions,diagnostics:['PMO_REACHABLE_DOCK_NO_CANONICAL_BEACH_SEED'],
      reachableWalksBefore:0,reachableWalksAfter:0};
  }
  const surfaceIds=new Set<string>([
    ...existingDocks.map(d=>d.id),...landings.map(d=>d.id)
  ]);
  const walkVerified=new Map<string,boolean>();
  const certifiedWalk=(a:NavNode,b:NavNode):boolean=>{
    const key=a.id<b.id?`${a.id}|${b.id}`:`${b.id}|${a.id}`;
    let result=walkVerified.get(key);
    if(result!==undefined)return result;
    const projectedA=connector.project(a.position),projectedB=connector.project(b.position);
    result=!!projectedA&&!!projectedB&&d3(projectedA,a.position)<0.035&&
      d3(projectedB,b.position)<0.035&&
      connector.verify(a.position,b.position)&&connector.verify(b.position,a.position);
    if(result){
      const distance=xz(a.position,b.position);
      const count=Math.max(1,Math.ceil(distance/0.006));
      let last=a.position;
      for(let i=1;i<=count;i++){
        const t=i/count;
        const point=connector.project([
          a.position[0]+(b.position[0]-a.position[0])*t,
          a.position[1]+(b.position[1]-a.position[1])*t,
          a.position[2]+(b.position[2]-a.position[2])*t]);
        if(!point){result=false;break;}
        const step=xz(last,point),height=Math.abs(last[1]-point[1]);
        if(height>0.075+1e-8||(step>1e-8&&height/step>0.72+1e-8)){
          result=false;break;
        }
        last=point;
      }
      if(result&&d3(last,b.position)>0.025)result=false;
    }
    walkVerified.set(key,result);
    return result;
  };
  /** Only certified special surfaces can propagate connectivity across levels. */
  const reach=():Set<string>=>{
    const accesses=assessPmoTransitionAccess(structures,graph);
    const admittedLifts=new PmoLiftTransit(structures,accesses,connector,[...existingDocks,...extensions]);
    const structureIds=new Set(structures.filter(s=>{
      const a=accesses.find(x=>x.edgeId===s.edgeId&&x.sourceId===s.sourceId);
      if(!a?.attached||!a.geometryContinuous)return false;
      if(s.kind==='lift')return admittedLifts.has(s.sourceId);
      return samplePmoStructureSurface(s,a).surfaceSampled;
    }).map(s=>s.sourceId));
    const seen=new Set<string>(seeds.map(n=>n.id)),queue=[...seen];
    for(let i=0;i<queue.length;i++){
      const current=queue[i],node=graph.nodes[current];
      for(const edge of graph.outgoing[current]??[]){
        const next=graph.nodes[edge.to];if(!next||seen.has(next.id))continue;
        if(!(graph.outgoing[next.id]??[]).some(reverse=>reverse.to===current&&reverse.mode===edge.mode&&reverse.sourceId===edge.sourceId))continue;
        const valid=edge.mode==='walk'?certifiedWalk(node,next):
          surfaceIds.has(edge.sourceId)||structureIds.has(edge.sourceId);
        if(!valid)continue;
        seen.add(next.id);queue.push(next.id);
      }
    }
    return seen;
  };
  let reachable=reach();
  const before=walks.filter(n=>reachable.has(n.id)).length;
  let updated=true;
  for(let pass=0;pass<structures.length*2&&updated;pass++){
    updated=false;
    for(const structure of structures){
      for(const side of [0,1] as const){
        const id=`portal:${structure.edgeId}:${side}`;
        const point=side===0?structure.from:structure.to;
        if(reachable.has(id))continue;
        // A physically reachable walk-side, not merely the geometrically nearest.
        const candidates=walks.filter(n=>reachable.has(n.id)&&xz(n.position,point)<=1.70&&
          Math.abs(n.position[1]-point[1])<=0.68)
          .sort((a,b)=>d3(a.position,point)-d3(b.position,point)||a.id.localeCompare(b.id));
        let chosen:{node:NavNode;surface:NonNullable<ReturnType<typeof drawableDock>>}|null=null;
        for(const node of candidates.slice(0,96)){
          const surface=drawableDock(node.position,point,connector,terrain);
          if(surface){chosen={node,surface};break;}
        }
        if(!chosen)continue;
        const sourceId=`pmo-dock:${structure.sourceId}:${side}:beach`;
        if(extensions.some(d=>d.id===sourceId)||existingDocks.some(d=>d.id===sourceId))continue;
        const portal=graph.nodes[id]??{id,position:cp(point),role:'portal' as const,sourceId:structure.sourceId};
        if(portal.role!=='portal'||portal.sourceId!==structure.sourceId||d3(portal.position,point)>1e-5)continue;
        graph.nodes[id]=portal;
        if(!graph.outgoing[id])graph.outgoing[id]=[];
        const from=chosen.node.position,to=point,len=d3(from,to);
        graph.outgoing[chosen.node.id]=[...(graph.outgoing[chosen.node.id]??[]),
          {to:id,mode:chosen.surface.kind,cost:len,sourceId}];
        graph.outgoing[id].push({to:chosen.node.id,mode:chosen.surface.kind,cost:len,sourceId});
        const extension:PmoDockExtension={id:sourceId,structureSourceId:structure.sourceId,
          edgeId:`${structure.edgeId}:dock:${side}:beach`,side,portalId:id,
          walkNodeId:chosen.node.id,kind:chosen.surface.kind,from:cp(from),to:cp(to),
          physicalSamples:chosen.surface.physicalSamples,treads:chosen.surface.treads};
        extensions.push(extension);surfaceIds.add(sourceId);
        // If the compiler discarded the original special edge because a portal
        // was unattached, restore it only when BOTH ends are now physically docked.
        const p0=`portal:${structure.edgeId}:0`,p1=`portal:${structure.edgeId}:1`;
        const hasDock=(portalId:string)=>!!graph.nodes[portalId]&&
          (graph.outgoing[portalId]??[]).some(e=>graph.nodes[e.to]?.role==='walk'&&
            (e.mode==='walk'&&e.sourceId===structure.sourceId||
             e.sourceId.startsWith(`pmo-dock:${structure.sourceId}:`)));
        if(hasDock(p0)&&hasDock(p1)){
          const add=(a:string,b:string)=>{
            if(!(graph.outgoing[a]??[]).some(e=>e.to===b&&e.sourceId===structure.sourceId))
              graph.outgoing[a].push({to:b,mode:structure.kind,cost:d3(structure.from,structure.to),sourceId:structure.sourceId});
          };
          add(p0,p1);add(p1,p0);
        }
        diagnostics.push(`PMO_BEACH_DOCK_PHYSICAL:${structure.sourceId}:${side}:${chosen.node.id}:${len.toFixed(3)}`);
        reachable=reach();updated=true;
      }
    }
  }
  const after=walks.filter(n=>reachable.has(n.id)).length;
  diagnostics.push(`PMO_BEACH_DOCK_REACHABLE_WALKS:${before}->${after};new_docks=${extensions.length}`);
  for(const s of structures){
    for(const side of [0,1] as const){
      const id=`portal:${s.edgeId}:${side}`;
      if(!reachable.has(id))diagnostics.push(`PMO_BEACH_PORT_STILL_ISOLATED:${s.sourceId}:${side}`);
    }
  }
  return {graph,extensions,diagnostics,reachableWalksBefore:before,reachableWalksAfter:after};
}
