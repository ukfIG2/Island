import {describe, it, expect} from 'vitest';
import {compilePmoBrushCorridors, type SpatialPoint} from '../render/spatialMeta/pmoBrushCorridors';
import {auditPmoWalkMotion, certifyWalkMotion} from './pmoWalkMotionAudit';

const at = (x:number):SpatialPoint => [x,0,0];
const flat={project:(p:SpatialPoint):SpatialPoint=>[p[0],0,p[2]],verify:()=>true};
const stamps=[{center:[0,0,0] as SpatialPoint,radius:0.75,sourceId:'walk'}];
const options={step:0.18,maxWalkLink:0.28};

describe('PMO motor-step vs coarse-graph regression',()=>{
  it('preserves physically executable edges on level terrain',()=>{
    const graph=compilePmoBrushCorridors(stamps,flat,[],options);
    const audit=auditPmoWalkMotion(graph,flat);
    expect(audit.walkDirectedRejected).toBe(0);
    expect(audit.walkDirectedAccepted).toBeGreaterThan(30);
  });
  it('excludes links whose middle has a sharp terrain rise even when coarse verify passes',()=>{
    const height=(x:number)=>x>=0.04 && x<0.08?0.08:0;
    const connector={project:(p:SpatialPoint):SpatialPoint=>[p[0],height(p[0]),p[2]],verify:()=>true};
    const graph=compilePmoBrushCorridors(stamps,connector,[],options);
    const audit=auditPmoWalkMotion(graph,connector);
    expect(audit.walkDirectedRejected).toBeGreaterThan(0);
    expect(audit.examples.some(e=>e.failure.reason==='LOCAL_GRADE_OR_VERIFY_FAILED')).toBe(true);
    // No invented paths, geometry, or relaxation of the graph's grade rule.
    expect(audit.graph.rules).toEqual(graph.rules);
  });
  it('rejects a physically impossible per-frame microstep, not silently advancing',()=>{
    const height=(x:number)=>x>=0.04 && x<0.08?0.08:0;
    const connector={project:(p:SpatialPoint):SpatialPoint=>[p[0],height(p[0]),p[2]],verify:()=>true};
    const graph=compilePmoBrushCorridors(stamps,connector,[],options);
    const issue=certifyWalkMotion(at(0),at(0.18),graph,connector);
    expect(issue?.reason).toBe('LOCAL_GRADE_OR_VERIFY_FAILED');
    expect(issue?.dy).toBeGreaterThan(0);
  });
});
