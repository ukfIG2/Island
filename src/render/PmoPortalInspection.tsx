/** Visual-only canonical PMO inspection. Never feeds a modified registry to navigation. */
import { useMemo } from 'react';
import * as THREE from 'three';
import { getPublishedPmoRegistry } from './spatialMeta/pmoServiceLayout';
import type { SpatialPoint } from './spatialMeta/registry';

const colors: Record<string,string> = {
  'building_3':'#ffa556','building_8':'#ffa556','building_9':'#ffa556',
  'bridge from place_3 to place_8':'#5fe4fa',
  'lift from place_8 to place_9':'#ed7cf9'
};

export function PmoPortalInspection(){
  const registry=useMemo(()=>getPublishedPmoRegistry().registry,[]);
  const targets=useMemo(()=>registry.objects.filter(o=>o.name in colors).flatMap(o=>{
    if(o.geometry.type!=='skeleton')return [];
    return [{name:o.name,points:Object.values(o.geometry.points) as SpatialPoint[]}];
  }),[registry]);
  return <group name="pmo-authority-inspection-no-graph-edits">
    {targets.flatMap(t=>t.points.map((p,i)=><group key={`${t.name}:${i}`} position={p}>
      <mesh raycast={()=>{}} position={[0,0.1,0]}>
        <sphereGeometry args={[0.10,12,10]}/>
        <meshBasicMaterial color={colors[t.name]} depthTest={false}/>
      </mesh>
      <mesh raycast={()=>{}} rotation={[-Math.PI/2,0,0]} position={[0,0.012,0]}>
        <ringGeometry args={[0.18,0.21,32]}/>
        <meshBasicMaterial color={colors[t.name]} depthTest={false} side={THREE.DoubleSide}/>
      </mesh>
    </group>))}
    {targets.filter(t=>t.points.length===2).map(t=>{
      const mid=t.points[0].map((v,i)=>(v+t.points[1][i])/2) as SpatialPoint;
      const from=new THREE.Vector3(...t.points[0]);const to=new THREE.Vector3(...t.points[1]);
      const len=from.distanceTo(to);
      const rotation=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),to.clone().sub(from).normalize());
      return <mesh key={t.name} name={'pmo-authored-axis:'+t.name} raycast={()=>{}} position={mid} quaternion={rotation}>
        <cylinderGeometry args={[0.025,0.025,len,8]}/>
        <meshBasicMaterial color={colors[t.name]} depthTest={false} transparent opacity={0.85}/>
      </mesh>;
    })}
  </group>;
}
