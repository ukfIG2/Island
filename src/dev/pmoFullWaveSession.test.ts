import {describe,it,expect} from 'vitest';
import type {PedestrianSnapshot,PedestrianSpawn} from '../render/spatialMeta/pmoPedestrianRuntime';
import type {SpatialPoint} from '../render/spatialMeta/pmoBrushCorridors';
import {PmoFullWaveSession,type Motor,type ServiceQueue} from './pmoFullWaveSession';
import {planFullWaveSeaRoute,RRH_SAFE_WATER_RADIUS,SeaBoatMotion} from './pmoFullWaveWaterRoute';
const shore:SpatialPoint=[1.6739,-2.2456,4.5734];
const plan=()=>planFullWaveSeaRoute(shore,[12,-2.35,3],[-6,-2.35,-12],true);
class TestMotor implements Motor {
  readonly arrivals:string[]=[];readonly removes:string[]=[];
  rejectReturn=false;
  private actors=new Map<string,{from:SpatialPoint;goal:SpatialPoint;seconds:number;status:PedestrianSnapshot['status']}>();
  add(spawn:PedestrianSpawn){
    if(this.actors.has(spawn.id))return {status:'UNAUTHORIZED_ENDPOINT',reason:'DUPLICATE'};
    this.actors.set(spawn.id,{from:[...spawn.from],goal:[...spawn.to],seconds:0,status:'walking'});
    this.arrivals.push(spawn.id);return {status:'READY'};
  }
  reroute(id:string,goal:SpatialPoint){
    if(this.rejectReturn)return {status:'UNAUTHORIZED_ENDPOINT',reason:'TEST_UNREACHABLE'};
    const a=this.actors.get(id);if(!a)return {status:'UNAUTHORIZED_ENDPOINT',reason:'MISSING'};
    a.from=[...a.goal];a.goal=[...goal];a.seconds=0;a.status='walking';return {status:'READY'};
  }
  tick(dt:number){for(const a of this.actors.values())if(a.status==='walking'){
    a.seconds+=dt;if(a.seconds>2.2)a.status='arrived';
  }}
  snapshots():PedestrianSnapshot[]{return [...this.actors.entries()].map(([id,a])=>({id,position:(a.status==='arrived'?[...a.goal]:[...a.from]) as SpatialPoint,
    status:a.status,stepIndex:0,routeLength:1,helperId:null,fault:null}));}
  remove(id:string){this.removes.push(id);this.actors.delete(id);}
}
const services:ServiceQueue[]=Array.from({length:4},(_,j)=>({id:'site-'+j,approach:[j*3,0,0],
  slots:[[j*3,0,.4],[j*3,0,.7],[j*3,0,1]]}));
const beaches:SpatialPoint[]=[[1.6,-2.2,4.6],[1.9,-2.2,4.7],[1.3,-2.2,4.5]];
describe('full-wave 12-passenger manifest and continuous sea transport',()=>{
  it('executes approach, progressive concurrent discharge, physical queues, throughput, returns, 12/12 boarding, then departure',()=>{
    const motor=new TestMotor();const s=new PmoFullWaveSession(motor,services,beaches,plan(),12);
    const observed=new Set<string>();let peakInbound=0;let seenDock=false;let departureBeforeBoarding=false;
    for(let i=0;i<25000&&s.phase!=='complete'&&s.phase!=='blocked';i++){
      s.tick(.05);observed.add(s.phase);
      const active=s.passengers.filter(p=>p.phase==='inbound').length;
      peakInbound=Math.max(peakInbound,active);
      if(s.boat.phase==='docked')seenDock=true;
      if(s.boat.phase==='departing'&&s.report().boarded!==12)departureBeforeBoarding=true;
    }
    expect(s.phase,s.error??'').toBe('complete');
    expect(seenDock).toBe(true);
    expect([...observed]).toEqual(expect.arrayContaining(['approach','disembark','visiting','return','depart','complete']));
    expect(peakInbound).toBeGreaterThanOrEqual(2);
    expect(motor.arrivals).toHaveLength(12);
    expect(new Set(motor.arrivals).size).toBe(12);
    expect(motor.removes).toHaveLength(12);
    expect(new Set(motor.removes)).toEqual(new Set(motor.arrivals));
    expect(departureBeforeBoarding).toBe(false);
    expect(s.passengers.every(p=>p.phase==='boarded')).toBe(true);
    expect(s.report().activeMotor).toBe(0);
  });
  it('fails closed when an outbound PMO route is unavailable and does not sail away',()=>{
    const motor=new TestMotor();motor.rejectReturn=true;
    const s=new PmoFullWaveSession(motor,services,beaches,plan(),12);
    for(let i=0;i<25000&&s.phase!=='blocked';i++)s.tick(.05);
    expect(s.phase).toBe('blocked');
    expect(s.error).toContain('FULL_WAVE_RETURN_UNREACHABLE');
    expect(s.boat.phase).toBe('docked');
    expect(s.report().boarded).toBe(0);
  });
  it('rejects overlapping PMO service slots before letting any guest spawn',()=>{
    const duplicate:ServiceQueue[]=[...services.slice(0,3),{...services[3],slots:services[0].slots}];
    expect(()=>new PmoFullWaveSession(new TestMotor(),duplicate,beaches,plan())).toThrow('FULL_WAVE_QUEUE_SLOTS_OVERLAP');
  });
  it('runs offshore at radius >= safe annulus until only the beach-radial docking leg',()=>{
    const route=plan();
    expect(Math.hypot(route.incoming[0],route.incoming[2])).toBeGreaterThan(RRH_SAFE_WATER_RADIUS);
    expect(Math.hypot(route.outgoing[0],route.outgoing[2])).toBeGreaterThan(RRH_SAFE_WATER_RADIUS);
    expect(route.arrival[0]).toEqual(route.incoming);
    expect(route.departure.at(-1)).toEqual(route.outgoing);
    for(const p of route.arrival.concat(route.departure)){
      expect(p.every(Number.isFinite)).toBe(true);
      if(Math.hypot(p[0],p[2])<RRH_SAFE_WATER_RADIUS-.0001)
        expect(Math.atan2(p[2],p[0])).toBeCloseTo(Math.atan2(shore[2],shore[0]),5);
    }
    const boat=new SeaBoatMotion(route);
    for(let i=0;i<4000&&boat.phase!=='docked';i++)boat.tick(.05);
    expect(boat.phase).toBe('docked');
    boat.depart();
    for(let i=0;i<4000&&boat.phase!=='gone';i++)boat.tick(.05);
    expect(boat.phase).toBe('gone');
  });
});
