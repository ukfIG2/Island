/** A narrowly scoped, physical, derived landing for an authored beach stair.
 * Does not modify PMO or relax grade limits. Adds real steps AND their graph
 * edge together; if no identity-attached island/paint endpoints pass, fail closed.
 */
import type {NavigationGraph,NavNode} from './navigation';
import type {SpatialPoint} from './registry';
import type {PmoStructure} from './pmoTransitionStructures';
import type {PmoTransitionAccess} from './pmoTransitionAccess';
import type {PmoTerrainConnector} from './pmoBrushCorridors';

export interface PmoLandingTread {
  center:SpatialPoint; yaw:number;length:number;width:number;top:number;
}
export interface PmoLandingExtension {
  id:string; sourceId:string; edgeId:string; from:SpatialPoint;to:SpatialPoint;
  portalA:string;portalB:string;
  physicalSamples:readonly SpatialPoint[];
  treads:readonly PmoLandingTread[];
}
const xz=(a:SpatialPoint,b:SpatialPoint)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
const d3=(a:SpatialPoint,b:SpatialPoint)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const lerp=(a:SpatialPoint,b:SpatialPoint,t:number):SpatialPoint=>[
  a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
const near=(a:SpatialPoint,b:SpatialPoint,r:number)=>d3(a,b)<=r;

function walkComponent(graph:NavigationGraph,start:string):Set<string>{
  const reached=new Set<string>([start]),queue=[start];
  for(let head=0;head<queue.length;head++)for(const e of graph.outgoing[queue[head]]??[]){
    if(e.mode!=='walk'||reached.has(e.to)||!graph.nodes[e.to])continue;
    reached.add(e.to);queue.push(e.to);
  }
  return reached;
}

/** Require an authored, verified beach stair. Find a small physically repairable
 * high-gradient missing landing beside its TOP, never a cross-island shortcut.
 * A repair is a visible set of three treads with explicit path samples.
 */
export function compilePmoLandingRepair(
  graph:NavigationGraph,connector:PmoTerrainConnector,
  structures:readonly PmoStructure[],accesses:readonly PmoTransitionAccess[],
):{graph:NavigationGraph;extensions:readonly PmoLandingExtension[];diagnostics:readonly string[]}{
  const diagnostics:string[]=[];
  const sorted=structures.filter(s=>s.kind==='stairs' && s.from[1]<-1.65 && s.to[1]>s.from[1]+0.6);
  for(const stair of sorted){
    const access=accesses.find(a=>a.sourceId===stair.sourceId&&a.edgeId===stair.edgeId);
    const originId=access?.walkNodeIds[1];
    if(!access?.attached||!access.geometryContinuous||!access.eligibleForPhysicalReview||!originId){
      diagnostics.push('LANDING_REPAIR_NOT_ATTACHED:'+stair.sourceId);continue;
    }
    const origin=graph.nodes[originId];if(!origin){continue;}
    const component=walkComponent(graph,originId);
    const walk=Object.values(graph.nodes).filter(n=>n.role==='walk'&&near(n.position,stair.to,0.45));
    let choice:{from:NavNode;to:NavNode;score:number}|null=null;
    for(const from of walk.filter(n=>component.has(n.id)))for(const to of walk.filter(n=>!component.has(n.id))){
      const horizontal=xz(from.position,to.position), vertical=Math.abs(from.position[1]-to.position[1]);
      if(horizontal<0.035||horizontal>0.24||vertical<0.035||vertical>0.17)continue;
      // Both ends must be independently projected onto approved real terrain+PMO paint.
      const a=connector.project([...from.position]),b=connector.project([...to.position]);
      if(!a||!b||d3(a,from.position)>0.018||d3(b,to.position)>0.018)continue;
      // Reject doubled layers and accidental passage far away from the stair head.
      if(d3(from.position,stair.to)>0.4||d3(to.position,stair.to)>0.4)continue;
      const score=horizontal+vertical*0.25+d3(from.position,stair.to)*0.25;
      if(!choice||score<choice.score)choice={from,to,score};
    }
    if(!choice){diagnostics.push('LANDING_REPAIR_NO_CERTIFIED_SEAM:'+stair.sourceId);continue;}
    const a=[...choice.from.position] as SpatialPoint,b=[...choice.to.position] as SpatialPoint;
    const horizontal=xz(a,b),dy=b[1]-a[1];
    const count=Math.max(3,Math.ceil(Math.abs(dy)/0.055));
    const yaw=Math.atan2(b[0]-a[0],b[2]-a[2]);
    const treads:PmoLandingTread[]=Array.from({length:count},(_,i)=>{
      const t=(i+0.5)/count,p=lerp(a,b,t),top=a[1]+dy*(i+1)/count;
      return {center:[p[0],top-0.017,p[2]],yaw,length:horizontal/count*1.65,width:0.27,top};
    });
    const physicalSamples:SpatialPoint[]=[a];
    for(let i=0;i<count;i++){
      const t=(i+0.5)/count,p=lerp(a,b,t);
      physicalSamples.push([p[0],treads[i].top,p[2]]);
    }
    physicalSamples.push(b);
    // No single physical stride may move more than the normal stair height or 0.10m.
    if(physicalSamples.slice(1).some((p,i)=>Math.abs(p[1]-physicalSamples[i][1])>0.076||d3(p,physicalSamples[i])>0.10)){
      diagnostics.push('LANDING_REPAIR_TREAD_DISCONTINUITY:'+stair.sourceId);continue;
    }
    const edgeId=stair.edgeId+'-certified-landing',id='pmo-landing:'+stair.sourceId;
    const p0='portal:'+edgeId+':0',p1='portal:'+edgeId+':1';
    const nodes={...graph.nodes,
      [p0]:{id:p0,position:a,role:'portal' as const,sourceId:id},
      [p1]:{id:p1,position:b,role:'portal' as const,sourceId:id}};
    const outgoing=Object.fromEntries(Object.entries(graph.outgoing).map(([key,edges])=>[key,[...edges]]));
    outgoing[p0]=[{to:choice.from.id,cost:0,mode:'walk',sourceId:id},{to:p1,cost:d3(a,b),mode:'stairs',sourceId:id}];
    outgoing[p1]=[{to:choice.to.id,cost:0,mode:'walk',sourceId:id},{to:p0,cost:d3(a,b),mode:'stairs',sourceId:id}];
    outgoing[choice.from.id]=[...(outgoing[choice.from.id]??[]),{to:p0,cost:0,mode:'walk',sourceId:id}];
    outgoing[choice.to.id]=[...(outgoing[choice.to.id]??[]),{to:p1,cost:0,mode:'walk',sourceId:id}];
    diagnostics.push('LANDING_REPAIR_PHYSICAL_TREADS:'+id+':'+choice.from.id+'->'+choice.to.id);
    return {graph:{...graph,nodes,outgoing},
      extensions:[{id,sourceId:stair.sourceId,edgeId,from:a,to:b,portalA:p0,portalB:p1,physicalSamples,treads}],diagnostics};
  }
  return {graph,extensions:[],diagnostics};
}

/** Explicitly visible second landing for the micro-terrace seam following the
 * already authored beach stairs. Does not use a synthetic walking shortcut. */
export function compileAdditionalBeachLandings(
  input:NavigationGraph,connector:PmoTerrainConnector,
  structures:readonly PmoStructure[],accesses:readonly PmoTransitionAccess[],
  existing:readonly PmoLandingExtension[],
):{graph:NavigationGraph;extensions:readonly PmoLandingExtension[];diagnostics:readonly string[]}{
  const first={graph:input,extensions:existing,diagnostics:[] as string[]};
  const stair=structures.find(s=>s.kind==='stairs'&&s.from[1]<-1.65&&s.to[1]>s.from[1]+0.6);
  if(!stair||!first.extensions.length)return first;
  let graph=first.graph;
  const extensions:PmoLandingExtension[]=[],diagnostics=[...first.diagnostics];
  const allowed=new Set(existing.map(e=>e.id));
  const original=accesses.find(a=>a.sourceId===stair.sourceId&&a.edgeId===stair.edgeId);
  const originId=original?.walkNodeIds[1];
  if(!originId)return first;
  for(let index=0;index<6;index++){
    const visited=new Set<string>([originId]),queue=[originId];
    for(let i=0;i<queue.length;i++)for(const e of graph.outgoing[queue[i]]??[]){
      if(e.mode!=='walk'&&!allowed.has(e.sourceId))continue;
      if(visited.has(e.to)||!graph.nodes[e.to])continue;
      visited.add(e.to);queue.push(e.to);
    }
    const walks=Object.values(graph.nodes).filter(n=>n.role==='walk'&&d3(n.position,stair.to)<0.88);
    let choice:{from:NavNode;to:NavNode;score:number}|null=null;
    for(const a of walks.filter(n=>visited.has(n.id)))for(const b of walks.filter(n=>!visited.has(n.id))){
      const horizontal=xz(a.position,b.position),vertical=Math.abs(a.position[1]-b.position[1]);
      if(horizontal<0.035||horizontal>0.24||vertical<0.035||vertical>0.11)continue;
      if(a.position[2]>stair.to[2]+.17||b.position[2]>stair.to[2]+.17)continue;
      const pa=connector.project([...a.position]),pb=connector.project([...b.position]);
      if(!pa||!pb||d3(pa,a.position)>0.018||d3(pb,b.position)>0.018)continue;
      const top=Math.max(a.position[1],b.position[1])+0.016;
      let admitted=true;
      for(let j=0;j<=10;j++){
        const p=lerp(a.position,b.position,j/10),ground=connector.project(p);
        if(!ground||ground[1]>top+0.028||top-ground[1]>.15){admitted=false;break;}
      }
      if(!admitted)continue;
      const score=horizontal+vertical*.3+d3(a.position,stair.to)*.12;
      if(!choice||score<choice.score)choice={from:a,to:b,score};
    }
    if(!choice)break;
    const a=[...choice.from.position] as SpatialPoint,b=[...choice.to.position] as SpatialPoint;
    const horizontal=xz(a,b),top=Math.max(a[1],b[1])+0.016;
    const count=3,yaw=Math.atan2(b[0]-a[0],b[2]-a[2]);
    const treads:PmoLandingTread[]=Array.from({length:count},(_,i)=>{
      const p=lerp(a,b,(i+0.5)/count);
      return {center:[p[0],top-0.017,p[2]],yaw,length:horizontal/count*1.65,width:.29,top};
    });
    const points:SpatialPoint[]=[a];
    for(let i=0;i<count;i++){
      const p=lerp(a,b,(i+0.5)/count);
      points.push([p[0],top,p[2]]);
    }
    points.push(b);
    if(points.slice(1).some((p,i)=>Math.abs(p[1]-points[i][1])>.076||d3(p,points[i])>.10))break;
    const id='pmo-landing:'+stair.sourceId+':terrace:'+index;
    const edgeId=stair.edgeId+':terrace:'+index;
    const portalA='portal:'+edgeId+':0',portalB='portal:'+edgeId+':1';
    const nodes={...graph.nodes,
      [portalA]:{id:portalA,position:a,role:'portal' as const,sourceId:id},
      [portalB]:{id:portalB,position:b,role:'portal' as const,sourceId:id}};
    const outgoing=Object.fromEntries(Object.entries(graph.outgoing).map(([key,edges])=>[key,[...edges]]));
    outgoing[portalA]=[{to:choice.from.id,cost:0,mode:'walk' as const,sourceId:id},{to:portalB,cost:d3(a,b),mode:'stairs' as const,sourceId:id}];
    outgoing[portalB]=[{to:choice.to.id,cost:0,mode:'walk' as const,sourceId:id},{to:portalA,cost:d3(a,b),mode:'stairs' as const,sourceId:id}];
    outgoing[choice.from.id]=[...(outgoing[choice.from.id]??[]),{to:portalA,cost:0,mode:'walk' as const,sourceId:id}];
    outgoing[choice.to.id]=[...(outgoing[choice.to.id]??[]),{to:portalB,cost:0,mode:'walk' as const,sourceId:id}];
    graph={...graph,nodes,outgoing};allowed.add(id);
    extensions.push({id,sourceId:stair.sourceId,edgeId,from:a,to:b,portalA,portalB,physicalSamples:points,treads});
    diagnostics.push('TERRACE_REPAIR_PHYSICAL_TREADS:'+id+':'+choice.from.id+'->'+choice.to.id);
  }
  return {graph,extensions,diagnostics};
}
