import {describe,it,expect} from 'vitest';
import type {SpatialPoint} from '../render/spatialMeta/pmoBrushCorridors';
import type {PedestrianSpawn,PedestrianSnapshot} from '../render/spatialMeta/pmoPedestrianRuntime';
import {PmoCrowdStressSession} from './pmoCrowdStressSession';

// A deterministic admission/census witness, NOT proof of terrain or the
// main 90-route matrix; the R3F layer uses the canonical live PMO motor.
class CensusMotor {
  private actors=new Map<string,{p:SpatialPoint,to:SpatialPoint}>();
  readonly seen=new Set<string>();
  add(s:PedestrianSpawn){
    if([...this.actors.values()].some(a=>Math.hypot(a.p[0]-s.from[0],a.p[2]-s.from[2])<0.085))
      return {status:'UNAUTHORIZED_ENDPOINT',reason:'SPAWN_COLLIDES_WITH_ACTOR'};
    this.actors.set(s.id,{p:[...s.from],to:[...s.to]});this.seen.add(s.id);
    return {status:'READY'};
  }
  tick(dt:number){for(const a of this.actors.values()){
    const dx=a.to[0]-a.p[0],dz=a.to[2]-a.p[2],len=Math.hypot(dx,dz);
    if(len>0.00001){const distance=Math.min(len,dt*8);a.p=[a.p[0]+dx/len*distance,0,a.p[2]+dz/len*distance];}
  }}
  snapshots():PedestrianSnapshot[]{return [...this.actors.entries()].map(([id,a])=>({
    id,position:[...a.p],status:Math.hypot(a.to[0]-a.p[0],a.to[2]-a.p[2])<0.001?'arrived':'walking',
    stepIndex:0,routeLength:1,helperId:null,fault:null,
  }));}
  remove(id:string){this.actors.delete(id);}
}
const origins:SpatialPoint[]=Array.from({length:100},(_,i)=>[(i%10)*0.45,0,Math.floor(i/10)*0.45]);
const targets:SpatialPoint[]=[[7,0,0],[7,0,1],[7,0,2],[7,0,3],[7,0,4]];
describe('100 actual simultaneous PMO motor actors, separate from beach throughput',()=>{
  it('places 100 physically distinct pedestrians within four frames and counts concurrent actors',()=>{
    const motor=new CensusMotor(),s=new PmoCrowdStressSession(motor,origins,targets,100,{startMode:'distributed'});
    for(let i=0;i<4;i++)s.tick(0.05);
    expect(s.report().mode).toBe('distributed');
    expect(s.report().launched).toBe(100);
    expect(s.report().active).toBe(100);
    expect(s.report().peakActive).toBe(100);
    expect(motor.seen.size).toBe(100);
    expect(s.report().bottleneckQueue).toBe(0);
    for(let i=0;i<500 && s.phase==='running';i++)s.tick(0.05);
    expect(s.report().phase,s.report().error??'').toBe('complete');
    expect(s.report().arrived).toBe(100);
    expect(s.report().blocked).toBe(0);
  });
  it('rejects an overlapping origin without silently counting arrival',()=>{
    const points=origins.map(p=>[...p] as SpatialPoint);points[1]=[...points[0]];
    const s=new PmoCrowdStressSession(new CensusMotor(),points,targets,100,{startMode:'distributed'});
    for(let i=0;i<2000&&s.phase!=='blocked'&&s.phase!=='complete';i++)s.tick(0.05);
    expect(s.report().phase).toBe('blocked');
    expect(s.report().blocked).toBeGreaterThan(0);
    expect(s.report().arrived).toBeLessThan(100);
  });
  it('rejects a pseudo-crowd with fewer than 100 physically distinct origins',()=>{
    expect(()=>new PmoCrowdStressSession(new CensusMotor(),origins.slice(0,99),targets,100,{startMode:'distributed'}))
      .toThrow('CERTIFIED_ENDPOINTS');
  });
});
