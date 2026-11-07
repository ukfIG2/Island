import {describe,it,expect} from 'vitest';
import type {PedestrianSnapshot,PedestrianSpawn} from '../render/spatialMeta/pmoPedestrianRuntime';
import type {SpatialPoint} from '../render/spatialMeta/pmoBrushCorridors';
import {PmoCrowdStressSession} from './pmoCrowdStressSession';
const beaches:SpatialPoint[]=Array.from({length:12},(_,i)=>[i*.2,0,0]);
const sites:SpatialPoint[]=[[4,0,0],[4,0,.3],[4,0,.6],[4,0,.9],[4,0,1.2]];
class CongestedChokeMotor {
  actors=new Map<string,{position:SpatialPoint,origin:SpatialPoint,to:SpatialPoint}>();
  launched:string[]=[];highestOnApproach=0;blockAll=false;
  add(x:PedestrianSpawn){
    if(this.blockAll)return {status:'UNAUTHORIZED_ENDPOINT',reason:'SPAWN_COLLIDES_WITH_ACTOR'};
    if([...this.actors.values()].some(a=>Math.hypot(a.position[0]-x.from[0],a.position[2]-x.from[2])<.08))
      return {status:'UNAUTHORIZED_ENDPOINT',reason:'SPAWN_COLLIDES_WITH_ACTOR'};
    this.launched.push(x.id);this.actors.set(x.id,{position:[...x.from],origin:[...x.from],to:[...x.to]});
    return {status:'READY'};
  }
  tick(dt:number){
    const approach=[...this.actors.values()].filter(a=>Math.hypot(a.position[0]-a.origin[0],a.position[2]-a.origin[2])<1.7);
    this.highestOnApproach=Math.max(this.highestOnApproach,approach.length);
    // This simulates the reported convergence deadlock; above three visitors
    // in the narrow approach none can advance. No fake teleport or arrival.
    if(approach.length>3)return;
    for(const actor of this.actors.values()){
      const dx=actor.to[0]-actor.position[0],dz=actor.to[2]-actor.position[2],d=Math.hypot(dx,dz);
      if(d>.01){const move=Math.min(d,dt*1.5);actor.position=[actor.position[0]+dx/d*move,0,actor.position[2]+dz/d*move];}
    }
  }
  snapshots():PedestrianSnapshot[]{return [...this.actors.entries()].map(([id,a])=>({
    id,position:[...a.position],status:Math.hypot(a.to[0]-a.position[0],a.to[2]-a.position[2])<.02?'arrived':'walking',
    stepIndex:0,routeLength:1,helperId:null,fault:null,
  }));}
  remove(id:string){this.actors.delete(id);}
}
describe('physical crowd v2 queue admission at shared beach stairs',()=>{
  it('keeps common approach within capacity and lets all 100 actually finish under choke pressure',()=>{
    const motor=new CongestedChokeMotor();const session=new PmoCrowdStressSession(motor,beaches,sites);
    for(let n=0;n<30000 && !['blocked','complete'].includes(session.phase);n++)session.tick(.05);
    const result=session.report();
    expect(result.phase,result.error??'').toBe('complete');
    expect(result.launched).toBe(100);expect(result.arrived).toBe(100);
    expect(result.blocked).toBe(0);expect(result.deferredByCapacity).toBeGreaterThan(50);
    expect(motor.highestOnApproach).toBeLessThanOrEqual(3);
    expect(new Set(motor.launched).size).toBe(100);
  });
  it('never bypasses a full physical launch even if the bottleneck has a free token',()=>{
    const motor=new CongestedChokeMotor();motor.blockAll=true;
    const session=new PmoCrowdStressSession(motor,beaches,sites);
    for(let n=0;n<2500&&session.phase!=='blocked';n++)session.tick(.05);
    expect(session.phase).toBe('blocked');expect(session.report().launched).toBe(0);
    expect(session.report().arrived).toBe(0);expect(session.report().error).toContain('BEACH_ADMISSION_STALLED');
    expect(session.director.view('beach-access').firstWaiting).toBe('crowd-001');
  });
});
