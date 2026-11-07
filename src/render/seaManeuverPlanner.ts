/** RRH SEA V4. Geometry and maneuver phases are presentation-only.
 * No game Core state and no alternate PMO data. A failed collision certificate
 * is a planning error, NEVER permission to use the old circular route. */
import type {IslandWaterBoundary} from './islandWaterBoundary';
import {makeSeaBeachArc,withSeaBeachArc} from './seaBeachCollisionArc';
import {routeOnSea,
  sampleSeaClearance, sampleSeaPaintTarget, sampleSeaRouteAt, seaIslandFootprint,
  seaOffshoreUTurn, seaScaledIslandOutline, seaSegmentClear,
  smoothSeaRoute, type SeaContourInput, type SeaPoint} from './seaCoastNavigation';

export type SeaNavigationPhase = 'OPEN_SEA_APPROACH'|'LENS_ENTRY'|'DOCKING'|
  'DOCKED'|'REVERSE_UNDOCK'|'TURNOUT'|'OPEN_SEA_DEPARTURE'|'COMPLETE';
export interface SeaVesselProfile {
  readonly hullLength:number;
  readonly beam:number;
  /** A soft maneuver design target: no polygon-corner rotation of hull. */
  readonly minTurnRadius:number;
  readonly maxYawRate:number;
  readonly forwardSpeed:number;
  readonly reverseSpeed:number;
  /** +Z hull: 0. +X hull: -Math.PI/2 in THREE Y rotation. */
  readonly bowAxisOffset:number;
}
export const RRH_FERRY_PROFILE:SeaVesselProfile={hullLength:2.50,beam:1.30,
  minTurnRadius:1.15,maxYawRate:.72,forwardSpeed:2.2,reverseSpeed:.70,bowAxisOffset:0};
export const RRH_CRAFT_PROFILE:SeaVesselProfile={hullLength:2.50,beam:1.02,
  minTurnRadius:1.05,maxYawRate:.85,forwardSpeed:2.1,reverseSpeed:.65,bowAxisOffset:-Math.PI/2};
export interface SeaPose {readonly position:SeaPoint;readonly heading:number;}
export interface SeaManeuverSegment {readonly phase:SeaNavigationPhase;
  readonly gear:'FORWARD'|'REVERSE';readonly path:readonly SeaPoint[];readonly maxSpeed:number;}
export interface SeaArrivalPlan {
  readonly version:'RRH_SEA_V4';readonly incoming:SeaPoint;readonly outgoing:SeaPoint;
  readonly brushTarget:SeaPoint;readonly dockPose:SeaPose;readonly lensEntry:SeaPose;
  readonly lensArc:readonly SeaPoint[];readonly lensAnchor:SeaPoint;readonly collisionOutline:readonly SeaPoint[];
  readonly beachCollisionArc:readonly SeaPoint[];readonly routingBoundary:IslandWaterBoundary;
  readonly arrival:readonly SeaPoint[];readonly lensBoundaryDistance:number;
  readonly profile:SeaVesselProfile;
}
export interface SeaVoyagePlan extends SeaArrivalPlan {
  readonly reverseExit:SeaPose;readonly reverse:readonly SeaPoint[];
  readonly turning:readonly SeaPoint[];readonly departure:readonly SeaPoint[];
  readonly turnBoundaryDistance:number;readonly segments:readonly SeaManeuverSegment[];
}
const distance=(a:readonly number[],b:readonly number[])=>Math.hypot(a[0]-b[0],a[2]-b[2]);
const heading=(a:SeaPoint,b:SeaPoint)=>Math.atan2(b[0]-a[0],b[2]-a[2]);
export const seaRouteLength=(path:readonly SeaPoint[])=>path.slice(1).reduce((sum,p,i)=>sum+distance(p,path[i]),0);
const turnError=(a:number,b:number)=>Math.abs(Math.atan2(Math.sin(a-b),Math.cos(a-b)));
export function sampleSeaPose(path:readonly SeaPoint[],fraction:number,bowAxisOffset=0):SeaPose {
  const sample=sampleSeaRouteAt(path,Math.min(1,Math.max(0,fraction)));
  return {position:sample.position,heading:Math.atan2(sample.direction[0],sample.direction[1])+bowAxisOffset};
}
/** Hull footprint sampling along the whole path. The SDF is the 1.30x
 * silhouette. Extra clearance is for the hull, not a fabricated new island. */
export function certifySeaHull(boundary:IslandWaterBoundary,path:readonly SeaPoint[],
  profile:SeaVesselProfile,safety=.12):boolean {
  if(path.length<2)return false;
  // Reuse arc-length data: certify every identical swept-hull sample in one pass.
  const distances:number[]=[0];
  for(let i=1;i<path.length;i++)distances.push(distances[i-1]+distance(path[i-1],path[i]));
  const total=distances[distances.length-1];
  if(total<.001)return false;
  const step=Math.max(.025,Math.min(.12,profile.hullLength/16));
  const last=distances.length-1;
  let centerIndex=1,beforeIndex=1,afterIndex=1;
  const positionAt=(target:number,index:number):SeaPoint=>{
    const a=path[index-1],b=path[index],leg=distances[index]-distances[index-1];
    const t=leg<1e-8?0:(target-distances[index-1])/leg;
    return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
  };
  const directionPointAt=(target:number,index:number):[number,number]=>{
    const a=path[index-1],b=path[index];
    const t=(target-distances[index-1])/Math.max(1e-9,distances[index]-distances[index-1]);
    return [a[0]+(b[0]-a[0])*t,a[2]+(b[2]-a[2])*t];
  };
  for(let i=0,n=Math.ceil(total/step);i<=n;i++){
    const target=i/n*total;
    const before=Math.max(0,target-.28),after=Math.min(total,target+.28);
    while(centerIndex<last&&distances[centerIndex]<target)centerIndex++;
    while(beforeIndex<last&&distances[beforeIndex]<before)beforeIndex++;
    while(afterIndex<last&&distances[afterIndex]<after)afterIndex++;
    const position=positionAt(target,centerIndex);
    const r=directionPointAt(before,beforeIndex),f=directionPointAt(after,afterIndex);
    const norm=Math.hypot(f[0]-r[0],f[1]-r[1])||1;
    const ux=(f[0]-r[0])/norm,uz=(f[1]-r[1])/norm;
    const vx=-uz,vz=ux;
    const pose={position};
    for(const fore of [-profile.hullLength*.5,0,profile.hullLength*.5]){
      for(const side of [-profile.beam*.5,0,profile.beam*.5]){
        const x=pose.position[0]+ux*fore+vx*side,z=pose.position[2]+uz*fore+vz*side;
        if(sampleSeaClearance(boundary,x,z)<safety)return false;
      }
    }
  }
  return true;
}
/** Reject heading reversals and turns narrower than the design corridor;
 * speed control alone cannot make a discontinuous curve physically valid. */
export function certifySeaHeading(path:readonly SeaPoint[],minRadius:number):boolean {
  const length=seaRouteLength(path),step=.075;
  if(length<.001)return false;
  const limit=Math.max(1.8,step/Math.max(.1,minRadius)+.085);
  let prev=sampleSeaRouteAt(path,0).direction;
  for(let d=step;d<length+step;d+=step){
    const dir=sampleSeaRouteAt(path,Math.min(1,d/length)).direction;
    const yaw1=Math.atan2(dir[0],dir[1]),yaw0=Math.atan2(prev[0],prev[1]);
    if(turnError(yaw1,yaw0)>limit)return false;
    prev=dir;
  }
  return true;
}
/** Literal direct intent to the painted beach target is authoritative; a
 * collision-aware detour is built to the offshore maneuver lens, then the
 * physical hull approaches bow-first on the final certified corridor. */
export function planSeaArrivalV4(contour:SeaContourInput,incoming:SeaPoint,
  profile:SeaVesselProfile=RRH_FERRY_PROFILE):SeaArrivalPlan {
  const originalBoundary=contour.boundary;
  // A real navigation obstacle on BOTH flanks, derived from authored beach paint.
  // No global/implicit boundary mutation: every planner receives an explicit mask.
  const clearance=Math.max(contour.clearance??1.45,profile.hullLength*.5+profile.beam*.5+.4);
  if(!contour.beachStrokes.length)throw Error('SEA_PMO_BEACH_PAINT_MISSING');
  const beachArc=makeSeaBeachArc(originalBoundary,contour.beachStrokes,
    seaIslandFootprint(originalBoundary),profile.beam,clearance);
  const boundary=withSeaBeachArc(originalBoundary,beachArc);
  const brushTarget=sampleSeaPaintTarget(contour.beachStrokes,contour.random??Math.random);
  if(sampleSeaClearance(boundary,incoming[0],incoming[2])<clearance)
    throw Error('SEA_V42_INCOMING_IN_COLLISION');
  const [ux,uz]=beachArc.offshore;
  // DOCK MUST BE ON A BEACH-NORMAL. SDF-gradient docking allowed the model
  // to park sideways against arbitrary side features of the terrain.
  let dock:SeaPoint|null=null;
  for(let d=.2;d<=10;d+=.08){
    const p:SeaPoint=[brushTarget[0]+ux*d,-2.35,brushTarget[2]+uz*d];
    if(sampleSeaClearance(boundary,p[0],p[2])>=clearance+.10){dock=p;break;}
  }
  if(!dock)throw Error('SEA_V43_NO_BOW_FIRST_BERTH');
  // Never call an offshore arc-mouth stop a valid beach landing. The real
  // beach paint is the destination; navigation failure must remain visible.
  const berthOffset=distance(brushTarget,dock);
  if(berthOffset>3.50)throw Error('SEA_V43_BERTH_TOO_FAR_FROM_PMO: '+berthOffset.toFixed(2));
  // The gate is outside the OPEN seaward mouth of the U barrier.
  // The last approach leg is forced to face the PMO, not whatever tangent
  // a generic smoothed A* route happened to finish with.
  const beachV=(brushTarget[0]-beachArc.center[0])*ux+
    (brushTarget[2]-beachArc.center[2])*uz;
  const gateDistance=beachArc.offshoreLength+profile.minTurnRadius*2.4+clearance+1.0-beachV;
  const lensPoint:SeaPoint=[brushTarget[0]+ux*gateDistance,-2.35,brushTarget[2]+uz*gateDistance];
  let dockDistance=(dock[0]-brushTarget[0])*ux+(dock[2]-brushTarget[2])*uz;
  if(gateDistance-dockDistance<2.0)throw Error('SEA_V42_DOCK_TOO_CLOSE_TO_LENS');
  if(!seaSegmentClear(boundary,lensPoint,dock,clearance))
    throw Error('SEA_V42_BEACH_APPROACH_NOT_CLEAR');
  const towardLens=routeOnSea(boundary,incoming,lensPoint,clearance);
  const planApproach=(d:number,berth:SeaPoint):SeaPoint[]=>{
    const leadDistance=d+Math.max(1.35,(gateDistance-d)*.42);
    const lead:SeaPoint=[brushTarget[0]+ux*leadDistance,-2.35,brushTarget[2]+uz*leadDistance];
    return smoothSeaRoute(boundary,[...towardLens,lead,berth],clearance);
  };
  let arrival=planApproach(dockDistance,dock);
  if(!certifySeaHull(boundary,arrival,profile)){
    // Centerline clearance alone can admit a bow that crosses a peninsula.
    // Retreat only along the certified PMO normal; never bypass hull checks.
    let certified=false;
    // One bounded offshore fallback avoids repeated costly curve replanning.
    // Its complete centerline and swept hull must still be certified.
    for(const d of [3.50]){
      if(d<=dockDistance)continue;
      const berth:SeaPoint=[brushTarget[0]+ux*d,-2.35,brushTarget[2]+uz*d];
      if(gateDistance-d<2.0||sampleSeaClearance(boundary,berth[0],berth[2])<clearance+.10||
        !seaSegmentClear(boundary,lensPoint,berth,clearance))continue;
      // Cheap conservative precheck along the final bow-first approach.
      // It only rejects candidates; full swept-hull certification remains mandatory.
      let nearBerthClear=true;
      for(const advance of [0,.45,.90])for(const fore of [-1,0,1])for(const side of [-1,0,1]){
        const depth=d+advance-fore*profile.hullLength*.5;
        const lateral=side*profile.beam*.5;
        const x=brushTarget[0]+ux*depth+uz*lateral;
        const z=brushTarget[2]+uz*depth-ux*lateral;
        if(sampleSeaClearance(boundary,x,z)<.12)nearBerthClear=false;
      }
      if(!nearBerthClear)continue;
      let candidate:SeaPoint[];
      try{candidate=planApproach(d,berth);}
      catch(error){
        if(error instanceof Error&&error.message.startsWith('SEA_JOIN_SMOOTHING_NOT_CERTIFIED'))continue;
        throw error;
      }
      if(!certifySeaHull(boundary,candidate,profile))continue;
      dock=berth;dockDistance=d;arrival=candidate;certified=true;break;
    }
    if(!certified)throw Error('SEA_V42_ARRIVAL_HULL_COLLISION');
  }
  const dockPose=sampleSeaPose(arrival,1,profile.bowAxisOffset);
  const requiredHeading=Math.atan2(-ux,-uz)+profile.bowAxisOffset;
  if(turnError(requiredHeading,dockPose.heading)>.12)
    throw Error('SEA_V42_NOT_BOW_FIRST_AT_BEACH');
  const lens=Array.from({length:41},(_,i):SeaPoint=>{
    const t=i/20-1;
    const bulge=.55*(1-t*t);
    return [beachArc.center[0]+ux*(beachArc.offshoreLength+profile.minTurnRadius*2.4+clearance+1.0+bulge)+beachArc.lateral[0]*t*beachArc.halfWidth*2,
      -2.35,
      beachArc.center[2]+uz*(beachArc.offshoreLength+profile.minTurnRadius*2.4+clearance+1.0+bulge)+beachArc.lateral[1]*t*beachArc.halfWidth*2];
  });
  const lensBoundaryDistance=Math.max(0,seaRouteLength(arrival)-distance(lensPoint,dock));
  const lensEntry=sampleSeaPose(arrival,lensBoundaryDistance/seaRouteLength(arrival),profile.bowAxisOffset);
  return {version:'RRH_SEA_V4',incoming,outgoing:incoming,brushTarget,dockPose,lensEntry,
    lensArc:lens,lensAnchor:lensPoint,collisionOutline:seaScaledIslandOutline(originalBoundary),arrival,
    beachCollisionArc:beachArc.outline,routingBoundary:boundary,lensBoundaryDistance,profile};
}
export function planSeaManeuverV4(contour:SeaContourInput,
  incoming:SeaPoint,outgoing:SeaPoint,profile:SeaVesselProfile=RRH_FERRY_PROFILE):SeaVoyagePlan {
  const base=planSeaArrivalV4(contour,incoming,profile);
  const boundary=base.routingBoundary;
  const dock=base.dockPose.position;
  const lensPoint=base.lensAnchor;
  const clearance=Math.max(contour.clearance??1.45,profile.hullLength*.5+profile.beam*.5+.4);
  if(sampleSeaClearance(boundary,outgoing[0],outgoing[2])<clearance)
    throw Error('SEA_V4_OUTGOING_IN_COLLISION');
  const reverse:[SeaPoint,SeaPoint]=[dock,lensPoint];
  if(!seaSegmentClear(boundary,dock,lensPoint,clearance))throw Error('SEA_V4_REVERSE_CORRIDOR_COLLISION');
  const turning=seaOffshoreUTurn(boundary,lensPoint,dock,outgoing,clearance,(arc,outbound)=>{
    try {
      const path=smoothSeaRoute(boundary,[...arc,...outbound],clearance);
      return certifySeaHeading(path,profile.minTurnRadius)&&certifySeaHull(boundary,path,profile);
    }catch {return false;}
  });
  // Smooth across the U-turn/outbound connection as ONE physical line. The
  // distance threshold retains the separate semantic phase.
  const departure=smoothSeaRoute(boundary,[...turning.arc,...turning.outbound],clearance);
  const dockPose=base.dockPose;
  const lensEntry=base.lensEntry;
  const reverseExit:SeaPose={position:lensPoint,heading:dockPose.heading};
  const initialTurn=sampleSeaPose(departure,0);
  if(turnError(initialTurn.heading,dockPose.heading)>.27)
    throw Error('SEA_V4_TURN_START_HEADING_MISMATCH');
  if(!certifySeaHull(boundary,reverse,profile)||
     !certifySeaHull(boundary,departure,profile))
    throw Error('SEA_V4_HULL_COLLISION');
  // Smooth curve rather than a hard switch in orientation at the end of turn.
  const turnBoundaryDistance=seaRouteLength(turning.arc);
  const lensBoundaryDistance=base.lensBoundaryDistance;
  const segments:SeaManeuverSegment[]=[
    {phase:'OPEN_SEA_APPROACH',gear:'FORWARD',path:base.arrival,maxSpeed:profile.forwardSpeed},
    {phase:'REVERSE_UNDOCK',gear:'REVERSE',path:reverse,maxSpeed:profile.reverseSpeed},
    {phase:'TURNOUT',gear:'FORWARD',path:departure,maxSpeed:profile.forwardSpeed},
  ];
  return {...base,outgoing,reverseExit,reverse,turning:turning.arc,departure,turnBoundaryDistance,segments};
}
