/** DEV ONLY: physical 100-passenger full wave. The motor alone owns walking,
 * reachability and lift occupancy; SeaBoatMotion owns actual vessel position.
 * No Core writes, no arrival by elapsed timer, no phantom boarding. */
import type {SpatialPoint} from '../render/spatialMeta/pmoBrushCorridors';
import type {PmoWaveMotorPort} from '../render/spatialMeta/pmoWaveMotorPort';
import type {PedestrianSnapshot} from '../render/spatialMeta/pmoPedestrianRuntime';
import {SeaBoatMotion,type WaterPlan} from './pmoFullWaveWaterRoute';
import {CrowdServiceSlots,CROWD_DEV_SERVICE_SECONDS} from './pmoCrowdServicePolicy';
import {crowdSpeed} from './pmoCrowdSpeed';
import {queueDiffusion,rankedQueueCandidates} from './pmoCrowdQueueDiffusion';
import type {CrowdSpatialPlan} from './pmoCrowdSpatialTargets';
export type FerryPhase='approach'|'unloading'|'visiting'|'returning'|'departing'|'complete'|'blocked';
export type FerryGuestPhase='aboard'|'inbound'|'queue'|'service'|'served'|'outbound'|'boarded';
export interface FerryMotor extends PmoWaveMotorPort {
  previewReroute?(id:string,to:SpatialPoint):{status:string;reason?:string};
  setSpeed?(id:string,speed:number):boolean;
}
export interface FerryGuest {
  readonly id:string;readonly target:SpatialPoint;readonly returnPoint:SpatialPoint;
  readonly site:number;phase:FerryGuestPhase;lastPosition:SpatialPoint|null;lastMoveAt:number;
  wander:'walking'|'paused'|'returning'|null;wanderUntil:number;wanderTrips:number;nextWanderAt:number;
}
export interface FerryReport {
  phase:FerryPhase;passengers:number;aboard:number;disembarked:number;
  moving:number;queued:number;servicing:number;served:number;returning:number;
  boarded:number;blocked:number;error:string|null;seconds:number;
  ship:[number,number,number];peakMoving:number;liftUse:number;
  /** Lifetime completed services, unlike the current `served` phase count. */
  visited:number;waitingHelper:number;waitingSpace:number;walking:number;wanders?:number;
}
const dist=(a:readonly number[],b:readonly number[])=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
export class PmoCrowdFerrySession {
  readonly boat:SeaBoatMotion;
  readonly guests:FerryGuest[];
  phase:FerryPhase='approach';error:string|null=null;
  private readonly services=new CrowdServiceSlots(3,CROWD_DEV_SERVICE_SECONDS);
  private now=0;private launchCursor=0;private returnCursor=0;private boardedCount=0;
  private peakMoving=0;private lifts=0;private lastLaunch=0;private completedVisits=0;
  private readonly map=new Map<string,FerryGuest>();
  private readonly wanderBySite:readonly (readonly SpatialPoint[])[];private wanderCount=0;
  constructor(readonly motor:FerryMotor,targets:readonly SpatialPoint[],beachStart:SpatialPoint,
    plan:WaterPlan,count=100,spatial?:CrowdSpatialPlan){
    if(count!==100||targets.length<3||beachStart.some(v=>!Number.isFinite(v)))
      throw Error('FERRY_100_INVALID_CERTIFIED_ENDPOINTS');
    this.boat=new SeaBoatMotion(plan,2.2);
    this.wanderBySite=spatial?.wanderBySite??[];
    this.guests=Array.from({length:count},(_,i)=>{
      const site=(i*7+Math.floor(i/targets.length))%targets.length;
      const guest:FerryGuest={id:'ferry-guest-'+String(i+1).padStart(3,'0'),
        site,target:[...(spatial?.servicePositions[i]??targets[site])],
        returnPoint:[...(spatial?.beachPositions[i]??beachStart)],phase:'aboard',
        lastPosition:null,lastMoveAt:0,wander:null,wanderUntil:0,wanderTrips:0,nextWanderAt:0};
      this.map.set(guest.id,guest);return guest;
    });
  }
  private fail(reason:string):void {this.phase='blocked';this.error=reason;}
  abort(reason:string):void {this.fail('FERRY_100_EXCEPTION:'+reason);}
  tick(dt:number):void {
    if(!(dt>0&&dt<=0.2&&Number.isFinite(dt)))throw Error('FERRY_100_INVALID_DT');
    if(this.phase==='complete'||this.phase==='blocked')return;
    this.now+=dt;
    if(this.phase==='approach'||this.phase==='departing'){
      this.boat.tick(dt);
      if(this.phase==='approach'&&this.boat.phase==='docked')this.phase='unloading';
      if(this.phase==='departing'&&this.boat.phase==='gone')this.phase='complete';
      return;
    }
    if(this.boat.phase!=='docked'){this.fail('FERRY_NOT_DOCKED_WHILE_GUESTS_ASHORE');return;}
    this.motor.tick(dt);
    const actors=new Map(this.motor.snapshots().map(a=>[a.id,a]));
    // A guest queued at a helper is STILL inbound. Count manifest passengers
    // rather than only frames whose physical motor status happens to be walking.
    this.peakMoving=Math.max(this.peakMoving,this.guests.filter(g=>g.phase==='inbound'||g.phase==='outbound').length);
    for(const guest of this.guests){
      const a=actors.get(guest.id);
      if(guest.phase!=='aboard'&&guest.phase!=='boarded'&&!a){this.fail('FERRY_GUEST_MISSING:'+guest.id);return;}
      if(!a)continue;
      if(a.status==='blocked'){this.fail('FERRY_PHYSICAL_BLOCK:'+guest.id+':'+String(a.fault)+':'+String(this.motor.diagnostic?.(guest.id)??''));return;}
      if(a.status==='crossing-helper')this.lifts++;
      if(guest.phase==='inbound'||guest.phase==='outbound'){
        if(!guest.lastPosition||dist(guest.lastPosition,a.position)>0.005){guest.lastPosition=[...a.position];guest.lastMoveAt=this.now;}
        else {
          const idle=this.now-guest.lastMoveAt;
          // A passenger waiting for an authorized lift batch has not suffered a
          // WALK failure. The 120s pedestrian watchdog in v6.2 incorrectly
          // classified a long live queue as terminal FERRY_STALLED. We still
          // fail closed if *even the queue* remains motionless for ten minutes.
          // All genuinely blocked motor states continue to fail immediately.
          const budget=a.status==='waiting-helper'?600:
            a.status==='crossing-helper'?75:120;
          if(idle>budget){
            this.fail((a.status==='waiting-helper'?'FERRY_LIFT_QUEUE_TIMEOUT':
              a.status==='crossing-helper'?'FERRY_HELPER_TRANSIT_STALLED':
              a.status==='waiting-space'?'FERRY_SPACE_STALLED':'FERRY_WALK_STALLED')+
              ':'+guest.id+':idle='+idle.toFixed(1)+':status='+a.status+
              ':helper='+String(a.helperId)+':'+String(this.motor.diagnostic?.(guest.id)??''));
            return;
          }
        }
      }
      if(guest.phase==='inbound'&&a.status==='arrived'){
        guest.phase='queue';this.services.enqueue(guest.site,guest.id);
        // Retain a real FIFO ticket while guests stroll to another reachable
        // authored PMO mark. Service admission is disabled until their return.
        guest.nextWanderAt=this.now+0.6; // all waiting tickets are eligible for ranked local diffusion
      }else if(guest.phase==='outbound'&&a.status==='arrived'){
        if(dist(a.position,guest.returnPoint)>0.085){this.fail('FERRY_FALSE_BOARDING:'+guest.id);return;}
        guest.phase='boarded';this.motor.remove(guest.id);this.boardedCount++;
      }
    }
    for(const guest of this.guests){
      if(guest.phase==='queue'&&guest.wander){
        const a=actors.get(guest.id)!;
        if(a.status==='arrived'){
          if(guest.wander==='walking'){
            guest.wander='paused';guest.wanderUntil=this.now+queueDiffusion(this.services.ahead(guest.site,guest.id),guest.id).pauseSeconds;
          }else if(guest.wander==='paused'&&this.now>=guest.wanderUntil){
            const rank=this.services.ahead(guest.site,guest.id);
            if(rank>=2&&this.now>=guest.nextWanderAt&&this.tryWander(guest,a.position))continue;
            // Preview avoids a failed live reroute that would block the actor.
            if(this.motor.previewReroute?.(guest.id,guest.target).status!=='READY'){
              this.fail('FERRY_WANDER_RETURN_UNREACHABLE:'+guest.id);return;
            }
            const home=this.motor.reroute(guest.id,guest.target);
            if(home.status!=='READY'){this.fail('FERRY_WANDER_RETURN_REJECTED:'+guest.id);return;}
            guest.wander='returning';this.motor.setSpeed?.(guest.id,crowdSpeed(guest.id));
          }else if(guest.wander==='returning'){
            guest.wander=null;guest.lastMoveAt=this.now;this.services.setReady(guest.id,true);
            guest.nextWanderAt=this.now+queueDiffusion(this.services.ahead(guest.site,guest.id),guest.id).cadenceSeconds;
          }
        }
      }
      if(guest.phase==='queue'&&!guest.wander){
        if(this.services.status(guest.id)==='servicing')guest.phase='service';
        else if(actors.get(guest.id)?.status==='arrived'&&this.now>=guest.nextWanderAt){
          const rank=this.services.ahead(guest.site,guest.id);
          const profile=queueDiffusion(rank,guest.id);
          if(rank>=1)this.tryWander(guest,actors.get(guest.id)!.position);
          guest.nextWanderAt=this.now+profile.cadenceSeconds;
        }
      }
    }
    for(const id of this.services.tick(dt)){
      const guest=this.map.get(id);if(!guest||guest.phase==='aboard'||guest.phase==='boarded'){
        this.fail('FERRY_SERVICE_CONTRACT_BROKEN:'+id);return;
      }
      guest.phase='served';this.completedVisits++;
    }
    if(this.phase==='unloading'||this.phase==='visiting'){
      // All 100 physically enter from the PMO beach while the boat is docked.
      // Collision spacing is a test-mode option; the motor still certifies routes.
      if(this.launchCursor<this.guests.length&&this.now-this.lastLaunch>=0.055){
        for(let batch=0;batch<5&&this.launchCursor<this.guests.length;batch++){
          const guest=this.guests[this.launchCursor];
          const result=this.motor.add({id:guest.id,from:guest.returnPoint,to:guest.target,speed:crowdSpeed(guest.id)});
          if(result.status!=='READY'){
            // Real endpoint/collision refusal never increments the manifest.
            if(result.reason==='SPAWN_COLLIDES_WITH_ACTOR')break;
            this.fail('FERRY_LANDING_ROUTE_REJECTED:'+guest.id+':'+String(result.reason??result.status));return;
          }
          guest.phase='inbound';guest.lastMoveAt=this.now;guest.lastPosition=[...guest.returnPoint];
          this.launchCursor++;this.phase='visiting';this.lastLaunch=this.now;
        }
      }
      if(this.launchCursor===this.guests.length&&this.guests.every(g=>g.phase==='served')){
        this.phase='returning';this.returnCursor=0;
      }
    }
    if(this.phase==='returning'){
      // Wave end, then everyone physically walks back to their beach pickup point.
      for(let batch=0;batch<5&&this.returnCursor<this.guests.length;batch++){
        const guest=this.guests[this.returnCursor];
        if(guest.phase!=='served'){this.fail('FERRY_RETURN_BEFORE_SERVICE:'+guest.id);return;}
        const result=this.motor.reroute(guest.id,guest.returnPoint);
        if(result.status!=='READY'){this.fail('FERRY_RETURN_UNREACHABLE:'+guest.id+':'+String(result.reason));return;}
        guest.phase='outbound';guest.lastMoveAt=this.now;
        const a=actors.get(guest.id);guest.lastPosition=a?[...a.position]:null;
        this.returnCursor++;
      }
      if(this.boardedCount===this.guests.length){
        this.boat.depart();this.phase='departing';
      }
    }
  }
  /** Local PMO diffusion according to the passenger's *own* FIFO rank. */
  private tryWander(guest:FerryGuest,from:SpatialPoint):boolean {
    const rank=this.services.ahead(guest.site,guest.id);
    const pool=this.wanderBySite[guest.site]??[];
    if(rank<1||!this.motor.previewReroute||!pool.length)return false;
    const profile=queueDiffusion(rank,guest.id);
    const candidates=rankedQueueCandidates(guest.id,guest.wanderTrips,from,guest.target,pool,profile);
    for(const p of candidates){
      if(this.motor.previewReroute(guest.id,p).status!=='READY')continue;
      const route=this.motor.reroute(guest.id,p);
      if(route.status!=='READY')continue;
      if(!this.services.setReady(guest.id,false))return false;
      guest.wander='walking';guest.wanderTrips++;guest.wanderUntil=0;
      guest.nextWanderAt=this.now+profile.cadenceSeconds;
      this.motor.setSpeed?.(guest.id,profile.speed);
      this.wanderCount++;
      return true;
    }
    return false;
  }
  report():FerryReport {
    const count=(phase:FerryGuestPhase)=>this.guests.filter(g=>g.phase===phase).length;
    const actors=this.motor.snapshots();
    const statusCount=(status:PedestrianSnapshot['status'])=>actors.filter(a=>a.status===status).length;
    return {phase:this.phase,passengers:this.guests.length,aboard:count('aboard'),disembarked:this.launchCursor,
      moving:count('inbound'),queued:count('queue'),servicing:count('service'),served:count('served'),
      returning:count('outbound'),boarded:count('boarded'),blocked:this.phase==='blocked'?1:0,
      error:this.error,seconds:+this.now.toFixed(1),ship:[...this.boat.position],peakMoving:this.peakMoving,liftUse:this.lifts,
      visited:this.completedVisits,waitingHelper:statusCount('waiting-helper'),
      waitingSpace:statusCount('waiting-space'),walking:statusCount('walking')+statusCount('crossing-helper'),
      wanders:this.wanderCount};
  }
  visualGuests():readonly {id:string;position:SpatialPoint;phase:FerryGuestPhase}[]{
    const snapshots=new Map(this.motor.snapshots().map(a=>[a.id,a]));
    return this.guests.flatMap(g=>{
      const actor=snapshots.get(g.id);
      return actor?[{id:g.id,position:[...actor.position] as SpatialPoint,phase:g.phase}]:[];
    });
  }
  dispose():void {for(const a of this.motor.snapshots())this.motor.remove(a.id);}
}
