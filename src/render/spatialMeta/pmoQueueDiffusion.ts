/** Local PMO queue diffusion. NOT collision avoidance or global island roaming.
 * A queue ticket remains in its original FIFO while a guest is away.
 */
import type {BrushGraph,SpatialPoint} from './pmoBrushCorridors';
const horizontal=(a:readonly number[],b:readonly number[])=>Math.hypot(a[0]-b[0],a[2]-b[2]);
const hash=(id:string,n:number)=>{let h=2166136261^n;for(let i=0;i<id.length;i++)h=Math.imul(h^id.charCodeAt(i),16777619);return h>>>0;};
export interface QueueDiffusion {
  radius:number;minDistance:number;speed:number;pauseSeconds:number;cadenceSeconds:number;
}
/** 0 in front of queue: remain ready for immediate service. */
export function queueDiffusion(ahead:number,id:string):QueueDiffusion {
  const rank=Math.max(0,ahead),pressure=Math.min(1,rank/14);
  const personality=hash(id,73)%100/100;
  return {radius:+(.29+1.42*pressure).toFixed(3),minDistance:+(.12+.42*pressure).toFixed(3),
    speed:+(.125+.245*pressure+.04*personality).toFixed(3),
    pauseSeconds:+(.9+3.5*pressure+personality*.8).toFixed(2),
    cadenceSeconds:+(2.2+8.8*pressure).toFixed(2)};
}
/** Reachable by walking graph edges (never teleport across lifts/stairs/bridges),
 * within the current PMO mark and its directly adjoining walkable paint.
 * No whole-island candidate set. 0.14m grid positions provide real floor coords.
 */
export function localQueueWanderPools(graph:BrushGraph,sites:readonly SpatialPoint[],maxRange=2.15):SpatialPoint[][] {
  return sites.map(site=>{
    let closest=-1,best=.32;
    for(const node of graph.nodes){const d=horizontal(node.point,site);
      if(d<best&&Math.abs(node.point[1]-site[1])<.22){closest=node.id;best=d;}}
    if(closest<0)return [];
    const distances=new Float64Array(graph.nodes.length).fill(Infinity),inQueue=new Uint8Array(graph.nodes.length);
    const q=[closest];let cursor=0;distances[closest]=0;inQueue[closest]=1;
    // Bounded shortest walk-connected region. Queue relaxation avoids O(nodes²)
    // scans at startup on the full compiled PMO graph.
    while(cursor<q.length){
      const here=q[cursor++];inQueue[here]=0;
      const length=distances[here];if(length>maxRange)continue;
      for(const e of graph.neighbors[here]??[]){
        if(e.kind!=='walk')continue;
        const neighbor=graph.nodes[e.to];if(!neighbor)continue;
        const p=neighbor.point,next=length+e.cost;
        if(next>maxRange||Math.abs(p[1]-site[1])>.3||horizontal(p,site)>maxRange||
          next>=distances[e.to]-1e-8)continue;
        distances[e.to]=next;
        if(!inQueue[e.to]){q.push(e.to);inQueue[e.to]=1;}
      }
    }
    // Angle/radius stratification prevents scanline order of graph nodes
    // from concentrating every leisure waypoint on a single side of a site.
    const sectors=20,rings=8;
    const cells=new Map<number,{point:SpatialPoint;error:number}>();
    for(const node of graph.nodes){
      if(!Number.isFinite(distances[node.id]))continue;
      const p=node.point,dx=p[0]-site[0],dz=p[2]-site[2],r=Math.hypot(dx,dz);
      if(r<.13||r>maxRange)continue;
      const sector=Math.min(sectors-1,Math.floor((Math.atan2(dz,dx)+Math.PI)/(2*Math.PI)*sectors));
      const ring=Math.min(rings-1,Math.floor(r/maxRange*rings));
      const key=sector*rings+ring;
      const center=(ring+.5)*maxRange/rings;
      const error=Math.abs(r-center)+.12*Math.abs(distances[node.id]-r);
      const old=cells.get(key);
      if(!old||error<old.error)cells.set(key,{point:[...p],error});
    }
    const samples:SpatialPoint[]=[];
    // Spread across near and far annuli, retaining each actual PMO node.
    for(let ring=0;ring<rings;ring++)for(let sector=0;sector<sectors;sector++){
      const candidate=cells.get(sector*rings+ring);
      if(candidate)samples.push(candidate.point);
    }
    return samples;
  });
}
/** Stable, directionally diversified choice within queue-dependent radius. */
export function rankedQueueCandidates(id:string,trip:number,position:SpatialPoint,home:SpatialPoint,
  pool:readonly SpatialPoint[],profile:QueueDiffusion,limit=16):SpatialPoint[]{
  const wanted=profile.minDistance+(profile.radius-profile.minDistance)*(.55+.35*(hash(id,trip)%100)/100);
  return pool.filter(p=>horizontal(p,home)<=profile.radius&&
    horizontal(p,position)>=profile.minDistance*.75&&Math.abs(p[1]-home[1])<.30)
    .map(p=>({p,score:Math.abs(horizontal(p,home)-wanted)+
      .25*Math.abs(horizontal(p,position)-wanted)+.05*((hash(id,p[0]*1000+p[2]*100+trip) % 100)/100)}))
    .sort((a,b)=>a.score-b.score).slice(0,limit).map(v=>v.p);
}
