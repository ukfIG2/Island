/** Separate 100-person full sea/land/sea test, sharing real PMO motor,
 * authored lift car, route variation and canonical water annulus. */
import {useEffect,useMemo,useRef} from 'react';
import {useFrame,useThree} from '@react-three/fiber';
import * as THREE from 'three';
import type {BrushGraph,PmoTerrainConnector,SpatialPoint,PmoRouteHelper} from '../render/spatialMeta/pmoBrushCorridors';
import {planBrushCorridorRoute} from '../render/spatialMeta/pmoBrushCorridors';
import {createDevPedestrianMotor} from './createDevPedestrianMotor';
import type {PmoLiftTransit} from '../render/spatialMeta/pmoLiftTransit';
import type {TestBuilding} from './pmoDevBuildings';
import {certifyWalkMotion} from './pmoWalkMotionAudit';
import {PmoCrowdFerrySession,type FerryReport} from './pmoCrowdFerrySession';
import {buildCrowdSpatialPlan} from './pmoCrowdSpatialTargets';
import {crowdCollisionSpacing} from './pmoCrowdCollisionMode';
import {planFullWaveSeaRoute,RRH_SAFE_WATER_RADIUS,RRH_SEA_LEVEL,type WaterPoint} from './pmoFullWaveWaterRoute';
import type {CrowdReport} from './pmoCrowdStressSession';
import type {SeaContourInput} from '../render/seaCoastNavigation';
import {PmoSeaRouteOverlay} from './PmoSeaRouteOverlay';
interface Props {seaContour:SeaContourInput|null;graph:BrushGraph;connector:PmoTerrainConnector;beach:SpatialPoint;buildings:readonly TestBuilding[];
  samplePhysicalHelper:(helper:PmoRouteHelper,t:number,from:SpatialPoint,to:SpatialPoint,actorId?:string)=>SpatialPoint|null;
  liftTransit:PmoLiftTransit;onProgress:(report:CrowdReport)=>void;}
const d3=(a:readonly number[],b:readonly number[])=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
function cameraEdge(camera:THREE.Camera,edge:number,t:number):WaterPoint {
  const xy=edge===0?[1.28,t]:edge===1?[-1.28,t]:edge===2?[t,1.28]:[t,-1.28];
  const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(xy[0],xy[1]),camera);
  const k=(RRH_SEA_LEVEL-ray.ray.origin.y)/ray.ray.direction.y;
  let x:number,z:number;
  if(Number.isFinite(k)&&k>0){x=ray.ray.origin.x+k*ray.ray.direction.x;z=ray.ray.origin.z+k*ray.ray.direction.z;}
  else {const a=edge*Math.PI/2;x=15*Math.cos(a);z=15*Math.sin(a);}
  const mag=Math.hypot(x,z)||1,rad=Math.max(RRH_SAFE_WATER_RADIUS+0.6,Math.min(18,mag));
  return [rad*x/mag,RRH_SEA_LEVEL,rad*z/mag];
}
export function PmoCrowdFerryTestLayer({seaContour,graph,connector,beach,buildings,samplePhysicalHelper,liftTransit,onProgress}:Props){
  const camera=useThree(s=>s.camera);
  const figures=useRef<THREE.InstancedMesh>(null),ship=useRef<THREE.Group>(null);
  const dummy=useMemo(()=>new THREE.Object3D(),[]);const last=useRef(0),ended=useRef(false),lastDiagnostic=useRef(0);
  const guestColors=useMemo(()=>({outbound:new THREE.Color('#6cebbc'),service:new THREE.Color('#e7b162'),queue:new THREE.Color('#80b7fe'),served:new THREE.Color('#e0bdff'),default:new THREE.Color('#d8ece0')}),[]);
  const prepared=useMemo(()=>{
    try {
      const safe=(a:SpatialPoint,b:SpatialPoint)=>certifyWalkMotion(a,b,graph,connector)===null;
      const targets=buildings.filter(b=>b.routeStatus==='READY'&&b.arrivalPoint).map(b=>[...b.arrivalPoint!] as SpatialPoint)
        .filter(p=>planBrushCorridorRoute(graph,connector,beach,p,.26,safe).status==='READY' &&
          planBrushCorridorRoute(graph,connector,p,beach,.26,safe).status==='READY');
      if(targets.length<3)throw Error('FERRY_100_NEEDS_THREE_TWO_WAY_SERVICES');
      const launch=graph.nodes.filter(n=>n.point[1]<-1.65&&d3(n.point,beach)<1.05)
        .sort((a,b)=>d3(a.point,beach)-d3(b.point,beach)).find(n=>targets.every(p=>
          planBrushCorridorRoute(graph,connector,n.point,p,.26,safe).status==='READY'&&
          planBrushCorridorRoute(graph,connector,p,n.point,.26,safe).status==='READY'))?.point;
      if(!launch)throw Error('FERRY_100_NO_COMMON_BIDIRECTIONAL_BEACH_LANE');
      if(!seaContour)throw Error('RRH_SEA_V41_NO_BOUNDARY_OR_PMO_STROKES');
      camera.updateWorldMatrix(true,false);
      const entry=Math.floor(Math.random()*4),exit=(entry+1+Math.floor(Math.random()*3))%4;
      const plan=planFullWaveSeaRoute(beach,cameraEdge(camera,entry,Math.random()*1.4-.7),
        cameraEdge(camera,exit,Math.random()*1.4-.7),entry%2===0,seaContour);
      if(plan.pipeline!=='PMO_COLLISION_LENS_REVERSE_V4'||!plan.v4)
        throw Error('RRH_SEA_V41_LEGACY_FALLBACK_FORBIDDEN');
      console.info('RRH_SEA_CROWD_V41_WIRED', {pipeline:plan.pipeline,
        shoreSignature:seaContour.boundary.sourceSignature,brushStrokes:seaContour.beachStrokes.length,
        lensTrigger:plan.v4.lensEntry.position});
      const spatial=buildCrowdSpatialPlan(graph,connector,[...launch],targets,100,safe);
      console.info('RRH_PMO_PEDESTRIAN_SPATIAL_V1_ACTIVE', {separatedServices:spatial.separatedServices,
        separatedBeach:spatial.separatedBeach,wanders:spatial.wanders.length});
      const {motor,liftBatch,variation}=createDevPedestrianMotor({graph,connector,liftTransit,samplePhysicalHelper,
        collisionSpacing:crowdCollisionSpacing(typeof window==='undefined'?'':window.location.search),synchronizedLift:true});
      if(!liftBatch||!variation)throw Error('FERRY_LAB_MOTOR_NOT_INITIALIZED');
      return {session:new PmoCrowdFerrySession(motor,targets,[...launch],plan,100,spatial),liftBatch,variation,spatial,error:null as string|null};
    }catch(e){return {session:null,liftBatch:null,variation:null,spatial:null,error:String(e)};}
  },[graph,connector,beach,buildings,samplePhysicalHelper,liftTransit,camera,seaContour]);
  const {session,liftBatch,variation,spatial,error}=prepared;
  const emit=(r:FerryReport):CrowdReport=>({mode:'transport',phase:r.phase==='complete'?'complete':r.phase==='blocked'?'blocked':'running',
    total:100,launched:r.disembarked,active:r.moving+r.returning,
    waitingSpace:r.waitingSpace,pendingBeach:r.aboard,arrived:r.visited,blocked:r.blocked,peakActive:r.peakMoving,
    peakWaitingSpace:0,seconds:r.seconds,error:r.error,bottleneckQueue:0,bottleneckOccupied:0,
    deferredByCapacity:0,congestionWitness:null,replans:0,wanders:r.wanders??0,criticalWaiters:0,
    serviceQueued:r.queued,serviceActive:r.servicing,served:r.visited,transport:r});
  useEffect(()=>{
    if(error){console.error('PMO_FERRY_100_PREP_FAILED',error);onProgress({mode:'transport',phase:'blocked',total:100,
      launched:0,active:0,waitingSpace:0,pendingBeach:100,arrived:0,blocked:1,peakActive:0,
      peakWaitingSpace:0,seconds:0,error,bottleneckQueue:0,bottleneckOccupied:0,deferredByCapacity:0,
      congestionWitness:null,replans:0,wanders:0,criticalWaiters:0});}
    else if(session){console.info('PMO_FERRY_100_READY',session.report());onProgress(emit(session.report()));}
  },[session,error]);
  useEffect(()=>()=>{session?.dispose();liftBatch?.reset();},[session,liftBatch]);
  useFrame((_,delta)=>{
    if(!session)return;
    const dt=Math.min(.05,Math.max(.002,delta));
    try{liftBatch?.tick(dt);session.tick(dt);}catch(e){session.abort(String(e));}
    const mesh=figures.current,visible=session.visualGuests();
    if(mesh){mesh.count=Math.min(100,visible.length);
      for(let i=0;i<mesh.count;i++){
        const v=visible[i];
        const seat=liftBatch?.seat(v.id);
        dummy.position.set(v.position[0]+(seat===null||seat===undefined?0:seat%2===0?-.05:.05),
          v.position[1]+.12,v.position[2]+(seat===null||seat===undefined?0:(Math.floor(seat/2)-2)*.06));
        dummy.rotation.set(0,0,0);dummy.scale.setScalar(.85+(i%8)*.04);dummy.updateMatrix();
        mesh.setMatrixAt(i,dummy.matrix);
        mesh.setColorAt(i,v.phase==='outbound'?guestColors.outbound:v.phase==='service'?guestColors.service:v.phase==='queue'?guestColors.queue:v.phase==='served'?guestColors.served:guestColors.default);
      }
      mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
    }
    if(ship.current){ship.current.position.set(...session.boat.position);ship.current.rotation.y=session.boat.yaw;
      ship.current.visible=session.boat.phase!=='gone';}
    last.current+=dt;
    if(session.report().seconds-lastDiagnostic.current>=10){
      const report=session.report();lastDiagnostic.current=report.seconds;
      const standing=session.visualGuests().filter(g=>g.phase==='queue'||g.phase==='service');
      let stackedPairs=0,minimumSeparation=Infinity;
      for(let a=0;a<standing.length;a++)for(let b=a+1;b<standing.length;b++){
        const x=standing[a].position,z=standing[b].position;
        if(Math.abs(x[1]-z[1])>.18)continue;
        const distance=Math.hypot(x[0]-z[0],x[2]-z[2]);
        minimumSeparation=Math.min(minimumSeparation,distance);
        if(distance<.085)stackedPairs++;
      }
      console.info('RRH_PMO_PEDESTRIAN_V13_LIVE',{
        launched:report.disembarked,queued:report.queued,servicing:report.servicing,
        wanders:report.wanders,routeVariation:variation?.stats,
        queuePositions:{visible:standing.length,stackedPairs,minimumSeparation:Number.isFinite(minimumSeparation)?minimumSeparation:null},
        endpointSpacing:{separatedServices:spatial?.separatedServices,separatedBeach:spatial?.separatedBeach},
      });
    }
    if(last.current>.6||(!ended.current&&(session.phase==='complete'||session.phase==='blocked'))){
      last.current=0;const report=session.report();onProgress(emit(report));
      if(report.phase==='blocked'||report.phase==='complete'){
        if(report.phase==='blocked')console.error('PMO_FERRY_100_CAUSE',report.error,report);
        console.info('PMO_FERRY_100_FINISH',report);ended.current=true;
      }
    }
  });
  if(!session)return null;
  return <group name="rrh-crowd-100-sea-wave">
    <PmoSeaRouteOverlay plan={session.boat.plan}/>
    <group ref={ship} name="ferry-100-test" position={session.boat.position}>
      <mesh position={[0,.12,0]} castShadow><boxGeometry args={[1.3,.24,2.5]}/><meshStandardMaterial color="#eee8c9"/></mesh>
      <mesh position={[0,.28,-.4]}><boxGeometry args={[.92,.30,.8]}/><meshStandardMaterial color="#37779c"/></mesh>
      <mesh position={[0,.25,.57]}><boxGeometry args={[.93,.07,1.12]}/><meshStandardMaterial color="#7194a4"/></mesh>
    </group>
    <instancedMesh ref={figures} args={[undefined,undefined,100]} count={0} frustumCulled={false}>
      <capsuleGeometry args={[.047,.11,4,7]}/><meshStandardMaterial color="white" roughness={.64}/>
    </instancedMesh>
  </group>;
}
