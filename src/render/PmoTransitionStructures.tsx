/** Visual projection of authored PMO infrastructure, NOT traversability proof. */
import { useMemo, useRef, useSyncExternalStore } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import type { PmoLiftTransit } from './spatialMeta/pmoLiftTransit';
import { getSpatialSnapshot, subscribeSpatial } from './spatialMeta/registry';
import { getPublishedPmoRegistry } from './spatialMeta/pmoServiceLayout';
import { type PmoLandingExtension } from './spatialMeta/pmoLandingRepair';
import {usePmoNavigationWorld} from './spatialMeta/PmoNavigationScope';
import { PMO_WORLD_ENABLED } from './spatialMeta/PmoNavigationScope';
import { projectPmoTransitionStructures, type PmoStructure } from './spatialMeta/pmoTransitionStructures';
import { PmoBeachGateway } from './PmoBeachGateway';
import { BEACH_GATEWAY_ID } from './spatialMeta/pmoBeachGatewayDesign';
import { BRIDGE8_ID, PmoBridge8Architecture } from './PmoBridge8Architecture';

/** Cabin follows the same PmoLiftTransit state that carries the passenger. */
function LiftVisual({ structure, transit }: { structure: PmoStructure; transit:PmoLiftTransit|null }) {
  const cabin = useRef<Group>(null);
  useFrame(() => {
    if (!cabin.current) return;
    const p=transit?.position(structure.sourceId)??structure.from;
    cabin.current.position.set(p[0],p[1]+0.05,p[2]);
  });
  const midway=structure.from.map((v,i)=>(v+structure.to[i])/2) as [number,number,number];
  const start=new THREE.Vector3(...structure.from),end=new THREE.Vector3(...structure.to);
  const railDirection=end.clone().sub(start),railLength=railDirection.length();
  const railRotation=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),railDirection.clone().normalize());
  return <group name={'pmo-lift-visual:' + structure.sourceId}>
    <mesh raycast={()=>{}} position={midway} quaternion={railRotation}>
      <cylinderGeometry args={[0.016,0.016,railLength,8]}/>
      <meshStandardMaterial color="#758a80" metalness={0.3}/>
    </mesh>
    {[structure.from, structure.to].map((point, i) =>
      <mesh raycast={() => {}} key={i} position={point}>
        <boxGeometry args={[0.38, 0.045, 0.38]} />
        <meshStandardMaterial color="#748c81" roughness={0.83} />
      </mesh>)}
    <group ref={cabin} position={structure.from}>
      <mesh raycast={() => {}}>
        <boxGeometry args={[0.32, 0.06, 0.32]} />
        <meshStandardMaterial color="#dfbf72" metalness={0.16} roughness={0.7} />
      </mesh>
      <mesh raycast={() => {}} position={[0, 0.18, 0]}>
        <boxGeometry args={[0.025, 0.36, 0.025]} />
        <meshStandardMaterial color="#6b837a" />
      </mesh>
    </group>
  </group>;
}
function AuthoredStructure({ structure, transit }: { structure: PmoStructure; transit:PmoLiftTransit|null }) {
  if (structure.kind === 'lift') return <LiftVisual structure={structure} transit={transit}/>;
  return <group name={'pmo-structure-visual:' + structure.sourceId}>
    {structure.segments.map((segment, index) =>
      <mesh raycast={() => {}} key={structure.edgeId + ':' + index}
        position={segment.center} rotation={[segment.pitch, segment.yaw, 0]}>
        <boxGeometry args={[segment.width, 0.034, segment.length]} />
        <meshStandardMaterial color={structure.kind === 'stairs' ? '#c6b298' : '#86a695'} roughness={0.94} />
      </mesh>)}
  </group>;
}
/** Real physical tread geometry paired with the derived navigation edge. */
function CertifiedLanding({extension}:{extension:PmoLandingExtension}){
  return <group name={'pmo-compiled-landing:'+extension.id}>
    {extension.treads.map((step,i)=><mesh key={i} raycast={()=>{}}
      position={step.center} rotation={[0,step.yaw,0]}>
      <boxGeometry args={[step.width,0.034,step.length]}/>
      <meshStandardMaterial color="#c6b298" roughness={0.94}/>
    </mesh>)}
  </group>;
}
export function PmoTransitionStructures() {
  const world=usePmoNavigationWorld();
  const snapshot = useSyncExternalStore(subscribeSpatial, getSpatialSnapshot);
  const registry = useMemo(() => getPublishedPmoRegistry().registry, [snapshot.registry]);
  const structures = useMemo(() => projectPmoTransitionStructures(registry), [registry]);
  if (!PMO_WORLD_ENABLED) return null;
  return <group name="pmo-visual-infrastructure-not-navigation-certified">
    {structures.map(structure => structure.sourceId===BEACH_GATEWAY_ID && world
      ? <PmoBeachGateway key={structure.edgeId} stair={structure} landings={world.landingExtensions} docks={world.dockExtensions}/>
      : structure.sourceId===BRIDGE8_ID && world
      ? <PmoBridge8Architecture key={structure.edgeId} structure={structure} landings={world.landingExtensions} docks={world.dockExtensions}/>
      : <AuthoredStructure key={structure.edgeId} structure={structure} transit={world?.liftTransit??null}/>) }
    {world?.walkPaintLabStamps?.map((p,i)=><mesh key={'lab-paint:'+i} raycast={()=>{}}
      name="pmo-lab-terrain-walk-only" position={[p[0],p[1]+.018,p[2]]}
      rotation={[-Math.PI/2,0,0]}>
      <circleGeometry args={[.105,12]}/>
      <meshBasicMaterial color="#37edd2" transparent opacity={.35} depthWrite={false}/>
    </mesh>)}
    {world?.landingExtensions.filter(extension=>extension.sourceId!==BEACH_GATEWAY_ID&&extension.sourceId!==BRIDGE8_ID).map(extension=><CertifiedLanding key={extension.id} extension={extension}/>) }
    {world?.dockExtensions.filter(extension=>extension.structureSourceId!==BEACH_GATEWAY_ID&&extension.structureSourceId!==BRIDGE8_ID).map(extension=><group key={extension.id} name={'pmo-physical-dock:'+extension.id}>
      {extension.treads.map((tread,i)=><mesh key={i} raycast={()=>{}}
        position={tread.center} rotation={[0,tread.yaw,0]}>
        <boxGeometry args={[tread.width,0.034,tread.length]}/>
        <meshStandardMaterial color={extension.kind==='stairs'?'#b9ad85':'#71998f'} roughness={0.85}/>
      </mesh>)}
    </group>)}
  </group>;
}
