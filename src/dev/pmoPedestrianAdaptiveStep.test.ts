import {describe,it,expect} from 'vitest';
import {PmoPedestrianRuntime} from '../render/spatialMeta/pmoPedestrianRuntime';
import type {BrushGraph,SpatialPoint} from '../render/spatialMeta/pmoBrushCorridors';
const p=(x:number):SpatialPoint=>[x,0,0];
const nodes=[{id:0,point:p(0),sources:['walk']},{id:1,point:p(.18),sources:['walk']}];
const graph:BrushGraph={nodes,neighbors:[[{to:1,cost:.18,kind:'walk'}],[{to:0,cost:.18,kind:'walk'}]],
  stamps:[{center:p(.09),radius:.6,sourceId:'walk'}],helpers:{},rejectedHelpers:[],
  rules:{maxGrade:.72,maxStepY:.20,step:.18,maxWalkLink:.28,paintHeightTolerance:.52}};

describe('PMO adaptive step physical safety',()=>{
  it('retries smaller *verified* steps instead of falsely blocking an executable coarse edge',()=>{
    const connector={project:(q:SpatialPoint):SpatialPoint=>[...q],
      verify:(a:SpatialPoint,b:SpatialPoint)=>{const d=Math.abs(a[0]-b[0]);return d<=.012||d>=.05;}};
    const runtime=new PmoPedestrianRuntime(graph,connector);
    expect(runtime.add({id:'first',from:p(0),to:p(.18),speed:.4}).status).toBe('READY');
    for(let i=0;i<100;i++)runtime.tick(.05);
    expect(runtime.snapshots()[0].status).toBe('arrived');
    expect(runtime.snapshots()[0].fault).toBeNull();
  });
  it('never passes an actual forbidden steep terrain ledge by retrying smaller steps',()=>{
    const connector={project:(q:SpatialPoint):SpatialPoint=>[q[0],q[0]>.055?.16:0,q[2]],verify:()=>true};
    const runtime=new PmoPedestrianRuntime(graph,connector);
    expect(runtime.add({id:'ledge',from:p(0),to:p(.18),speed:.4}).status).toBe('READY');
    for(let i=0;i<100;i++)runtime.tick(.05);
    const a=runtime.snapshots()[0];
    expect(a.status).toBe('blocked');
    expect(a.position[0]).toBeLessThanOrEqual(.055001);
    expect(a.fault).toBe('WALK_LOCAL_GRADE_OR_VERIFY_FAILED');
  });
});
