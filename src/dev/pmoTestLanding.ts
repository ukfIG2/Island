/** A REAL, VISIBLE, dev-only stair continuation where the authored beach stairs
 * currently terminate below the traversable resort plateau. No terrain slope
 * rule is changed and no invisible graph-only edge is granted.
 *
 * This is deliberately NOT persisted as PMO authority: authoring the permanent
 * stair landing remains an open model/PMO issue. A temporary physical extension
 * makes the isolated pathfinding test exercisable without misleading users that
 * the original island already supports the crossing.
 */
import type { BrushGraph, PmoRouteHelper, PmoTerrainConnector, SpatialPoint } from '../render/spatialMeta/pmoBrushCorridors';
import type { PmoStructure, PmoStructureSegment } from '../render/spatialMeta/pmoTransitionStructures';
import { sampleAuthoredStairTreads } from './pmoTestStairCertification';

export interface DevStairLanding {
  readonly structure:PmoStructure;
  readonly physicalPoints:readonly SpatialPoint[];
  readonly helper:PmoRouteHelper;
  readonly reachableSiteCount:number;
}
const distanceXZ=(a:readonly number[],b:readonly number[])=>Math.hypot(a[0]-b[0],a[2]-b[2]);
const distance3=(a:readonly number[],b:readonly number[])=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
function components(graph:BrushGraph):number[]{
  const groups=Array<number>(graph.nodes.length).fill(-1);let label=0;
  for(let i=0;i<graph.nodes.length;i++){
    if(groups[i]>=0)continue;
    const queue=[i];groups[i]=label;
    for(let q=0;q<queue.length;q++)for(const e of graph.neighbors[queue[q]]){
      if(groups[e.to]<0){groups[e.to]=label;queue.push(e.to);}
    }
    label++;
  }
  return groups;
}
function authoredPaintAllows(graph:BrushGraph,p:SpatialPoint):boolean{
  return graph.stamps.some(stamp=>distanceXZ(p,stamp.center)<=stamp.radius+1e-8 &&
    Math.abs(p[1]-stamp.center[1])<=graph.rules.paintHeightTolerance);
}
function buildStructure(sourceId:string,from:SpatialPoint,to:SpatialPoint):PmoStructure{
  const dx=to[0]-from[0],dy=to[1]-from[1],dz=to[2]-from[2];
  const horizontal=Math.hypot(dx,dz);
  const count=Math.max(2,Math.ceil(horizontal/0.12),Math.ceil(Math.abs(dy)/0.07));
  const yaw=Math.atan2(dx,dz);
  const segments:PmoStructureSegment[]=Array.from({length:count},(_,j)=>{
    const t=(j+0.5)/count;
    return {center:[from[0]+dx*t,from[1]+dy*t,from[2]+dz*t],
      yaw,pitch:0,length:horizontal/count*1.06,width:0.25};
  });
  return {sourceId,edgeId:'dev-physical-stair-landing:'+sourceId,kind:'stairs',
    from:[...from],to:[...to],segments,travelCertified:false};
}

/** Only the precisely identity-verified beach stair may receive this derived
 * physical landing. Choose an existing authored *walking* node on a graph
 * component with enough actual building approaches; no fabricated destination.
 * Every point along the extension remains in PMO walking paint, near real island
 * terrain, with box treads in the same R3F scene used by the pedestrians. */
export function planPmoTestLanding(
  graph:BrushGraph,connector:PmoTerrainConnector,
  beachStair:PmoStructure | undefined, zones:readonly SpatialPoint[]
):DevStairLanding | null {
  if(!beachStair||beachStair.sourceId!=='pmo-3ae6a767-a0f4-40af-b982-ec36346bebe6'||
    beachStair.kind!=='stairs'||!graph.helpers[beachStair.sourceId])return null;
  const from=beachStair.to, groups=components(graph);
  const head=graph.nodes.reduce((best,node)=>distance3(node.point,from)<distance3(graph.nodes[best].point,from)?node.id:best,0);
  const beachComponent=groups[head];
  const siteCount=new Map<number,number>();
  for(const site of zones){
    const seen=new Set<number>();
    for(const node of graph.nodes){
      if(distanceXZ(site,node.point)>=0.48-1e-8 && distanceXZ(site,node.point)<=1.6+1e-8 &&
        Math.abs(site[1]-node.point[1])<=0.24)seen.add(groups[node.id]);
    }
    for(const c of seen)siteCount.set(c,(siteCount.get(c)??0)+1);
  }
  const candidates=graph.nodes.filter(node=>{
    const h=distanceXZ(from,node.point),rise=node.point[1]-from[1],count=siteCount.get(groups[node.id])??0;
    return groups[node.id]!==beachComponent && count>=5 && h>=0.35 && h<=1.15 &&
      rise>=0.12 && rise<=0.50;
  }).sort((a,b)=>{
    const cover=(siteCount.get(groups[b.id])??0)-(siteCount.get(groups[a.id])??0);
    return cover || distanceXZ(from,a.point)-distanceXZ(from,b.point);
  });
  for(const candidate of candidates){
    const target=candidate.point,sourceId=beachStair.sourceId+':dev-visible-landing';
    if(!connector.project([...from])||!connector.project([...target]))continue;
    const structure=buildStructure(sourceId,from,[...target]);
    const physicalPoints=sampleAuthoredStairTreads(structure);
    if(!physicalPoints)continue;
    let valid=true;
    for(let i=0;i<physicalPoints.length;i++){
      const p=physicalPoints[i],ground=connector.project([p[0],p[1],p[2]]);
      if(!ground||!authoredPaintAllows(graph,ground)||Math.abs(ground[1]-p[1])>0.22){
        valid=false;break;
      }
    }
    if(!valid)continue;
    return {
      structure,physicalPoints,reachableSiteCount:siteCount.get(groups[candidate.id])??0,
      helper:{id:sourceId,sourceId,edgeId:structure.edgeId,kind:'stairs',
        from:[...from],to:[...target],capacity:4}
    };
  }
  return null;
}
