import {describe,it,expect} from 'vitest';
import type {SpatialPoint} from '../render/spatialMeta/pmoBrushCorridors';
import type {PedestrianSnapshot,PedestrianSpawn} from '../render/spatialMeta/pmoPedestrianRuntime';
import {PmoFullWaveSession,type Motor,type ServiceQueue} from './pmoFullWaveSession';
import {planFullWaveSeaRoute} from './pmoFullWaveWaterRoute';

/** Same 2.2-second observational motor as the baseline Full Wave contract.
 * Its pedestrians retain their true positions while an animation frame is
 * pending, rather than fabricating intermediate motion. An old inbound clock
 * must NEVER be reused when the passenger receives a fresh return route.
 */
class DelayedMotor implements Motor {
  private actors=new Map<string,{from:SpatialPoint;to:SpatialPoint;seconds:number;status:PedestrianSnapshot['status'];outbound:boolean}>();
  constructor(private readonly holdReturn=false){}
  add(spawn:PedestrianSpawn){
    this.actors.set(spawn.id,{from:[...spawn.from],to:[...spawn.to],seconds:0,status:'walking',outbound:false});
    return {status:'READY'};
  }
  reroute(id:string,goal:SpatialPoint){
    const a=this.actors.get(id);
    if(!a)return {status:'UNAUTHORIZED_ENDPOINT',reason:'MISSING'};
    a.from=[...a.to];a.to=[...goal];a.seconds=0;a.outbound=true;
    a.status=this.holdReturn?'waiting-space':'walking';
    return {status:'READY'};
  }
  tick(dt:number){
    for(const a of this.actors.values())if(a.status==='walking'){
      a.seconds+=dt;
      if(a.seconds>2.2)a.status='arrived';
    }
  }
  snapshots():PedestrianSnapshot[]{
    return [...this.actors].map(([id,a])=>({id,
      position:[...(a.status==='arrived'?a.to:a.from)],status:a.status,
      stepIndex:0,routeLength:1,helperId:null,fault:null}));
  }
  remove(id:string){this.actors.delete(id);}
}
const sites:ServiceQueue[]=Array.from({length:4},(_,j)=>({
  id:'site-'+j,approach:[j*3,0,0],
  slots:[[j*3,0,.4],[j*3,0,.7],[j*3,0,1]],
}));
const beach:SpatialPoint[]=[[1.6,-2.2,4.6],[1.9,-2.2,4.7],[1.3,-2.2,4.5]];
const sea=()=>planFullWaveSeaRoute([1.6739,-2.2456,4.5734],[12,-2.35,3],[-6,-2.35,-12],true);
function run(motor:DelayedMotor){
  const session=new PmoFullWaveSession(motor,sites,beach,sea(),12);
  for(let frame=0;frame<25000&&session.phase!=='complete'&&session.phase!=='blocked';frame++)session.tick(.05);
  return session;
}
describe('Full Wave liveness window is per accepted physical route',()=>{
  it('does not fail walking passenger 04 after its long inbound/service dwell',()=>{
    const session=run(new DelayedMotor());
    expect(session.phase,session.error??'').toBe('complete');
    expect(session.error).toBeNull();
    expect(session.report().boarded).toBe(12);
    expect(session.passengers.every(p=>p.phase==='boarded')).toBe(true);
  });
  it('still fails a genuinely motionless returning passenger after 20 seconds',()=>{
    const session=run(new DelayedMotor(true));
    expect(session.phase).toBe('blocked');
    expect(session.error).toContain('FULL_WAVE_STALLED:full-wave-passenger-01:waiting-space');
    expect(session.report().boarded).toBe(0);
    expect(session.boat.phase).toBe('docked');
  });
});
