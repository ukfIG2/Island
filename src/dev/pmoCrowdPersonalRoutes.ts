/** Deterministic physical endpoints, not cosmetic mesh offsets or fabricated walk tiles. */
import type {BrushGraph,PmoTerrainConnector,SpatialPoint} from '../render/spatialMeta/pmoBrushCorridors';
import {planBrushCorridorRoute} from '../render/spatialMeta/pmoBrushCorridors';
import {crowdTargetIndex} from './pmoDistributedCrowdStarts';
const xz=(a:readonly number[],b:readonly number[])=>Math.hypot(a[0]-b[0],a[2]-b[2]);
const d3=(a:readonly number[],b:readonly number[])=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
export interface PersonalRoute{target:SpatialPoint;via:SpatialPoint|null;shift:number;}
export function selectPersonalCrowdRoutes(graph:BrushGraph,connector:PmoTerrainConnector,
  origins:readonly SpatialPoint[],targets:readonly SpatialPoint[],certify:(a:SpatialPoint,b:SpatialPoint)=>boolean):PersonalRoute[]{
  const chosen:PersonalRoute[]=[];
  for(let i=0;i<origins.length;i++){
    const base=targets[crowdTargetIndex(i,targets.length)];
    const origin=origins[i];
    let final:SpatialPoint=[...base];let shift=0;
    const candidates=graph.nodes.filter(n=>xz(n.point,base)>=.30&&xz(n.point,base)<=1.20&&Math.abs(n.point[1]-base[1])<.26)
      .sort((a,b)=>{
        const da=Math.abs(xz(a.point,base)-(.50+(i%7)*.09)),db=Math.abs(xz(b.point,base)-(.50+(i%7)*.09));
        return da-db||(((a.id+i*13)%103)-((b.id+i*13)%103));
      });
    for(const n of candidates.slice(0,20)){
      if(chosen.some(p=>Math.abs(p.target[1]-n.point[1])<.18&&xz(p.target,n.point)<.16))continue;
      if(planBrushCorridorRoute(graph,connector,origin,n.point,.26,certify).status!=='READY')continue;
      final=[...n.point];shift=xz(base,final);break;
    }
    let via:SpatialPoint|null=null;
    // A visible routing deviation must remain on the actual physically
    // certified graph. Two-leg journeys are never interpolated over terrain.
    if(i%3!==0){
      const mx=(origin[0]+final[0])/2,mz=(origin[2]+final[2])/2;
      const dx=final[0]-origin[0],dz=final[2]-origin[2],denom=Math.max(.01,Math.hypot(dx,dz));
      const nearby=graph.nodes.filter(n=>Math.hypot(n.point[0]-mx,n.point[2]-mz)<1.2&&
         d3(n.point,origin)>.45&&d3(n.point,final)>.45)
        .sort((a,b)=>Math.abs((dx*(a.point[2]-origin[2])-dz*(a.point[0]-origin[0]))/denom-.35)-
                     Math.abs((dx*(b.point[2]-origin[2])-dz*(b.point[0]-origin[0]))/denom-.35));
      for(const n of nearby.slice(0,6)){
        const lateral=Math.abs((dx*(n.point[2]-origin[2])-dz*(n.point[0]-origin[0]))/denom);
        if(lateral<.24||lateral>1.05)continue;
        if(planBrushCorridorRoute(graph,connector,origin,n.point,.26,certify).status!=='READY')continue;
        if(planBrushCorridorRoute(graph,connector,n.point,final,.26,certify).status!=='READY')continue;
        via=[...n.point];break;
      }
    }
    chosen.push({target:final,via,shift});
  }
  return chosen;
}
