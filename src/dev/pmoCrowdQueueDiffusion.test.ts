import {describe,it,expect} from 'vitest';
import {queueDiffusion,rankedQueueCandidates,localQueueWanderPools} from './pmoCrowdQueueDiffusion';
import {CrowdServiceSlots} from './pmoCrowdServicePolicy';
import type {BrushGraph,SpatialPoint} from '../render/spatialMeta/pmoBrushCorridors';
const point=(x:number,z=0):SpatialPoint=>[x,0,z];
const d=(a:SpatialPoint,b:SpatialPoint)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
describe('PMO ranked local crowd diffusion',()=>{
 it('uses actual position ahead in FIFO, preserving ticket during physical absence',()=>{
   const q=new CrowdServiceSlots(1,2);q.enqueue(1,'a');q.enqueue(1,'b');q.enqueue(1,'c');
   expect(q.ahead(1,'a')).toBe(0);expect(q.ahead(1,'c')).toBe(2);
   q.setReady('b',false);q.tick(.05);
   expect(q.ahead(1,'b')).toBe(1);
   expect(q.ahead(1,'c')).toBe(2);
   expect(q.status('b')).toBe('queued');
 });
 it('gives farther-ranked guests larger roaming radius, faster pace and lower wandering frequency',()=>{
   for(let i=1;i<100;i++){
     const a=queueDiffusion(i,'ped-001'),b=queueDiffusion(i+1,'ped-001');
     expect(b.radius).toBeGreaterThanOrEqual(a.radius);
     expect(b.speed).toBeGreaterThanOrEqual(a.speed);
     expect(b.cadenceSeconds).toBeGreaterThanOrEqual(a.cadenceSeconds);
   }
 });
 it('cannot select distant island-wide marks or leave the certified walk-only component',()=>{
   const pts=Array.from({length:20},(_,i)=>point(i*.14));
   const graph:BrushGraph={nodes:pts.map((p,i)=>({id:i,point:p,sources:['paint']})),
     neighbors:pts.map((_,i)=>[
       ...(i>0?[{to:i-1,cost:.14,kind:'walk' as const}]:[]),
       ...(i<19?[{to:i+1,cost:.14,kind:i===9?'bridge' as const:'walk' as const}]:[])]),
     stamps:[{center:point(1.4),radius:2,sourceId:'paint'}],helpers:{},rejectedHelpers:[],
     rules:{step:.14,maxGrade:.7,maxStepY:.2,maxWalkLink:.3,paintHeightTolerance:.52}};
   // Forward bridge edge divides the walking-only component.
   const pool=localQueueWanderPools(graph,[point(0)],1.9)[0];
   expect(pool.length).toBeGreaterThan(0);
   expect(pool.every(p=>p[0]<1.40)).toBe(true);
   const profile=queueDiffusion(20,'ped-001');
   const candidates=rankedQueueCandidates('ped-001',0,point(0),point(0),[...pool,point(10)],profile);
   expect(candidates.every(p=>d(p,point(0))<=profile.radius)).toBe(true);
 });
});
