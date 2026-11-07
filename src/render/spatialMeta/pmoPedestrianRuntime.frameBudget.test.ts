import { describe, expect, it } from 'vitest';
import { PmoPedestrianRuntime } from './pmoPedestrianRuntime';
import { certifyDirectedWalk } from './pmoWalkKinematics';
import type { BrushGraph, PmoTerrainConnector, SpatialPoint } from './pmoBrushCorridors';

const start: SpatialPoint = [0,0,0];
const end: SpatialPoint = [0.24,0,0];
const graph: BrushGraph = {
  nodes:[{id:0,point:start,sources:['paint']},{id:1,point:end,sources:['paint']}],
  neighbors:[[{to:1,cost:0.24,kind:'walk'}],[{to:0,cost:0.24,kind:'walk'}]],
  stamps:[{center:[0.12,0,0],radius:0.5,sourceId:'paint'}],
  helpers:{},rejectedHelpers:[],
  rules:{maxGrade:0.72,maxStepY:0.2,step:0.14,maxWalkLink:0.32,paintHeightTolerance:0.52},
};
const flat: PmoTerrainConnector = {project:p=>[...p],verify:()=>true};
function started(connector: PmoTerrainConnector = flat, speed = 0.3) {
  const runtime = new PmoPedestrianRuntime(graph,connector,{collisionSpacing:0});
  expect(runtime.add({id:'guest',from:start,to:end,speed}).status).toBe('READY');
  runtime.tick(0.020166666667); // zero-length first attachment step
  return runtime;
}

describe('RRH real-frame physical stepping',()=>{
  it('does not turn 0.05 mm of remaining frame budget into WALK_NO_FORWARD_PROGRESS',()=>{
    const runtime=started();
    runtime.tick(0.020166666667); // budget 0.00605 -> 0.006 + 0.00005
    const snap=runtime.snapshots()[0];
    expect(snap.status).toBe('walking');
    expect(snap.fault).toBeNull();
    expect(snap.position[0]).toBeGreaterThan(0.0059);
  });
  it('executes physically certified walks to arrival with variable frame rates',()=>{
    expect(certifyDirectedWalk(start,end,graph,flat)).toBeNull();
    for(const speed of [0.3,0.34,0.4,0.46]){
      const runtime=started(flat,speed);
      const frameSeconds=[0.020166666667,0.016666666667,0.033333333333,0.01002,0.0167,0.008];
      for(let i=0;i<600 && runtime.snapshots()[0].status!=='arrived';i++){
        runtime.tick(frameSeconds[i%frameSeconds.length]);
        expect(runtime.snapshots()[0].status).not.toBe('blocked');
      }
      const final=runtime.snapshots()[0];
      expect(final.status).toBe('arrived');
      expect(final.position[0]).toBeCloseTo(0.24,4);
    }
  });
  it('still fails closed on a genuinely unwalkable height discontinuity',()=>{
    const cliff: PmoTerrainConnector={
      project:p=>[p[0],p[0]<0.1?0:0.085,p[2]],
      verify:()=>true,
    };
    const runtime=started(cliff);
    for(let i=0;i<300 && runtime.snapshots()[0].status!=='blocked';i++)runtime.tick(0.0167);
    const final=runtime.snapshots()[0];
    expect(final.status).toBe('blocked');
    expect(final.fault).toBe('WALK_LOCAL_GRADE_OR_VERIFY_FAILED');
    expect(final.position[0]).toBeLessThan(0.1);
  });
});
