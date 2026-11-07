import {describe,it,expect} from 'vitest';
import {certifyDirectedWalk} from '../render/spatialMeta/pmoWalkKinematics';
import {PmoPedestrianRuntime} from '../render/spatialMeta/pmoPedestrianRuntime';
import {CrowdRouteVariation} from './pmoCrowdRouteVariation';
import type {BrushGraph,PmoTerrainConnector,RouteResult,RouteStep,SpatialPoint} from '../render/spatialMeta/pmoBrushCorridors';
const p=(x:number,z=0):SpatialPoint=>[x,0,z];
const rules={maxGrade:.72,maxStepY:.20,step:.14,maxWalkLink:.215,paintHeightTolerance:.52};
function testGraph(end=.1803):BrushGraph {return {
  nodes:[{id:0,point:p(0),sources:['paint']},{id:1,point:p(end),sources:['paint']}],
  neighbors:[[{to:1,cost:end,kind:'walk'}],[{to:0,cost:end,kind:'walk'}]],
  stamps:[{center:p(.09),radius:2,sourceId:'paint'}],helpers:{},rejectedHelpers:[],rules,
};}

describe('RRH PMO V1.5.2 physical preflight and 2x personal spread',()=>{
  it('gives the same certification result with and without a live trace at a submillimetre terrain seam',()=>{
    const graph=testGraph();
    const stepped:PmoTerrainConnector={
      project:q=>[Math.round(q[0]*1000)/1000,q[1],q[2]],
      // Simulate a real fine-scale terrain seam: coarse 6mm edges verify,
      // the final 0.3mm attachment to the authored point does not.
      verify:(a,b)=>{const delta=Math.abs(a[0]-b[0]);return delta<1e-8||delta>=.0005;},
    };
    const preflight=certifyDirectedWalk(p(0),p(.1803),graph,stepped);
    const trace:SpatialPoint[]=[];
    const replay=certifyDirectedWalk(p(0),p(.1803),graph,stepped,.006,trace);
    expect(preflight).not.toBeNull();
    expect(preflight?.fault).toBe('LOCAL_GRADE_OR_VERIFY_FAILED');
    expect(replay?.fault).toBe(preflight?.fault);
    const motor=new PmoPedestrianRuntime(graph,stepped,{collisionSpacing:0,followCertifiedWalkTrace:true});
    expect(motor.add({id:'guest',from:p(0),to:p(.1803),speed:.4}).status).not.toBe('READY');
  });
  it('still accepts and replays an actually certified, continuous walking trace',()=>{
    const graph=testGraph(.18);
    const level:PmoTerrainConnector={project:q=>[...q],verify:()=>true};
    const trace:SpatialPoint[]=[];
    expect(certifyDirectedWalk(p(0),p(.18),graph,level)).toBeNull();
    expect(certifyDirectedWalk(p(0),p(.18),graph,level,.006,trace)).toBeNull();
    const motor=new PmoPedestrianRuntime(graph,level,{collisionSpacing:0,followCertifiedWalkTrace:true});
    expect(motor.add({id:'guest',from:p(0),to:p(.18),speed:.4}).status).toBe('READY');
    for(let i=0;i<100;i++)motor.tick(.05);
    expect(motor.snapshots()[0].status).toBe('arrived');
  });
  it('achieves more than twice the former 0.52m cap on wide real-PMO-like paint, without shifting endpoints',()=>{
    const graph=testGraph();
    const wide:BrushGraph={...graph,stamps:[{center:p(0,3),radius:9,sourceId:'paint'}]};
    const level:PmoTerrainConnector={project:q=>[...q],verify:()=>true};
    const steps:RouteStep[]=Array.from({length:50},(_,i)=>({
      kind:'walk',from:p(0,i*.12),to:p(0,(i+1)*.12),brushSourceIds:['paint'],
    }));
    const route:RouteResult={status:'READY',steps,points:[...steps.map(s=>s.from),steps.at(-1)!.to],distance:6,brushSourceIds:['paint']};
    const spread=new CrowdRouteVariation(wide,level,()=>true,.52,.5);
    const changed=spread.apply('wide-surface-actor-041',route);
    expect(changed.status).toBe('READY');
    if(changed.status!=='READY')return;
    expect(spread.stats.largest).toBeGreaterThan(.9);
    expect(changed.steps[0].from).toEqual(steps[0].from);
    expect(changed.steps.at(-1)!.to).toEqual(steps.at(-1)!.to);
    for(const s of changed.steps){
      expect(Math.abs(s.from[0])).toBeLessThanOrEqual(1.041);
      expect(Math.abs(s.to[0])).toBeLessThanOrEqual(1.041);
    }
  });
});
