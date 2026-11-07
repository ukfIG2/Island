import {describe,it,expect} from 'vitest';
import {CrowdRouteVariation} from './pmoCrowdRouteVariation';
import {CrowdServiceSlots} from './pmoCrowdServicePolicy';
import {buildCrowdSpatialPlan,ferrySite} from './pmoCrowdSpatialTargets';
import {compilePmoBrushCorridors,type PmoTerrainConnector,type RouteResult,type SpatialPoint} from '../render/spatialMeta/pmoBrushCorridors';
const point=(x:number,z=0):SpatialPoint=>[x,0,z];
const terrain:PmoTerrainConnector={project:p=>[...p],verify:()=>true};
const d=(a:Readonly<SpatialPoint>,b:Readonly<SpatialPoint>)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
describe('RRH crowd PMO area/queue V1',()=>{
 it('turns a shared skeleton into physically certified smooth individual paths without zigzagging',()=>{
   const graph=compilePmoBrushCorridors([{center:point(1.8),radius:2.35,sourceId:'floor'}],terrain,[],{step:.14});
   const waypoints=Array.from({length:26},(_,i)=>point(i*.14));
   const steps=waypoints.slice(1).map((to,i)=>({kind:'walk' as const,from:waypoints[i],to,brushSourceIds:['floor']}));
   const route:RouteResult={status:'READY',points:waypoints,steps,distance:3.5,brushSourceIds:['floor']};
   const varies=new CrowdRouteVariation(graph,terrain,()=>true,.38,.5);
   const a=varies.apply('guest-001',route),b=varies.apply('guest-002',route);
   expect(a.status).toBe('READY');expect(b.status).toBe('READY');
   if(a.status!=='READY'||b.status!=='READY')return;
   expect(varies.stats.accepted).toBeGreaterThan(2);
   expect(a.steps[0].from).toEqual(route.steps[0].from);
   expect(a.steps.at(-1)?.to).toEqual(route.steps.at(-1)?.to);
   expect(a.steps.some((s,i)=>d(s.to,b.steps[i].to)>.15)).toBe(true);
   for(let i=1;i<a.steps.length;i++){
     expect(a.steps[i].from).toEqual(a.steps[i-1].to);
     const v=a.steps[i-1],w=a.steps[i];
     const a1=Math.atan2(v.to[2]-v.from[2],v.to[0]-v.from[0]);
     const a2=Math.atan2(w.to[2]-w.from[2],w.to[0]-w.from[0]);
     expect(Math.abs(Math.atan2(Math.sin(a2-a1),Math.cos(a2-a1)))).toBeLessThan(.65);
   }
 });
 it('retains queue identity while a walker is away and serves earliest physically present guest',()=>{
   const s=new CrowdServiceSlots(1,.7);
   s.enqueue(0,'first');s.enqueue(0,'second');
   expect(s.setReady('first',false)).toBe(true);
   expect(s.tick(.7)).toEqual(['second']);
   expect(s.status('first')).toBe('queued');
   expect(s.setReady('first',true)).toBe(true);
   expect(s.tick(.7)).toEqual(['first']);
 });
 it('spreads ferry endpoints across the accessible compiled PMO area without inventing new links',()=>{
   const marks=[{center:point(0),radius:1.4,sourceId:'floor'},
     {center:point(2.1),radius:1.35,sourceId:'floor'},
     {center:point(4.2),radius:1.35,sourceId:'floor'},
     {center:point(6.3),radius:1.35,sourceId:'floor'}];
   const graph=compilePmoBrushCorridors(marks,terrain,[],{step:.14});
   const services=[point(2.1),point(4.2),point(6.3)];
   const report=buildCrowdSpatialPlan(graph,terrain,point(0),services,30,()=>true);
   expect(report.servicePositions).toHaveLength(30);
   expect(report.beachPositions).toHaveLength(30);
   expect(report.separatedServices).toBeGreaterThan(20);
   expect(report.separatedBeach).toBeGreaterThan(15);
   expect(report.wanders.length).toBeGreaterThan(0);
   for(let i=0;i<30;i++){
     const p=report.servicePositions[i],base=services[ferrySite(i,3)];
     expect(d(p,base)).toBeLessThan(1.7);
     expect(graph.stamps.some(s=>d(p,s.center)<s.radius+.001)).toBe(true);
   }
 });
});
