/** Actual production PMO pedestrian motion. Core remains the only game authority.
 * Rendered travel figures are a bounded presentation sample of released demand,
 * not one authoritative guest entity per demand unit. */
import {useEffect,useMemo,useRef,useState} from 'react';
import {useFrame,useThree} from '@react-three/fiber';
import type * as THREE from 'three';
import type {BootstrapState} from '../core/state';
import {usePmoNavigationWorld} from './spatialMeta/PmoNavigationScope';
import {getPublishedPmoRegistry} from './spatialMeta/pmoServiceLayout';
import {findIslandTerrain,makeTerrainProjector} from './spatialMeta/terrainProjector';
import {makePmoTerrainConnector} from './spatialMeta/pmoNavigationWorld';
import {readPmoWalkAuthorization,inventoryPmoBuildingSites} from './spatialMeta/pmoWorldBindings';
import {projectPmoTransitionStructures} from './spatialMeta/pmoTransitionStructures';
import {assessPmoTransitionAccess} from './spatialMeta/pmoTransitionAccess';
import {adaptCompiledPmoGraph} from './spatialMeta/pmoCompiledGraphAdapter';
import {auditPmoWalkMotion} from './spatialMeta/pmoWalkMotionAudit';
import {auditedApproaches,siteByNeed} from './spatialMeta/pmoProductionSiteEndpoints';
import {PmoWavePedestrianTraffic} from './spatialMeta/pmoWavePedestrianTraffic';
import {PmoBrushCrowdLayer} from './PmoBrushCrowdLayer';

const BEACH:[number,number,number]=[1.6739,-2.2456,4.5734];
export function PmoProductionGuestTraffic({state}:{state:BootstrapState}){
  const scene=useThree(s=>s.scene);
  const world=usePmoNavigationWorld();
  const [terrain,setTerrain]=useState<THREE.Mesh|null>(null);
  const [traffic,setTraffic]=useState<PmoWavePedestrianTraffic|null>(null);
  const runtime=useRef<PmoWavePedestrianTraffic|null>(null);
  const frame=useRef({waveNumber:state.currentWaveNumber,phase:state.normalWave.phase,
    releasedByNeed:state.normalWave.releasedByNeed,queueByNeed:state.normalWave.queueByNeed});
  frame.current={waveNumber:state.currentWaveNumber,phase:state.normalWave.phase,
    releasedByNeed:state.normalWave.releasedByNeed,queueByNeed:state.normalWave.queueByNeed};
  useFrame((_,delta)=>{
    if(!terrain){const mesh=findIslandTerrain(scene);if(mesh)setTerrain(mesh);}
    const current=runtime.current;if(!current)return;
    current.update(frame.current);
    // Fixed-step, budgeted physical motor: never jump over small terrain seams.
    let remaining=Math.min(Math.max(delta,0),.15);
    for(let n=0;n<3&&remaining>.000001;n++){
      const step=Math.min(remaining,.05);
      current.tick(step);remaining-=step;
    }
  });
  const registry=useMemo(()=>getPublishedPmoRegistry().registry,[world]);
  useEffect(()=>{
    if(!terrain||!world){runtime.current?.dispose();runtime.current=null;setTraffic(null);return;}
    let cancelled=false;
    const task=window.setTimeout(()=>{
      try{
        if(world.graph.schemaVersion!==1)throw Error('LIVE_TRAFFIC_UNSUPPORTED_GRAPH');
        const connector=makePmoTerrainConnector(world.navigationRegistry,makeTerrainProjector(terrain));
        const stamps=readPmoWalkAuthorization(world.navigationRegistry);
        const structures=projectPmoTransitionStructures(registry);
        const accesses=assessPmoTransitionAccess(structures,world.graph);
        const adapted=adaptCompiledPmoGraph(world.graph,connector,stamps,structures,accesses,
          world.landingExtensions,world.liftTransit,world.dockExtensions);
        const graph=auditPmoWalkMotion(adapted.graph,connector).graph;
        const sites=inventoryPmoBuildingSites(registry);
        const approaches=auditedApproaches(graph,BEACH,sites);
        const destinations=siteByNeed(sites,approaches,world.endpoints);
        const instance=new PmoWavePedestrianTraffic(graph,connector,BEACH,destinations,
          adapted.physical,world.liftTransit);
        if(cancelled){instance.dispose();return;}
        runtime.current=instance;setTraffic(instance);
        console.info('PMO_PRODUCTION_PEDESTRIANS_READY',{
          nodes:graph.nodes.length,approvedSites:approaches.size,services:Object.keys(destinations),
          physicalHelpers:adapted.accepted.length});
      }catch(error){
        if(!cancelled){runtime.current=null;setTraffic(null);
          console.warn('PMO_PRODUCTION_PEDESTRIANS_FAIL_CLOSED',error);}
      }
    },0);
    return()=>{cancelled=true;window.clearTimeout(task);if(runtime.current){runtime.current.dispose();runtime.current=null;}};
  },[terrain,world,registry]);
  if(!traffic)return null;
  return <group name="rrh-production-pmo-pedestrian-traffic">
    <PmoBrushCrowdLayer runtime={traffic.pedestrians} capacity={12} liftSeat={id=>traffic.seat(id)} color="#F2C28A" guestRadius={0.029} guestHeight={0.095}/>
  </group>;
}
