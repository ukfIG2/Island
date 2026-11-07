import {describe,it,expect} from 'vitest';
import type {SpatialPoint} from '../render/spatialMeta/pmoBrushCorridors';
import type {PedestrianSnapshot,PedestrianSpawn} from '../render/spatialMeta/pmoPedestrianRuntime';
import {PmoCrowdStressSession} from './pmoCrowdStressSession';

const launchNodes:SpatialPoint[]=Array.from({length:12},(_,i)=>[i*0.24,0,0]);
const targets:SpatialPoint[]=[[4,0,0],[4,0,.3],[4,0,.6],[4,0,.9],[4,0,1.2]];
class LaneMotor {
  actors=new Map<string,{position:SpatialPoint,to:SpatialPoint}>();
  origins:SpatialPoint[]=[];
  add(x:PedestrianSpawn){
    if([...this.actors.values()].some(a=>Math.hypot(a.position[0]-x.from[0],a.position[2]-x.from[2])<.085))
      return {status:'UNAUTHORIZED_ENDPOINT',reason:'SPAWN_COLLIDES_WITH_ACTOR'};
    this.actors.set(x.id,{position:[...x.from],to:[...x.to]});this.origins.push([...x.from]);
    return {status:'READY'};
  }
  tick(dt:number){
    for(const a of this.actors.values()){
      const dx=a.to[0]-a.position[0],dz=a.to[2]-a.position[2],d=Math.hypot(dx,dz);
      if(d>.001){const delta=Math.min(d,dt*1.2);a.position=[a.position[0]+dx/d*delta,0,a.position[2]+dz/d*delta];}
    }
  }
  snapshots():PedestrianSnapshot[]{return [...this.actors].map(([id,a])=>({
    id,position:[...a.position],status:Math.hypot(a.to[0]-a.position[0],a.to[2]-a.position[2])<.02?'arrived':'walking',
    stepIndex:0,routeLength:1,helperId:null,fault:null,
  }));}
  remove(id:string){this.actors.delete(id);}
}

describe('physical Crowd 100 single-lane beach admission',()=>{
  it('does not launch from changing beach-side approaches, preserves identity and completes',()=>{
    const motor=new LaneMotor(),s=new PmoCrowdStressSession(motor,launchNodes,targets);
    for(let i=0;i<25000&&s.phase!=='complete'&&s.phase!=='blocked';i++)s.tick(.05);
    expect(s.report().phase,s.report().error??'').toBe('complete');
    expect(s.report().arrived).toBe(100);
    expect(motor.origins).toHaveLength(100);
    expect(motor.origins.every(p=>p[0]===launchNodes[0][0]&&p[2]===launchNodes[0][2])).toBe(true);
  });
  it('holds FIFO when the ONLY certified launch position is physically occupied',()=>{
    class FullLane extends LaneMotor {
      add(_:PedestrianSpawn){return {status:'UNAUTHORIZED_ENDPOINT',reason:'SPAWN_COLLIDES_WITH_ACTOR'};}
    }
    const s=new PmoCrowdStressSession(new FullLane(),launchNodes,targets);
    for(let i=0;i<120;i++)s.tick(.05);
    expect(s.report().launched).toBe(0);
    expect(s.director.view('beach-access').firstWaiting).toBe('crowd-001');
    expect(s.report().blocked).toBe(0);
  });
});
