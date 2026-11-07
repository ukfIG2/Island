/** RRH SEA V4 shared deterministic kinematics: no React, no Core mutation.
 * Yaw is derived from route distance/tangent rather than chasing waypoints. */
import {sampleSeaRouteAt,type SeaPoint} from './seaCoastNavigation';
import {seaRouteLength,type SeaPose,type SeaNavigationPhase,type SeaVoyagePlan,type SeaArrivalPlan} from './seaManeuverPlanner';
const clamp=(x:number,a:number,b:number)=>Math.max(a,Math.min(b,x));
const angleDelta=(a:number,b:number)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
export class SeaManeuverController {
  phase:SeaNavigationPhase='OPEN_SEA_APPROACH';
  position:SeaPoint;
  yaw:number;
  private traveled=0;
  private readonly inboundLength:number;
  private readonly backLength:number;
  private readonly outboundLength:number;
  constructor(readonly plan:SeaArrivalPlan,readonly speed=plan.profile.forwardSpeed){
    this.position=[...plan.arrival[0]];
    this.inboundLength=seaRouteLength(plan.arrival);
    this.backLength='reverse' in plan?seaRouteLength((plan as SeaVoyagePlan).reverse):0;
    this.outboundLength='departure' in plan?seaRouteLength((plan as SeaVoyagePlan).departure):0;
    this.yaw=this.poseAt(plan.arrival,0).heading;
  }
  private poseAt(path:readonly SeaPoint[],distance:number):SeaPose {
    const total=path===this.plan.arrival?this.inboundLength:
      path===(this.plan as SeaVoyagePlan).reverse?this.backLength:this.outboundLength;
    const s=sampleSeaRouteAt(path,total>0?clamp(distance/total,0,1):0);
    return {position:s.position,heading:Math.atan2(s.direction[0],s.direction[1])+this.plan.profile.bowAxisOffset};
  }
  /** Stable spatial preview, reused by production SeaCraft presentation. */
  previewArrival(fraction:number):SeaPose {
    return this.poseAt(this.plan.arrival,this.inboundLength*clamp(fraction,0,1));
  }
  depart():void {
    if(this.phase!=='DOCKED')throw Error('SEA_V4_DEPART_BEFORE_DOCKED');
    if(!('reverse' in this.plan))throw Error('SEA_V4_ARRIVAL_ONLY_HAS_NO_DEPARTURE');
    this.phase='REVERSE_UNDOCK';this.traveled=0;
  }
  tick(seconds:number):void {
    if(!Number.isFinite(seconds)||seconds<0)throw Error('SEA_V4_BAD_DELTA');
    if(this.phase==='DOCKED'||this.phase==='COMPLETE'||seconds===0)return;
    // Deterministic capped substeps prevent large-frame skip over a phase.
    let remaining=Math.min(seconds,.5),steps=0;
    while(remaining>1e-9 && steps++<16){
      const dt=Math.min(.04,remaining);remaining-=dt;
      this.advance(dt);
      if(['DOCKED','COMPLETE'].includes(this.phase))break;
    }
  }
  private advance(dt:number):void {
    const full=this.plan as SeaVoyagePlan;
    const backing=this.phase==='REVERSE_UNDOCK';
    const outbound=this.phase==='TURNOUT'||this.phase==='OPEN_SEA_DEPARTURE';
    const path=backing?full.reverse:outbound?full.departure:this.plan.arrival;
    const length=backing?this.backLength:outbound?this.outboundLength:this.inboundLength;
    const profile=this.plan.profile;
    // Speed modulation on a continuous distance-parametrized curve.
    let velocity=backing?profile.reverseSpeed:Math.min(this.speed,profile.forwardSpeed);
    const slowIn=clamp(this.traveled/Math.max(.2,backing ? .6 : 1.2),0,1);
    const slowOut=clamp((length-this.traveled)/Math.max(.2,backing ? .6 : 1.2),0,1);
    velocity*=.22+.78*Math.min(slowIn,slowOut);
    if(!backing){
      const h=.22,s0=this.poseAt(path,this.traveled-h).heading,s1=this.poseAt(path,this.traveled+h).heading;
      const curvature=Math.abs(angleDelta(s1,s0))/(2*h);
      if(curvature>.0001)velocity=Math.min(velocity,profile.maxYawRate/curvature);
    }
    let next=clamp(this.traveled+velocity*dt,0,length);
    if(!backing){
      const maxStep=profile.maxYawRate*dt;
      const currentYaw=this.yaw;
      const directionChange=(distance:number)=>Math.abs(angleDelta(this.poseAt(path,distance).heading,currentYaw));
      if(directionChange(next)>maxStep){
        // Reduce *distance*, not just yaw: a ship must not slide sideways
        // while its bow catches up with its intended route tangent.
        let lo=this.traveled,hi=next;
        for(let i=0;i<25;i++){
          const mid=(lo+hi)*.5;
          if(directionChange(mid)<=maxStep)lo=mid;else hi=mid;
        }
        next=lo;
        if(next<=this.traveled+1e-9)throw Error('SEA_V4_NONCONTINUOUS_HEADING');
      }
    }
    this.traveled=next;
    const pose=this.poseAt(path,this.traveled);
    this.position=[...pose.position];
    if(!backing)this.yaw=pose.heading;
    else {
      // The continuous start tangent of the U-turn may differ slightly from
      // the averaged final docking tangent. Align across the entire reverse
      // corridor, not in one instantaneous yaw jump at the lens trigger.
      const turnYaw=this.poseAt(full.departure,0).heading;
      const dockYaw=this.plan.dockPose.heading;
      const t=this.backLength>0?clamp(this.traveled/this.backLength,0,1):1;
      const ease=t*t*(3-2*t);
      this.yaw=dockYaw+angleDelta(turnYaw,dockYaw)*ease;
    }
    if(!backing && !outbound){
      this.phase=this.traveled>=this.plan.lensBoundaryDistance?'DOCKING':
        this.traveled>=this.plan.lensBoundaryDistance-.55?'LENS_ENTRY':'OPEN_SEA_APPROACH';
    } else if(outbound) {
      this.phase=this.traveled>=full.turnBoundaryDistance?'OPEN_SEA_DEPARTURE':'TURNOUT';
    }
    if(this.traveled+1e-7>=length){
      if(backing){this.phase='TURNOUT';this.traveled=0;}
      else if(outbound){this.phase='COMPLETE';}
      else{this.phase='DOCKED';}
    }
  }
}
