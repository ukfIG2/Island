import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Group } from 'three';

import {
  arrivalCompositionForWave,
  arrivalCraftProjection,
  type ArrivalSourceKind
} from '../core/arrivalComposition';
import type { BootstrapState } from '../core/state';

type Point3 = readonly [number, number, number];

function smooth(value: number): number {
  return value * value * (3 - 2 * value);
}

function curve(start: Point3, control: Point3, end: Point3, t: number): [number, number, number] {
  const u = 1 - t;
  return [
    u * u * start[0] + 2 * u * t * control[0] + t * t * end[0],
    u * u * start[1] + 2 * u * t * control[1] + t * t * end[1],
    u * u * start[2] + 2 * u * t * control[2] + t * t * end[2]
  ];
}

function heading(start: Point3, control: Point3, end: Point3, t: number): number {
  const dx = 2 * (1 - t) * (control[0] - start[0]) + 2 * t * (end[0] - control[0]);
  const dz = 2 * (1 - t) * (control[2] - start[2]) + 2 * t * (end[2] - control[2]);
  return Math.atan2(-dz, dx);
}

function Wake({ active, scale = 1 }: { active: boolean; scale?: number }) {
  if (!active) return null;
  return <group position={[-0.75 * scale, -0.17, 0]}>
    <mesh rotation={[-Math.PI / 2, 0, 0]} scale={[2.2 * scale, 0.55, 1]}>
      <ringGeometry args={[0.18, 0.28, 18]} />
      <meshBasicMaterial color="#e5fbf4" transparent opacity={0.5} />
    </mesh>
    <mesh position={[-0.45 * scale, -0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[2.6 * scale, 0.4, 1]}>
      <ringGeometry args={[0.14, 0.22, 18]} />
      <meshBasicMaterial color="#d8f7ef" transparent opacity={0.3} />
    </mesh>
  </group>;
}

function SeaCraft({ source, progress, lane }: {
  source: Exclude<ArrivalSourceKind, 'seaplane'>;
  progress: number;
  lane: number;
}) {
  const group = useRef<Group | null>(null);
  const t = smooth(progress);
  const start: Point3 = [-9.15, -0.21, 6.15 + lane * 0.92];
  const control: Point3 = [-7.05, -0.15, 5.45 + lane * 0.56];
  const end: Point3 = [-5.18, -0.08, 3.92 + lane * 0.28];
  const position = curve(start, control, end, t);
  const yaw = heading(start, control, end, t);
  const ferry = source === 'ferry';
  const speedboat = source === 'speedboats';
  const length = ferry ? 2.35 : speedboat ? 1.05 : 1.42;
  const width = ferry ? 1.02 : speedboat ? 0.46 : 0.56;

  useFrame(({ clock }) => {
    if (!group.current) return;
    group.current.position.y = position[1] + Math.sin(clock.elapsedTime * (speedboat ? 3.4 : 1.9) + lane) * (ferry ? 0.018 : 0.035);
    group.current.rotation.z = Math.sin(clock.elapsedTime * 1.5 + lane) * (ferry ? 0.008 : 0.018);
  });

  return <group ref={group} position={position} rotation={[0, yaw, 0]}>
    <Wake active={progress > 0.03 && progress < 0.98} scale={ferry ? 1.35 : 1} />
    <mesh castShadow position={[0, 0.02, 0]}>
      <boxGeometry args={[length, ferry ? 0.34 : 0.22, width]} />
      <meshStandardMaterial color={speedboat ? '#df6849' : ferry ? '#f3e4bd' : '#f1d99d'} roughness={0.72} />
    </mesh>
    <mesh castShadow position={[length * 0.5 + 0.16, 0.02, 0]} rotation={[0, 0, -Math.PI / 2]}>
      <coneGeometry args={[width * 0.54, ferry ? 0.5 : 0.42, 4]} />
      <meshStandardMaterial color={speedboat ? '#c64d3d' : ferry ? '#e6c98f' : '#dcbd79'} />
    </mesh>
    {ferry ? <>
      <mesh castShadow position={[-0.12, 0.42, 0]}>
        <boxGeometry args={[1.35, 0.52, 0.78]} />
        <meshStandardMaterial color="#d9eee6" roughness={0.42} />
      </mesh>
      <mesh castShadow position={[-0.2, 0.79, 0]}>
        <boxGeometry args={[0.82, 0.22, 0.66]} />
        <meshStandardMaterial color="#f4e8c8" />
      </mesh>
      {[-0.43, -0.08, 0.27].map((x) => <mesh key={x} position={[x, 0.45, -0.405]}>
        <boxGeometry args={[0.18, 0.17, 0.025]} />
        <meshStandardMaterial color="#34748a" emissive="#173946" emissiveIntensity={0.18} />
      </mesh>)}
    </> : speedboat ? <>
      <mesh castShadow position={[-0.08, 0.25, 0]}>
        <boxGeometry args={[0.42, 0.18, 0.35]} />
        <meshStandardMaterial color="#4e8995" metalness={0.08} roughness={0.34} />
      </mesh>
      <mesh castShadow position={[-0.52, 0.07, 0]}>
        <boxGeometry args={[0.13, 0.24, 0.34]} />
        <meshStandardMaterial color="#4b4b46" />
      </mesh>
    </> : <>
      <mesh castShadow position={[-0.12, 0.28, 0]}>
        <boxGeometry args={[0.52, 0.3, 0.42]} />
        <meshStandardMaterial color="#5da5aa" roughness={0.45} />
      </mesh>
      <mesh castShadow position={[-0.54, 0.12, 0]}>
        <boxGeometry args={[0.16, 0.22, 0.4]} />
        <meshStandardMaterial color="#6d5a43" />
      </mesh>
    </>}
  </group>;
}

function Seaplane({ progress, lane }: { progress: number; lane: number }) {
  const group = useRef<Group | null>(null);
  const propeller = useRef<Group | null>(null);
  const t = smooth(progress);
  const start: Point3 = [8.8, 4.65 + lane * 0.26, -7.65];
  const control: Point3 = [7.1, 1.9 + lane * 0.18, 0.55];
  const end: Point3 = [4.25, -0.06, 4.75 + lane * 0.32];
  const position = curve(start, control, end, t);
  const yaw = heading(start, control, end, t);

  useFrame(({ clock }, delta) => {
    if (propeller.current) propeller.current.rotation.x += delta * 18;
    if (!group.current) return;
    const landed = progress > 0.84;
    group.current.position.y = position[1] + Math.sin(clock.elapsedTime * (landed ? 2.2 : 1.1) + lane) * (landed ? 0.025 : 0.035);
    group.current.rotation.z = landed ? 0 : Math.sin(clock.elapsedTime * 0.65 + lane) * 0.028;
  });

  return <group ref={group} position={position} rotation={[0, yaw, 0]}>
    <Wake active={progress > 0.76 && progress < 0.99} scale={1.25} />
    <mesh castShadow><boxGeometry args={[1.55, 0.28, 0.34]} /><meshStandardMaterial color="#f0deb0" /></mesh>
    <mesh castShadow position={[0.05, 0.03, 0]}><boxGeometry args={[0.42, 0.09, 2.25]} /><meshStandardMaterial color="#c96449" /></mesh>
    <mesh castShadow position={[-0.57, 0.18, 0]}><boxGeometry args={[0.4, 0.22, 0.28]} /><meshStandardMaterial color="#4a8390" /></mesh>
    <mesh castShadow position={[-0.56, 0.05, 0]}><boxGeometry args={[0.5, 0.07, 0.9]} /><meshStandardMaterial color="#d6c48f" /></mesh>
    {[0.52, -0.52].map((z) => <mesh key={z} castShadow position={[0.12, -0.26, z]}><boxGeometry args={[0.9, 0.09, 0.13]} /><meshStandardMaterial color="#e9d7a2" /></mesh>)}
    <group ref={propeller} position={[0.82, 0.02, 0]}>
      <mesh><boxGeometry args={[0.035, 0.78, 0.06]} /><meshStandardMaterial color="#59483c" /></mesh>
      <mesh><boxGeometry args={[0.035, 0.06, 0.78]} /><meshStandardMaterial color="#59483c" /></mesh>
    </group>
  </group>;
}

function TransferGuest({ index, source }: { index: number; source: ArrivalSourceKind }) {
  const group = useRef<Group | null>(null);
  const startedAt = useRef<number | null>(null);
  const from: Point3 = source === 'seaplane' ? [4.05, 0.48, 4.35] : [-4.72, 0.48, 3.34];
  const via: Point3 = source === 'seaplane' ? [2.7, 0.51, 3.25] : [-3.35, 0.51, 2.78];
  const to: Point3 = source === 'seaplane' ? [1.45, 0.53, 2.0] : [-1.62, 0.53, 1.58];

  useFrame(({ clock }) => {
    if (!group.current) return;
    if (startedAt.current === null) startedAt.current = clock.elapsedTime;
    const elapsed = clock.elapsedTime - startedAt.current;
    const t = smooth(Math.min(1, elapsed * 0.28));
    const position = curve(from, via, to, t);
    group.current.position.set(position[0], position[1] + Math.abs(Math.sin(elapsed * 7 + index)) * 0.025, position[2]);
  });

  return <group ref={group} position={from}>
    <mesh castShadow position={[0, 0.14, 0]}><boxGeometry args={[0.1, 0.23, 0.1]} /><meshStandardMaterial color={index % 3 === 0 ? '#f1a76a' : index % 3 === 1 ? '#6ab4c7' : '#dd8f9f'} /></mesh>
    <mesh castShadow position={[0, 0.32, 0]}><sphereGeometry args={[0.075, 8, 6]} /><meshStandardMaterial color="#e4b28f" /></mesh>
  </group>;
}

export function ResortArrivalActivity({ state }: { state: BootstrapState }) {
  const wave = state.normalWave;
  const totalDemand = wave.activeNeedIds.reduce((sum, need) => sum + wave.demandTargetByNeed[need], 0);
  const composition = arrivalCompositionForWave(state.currentWaveNumber);
  const craft = arrivalCraftProjection(state.currentWaveNumber, wave.phase, wave.releasedDemand, totalDemand);
  const visibleGuests = Math.min(composition.visibleGuestLimit, wave.releasedDemand);

  return <>
    {craft.map((item) => item.source === 'seaplane'
      ? <Seaplane key={item.id} progress={item.progress} lane={item.lane} />
      : <SeaCraft key={item.id} source={item.source} progress={item.progress} lane={item.lane} />)}
    {Array.from({ length: visibleGuests }).map((_, index) => <TransferGuest key={`arrival-transfer-${index}`} index={index} source={composition.source} />)}
  </>;
}
