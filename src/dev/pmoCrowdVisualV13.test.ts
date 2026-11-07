import {describe,it,expect} from 'vitest';
import {CrowdRouteVariation} from './pmoCrowdRouteVariation';
import {CROWD_DEV_SERVICE_SECONDS,CrowdServiceSlots} from './pmoCrowdServicePolicy';
import type {BrushGraph,PmoTerrainConnector,RouteResult,RouteStep,SpatialPoint} from '../render/spatialMeta/pmoBrushCorridors';
const p=(x:number,z=0):SpatialPoint=>[x,0,z];
const graph:BrushGraph={
  rules:{maxWalkLink:.30,maxGrade:.72,maxStepY:.2,paintHeightTolerance:.52,step:.14},
  nodes:[],neighbors:[],helpers:{},rejectedHelpers:[],
  stamps:Array.from({length:9},(_,i)=>({center:p(i*.55),radius:.72,sourceId:'pmo'+i})),
};
const connector:PmoTerrainConnector={project:q=>[...q],verify:()=>true};
function baseRoute(n:number):RouteResult {
  const steps:RouteStep[]=Array.from({length:n},(_,i)=>({kind:'walk',from:p(i*.14),to:p((i+1)*.14),brushSourceIds:[]}));
  return {status:'READY',steps,points:[p(0),...steps.map(s=>s.to)],distance:n*.14,brushSourceIds:[]};
}
describe('visual crowd V1.3 physical witnesses',()=>{
  it('creates a smooth measurable personal lane on a walk run shorter than the former 5.2m threshold',()=>{
    const route=baseRoute(15),model=new CrowdRouteVariation(graph,connector,()=>true,.52,.5);
    const result=model.apply('ferry-guest-001',route);
    expect(result.status).toBe('READY');if(result.status!=='READY'||route.status!=='READY')return;
    expect(model.stats.variedRoutes).toBe(1);
    expect(model.stats.largest).toBeGreaterThan(.15);
    expect(model.stats.variedMeters).toBeGreaterThan(1.5);
    for(let i=0;i<result.steps.length-1;i++)expect(result.steps[i].to).toEqual(result.steps[i+1].from);
    expect(result.steps[0].from).toEqual(route.steps[0].from);
    expect(result.steps.at(-1)?.to).toEqual(route.steps.at(-1)?.to);
    // Low-frequency smooth displacement: successive offsets may not jump suddenly.
    for(let i=0;i<result.steps.length-2;i++){
      const a=result.steps[i].to[2]-route.steps[i].to[2];
      const b=result.steps[i+1].to[2]-route.steps[i+1].to[2];
      expect(Math.abs(a-b)).toBeLessThan(.20);
    }
  });
  it('never claims a personalized path when the physical validator rejects the bend',()=>{
    const original=baseRoute(17),model=new CrowdRouteVariation(graph,connector,()=>false,.52,.5);
    const changed=model.apply('ferry-guest-002',original);
    expect(changed).toEqual(original);
    expect(model.stats.variedRoutes).toBe(0);
    expect(model.stats.rejected).toBeGreaterThan(0);
  });
  it('preserves the exact authored bridge ports',()=>{
    const route=baseRoute(24);if(route.status!=='READY')throw Error('fixture');
    const steps=[...route.steps];steps.splice(11,0,{
      kind:'bridge',from:p(11*.14),to:p(11*.14),helperId:'author-bridge',brushSourceIds:[],
    });
    const model=new CrowdRouteVariation(graph,connector,()=>true,.52,.5);
    const changed=model.apply('ferry-guest-003',{...route,steps});
    expect(changed.status).toBe('READY');if(changed.status!=='READY')return;
    expect(changed.steps[11]).toEqual(steps[11]);
  });
  it('keeps meaningful DEV queues alive without changing gameplay Core',()=>{
    expect(CROWD_DEV_SERVICE_SECONDS).toBeGreaterThanOrEqual(8);
    const q=new CrowdServiceSlots(3,CROWD_DEV_SERVICE_SECONDS);
    for(let i=0;i<12;i++)q.enqueue(0,'q'+i);
    q.tick(.05);
    expect(q.pending()).toBe(9);
    expect(q.active()).toBe(3);
    q.tick(1);
    expect(q.pending()).toBe(9);
    expect(q.ahead(0,'q11')).toBe(11);
  });
});
