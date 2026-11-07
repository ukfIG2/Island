import { describe,expect,it } from 'vitest';
import {certifyBuilding8LiftBypass} from './pmoBuilding8LiftBypass';
import {avoidsBuildingFootprint} from './pmoDerivedStructureClearance';
import type {SpatialPoint} from './registry';
const building:SpatialPoint=[-1.4041,-.9461,3.3013];
const walk:SpatialPoint=[-.84,-.9358263742028339,3.36];
const lift:SpatialPoint=[-2.0794,-.9096,2.9613];
const connector={project:(p:SpatialPoint)=>p,verify:()=>true};
const terrain={project:(x:number,z:number,y:number):SpatialPoint=>[x,-1,z]};
describe('Building 8 stair-through-building removal',()=>{
 it('proves the old pickup crosses the building',()=>{
  expect(avoidsBuildingFootprint(walk,lift,building,.49)).toBe(false);
 });
 it('constructs a bidirectional motor microstep deck outside clearance',()=>{
  const result=certifyBuilding8LiftBypass(walk,lift,building,connector,terrain);
  expect(result?.kind).toBe('bridge');
  expect(result!.physicalSamples.length).toBeGreaterThan(60);
  for(let i=1;i<result!.physicalSamples.length;i++){
   const a=result!.physicalSamples[i-1],b=result!.physicalSamples[i];
   expect(avoidsBuildingFootprint(a,b,building,.49)).toBe(true);
   expect(Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2])).toBeLessThan(.077);
  }
 });
 it('rejects a structural span over missing terrain wider than 0.12',()=>{
  expect(certifyBuilding8LiftBypass(walk,lift,building,connector,{project:()=>null})).toBeNull();
 });
 it('fails closed if the deck collides with rising terrain',()=>{
  const tooHigh={project:(x:number,z:number,y:number):SpatialPoint=>[x,y+.08,z]};
  expect(certifyBuilding8LiftBypass(walk,lift,building,connector,tooHigh)).toBeNull();
 });
 it('cannot be moved to a new GLB or a changed PMO lift coordinate',()=>{
  expect(certifyBuilding8LiftBypass(walk,[-2.00,-.9096,2.9613],building,connector,terrain)).toBeNull();
 });
});
