import {describe,it,expect} from 'vitest';
import {PmoCrowdLiftBatch} from './pmoCrowdLiftBatch';
import {PmoLiftTransit} from '../render/spatialMeta/pmoLiftTransit';
import {PmoPedestrianRuntime} from '../render/spatialMeta/pmoPedestrianRuntime';
import type {PmoStructure} from '../render/spatialMeta/pmoTransitionStructures';
import type {PmoTransitionAccess} from '../render/spatialMeta/pmoTransitionAccess';
import type {BrushGraph,PmoRouteHelper,PmoTerrainConnector,SpatialPoint} from '../render/spatialMeta/pmoBrushCorridors';
const a:SpatialPoint=[0,0,0],b:SpatialPoint=[1,1,0];
const helper:PmoRouteHelper={id:'crowd-lift',sourceId:'crowd-lift',edgeId:'test-edge',kind:'lift',from:a,to:b,capacity:1};
const structure={sourceId:'crowd-lift',edgeId:'test-edge',kind:'lift',from:a,to:b,segments:[],travelCertified:false} as PmoStructure;
const access={sourceId:'crowd-lift',edgeId:'test-edge',kind:'lift',attached:true,geometryContinuous:true,eligibleForPhysicalReview:true,travelCertified:false,issues:[],walkNodeIds:['a','b']} as PmoTransitionAccess;
const terrain:PmoTerrainConnector={project:p=>[...p],verify:()=>true};
const graph:BrushGraph={nodes:[{id:0,point:a,sources:['walk']},{id:1,point:b,sources:['walk']}],
 neighbors:[[{to:1,cost:2,kind:'lift',helperId:helper.id}],[{to:0,cost:2,kind:'lift',helperId:helper.id}]],
 stamps:[{center:a,radius:.3,sourceId:'walk'},{center:b,radius:.3,sourceId:'walk'}],
 helpers:{[helper.id]:helper},rejectedHelpers:[],
 rules:{step:.14,maxWalkLink:.30,maxGrade:.72,maxStepY:.2,paintHeightTolerance:.52}};
function rig(){
 const lift=new PmoLiftTransit([structure],[access],terrain);
 const batch=new PmoCrowdLiftBatch(lift,4,.35,.65);
 const motor=new PmoPedestrianRuntime(graph,terrain,{collisionSpacing:0,liftBatch:batch,
  onHelperExit:(h,id)=>batch.release(h,id),
  samplePhysicalHelper:(h,t,from,to,id)=>lift.ride(h,t,from,to,id)});
 return {lift,batch,motor};
}
describe('physical synchronized 4-rider lift batches: crowd test only',()=>{
 it('collects four passengers and moves them together on one actual car',()=>{
  const {lift,batch,motor}=rig();
  for(let i=0;i<4;i++)expect(motor.add({id:'rider'+i,from:a,to:b,speed:.22+.12*i}).status).toBe('READY');
  let maxTogether=0,nonCoLocated=0;
  for(let i=0;i<600;i++){
   lift.tick(.04);batch.tick(.04);motor.tick(.04);
   const aboard=motor.snapshots().filter(x=>x.status==='crossing-helper');
   maxTogether=Math.max(maxTogether,aboard.length);
   for(const passenger of aboard){const car=lift.position(helper.sourceId)!;
    if(passenger.position.some((v,k)=>Math.abs(v-car[k])>1e-7))nonCoLocated++;}
   expect(motor.snapshots().some(x=>x.status==='blocked')).toBe(false);
   if(motor.snapshots().every(x=>x.status==='arrived'))break;
  }
  expect(maxTogether).toBe(4);expect(nonCoLocated).toBe(0);
  expect(motor.snapshots().every(x=>x.status==='arrived')).toBe(true);
  expect(batch.stats().trips).toBe(1);expect(batch.stats().peakGroup).toBe(4);
  expect(lift.position(helper.sourceId)).toEqual(b);
 });
 it('releases a shared car only after the last passenger and can carry reverse trip',()=>{
  const {lift,batch,motor}=rig();
  for(let i=0;i<4;i++)expect(motor.add({id:'out'+i,from:a,to:b}).status).toBe('READY');
  for(let i=0;i<400;i++){lift.tick(.04);batch.tick(.04);motor.tick(.04);
   if(motor.snapshots().every(x=>x.status==='arrived'))break;}
  for(let i=0;i<4;i++)expect(motor.add({id:'back'+i,from:b,to:a}).status).toBe('READY');
  for(let i=0;i<400;i++){lift.tick(.04);batch.tick(.04);motor.tick(.04);
   if(motor.snapshots().filter(x=>x.id.startsWith('back')).every(x=>x.status==='arrived'))break;}
  expect(motor.snapshots().filter(x=>x.id.startsWith('back')).every(x=>x.status==='arrived')).toBe(true);
  expect(batch.stats().trips).toBe(2);expect(lift.position(helper.sourceId)).toEqual(a);
 });
 it('never assigns a rider to the wrong dock and never fakes a car sample',()=>{
  const {batch}=rig();
  expect(batch.enter(helper,[3,0,3],b,'bad')).toBe(false);
  expect(batch.sample(helper,a,b,'bad')).toBeNull();
 });
});
