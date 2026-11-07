import {describe,it,expect} from 'vitest';
import type {SpatialPoint,RouteResult,RouteStep} from '../render/spatialMeta/pmoBrushCorridors';
import type {PedestrianSnapshot,PedestrianSpawn} from '../render/spatialMeta/pmoPedestrianRuntime';
import {PmoFullWaveSession,pmoFullWaveReturnRoutesConflict,type Motor,type ServiceQueue} from './pmoFullWaveSession';
import {planFullWaveSeaRoute} from './pmoFullWaveWaterRoute';
const step=(a:SpatialPoint,b:SpatialPoint,kind:'walk'|'bridge'='walk'):RouteStep=>({kind,from:a,to:b,brushSourceIds:['test']});
const slots:ServiceQueue[]=Array.from({length:4},(_,site)=>({id:'test-'+site,approach:[site*3,0,0],slots:[[site*3,0,.4],[site*3,0,.7],[site*3,0,1]]}));
const beach:SpatialPoint[]=[[1.6,-2.2,4.6],[1.9,-2.2,4.7],[1.3,-2.2,4.5]];
const sea=()=>planFullWaveSeaRoute([1.6739,-2.2456,4.5734],[12,-2.35,3],[-6,-2.35,-12],true);
class CongestedMotor implements Motor {
  private readonly actors=new Map<string,{position:SpatialPoint;goal:SpatialPoint;status:PedestrianSnapshot['status'];elapsed:number;out:boolean}>();
  peakOutbound=0;collisionTriggered=false;
  add(s:PedestrianSpawn){this.actors.set(s.id,{position:[...s.from],goal:[...s.to],status:'walking',elapsed:0,out:false});return {status:'READY'};}
  previewReroute(id:string,goal:SpatialPoint):RouteResult {
    const a=this.actors.get(id);if(!a)return {status:'UNAUTHORIZED_ENDPOINT',reason:'MISSING_ACTOR'};
    const shared:SpatialPoint=[3,0,3];
    const steps=[step(a.position,shared),step(shared,goal)];
    return {status:'READY',steps,points:[a.position,shared,goal],distance:3,brushSourceIds:['test']};
  }
  reroute(id:string,goal:SpatialPoint){const a=this.actors.get(id);if(!a)return {status:'UNAUTHORIZED_ENDPOINT',reason:'MISSING_ACTOR'};
    a.goal=[...goal];a.status='walking';a.elapsed=0;a.out=true;return {status:'READY'};}
  tick(dt:number){
    const outbound=[...this.actors.values()].filter(a=>a.out&&a.status!=='arrived');
    this.peakOutbound=Math.max(this.peakOutbound,outbound.length);
    if(outbound.length>1){this.collisionTriggered=true;for(const a of outbound)a.status='waiting-space';}
    for(const a of this.actors.values()){
      if(a.status!=='walking')continue;
      a.elapsed+=dt;
      if(a.elapsed>=.75){a.status='arrived';a.position=[...a.goal];}
    }
  }
  snapshots():PedestrianSnapshot[]{return [...this.actors].map(([id,a])=>({id,position:[...a.position],status:a.status,stepIndex:0,routeLength:2,helperId:null,fault:null}));}
  remove(id:string){this.actors.delete(id);}
}
describe('Full Wave return lane admission without collision bypass',()=>{
  it('reserves conflicting 2D walk paths at grade, including crossing interiors',()=>{
    const a=[step([0,0,0],[2,0,0])];
    expect(pmoFullWaveReturnRoutesConflict(a,[step([1,0,-1],[1,0,1])])).toBe(true);
    expect(pmoFullWaveReturnRoutesConflict(a,[step([0,.6,0],[2,.6,0])])).toBe(false);
    expect(pmoFullWaveReturnRoutesConflict(a,[step([0,0,1],[2,0,1])])).toBe(false);
    expect(pmoFullWaveReturnRoutesConflict(a,[step([30,0,30],[31,0,31],'bridge')])).toBe(true);
  });
  it('does not dispatch two returners into the same single-lane choke and completes 12/12',()=>{
    const motor=new CongestedMotor();const s=new PmoFullWaveSession(motor,slots,beach,sea(),12);
    for(let i=0;i<30000&&s.phase!=='complete'&&s.phase!=='blocked';i++)s.tick(.05);
    expect(s.error).toBeNull();expect(s.phase).toBe('complete');
    expect(s.report().boarded).toBe(12);
    expect(motor.peakOutbound).toBe(1);expect(motor.collisionTriggered).toBe(false);
    expect(s.report().activeMotor).toBe(0);
  });
  it('falls back to exclusive return admission if the motor cannot preview a route',()=>{
    const motor=new CongestedMotor();motor.previewReroute=undefined as never;
    const s=new PmoFullWaveSession(motor,slots,beach,sea(),12);
    for(let i=0;i<30000&&s.phase!=='complete'&&s.phase!=='blocked';i++)s.tick(.05);
    expect(s.phase,s.error??'').toBe('complete');expect(motor.peakOutbound).toBe(1);
  });
});
