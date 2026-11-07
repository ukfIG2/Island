/**
 * Read-only R3F visualization for PMO pedestrians.
 * Important: useFrame NEVER advances simulation or emits receipts/rewards.
 * The owner outside React must call PmoPedestrianRuntime.tick() on its own clock.
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { PmoPedestrianRuntime } from './spatialMeta/pmoPedestrianRuntime';

export interface PmoBrushCrowdLayerProps {
  runtime: PmoPedestrianRuntime;
  capacity?: number;
  color?: string;
  guestRadius?: number;
  guestHeight?: number;
  /** Cabin seat rendering only; never changes the physical motor position. */
  liftSeat?: (actorId:string)=>number|null;
}

export function PmoBrushCrowdLayer({
  runtime,
  capacity = 256,
  color = '#F6CF7C',
  guestRadius = 0.026,
  guestHeight = 0.075,
  liftSeat,
}: PmoBrushCrowdLayerProps) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame(() => {
    const instanced = mesh.current;
    if (!instanced) return;
    const positions = runtime.snapshots();
    const count = Math.min(capacity, positions.length);
    for (let i = 0; i < count; i++) {
      const position = positions[i].position;
      const seat=positions[i].status==='crossing-helper'?liftSeat?.(positions[i].id):null;
      const ox=seat==null?0:(seat%2===0?-0.05:0.05);
      const oz=seat==null?0:(Math.floor(seat/2)-2)*0.06;
      dummy.position.set(position[0]+ox, position[1] + guestHeight * 0.5 + guestRadius, position[2]+oz);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      instanced.setMatrixAt(i, dummy.matrix);
    }
    instanced.count = count;
    if (count) instanced.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, capacity]} frustumCulled={false}>
      <capsuleGeometry args={[guestRadius, guestHeight, 4, 8]} />
      <meshStandardMaterial color={color} roughness={0.86} />
    </instancedMesh>
  );
}
