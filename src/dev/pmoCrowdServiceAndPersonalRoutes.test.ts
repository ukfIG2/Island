import {describe,it,expect} from 'vitest';
import {CrowdServiceSlots,chooseCrowdResponse} from './pmoCrowdServicePolicy';
import {PmoCrowdStressSession} from './pmoCrowdStressSession';
import type {PedestrianSpawn,PedestrianSnapshot} from '../render/spatialMeta/pmoPedestrianRuntime';
import type {SpatialPoint} from '../render/spatialMeta/pmoBrushCorridors';

const d=(a:readonly number[],b:readonly number[])=>Math.hypot(a[0]-b[0],a[2]-b[2]);
class StubMotor {
 private readonly actors=new Map<string,{at:SpatialPoint;to:SpatialPoint}>();
 add(x:PedestrianSpawn){if([...this.actors.values()].some(a=>d(a.at,x.from)<.085))return {status:'UNAUTHORIZED_ENDPOINT',reason:'SPAWN_COLLIDES_WITH_ACTOR'};
  this.actors.set(x.id,{at:[...x.from],to:[...x.to]});return {status:'READY'};}
 tick(dt:number){for(const actor of this.actors.values()){
  const dx=actor.to[0]-actor.at[0],dz=actor.to[2]-actor.at[2];const len=Math.hypot(dx,dz);
  const delta=Math.min(len,dt*2.5);if(len>1e-8)actor.at=[actor.at[0]+dx/len*delta,0,actor.at[2]+dz/len*delta];
 }}
 snapshots():PedestrianSnapshot[]{return [...this.actors.entries()].map(([id,a])=>({id,position:[...a.at],
  status:d(a.at,a.to)<1e-4?'arrived':'walking',stepIndex:0,routeLength:1,helperId:null,fault:null}));}
 remove(id:string){this.actors.delete(id);}
 previewReroute(id:string,to:SpatialPoint){return this.actors.has(id)?{status:'READY',distance:d(this.actors.get(id)!.at,to)}:{status:'UNAUTHORIZED_ENDPOINT'};}
 reroute(id:string,to:SpatialPoint){const actor=this.actors.get(id);if(!actor)return {status:'UNAUTHORIZED_ENDPOINT'};actor.to=[...to];return {status:'READY'};}
}
const starts:SpatialPoint[]=Array.from({length:100},(_,i)=>[(i%10)*.44,0,Math.floor(i/10)*.44]);
const targets:SpatialPoint[]=Array.from({length:5},(_,i)=>[7,0,i*1.8]);
describe('crowd v4 physical service staging and route individuality',()=>{
 it('fast shared service slots honor FIFO and process parallel groups',()=>{
  const s=new CrowdServiceSlots(3,.7);
  for(let i=0;i<10;i++)s.enqueue(0,'guest'+i);
  expect(s.pending()).toBe(10);expect(s.active()).toBe(0);
  expect(s.tick(.35)).toEqual([]);expect(s.active()).toBe(3);expect(s.pending()).toBe(7);
  expect(s.tick(.35)).toEqual(['guest0','guest1','guest2']);
  expect(s.tick(.7)).toEqual(['guest3','guest4','guest5']);
  expect(s.tick(.7)).toEqual(['guest6','guest7','guest8']);
  expect(s.tick(.7)).toEqual(['guest9']);
  expect(s.pending()).toBe(0);expect(s.active()).toBe(0);
 });
 it('long queues increase willingness to switch or wander without making low queues unstable',()=>{
  const ids=Array.from({length:100},(_,i)=>'crowd-'+i);
  expect(ids.every(id=>chooseCrowdResponse(id,2,3,10)==='wait')).toBe(true);
  const high=ids.map(id=>chooseCrowdResponse(id,45,3,10));
  expect(high.filter(x=>x!=='wait').length).toBeGreaterThan(40);
  expect(high).toContain('wander');expect(high).toContain('switch');
 });
 it('100 personalized via-journeys reach fast services with the SAME IDs and no false completions',()=>{
  const personal=starts.map((p,i)=>({target:[7+.3+((i%4)*.12),0,(i%5)*1.8+.24] as SpatialPoint,
    via:i%2===0?[p[0]+.55,0,p[2]+.5] as SpatialPoint:null,shift:.25}));
  const s=new PmoCrowdStressSession(new StubMotor(),starts,targets,100,
    {startMode:'distributed',servicesEnabled:true,personalRoutes:personal});
  for(let i=0;i<1600&&s.phase!=='blocked'&&s.phase!=='complete';i++)s.tick(.05);
  expect(s.report().phase,s.report().error??'').toBe('complete');
  expect(s.report().arrived).toBe(100);expect(s.report().served).toBe(100);
  expect(s.report().blocked).toBe(0);expect(s.report().personalizedEndpoints).toBe(100);
  expect(s.report().viaRoutes).toBe(50);
  expect(s.report().serviceQueued).toBe(0);expect(s.report().serviceActive).toBe(0);
 });
});
