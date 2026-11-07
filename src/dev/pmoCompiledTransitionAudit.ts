/** READ-ONLY diagnostic of the actual, motion-audited navigation graph.
 * Transition geometry certification and beach-component reachability are
 * independent questions: a drawable bridge is not a reachable bridge.
 */
import type {BrushGraph,SpatialPoint} from '../render/spatialMeta/pmoBrushCorridors';
import type {PmoStructure} from '../render/spatialMeta/pmoTransitionStructures';
import type {PmoTransitionAccess} from '../render/spatialMeta/pmoTransitionAccess';
import type {CompiledTestGraph} from './pmoCompiledGraphAdapter';

const distance=(a:readonly number[],b:readonly number[])=>
  Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);

export interface PmoCompiledTransitionDiagnosis {
  sourceId:string;
  status:'READY_CONNECTED'|'CERTIFIED_BUT_ISOLATED'|'REJECTED';
  portReachability:readonly ('yes'|'no'|'missing')[];
  details:string;
}

export function auditCompiledTransitionConnectivity(
  graph:BrushGraph,beach:SpatialPoint,
  structures:readonly PmoStructure[],
  accesses:readonly PmoTransitionAccess[],
  adapter:Pick<CompiledTestGraph,'accepted'|'rejected'>,
):PmoCompiledTransitionDiagnosis[]{
  if(!graph.nodes.length)return structures.map(s=>({sourceId:s.sourceId,status:'REJECTED',
    portReachability:['missing','missing'],details:'EMPTY_GRAPH'}));
  const origin=graph.nodes.reduce((best,node)=>
    distance(node.point,beach)<distance(graph.nodes[best].point,beach)?node.id:best,0);
  const seen=new Set([origin]),queue=[origin];
  for(let head=0;head<queue.length;head++){
    for(const edge of graph.neighbors[queue[head]]??[]){
      if(!seen.has(edge.to)){seen.add(edge.to);queue.push(edge.to);}
    }
  }
  return structures.map(s=>{
    const findPortal=(p:SpatialPoint)=>graph.nodes.find(node=>
      node.sources.includes(s.sourceId)&&distance(node.point,p)<0.0001);
    const p0=findPortal(s.from),p1=findPortal(s.to);
    const ports=([p0,p1] as const).map(p=>p?(seen.has(p.id)?'yes':'no'):'missing') as ('yes'|'no'|'missing')[];
    const accepted=adapter.accepted.includes(s.sourceId);
    const access=accesses.find(a=>a.sourceId===s.sourceId&&a.edgeId===s.edgeId);
    const denial=adapter.rejected.find(x=>x.startsWith(s.sourceId+':'))?.slice(s.sourceId.length+1);
    const portIssues=access?.issues.filter(issue=>
      issue!=='SPECIAL_TRANSITION_RUNTIME_TRAVEL_NOT_CERTIFIED'&&
      issue!=='LIFT_REQUIRES_RUNTIME_CABIN_RESERVATION')??[];
    const status=accepted?(ports.every(v=>v==='yes')?'READY_CONNECTED':'CERTIFIED_BUT_ISOLATED'):'REJECTED';
    const details=[denial,...portIssues,
      accepted&&ports.some(p=>p!=='yes')?'NO_BEACH_CONNECTION_TO_AUTHORED_DOCK':null]
      .filter((s):s is string=>!!s).join(', ')||'PHYSICALLY_CERTIFIED_AND_BEACH_CONNECTED';
    return {sourceId:s.sourceId,status,portReachability:ports,details};
  });
}
