/** 100 DISTINCT PMO walking origins for the real simultaneous-crowd probe.
 * Not a ferry/unloading simulation: guests begin at physically certified
 * existing nodes across five island neighborhoods. No fabricated geometry.
 */
import type {BrushGraph,PmoTerrainConnector,SpatialPoint} from '../render/spatialMeta/pmoBrushCorridors';
import {planBrushCorridorRoute} from '../render/spatialMeta/pmoBrushCorridors';

const xz=(a:readonly number[],b:readonly number[])=>Math.hypot(a[0]-b[0],a[2]-b[2]);
const d3=(a:readonly number[],b:readonly number[])=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
/** Must stay in sync with pmoCrowdStressSession's deterministic target order. */
export const crowdTargetIndex=(index:number,length:number)=>(index*7+Math.floor(index/length))%length;

export function selectDistributedCrowdStarts(
  graph:BrushGraph,connector:PmoTerrainConnector,targets:readonly SpatialPoint[],
  physicallyPassable:(from:SpatialPoint,to:SpatialPoint)=>boolean,
  count=100,
):SpatialPoint[]{
  if(count!==100||targets.length<3||graph.nodes.length<100)throw Error('CROWD_DISTRIBUTED_INVALID_INPUT');
  const selected:SpatialPoint[]=[];
  const available=[...graph.nodes].filter(n=>n.point.every(Number.isFinite));
  // A reproducible neighborhood preference: 20 origins around each of the
  // *other* service approaches. The walk must be routed/certified to its
  // different destination, not just present inside a nearby painted stamp.
  for(let i=0;i<count;i++){
    const goalIndex=crowdTargetIndex(i,targets.length);
    const goal=targets[goalIndex];
    const sourceCenter=targets[(goalIndex+2)%targets.length];
    const rank=(a:SpatialPoint)=>xz(a,sourceCenter);
    const candidates=available.slice().sort((a,b)=>rank(a.point)-rank(b.point)||a.id-b.id);
    let picked:SpatialPoint|null=null;
    // Prefer actual walkable PMO near buildings, but fall back to elsewhere
    // on the island if one neighborhood has too little physical floor area.
    for(const pointNode of candidates){
      const p=pointNode.point;
      if(d3(p,goal)<0.65||d3(p,sourceCenter)<0.28)continue;
      if(selected.some(q=>Math.abs(q[1]-p[1])<0.22&&xz(q,p)<0.25))continue;
      const route=planBrushCorridorRoute(graph,connector,p,goal,0.26,physicallyPassable);
      if(route.status!=='READY'||route.distance<0.65)continue;
      picked=[...p];break;
    }
    if(!picked)throw Error('CROWD_DISTRIBUTED_NO_100_SAFE_ORIGINS:'+selected.length);
    selected.push(picked);
  }
  return selected;
}
