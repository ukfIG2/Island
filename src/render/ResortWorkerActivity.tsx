import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import type { Group } from 'three';

import type {
  BootstrapState,
  NormalWaveNeedId,
  NormalWaveWorkerId,
  WorkerReassignmentImpact
} from '../core/state';
import { SERVICE_POSITIONS, serviceDepth } from './ResortWorldArt';

type Point3 = readonly [number, number, number];

function workerAnchor(need: NormalWaveNeedId): [number, number, number] {
  const [x, y, z] = SERVICE_POSITIONS[need];
  return [x - 0.48, y + 0.18, z + serviceDepth(need) * 0.82];
}

function transferPoint(from: Point3, to: Point3, progress: number): [number, number, number] {
  const t = progress * progress * (3 - 2 * progress);
  const midpoint: Point3 = [
    (from[0] + to[0]) / 2,
    Math.max(from[1], to[1]) + 0.72,
    (from[2] + to[2]) / 2
  ];
  const u = 1 - t;
  return [
    u * u * from[0] + 2 * u * t * midpoint[0] + t * t * to[0],
    u * u * from[1] + 2 * u * t * midpoint[1] + t * t * to[1],
    u * u * from[2] + 2 * u * t * midpoint[2] + t * t * to[2]
  ];
}

function reassignmentKey(record: WorkerReassignmentImpact | undefined): string | null {
  return record
    ? `${record.workerId}:${record.from}:${record.to}:${record.simulationTick}:${record.fromCapacityAfter}:${record.toCapacityAfter}`
    : null;
}

function WorkerFigure({
  workerId,
  assignedNeed,
  latestReassignment
}: {
  workerId: NormalWaveWorkerId;
  assignedNeed: NormalWaveNeedId;
  latestReassignment?: WorkerReassignmentImpact;
}) {
  const group = useRef<Group | null>(null);
  const currentKey = reassignmentKey(latestReassignment);
  const seenKey = useRef<string | null>(currentKey);
  const pendingTransfer = useRef<WorkerReassignmentImpact | null>(null);
  const transferStartedAt = useRef<number | null>(null);
  const destination = workerAnchor(assignedNeed);

  useEffect(() => {
    if (currentKey === seenKey.current) return;
    seenKey.current = currentKey;
    if (latestReassignment && latestReassignment.to === assignedNeed) {
      pendingTransfer.current = latestReassignment;
      transferStartedAt.current = null;
    }
  }, [assignedNeed, currentKey, latestReassignment]);

  useFrame(({ clock }) => {
    if (!group.current) return;
    const transfer = pendingTransfer.current;
    if (!transfer) {
      group.current.position.set(destination[0], destination[1], destination[2]);
      group.current.rotation.y = 0;
      return;
    }

    if (transferStartedAt.current === null) transferStartedAt.current = clock.elapsedTime;
    const elapsed = clock.elapsedTime - transferStartedAt.current;
    const progress = Math.min(1, elapsed / 0.95);
    const from = workerAnchor(transfer.from);
    const to = workerAnchor(transfer.to);
    const point = transferPoint(from, to, progress);
    group.current.position.set(point[0], point[1] + Math.abs(Math.sin(elapsed * 9)) * 0.035, point[2]);
    group.current.rotation.y = Math.atan2(to[0] - from[0], to[2] - from[2]);

    if (progress >= 1) {
      pendingTransfer.current = null;
      transferStartedAt.current = null;
      group.current.position.set(destination[0], destination[1], destination[2]);
      group.current.rotation.y = 0;
    }
  });

  return <group ref={group} position={destination} data-worker-id={workerId}>
    <mesh position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.16, 0.23, 20]} />
      <meshBasicMaterial color="#8be0ac" transparent opacity={0.72} />
    </mesh>
    <mesh castShadow position={[0, 0.16, 0]}>
      <boxGeometry args={[0.16, 0.32, 0.16]} />
      <meshStandardMaterial color="#4f8f6b" roughness={0.78} />
    </mesh>
    <mesh castShadow position={[0, 0.4, 0]}>
      <sphereGeometry args={[0.11, 10, 8]} />
      <meshStandardMaterial color="#d9a47d" roughness={0.8} />
    </mesh>
    <mesh castShadow position={[0, 0.5, 0]}>
      <boxGeometry args={[0.22, 0.06, 0.22]} />
      <meshStandardMaterial color="#ffd56d" roughness={0.62} />
    </mesh>
  </group>;
}

export function ResortWorkerActivity({ state }: { state: BootstrapState }) {
  const assignments = Object.entries(state.normalWave.workerAssignments).filter(
    (entry): entry is [NormalWaveWorkerId, NormalWaveNeedId] => entry[1] !== undefined
  );

  const latestByWorker = useMemo(() => {
    const latest = new Map<NormalWaveWorkerId, WorkerReassignmentImpact>();
    for (const record of state.normalWave.reassignments) latest.set(record.workerId, record);
    return latest;
  }, [state.normalWave.reassignments]);

  return <>
    {assignments.map(([workerId, need]) => <WorkerFigure
      key={workerId}
      workerId={workerId}
      assignedNeed={need}
      latestReassignment={latestByWorker.get(workerId)}
    />)}
  </>;
}
