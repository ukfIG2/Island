/** DEV-only 100-person physical crowd load test. All locomotion remains owned
 * by PmoPedestrianRuntime and canonical PMO. This controller only schedules
 * entry to shared bottlenecks and safely reconsiders blocked travel goals.
 * A pending passenger is WAITING BEFORE THE BOTTLENECK, not a dead pedestrian.
 */
import type {SpatialPoint} from '../render/spatialMeta/pmoBrushCorridors';
import type {PedestrianSnapshot,PedestrianSpawn} from '../render/spatialMeta/pmoPedestrianRuntime';
import {PmoBottleneckDirector} from './pmoBottleneckDirector';
import {CrowdServiceSlots,CROWD_DEV_SERVICE_SECONDS,chooseCrowdResponse} from './pmoCrowdServicePolicy';
import type {PersonalRoute} from './pmoCrowdPersonalRoutes';
import {crowdSpeed,crowdWanderSpeed} from './pmoCrowdSpeed';
import {queueDiffusion,rankedQueueCandidates} from './pmoCrowdQueueDiffusion';

export const CROWD_STRESS_COUNT=100;
import type {FerryReport} from './pmoCrowdFerrySession';
export type CrowdStatus='ready'|'running'|'complete'|'blocked';
export interface CrowdMotor {
  add(spawn:PedestrianSpawn):{status:string;reason?:string;steps?:readonly {kind:string;from:SpatialPoint;to:SpatialPoint}[]};
  snapshots():readonly PedestrianSnapshot[];
  remove(id:string):void;
  tick(dt:number):void;
  diagnostic?(id:string):string;
  previewReroute?(id:string,to:SpatialPoint):{status:string;distance?:number;reason?:string;steps?:readonly {kind:string;from:SpatialPoint;to:SpatialPoint}[]};
  reroute?(id:string,to:SpatialPoint):{status:string;reason?:string};
  setSpeed?(id:string,speed:number):boolean;
}
export interface CrowdReport {
  mode?:'beach'|'distributed'|'transport';
  transport?:FerryReport;
  phase:CrowdStatus;total:number;launched:number;active:number;waitingSpace:number;
  pendingBeach:number;arrived:number;blocked:number;peakActive:number;
  peakWaitingSpace:number;seconds:number;error:string|null;
  bottleneckQueue:number;bottleneckOccupied:number;deferredByCapacity:number;
  congestionWitness:string|null;
  replans:number;wanders:number;criticalWaiters:number;
  serviceQueued?:number;serviceActive?:number;served?:number;personalizedEndpoints?:number;viaRoutes?:number;
}
interface Traveler {
  id:string;target:SpatialPoint;lastPosition:SpatialPoint|null;
  lastMotionAt:number;lastReplanAt:number;origin:SpatialPoint|null;
  gateReleased:boolean;waitStartedAt:number|null;wandering:boolean;wanderPauseUntil:number|null;wanderTrips:number;waitingForService:boolean;nextWanderAt:number;
  authoredStairExitStep:number|null;authoredStairExit:SpatialPoint|null;
  siteIndex:number;via:SpatialPoint|null;finalTarget:SpatialPoint;lastDecisionAt:number;
}
export interface CrowdAdmissionSettings {
  /** 100 physically spaced actors on the canonical PMO network at start.
   * This is NOT an arriving ferry or the beach bottleneck throughput test. */
  startMode?:'beach'|'distributed';
  /** The single shared beach approach is a physical resource, not a spawn-grid. */
  gateCapacity?:number;
  /** Hold the token until outside the common beach escape corridor. */
  gateExitDistance?:number;
  /** Avoid arbitrary target switching at every frame. */
  replanAfterSeconds?:number;
  /** Physically certified SIDE-OF-ISLAND waypoints. Not busy stair approaches. */
  safeWanderNodes?:readonly SpatialPoint[];
  wanderBySite?:readonly (readonly SpatialPoint[])[];
  personalRoutes?:readonly PersonalRoute[];
  servicesEnabled?:boolean;
}
const gate='beach-access';
const distance=(a:readonly number[],b:readonly number[])=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const horizontal=(a:readonly number[],b:readonly number[])=>Math.hypot(a[0]-b[0],a[2]-b[2]);
export class PmoCrowdStressSession {
  readonly travelers:readonly Traveler[];
  phase:CrowdStatus='ready';error:string|null=null;
  readonly director:PmoBottleneckDirector;
  private clock=0;private launchClock=0;private cursor=0;private admitted=0;private reached=0;private faults=0;
  private readonly active=new Map<string,Traveler>();
  private peakActive=0;private peakWait=0;private spaceWait=0;
  private lastAdmission=0;private deferrals=0;private replans=0;private wanders=0;
  private nextAdmissionProbeAt=0;
  private readonly startMode:'beach'|'distributed';
  private readonly safeWanderNodes:readonly SpatialPoint[];
  private readonly wanderBySite:readonly (readonly SpatialPoint[])[];
  readonly faultsByActor=new Map<string,string>();
  readonly gateExitDistance:number;
  private readonly replanAfterSeconds:number;
  private congestionWitness:string|null=null;
  private readonly services:CrowdServiceSlots|null;
  private readonly servicingGuests=new Map<string,{traveler:Traveler;position:SpatialPoint}>();
  private readonly personalizedEndpoints:number;private readonly viaRoutes:number;
  private served=0;
  constructor(readonly motor:CrowdMotor,readonly beachNodes:readonly SpatialPoint[],readonly targetNodes:readonly SpatialPoint[],count=CROWD_STRESS_COUNT, settings:CrowdAdmissionSettings={}){
    if(count!==CROWD_STRESS_COUNT)throw Error('CROWD_STRESS_EXPECTS_EXACTLY_100');
    this.startMode=settings.startMode??'beach';
    if(beachNodes.length<(this.startMode==='distributed'?100:2)||targetNodes.length<3)
      throw Error('CROWD_STRESS_NEEDS_CERTIFIED_ENDPOINTS');
    // The beach-access approach has only ONE proven physical entrance lane.
    // Even when a synthetic test asks for a larger nominal capacity, a separate
    // physical throat-interlock below admits only one un-cleared actor.
    // Do not equate "2 lease tokens" with enough ROOM for 2 independent paths.
    const capacity=settings.gateCapacity??1;
    this.gateExitDistance=settings.gateExitDistance??1.7;
    this.replanAfterSeconds=settings.replanAfterSeconds??8;
    if(!Number.isFinite(this.gateExitDistance)||this.gateExitDistance<0.2||
       !Number.isFinite(this.replanAfterSeconds)||this.replanAfterSeconds<1)throw Error('CROWD_STRESS_INVALID_ADMISSION');
    this.safeWanderNodes=settings.safeWanderNodes??[];this.wanderBySite=settings.wanderBySite??[];
    if(settings.personalRoutes&&settings.personalRoutes.length!==count)throw Error('CROWD_PERSONAL_ROUTES_LENGTH');
    this.services=settings.servicesEnabled?new CrowdServiceSlots(3,CROWD_DEV_SERVICE_SECONDS):null;
    this.personalizedEndpoints=settings.personalRoutes?.filter(r=>r.shift>=.20).length??0;
    this.viaRoutes=settings.personalRoutes?.filter(r=>r.via!==null).length??0;
    this.director=new PmoBottleneckDirector([{id:gate,kind:'stairs',capacity,averageHoldSeconds:5}]);
    this.travelers=Array.from({length:count},(_,i)=>({
      id:'crowd-'+String(i+1).padStart(3,'0'),
      target:settings.personalRoutes?.[i]?.target??targetNodes[(i*7+Math.floor(i/targetNodes.length))%targetNodes.length],
      finalTarget:settings.personalRoutes?.[i]?.target??targetNodes[(i*7+Math.floor(i/targetNodes.length))%targetNodes.length],
      via:settings.personalRoutes?.[i]?.via??null,
      siteIndex:(i*7+Math.floor(i/targetNodes.length))%targetNodes.length,lastDecisionAt:-100,
      lastPosition:null,lastMotionAt:0,lastReplanAt:-100,origin:null,gateReleased:false,waitStartedAt:null,wandering:false,wanderPauseUntil:null,wanderTrips:0,waitingForService:false,nextWanderAt:0,authoredStairExitStep:null,authoredStairExit:null,
    }));
    for(const t of this.travelers)this.director.enqueue(t.id,gate);
  }
  abort(reason:string):void {this.error='CROWD_STRESS_EXCEPTION:'+reason;this.phase='blocked';}
  private finish(t:Traveler,id:string,success:boolean,reason=''):void {
    this.director.cancel(id);
    this.motor.remove(id);this.active.delete(id);this.servicingGuests.delete(id);this.services?.forget(id);
    if(success)this.reached++;
    else {this.faults++;this.faultsByActor.set(id,reason);}
  }
  /** Revisit plans only at bounded intervals. Larger committed service queues
   * shift the deterministic probability from patience to alternative/wander.
   * A new physical goal is NEVER adopted before previewReroute certifies it. */
  private considerReplan(t:Traveler,actor:PedestrianSnapshot):void {
    if(Boolean(this.services))return; // service guests diffuse locally AFTER joining a real FIFO.
    if(!this.motor.previewReroute||!this.motor.reroute||!t.gateReleased||t.wandering||t.via||actor.helperId!==null||
       this.clock-t.lastDecisionAt<5||this.clock-t.lastReplanAt<9)return;
    const physicalWait=actor.status==='waiting-space'&&this.clock-t.lastMotionAt>=this.replanAfterSeconds;
    const load=this.services ? this.services.pressure(t.siteIndex)+
      [...this.active.values()].filter(x=>x.siteIndex===t.siteIndex).length : 0;
    if(!physicalWait&&(!this.services||load<6||this.clock<3))return;
    t.lastDecisionAt=this.clock;
    const choice=this.services?chooseCrowdResponse(t.id,load,3,this.clock):'switch';
    if(choice==='wait'&&!physicalWait)return;
    let target:SpatialPoint|null=null,siteIndex=t.siteIndex,lowest=load;
    for(let j=0;j<this.targetNodes.length;j++){
      if(j===t.siteIndex)continue;
      const alternativeLoad=(this.services?.pressure(j)??0)+
        [...this.active.values()].filter(other=>other.siteIndex===j).length;
      if(alternativeLoad>=lowest-2)continue;
      const candidate=this.targetNodes[j];
      const check=this.motor.previewReroute(t.id,candidate);
      if(check.status==='READY'){lowest=alternativeLoad;target=candidate;siteIndex=j;}
    }
    if(target&&(choice==='switch'||physicalWait)){
      const result=this.motor.reroute(t.id,target);
      if(result.status==='READY'){
        t.target=target;t.finalTarget=target;t.siteIndex=siteIndex;t.via=null;
        t.lastReplanAt=this.clock;t.lastMotionAt=this.clock;t.waitStartedAt=null;
        t.lastPosition=[...actor.position];this.replans++;return;
      }
    }
    // If switching has no certified lower-load option, a real side-route
    // wander is the fallback for excessive queues; never fake an endpoint.
    if(!this.services||(choice==='wait'&&!physicalWait))return;
    // A wander must leave the immediate queue physically: >=0.55m and
    // different from the final service goal. Check route before committing.
    for(let offset=0;offset<this.safeWanderNodes.length;offset++){
      const p=this.safeWanderNodes[(offset+Number(t.id.slice(-3))*7)%this.safeWanderNodes.length];
      if(horizontal(p,actor.position)<.55||horizontal(p,t.finalTarget)<.35)continue;
      const check=this.motor.previewReroute(t.id,p);
      if(check.status!=='READY')continue;
      const r=this.motor.reroute(t.id,p);
      if(r.status!=='READY')continue;
      this.motor.setSpeed?.(t.id,crowdWanderSpeed(t.id));
      t.wandering=true;t.wanderPauseUntil=null;t.wanderTrips++;
      t.via=null;t.lastReplanAt=this.clock;t.lastMotionAt=this.clock;
      t.lastPosition=[...actor.position];t.waitStartedAt=null;this.wanders++;return;
    }
  }
  /** All queued/service actors stay in the physical motor. No duplicate ghost meshes. */
  serviceVisuals():readonly {id:string;position:SpatialPoint;status:'queued'|'servicing'}[]{return [];}
  private tryLocalWander(t:Traveler,position:SpatialPoint):boolean{
    const rank=this.services?.ahead(t.siteIndex,t.id)??-1;
    if(rank<1||!this.motor.previewReroute||!this.motor.reroute)return false;
    const profile=queueDiffusion(rank,t.id);
    const pool=this.wanderBySite[t.siteIndex]??this.safeWanderNodes;
    for(const candidate of rankedQueueCandidates(t.id,t.wanderTrips,position,t.target,pool,profile)){
      if(this.motor.previewReroute(t.id,candidate).status!=='READY')continue;
      if(this.motor.reroute(t.id,candidate).status!=='READY')continue;
      if(!this.services?.setReady(t.id,false))return false;
      this.motor.setSpeed?.(t.id,profile.speed);
      t.wandering=true;t.wanderPauseUntil=null;t.wanderTrips++;
      t.nextWanderAt=this.clock+profile.cadenceSeconds;
      t.lastPosition=[...position];t.lastMotionAt=this.clock;this.wanders++;
      return true;
    }
    return false;
  }
  tick(dt:number):void {
    if(!(dt>0&&dt<=0.2&&Number.isFinite(dt)))throw Error('CROWD_STRESS_INVALID_DT');
    if(this.phase==='complete'||this.phase==='blocked')return;
    this.phase='running';this.clock+=dt;this.launchClock+=dt;
    this.motor.tick(dt);
    if(this.services)for(const id of this.services.tick(dt)){
      const item=this.servicingGuests.get(id);if(!item)throw Error('SERVICE_FINISHED_WITHOUT_GUEST:'+id);
      this.finish(item.traveler,id,true);this.served++;
    }
    const snapshots=this.motor.snapshots(),byId=new Map(snapshots.map(a=>[a.id,a]));
    this.spaceWait=0;
    for(const [id,t] of this.active){
      const actor=byId.get(id);
      if(!actor){this.abort('CROWD_ACTOR_DISAPPEARED:'+id);return;}
      if(actor.status==='waiting-space'||actor.status==='waiting-helper'){
        this.spaceWait++;if(t.waitStartedAt===null)t.waitStartedAt=this.clock;
      }else t.waitStartedAt=null;
      if(t.waitingForService&&this.services){
        if(actor.status==='blocked'){
          this.finish(t,id,false,'QUEUE_PHYSICAL_BLOCK:'+String(actor.fault));continue;
        }
        if(actor.status==='arrived'){
          if(t.wandering){
            if(t.wanderPauseUntil===null){
              t.wanderPauseUntil=this.clock+queueDiffusion(this.services.ahead(t.siteIndex,id),id).pauseSeconds;
            }else if(this.clock>=t.wanderPauseUntil){
              const rank=this.services.ahead(t.siteIndex,id);
              if(rank>=2&&this.clock>=t.nextWanderAt&&this.tryLocalWander(t,actor.position))continue;
              const back=this.motor.previewReroute?.(id,t.target);
              if(back?.status!=='READY'){this.finish(t,id,false,'QUEUE_RETURN_UNREACHABLE');continue;}
              if(this.motor.reroute?.(id,t.target).status!=='READY'){
                this.finish(t,id,false,'QUEUE_RETURN_REJECTED');continue;
              }
              this.motor.setSpeed?.(id,crowdSpeed(id));
              t.wandering=false;t.wanderPauseUntil=null;t.lastMotionAt=this.clock;
              t.lastPosition=[...actor.position];
              // still away until the return trip physically reaches its PMO seat.
              t.nextWanderAt=this.clock+queueDiffusion(rank,id).cadenceSeconds;
              continue;
            }
          }else if(this.services.status(id)==='queued'){
            // If this is the return arrival, the ticket becomes physically ready.
            this.services.setReady(id,true);
            if(this.clock>=t.nextWanderAt){
              if(this.services.ahead(t.siteIndex,id)>=1)this.tryLocalWander(t,actor.position);
              t.nextWanderAt=this.clock+queueDiffusion(this.services.ahead(t.siteIndex,id),id).cadenceSeconds;
            }
          }
        }
        if(!t.lastPosition||distance(t.lastPosition,actor.position)>.004){
          t.lastPosition=[...actor.position];t.lastMotionAt=this.clock;
        }
        continue;
      }
      if(actor.status==='arrived'){
        if(t.via){
          const reroute=this.motor.reroute?.(id,t.finalTarget);
          if(reroute?.status!=='READY'){this.finish(t,id,false,'PERSONAL_VIA_REPLAN_FAILED:'+String(reroute?.reason));}
          else {t.via=null;t.lastMotionAt=this.clock;t.lastPosition=[...actor.position];}
          continue;
        }
        if(t.wandering){
          if(t.wanderPauseUntil===null){
            // A physical pause at the actual arrived PMO point, not a timer
            // that teleports a walker back to the service queue.
            t.wanderPauseUntil=this.clock+0.8+((Number(id.slice(-3))*17)%19)/10;
          }
          if(this.clock<t.wanderPauseUntil)continue;
          // Review service pressure. A long queue may justify one more walk;
          // otherwise return to the genuine reserved service goal.
          const load=(this.services?.pressure(t.siteIndex)??0)+
            [...this.active.values()].filter(a=>a.siteIndex===t.siteIndex&&!a.wandering).length;
          if(load>9&&t.wanderTrips<2&&this.safeWanderNodes.length&&this.motor.previewReroute){
            const choices=this.safeWanderNodes;
            for(let attempt=0;attempt<Math.min(24,choices.length);attempt++){
              const candidate=choices[(Number(id.slice(-3))*11+t.wanderTrips*13+attempt*7)%choices.length];
              if(horizontal(candidate,actor.position)<.7||horizontal(candidate,t.target)<.5)continue;
              if(this.motor.previewReroute(id,candidate).status!=='READY')continue;
              if(this.motor.reroute?.(id,candidate).status!=='READY')continue;
              t.wanderTrips++;t.wanderPauseUntil=null;t.lastMotionAt=this.clock;
              t.lastPosition=[...actor.position];break;
            }
            if(t.wanderPauseUntil===null)continue;
          }
          const returnToGoal=this.motor.reroute?.(t.id,t.target);
          if(returnToGoal?.status!=='READY'){
            this.finish(t,id,false,'WANDER_RETURN_UNREACHABLE:'+String(returnToGoal?.reason));
          }else{
            this.motor.setSpeed?.(t.id,crowdSpeed(t.id));
            t.wandering=false;t.wanderPauseUntil=null;t.lastMotionAt=this.clock;t.lastReplanAt=this.clock;
            t.lastPosition=[...actor.position];t.waitStartedAt=null;
          }
        }else if(this.services){
          this.director.cancel(id);
          this.servicingGuests.set(id,{traveler:t,position:[...actor.position]});
          this.services.enqueue(t.siteIndex,id);
          t.waitingForService=true;t.nextWanderAt=this.clock+.6;
        }else this.finish(t,id,true);
        continue;
      }
      if(actor.status==='blocked'){
        this.finish(t,id,false,'PHYSICAL_BLOCK:'+(actor.fault??'unknown')+':'+(this.motor.diagnostic?.(id)??''));continue;
      }
      // The gate is occupied ONLY while a pedestrian physically traverses
      // the narrow beach approach. All later routes remain independent.
      // Do not release the stair token at the exact top port: its outgoing
      // landing may still be occupied. We require the actor to CLEAR the
      // exit horizontally (not by elevation), and to be moving rather than
      // physically waiting at the throat.
      if(this.startMode==='beach'&&!t.gateReleased&&t.origin&&actor.status==='walking'&&(
        t.authoredStairExitStep!==null&&t.authoredStairExit!==null
          ? actor.stepIndex>t.authoredStairExitStep && horizontal(t.authoredStairExit,actor.position)>=0.20
          : distance(t.origin,actor.position)>=this.gateExitDistance
      )){
        t.gateReleased=true;this.director.release(id,gate);
      }
      if(!t.lastPosition||distance(t.lastPosition,actor.position)>0.004){
        t.lastPosition=[...actor.position];t.lastMotionAt=this.clock;
      }else if(this.clock-t.lastMotionAt>45){
        this.finish(t,id,false,'STALLED:'+actor.status+':'+actor.position.join(',')+':gate='+(!t.gateReleased));
        continue;
      }
      this.considerReplan(t,actor);
    }
    this.peakWait=Math.max(this.peakWait,this.spaceWait);
    // Groundable witness of the physical congestion. This is observational:
    // it never moves actors, releases an occupied lease or declares success.
    const waiting=snapshots.filter(a=>a.status==='waiting-space');
    if(waiting.length>=2){
      const first=waiting[0];
      const nearest=snapshots.filter(a=>a.id!==first.id&&a.status!=='blocked'&&a.status!=='arrived')
        .map(a=>({id:a.id,meters:horizontal(a.position,first.position)})).sort((a,b)=>a.meters-b.meters)[0];
      const owner=[...this.active.values()].find(a=>a.id===first.id);
      this.congestionWitness=first.id+'@'+first.position.map(n=>n.toFixed(3)).join(',')+
        ':step='+first.stepIndex+'/'+first.routeLength+
        ':gate='+String(owner?!owner.gateReleased:'unknown')+
        (nearest?':nearest='+nearest.id+':meters='+nearest.meters.toFixed(3):'');
    }else this.congestionWitness=null;

    // Do not spawn a group merely because 16 launch nodes look free. A shared
    // stairs/corridor admission lease is required BEFORE entering the motor.
    // A raw EMPTY SPAWN POINT is not a safe admission certificate. v2.1
    // allowed crowd-002 to enter after crowd-001 moved just 11 cm, while
    // crowd-001 was still at step 1/30 in the same entry geometry. They
    // converged to 6.6 cm and both deadlocked in the physical motor.
    // Keep the entire common approach exclusively reserved until its holder
    // has ACTUALLY cleared the stair exit/landing, regardless of nominal
    // capacity or the diverging destination routes. No out-of-order bypass.
    // At most one admission probe per 250 ms; deferredByCapacity measures
    // scheduling checks, not hundreds of retries per render second.
    // Independent density proof: place up to 25 physically verified guests per
    // frame at 100 distinct existing PMO walking points across the island.
    // This test avoids turning a single beach choke into a global spawn lock.
    // The LIVE MOTOR still validates each path and 8.5cm collision distance;
    // an unavailable route is explicitly rejected, never painted as arrival.
    if(this.startMode==='distributed'&&this.cursor<this.travelers.length){
      for(let batch=0;batch<25&&this.cursor<this.travelers.length;batch++){
        const t=this.travelers[this.cursor],spawn=this.beachNodes[this.cursor];
        const result=this.motor.add({id:t.id,from:spawn,to:t.via??t.target,speed:crowdSpeed(t.id)});
        if(result.status==='READY'){
          t.origin=[...spawn];t.lastPosition=[...spawn];t.lastMotionAt=this.clock;
          t.gateReleased=true;this.director.cancel(t.id);
          this.active.set(t.id,t);this.admitted++;
        }else{
          // An actual collision is a preflight violation of the selected
          // initial points; do not silently drop/replace a crowd member.
          this.faults++;this.faultsByActor.set(t.id,'DISTRIBUTED_SPAWN_REJECTED:'+(result.reason??result.status));
          this.director.cancel(t.id);
        }
        this.cursor++;this.lastAdmission=this.clock;
      }
    }
    if(this.startMode==='beach'&&this.cursor<this.travelers.length&&this.launchClock>=0.11&&this.clock>=this.nextAdmissionProbeAt){
      this.nextAdmissionProbeAt=this.clock+0.25;
      const t=this.travelers[this.cursor];
      const throatBusy=[...this.active.values()].some(a=>!a.gateReleased);
      if(throatBusy)this.deferrals++;
      else if(!this.director.tryAcquire(t.id,gate))this.deferrals++;
      else {
        let started=false;
        // A single stable, fully certified beach launch lane. Previous rotating
        // starts converged from different directions into the SAME narrow
        // staircase and could produce an unresolvable ring of actors.
        // If this one actual spawn position is occupied, wait in logical FIFO;
        // NEVER sneak in from the side using the other beachNodes.
        const spawn=this.beachNodes[0];
        if(![...byId.values()].some(a=>a.status!=='blocked'&&distance(a.position,spawn)<0.11)){
          const result=this.motor.add({id:t.id,from:spawn,to:t.target,speed:crowdSpeed(t.id)});
          if(result.status==='READY'){
            t.origin=[...spawn];t.lastPosition=[...spawn];t.lastMotionAt=this.clock;
            const stairIndex=result.steps?.findIndex(step=>step.kind==='stairs'&&distance(step.from,spawn)<1.8)??-1;
            t.authoredStairExitStep=stairIndex<0?null:stairIndex;
            t.authoredStairExit=stairIndex<0?null:[...result.steps![stairIndex].to];
            this.active.set(t.id,t);this.cursor++;this.admitted++;this.launchClock=0;this.lastAdmission=this.clock;
            started=true;
          }else if(result.reason!=='SPAWN_COLLIDES_WITH_ACTOR'){
            this.faults++;this.faultsByActor.set(t.id,'ROUTE_REJECTED:'+(result.reason??result.status));
            this.director.cancel(t.id);
            this.cursor++;this.launchClock=0;this.lastAdmission=this.clock;
            started=true;
          }
        }
        if(!started){ // The physical launch zone itself is full. Do not sneak through.
          this.director.yieldUnlaunched(t.id,gate);
          this.deferrals++;
        }
      }
    }
    this.peakActive=Math.max(this.peakActive,this.active.size);
    if(this.cursor<this.travelers.length&&this.clock-this.lastAdmission>120){
      this.abort('CROWD_BEACH_ADMISSION_STALLED:'+this.cursor+'/100:'+JSON.stringify(this.director.view(gate)));return;
    }
    if(this.cursor===this.travelers.length&&this.active.size===0&&this.servicingGuests.size===0){
      this.phase=this.faults?'blocked':'complete';
      if(this.faults)this.error='CROWD_STRESS_BLOCKED:'+this.faults+'/100:'+([...this.faultsByActor.entries()][0]?.join(':')??'unknown');
    }
  }
  report():CrowdReport {
    const view=this.director.view(gate);
    return {mode:this.startMode,phase:this.phase,total:this.travelers.length,launched:this.admitted,active:this.active.size,
      waitingSpace:this.spaceWait,pendingBeach:this.travelers.length-this.cursor,arrived:this.reached,
      blocked:this.faults,peakActive:this.peakActive,peakWaitingSpace:this.peakWait,
      seconds:Math.round(this.clock*10)/10,error:this.error,
      bottleneckQueue:this.startMode==='beach'?view.queued:0,bottleneckOccupied:this.startMode==='beach'?view.occupied:0,
      deferredByCapacity:this.deferrals,replans:this.replans,wanders:this.wanders,congestionWitness:this.congestionWitness,
      criticalWaiters:[...this.active.values()].filter(t=>t.waitStartedAt!==null&&this.clock-t.waitStartedAt!>8).length,
      serviceQueued:this.services?.pending()??0,serviceActive:this.services?.active()??0,served:this.served,
      personalizedEndpoints:this.personalizedEndpoints,viaRoutes:this.viaRoutes};
  }
  dispose():void {for(const id of this.active.keys())this.motor.remove(id);this.active.clear();this.servicingGuests.clear();for(const t of this.travelers){this.director.cancel(t.id);this.services?.forget(t.id);}}
}
