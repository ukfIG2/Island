import {describe,it,expect} from 'vitest';
import {buildCrowdSpatialPlan} from './pmoCrowdSpatialTargets';
import {localQueueWanderPools} from './pmoCrowdQueueDiffusion';
import type {BrushGraph,PmoTerrainConnector,SpatialPoint} from '../render/spatialMeta/pmoBrushCorridors';
const p=(x:number):SpatialPoint=>[x,0,0];
const terrain:PmoTerrainConnector={project:at=>[...at],verify:()=>true};
function directedGraph():BrushGraph {
  const nodes=Array.from({length:5},(_,id)=>({id,point:p(id*.35),sources:['pmo']}));
  const neighbors=nodes.map((_,i)=>[
    ...(i>0&&i<=2?[{to:i-1,kind:'walk' as const,cost:.35}]:[]),
    ...(i<4?[{to:i+1,kind:'walk' as const,cost:.35}]:[]),
  ]);
  return {nodes,neighbors,stamps:[{center:p(.7),radius:2,sourceId:'pmo'}],helpers:{},rejectedHelpers:[],
    rules:{step:.14,maxGrade:.72,maxStepY:.20,maxWalkLink:.215,paintHeightTolerance:.52}};
}
describe('RRH PMO V1.4.1 one-way wander prevention',()=>{
  it('excludes one-way-only PMO targets that cannot return to the service queue',()=>{
    const graph=directedGraph(),site=p(0);
    const outgoing=localQueueWanderPools(graph,[site])[0];
    expect(outgoing.some(at=>at[0]>=1.05)).toBe(true); // V1.4 bug reproduced
    const plan=buildCrowdSpatialPlan(graph,terrain,site,[site],3,()=>true);
    expect(plan.wanderBySite[0].length).toBeGreaterThan(0);
    expect(plan.wanderBySite[0].every(at=>at[0]<=.700001)).toBe(true);
    expect(plan.wanderBySite[0].every(at=>outgoing.some(x=>x[0]===at[0]))).toBe(true);
  });
  it('does not remove legal bidirectionally reachable walking locations',()=>{
    const graph=directedGraph();
    const plan=buildCrowdSpatialPlan(graph,terrain,p(0),[p(0)],3,()=>true);
    expect(plan.wanderBySite[0].some(at=>at[0]===.35)).toBe(true);
  });
});
