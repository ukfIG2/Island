import {pmoRouteStepsConflict as pmoFullWaveReturnRoutesConflict} from '../render/spatialMeta/pmoRouteConflict';
export {pmoRouteStepsConflict as pmoFullWaveReturnRoutesConflict} from '../render/spatialMeta/pmoRouteConflict';
/** Development full-wave choreography above the SAME certified PMO motor.
 * Immutable game Core. Each passenger has one durable ID through all six phases.
 * The real motor owns position, collision and reachability; no tweened pedestrian shortcuts. */
import type {SpatialPoint,RouteResult,RouteStep} from '../render/spatialMeta/pmoBrushCorridors';
import type {PmoWaveMotorPort} from '../render/spatialMeta/pmoWaveMotorPort';
import type {PedestrianSnapshot} from '../render/spatialMeta/pmoPedestrianRuntime';
import {SeaBoatMotion,type WaterPlan} from './pmoFullWaveWaterRoute';

export type FullWavePhase='approach'|'disembark'|'visiting'|'return'|'depart'|'complete'|'blocked';
export type PassengerPhase='aboard'|'inbound'|'queued'|'service'|'served'|'outbound'|'boarded';
export interface ServiceQueue {readonly id:string;readonly approach:SpatialPoint;readonly slots:readonly SpatialPoint[];}
export interface Passenger { readonly id:string;readonly serviceId:string;readonly queueIndex:number;phase:PassengerPhase;readonly queuePoint:SpatialPoint;readonly returnPoint:SpatialPoint;serviceRemaining:number; }
export interface Motor extends PmoWaveMotorPort {
  previewReroute?(id:string,goal:SpatialPoint):RouteResult;
}
export interface FullWaveReport {phase:FullWavePhase;aboard:number;disembarked:number;queued:number;servicing:number;served:number;returning:number;boarded:number;activeMotor:number;blocked:number;error:string|null;ship:[number,number,number];passengerCount:number;}
const distance=(a:readonly number[],b:readonly number[])=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
export class PmoFullWaveSession {
  readonly boat:SeaBoatMotion;
  readonly passengers:Passenger[];
  phase:FullWavePhase='approach';
  error:string|null=null;
  private clock=0;
  private totalTime=0;
  private spawnCursor=0;
  private returnCursor=0;
  private readonly serviceTurn=new Map<string,number>();
  private readonly stalePositions=new Map<string,{position:SpatialPoint;clock:number}>();
  private readonly returnReservations=new Map<string,readonly RouteStep[]>();
  private returnNextProbeAt=0;
  constructor(readonly motor:Motor, readonly services:readonly ServiceQueue[],readonly beachNodes:readonly SpatialPoint[],plan:WaterPlan,count=12){
    if(count!==12)throw Error('FULL_WAVE_REQUIRES_TWELVE_PASSENGERS');
    if(services.length<4||services.some(s=>s.slots.length<3))throw Error('FULL_WAVE_NEEDS_AT_LEAST_FOUR_SERVICE_QUEUES');
    if(beachNodes.length<2)throw Error('FULL_WAVE_NEEDS_BEACH_NODES');
    this.boat=new SeaBoatMotion(plan);
    const occupancy=new Map<string,number>();
    this.passengers=Array.from({length:count},(_,i)=>{
      const site=services[i%services.length];const slot=occupancy.get(site.id)??0;
      if(slot>=site.slots.length)throw Error('FULL_WAVE_NOT_ENOUGH_DISTINCT_SLOTS:'+site.id);
      occupancy.set(site.id,slot+1);
      return {id:'full-wave-passenger-'+String(i+1).padStart(2,'0'),serviceId:site.id,queueIndex:slot,
        phase:'aboard' as PassengerPhase,queuePoint:[...site.slots[slot]],
        returnPoint:[...beachNodes[i%beachNodes.length]],serviceRemaining:1.3+slot*0.4};
    });
    const spots=this.passengers.map(p=>p.queuePoint);
    for(let i=0;i<spots.length;i++)for(let j=i+1;j<spots.length;j++)
      if(distance(spots[i],spots[j])<0.14)throw Error('FULL_WAVE_QUEUE_SLOTS_OVERLAP');
  }
  private fail(reason:string):void {this.error=reason;this.phase='blocked';}
  abort(reason:string):void {this.fail('FULL_WAVE_EXCEPTION:'+reason);}
  private actorMap():Map<string,PedestrianSnapshot>{return new Map(this.motor.snapshots().map(x=>[x.id,x]));}
  tick(dt:number):void {
    if(!Number.isFinite(dt)||dt<=0||dt>0.2)throw Error('FULL_WAVE_INVALID_DT');
    if(this.phase==='blocked'||this.phase==='complete')return;
    this.clock+=dt;this.totalTime+=dt;
    if(this.phase==='approach'){
      this.boat.tick(dt);
      if(this.boat.phase==='docked'){this.phase='disembark';this.clock=0;}
      return;
    }
    if(this.phase==='depart'){
      this.boat.tick(dt);
      if(this.boat.phase==='gone')this.phase='complete';
      return;
    }
    this.motor.tick(dt);
    const actors=this.actorMap();
    for(const p of this.passengers){
      const actor=actors.get(p.id);
      if((p.phase==='inbound'||p.phase==='outbound'||p.phase==='queued'||p.phase==='service'||p.phase==='served') && !actor){
        this.fail('FULL_WAVE_ACTOR_DISAPPEARED:'+p.id);return;
      }
      if(actor?.status==='blocked'){this.fail('FULL_WAVE_PHYSICAL_BLOCK:'+p.id+':'+actor.fault+':'+(this.motor.diagnostic?.(p.id)??JSON.stringify({position:actor.position,stepIndex:actor.stepIndex})));return;}
      if(actor && (p.phase==='inbound'||p.phase==='outbound')){
        const prev=this.stalePositions.get(p.id);
        if(!prev || distance(prev.position,actor.position)>0.004)this.stalePositions.set(p.id,{position:[...actor.position],clock:this.totalTime});
        else if(this.totalTime-prev.clock>20){this.fail('FULL_WAVE_STALLED:'+p.id+':'+actor.status);return;}
      }
      if(p.phase==='inbound'&&actor?.status==='arrived')p.phase='queued';
      if(p.phase==='outbound'&&actor?.status==='arrived'){
        if(distance(actor.position,p.returnPoint)>0.08){this.fail('FULL_WAVE_FALSE_BOARDING:'+p.id);return;}
        p.phase='boarded';this.motor.remove(p.id);this.stalePositions.delete(p.id);this.returnReservations.delete(p.id);
      }
    }
    if(this.phase==='disembark'||this.phase==='visiting'){
      // Admission is gated by both throat occupancy and concurrent motor load.
      const active=this.passengers.filter(p=>p.phase==='inbound').length;
      if(this.spawnCursor<this.passengers.length&&active<4&&this.clock>=0.85){
        const p=this.passengers[this.spawnCursor];
        const beach=this.beachNodes.find(node=>{
          return ![...actors.values()].some(a=>a.status!=='arrived'&&distance(a.position,node)<0.24);
        });
        if(beach){
          const result=this.motor.add({id:p.id,from:beach,to:p.queuePoint,speed:0.44});
          if(result.status==='READY'){p.phase='inbound';this.spawnCursor++;this.clock=0;this.phase='visiting';}
          else if(result.reason!=='SPAWN_COLLIDES_WITH_ACTOR'){this.fail('FULL_WAVE_SPAWN_REJECTED:'+p.id+':'+result.reason);return;}
        }
      }
      // Service throughput is limited to ONE customer per site at a time.
      // Queue slots are real distinct PMO nodes; nobody teleports into a building.
      for(const site of this.services){
        const guests=this.passengers.filter(p=>p.serviceId===site.id);
        const turn=this.serviceTurn.get(site.id)??0;
        const current=guests[turn];if(!current)continue;
        if(current.phase==='queued'){current.phase='service';}
        if(current.phase==='service'){
          current.serviceRemaining-=dt;
          if(current.serviceRemaining<=0){current.phase='served';this.serviceTurn.set(site.id,turn+1);}
        }
      }
      if(this.spawnCursor===this.passengers.length && this.passengers.every(p=>p.phase==='served')){
        this.phase='return';this.clock=0;
      }
      return;
    }
    if(this.phase==='return'){
      const active=this.passengers.filter(p=>p.phase==='outbound').length;
      if(this.returnCursor<this.passengers.length&&active<2&&this.clock>=1.05&&this.totalTime>=this.returnNextProbeAt){
        const p=this.passengers[this.returnCursor];
        // Never admit an unverified crossing into an occupied narrow return
        // corridor. If the motor cannot preview, conservatively serialize.
        const preview=this.motor.previewReroute?.(p.id,p.returnPoint);
        if(preview && preview.status!=='READY'){
          this.fail('FULL_WAVE_RETURN_UNREACHABLE:'+p.id+':'+preview.reason);return;
        }
        const safe=active===0||(preview?.status==='READY'&&
          [...this.returnReservations.values()].every(path=>!pmoFullWaveReturnRoutesConflict(path,preview.steps)));
        // Throttle route previews while a returning rider owns the lane.
        this.returnNextProbeAt=this.totalTime+0.5;
        if(safe){
          const result=this.motor.reroute(p.id,p.returnPoint);
          if(result.status!=='READY'){this.fail('FULL_WAVE_RETURN_UNREACHABLE:'+p.id+':'+result.reason);return;}
          const origin=actors.get(p.id);
          if(!origin){this.fail('FULL_WAVE_RETURN_ACTOR_MISSING:'+p.id);return;}
          this.stalePositions.set(p.id,{position:[...origin.position],clock:this.totalTime});
          if(preview?.status==='READY')this.returnReservations.set(p.id,preview.steps);
          p.phase='outbound';this.returnCursor++;this.clock=0;
        }
      }
      if(this.passengers.every(p=>p.phase==='boarded')){
        this.boat.depart();this.phase='depart';
      }
    }
  }
  report():FullWaveReport {
    const count=(s:PassengerPhase)=>this.passengers.filter(p=>p.phase===s).length;
    return {phase:this.phase,aboard:count('aboard'),disembarked:this.spawnCursor,queued:count('queued'),
      servicing:count('service'),served:count('served'),returning:count('outbound'),
      boarded:count('boarded'),activeMotor:this.motor.snapshots().length,
      blocked:this.phase==='blocked'?1:0,error:this.error,ship:[...this.boat.position],passengerCount:this.passengers.length};
  }
}
