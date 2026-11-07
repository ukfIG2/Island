/** DEV full-wave sea transit. Boat only: all passenger foot traffic uses canonical PMO.
 *  Authored PMO docking, 1.30x island collision and offshore lens; the old annulus is legacy-fixture-only.
 *  Camera-edge points are supplied at start and frozen for reproducibility. */
import type {SpatialPoint} from '../render/spatialMeta/pmoBrushCorridors';
import {type SeaContourInput,sampleSeaRouteAt} from './pmoSeaContourRoute';
import {planSeaManeuverV4,RRH_FERRY_PROFILE,type SeaVoyagePlan} from '../render/seaManeuverPlanner';
import {SeaManeuverController} from '../render/seaManeuverController';
export type WaterPoint = [number,number,number];
const TAU=Math.PI*2;
const angle=(p:readonly number[])=>Math.atan2(p[2],p[0]);
const radius=(p:readonly number[])=>Math.hypot(p[0],p[2]);
const point=(r:number,t:number,y:number):WaterPoint=>[r*Math.cos(t),y,r*Math.sin(t)];
const mix=(a:WaterPoint,b:WaterPoint,f:number):WaterPoint=>[a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f,a[2]+(b[2]-a[2])*f];
export const RRH_SEA_LEVEL=-2.35;
export const RRH_SAFE_WATER_RADIUS=8.7;
const safe=(p:WaterPoint)=>p.every(Number.isFinite);
function arc(from:WaterPoint,to:WaterPoint,y:number,clockwise:boolean):WaterPoint[]{
  const a=angle(from),b=angle(to);
  let delta=((b-a+Math.PI*3)%TAU)-Math.PI;
  if(clockwise && delta>0)delta-=TAU;
  if(!clockwise && delta<0)delta+=TAU;
  const n=Math.max(1,Math.ceil(Math.abs(delta)/0.055));
  return Array.from({length:n},(_,i)=>point(RRH_SAFE_WATER_RADIUS,a+delta*(i+1)/n,y));
}
export interface WaterPlan { readonly arrival:readonly WaterPoint[];readonly departure:readonly WaterPoint[];readonly dock:WaterPoint;readonly incoming:WaterPoint;readonly outgoing:WaterPoint;readonly brushTarget?:WaterPoint;readonly intendedArrival?:readonly WaterPoint[];readonly intendedDeparture?:readonly WaterPoint[];readonly pipeline?:'PMO_COLLISION_LENS_REVERSE_V4'|'LEGACY_FIXTURE';readonly collisionOutline?:readonly WaterPoint[];readonly beachCollisionArc?:readonly WaterPoint[];readonly lensArc?:readonly WaterPoint[];readonly maneuverPoint?:WaterPoint;readonly reverseDeparture?:readonly WaterPoint[];readonly turningArc?:readonly WaterPoint[];readonly outwardDeparture?:readonly WaterPoint[]; readonly v4?:SeaVoyagePlan; }
/** No straight chords through the island. Radial dock access permitted ONLY on beach bearing. */
export function planFullWaveSeaRoute(shore:SpatialPoint, incoming:WaterPoint,outgoing:WaterPoint,clockwise:boolean, contour?:SeaContourInput):WaterPlan {
  if(!safe(incoming)||!safe(outgoing)||!safe(shore as WaterPoint))throw Error('FULL_WAVE_BAD_SEA_COORDINATES');
  if(radius(incoming)<RRH_SAFE_WATER_RADIUS-0.001 || radius(outgoing)<RRH_SAFE_WATER_RADIUS-0.001)
    throw Error('FULL_WAVE_ENTRY_NOT_OFFSHORE');
  if(contour){
    const v4=planSeaManeuverV4(contour,incoming,outgoing,RRH_FERRY_PROFILE);
    const plan:WaterPlan={incoming,outgoing,dock:v4.dockPose.position,
      brushTarget:v4.brushTarget,intendedArrival:[incoming,v4.brushTarget],
      intendedDeparture:[v4.dockPose.position,outgoing],
      collisionOutline:v4.collisionOutline,beachCollisionArc:v4.beachCollisionArc,lensArc:v4.lensArc,
      maneuverPoint:v4.reverseExit.position,reverseDeparture:v4.reverse,
      turningArc:v4.turning,outwardDeparture:v4.departure,
      arrival:v4.arrival,departure:v4.departure,v4,pipeline:'PMO_COLLISION_LENS_REVERSE_V4'};
    if(typeof window!=='undefined'&&new URLSearchParams(window.location.search).get('seaRouteDebug')==='1')
      console.info('RRH_SEA_PIPELINE_V43_ACTIVE',{brushTarget:v4.brushTarget,
        dock:v4.dockPose.position,
        beachDockDistance:Math.hypot(v4.dockPose.position[0]-v4.brushTarget[0],v4.dockPose.position[2]-v4.brushTarget[2]),
        lensEntry:v4.lensEntry.position,
        phases:v4.segments.map(s=>s.phase),hullLength:v4.profile.hullLength,
        physicalHullChecked:true,collisionScale:1.30,beachSideCollision:true,bowFirstGate:true});
    return plan;
  }
  // Compatibility for legacy deterministic unit fixtures that provide no island mask.
  const theta=angle(shore), dock=point(Math.max(5.32,radius(shore)+0.57),theta,RRH_SEA_LEVEL);
  const entryRing=point(RRH_SAFE_WATER_RADIUS,angle(incoming),RRH_SEA_LEVEL);
  const exitRing=point(RRH_SAFE_WATER_RADIUS,angle(outgoing),RRH_SEA_LEVEL);
  const beachRing=point(RRH_SAFE_WATER_RADIUS,theta,RRH_SEA_LEVEL);
  const radialIn=Array.from({length:18},(_,i)=>mix(beachRing,dock,(i+1)/18));
  const radialOut=Array.from({length:18},(_,i)=>mix(dock,beachRing,(i+1)/18));
  return {
    incoming, outgoing,dock,pipeline:'LEGACY_FIXTURE',
    arrival:[incoming,entryRing,...arc(entryRing,beachRing,RRH_SEA_LEVEL,clockwise),...radialIn],
    departure:[dock,...radialOut,...arc(beachRing,exitRing,RRH_SEA_LEVEL,!clockwise),outgoing],
  };
}
export class SeaBoatMotion {
  readonly arrival: readonly WaterPoint[];
  readonly departure: readonly WaterPoint[];
  position: WaterPoint;
  yaw=0;
  phase:'arriving'|'docked'|'reversing'|'turning'|'departing'|'gone'='arriving';
  private readonly v4Controller:SeaManeuverController|null;
  private index=1;
  private traveled=0;
  private facingReady=false;
  private voyageLength=0;
  private readonly accelerationRange=2.5;
  constructor(readonly plan:WaterPlan, readonly speed=2.2){
    this.arrival=plan.arrival;this.departure=plan.departure;this.position=[...plan.arrival[0]];
    this.voyageLength=this.length(this.arrival);
    this.v4Controller=plan.v4?new SeaManeuverController(plan.v4,speed):null;
    if(this.v4Controller)this.syncV4();
  }
  private length(path:readonly WaterPoint[]):number{
    let sum=0;for(let i=1;i<path.length;i++)sum+=Math.hypot(path[i][0]-path[i-1][0],path[i][2]-path[i-1][2]);
    return sum;
  }
  private rotateToward(target:number,dt:number):number {
    const error=Math.atan2(Math.sin(target-this.yaw),Math.cos(target-this.yaw));
    this.yaw+=Math.max(-.72*dt,Math.min(.72*dt,error));
    return Math.abs(error);
  }
  private syncV4():void {
    const motor=this.v4Controller!;this.position=[...motor.position];this.yaw=motor.yaw;
    this.phase=motor.phase==='DOCKED'?'docked':motor.phase==='REVERSE_UNDOCK'?'reversing':
      motor.phase==='TURNOUT'?'turning':motor.phase==='OPEN_SEA_DEPARTURE'?'departing':
      motor.phase==='COMPLETE'?'gone':'arriving';
  }
  depart():void {
    if(this.v4Controller){this.v4Controller.depart();this.syncV4();return;}
    if(this.phase!=='docked')throw Error('FULL_WAVE_UNBOARDED_DEPARTURE');
    this.index=1;this.traveled=0;this.facingReady=true;
    if(this.plan.reverseDeparture?.length){
      this.phase='reversing';this.voyageLength=this.length(this.plan.reverseDeparture);
    }else{
      // Legacy unit-fixture boats retain their historical front-forward depart.
      this.phase='departing';this.voyageLength=this.length(this.departure);
    }
  }
  tick(seconds:number):void {
    if(this.v4Controller){this.v4Controller.tick(seconds);this.syncV4();return;}
    if(this.phase==='docked'||this.phase==='gone')return;
    const dt=Math.max(0,Math.min(.08,seconds));
    const reversing=this.phase==='reversing';
    const isTurn=this.phase==='turning'&&!!this.plan.turningArc;
    const path=reversing?this.plan.reverseDeparture!:
      isTurn?this.plan.turningArc!:
      this.phase==='arriving'?this.arrival:
      this.plan.outwardDeparture??this.departure;
    const coastIn=Math.min(1,this.traveled/this.accelerationRange);
    const coastOut=Math.min(1,Math.max(0,this.voyageLength-this.traveled)/this.accelerationRange);
    let velocity=this.speed*(.34+.66*Math.min(coastIn,coastOut));
    if(reversing){
      // Back down along the same approach axis while keeping the nose toward
      // the beach. Do not rotate 180 degrees or slide sideways at the dock.
      velocity=Math.min(velocity,.75);
    }else if(this.voyageLength>1e-6){
      const at=(distance:number)=>{
        const v=sampleSeaRouteAt(path,Math.max(0,Math.min(1,distance/this.voyageLength))).direction;
        return Math.atan2(v[0],v[1]);
      };
      const back=at(Math.max(0,this.traveled-.24)),ahead=at(Math.min(this.voyageLength,this.traveled+.24));
      const angle=Math.abs(Math.atan2(Math.sin(ahead-back),Math.cos(ahead-back)));
      const length=Math.min(this.voyageLength,this.traveled+.24)-Math.max(0,this.traveled-.24);
      const curvature=angle/Math.max(.001,length);
      if(curvature>.001)velocity=Math.min(velocity,.76/curvature);
      if(this.facingReady){const desired=at(this.traveled),error=Math.abs(Math.atan2(Math.sin(desired-this.yaw),Math.cos(desired-this.yaw)));
        if(error>.18)velocity*=Math.max(.12,.18/error);
      }
    }
    let remaining=Math.max(0,velocity*dt),iterations=0;
    while(remaining>1e-6&&this.index<path.length&&iterations++<150){
      const next=path[this.index],dx=next[0]-this.position[0],dz=next[2]-this.position[2],dist=Math.hypot(dx,dz);
      if(dist<=remaining){this.position=[...next];remaining-=dist;this.traveled+=dist;this.index++;}
      else {const t=remaining/dist;
        this.position=[this.position[0]+dx*t,this.position[1],this.position[2]+dz*t];
        this.traveled+=remaining;remaining=0;}
    }
    if(!reversing){
      let look=this.index,acc=0,prev=this.position,target=path[Math.min(this.index,path.length-1)];
      while(look<path.length){target=path[look++];acc+=Math.hypot(target[0]-prev[0],target[2]-prev[2]);if(acc>=.65)break;prev=target;}
      const dx=target[0]-this.position[0],dz=target[2]-this.position[2];
      if(Math.hypot(dx,dz)>1e-5){const goal=Math.atan2(dx,dz);
        if(!this.facingReady){this.yaw=goal;this.facingReady=true;}
        else this.rotateToward(goal,dt);
      }
    }
    if(this.index>=path.length){
      if(this.phase==='arriving')this.phase='docked';
      else if(reversing){
        this.phase='turning';this.index=1;this.traveled=0;
        this.voyageLength=this.length(this.plan.turningArc??this.departure);
      }
      else if(isTurn){
        this.phase='departing';this.index=1;this.traveled=0;
        this.voyageLength=this.length(this.plan.outwardDeparture??this.departure);
      }
      else this.phase='gone';
    }
  }
}
