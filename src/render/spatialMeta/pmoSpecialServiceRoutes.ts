/** Fail-closed source-supported service routes; Core remains the sole gameplay authority. */
import type { SpatialPoint } from './registry';
import type { NavEdge, NavigationGraph } from './navigation';
import { routePmoSupportedGraph, type PmoSupportedGraph } from './pmoSupportedTransitions';
export interface PmoSpecialServiceRoute {points:SpatialPoint[];graphNodeIds:string[];traversedEdges:NavEdge[];specialSourceIds:string[];distance:number;}
const dist=(a:SpatialPoint,b:SpatialPoint)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const valid=(p:SpatialPoint)=>p.length===3&&p.every(Number.isFinite);
const near=(a:SpatialPoint,b:SpatialPoint)=>dist(a,b)<0.000001;
/** Remove every ordinary edge without independently verified continuous terrain and paint. */
export function certifyPmoSupportedWalkGraph(view:PmoSupportedGraph,verify:(from:SpatialPoint,to:SpatialPoint)=>boolean):PmoSupportedGraph {
 const outgoing:NavigationGraph['outgoing']={};
 for(const [id,edges] of Object.entries(view.graph.outgoing)){
  const start=view.graph.nodes[id];if(!start)continue;
  outgoing[id]=edges.filter(edge=>{
   const goal=view.graph.nodes[edge.to];if(!goal||!valid(start.position)||!valid(goal.position))return false;
   if(edge.mode!=='walk')return !!view.surfaces[edge.sourceId]&&view.surfaces[edge.sourceId].kind===edge.mode;
   try{return verify(start.position,goal.position)===true;}catch{return false;}
  });
 }
 return {...view,graph:{...view.graph,outgoing}};
}
/** Resolve endpoint connectors and waypoint-expanded graph route, without inventing shortcuts. */
export function planPmoSupportedServiceRoute(view:PmoSupportedGraph,start:SpatialPoint,goal:SpatialPoint,verify:(from:SpatialPoint,to:SpatialPoint)=>boolean,radius=0.44):PmoSpecialServiceRoute|null {
 if(!valid(start)||!valid(goal)||!Number.isFinite(radius)||radius<=0)return null;
 const nodes=Object.values(view.graph.nodes);
 const candidates=(point:SpatialPoint)=>nodes.filter(n=>n.role==='walk'&&valid(n.position)&&dist(n.position,point)<=radius)
 .sort((a,b)=>dist(a.position,point)-dist(b.position,point)||a.id.localeCompare(b.id)).slice(0,5)
 .filter(n=>{try{return verify(point,n.position)===true;}catch{return false;}});
 const starts=candidates(start),goals=candidates(goal);if(!starts.length||!goals.length)return null;
 let winner:PmoSpecialServiceRoute|null=null;
 for(const a of starts)for(const b of goals){
  let endOk=false;try{endOk=verify(b.position,goal)===true;}catch{endOk=false;}if(!endOk)continue;
  const route=routePmoSupportedGraph(view,a.id,b.id);if(!route||route.points.length<2)continue;
  const points:SpatialPoint[]=[];const push=(p:SpatialPoint)=>{if(!points.length||!near(points[points.length-1],p))points.push([p[0],p[1],p[2]]);};
  push(start);for(const p of route.points)push(p);push(goal);
  if(points.length>8192||points.some(p=>!valid(p)))continue;
  const length=points.slice(1).reduce((n,p,i)=>n+dist(points[i],p),0);
  if(!Number.isFinite(length)||length<=0)continue;
  const result:PmoSpecialServiceRoute={points,graphNodeIds:route.graphNodeIds,traversedEdges:route.traversedEdges,specialSourceIds:route.specialSourceIds,distance:length};
  if(!winner||length<winner.distance)winner=result;
 }
 return winner;
}
