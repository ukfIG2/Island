/** Full Wave laboratory inside the EXISTING canonical island / PMO R3F canvas.
 * All pedestrian motion uses the same PMO motor as 90/90 audits. No Core writes.
 */
import {useEffect,useMemo,useRef} from 'react';
import {useFrame,useThree} from '@react-three/fiber';
import * as THREE from 'three';
import type {BrushGraph,PmoTerrainConnector,SpatialPoint,PmoRouteHelper} from '../render/spatialMeta/pmoBrushCorridors';
import {planBrushCorridorRoute} from '../render/spatialMeta/pmoBrushCorridors';
import {createDevPedestrianMotor} from './createDevPedestrianMotor';
import type {PmoLiftTransit} from '../render/spatialMeta/pmoLiftTransit';
import type {TestBuilding} from './pmoDevBuildings';
import {PmoFullWaveSession,type ServiceQueue,type FullWaveReport} from './pmoFullWaveSession';
import {planFullWaveSeaRoute,RRH_SAFE_WATER_RADIUS,RRH_SEA_LEVEL,type WaterPoint} from './pmoFullWaveWaterRoute';
import {certifyWalkMotion} from './pmoWalkMotionAudit';
import type {SeaContourInput} from '../render/seaCoastNavigation';
import {PmoSeaRouteOverlay} from './PmoSeaRouteOverlay';

const distance=(a:readonly number[],b:readonly number[])=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const horiz=(a:readonly number[],b:readonly number[])=>Math.hypot(a[0]-b[0],a[2]-b[2]);
interface Props {
  seaContour:SeaContourInput|null;
  graph:BrushGraph;connector:PmoTerrainConnector;beach:SpatialPoint;
  buildings:readonly TestBuilding[];
  samplePhysicalHelper:(helper:PmoRouteHelper,t:number,from:SpatialPoint,to:SpatialPoint)=>SpatialPoint|null;
  liftTransit:PmoLiftTransit;
  onProgress:(result:FullWaveReport)=>void;
}
function entryOnCameraEdge(camera:THREE.Camera,edge:number,t:number):WaterPoint {
  const ndc=edge===0?[1.28,t]:edge===1?[-1.28,t]:edge===2?[t,1.28]:[t,-1.28];
  const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(ndc[0],ndc[1]),camera);
  const factor=(RRH_SEA_LEVEL-ray.ray.origin.y)/ray.ray.direction.y;
  let x=0,z=0;
  if(factor>0 && Number.isFinite(factor)){x=ray.ray.origin.x+factor*ray.ray.direction.x;z=ray.ray.origin.z+factor*ray.ray.direction.z;}
  else {const theta=(edge/4)*Math.PI*2;x=15*Math.cos(theta);z=15*Math.sin(theta);}
  const len=Math.hypot(x,z)||1;
  const r=Math.max(RRH_SAFE_WATER_RADIUS+0.5,Math.min(18,len));
  return [x/len*r,RRH_SEA_LEVEL,z/len*r];
}
function makeServiceQueues(graph:BrushGraph,connector:PmoTerrainConnector,beach:SpatialPoint,buildings:readonly TestBuilding[]):ServiceQueue[]{
  const used:SpatialPoint[]=[];
  const chosen:ServiceQueue[]=[];
  for(const b of buildings.filter(b=>b.routeStatus==='READY'&&b.arrivalPoint)){
    const door=b.arrivalPoint!;
    const towardBeach=[beach[0]-door[0],beach[2]-door[2]];
    const norm=Math.hypot(...towardBeach)||1;
    const dx=towardBeach[0]/norm,dz=towardBeach[1]/norm;
    const candidates=graph.nodes.filter(n=>horiz(n.point,door)>.14&&horiz(n.point,door)<1.05&&
      Math.abs(n.point[1]-door[1])<0.14 && used.every(p=>distance(p,n.point)>0.22));
    candidates.sort((a,b)=>{
      const score=(p:SpatialPoint)=>{
        const ux=p[0]-door[0],uz=p[2]-door[2];
        const forward=ux*dx+uz*dz;
        const side=Math.abs(ux*dz-uz*dx);
        return Math.abs(forward-0.36)+side*0.7;
      };
      return score(a.point)-score(b.point);
    });
    const slots:SpatialPoint[]=[];
    for(const node of candidates.slice(0,65)){
      if(slots.some(p=>horiz(p,node.point)<0.23))continue;
      if(used.some(p=>distance(p,node.point)<0.23))continue;
      const forward=planBrushCorridorRoute(graph,connector,beach,node.point,0.26,(a,b)=>certifyWalkMotion(a,b,graph,connector)===null);
      if(forward.status!=='READY')continue;
      const backward=planBrushCorridorRoute(graph,connector,node.point,beach,0.26,(a,b)=>certifyWalkMotion(a,b,graph,connector)===null);
      if(backward.status!=='READY')continue;
      slots.push([...node.point]);
      if(slots.length===3)break;
    }
    if(slots.length===3){chosen.push({id:b.pmoSiteId,approach:[...door],slots});used.push(...slots);}
  }
  if(chosen.length<4)throw Error('FULL_WAVE_NOT_ENOUGH_CERTIFIED_SERVICE_QUEUE_SLOTS:'+chosen.length);
  return chosen;
}
export function PmoFullWaveTestLayer({seaContour,graph,connector,beach,buildings,samplePhysicalHelper,liftTransit,onProgress}:Props){
  const camera=useThree(s=>s.camera);
  const bodyRef=useRef<THREE.InstancedMesh>(null);
  const boatRef=useRef<THREE.Group>(null);
  const dummy=useMemo(()=>new THREE.Object3D(),[]);
  const lastReport=useRef(0);
  const guestColors=useMemo(()=>({outbound:new THREE.Color('#7df3c7'),service:new THREE.Color('#fccd60'),queued:new THREE.Color('#bce7ff'),default:new THREE.Color('#ffe0a8')}),[]);
  const prepared=useMemo(()=>{
    try {
    const candidates=graph.nodes.filter(n=>n.point[1]<-1.65 && distance(n.point,beach)<0.81)
      .sort((a,b)=>distance(a.point,beach)-distance(b.point,beach));
    const beachNodes:SpatialPoint[]=[];
    for(const n of candidates){
      if(beachNodes.some(p=>horiz(p,n.point)<=0.19))continue;
      const proof=planBrushCorridorRoute(graph,connector,n.point,beach,0.26,(a,b)=>certifyWalkMotion(a,b,graph,connector)===null);
      if(proof.status!=='READY')continue;
      beachNodes.push([...n.point]);if(beachNodes.length===6)break;
    }
    if(beachNodes.length<2)throw Error('FULL_WAVE_BEACH_SPAWN_SLOTS_NOT_FOUND');
    const serviceQueues=makeServiceQueues(graph,connector,beach,buildings);
    const random=Math.floor(Math.random()*4),exitEdge=(random+1+Math.floor(Math.random()*3))%4;
    camera.updateWorldMatrix(true,false);
    const incoming=entryOnCameraEdge(camera,random,Math.random()*1.4-0.7);
    const outgoing=entryOnCameraEdge(camera,exitEdge,Math.random()*1.4-0.7);
    if(!seaContour)throw Error('RRH_SEA_V41_NO_BOUNDARY_OR_PMO_STROKES');
    const water=planFullWaveSeaRoute(beach,incoming,outgoing,random%2===0,seaContour);
    if(water.pipeline!=='PMO_COLLISION_LENS_REVERSE_V4'||!water.v4)
      throw Error('RRH_SEA_V41_LEGACY_FALLBACK_FORBIDDEN');
    console.info('RRH_SEA_FULL_WAVE_V41_WIRED', {pipeline:water.pipeline,brushStrokes:seaContour.beachStrokes.length});
    const {motor}=createDevPedestrianMotor({graph,connector,liftTransit,samplePhysicalHelper,
      collisionSpacing:0.078,synchronizedLift:false});
    return {session:new PmoFullWaveSession(motor,serviceQueues,beachNodes,water,12),slots:serviceQueues,error:null as string|null};
    } catch(error){return {session:null,slots:[] as ServiceQueue[],error:String(error)};}
  },[graph,connector,beach,buildings,samplePhysicalHelper,liftTransit,camera,seaContour]);
  const {session,slots,error}=prepared;
  const finalReported=useRef(false);
  useEffect(()=>()=>{
    // Always relinquish shared lift reservations when the DEV test unmounts.
    if(session)for(const actor of session.motor.snapshots())session.motor.remove(actor.id);
  },[session]);
  useEffect(()=>{
    if(error){console.error('PMO_FULL_WAVE_TEST_BLOCKED',error);
      onProgress({phase:'blocked',aboard:12,disembarked:0,queued:0,servicing:0,served:0,returning:0,
        boarded:0,activeMotor:0,blocked:1,error,ship:[0,RRH_SEA_LEVEL,0],passengerCount:12});}
    else if(session){console.info('PMO_FULL_WAVE_TEST_READY',session.report());onProgress(session.report());}
  },[session,error]);
  useFrame((_,delta)=>{
    // Walk in short certified increments while allowing sea crossing at normal speed.
    const dt=Math.min(0.05,Math.max(.002,delta));
    if(!session)return;
    try { session.tick(dt); }catch(e){session.abort(String(e));}
    const mesh=bodyRef.current;
    const bodies=session.motor.snapshots();
    if(mesh){mesh.count=bodies.length;
      for(let i=0;i<bodies.length;i++){
        const a=bodies[i],p=session.passengers.find(g=>g.id===a.id);
        dummy.position.set(a.position[0],a.position[1]+0.097,a.position[2]);
        dummy.rotation.set(0,0,0);dummy.scale.setScalar(1);dummy.updateMatrix();
        mesh.setMatrixAt(i,dummy.matrix);
        mesh.setColorAt(i,p?.phase==='outbound'?guestColors.outbound:p?.phase==='service'?guestColors.service:p?.phase==='queued'?guestColors.queued:guestColors.default);
      }
      mesh.instanceMatrix.needsUpdate=true;
      if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
    }
    if(boatRef.current){boatRef.current.position.set(...session.boat.position);boatRef.current.rotation.y=session.boat.yaw;boatRef.current.visible=session.boat.phase!=='gone';}
    lastReport.current+=dt;
    if(lastReport.current>=0.65 || ((session.phase==='complete'||session.phase==='blocked')&&!finalReported.current)){
      lastReport.current=0;
      onProgress(session.report());
      if(session.phase==='complete'||session.phase==='blocked')finalReported.current=true;
    }
  });
  if(!session)return null;
  return <group name="rrh-full-wave-dev-test">
    <PmoSeaRouteOverlay plan={session.boat.plan}/>
    {slots.map(s=>s.slots.map((p,i)=><mesh key={s.id+'-'+i} position={[p[0],p[1]+0.012,p[2]]} rotation={[-Math.PI/2,0,0]}>
      <ringGeometry args={[0.065,0.085,16]}/><meshBasicMaterial color="#78e6ff" side={THREE.DoubleSide} transparent opacity={0.75}/>
    </mesh>))}
    <group ref={boatRef} name="full-wave-ferry" position={session.boat.position}>
      <mesh position={[0,0.07,0]} castShadow><boxGeometry args={[0.47,0.15,0.98]}/><meshStandardMaterial color="#f9f5de" roughness={0.48}/></mesh>
      <mesh position={[0,0.16,-0.06]}><boxGeometry args={[0.37,0.12,0.43]}/><meshStandardMaterial color="#2385ad"/></mesh>
      <mesh position={[0,0.155,0.34]}><boxGeometry args={[0.32,0.04,0.22]}/><meshStandardMaterial color="#5b888f"/></mesh>
    </group>
    <instancedMesh ref={bodyRef} args={[undefined,undefined,12]} count={0} frustumCulled={false}>
      <capsuleGeometry args={[0.04,0.095,4,7]}/><meshStandardMaterial color="white" roughness={0.65}/>
    </instancedMesh>
  </group>;
}
