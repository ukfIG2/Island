import {describe,it,expect} from 'vitest';
import {PmoCrowdFerrySession,type FerryMotor} from './pmoCrowdFerrySession';
import type {SpatialPoint} from '../render/spatialMeta/pmoBrushCorridors';
import type {PedestrianSnapshot} from '../render/spatialMeta/pmoPedestrianRuntime';
import type {WaterPlan} from './pmoFullWaveWaterRoute';
const p=(x:number):SpatialPoint=>[x,0,0];
const plan:WaterPlan={incoming:[12,-2.35,0],outgoing:[-12,-2.35,0],dock:[6,-2.35,0],
  arrival:[[12,-2.35,0],[6,-2.35,0]],departure:[[6,-2.35,0],[-12,-2.35,0]]};
function motor(failReturn=false):FerryMotor{
  const map=new Map<string,{pos:SpatialPoint;goal:SpatialPoint;status:'walking'|'arrived'}>();
  return {add({id,from,to}){map.set(id,{pos:[...from],goal:[...to],status:'walking'});return {status:'READY'};},
    reroute(id,goal){if(failReturn)return {status:'REJECTED',reason:'MOCK_NO_RETURN'};
      const a=map.get(id);if(!a)return {status:'REJECTED',reason:'MISSING'};
      a.goal=[...goal];a.status='walking';return {status:'READY'};},
    tick(){for(const a of map.values())if(a.status==='walking'){a.pos=[...a.goal];a.status='arrived';}},
    snapshots(){return [...map.entries()].map(([id,a])=>({id,position:[...a.pos],status:a.status,
      stepIndex:0,routeLength:1,helperId:null,fault:null})) as PedestrianSnapshot[];},
    remove(id){map.delete(id);}};
}
describe('100-passenger DEV ferry wave',()=>{
  it('never disembarks before docking; physically returns 100 guests before departure',()=>{
    const s=new PmoCrowdFerrySession(motor(),[p(1),p(2),p(3),p(4),p(5)],p(0),plan,100);
    expect(s.report().disembarked).toBe(0);
    let everDepartedEarly=false;const seen=new Set<string>();
    for(let i=0;i<40000&&s.phase!=='complete'&&s.phase!=='blocked';i++){
      s.tick(.05);seen.add(s.phase);
      if(s.boat.phase==='departing'&&s.report().boarded!==100)everDepartedEarly=true;
    }
    expect(s.error).toBeNull();expect(s.phase).toBe('complete');
    expect(s.report().disembarked).toBe(100);expect(s.report().boarded).toBe(100);
    expect(s.report().blocked).toBe(0);expect(everDepartedEarly).toBe(false);
    for(const name of ['approach','visiting','returning','departing','complete'])expect(seen.has(name)).toBe(true);
    expect(new Set(s.guests.map(g=>g.id)).size).toBe(100);
  });
  it('rejects unreachable return instead of silently boarding or departing',()=>{
    const s=new PmoCrowdFerrySession(motor(true),[p(1),p(2),p(3)],p(0),plan,100);
    for(let i=0;i<40000&&s.phase!=='complete'&&s.phase!=='blocked';i++)s.tick(.05);
    expect(s.phase).toBe('blocked');expect(s.error).toContain('FERRY_RETURN_UNREACHABLE');
    expect(s.report().boarded).toBe(0);expect(s.boat.phase).toBe('docked');
  });
  it('never claims delivery when a landing route is rejected',()=>{
    const m=motor();m.add=()=>({status:'REJECTED',reason:'BAD_PMO'});
    const s=new PmoCrowdFerrySession(m,[p(1),p(2),p(3)],p(0),plan,100);
    for(let i=0;i<2000&&s.phase!=='blocked';i++)s.tick(.05);
    expect(s.phase).toBe('blocked');expect(s.report().disembarked).toBe(0);
    expect(s.error).toContain('FERRY_LANDING_ROUTE_REJECTED');
  });
  it('does not kill a legitimate >120s lift queue, and still boards every real passenger',()=>{
    let clock=0;
    const list=new Map<string,{pos:SpatialPoint;goal:SpatialPoint;status:'walking'|'arrived'|'waiting-helper'}>();
    const m:FerryMotor={
      add({id,from,to}){list.set(id,{pos:[...from],goal:[...to],status:'walking'});return {status:'READY'};},
      reroute(id,goal){const a=list.get(id);if(!a)return {status:'REJECTED',reason:'MISSING'};
        a.goal=[...goal];a.status='walking';return {status:'READY'};},
      tick(dt){clock+=dt;for(const [id,a] of list){
        if(a.status==='arrived')continue;
        if(id==='ferry-guest-001'&&clock<170){a.status='waiting-helper';continue;}
        a.pos=[...a.goal];a.status='arrived';
      }},
      snapshots(){return [...list.entries()].map(([id,a])=>({id,position:[...a.pos],status:a.status,
        stepIndex:0,routeLength:1,helperId:a.status==='waiting-helper'?'lift-queue':null,fault:null})) as PedestrianSnapshot[];},
      remove(id){list.delete(id);},diagnostic(id){return 'MOCK_DIAGNOSTIC:'+id;}
    };
    const session=new PmoCrowdFerrySession(m,[p(1),p(2),p(3),p(4)],p(0),plan,100);
    let reachedLongQueue=false,displayedVisited=false;
    for(let i=0;i<25000&&session.phase!=='complete'&&session.phase!=='blocked';i++){
      session.tick(.05);
      const r=session.report();
      if(r.seconds>145&&r.waitingHelper===1)reachedLongQueue=true;
      if(r.visited>0&&r.boarded===0)displayedVisited=true;
    }
    expect(reachedLongQueue).toBe(true);
    expect(displayedVisited).toBe(true);
    expect(session.phase).toBe('complete');
    expect(session.report().visited).toBe(100);
    expect(session.report().boarded).toBe(100);
    expect(session.report().error).toBeNull();
  });
  it('still fails closed if a walking passenger stops, and includes physical diagnostic',()=>{
    const m=motor();
    const original=m.tick.bind(m);
    m.tick=(dt)=>{ // Physical motor never moves any actor, but reports walking.
      void dt;
    };
    m.diagnostic=(id)=>'EXACT_ROUTE_STEP:'+id;
    const session=new PmoCrowdFerrySession(m,[p(1),p(2),p(3)],p(0),plan,100);
    for(let i=0;i<18000&&session.phase!=='blocked';i++)session.tick(.05);
    expect(session.phase).toBe('blocked');
    expect(session.error).toContain('FERRY_WALK_STALLED:ferry-guest-001');
    expect(session.error).toContain('EXACT_ROUTE_STEP:ferry-guest-001');
    expect(session.report().boarded).toBe(0);
    void original;
  });
});
