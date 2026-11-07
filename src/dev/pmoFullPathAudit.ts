/** Deterministic, detached PMO navigation matrix.
 * Uses the exact compiled/certified graph and the production pedestrian motor;
 * NEVER mutates the canonical registry, the live wave or the game economy.
 */
import {
  type BrushGraph, type PmoTerrainConnector, type SpatialPoint,
  type RouteResult, planBrushCorridorRoute,
} from '../render/spatialMeta/pmoBrushCorridors';
import {PmoPedestrianRuntime} from '../render/spatialMeta/pmoPedestrianRuntime';
import type {PmoLiftTransit} from '../render/spatialMeta/pmoLiftTransit';
import type {CanonicalPmoBuildingSite} from './pmoDevBuildings';
import type {PmoCompiledTransitionDiagnosis} from './pmoCompiledTransitionAudit';
import {certifyWalkMotion} from './pmoWalkMotionAudit';

const d3=(a:readonly number[],b:readonly number[])=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const horizontal=(a:readonly number[],b:readonly number[])=>Math.hypot(a[0]-b[0],a[2]-b[2]);
const copy=(p:SpatialPoint):SpatialPoint=>[...p];
const pause=()=>new Promise<void>(resolve=>setTimeout(resolve,0));
export interface AuditEndpoint {
  name:string; sourceId:string; anchor:SpatialPoint;
  point:SpatialPoint|null; nodeId:number|null;
  reason:string|null; connectedToBeach:boolean;
  candidateCount:number;
  /** Directed, motion-filtered graph connectivity of the selected approach. */
  outgoingReachable:number;incomingReachable:number;
}
export type AuditTrialState='ARRIVED'|'BLOCKED'|'TIMEOUT'|'UNREACHABLE'|'NO_ENDPOINT'|'PLAN_REJECTED';
export interface PmoPathAuditRow {
  from:string;to:string;direction:'beach-site'|'site-beach'|'site-site';
  status:AuditTrialState; reason:string|null;
  start:SpatialPoint|null;goal:SpatialPoint|null;end:SpatialPoint|null;
  length:number|null;stepIndex:number;steps:number;seconds:number;
  helpers:readonly string[];
  /** A complete route trace of world-space waypoints for reproduction. */
  route:readonly {kind:string;helperId:string|null;from:SpatialPoint;to:SpatialPoint}[];
  failedEdge:null|{kind:string;helperId:string|null;from:SpatialPoint;to:SpatialPoint};
}
export interface PmoFullPathReport {
  schema:'rrh-pmo-full-path-audit/v1';
  source:'CANONICAL_COMPILED_PMO_DETACHED_MOTOR';
  disclaimer:string;
  beach:SpatialPoint;nodes:number;edges:number;
  endpoints:readonly AuditEndpoint[];
  transitions:readonly PmoCompiledTransitionDiagnosis[];
  totals:{planned:number;completed:number;arrived:number;blocked:number;timeout:number;unreachable:number;rejected:number};
  routes:readonly PmoPathAuditRow[];
}
export interface PmoFullPathAuditInput {
  graph:BrushGraph;connector:PmoTerrainConnector;beach:SpatialPoint;
  sites:readonly CanonicalPmoBuildingSite[];
  transitions:readonly PmoCompiledTransitionDiagnosis[];
  physical:ReadonlyMap<string,readonly SpatialPoint[]>;
  liftFactory:()=>PmoLiftTransit;
}
/** Endpoint candidate criteria are deliberately the same as the authored building layout contract. */
export function enumerateAuditEndpoints(graph:BrushGraph,beach:SpatialPoint,
  sites:readonly CanonicalPmoBuildingSite[]):AuditEndpoint[]{
  if(!graph.nodes.length)throw Error('PMO_AUDIT_EMPTY_GRAPH');
  const entry=graph.nodes.reduce((best,node)=>d3(node.point,beach)<d3(graph.nodes[best].point,beach)?node.id:best,graph.nodes[0].id);
  // The physics audit can prune ONE direction of a nominally bidirectional
  // walk link. A geometrically nearest candidate can then be an incoming-only
  // cul-de-sac. Score all authored approach candidates by real directed reach.
  const backwards:number[][]=graph.nodes.map(()=>[]);
  for(const [id,edges] of graph.neighbors.entries())for(const edge of edges)backwards[edge.to].push(id);
  const transit=(start:number,reverse=false):Set<number>=>{
    const found=new Set<number>([start]),queue=[start];
    for(let i=0;i<queue.length;i++){
      const n=queue[i];
      for(const next of reverse?backwards[n]:graph.neighbors[n].map(e=>e.to)){
        if(!found.has(next)){found.add(next);queue.push(next);}
      }
    }
    return found;
  };
  const visited=transit(entry);
  const statistics=new Map<number,{forward:number;reverse:number}>();
  const sizes=(id:number)=>{
    let data=statistics.get(id);
    if(!data){data={forward:transit(id).size,reverse:transit(id,true).size};statistics.set(id,data);}
    return data;
  };
  return sites.map(site=>{
    const candidates=graph.nodes.filter(n=>{
      const d=horizontal(n.point,site.anchor);
      return d>=0.48-1e-8&&d<=0.58+1e-8&&Math.abs(n.point[1]-site.anchor[1])<=0.12;
    }).sort((a,b)=>{
      const sa=sizes(a.id),sb=sizes(b.id);
      // A physically accessible beach approach MUST outrank an otherwise
      // larger, but island-only component. Regression: building_1 silently
      // moved to a non-beach site after ranking by SCC size.
      const reach=Number(visited.has(b.id))-Number(visited.has(a.id));
      if(reach)return reach;
      const mutual=Math.min(sb.forward,sb.reverse)-Math.min(sa.forward,sa.reverse);
      if(mutual)return mutual;
      return horizontal(a.point,site.anchor)-horizontal(b.point,site.anchor)||a.id-b.id;
    });
    const node=candidates[0],size=node?sizes(node.id):{forward:0,reverse:0};
    return {name:site.name,sourceId:site.id,anchor:copy(site.anchor),point:node?copy(node.point):null,
      nodeId:node?.id??null,reason:node?null:'NO_AUTHORED_WALK_APPROACH',
      connectedToBeach:!!node&&visited.has(node.id),candidateCount:candidates.length,
      outgoingReachable:size.forward,incomingReachable:size.reverse};
  });
}
function summary(rows:readonly PmoPathAuditRow[],planned:number){
  return {planned,completed:rows.length,arrived:rows.filter(r=>r.status==='ARRIVED').length,
    blocked:rows.filter(r=>r.status==='BLOCKED').length,timeout:rows.filter(r=>r.status==='TIMEOUT').length,
    unreachable:rows.filter(r=>r.status==='UNREACHABLE'||r.status==='NO_ENDPOINT').length,
    rejected:rows.filter(r=>r.status==='PLAN_REJECTED').length};
}
export async function auditAllPmoPaths(input:PmoFullPathAuditInput,
  signal?:AbortSignal,onProgress?:(report:PmoFullPathReport)=>void):Promise<PmoFullPathReport>{
  const {graph,connector,beach,sites,transitions,physical,liftFactory}=input;
  const endpoints=enumerateAuditEndpoints(graph,beach,sites);
  const all=[{name:'BEACH',point:copy(beach)},...endpoints.map(x=>({name:x.name,point:x.point}))];
  const pairs:{from:typeof all[number];to:typeof all[number];direction:PmoPathAuditRow['direction']}[]=[];
  for(const to of all.slice(1)){
    pairs.push({from:all[0],to,direction:'beach-site'},{from:to,to:all[0],direction:'site-beach'});
  }
  for(const from of all.slice(1))for(const to of all.slice(1)){
    if(from.name!==to.name)pairs.push({from,to,direction:'site-site'});
  }
  const rows:PmoPathAuditRow[]=[];
  const snapshot=():PmoFullPathReport=>({schema:'rrh-pmo-full-path-audit/v1',
    source:'CANONICAL_COMPILED_PMO_DETACHED_MOTOR',
    disclaimer:'Independent directed route trials. Does NOT certify multiple pedestrians sharing a narrow passage or validate visual aesthetics. A returned UNREACHABLE is an explicit failure of connectedness, not a skipped case.',
    beach:copy(beach),nodes:graph.nodes.length,edges:graph.neighbors.reduce((s,e)=>s+e.length,0),
    endpoints,transitions,totals:summary(rows,pairs.length),routes:[...rows]});
  for(const [i,pair] of pairs.entries()){
    if(signal?.aborted)throw Error('PMO_FULL_AUDIT_CANCELLED');
    const {from,to,direction}=pair;
    let state:AuditTrialState='NO_ENDPOINT',reason:string|null=null;
    let end:SpatialPoint|null=null,seconds=0,stepIndex=0,steps=0,length:number|null=null;
    let failedEdge:PmoPathAuditRow['failedEdge']=null;
    let routeEdges:PmoPathAuditRow['route']=[],helpers:string[]=[];
    if(from.point&&to.point){
      const route:RouteResult=planBrushCorridorRoute(graph,connector,from.point,to.point,0.26,
        (a,b)=>certifyWalkMotion(a,b,graph,connector)===null);
      if(route.status!=='READY'){
        state=route.status==='UNREACHABLE'?'UNREACHABLE':'PLAN_REJECTED';reason=route.reason;
      }else{
        length=route.distance;steps=route.steps.length;
        routeEdges=route.steps.map(e=>({kind:e.kind,helperId:e.helperId??null,from:copy(e.from),to:copy(e.to)}));
        helpers=Array.from(new Set(route.steps.flatMap(s=>s.helperId?[s.helperId]:[])));
        const lift=liftFactory();
        const motor=new PmoPedestrianRuntime(graph,connector,{
          collisionSpacing:0,
          canEnterHelper:(helper,at,id)=>helper.kind!=='lift'||lift.reserve(helper,at,id),
          onHelperExit:(helper,id)=>{if(helper.kind==='lift')lift.release(helper,id);},
          samplePhysicalHelper:(helper,t,start,destination,id)=>{
            if(helper.kind==='lift')return lift.ride(helper,t,start,destination,id);
            const p=physical.get(helper.sourceId);if(!p?.length)return null;
            const reverse=d3(start,helper.to)<0.08;
            const scaled=(reverse?1-t:t)*(p.length-1);
            const a=Math.floor(scaled),b=Math.min(p.length-1,a+1),f=scaled-a;
            return [p[a][0]+(p[b][0]-p[a][0])*f,p[a][1]+(p[b][1]-p[a][1])*f,p[a][2]+(p[b][2]-p[a][2])*f];
          }
        });
        const added=motor.add({id:'pmo-matrix-actor',from:copy(from.point),to:copy(to.point),speed:0.75});
        if(added.status!=='READY'){
          state='PLAN_REJECTED';reason='MOTOR_ADD_'+added.reason;
        }else{
          // <=150s virtual simulation, 50ms fixed steps, with cooperative UI yield.
          state='TIMEOUT';reason='VIRTUAL_LIMIT_150S';
          for(let tick=0;tick<3000;tick++){
            if(signal?.aborted)throw Error('PMO_FULL_AUDIT_CANCELLED');
            lift.tick(0.05);motor.tick(0.05);seconds=(tick+1)*0.05;
            const actor=motor.snapshots()[0];
            if(actor.status==='arrived'||actor.status==='blocked'){
              state=actor.status==='arrived'?'ARRIVED':'BLOCKED';reason=actor.fault;
              break;
            }
            if(tick%250===249)await pause();
          }
          const actor=motor.snapshots()[0];end=copy(actor.position);
          stepIndex=actor.stepIndex;steps=actor.routeLength;
          failedEdge=state==='ARRIVED'?null:routeEdges[stepIndex]??null;
        }
      }
    }else{
      reason=[from,to].filter(x=>!x.point).map(x=>x.name+':NO_AUTHORED_WALK_APPROACH').join('|');
    }
    rows.push({from:from.name,to:to.name,direction,status:state,reason,
      start:from.point?copy(from.point):null,goal:to.point?copy(to.point):null,
      end,length,stepIndex,steps,seconds,helpers,route:routeEdges,failedEdge});
    if(onProgress)onProgress(snapshot());
    if(i%2===1)await pause();
  }
  return snapshot();
}
