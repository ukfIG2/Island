import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Group } from 'three';

import type { BootstrapState, NormalWaveNeedId } from '../core/state';
import { SERVICE_POSITIONS, serviceDepth } from './ResortWorldArt';

type Point3 = readonly [number, number, number];
type GuestStage = 'queue' | 'active' | 'served';

const HANDOFF: Point3 = [-1.62, 0.53, 1.58];

const GUEST_COLORS = ['#f1a76a', '#6ab4c7', '#dd8f9f', '#8dbb77', '#d8a765'];

function smooth(value: number): number {
  return value * value * (3 - 2 * value);
}

function GuestFigure({ position, color, scale = 1 }: { position: Point3; color: string; scale?: number }) {
  return <group position={[...position]} scale={scale}>
    <mesh castShadow position={[0, 0.14, 0]}><boxGeometry args={[0.1, 0.23, 0.1]} /><meshStandardMaterial color={color} roughness={0.8} /></mesh>
    <mesh castShadow position={[0, 0.32, 0]}><sphereGeometry args={[0.075, 8, 6]} /><meshStandardMaterial color="#e4b28f" roughness={0.82} /></mesh>
  </group>;
}

function queueTarget(need: NormalWaveNeedId, index: number): Point3 {
  const [x, y, z] = SERVICE_POSITIONS[need];
  const depth = serviceDepth(need);
  return [x - 0.62 + (index % 3) * 0.28, y + 0.12, z + depth * 1.12 + Math.floor(index / 3) * 0.3];
}

function activeTarget(need: NormalWaveNeedId, index: number): Point3 {
  const [x, y, z] = SERVICE_POSITIONS[need];
  const depth = serviceDepth(need);
  const side = index % 2 === 0 ? -1 : 1;
  return [x + side * 0.34, y + 0.12, z + depth * 0.62 - Math.floor(index / 2) * 0.16];
}

function exitTarget(need: NormalWaveNeedId, index: number): Point3 {
  const [x, y, z] = SERVICE_POSITIONS[need];
  const sx = Math.sign(x || (index % 2 ? 1 : -1));
  const sz = Math.sign(z || 1);
  return [x + sx * (1.15 + index * 0.22), y + 0.08, z + sz * (0.9 + index * 0.2)];
}

function AnimatedGuest({ need, index, stage }: { need: NormalWaveNeedId; index: number; stage: GuestStage }) {
  const group = useRef<Group | null>(null);
  const startedAt = useRef<number | null>(null);
  const queue = queueTarget(need, index);
  const active = activeTarget(need, index);
  const exit = exitTarget(need, index);

  useFrame(({ clock }) => {
    if (!group.current) return;
    if (startedAt.current === null) startedAt.current = clock.elapsedTime;
    const elapsed = clock.elapsedTime - startedAt.current;
    const t = elapsed + index * 0.41;

    if (stage === 'queue') {
      const travel = smooth(Math.min(1, Math.max(0, elapsed * 0.72 - index * 0.1)));
      const x = HANDOFF[0] + (queue[0] - HANDOFF[0]) * travel;
      const z = HANDOFF[2] + (queue[2] - HANDOFF[2]) * travel;
      group.current.position.set(x, queue[1] + Math.abs(Math.sin(t * 7)) * 0.025, z);
      return;
    }

    if (stage === 'active') {
      group.current.position.set(active[0], active[1] + Math.sin(t * 3.4) * 0.025, active[2]);
      group.current.rotation.y = Math.sin(t * 1.2) * 0.18;
      return;
    }

    const progress = smooth(((elapsed + index * 0.33) % 3.6) / 3.6);
    group.current.position.set(
      active[0] + (exit[0] - active[0]) * progress,
      active[1] + Math.abs(Math.sin(t * 7.5)) * 0.025,
      active[2] + (exit[2] - active[2]) * progress
    );
  });

  return <group ref={group}>
    <GuestFigure position={[0, 0, 0]} color={GUEST_COLORS[index % GUEST_COLORS.length]} scale={stage === 'active' ? 1.05 : 1} />
  </group>;
}

export function ResortGuestFlowActivity({ state }: { state: BootstrapState }) {
  const wave = state.normalWave;

  return <>
    {wave.activeNeedIds.map((need, needIndex) => {
      const queued = Math.min(wave.queueByNeed[need], 5);
      const active = Math.min(wave.activeByNeed[need], 3);
      const served = wave.phase === 'incoming' || wave.phase === 'draining' ? Math.min(wave.servedByNeed[need], 2) : 0;
      return <group key={need}>
        {Array.from({ length: queued }).map((_, index) => <AnimatedGuest key={`queue-${need}-${index}`} need={need} index={index + needIndex} stage="queue" />)}
        {Array.from({ length: active }).map((_, index) => <AnimatedGuest key={`active-${need}-${index}`} need={need} index={index + needIndex + 2} stage="active" />)}
        {Array.from({ length: served }).map((_, index) => <AnimatedGuest key={`served-${need}-${index}`} need={need} index={index + needIndex + 4} stage="served" />)}
      </group>;
    })}
  </>;
}
