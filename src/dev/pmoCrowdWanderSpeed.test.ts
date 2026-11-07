import {describe,it,expect} from 'vitest';
import {crowdSpeed,crowdWanderSpeed} from './pmoCrowdSpeed';
import {PmoPedestrianRuntime,type PedestrianSpawn,type PedestrianSnapshot} from '../render/spatialMeta/pmoPedestrianRuntime';
import {rankedQueueCandidates,queueDiffusion} from './pmoCrowdQueueDiffusion';
import type {BrushGraph,PmoTerrainConnector,SpatialPoint} from '../render/spatialMeta/pmoBrushCorridors';
const flat:PmoTerrainConnector={project:p=>[...p],verify:()=>true};
const pts:SpatialPoint[]=Array.from({length:41},(_,i)=>[i*.14,0,0]);
const graph:BrushGraph={nodes:pts.map((p,i)=>({id:i,point:p,sources:['walk']})),neighbors:pts.map((_,i)=>[
 ...(i? [{to:i-1,cost:.14,kind:'walk' as const}]:[]),
 ...(i<pts.length-1?[{to:i+1,cost:.14,kind:'walk' as const}]:[])]),
 stamps:pts.map(p=>({center:p,radius:.3,sourceId:'walk'})),helpers:{},rejectedHelpers:[],rules:{step:.14,maxWalkLink:.30,maxGrade:.72,maxStepY:.2,paintHeightTolerance:.52}};
describe('slow physical leisure pace and return to personal speed',()=>{
 it('chooses a visibly lower leisure speed for all 100 stable IDs',()=>{
  for(let i=1;i<=100;i++){
   const id='crowd-'+String(i).padStart(3,'0');
   expect(crowdWanderSpeed(id)).toBeGreaterThanOrEqual(.11);
   expect(crowdWanderSpeed(id)).toBeLessThanOrEqual(.19);
   expect(crowdWanderSpeed(id)).toBeLessThan(crowdSpeed(id));
  }
 });
 it('changes the motor displacement itself, then restores ordinary walking',()=>{
  const motor=new PmoPedestrianRuntime(graph,flat,{collisionSpacing:0});
  const id='crowd-046',normal=crowdSpeed(id),slow=crowdWanderSpeed(id);
  expect(motor.add({id,from:pts[0],to:pts[40],speed:normal}).status).toBe('READY');
  for(let i=0;i<20;i++)motor.tick(.04);
  const x0=motor.snapshots()[0].position[0];
  expect(motor.setSpeed(id,slow)).toBe(true);
  for(let i=0;i<20;i++)motor.tick(.04);
  const x1=motor.snapshots()[0].position[0];
  expect(motor.setSpeed(id,normal)).toBe(true);
  for(let i=0;i<20;i++)motor.tick(.04);
  const x2=motor.snapshots()[0].position[0];
  expect(x0).toBeGreaterThan(0);
  expect(x1-x0).toBeGreaterThan(0);
  expect(x2-x1).toBeGreaterThan((x1-x0)*1.3);
  expect(motor.setSpeed(id,Number.NaN)).toBe(false);
  expect(motor.setSpeed('missing',slow)).toBe(false);
 });
 it('restricts rank-based detours to the current PMO neighborhood instead of whole-island marks',()=>{
  const at:[number,number,number]=[12,0,0];
  const global:SpatialPoint[]=[[4,0,4],[6,0,5],[5,0,8],[3,0,-2],[4,0,-3]];
  expect(rankedQueueCandidates('crowd-046',1,at,at,global,queueDiffusion(20,'crowd-046'))).toEqual([]);
  const nearby:SpatialPoint[]=[[12.4,0,0],[12.8,0,.5],[13.2,0,0],[11.8,0,.12]];
  const low=queueDiffusion(1,'crowd-046'),high=queueDiffusion(20,'crowd-046');
  expect(high.radius).toBeGreaterThan(low.radius);
  expect(high.speed).toBeGreaterThan(low.speed);
  expect(high.cadenceSeconds).toBeGreaterThan(low.cadenceSeconds);
  expect(rankedQueueCandidates('crowd-046',1,at,at,nearby,high).length).toBeGreaterThan(0);
 });
});
