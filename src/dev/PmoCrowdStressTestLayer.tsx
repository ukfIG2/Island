/** DEV-only physical crowd probe, in the canonical R3F island scene.
 * No tween bypass, teleport, dummy Core guests, or altered authoring.
 * A rider visibly leaves the layer only after the motor reports ARRIVED.
 */
import {useEffect,useMemo,useRef} from 'react';
import {PmoCrowdFerryTestLayer} from './PmoCrowdFerryTestLayer';
import type {SeaContourInput} from '../render/seaCoastNavigation';
import {useFrame} from '@react-three/fiber';
import * as THREE from 'three';
import type {BrushGraph,PmoTerrainConnector,SpatialPoint,PmoRouteHelper} from '../render/spatialMeta/pmoBrushCorridors';
import {planBrushCorridorRoute} from '../render/spatialMeta/pmoBrushCorridors';
import {createDevPedestrianMotor} from './createDevPedestrianMotor';
import type {PmoLiftTransit} from '../render/spatialMeta/pmoLiftTransit';
import type {TestBuilding} from './pmoDevBuildings';
import {certifyWalkMotion} from './pmoWalkMotionAudit';
import {PmoCrowdStressSession,type CrowdReport,CROWD_STRESS_COUNT} from './pmoCrowdStressSession';
import {selectDistributedCrowdStarts} from './pmoDistributedCrowdStarts';
import {selectPersonalCrowdRoutes} from './pmoCrowdPersonalRoutes';
import {crowdCollisionSpacing} from './pmoCrowdCollisionMode';
import {localQueueWanderPools} from './pmoCrowdQueueDiffusion';

interface Props {
  seaContour:SeaContourInput|null;
  graph:BrushGraph;connector:PmoTerrainConnector;beach:SpatialPoint;
  buildings:readonly TestBuilding[];
  samplePhysicalHelper:(helper:PmoRouteHelper,t:number,from:SpatialPoint,to:SpatialPoint,actorId?:string)=>SpatialPoint|null;
  liftTransit:PmoLiftTransit;
  onProgress:(report:CrowdReport)=>void;
}
const distance=(a:readonly number[],b:readonly number[])=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const horizontal=(a:readonly number[],b:readonly number[])=>Math.hypot(a[0]-b[0],a[2]-b[2]);
function PmoCrowdOriginalTestLayer({graph,connector,beach,buildings,samplePhysicalHelper,liftTransit,onProgress}:Props){
  const peopleRef=useRef<THREE.InstancedMesh>(null);
  const dummy=useMemo(()=>new THREE.Object3D(),[]);
  const guestColors=useMemo(()=>({queued:new THREE.Color('#75a9ff'),servicing:new THREE.Color('#eeb671'),waitingSpace:new THREE.Color('#ff6969'),waitingHelper:new THREE.Color('#facc64'),crossingHelper:new THREE.Color('#b29bff'),default:new THREE.Color('#72e9b7')}),[]);
  const publishClock=useRef(0),finalReported=useRef(false),lastCongestionLog=useRef(0),lastVariationLog=useRef(0);
  const prepared=useMemo(()=>{
    try {
      const physicallyPassable=(a:SpatialPoint,b:SpatialPoint)=>certifyWalkMotion(a,b,graph,connector)===null;
      // Geometrically separate launch points, tested against the SAME compiled PMO.
      const candidates=graph.nodes.filter(n=>n.point[1]<-1.65&&distance(n.point,beach)<1.05)
        .sort((a,b)=>distance(a.point,beach)-distance(b.point,beach));
      const beachNodes:SpatialPoint[]=[];
      for(const n of candidates){
        if(beachNodes.some(p=>horizontal(p,n.point)<0.16))continue;
        if(planBrushCorridorRoute(graph,connector,n.point,beach,0.26,physicallyPassable).status!=='READY')continue;
        beachNodes.push([...n.point]);if(beachNodes.length===16)break;
      }
      if(beachNodes.length<2)throw Error('CROWD_100_NO_CERTIFIED_BEACH_LAUNCHES');
      const targets:SpatialPoint[]=[];
      for(const site of buildings.filter(b=>b.routeStatus==='READY'&&b.arrivalPoint)){
        const p=site.arrivalPoint!;
        if(planBrushCorridorRoute(graph,connector,beach,p,0.26,physicallyPassable).status==='READY')targets.push([...p]);
      }
      if(targets.length<3)throw Error('CROWD_100_INSUFFICIENT_CERTIFIED_BUILDINGS:'+targets.length);
      // Rotating multiple beach launch nodes created head-on merges at the
      // only main stair. Select ONE certified lane whose full physical routes
      // reach every tested target. Do not create phantom shortcuts.
      const primaryLaunch=beachNodes.find(p=>targets.every(target=>
        planBrushCorridorRoute(graph,connector,p,target,0.26,physicallyPassable).status==='READY'));
      if(!primaryLaunch)throw Error('CROWD_100_NO_COMMON_CERTIFIED_BEACH_LANE');
      beachNodes.splice(0,beachNodes.length,primaryLaunch,primaryLaunch);

      // Whole-island PMO wandering; the motor certifies each individual route.
      const safeWanderNodes:SpatialPoint[]=[];
      const step=Math.max(1,Math.floor(graph.nodes.length/120));
      for(let n=0;n<graph.nodes.length;n+=step){
        const p=graph.nodes[n].point;
        if(distance(p,beach)<1.2||targets.some(s=>horizontal(p,s)<.55))continue;
        if(safeWanderNodes.some(q=>Math.abs(q[1]-p[1])<.2&&horizontal(q,p)<.55))continue;
        safeWanderNodes.push([...p]);
      }
      // Default is an ACTUAL 100-person concurrent island load probe.
      // `?crowd=beach` retains the already accepted 100-person single-lane
      // beach throughput test; these are different experiments.
      const distributed=typeof window==='undefined'||
        new URLSearchParams(window.location.search).get('crowd')!=='beach';
      const starts=distributed
        ?selectDistributedCrowdStarts(graph,connector,targets,physicallyPassable)
        :beachNodes;
      const individualized=distributed?selectPersonalCrowdRoutes(graph,connector,starts,targets,physicallyPassable):null;
      const {motor,liftBatch,variation}=createDevPedestrianMotor({graph,connector,liftTransit,samplePhysicalHelper,
        collisionSpacing:crowdCollisionSpacing(typeof window==='undefined'?'':window.location.search),synchronizedLift:true});
      if(!liftBatch||!variation)throw Error('CROWD_LAB_MOTOR_NOT_INITIALIZED');
      return {liftBatch,variation,session:new PmoCrowdStressSession(motor,starts,targets,CROWD_STRESS_COUNT,
        {startMode:distributed?'distributed':'beach',safeWanderNodes,
          wanderBySite:localQueueWanderPools(graph,targets),
          servicesEnabled:distributed,personalRoutes:individualized??undefined}),error:null as string|null};
    }catch(e){return {liftBatch:null,variation:null,session:null,error:String(e)};}
  },[graph,connector,beach,buildings,samplePhysicalHelper,liftTransit]);
  const {session,error,liftBatch,variation}=prepared;
  useEffect(()=>{
    if(error){console.error('PMO_CROWD_100_BLOCKED',error);
      onProgress({phase:'blocked',total:100,launched:0,active:0,waitingSpace:0,pendingBeach:100,
        arrived:0,blocked:1,peakActive:0,peakWaitingSpace:0,seconds:0,error,
        bottleneckQueue:0,bottleneckOccupied:0,deferredByCapacity:0,replans:0,wanders:0,criticalWaiters:0,congestionWitness:null});}
    else if(session){console.info('RRH_PMO_PEDESTRIAN_SPATIAL_V1_ACTIVE', {mode:'stress',wanderNodes:session.report().wanders});console.info('PMO_CROWD_100_READY',session.report(), 'GUEST_COLLISION_SPACING', crowdCollisionSpacing(typeof window==='undefined'?'':window.location.search));onProgress(session.report());}
  },[session,error]);
  useEffect(()=>()=>{session?.dispose();liftBatch?.reset();},[session,liftBatch]);
  useFrame((_,delta)=>{
    if(!session)return;
    const dt=Math.max(.002,Math.min(.05,delta));
    try {liftBatch?.tick(dt);session.tick(dt);}catch(e){session.abort(String(e));}
    const mesh=peopleRef.current;
    if(mesh){
      const people=[...session.motor.snapshots(),...session.serviceVisuals()];mesh.count=Math.min(people.length,CROWD_STRESS_COUNT);
      for(let i=0;i<mesh.count;i++){
        const a=people[i];
        // Ten distinct visible seats in a shared moving cabin;
        // the motor's certified actor position remains exactly on the car.
        const seat=a.status==='crossing-helper'?liftBatch?.seat(a.id):null;
        const ox=seat===null||seat===undefined?0:(seat%2===0?-.050:.050);
        const oz=seat===null||seat===undefined?0:(Math.floor(seat/2)-2)*.060;
        dummy.position.set(a.position[0]+ox,a.position[1]+0.12,a.position[2]+oz);
        dummy.rotation.set(0,0,0);
        // Stable per-person size and gait diversity (no extra physical moves).
        const ordinal=Number(a.id.slice(-3))||0;
        dummy.scale.setScalar(.83+(ordinal%9)*.046);dummy.updateMatrix();
        mesh.setMatrixAt(i,dummy.matrix);
        mesh.setColorAt(i,a.status==='queued'?guestColors.queued:a.status==='servicing'?guestColors.servicing:a.status==='waiting-space'?guestColors.waitingSpace:a.status==='waiting-helper'?guestColors.waitingHelper:a.status==='crossing-helper'?guestColors.crossingHelper:guestColors.default);
      }
      mesh.instanceMatrix.needsUpdate=true;
      if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
    }
    publishClock.current+=dt;
    // Diagnostics/panel projection are DEV-only and sampled at 0.6s,
    // never recomputed for all 100 actors on every render frame.
    const terminal=session.phase==='complete'||session.phase==='blocked';
    if(publishClock.current>=0.6||(terminal&&!finalReported.current)){
      publishClock.current=0;
      const diagnostic=session.report();
      if(diagnostic.seconds-lastVariationLog.current>=10){
        lastVariationLog.current=diagnostic.seconds;
        console.info('PMO_CROWD_V5_LIVE', {launched:diagnostic.launched,active:diagnostic.active,
          arrived:diagnostic.arrived,blocked:diagnostic.blocked,
          physicalWaypointJitter:variation?.stats,liftBatches:liftBatch?.stats()});
      }
      if(diagnostic.congestionWitness&&diagnostic.criticalWaiters>0&&diagnostic.seconds-lastCongestionLog.current>=8){
        lastCongestionLog.current=diagnostic.seconds;
        console.warn('PMO_CROWD_100_CONGESTION',diagnostic.congestionWitness,diagnostic);
      }
      if(terminal&&!finalReported.current)console.info('PMO_CROWD_VARIATION_AND_LIFT_BATCH',
        {routeJitter:variation?.stats,lifts:liftBatch?.stats()});
      onProgress(diagnostic);
      if(terminal)finalReported.current=true;
    }
  });
  return session?<group name="pmo-physical-crowd-stress-100">
    <instancedMesh ref={peopleRef} args={[undefined,undefined,CROWD_STRESS_COUNT]} count={0} frustumCulled={false}>
      <capsuleGeometry args={[0.047,0.11,4,7]}/><meshStandardMaterial color="white" roughness={0.64}/>
    </instancedMesh>
  </group>:null;
}

/** A separate full ferry cycle; existing distributed and beach tests unchanged. */
export function PmoCrowdStressTestLayer(props:Props){
  return typeof window!=='undefined'&&new URLSearchParams(window.location.search).get('crowd')==='transport'
    ? <PmoCrowdFerryTestLayer {...props}/> : <PmoCrowdOriginalTestLayer {...props}/>;
}
