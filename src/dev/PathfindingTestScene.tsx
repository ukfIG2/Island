import {createCrowdPersonalHelperLanes} from './pmoCrowdHelperLanesV15';
/** Dev-only pathfinding verification INSIDE the canonical RRH R3F Canvas.
 * No second renderer, no scene clones, no Core dispatch/persistence writes.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { getSpatialSnapshot, subscribeSpatial } from '../render/spatialMeta/registry';
import { getPublishedPmoRegistry } from '../render/spatialMeta/pmoServiceLayout';
import { findIslandTerrain, makeTerrainProjector } from '../render/spatialMeta/terrainProjector';
import { makePmoTerrainConnector } from '../render/spatialMeta/pmoNavigationWorld';
import { readPmoWalkAuthorization } from '../render/spatialMeta/pmoWorldBindings';
import { type PmoRouteHelper, type SpatialPoint } from '../render/spatialMeta/pmoBrushCorridors';
import { usePmoNavigationWorld } from '../render/spatialMeta/PmoNavigationScope';
import { inventoryPmoBuildingSites } from '../render/spatialMeta/pmoWorldBindings';
import { adaptCompiledPmoGraph } from './pmoCompiledGraphAdapter';
import { auditCompiledTransitionConnectivity } from './pmoCompiledTransitionAudit';
import { assessPmoTransitionAccess } from '../render/spatialMeta/pmoTransitionAccess';
import { projectPmoTransitionStructures } from '../render/spatialMeta/pmoTransitionStructures';
import { choosePmoBeachStart, PathfindingTestSession } from './pathfindingTestSession';
import { auditPmoWalkMotion } from './pmoWalkMotionAudit';
import { auditPmoBuildingSiteReachability } from './pmoDevBuildings';
import { reconciledWaveMessage } from './pathfindingWaveFeedback';
import { PmoFullWaveTestLayer } from './PmoFullWaveTestLayer';
import { PmoCrowdStressTestLayer } from './PmoCrowdStressTestLayer';
import type { CrowdReport } from './pmoCrowdStressSession';
import type {FullWaveReport} from './pmoFullWaveSession';
import {auditAllPmoPaths,type PmoFullPathReport} from './pmoFullPathAudit';
import {PmoLiftTransit} from '../render/spatialMeta/pmoLiftTransit';
import type {SeaContourInput} from '../render/seaCoastNavigation';

export interface PathfindingTestStatus {
  phase: 'loading'|'ready'|'blocked';
  message: string;
  nodes: number;
  buildings: number;
  walking: number;
  arrived: number;
  waiting: number;
  blocked: number;
  seed: number;
  queued: number;
  moved: number;
  motionDiagnostic: string;
  siteReport: string;
  sourceAuthority: string;
  fullWave?: FullWaveReport;
  crowd?: CrowdReport;
  fullAudit:null|{running:boolean;report:PmoFullPathReport|null;error:string|null};
}
export const INITIAL_TEST_STATUS:PathfindingTestStatus = {
  phase:'loading',message:'Загрузка реального острова / PMO…',nodes:0,buildings:0,
  walking:0,arrived:0,waiting:0,blocked:0,seed:0,queued:0,moved:0,motionDiagnostic:'Ожидание волны',siteReport:'Ожидание 9 PMO-площадок',sourceAuthority:'Canonical PMO → compiled NavigationScope',fullAudit:null
};
interface Props {
  shuffleKey:number;
  waveKey:number;
  fullWaveKey:number;
  fullAuditKey:number;
  onStatus:(status:PathfindingTestStatus)=>void;
  seaContour:SeaContourInput|null;
}
const palette=['#f5b977','#88d8ee','#cba5ef','#8cdaad','#f1a2b7'];
const spread = (p:SpatialPoint):[number,number,number] => [p[0],p[1],p[2]];

function Sign({text}:{text:string}){
  const texture=useMemo(()=>{
    const canvas=document.createElement('canvas');canvas.width=256;canvas.height=70;
    const ctx=canvas.getContext('2d')!;
    ctx.fillStyle='rgba(10,26,41,0.87)';ctx.fillRect(0,4,256,60);
    ctx.fillStyle='#fff';ctx.font='bold 21px sans-serif';ctx.textAlign='center';ctx.fillText(text,128,43);
    return new THREE.CanvasTexture(canvas);
  },[text]);
  useEffect(()=>()=>texture.dispose(),[texture]);
  return <sprite position={[0,0.36,0]} scale={[0.9,0.245,1]}>
    <spriteMaterial map={texture} depthTest={false} transparent />
  </sprite>;
}

export function PathfindingTestScene({shuffleKey,waveKey,fullAuditKey,onStatus,fullWaveKey,seaContour}:Props){
  const scene=useThree(s=>s.scene);
  const compiledWorld=usePmoNavigationWorld();
  const spatial=useSyncExternalStore(subscribeSpatial,getSpatialSnapshot,getSpatialSnapshot);
  const published=useMemo(()=>getPublishedPmoRegistry(),[spatial.registry]);
  const [terrain,setTerrain]=useState<THREE.Mesh|null>(null);
  const [session,setSession]=useState<PathfindingTestSession|null>(null);
  const [layoutVersion,setLayoutVersion]=useState(0);
  const statusRef=useRef<PathfindingTestStatus>(INITIAL_TEST_STATUS);
  const sessionRef=useRef<PathfindingTestSession|null>(null);
  const [fullWaveContext,setFullWaveContext]=useState<{
    graph:import('../render/spatialMeta/pmoBrushCorridors').BrushGraph;
    connector:import('../render/spatialMeta/pmoBrushCorridors').PmoTerrainConnector;
    beach:SpatialPoint;
    samplePhysicalHelper:(helper:PmoRouteHelper,t:number,from:SpatialPoint,to:SpatialPoint)=>SpatialPoint|null;
  }|null>(null);
  const failedRef=useRef(false);
  const lastShuffle=useRef(shuffleKey);
  const lastWave=useRef(waveKey);
  const lastFullAudit=useRef(fullAuditKey);
  const fullAuditInput=useRef<Parameters<typeof auditAllPmoPaths>[0]|null>(null);
  const actorsRef=useRef<THREE.InstancedMesh>(null);
  const dummy=useMemo(()=>new THREE.Object3D(),[]);
  const frameTime=useRef(0);
  const motion=useRef(new Map<string,{origin:SpatialPoint;last:SpatialPoint;travelled:number;age:number;lastAdvancedAt:number}>());
  const motionClock=useRef(0);
  const report=(update:Partial<PathfindingTestStatus>)=>{
    statusRef.current={...statusRef.current,...update};onStatus(statusRef.current);
  };

  useFrame((_,delta)=>{
    if(!terrain && !failedRef.current){
      const discovered=findIslandTerrain(scene);
      if(discovered)setTerrain(discovered);
    }
    const runtime=sessionRef.current;
    if(fullWaveKey!==0){if(actorsRef.current)actorsRef.current.count=0;return;}
    if(!runtime)return;
    runtime.tick(Math.min(Math.max(delta,0.001),0.05));
    const mesh=actorsRef.current;
    const snapshots=runtime.snapshots();
    motionClock.current+=delta;
    for(const actor of snapshots){
      let m=motion.current.get(actor.id);
      if(!m){m={origin:[...actor.position],last:[...actor.position],travelled:0,age:0,lastAdvancedAt:motionClock.current};motion.current.set(actor.id,m);}
      const motionDelta=Math.hypot(...actor.position.map((v,i)=>v-m!.last[i]));
      m.travelled+=motionDelta;
      if(motionDelta>0.0001)m.lastAdvancedAt=motionClock.current;
      m.last=[...actor.position];m.age+=delta;
    }
    if(mesh){
      mesh.count=Math.min(500,snapshots.length);
      for(let i=0;i<mesh.count;i++){
        const actor=snapshots[i];
        dummy.position.set(actor.position[0],actor.position[1]+0.095,actor.position[2]);
        dummy.rotation.set(0,0,0);dummy.scale.setScalar(1);dummy.updateMatrix();
        mesh.setMatrixAt(i,dummy.matrix);
        mesh.setColorAt(i,new THREE.Color(actor.status==='arrived'?'#6effbe':actor.status==='blocked'?'#ff4860':actor.status==='waiting-helper'?'#cc95ff':'#ffdb81'));
      }
      mesh.instanceMatrix.needsUpdate=true;
      if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
    }
    frameTime.current+=delta;
    if(frameTime.current>0.65){
      frameTime.current=0;
      const moved=snapshots.filter(a=>(motion.current.get(a.id)?.travelled??0)>0.06).length;
      const recent=snapshots.filter(a=>motionClock.current-(motion.current.get(a.id)?.lastAdvancedAt??0)<2).length;
      const blocked=snapshots.filter(a=>a.status==='blocked');
      const waveProgress=runtime.progress();
      const arrivedCount=snapshots.filter(a=>a.status==='arrived').length;
      const waveMessage=reconciledWaveMessage(statusRef.current.message,{
        queued:waveProgress.queued,total:snapshots.length,arrived:arrivedCount,blocked:blocked.length});
      const stalled=snapshots.filter(a=>a.status!=='arrived' && a.status!=='blocked' &&
        (motion.current.get(a.id)?.age??0)>4 &&
        motionClock.current-(motion.current.get(a.id)?.lastAdvancedAt??0)>4);
      const first=snapshots[0];
      const details=first ? `#${first.id} ${first.status} step ${first.stepIndex}/${first.routeLength}`+
        ` xyz=${first.position.map(x=>x.toFixed(2)).join(',')}`+
        ` distance=${(motion.current.get(first.id)?.travelled??0).toFixed(3)}`+
        (first.fault?' fault='+first.fault:'') : 'Пешек пока нет';
      const diagnostic=blocked.length ? 'BLOCKED: '+blocked.slice(0,3).map(a=>
        `${a.id}:${a.fault} step=${a.stepIndex}/${a.routeLength} xyz=${a.position.map(x=>x.toFixed(3)).join(',')}`).join('; ') :
        stalled.length ? 'NO_MOVEMENT_4S: '+stalled.slice(0,3).map(a=>`${a.id}:${a.status}:step${a.stepIndex}`).join('; ') :
        'Трасса: '+details;
      report({walking:snapshots.filter(a=>a.status==='walking'||a.status==='crossing-helper').length,
        waiting:snapshots.filter(a=>a.status.startsWith('waiting')).length,
        arrived:arrivedCount,
        blocked:blocked.length,queued:waveProgress.queued,moved,
        ...(waveMessage?{message:waveMessage}:{}),
        motionDiagnostic:`Recent movement (2s): ${recent}/${snapshots.length} | `+diagnostic+(blocked.length||stalled.length?' | '+details:'')+
          (waveProgress.holdReason ? ' | SPAWN HOLD: '+waveProgress.holdReason:'')});
    }
  });

  // Build from the *same* island scene mesh, authored/live PMO, terrain sampler and
  // physical structure-support checks as the production navigation modules.
  useEffect(()=>{
    if(!terrain||!compiledWorld)return;
    let cancelled=false;
    failedRef.current=false;
    fullAuditInput.current=null;setSession(null);setFullWaveContext(null);sessionRef.current=null;compiledWorld.liftTransit.reset();motion.current.clear();motionClock.current=0;
    report({...INITIAL_TEST_STATUS,phase:'loading',message:'Сертификация PMO-графа на рельефе острова…'});
    const timer=window.setTimeout(()=>{
      try{
        const registry=published.registry;
        const projector=makeTerrainProjector(terrain);
        const navigationRegistry=compiledWorld.navigationRegistry;
        const connector=makePmoTerrainConnector(navigationRegistry,projector);
        const paint=readPmoWalkAuthorization(navigationRegistry);
        if(!paint.length)throw Error('PMO_WALK_PAINT_MISSING');
        // Exactly the NavigationGraph already compiled by PmoNavigationScope
        // for this canonical island + immutable published PMO. No second brush
        // recompiler or imported stand-alone JSON file.
        if(compiledWorld.graph.schemaVersion!==1)
          throw Error('PMO_PRODUCTION_COMPILED_GRAPH_INVALID');
        const structures=projectPmoTransitionStructures(registry);
        const accesses=assessPmoTransitionAccess(structures,compiledWorld.graph);
        const adapted=adaptCompiledPmoGraph(compiledWorld.graph,connector,paint,structures,accesses,compiledWorld.landingExtensions,compiledWorld.liftTransit,compiledWorld.dockExtensions);
        const motionAudit=auditPmoWalkMotion(adapted.graph,connector);
        const walkingGraph=motionAudit.graph;
        const buildingSites=inventoryPmoBuildingSites(registry);
        if(buildingSites.length!==9)throw Error(`PMO_CANONICAL_NINE_SITES_REQUIRED:${buildingSites.length}`);
        report({nodes:walkingGraph.nodes.length,
          message:`Compiled PMO: ${adapted.sourceNodeCount} native nodes; ${buildingSites.length}/9 authored sites; `+
            `certified physical links: ${adapted.accepted.length}; rejected: ${adapted.rejected.join(' · ') || 'none'}`});
        const beach=choosePmoBeachStart(walkingGraph);
        if(!beach)throw Error('BEACH_PMO_WALK_SURFACE_NOT_CERTIFIED');
        const siteAudit=auditPmoBuildingSiteReachability(walkingGraph,connector,beach,buildingSites);
        const landingDiagnosis=compiledWorld.diagnostics.filter(d=>d.startsWith('LANDING_REPAIR_')||d.startsWith('PMO_TERRAIN_WALK_STITCH')||d.startsWith('PMO_DOCK_')||d.startsWith('PMO_BEACH_')||d.startsWith('PMO_MAIN_GATEWAY_')||d.startsWith('PMO_SITE5_REVERSE_EXIT_')||d.startsWith('PMO_SITE5_CUT_')||d.startsWith('PMO_WALK_PAINT_LAB_'));
        const transitionAudit=auditCompiledTransitionConnectivity(walkingGraph,beach,structures,accesses,adapted)
          .map(item=>{
            const name=registry.objects.find(o=>o.id===item.sourceId)?.name??item.sourceId;
            return `${name}:${item.status} [beach ports ${item.portReachability.join('/')}]; ${item.details}`;
          });
        const siteReport=siteAudit.map(item=>`${item.name}:${item.reachable?'READY':item.reason}`).join(' · ')+
          (landingDiagnosis.length?' · '+landingDiagnosis.join(' · '):'')+
          '\nTRANSITIONS\n'+transitionAudit.join('\n');
        report({siteReport});
        const sample=(helper:PmoRouteHelper,t:number,from:SpatialPoint,to:SpatialPoint):SpatialPoint|null=>{
          const points=adapted.physical.get(helper.sourceId);
          if(!points?.length)return null;
          const reverse=Math.hypot(...from.map((v,i)=>v-helper.to[i]))<0.08;
          const scaled=(reverse?1-t:t)*(points.length-1);
          const a=Math.floor(scaled),b=Math.min(points.length-1,a+1),f=scaled-a;
          return [points[a][0]+(points[b][0]-points[a][0])*f,
            points[a][1]+(points[b][1]-points[a][1])*f,
            points[a][2]+(points[b][2]-points[a][2])*f];
        };
        const personalSample=createCrowdPersonalHelperLanes(structures,sample);
        console.info('RRH_PMO_HELPER_LANES_V15_WIRED', {supportedStructures:structures.filter(x=>x.kind==='stairs'||x.kind==='bridge').map(x=>({id:x.sourceId,kind:x.kind,width:x.segments[0]?.width}))});
        const sampleForCrowd=(helper:PmoRouteHelper,t:number,from:SpatialPoint,to:SpatialPoint,actorId?:string)=>
          personalSample(helper,t,from,to,actorId);
        const created=new PathfindingTestSession(walkingGraph,connector,beach,sample,buildingSites,compiledWorld.liftTransit);
        fullAuditInput.current={graph:walkingGraph,connector,beach,sites:buildingSites,physical:adapted.physical,
          transitions:auditCompiledTransitionConnectivity(walkingGraph,beach,structures,accesses,adapted),
          liftFactory:()=>new PmoLiftTransit(structures,accesses,connector,compiledWorld.dockExtensions)};
        const seed=crypto.getRandomValues(new Uint32Array(1))[0];
        const first=created.shuffle(seed);
        if(cancelled)return;
        // No falsely successful READY, but the nine-site test stand remains visible.
        sessionRef.current=created;setSession(created);setLayoutVersion(v=>v+1);
        setFullWaveContext({graph:walkingGraph,connector,beach,samplePhysicalHelper:sampleForCrowd});
        report({phase:'ready',message:
          `Опубликованный PMO скомпилирован. Здания: ${first.scenario.buildings.length}/5, доступны ${first.scenario.stats.reachableBuildings}; `+
          `авторских площадок ${first.scenario.stats.authoredSiteCount}/9; переходов подтверждено: ${adapted.accepted.length}/6. `+
          `Физическая проверка малых шагов: ${motionAudit.walkDirectedAccepted} направлений допустимы, ${motionAudit.walkDirectedRejected} исключены. `+
          `Источник: опубликованный PMO RRH; production graph; физические стыковочные ступени ${compiledWorld.landingExtensions.length}.` +
          (compiledWorld.walkPaintLabStamps ? ` ЭКСПЕРИМЕНТ: ${compiledWorld.walkPaintLabStamps.length} мазков, сгенерированные лестницы сняты.` : ''),
          nodes:walkingGraph.nodes.length,buildings:first.scenario.buildings.length,seed:first.scenario.seed,siteReport,
          sourceAuthority:`Canonical PMO → compiled NavigationScope · physical landing ${compiledWorld.landingExtensions.length}` +
            (compiledWorld.walkPaintLabStamps ? ' · EXPERIMENTAL TERRAIN PAINT OVERLAY' : '')});
      }catch(error){
        if(cancelled)return;
        failedRef.current=true;
        report({phase:'blocked',message:error instanceof Error?error.message:String(error)});
      }
    },0);
    return ()=>{cancelled=true;window.clearTimeout(timer);sessionRef.current=null;};
  },[terrain,published.registry,compiledWorld]);

  useEffect(()=>{
    if(fullWaveKey!==0)return;
    if(shuffleKey===lastShuffle.current)return;
    lastShuffle.current=shuffleKey;
    const runtime=sessionRef.current;if(!runtime)return;
    try{
      const seed=crypto.getRandomValues(new Uint32Array(1))[0];
      const result=runtime.shuffle(seed);setLayoutVersion(v=>v+1);
      report({seed:result.scenario.seed,buildings:result.scenario.buildings.length,
        message:`PMO sites: ${result.scenario.buildings.map(b=>b.name+'→'+b.pmoSiteName).join(', ')}; доступны ${result.scenario.stats.reachableBuildings}/5, ${result.rerouted} маршрутов перестроено, ${result.blocked} отказов. ${result.scenario.failures.slice(0,2).join(' · ')}. Без телепортации.`});
    }catch(error){report({message:'Перестановка отклонена: '+String(error)});}
  },[shuffleKey]);

  useEffect(()=>{
    if(fullWaveKey!==0)return;
    if(waveKey===lastWave.current)return;
    lastWave.current=waveKey;
    const runtime=sessionRef.current;if(!runtime)return;
    try{
      const seed=crypto.getRandomValues(new Uint32Array(1))[0];
      const result=runtime.spawnWave(12,seed);
      report({queued:result.queued,message:`Волна: ${result.accepted} пешек появились на PMO-пляже; ${result.queued} в очереди последовательного появления, без толпы в одной точке. ${result.rejected.slice(0,2).join(' · ')}`});
    }catch(error){
      const pending=runtime.progress().queued;
      if(error instanceof Error && error.message==='PMO_TEST_CURRENT_WAVE_STILL_SPAWNING')
        report({message:`Выпуск волны ещё продолжается: ${pending} гостей в очереди. Новая волна будет доступна после их появления.`});
      else report({message:'Волна отклонена: '+String(error)});
    }
  },[waveKey]);

  useEffect(()=>{
    if(fullAuditKey===lastFullAudit.current)return;
    lastFullAudit.current=fullAuditKey;
    const input=fullAuditInput.current;
    if(!input){report({message:'Матрица маршрутов пока недоступна: компиляция PMO не завершена.'});return;}
    const abort=new AbortController();
    report({fullAudit:{running:true,report:null,error:null}});
    void auditAllPmoPaths(input,abort.signal,snapshot=>{
      if(!abort.signal.aborted)report({fullAudit:{running:true,report:snapshot,error:null}});
    }).then(result=>{
      if(!abort.signal.aborted)report({fullAudit:{running:false,report:result,error:null}});
    }).catch(error=>{
      if(!abort.signal.aborted)report({fullAudit:{running:false,report:null,error:String(error)}});
    });
    return ()=>abort.abort();
  },[fullAuditKey]);

  const buildings=useMemo(()=>session?.scenario?.buildings??[],[session,layoutVersion]);
  const routes=useMemo(()=>{
    const material=new THREE.LineBasicMaterial({color:'#84edb0',transparent:true,opacity:0.55,depthWrite:false});
    const group=new THREE.Group();
    for(const building of buildings){
      if(building.routeStatus!=='READY')continue;
      const points=building.routePoints.map(p=>new THREE.Vector3(p[0],p[1]+0.075,p[2]));
      const geometry=new THREE.BufferGeometry().setFromPoints(points);
      group.add(new THREE.Line(geometry,material));
    }
    return group;
  },[buildings]);
  useEffect(()=>()=>{routes.traverse(obj=>{if(obj instanceof THREE.Line)obj.geometry.dispose();});
    const material=(routes.children[0] as THREE.Line|undefined)?.material;
    if(material instanceof THREE.Material)material.dispose();},[routes]);
  return <group name="rrh-pathfinding-test-in-canonical-world">
    <primitive object={routes}/>
    {buildings.map((b,i)=><group key={b.id} position={spread(b.position)}>
      <mesh position={[0,0.095,0]} castShadow><boxGeometry args={[0.2,0.19,0.23]}/>
        <meshStandardMaterial color={b.routeStatus==='READY'?palette[i]:'#d0474d'} roughness={0.75}/></mesh>
      <mesh position={[0,0.23,0]} rotation={[0,Math.PI/4,0]} castShadow>
        <coneGeometry args={[0.18,0.12,4]}/><meshStandardMaterial color="#754938"/></mesh>
      <Sign text={b.name}/>
    </group>)}
    {fullWaveKey>0&&fullWaveContext&&session?.scenario ?
      <PmoFullWaveTestLayer key={fullWaveKey} seaContour={seaContour} graph={fullWaveContext.graph} connector={fullWaveContext.connector}
        beach={fullWaveContext.beach} buildings={session.scenario.buildings}
        samplePhysicalHelper={fullWaveContext.samplePhysicalHelper} liftTransit={compiledWorld!.liftTransit}
        onProgress={result=>report({fullWave:result,
          message:result.phase==='blocked'?'FULL WAVE BLOCKED: '+result.error:
            result.phase==='complete'?'FULL WAVE COMPLETE: 12/12 returned, boarded; ferry left the screen.':
            'FULL WAVE '+result.phase.toUpperCase()+' · discharged '+result.disembarked+'/12 · boarded '+result.boarded+'/12',
          walking:result.activeMotor,arrived:result.boarded,blocked:result.blocked,
          queued:result.queued,motionDiagnostic:result.error??('FULL WAVE '+result.phase+'; ship xyz '+result.ship.map(n=>n.toFixed(2)).join(', '))})}/>
      : null}
    {fullWaveKey<0&&fullWaveContext&&session?.scenario ?
      <PmoCrowdStressTestLayer key={fullWaveKey} seaContour={seaContour} graph={fullWaveContext.graph} connector={fullWaveContext.connector}
        beach={fullWaveContext.beach} buildings={session.scenario.buildings}
        samplePhysicalHelper={fullWaveContext.samplePhysicalHelper} liftTransit={compiledWorld!.liftTransit}
        onProgress={r=>report({crowd:r,fullWave:undefined,
          message:r.phase==='blocked'?'CROWD 100 BLOCKED: '+r.error:
            r.phase==='complete'?'CROWD 100 COMPLETE: 100/100 physically arrived.':
            'CROWD 100 '+r.phase.toUpperCase()+' · launched '+r.launched+'/100 · moving '+r.active+' · waiting '+r.waitingSpace,
          walking:r.active,arrived:r.arrived,blocked:r.blocked,queued:r.pendingBeach,moved:r.launched,
          motionDiagnostic:r.error??('CROWD 100 · peak active '+r.peakActive+' · peak waiting '+r.peakWaitingSpace)})}/>
      : null}
    <instancedMesh ref={actorsRef} args={[undefined,undefined,500]} frustumCulled={false} count={0}>
      <capsuleGeometry args={[0.04,0.095,4,7]}/>
      <meshStandardMaterial color="white" roughness={0.62}/>
    </instancedMesh>
  </group>;
}
