import {describe,it,expect} from 'vitest';
import type {SpatialPoint} from '../render/spatialMeta/pmoBrushCorridors';
import type {PedestrianSpawn,PedestrianSnapshot} from '../render/spatialMeta/pmoPedestrianRuntime';
import {PmoCrowdStressSession} from './pmoCrowdStressSession';

/** Real geometric separation rule, including an initially backwards bend.
 * Unlike the old linear no-collision stub, allowing a second actor into this
 * 0.16m U-turn can put both actors inside each other's collision radii.
 * The first actor must clear the shared entry BEFORE the second is released.
 */
class RealSpacingUTurnMotor {
  readonly actors=new Map<string,{p:SpatialPoint,step:number,status:PedestrianSnapshot['status'],goal:SpatialPoint}>();
  readonly launched:string[]=[];
  peakInThroat=0;
  add(s:PedestrianSpawn){
    if([...this.actors.values()].some(a=>Math.hypot(a.p[0]-s.from[0],a.p[2]-s.from[2])<0.085))
      return {status:'UNAUTHORIZED_ENDPOINT',reason:'SPAWN_COLLIDES_WITH_ACTOR'};
    this.actors.set(s.id,{p:[...s.from],step:0,status:'walking',goal:[...s.to]});
    this.launched.push(s.id);
    return {status:'READY',steps:[{kind:'walk',from:s.from,to:s.to}]};
  }
  tick(dt:number){
    const inside=[...this.actors.values()].filter(a=>a.status!=='arrived'&&a.p[0]<1.7);
    this.peakInThroat=Math.max(this.peakInThroat,inside.length);
    for(const a of this.actors.values()){
      const targets:SpatialPoint[]=[[0.16,0,0],[0.04,0,0],[2.1,0,0],a.goal];
      const goal=targets[a.step];if(!goal){a.status='arrived';continue;}
      const dx=goal[0]-a.p[0],dz=goal[2]-a.p[2],distance=Math.hypot(dx,dz);
      if(distance<.005){a.step++;a.status=a.step===4?'arrived':'walking';continue;}
      const span=Math.min(dt*1.25,distance),next:SpatialPoint=[a.p[0]+span*dx/distance,0,a.p[2]+span*dz/distance];
      const collision=[...this.actors.values()].some(o=>o!==a&&o.status!=='arrived'&&Math.hypot(o.p[0]-next[0],o.p[2]-next[2])<.085);
      if(collision)a.status='waiting-space';
      else {a.p=next;a.status='walking';}
    }
  }
  snapshots():PedestrianSnapshot[]{return [...this.actors.entries()].map(([id,a])=>({
    id,position:[...a.p],status:a.status,stepIndex:a.step,routeLength:4,helperId:null,fault:null,
  }));}
  remove(id:string){this.actors.delete(id);}
}
const beaches:SpatialPoint[]=Array.from({length:12},(_,i)=>[i*.2,0,0]);
const targets:SpatialPoint[]=[[4,0,0],[4,0,.35],[4,0,.7],[4,0,1.05],[4,0,1.4]];
describe('Crowd 100 exclusive physically-cleared beach throat',()=>{
  it('does not admit the follower into the reversing entry path and completes 100/100 with collisions enabled',()=>{
    const motor=new RealSpacingUTurnMotor(),s=new PmoCrowdStressSession(motor,beaches,targets);
    for(let i=0;i<100;i++)s.tick(.05);
    expect(s.report().launched).toBe(3);
    for(let i=0;i<20000&&s.phase==='running';i++)s.tick(.05);
    expect(s.report().phase,s.report().error??'').toBe('complete');
    expect(s.report().arrived).toBe(100);
    expect(s.report().blocked).toBe(0);
    expect(motor.peakInThroat).toBe(1);
    expect(new Set(motor.launched).size).toBe(100);
  });
  it('does not confuse nominal multi-slot capacity with physical shared-throat clearance',()=>{
    const motor=new RealSpacingUTurnMotor(),s=new PmoCrowdStressSession(motor,beaches,targets,100,{gateCapacity:3});
    for(let i=0;i<25;i++)s.tick(.05);
    expect(s.report().launched).toBe(1);
    expect(s.report().pendingBeach).toBe(99);
    expect(s.report().blocked).toBe(0);
  });
  it('counts actual admission probes rather than every render frame',()=>{
    const motor=new RealSpacingUTurnMotor(),s=new PmoCrowdStressSession(motor,beaches,targets);
    for(let i=0;i<160;i++)s.tick(.05);
    expect(s.report().deferredByCapacity).toBeGreaterThan(0);
    expect(s.report().deferredByCapacity).toBeLessThanOrEqual(35);
  });
});
