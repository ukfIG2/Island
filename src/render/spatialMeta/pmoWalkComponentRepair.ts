/** Deterministic terrain-certified recovery of missed *ordinary* walk adjacency.
 * This does not authorize bridges, lifts, stairs or unpainted shortcuts.
 * Both endpoints must already be nodes of the compiled production PMO graph.
 */
import type { NavigationGraph, NavEdge } from './navigation';
import type { SpatialPoint } from './registry';
import type { PmoTerrainConnector } from './pmoBrushCorridors';

const xz=(a:SpatialPoint,b:SpatialPoint)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
const dist=(a:SpatialPoint,b:SpatialPoint)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
export interface WalkRepairResult {graph:NavigationGraph; added:number; candidates:number; rejected:number; removed:number; diagnostics:string[]}
export function repairCertifiedWalkComponents(graph:NavigationGraph,connector:PmoTerrainConnector,
  maxSpan=0.37):WalkRepairResult {
  if (!(maxSpan>=0.15&&maxSpan<=0.76))throw Error('PMO_UNSAFE_WALK_REPAIR_RANGE');
  const entries=Object.values(graph.nodes).filter(n=>n.role==='walk');
  const parent=new Map(entries.map(n=>[n.id,n.id]));
  const root=(id:string):string=>{let v=id;while(parent.get(v)!==v)v=parent.get(v)!;return v;};
  // Existing compiler links cannot be used to infer components until they
  // pass the SAME microstep terrain/paint gate as new links and runtime motion.
  const checked=new Map<string,boolean>();
  const valid=(a:SpatialPoint,b:SpatialPoint):boolean=>{
    if(!connector.verify(a,b)||!connector.verify(b,a))return false;
    const len=xz(a,b),pieces=Math.max(1,Math.ceil(len/0.006));
    let prev=a;
    for(let i=1;i<=pieces;i++){
      const t=i/pieces;
      const p=connector.project([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t]);
      if(!p)return false;
      const horizontal=xz(prev,p),dy=Math.abs(p[1]-prev[1]);
      if(horizontal<1e-8||dy>0.075||dy/horizontal>0.72+1e-8)return false;
      prev=p;
    }
    return dist(prev,b)<0.02;
  };
  const certifiedPair=(a:string,b:string):boolean=>{
    const key=a<b?`${a}|${b}`:`${b}|${a}`;
    const cached=checked.get(key);
    if(cached!==undefined)return cached;
    const accepted=valid(graph.nodes[a].position,graph.nodes[b].position)&&
      valid(graph.nodes[b].position,graph.nodes[a].position);
    checked.set(key,accepted);
    return accepted;
  };
  let removed=0;
  const outgoing:Record<string,NavEdge[]>=Object.fromEntries(Object.entries(graph.outgoing).map(([id,edges])=>[
    id,edges.filter(e=>{
      if(e.mode!=='walk'||!parent.has(id)||!parent.has(e.to))return true;
      const accepted=certifiedPair(id,e.to);
      if(!accepted)removed++;
      return accepted;
    })
  ]));
  for(const n of entries)for(const e of outgoing[n.id]??[]){
    if(e.mode!=='walk'||!parent.has(e.to))continue;
    const a=root(n.id),b=root(e.to);if(a!==b)parent.set(a,b);
  }
  const buckets=new Map<string,typeof entries>();
  const unit=maxSpan;
  const key=(x:number,z:number)=>`${x},${z}`;
  for(const n of entries){const k=key(Math.floor(n.position[0]/unit),Math.floor(n.position[2]/unit));
    const list=buckets.get(k)??[];list.push(n);buckets.set(k,list);}
  const possible:{a:string;b:string;cost:number}[]=[];
  for(const n of entries){
    const bx=Math.floor(n.position[0]/unit),bz=Math.floor(n.position[2]/unit);
    for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)
      for(const other of buckets.get(key(bx+dx,bz+dz))??[]){
        if(other.id<=n.id||root(n.id)===root(other.id))continue;
        const d=xz(n.position,other.position);
        if(d<0.015||d>maxSpan||Math.abs(n.position[1]-other.position[1])/d>0.72)continue;
        possible.push({a:n.id,b:other.id,cost:dist(n.position,other.position)});
      }
  }
  possible.sort((a,b)=>a.cost-b.cost||a.a.localeCompare(b.a)||a.b.localeCompare(b.b));
  let added=0,rejected=0;
  for(const pair of possible){
    const a=root(pair.a),b=root(pair.b);if(a===b)continue;
    if(!certifiedPair(pair.a,pair.b)){rejected++;continue;}
    parent.set(a,b);
    outgoing[pair.a].push({to:pair.b,cost:pair.cost,mode:'walk',sourceId:'pmo-compiled:terrain-walk-stitch'});
    outgoing[pair.b].push({to:pair.a,cost:pair.cost,mode:'walk',sourceId:'pmo-compiled:terrain-walk-stitch'});
    added++;
  }
  const components=new Set(entries.map(n=>root(n.id))).size;
  return {graph:{...graph,outgoing},added,candidates:possible.length,rejected,removed,
    diagnostics:[`PMO_PRUNED_UNPHYSICAL_WALK_EDGES:${removed}`,`PMO_WALK_COMPONENTS:${components}`,`PMO_TERRAIN_WALK_STITCH:${added}/${possible.length}:rejected=${rejected}`]};
}
