import {describe,it,expect} from 'vitest';
import type {PedestrianSnapshot,PedestrianSpawn} from '../render/spatialMeta/pmoPedestrianRuntime';
import type {SpatialPoint} from '../render/spatialMeta/pmoBrushCorridors';
import {CROWD_STRESS_COUNT,PmoCrowdStressSession} from './pmoCrowdStressSession';
class StubMotor {
  actors=new Map<string,{position:SpatialPoint,goal:SpatialPoint,age:number}>();
  seen:string[]=[]; removed:string[]=[]; reject=false;
  add(x:PedestrianSpawn){
    if(this.reject)return {status:'UNAUTHORIZED_ENDPOINT',reason:'TEST_UNREACHABLE'};
    if([...this.actors.values()].some(a=>Math.hypot(a.position[0]-x.from[0],a.position[2]-x.from[2])<.08))
      return {status:'UNAUTHORIZED_ENDPOINT',reason:'SPAWN_COLLIDES_WITH_ACTOR'};
    this.actors.set(x.id,{position:[...x.from],goal:[...x.to],age:0});this.seen.push(x.id);return {status:'READY'};
  }
  tick(dt:number){for(const a of this.actors.values()){
    a.age+=dt;
    const dx=a.goal[0]-a.position[0];const dz=a.goal[2]-a.position[2];const d=Math.hypot(dx,dz);
    if(d>.01){const step=Math.min(dt*1.5,d);a.position=[a.position[0]+dx/d*step,0,a.position[2]+dz/d*step];}
  }}
  snapshots():PedestrianSnapshot[]{return [...this.actors].map(([id,a])=>({id,position:[...a.position],status:Math.hypot(a.goal[0]-a.position[0],a.goal[2]-a.position[2])<.02?'arrived':'walking',stepIndex:0,routeLength:1,helperId:null,fault:null}));}
  remove(id:string){this.removed.push(id);this.actors.delete(id);}
}
const beaches:SpatialPoint[]=Array.from({length:12},(_,i)=>[i*.2,0,0]);
const targets:SpatialPoint[]=[[4,0,0],[4,0,.3],[4,0,.6],[4,0,.9],[4,0,1.2]];
describe('physical 100-passenger load probe',()=>{
  it('dispatches exactly 100 distinct motor actors, not 100 decorative tweens',()=>{
    const motor=new StubMotor();const s=new PmoCrowdStressSession(motor,beaches,targets);
    for(let i=0;i<25000&&s.phase!=='complete'&&s.phase!=='blocked';i++)s.tick(.05);
    expect(s.report().phase,s.report().error??'').toBe('complete');
    expect(s.report().total).toBe(CROWD_STRESS_COUNT);
    expect(s.report().launched).toBe(100);expect(s.report().arrived).toBe(100);
    expect(s.report().blocked).toBe(0);
    expect(motor.seen).toHaveLength(100);expect(new Set(motor.seen).size).toBe(100);
    expect(new Set(motor.removed)).toEqual(new Set(motor.seen));
    expect(s.report().peakActive).toBeGreaterThan(1);
  });
  it('never converts an unroutable guest into a successful arrival',()=>{
    const motor=new StubMotor();motor.reject=true;
    const s=new PmoCrowdStressSession(motor,beaches,targets);
    for(let i=0;i<25000&&s.phase!=='blocked';i++)s.tick(.05);
    expect(s.report().phase).toBe('blocked');expect(s.report().arrived).toBe(0);
    expect(s.report().blocked).toBe(100);expect(s.report().error).toContain('CROWD_STRESS_BLOCKED');
  });
  it('rejects setup without enough certified launch and destination endpoints',()=>{
    expect(()=>new PmoCrowdStressSession(new StubMotor(),[],targets)).toThrow('CERTIFIED_ENDPOINTS');
    expect(()=>new PmoCrowdStressSession(new StubMotor(),beaches,[targets[0]])).toThrow('CERTIFIED_ENDPOINTS');
  });
});
