/** Derived, physically rendered boarding approaches for authored PMO infrastructure.
 * Never rewrites the published registry. A boarding deck exists only if it has
 * an authored transition endpoint, a physically certified walk-side anchor,
 * and a collision-free, finite, short structural surface between them.
 */
import type {NavigationGraph, NavEdge, NavNode, TerrainProjector} from './navigation';
import type {SpatialPoint} from './registry';
import type {PmoStructure} from './pmoTransitionStructures';
import type {PmoTerrainConnector} from './pmoBrushCorridors';

export interface PmoDockExtension {
  id:string; structureSourceId:string; edgeId:string; side:0|1;
  kind:'stairs'|'bridge'; portalId:string; walkNodeId:string;
  from:SpatialPoint; to:SpatialPoint; physicalSamples:SpatialPoint[];
  /** Every rendered surface is also a route surface, not an invisible link. */
  treads:{center:SpatialPoint;length:number;width:number;yaw:number}[];
}
const xz=(a:SpatialPoint,b:SpatialPoint)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
const d3=(a:SpatialPoint,b:SpatialPoint)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const lerp=(a:SpatialPoint,b:SpatialPoint,t:number):SpatialPoint=>[
  a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
const cp=(p:SpatialPoint):SpatialPoint=>[...p];
/** The compiler's coarse portal snap must not be mistaken for a traversable
 * real-terrain step. Validate at the actor's physical microstep resolution. */
function physicallyWalkablePortal(a:SpatialPoint,b:SpatialPoint,connector:PmoTerrainConnector):boolean {
  const start=connector.project(a),end=connector.project(b);
  if(!start||!end||d3(start,a)>0.035||d3(end,b)>0.035||
    !connector.verify(a,b)||!connector.verify(b,a))return false;
  const pieces=Math.max(1,Math.ceil(xz(a,b)/0.006));
  let previous=start;
  for(let i=1;i<=pieces;i++){
    const t=i/pieces;
    const p=connector.project(lerp(a,b,t));
    if(!p)return false;
    const delta=Math.abs(p[1]-previous[1]),step=xz(p,previous);
    if(delta>0.075+1e-8||(step>1e-8&&delta/step>0.72+1e-8))return false;
    previous=p;
  }
  return d3(previous,end)<0.025;
}

export function drawableDock(
  walk:SpatialPoint,port:SpatialPoint,
  connector:PmoTerrainConnector,terrain:TerrainProjector,
):Pick<PmoDockExtension,'kind'|'physicalSamples'|'treads'>|null {
  const horizontal=xz(walk,port),vertical=Math.abs(walk[1]-port[1]);
  if(horizontal<0.04||horizontal>1.70||vertical>0.68||d3(walk,port)>1.83)return null;
  if(!connector.project(walk)||d3(connector.project(walk)!,walk)>0.035)return null;
  // The endpoint must be on or above the real island, not underground.
  const portTerrain=terrain.project(port[0],port[2],port[1]);
  if(portTerrain && portTerrain[1]-port[1]>0.055)return null;
  const kind:'stairs'|'bridge'=vertical/horizontal>0.72?'stairs':'bridge';
  const pieces=Math.max(3,Math.ceil(horizontal/0.035),Math.ceil(vertical/0.055));
  if(pieces>120)return null;
  const points:SpatialPoint[]=[];
  const yaw=Math.atan2(port[0]-walk[0],port[2]-walk[2]);
  const treads:PmoDockExtension['treads']=[];
  const width=kind==='bridge'?0.35:0.30;
  for(let i=0;i<=pieces;i++){
    const t=i/pieces;
    const p=lerp(walk,port,t);
    // Explicitly built deck: no invisible shortcut underneath the ground.
    const terrainHit=terrain.project(p[0],p[2],p[1]);
    if(terrainHit && terrainHit[1]-p[1]>0.055)return null;
    points.push(p);
    if(i>0){
      const mid=lerp(points[i-1],p,0.5);
      treads.push({center:[mid[0],mid[1]-0.017,mid[2]],length:horizontal/pieces*1.10,width,yaw});
    }
  }
  if(points.some((p,i)=>i>0&&(d3(p,points[i-1])>0.075||Math.abs(p[1]-points[i-1][1])>0.056)))return null;
  return {kind,physicalSamples:points,treads};
}
/** Repair ONLY docks belonging to actual authored stairs/bridges/lifts.
 * A dock missing a safe structural approach stays blocked; no virtual teleport.
 */
export function repairPmoTransitionDocks(
  graph:NavigationGraph,structures:readonly PmoStructure[],connector:PmoTerrainConnector,terrain:TerrainProjector,
):{graph:NavigationGraph;extensions:readonly PmoDockExtension[];diagnostics:readonly string[]} {
  const nodes:Record<string,NavNode>={...graph.nodes};
  const outgoing:Record<string,NavEdge[]>=Object.fromEntries(Object.entries(graph.outgoing).map(([id,edges])=>[id,[...edges]]));
  const walks=Object.values(nodes).filter(n=>n.role==='walk');
  const extensions:PmoDockExtension[]=[],diagnostics:string[]=[];
  for(const structure of structures){
    for(const side of [0,1] as const){
      const portalId=`portal:${structure.edgeId}:${side}`;
      const point=side===0?structure.from:structure.to;
      const current=nodes[portalId];
      const alreadyAttached=current&&(outgoing[portalId]??[]).some(e=>
        e.mode==='walk'&&nodes[e.to]?.role==='walk'&&e.sourceId===structure.sourceId&&
        physicallyWalkablePortal(point,nodes[e.to].position,connector));
      if(alreadyAttached)continue;
      const candidates=walks.filter(n=>xz(n.position,point)<=1.70&&
        Math.abs(n.position[1]-point[1])<=0.68)
        .sort((a,b)=>d3(a.position,point)-d3(b.position,point)||a.id.localeCompare(b.id));
      let chosen:{node:NavNode;surface:NonNullable<ReturnType<typeof drawableDock>>}|null=null;
      for(const candidate of candidates.slice(0,36)){
        const surface=drawableDock(candidate.position,point,connector,terrain);
        if(surface){chosen={node:candidate,surface};break;}
      }
      if(!chosen){diagnostics.push(`PMO_DOCK_UNREPAIRED:${structure.sourceId}:${side}`);continue;}
      const id=`pmo-dock:${structure.sourceId}:${side}`;
      // A dock is an authored transition's physical extension, not a generic walk edge.
      if(!nodes[portalId])nodes[portalId]={id:portalId,position:cp(point),role:'portal',sourceId:structure.sourceId};
      if(!outgoing[portalId])outgoing[portalId]=[];
      const length=d3(chosen.node.position,point);
      const edgeId=structure.edgeId+':dock:'+side;
      outgoing[chosen.node.id]=[...(outgoing[chosen.node.id]??[]),
        {to:portalId,mode:chosen.surface.kind,cost:length,sourceId:id}];
      outgoing[portalId].push({to:chosen.node.id,mode:chosen.surface.kind,cost:length,sourceId:id});
      extensions.push({id,structureSourceId:structure.sourceId,edgeId,side,
        portalId,walkNodeId:chosen.node.id,kind:chosen.surface.kind,
        from:cp(chosen.node.position),to:cp(point),
        physicalSamples:chosen.surface.physicalSamples,treads:chosen.surface.treads});
      diagnostics.push(`PMO_DOCK_PHYSICAL:${structure.sourceId}:${side}:${chosen.node.id}:${length.toFixed(3)}`);
    }
    // The previous compiler removes both portals when either fails attachment.
    // Restore the author's *original transition*, but only if both of its
    // endpoints now have a verified normal walk or a physical dock support.
    const a=`portal:${structure.edgeId}:0`,b=`portal:${structure.edgeId}:1`;
    const hasApproach=(id:string)=>!!nodes[id]&&(outgoing[id]??[]).some(e=>{
      const target=nodes[e.to];return !!target&&target.role==='walk'&&
        ((e.mode==='walk'&&e.sourceId===structure.sourceId)||e.sourceId.startsWith('pmo-dock:'+structure.sourceId+':'));
    });
    if(hasApproach(a)&&hasApproach(b)){
      if(!(outgoing[a]??[]).some(e=>e.to===b&&e.sourceId===structure.sourceId))
        outgoing[a].push({to:b,mode:structure.kind,cost:d3(structure.from,structure.to),sourceId:structure.sourceId});
      if(!(outgoing[b]??[]).some(e=>e.to===a&&e.sourceId===structure.sourceId))
        outgoing[b].push({to:a,mode:structure.kind,cost:d3(structure.from,structure.to),sourceId:structure.sourceId});
    }
  }
  return {graph:{...graph,nodes,outgoing},extensions,diagnostics};
}
