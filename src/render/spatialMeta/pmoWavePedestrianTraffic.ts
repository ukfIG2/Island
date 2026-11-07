/** Production traffic: Core-derived visual demand feeding the same certified
 * pedestrian motor, personal lanes, actual group lift and walk-connected local
 * queue diffusion as the PMO load laboratory. NO import from src/dev.
 * No guest entity, service timer, reward or queue ticket authority is created.
 */
import type {NormalWaveNeedId,NormalWavePhase,NeedCounts} from '../../core/state';
import type {BrushGraph,PmoTerrainConnector,SpatialPoint} from './pmoBrushCorridors';
import type {PmoLiftTransit} from './pmoLiftTransit';
import type {PedestrianSnapshot} from './pmoPedestrianRuntime';
import {createPhysicalGuestMotor} from './pmoPhysicalGuestMotor';
import {localQueueWanderPools,queueDiffusion,rankedQueueCandidates} from './pmoQueueDiffusion';

export interface TrafficFrame {
  waveNumber:number;phase:NormalWavePhase;releasedByNeed:NeedCounts;
  /** Aggregate Core queue pressure only; no one-to-one simulated guest IDs. */
  queueByNeed?:NeedCounts;
}
export interface TrafficStatus {
  admitted:number;walking:number;waiting:number;arrived:number;blocked:number;
  pending:number;reason:string|null;
}
interface VisualTraveller {
  need:NormalWaveNeedId;
  ordinal:number;
  movement:'approaching'|'waiting'|'roaming'|'returning';
  nextActionAt:number;
  trips:number;
}
const distance=(a:SpatialPoint,b:SpatialPoint)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
export class PmoWavePedestrianTraffic {
  private readonly motor;
  readonly pedestrians;
  private readonly poolByNeed=new Map<NormalWaveNeedId,readonly SpatialPoint[]>();
  private frame:TrafficFrame|null=null;
  private sequence=0;
  private released:Partial<Record<NormalWaveNeedId,number>>={};
  private completed=0;
  private readonly lifetime=new Map<string,number>();
  private readonly travellers=new Map<string,VisualTraveller>();
  private due=0;
  private clock=0;
  private reason:string|null=null;
  /** Display sampling budget, NEVER a gameplay guest count or Core cap. */
  private readonly maxVisualGuests:number;
  constructor(
    graph:BrushGraph,connector:PmoTerrainConnector,
    private readonly beach:SpatialPoint,
    private readonly destinations:Partial<Record<NormalWaveNeedId,SpatialPoint>>,
    physical:ReadonlyMap<string,readonly SpatialPoint[]>,
    lift:PmoLiftTransit,
    maxVisualGuests=9,
  ) {
    if(!Number.isInteger(maxVisualGuests)||maxVisualGuests<1)throw Error('PMO_VISUAL_BUDGET_INVALID');
    this.maxVisualGuests=maxVisualGuests;
    this.motor=createPhysicalGuestMotor(graph,connector,physical,lift);
    this.pedestrians=this.motor.pedestrians;
    const entries=Object.entries(destinations).filter((entry):entry is [NormalWaveNeedId,SpatialPoint]=>!!entry[1]);
    const pools=localQueueWanderPools(graph,entries.map(([,site])=>site));
    entries.forEach(([need],index)=>this.poolByNeed.set(need,pools[index]));
  }
  update(frame:TrafficFrame):void {
    if(this.frame?.waveNumber!==frame.waveNumber){
      this.clearWave();
    }
    this.frame=frame;
  }
  private clearWave():void {
    for(const a of this.pedestrians.snapshots())this.pedestrians.remove(a.id);
    this.released={};this.completed=0;this.sequence=0;this.due=0;this.clock=0;
    this.lifetime.clear();this.travellers.clear();this.motor.liftBatch.reset();this.reason=null;
  }
  dispose():void {
    this.motor.dispose();
    this.lifetime.clear();this.travellers.clear();this.frame=null;
  }
  seat(id:string):number|null{return this.motor.seat(id);}
  tick(seconds:number):void {
    if(!(seconds>0&&seconds<=.05&&Number.isFinite(seconds)))throw Error('PMO_TRAFFIC_INVALID_DELTA');
    this.clock+=seconds;
    // Only PmoNavigationScope ticks the actual shared cabin; this ticks the
    // passenger manifest and pedestrian motor in their tested order.
    this.motor.tick(seconds);
    for(const actor of this.pedestrians.snapshots()){
      const t=this.travellers.get(actor.id);
      if(actor.status==='arrived'&&t){
        if(t.movement==='roaming'){
          const home=this.destinations[t.need];
          if(home&&this.pedestrians.reroute(actor.id,home).status==='READY'){
            t.movement='returning';continue;
          }
          t.movement='waiting'; // retain actual position; never teleport
        }else if(t.movement==='approaching'||t.movement==='returning'){
          t.movement='waiting';
          const rank=this.frame?.queueByNeed?.[t.need]??0;
          t.nextActionAt=this.clock+queueDiffusion(rank,actor.id).cadenceSeconds;
        }
        const pressure=this.frame?.queueByNeed?.[t.need]??0;
        const queuesVisible=(this.frame?.phase==='incoming'||this.frame?.phase==='draining')&&pressure>0;
        if(queuesVisible){
          this.lifetime.delete(actor.id);
          if(t.movement==='waiting'&&this.clock>=t.nextActionAt)this.wander(actor,t,pressure);
          continue;
        }
      }
      if(actor.status!=='arrived'&&actor.status!=='blocked')continue;
      const age=(this.lifetime.get(actor.id)??0)+seconds;
      if(age>=1.4){
        this.pedestrians.remove(actor.id);this.lifetime.delete(actor.id);
        this.travellers.delete(actor.id);
        if(actor.status==='arrived')this.completed++;
      }else this.lifetime.set(actor.id,age);
    }
    if(!this.frame||this.frame.phase!=='incoming')return;
    this.due+=seconds;
    if(this.due<.30)return;
    this.due=0;
    this.admitOne();
  }
  private wander(actor:PedestrianSnapshot,t:VisualTraveller,pressure:number):void {
    const home=this.destinations[t.need];
    if(!home)return;
    const profile=queueDiffusion(Math.max(0,pressure-t.ordinal),actor.id);
    const candidates=rankedQueueCandidates(actor.id,t.trips,actor.position,home,
      this.poolByNeed.get(t.need)??[],profile,8);
    for(const next of candidates){
      if(this.pedestrians.reroute(actor.id,next).status==='READY'){
        this.pedestrians.setSpeed(actor.id,profile.speed);
        t.trips++;t.movement='roaming';return;
      }
    }
    // An unavailable local route is a physical block, not permission to roam
    // through another PMO. Keep the visitor on the verified service approach.
    t.nextActionAt=this.clock+profile.cadenceSeconds;
  }
  private admitOne():void {
    const frame=this.frame!;
    if(this.sequence>=this.maxVisualGuests)return;
    const current=this.pedestrians.snapshots();
    if(current.some(a=>a.status!=='arrived'&&a.status!=='blocked'&&distance(a.position,this.beach)<.70)){
      this.reason='BEACH_THROAT_OCCUPIED';return;
    }
    const eligible=Object.entries(frame.releasedByNeed)
      .filter(([need,n])=>n>(this.released[need as NormalWaveNeedId]??0)&&!!this.destinations[need as NormalWaveNeedId])
      .sort((a,b)=>a[0].localeCompare(b[0]));
    if(!eligible.length)return;
    const need=eligible[this.sequence%eligible.length][0] as NormalWaveNeedId;
    const id=`pmo-live:${frame.waveNumber}:${this.sequence}`;
    const result=this.pedestrians.add({id,from:this.beach,to:this.destinations[need]!,speed:this.motor.speed(id)});
    if(result.status!=='READY'){
      this.reason=`ROUTE_REJECTED:${need}:${result.reason}`;
      return;
    }
    this.travellers.set(id,{need,ordinal:this.sequence,movement:'approaching',nextActionAt:0,trips:0});
    this.released[need]=(this.released[need]??0)+1;
    this.sequence++;this.reason=null;
  }
  snapshots():readonly PedestrianSnapshot[]{return this.pedestrians.snapshots();}
  status():TrafficStatus {
    const all=this.pedestrians.snapshots();
    return {admitted:this.sequence,
      walking:all.filter(a=>a.status==='walking'||a.status==='crossing-helper').length,
      waiting:all.filter(a=>a.status.startsWith('waiting')||this.travellers.get(a.id)?.movement==='waiting').length,
      arrived:this.completed+all.filter(a=>a.status==='arrived'&&this.travellers.get(a.id)?.movement!=='waiting').length,
      blocked:all.filter(a=>a.status==='blocked').length,
      pending:Math.max(0,this.maxVisualGuests-this.sequence),reason:this.reason};
  }
}
