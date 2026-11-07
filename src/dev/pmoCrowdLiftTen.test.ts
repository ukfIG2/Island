import {describe,it,expect} from 'vitest';
import {PmoCrowdLiftBatch} from './pmoCrowdLiftBatch';
import {PmoLiftTransit} from '../render/spatialMeta/pmoLiftTransit';
import {PmoPedestrianRuntime} from '../render/spatialMeta/pmoPedestrianRuntime';
import type {PmoStructure} from '../render/spatialMeta/pmoTransitionStructures';
import type {PmoTransitionAccess} from '../render/spatialMeta/pmoTransitionAccess';
import type {BrushGraph,PmoRouteHelper,PmoTerrainConnector,SpatialPoint} from '../render/spatialMeta/pmoBrushCorridors';

const dockA:SpatialPoint=[0,0,0],dockB:SpatialPoint=[1,1,0];
const helper:PmoRouteHelper={id:'ten-lift',sourceId:'ten-lift',edgeId:'test',kind:'lift',from:dockA,to:dockB,capacity:1};
const structure={sourceId:'ten-lift',edgeId:'test',kind:'lift',from:dockA,to:dockB,segments:[],travelCertified:false} as PmoStructure;
const access={sourceId:'ten-lift',edgeId:'test',kind:'lift',attached:true,geometryContinuous:true,eligibleForPhysicalReview:true,travelCertified:false,issues:[],walkNodeIds:['a','b']} as PmoTransitionAccess;
const terrain:PmoTerrainConnector={project:p=>[...p],verify:()=>true};
const graph:BrushGraph={nodes:[{id:0,point:dockA,sources:['walk']},{id:1,point:dockB,sources:['walk']}],neighbors:[[{to:1,cost:2,kind:'lift',helperId:helper.id}],[{to:0,cost:2,kind:'lift',helperId:helper.id}]],stamps:[{center:dockA,radius:.3,sourceId:'walk'},{center:dockB,radius:.3,sourceId:'walk'}],helpers:{[helper.id]:helper},rejectedHelpers:[],rules:{step:.14,maxWalkLink:.30,maxGrade:.72,maxStepY:.2,paintHeightTolerance:.52}};
function setup(){
 const lift=new PmoLiftTransit([structure],[access],terrain);
 const batch=new PmoCrowdLiftBatch(lift,10,.35,.65);
 const motor=new PmoPedestrianRuntime(graph,terrain,{collisionSpacing:0,liftBatch:batch,onHelperExit:(h,id)=>batch.release(h,id),samplePhysicalHelper:(h,t,a,b,id)=>lift.ride(h,t,a,b,id)});
 return {lift,batch,motor};
}
describe('ten-person synchronized dev lift without a simulated extra cabin',()=>{
 it('takes exactly ten in a single physical car trip and releases once everyone has exited',()=>{
  const {lift,batch,motor}=setup();
  for(let i=0;i<10;i++)expect(motor.add({id:'crowd-'+i,from:dockA,to:dockB,speed:.23+(i%5)*.08}).status).toBe('READY');
  let peak=0,carMismatch=0;
  for(let t=0;t<650;t++){
   lift.tick(.04);batch.tick(.04);motor.tick(.04);
   const passengers=motor.snapshots(),moving=passengers.filter(a=>a.status==='crossing-helper');
   peak=Math.max(peak,moving.length);
   for(const rider of moving){const car=lift.position(helper.sourceId)!;
    if(rider.position.some((v,i)=>Math.abs(v-car[i])>1e-7))carMismatch++;}
   expect(passengers.some(a=>a.status==='blocked')).toBe(false);
   if(passengers.every(a=>a.status==='arrived'))break;
  }
  expect(peak).toBe(10);expect(carMismatch).toBe(0);
  expect(motor.snapshots().every(a=>a.status==='arrived')).toBe(true);
  expect(batch.stats()).toMatchObject({trips:1,groupedRiders:10,peakGroup:10,pending:0});
  expect(lift.position(helper.sourceId)).toEqual(dockB);
 });
 it('still departs with an incomplete queue after the collection window',()=>{
  const {lift,batch,motor}=setup();
  for(let i=0;i<3;i++)expect(motor.add({id:'small-'+i,from:dockA,to:dockB}).status).toBe('READY');
  for(let t=0;t<650;t++){lift.tick(.04);batch.tick(.04);motor.tick(.04);
   if(motor.snapshots().every(a=>a.status==='arrived'))break;}
  expect(batch.stats()).toMatchObject({trips:1,groupedRiders:3,peakGroup:3});
  expect(motor.snapshots().every(a=>a.status==='arrived')).toBe(true);
 });
 it('does not allow more than ten per cohort',()=>{
  const {lift,batch,motor}=setup();
  for(let i=0;i<12;i++)expect(motor.add({id:'overflow-'+i,from:dockA,to:dockB}).status).toBe('READY');
  for(let t=0;t<1000;t++){lift.tick(.04);batch.tick(.04);motor.tick(.04);
   if(motor.snapshots().every(a=>a.status==='arrived'))break;}
  expect(motor.snapshots().every(a=>a.status==='arrived')).toBe(true);
  expect(batch.stats()).toMatchObject({trips:2,groupedRiders:12,peakGroup:10});
 });
});
