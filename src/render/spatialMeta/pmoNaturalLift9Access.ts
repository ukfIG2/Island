/** Use the existing painted west-bank path to the AUTHOR's original 8->9 lift.
 * Neither move PMO endpoints nor bridge through building_8. The shortest
 * pre-existing dock remains the physical handoff at the lower lift portal.
 */
import type { NavigationGraph } from './navigation';
import type { PmoTerrainConnector } from './pmoBrushCorridors';

export type NaturalLiftAccess={
  certified:boolean;dockNodeId:string|null;visited:number;diagnostic:string;
};
const rules={maxStepY:.20,maxGrade:.72};
function shortWalkPhysicallyVerified(graph:NavigationGraph,from:string,to:string,connector:PmoTerrainConnector):boolean {
  const a=graph.nodes[from]?.position,b=graph.nodes[to]?.position;
  if(!a||!b)return false;
  const dx=Math.hypot(a[0]-b[0],a[2]-b[2]);
  if(dx<1e-9)return Math.abs(a[1]-b[1])<1e-8;
  const dy=Math.abs(a[1]-b[1]);
  if(dy>rules.maxStepY||dy/dx>rules.maxGrade)return false;
  // Only already compiled ordinary links; never bridge gaps between paint stamps.
  return connector.verify(a,b)&&connector.verify(b,a);
}
export function verifyNaturalLift9Access(
  graph:NavigationGraph, bridgeWalkId:string, liftLowerPortalId:string,
  liftId:string,connector:PmoTerrainConnector,
):NaturalLiftAccess {
  const missing=(detail:string,visited=0):NaturalLiftAccess=>({certified:false,dockNodeId:null,visited,
    diagnostic:'PMO_LIFT9_NATURAL_WEST_BANK_'+detail+':visited='+visited});
  if(graph.nodes[bridgeWalkId]?.role!=='walk'||graph.nodes[liftLowerPortalId]?.role!=='portal')return missing('MISSING_PORT');
  const eligible=(graph.outgoing[liftLowerPortalId]??[]).filter(edge=>
    edge.sourceId===`pmo-dock:${liftId}:0` && graph.nodes[edge.to]?.role==='walk' &&
    (graph.outgoing[edge.to]??[]).some(reverse=>reverse.to===liftLowerPortalId&&reverse.sourceId===edge.sourceId));
  if(!eligible.length)return missing('NO_EXISTING_CERTIFIED_DOCK');
  const reached=new Set([bridgeWalkId]),queue=[bridgeWalkId];
  for(let i=0;i<queue.length;i++) {
    const from=queue[i];
    for(const edge of graph.outgoing[from]??[]) {
      const to=edge.to;
      if(edge.mode!=='walk'||graph.nodes[to]?.role!=='walk'||reached.has(to))continue;
      if(!(graph.outgoing[to]??[]).some(r=>r.to===from&&r.mode==='walk'))continue;
      if(!shortWalkPhysicallyVerified(graph,from,to,connector))continue;
      reached.add(to);queue.push(to);
    }
  }
  const found=eligible.find(edge=>reached.has(edge.to));
  if(!found)return missing('ISOLATED_PAINTED_BANK',reached.size);
  return {certified:true,dockNodeId:found.to,visited:reached.size,
    diagnostic:`PMO_LIFT9_NATURAL_WEST_BANK_CONNECTED:${bridgeWalkId}->${found.to}:walks=${reached.size}`};
}
