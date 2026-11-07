import {describe,it,expect} from 'vitest';
import {CrowdRouteVariation} from './pmoCrowdRouteVariation';
import type {BrushGraph,PmoTerrainConnector,RouteResult,RouteStep,SpatialPoint} from '../render/spatialMeta/pmoBrushCorridors';
const p=(x:number,z=0):SpatialPoint=>[x,0,z];
const rules={maxWalkLink:.30,maxGrade:.72,maxStepY:.2,paintHeightTolerance:.52,step:.14};
const level:PmoTerrainConnector={project:q=>[...q],verify:()=>true};
const base=(n:number,step:number,zAxis=false):RouteResult=>{
  const points=Array.from({length:n+1},(_,i)=>zAxis?p(0,i*step):p(i*step));
  const edges:RouteStep[]=points.slice(0,-1).map((from,i)=>({kind:'walk',from,to:points[i+1],brushSourceIds:['paint']}));
  return {status:'READY',steps:edges,points,distance:n*step,brushSourceIds:['paint']};
};
const paint=(radius:number):BrushGraph=>({nodes:[],neighbors:[],helpers:{},rejectedHelpers:[],rules,
  stamps:[{center:p(0,2.8),radius,sourceId:'paint'}]});
const maxOffsetJump=(output:RouteResult,original:RouteResult):number=>{
  if(output.status!=='READY'||original.status!=='READY')throw Error('route not ready');
  const offsets=output.steps.map((s,i)=>[s.to[0]-original.steps[i].to[0],s.to[2]-original.steps[i].to[2]]);
  return Math.max(...offsets.slice(1).map((a,i)=>Math.hypot(a[0]-offsets[i][0],a[1]-offsets[i][1])));
};
describe('RRH V1.5.2a lateral approach and departure taper',()=>{
  it('passes the unmodified V1.3 no-jerk requirement even at 2x requested amplitude',()=>{
    const area:BrushGraph={...paint(8),stamps:Array.from({length:9},(_,i)=>({center:p(i*.55),radius:.72,sourceId:'paint'}))};
    const original=base(15,.14);
    const planner=new CrowdRouteVariation(area,level,()=>true,.52,.5);
    const variant=planner.apply('ferry-guest-001',original);
    expect(variant.status).toBe('READY');
    if(variant.status!=='READY'||original.status!=='READY')return;
    expect(planner.stats.variedRoutes).toBe(1);
    expect(planner.stats.largest).toBeGreaterThan(.15);
    expect(maxOffsetJump(variant,original)).toBeLessThan(.20);
    expect(variant.steps[0].from).toEqual(original.steps[0].from);
    expect(variant.steps.at(-1)!.to).toEqual(original.steps.at(-1)!.to);
  });
  it('preserves the full 1.04m spread on wide paint while easing into both ports',()=>{
    const original=base(50,.12,true);
    const planner=new CrowdRouteVariation(paint(9),level,()=>true,.52,.5);
    const variant=planner.apply('wide-surface-actor-041',original);
    expect(variant.status).toBe('READY');
    if(variant.status!=='READY'||original.status!=='READY')return;
    expect(planner.stats.largest).toBeGreaterThan(.99);
    expect(planner.stats.largest).toBeLessThanOrEqual(1.041);
    expect(maxOffsetJump(variant,original)).toBeLessThan(.20);
    expect(variant.steps[0].from).toEqual(original.steps[0].from);
    expect(variant.steps.at(-1)!.to).toEqual(original.steps.at(-1)!.to);
  });
});
