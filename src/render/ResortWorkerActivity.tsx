import {
  useFrame
} from '@react-three/fiber';

import {
  useEffect,
  useMemo,
  useRef
} from 'react';

import {
  Group,
  Material,
  Mesh
} from 'three';

import type {
  BootstrapState,
  NormalWaveNeedId,
  NormalWaveWorkerId,
  WorkerReassignmentImpact
} from '../core/state';

import {
  workerPoint
} from './resortWorldSpatial';

import {
  headingForDirection,
  sampleRoute,
  verticalTraversalOpacity,
  walkingDuration,
  workerTransferRoute
} from './resortNavigationGraph';

import type {
  ResortWorldPoint
} from './resortWorldAnchors';

type Point3 =
  ResortWorldPoint;

function setFigureOpacity(
  root: Group,
  opacity: number
) {
  root.traverse(
    object => {
      if (
        !(
          object instanceof
          Mesh
        )
      ) {
        return;
      }

      const materials =
        Array.isArray(
          object.material
        )
          ? object.material
          : [
              object.material
            ];

      for (
        const material of
        materials
      ) {
        if (
          !(
            material instanceof
            Material
          )
        ) {
          continue;
        }

        if (
          material.userData
            .resortBaseOpacity ===
          undefined
        ) {
          material.userData
            .resortBaseOpacity =
            material.opacity;
        }

        const baseOpacity =
          Number(
            material.userData
              .resortBaseOpacity
          );

        material.transparent =
          true;

        material.opacity =
          baseOpacity *
          opacity;

        material.depthWrite =
          opacity >
          0.96;
      }
    }
  );
}

function smooth(
  value: number
): number {
  return (
    value *
    value *
    (
      3 -
      2 * value
    )
  );
}

function reassignmentKey(
  record:
    | WorkerReassignmentImpact
    | undefined
): string | null {
  return record
    ? `${record.workerId}:${record.from}:${record.to}:${record.simulationTick}:${record.fromCapacityAfter}:${record.toCapacityAfter}`
    : null;
}

function WorkerFigure({
  workerId,
  assignedNeed,
  latestReassignment
}: {
  workerId:
    NormalWaveWorkerId;

  assignedNeed:
    NormalWaveNeedId;

  latestReassignment?:
    WorkerReassignmentImpact;
}) {
  const group =
    useRef<Group | null>(
      null
    );

  const currentKey =
    reassignmentKey(
      latestReassignment
    );

  const seenKey =
    useRef<
      string | null
    >(
      currentKey
    );

  const pendingTransfer =
    useRef<
      WorkerReassignmentImpact |
      null
    >(
      null
    );

  const transferStartedAt =
    useRef<
      number | null
    >(
      null
    );

  const transferRoute =
    useRef<
      readonly Point3[] |
      null
    >(
      null
    );

  const transferDuration =
    useRef(
      1
    );

  const destination =
    workerPoint(
      assignedNeed
    );

  useEffect(
    () => {
      if (
        currentKey ===
        seenKey.current
      ) {
        return;
      }

      seenKey.current =
        currentKey;

      if (
        latestReassignment &&
        latestReassignment.to ===
          assignedNeed
      ) {
        const route =
          workerTransferRoute(
            latestReassignment.from,
            latestReassignment.to
          );

        pendingTransfer.current =
          latestReassignment;

        transferRoute.current =
          route;

        transferDuration.current =
          walkingDuration(
            route,
            2.15,
            0.8,
            6.5
          );

        transferStartedAt.current =
          null;
      }
    },
    [
      assignedNeed,
      currentKey,
      latestReassignment
    ]
  );

  useFrame(
    ({
      clock
    }) => {
      if (
        !group.current
      ) {
        return;
      }

      const transfer =
        pendingTransfer.current;

      const route =
        transferRoute.current;

      if (
        !transfer ||
        !route
      ) {
        setFigureOpacity(
          group.current,
          1
        );

        group.current
          .position.set(
            destination[0],
            destination[1],
            destination[2]
          );

        setFigureOpacity(
          group.current,
          1
        );

        group.current
          .rotation.y =
          0;

        return;
      }

      if (
        transferStartedAt
          .current ===
        null
      ) {
        transferStartedAt.current =
          clock.elapsedTime;
      }

      const elapsed =
        clock.elapsedTime -
        transferStartedAt.current;

      const rawProgress =
        Math.min(
          1,
          elapsed /
            transferDuration.current
        );

      const progress =
        smooth(
          rawProgress
        );

      const sample =
        sampleRoute(
          route,
          progress
        );

      group.current
        .position.set(
          sample.point[0],

          sample.point[1] +
            Math.abs(
              Math.sin(
                elapsed * 9
              )
            ) *
              0.035,

          sample.point[2]
        );

      setFigureOpacity(
        group.current,
        verticalTraversalOpacity(
          sample
        )
      );

      group.current
        .rotation.y =
        headingForDirection(
          sample.direction
        );

      if (
        rawProgress >=
        1
      ) {
        pendingTransfer.current =
          null;

        transferRoute.current =
          null;

        transferStartedAt.current =
          null;

        group.current
          .position.set(
            destination[0],
            destination[1],
            destination[2]
          );

        setFigureOpacity(
          group.current,
          1
        );

        group.current
          .rotation.y =
          0;
      }
    }
  );

  return (
    <group
      ref={group}
      position={
        destination
      }
      data-worker-id={
        workerId
      }
    >
      <mesh
        position={[
          0,
          0.015,
          0
        ]}
        rotation={[
          -Math.PI / 2,
          0,
          0
        ]}
      >
        <ringGeometry
          args={[
            0.16,
            0.23,
            20
          ]}
        />

        <meshBasicMaterial
          color="#8be0ac"
          transparent
          opacity={0.72}
        />
      </mesh>

      <mesh
        castShadow
        position={[
          0,
          0.16,
          0
        ]}
      >
        <boxGeometry
          args={[
            0.16,
            0.32,
            0.16
          ]}
        />

        <meshStandardMaterial
          color="#4f8f6b"
          roughness={0.78}
        />
      </mesh>

      <mesh
        castShadow
        position={[
          0,
          0.4,
          0
        ]}
      >
        <sphereGeometry
          args={[
            0.11,
            10,
            8
          ]}
        />

        <meshStandardMaterial
          color="#d9a47d"
          roughness={0.8}
        />
      </mesh>

      <mesh
        castShadow
        position={[
          0,
          0.5,
          0
        ]}
      >
        <boxGeometry
          args={[
            0.22,
            0.06,
            0.22
          ]}
        />

        <meshStandardMaterial
          color="#ffd56d"
          roughness={0.62}
        />
      </mesh>
    </group>
  );
}

export function ResortWorkerActivity({
  state
}: {
  state: BootstrapState;
}) {
  const assignments =
    Object.entries(
      state.normalWave
        .workerAssignments
    ) as Array<
      [
        NormalWaveWorkerId,
        NormalWaveNeedId
      ]
    >;

  const latestByWorker =
    useMemo(
      () => {
        const latest =
          new Map<
            NormalWaveWorkerId,
            WorkerReassignmentImpact
          >();

        for (
          const record of
          state.normalWave
            .reassignments
        ) {
          latest.set(
            record.workerId,
            record
          );
        }

        return latest;
      },
      [
        state.normalWave
          .reassignments
      ]
    );

  return (
    <>
      {assignments.map(
        (
          [
            workerId,
            need
          ]
        ) => (
          <WorkerFigure
            key={workerId}
            workerId={
              workerId
            }
            assignedNeed={
              need
            }
            latestReassignment={
              latestByWorker.get(
                workerId
              )
            }
          />
        )
      )}
    </>
  );
}
