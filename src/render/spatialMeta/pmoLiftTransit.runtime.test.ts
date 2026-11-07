import {describe,it,expect} from 'vitest';
import {PmoLiftTransit} from './pmoLiftTransit';
import {PmoPedestrianRuntime} from './pmoPedestrianRuntime';
import type {PmoStructure} from './pmoTransitionStructures';
import type {PmoTransitionAccess} from './pmoTransitionAccess';
import type {BrushGraph,PmoRouteHelper,PmoTerrainConnector} from './pmoBrushCorridors';
const from:[number,number,number]=[0,0,0];
const to:[number,number,number]=[1,1,0];
const structure={sourceId:'lift-test',edgeId:'edge-test',kind:'lift',from,to,segments:[],travelCertified:false} as const satisfies PmoStructure;
const access={sourceId:'lift-test',edgeId:'edge-test',kind:'lift',attached:true,geometryContinuous:true,eligibleForPhysicalReview:true,travelCertified:false,issues:[],walkNodeIds:['a','b']} as PmoTransitionAccess;
const terrain:PmoTerrainConnector={project:p=>p,verify:()=>true};
const helper:PmoRouteHelper={id:'lift-test',sourceId:'lift-test',edgeId:'edge-test',kind:'lift',from,to,capacity:1};
const graph:BrushGraph={nodes:[{id:0,point:from,sources:['walk']},{id:1,point:to,sources:['walk']}],
 neighbors:[[{to:1,cost:2,kind:'lift',helperId:helper.id}],[{to:0,cost:2,kind:'lift',helperId:helper.id}]],
 stamps:[{center:from,radius:.3,sourceId:'walk'},{center:to,radius:.3,sourceId:'walk'}],helpers:{[helper.id]:helper},rejectedHelpers:[],
 rules:{step:.14,maxWalkLink:.30,maxGrade:.72,maxStepY:.2,paintHeightTolerance:.52}};
describe('PMO lift transit: actual rider + platform',()=>{
 it('rejects an uncertified boarding portal',()=>{
  expect(new PmoLiftTransit([structure],[{...access,attached:false}],terrain).has('lift-test')).toBe(false);
 });
 it('carries a guest from dock A to dock B on the SAME rendered cabin',()=>{
  const lifts=new PmoLiftTransit([structure],[access],terrain);
  const walk=new PmoPedestrianRuntime(graph,terrain,{collisionSpacing:.01,
   canEnterHelper:(h,start,id)=>lifts.reserve(h,start,id),
   onHelperExit:(h,id)=>lifts.release(h,id),
   samplePhysicalHelper:(h,t,start,goal,id)=>lifts.ride(h,t,start,goal,id)});
  expect(walk.add({id:'guest-1',from,to,speed:.5}).status).toBe('READY');
  let carried=0;
  for(let i=0;i<200;i++){
   lifts.tick(.04);walk.tick(.04);
   const guest=walk.snapshots()[0];
   if(guest.status==='crossing-helper'){
    carried++;const cabin=lifts.position('lift-test')!;
    expect(guest.position.every((n,k)=>Math.abs(n-cabin[k])<1e-6)).toBe(true);
   }
   expect(guest.status).not.toBe('blocked');
   if(guest.status==='arrived')break;
  }
  expect(carried).toBeGreaterThan(1);
  expect(walk.snapshots()[0].status).toBe('arrived');
  expect(lifts.position('lift-test')).toEqual(to);
 });
 it('moves empty car back before admitting the next opposite-side request',()=>{
  const lifts=new PmoLiftTransit([structure],[access],terrain);
  expect(lifts.reserve(helper,from,'first')).toBe(true);
  expect(lifts.ride(helper,1,from,to,'first')).toEqual(to);
  lifts.release(helper,'first');
  expect(lifts.reserve(helper,from,'second')).toBe(false);
  for(let i=0;i<120;i++)lifts.tick(.04);
  expect(lifts.reserve(helper,from,'second')).toBe(true);
 });
});
