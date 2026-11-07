/** Deterministic candidate selection. Runtime uses real audited building approaches,
 * never the physical centre of a building or an arbitrary terrain shortcut. */
import type {BrushGraph,SpatialPoint} from './pmoBrushCorridors';
import type {NormalWaveNeedId} from '../../core/state';
const d3=(a:readonly number[],b:readonly number[])=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const dxz=(a:readonly number[],b:readonly number[])=>Math.hypot(a[0]-b[0],a[2]-b[2]);
export interface CanonicalSite {id:string;name:string;anchor:SpatialPoint}
export function auditedApproaches(graph:BrushGraph,beach:SpatialPoint,sites:readonly CanonicalSite[]):ReadonlyMap<string,SpatialPoint>{
  if(!graph.nodes.length)return new Map();
  const entry=graph.nodes.reduce((winner,n)=>d3(n.point,beach)<d3(winner.point,beach)?n:winner).id;
  const seen=new Set<number>([entry]),queue=[entry];
  for(let i=0;i<queue.length;i++)for(const e of graph.neighbors[queue[i]]??[]){
    if(!seen.has(e.to)){seen.add(e.to);queue.push(e.to);}
  }
  const result=new Map<string,SpatialPoint>();
  for(const site of sites){
    const viable=graph.nodes.filter(n=>seen.has(n.id)&&dxz(n.point,site.anchor)>=.48-1e-8&&
      dxz(n.point,site.anchor)<=.58+1e-8&&Math.abs(n.point[1]-site.anchor[1])<=.12)
      .sort((a,b)=>dxz(a.point,site.anchor)-dxz(b.point,site.anchor)||a.id-b.id);
    const pick=viable[0];if(pick)result.set(site.id,[...pick.point]);
  }
  return result;
}
export function siteByNeed(
  sites:readonly CanonicalSite[],approaches:ReadonlyMap<string,SpatialPoint>,
  serviceEntrances:Partial<Record<NormalWaveNeedId,SpatialPoint>>,
):Partial<Record<NormalWaveNeedId,SpatialPoint>>{
  const result:Partial<Record<NormalWaveNeedId,SpatialPoint>>={};
  for(const [key,entrance] of Object.entries(serviceEntrances)){
    if(!entrance)continue;
    // Only physical sites associated with the service entrance can be used.
    const candidates=sites.filter(site=>approaches.has(site.id))
      .sort((a,b)=>dxz(a.anchor,entrance)-dxz(b.anchor,entrance)||a.id.localeCompare(b.id));
    if(candidates.length&&dxz(candidates[0].anchor,entrance)<=1.2)
      result[key as NormalWaveNeedId]=approaches.get(candidates[0].id);
  }
  return result;
}
