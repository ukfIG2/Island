import {describe,it,expect} from 'vitest';
import {PmoPedestrianRuntime} from './pmoPedestrianRuntime';
import {certifyDirectedWalk} from './pmoWalkKinematics';
import type {BrushGraph,PmoTerrainConnector,SpatialPoint} from './pmoBrushCorridors';
const p=(x:number):SpatialPoint=>[x,0,0];
const graph:BrushGraph={nodes:[{id:0,point:p(0),sources:['test']},{id:1,point:p(.18),sources:['test']}],
 neighbors:[[{to:1,cost:.18,kind:'walk'}],[{to:0,cost:.18,kind:'walk'}]],
 stamps:[{center:p(.09),radius:.5,sourceId:'test'}],helpers:{},rejectedHelpers:[],
 rules:{maxGrade:.72,maxStepY:.2,step:.14,maxWalkLink:.215,paintHeightTolerance:.52}};
const onCertifiedGrid=(n:number)=>Math.abs(n/.006-Math.round(n/.006))<0.0001;
const narrow: PmoTerrainConnector={project:q=>[...q],verify:(a,b)=>
 Math.abs(a[0]-b[0])>=.05||(onCertifiedGrid(a[0])&&onCertifiedGrid(b[0]))};

describe('DEV Full Wave: physically certified trace with variable render frames',()=>{
 it('replays exactly the audited 6mm points rather than recertifying frame remainders',()=>{
   const points:SpatialPoint[]=[];
   expect(certifyDirectedWalk(p(0),p(.18),graph,narrow,.006,points)).toBeNull();
   expect(points.length).toBeGreaterThan(20);
   for(let i=1;i<points.length;i++){
     expect(Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1],points[i][2]-points[i-1][2])).toBeLessThanOrEqual(.00601);
     expect(narrow.verify(points[i-1],points[i])).toBe(true);
     expect(narrow.verify(points[i],points[i-1])).toBe(true);
   }
   const legacy=new PmoPedestrianRuntime(graph,narrow,{collisionSpacing:0});
   expect(legacy.add({id:'old',from:p(0),to:p(.18),speed:.4}).status).toBe('READY');
   for(let i=0;i<100;i++)legacy.tick(.05);
   expect(legacy.snapshots()[0].status).toBe('blocked');
   const motor=new PmoPedestrianRuntime(graph,narrow,{collisionSpacing:0,followCertifiedWalkTrace:true});
   expect(motor.add({id:'guest',from:p(0),to:p(.18),speed:.4}).status).toBe('READY');
   for(const dt of [.05,.04,.014,.032,.05,.05,.03,.017,...Array(80).fill(.05)])motor.tick(dt);
   expect(motor.snapshots()[0].status).toBe('arrived');
   expect(motor.snapshots()[0].position[0]).toBeCloseTo(.18,6);
   expect(motor.snapshots()[0].fault).toBeNull();
 });
 it('rejects an existing discontinuity during V1.4.2 physical route preflight',()=>{
   const cliff:PmoTerrainConnector={project:q=>[q[0],q[0]>.05?.16:0,q[2]],verify:()=>true};
   const motor=new PmoPedestrianRuntime(graph,cliff,{collisionSpacing:0,followCertifiedWalkTrace:true});
   const admission=motor.add({id:'cliff',from:p(0),to:p(.18),speed:.4});
   expect(admission.status).toBe('UNREACHABLE');
   expect(motor.snapshots()).toHaveLength(0); // do not spawn an actor on a known invalid route
 });
 it('cannot pass a discontinuity introduced after route admission',()=>{
   let cliffAppeared=false;
   const terrain:PmoTerrainConnector={
     project:q=>[q[0],cliffAppeared&&q[0]>.05?.16:0,q[2]],verify:()=>true,
   };
   const motor=new PmoPedestrianRuntime(graph,terrain,{collisionSpacing:0,followCertifiedWalkTrace:true});
   expect(motor.add({id:'cliff-after-admission',from:p(0),to:p(.18),speed:.4}).status).toBe('READY');
   cliffAppeared=true; // simulate a discontinuity after the plan was accepted
   for(let i=0;i<80;i++)motor.tick(.05);
   const result=motor.snapshots()[0];
   expect(result.status).toBe('blocked');
   expect(result.position[0]).toBeLessThanOrEqual(.050001);
   expect(result.fault).toContain('WALK_TRACE_LOCAL_GRADE_OR_VERIFY_FAILED');
   expect(motor.diagnostic('cliff-after-admission')).toContain('stepTo');
 });
 it('invalidates the trace when rerouting and never teleports to a new destination',()=>{
   const connector:PmoTerrainConnector={project:q=>[...q],verify:()=>true};
   const motor=new PmoPedestrianRuntime(graph,connector,{collisionSpacing:0,followCertifiedWalkTrace:true});
   expect(motor.add({id:'turn',from:p(0),to:p(.18),speed:.4}).status).toBe('READY');
   motor.tick(.05);motor.tick(.05);
   const prior=motor.snapshots()[0].position[0];
   expect(prior).toBeGreaterThan(0);
   expect(motor.reroute('turn',p(0)).status).toBe('READY');
   expect(motor.snapshots()[0].position[0]).toBeCloseTo(prior,6);
   for(let i=0;i<100;i++)motor.tick(.05);
   expect(motor.snapshots()[0].status).toBe('arrived');
   expect(motor.snapshots()[0].position[0]).toBeCloseTo(0,6);
 });
 it('accumulates sub-6mm motion allowance across 60 FPS frames',()=>{
   const connector:PmoTerrainConnector={project:q=>[...q],verify:()=>true};
   const motor=new PmoPedestrianRuntime(graph,connector,{collisionSpacing:0,followCertifiedWalkTrace:true});
   expect(motor.add({id:'high-fps',from:p(0),to:p(.18),speed:.24}).status).toBe('READY');
   for(let i=0;i<160;i++)motor.tick(1/60); // 4mm per frame; a naive fixed-step motor would never move
   expect(motor.snapshots()[0].status).toBe('arrived');
   expect(motor.snapshots()[0].position[0]).toBeCloseTo(.18,6);
 });

});
