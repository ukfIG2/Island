import {describe,it,expect} from 'vitest';
import type {SpatialPoint,RouteStep} from './pmoBrushCorridors';
import {pmoRouteStepsConflict as conflict} from './pmoRouteConflict';
const pt=(x:number,y:number,z:number):SpatialPoint=>[x,y,z];
const walk=(a:SpatialPoint,b:SpatialPoint):RouteStep=>({kind:'walk',from:a,to:b,brushSourceIds:['test']});
describe('shared PMO route arbitration',()=>{
  it('is symmetric and distinguishes crossing from independent lanes',()=>{
    const base=[walk(pt(0,0,0),pt(2,0,0))];
    const crossing=[walk(pt(1,0,-1),pt(1,0,1))];
    const reverse=[walk(pt(2,0,0),pt(0,0,0))];
    const separate=[walk(pt(0,0,.5),pt(2,0,.5))];
    for(const route of [crossing,reverse,separate])expect(conflict(base,route)).toBe(conflict(route,base));
    expect(conflict(base,crossing)).toBe(true);
    expect(conflict(base,reverse)).toBe(true);
    expect(conflict(base,separate)).toBe(false);
  });
  it('respects elevation and reserves special transports',()=>{
    const base=[walk(pt(0,0,0),pt(2,0,0))];
    expect(conflict(base,[walk(pt(1,.6,-1),pt(1,.6,1))])).toBe(false);
    expect(conflict(base,[{...walk(pt(30,0,30),pt(31,0,31)),kind:'bridge'}])).toBe(true);
  });
});
