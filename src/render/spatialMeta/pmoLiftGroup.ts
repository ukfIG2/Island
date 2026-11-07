/** Shared physical mechanism: a group of passengers rides the SAME authorized PmoLiftTransit car.
 * Each client opts into group or single-rider transit explicitly.
 * No new geometry, teleportation or simulated car. The car's actual fraction is
 * advanced once per frame and read by every member of the same manifest.
 */
import type {SpatialPoint,PmoRouteHelper} from './pmoBrushCorridors';
import type {PmoLiftTransit} from './pmoLiftTransit';
export interface LiftBatchParticipant {id:string; helper:PmoRouteHelper;from:SpatialPoint;to:SpatialPoint;side:0|1;since:number;}
interface Batch {token:string;members:LiftBatchParticipant[];accepted:Set<string>;released:Set<string>;progress:number;}
interface Lane {pending:LiftBatchParticipant[];batch:Batch|null; serial:number;}
const dist=(a:SpatialPoint,b:SpatialPoint)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
export class PmoCrowdLiftBatch {
  private clock=0;
  private readonly lanes=new Map<string,Lane>();
  private readonly capacity:number;
  private readonly collectSeconds:number;
  private readonly speed:number;
  trips=0;groupedRiders=0;peakGroup=0;
  constructor(private readonly transit:Pick<PmoLiftTransit,'reserve'|'ride'|'release'|'position'>,
    capacity=10,collectSeconds=1.1,speed=0.65){
    if(!Number.isInteger(capacity)||capacity<2||capacity>10||
       !Number.isFinite(collectSeconds)||collectSeconds<=0||
       !Number.isFinite(speed)||speed<=0)throw Error('CROWD_BATCH_LIFT_INVALID_SETTINGS');
    this.capacity=capacity;this.collectSeconds=collectSeconds;this.speed=speed;
  }
  private lane(id:string):Lane {let l=this.lanes.get(id);if(!l){l={pending:[],batch:null,serial:0};this.lanes.set(id,l);}return l;}
  /** Called by physical helper runtime at its unchanged authored dock. */
  enter(helper:PmoRouteHelper,from:SpatialPoint,to:SpatialPoint,id:string):boolean{
    if(helper.kind!=='lift')return false;
    const side=dist(from,helper.from)<0.065?0:dist(from,helper.to)<0.065?1:-1;
    if(side<0||dist(to,side===0?helper.to:helper.from)>0.065)return false;
    const l=this.lane(helper.sourceId);
    const passenger=l.batch?.members.find(x=>x.id===id);
    if(passenger){l.batch!.accepted.add(id);return true;}
    if(!l.pending.some(x=>x.id===id))l.pending.push({id,helper,from:[...from],to:[...to],side:side as 0|1,since:this.clock});
    return false;
  }
  /** Called before the motor tick. Never advances the vehicle more than once. */
  tick(dt:number):void{
    if(!Number.isFinite(dt)||dt<=0||dt>1)throw Error('CROWD_BATCH_LIFT_BAD_DT');
    this.clock+=dt;
    for(const [source,l] of this.lanes){
      if(!l.batch&&l.pending.length){
        // FIFO by arrival; collect only riders going the SAME direction.
        const leader=l.pending[0];const compatible=l.pending.filter(p=>p.side===leader.side).slice(0,this.capacity);
        if(compatible.length>=this.capacity||this.clock-leader.since>=this.collectSeconds){
          const token='crowd-batch:'+source+':'+(++l.serial);
          // The existing physical car may have to travel EMPTY to that dock.
          if(this.transit.reserve(leader.helper,leader.from,token)){
            l.pending=l.pending.filter(p=>!compatible.some(c=>c.id===p.id));
            l.batch={token,members:compatible,accepted:new Set(),released:new Set(),progress:0};
            this.trips++;this.groupedRiders+=compatible.length;
            this.peakGroup=Math.max(this.peakGroup,compatible.length);
          }
        }
      }
      const b=l.batch;
      if(b&&b.accepted.size===b.members.length&&b.progress<1){
        const first=b.members[0];const length=Math.max(.05,dist(first.from,first.to));
        const next=Math.min(1,b.progress+Math.min(.065,this.speed*dt)/length);
        // A failed surface/car identity sample stops the batch, never fakes transport.
        const sample=this.transit.ride(first.helper,next,first.from,first.to,b.token);
        if(!sample)throw Error('CROWD_BATCH_LIFT_PHYSICAL_CAR_SAMPLE_REJECTED:'+source);
        b.progress=next;
      }
    }
  }
  sample(helper:PmoRouteHelper,from:SpatialPoint,to:SpatialPoint,id:string):{position:SpatialPoint;fraction:number}|null{
    const l=this.lanes.get(helper.sourceId);const b=l?.batch;
    if(!b||!b.accepted.has(id)||!b.members.some(x=>x.id===id))return null;
    const p=this.transit.position(helper.sourceId);if(!p)return null;
    return {position:p,fraction:b.progress};
  }
  seat(id:string):number|null{
    for(const lane of this.lanes.values()){
      const i=lane.batch?.members.findIndex(p=>p.id===id)??-1;
      if(i>=0)return i;
    }
    return null;
  }
  release(helper:PmoRouteHelper,id:string):void{
    const l=this.lanes.get(helper.sourceId);if(!l)return;
    l.pending=l.pending.filter(p=>p.id!==id);
    const b=l.batch;if(!b)return;
    if(!b.members.some(p=>p.id===id))return;
    b.released.add(id);
    // One rider's completion never frees the shared car early.
    if(b.released.size===b.members.length){this.transit.release(b.members[0].helper,b.token);l.batch=null;}
  }
  stats(){return {trips:this.trips,groupedRiders:this.groupedRiders,peakGroup:this.peakGroup,pending:[...this.lanes.values()].reduce((n,l)=>n+l.pending.length,0)};}
  reset(){for(const l of this.lanes.values()){
    if(l.batch)this.transit.release(l.batch.members[0].helper,l.batch.token);
    l.pending=[];l.batch=null;
  }this.lanes.clear();}
}
