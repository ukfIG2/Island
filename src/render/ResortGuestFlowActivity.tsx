import {
  useFrame
} from '@react-three/fiber';

import {
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
  NormalWaveNeedId
} from '../core/state';

import {
  guestActivePoint,
  guestExitPoint
} from './resortWorldSpatial';

import {
  guestQueueRoute,
  headingForDirection,
  sampleRoute,
  verticalTraversalOpacity,
  walkingDuration
} from './resortNavigationGraph';

import type {
  ResortWorldPoint
} from './resortWorldAnchors';

type Point3 =
  ResortWorldPoint;

type GuestStage =
  | 'queue'
  | 'active'
  | 'served';

const GUEST_COLORS = [
  '#f1a76a',
  '#6ab4c7',
  '#dd8f9f',
  '#8dbb77',
  '#d8a765'
];

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

function clamp01(
  value: number
): number {
  return Math.min(
    1,
    Math.max(
      0,
      value
    )
  );
}

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

function GuestFigure({
  position,
  color,
  scale = 1
}: {
  position: Point3;
  color: string;
  scale?: number;
}) {
  return (
    <group
      position={[
        ...position
      ]}
      scale={scale}
    >
      <mesh
        castShadow
        position={[
          0,
          0.14,
          0
        ]}
      >
        <boxGeometry
          args={[
            0.1,
            0.23,
            0.1
          ]}
        />

        <meshStandardMaterial
          color={color}
          roughness={0.8}
        />
      </mesh>

      <mesh
        castShadow
        position={[
          0,
          0.32,
          0
        ]}
      >
        <sphereGeometry
          args={[
            0.075,
            8,
            6
          ]}
        />

        <meshStandardMaterial
          color="#e4b28f"
          roughness={0.82}
        />
      </mesh>
    </group>
  );
}

function AnimatedGuest({
  need,
  index,
  stage
}: {
  need: NormalWaveNeedId;
  index: number;
  stage: GuestStage;
}) {
  const group =
    useRef<Group | null>(
      null
    );

  const startedAt =
    useRef<number | null>(
      null
    );

  const active =
    guestActivePoint(
      need,
      index
    );

  const exit =
    guestExitPoint(
      need,
      index
    );

  const queueRoute =
    useMemo(
      () =>
        guestQueueRoute(
          need,
          index
        ),
      [
        need,
        index
      ]
    );

  const queueDuration =
    useMemo(
      () =>
        walkingDuration(
          queueRoute,
          1.85,
          0.85,
          5.5
        ),
      [
        queueRoute
      ]
    );

  useFrame(
    ({
      clock
    }) => {
      if (!group.current) {
        return;
      }

      if (
        startedAt.current ===
        null
      ) {
        startedAt.current =
          clock.elapsedTime;
      }

      const elapsed =
        clock.elapsedTime -
        startedAt.current;

      const t =
        elapsed +
        index * 0.41;

      if (
        stage ===
        'queue'
      ) {
        const delay =
          index * 0.10;

        const rawProgress =
          clamp01(
            (
              elapsed -
              delay
            ) /
              queueDuration
          );

        const travel =
          smooth(
            rawProgress
          );

        const sample =
          sampleRoute(
            queueRoute,
            travel
          );

        group.current
          .position.set(
            sample.point[0],

            sample.point[1] +
              Math.abs(
                Math.sin(
                  t * 7
                )
              ) *
                0.025,

            sample.point[2]
          );

        setFigureOpacity(
          group.current,
          verticalTraversalOpacity(
            sample
          )
        );

        if (
          rawProgress <
          1
        ) {
          group.current
            .rotation.y =
            headingForDirection(
              sample.direction
            );
        }

        return;
      }

      if (
        stage ===
        'active'
      ) {
        setFigureOpacity(
          group.current,
          1
        );

        group.current
          .position.set(
            active[0],

            active[1] +
              Math.sin(
                t * 3.4
              ) *
                0.025,

            active[2]
          );

        group.current
          .rotation.y =
          Math.sin(
            t * 1.2
          ) *
          0.18;

        return;
      }

      setFigureOpacity(
        group.current,
        1
      );

      const progress =
        smooth(
          (
            (
              elapsed +
              index * 0.33
            ) %
            3.6
          ) /
          3.6
        );

      const dx =
        exit[0] -
        active[0];

      const dz =
        exit[2] -
        active[2];

      group.current
        .position.set(
          active[0] +
            (
              exit[0] -
              active[0]
            ) *
              progress,

          active[1] +
            (
              exit[1] -
              active[1]
            ) *
              progress +
            Math.abs(
              Math.sin(
                t * 7.5
              )
            ) *
              0.025,

          active[2] +
            (
              exit[2] -
              active[2]
            ) *
              progress
        );

      group.current
        .rotation.y =
        Math.atan2(
          dx,
          dz
        );
    }
  );

  return (
    <group
      ref={group}
    >
      <GuestFigure
        position={[
          0,
          0,
          0
        ]}
        color={
          GUEST_COLORS[
            index %
              GUEST_COLORS.length
          ]
        }
        scale={
          stage ===
          'active'
            ? 1.05
            : 1
        }
      />
    </group>
  );
}

export function ResortGuestFlowActivity({
  state
}: {
  state: BootstrapState;
}) {
  const wave =
    state.normalWave;

  return (
    <>
      {wave.activeNeedIds.map(
        (
          need,
          needIndex
        ) => {
          const queued =
            Math.min(
              wave.queueByNeed[
                need
              ],
              5
            );

          const active =
            Math.min(
              wave.activeByNeed[
                need
              ],
              3
            );

          const served =
            wave.phase ===
              'incoming' ||
            wave.phase ===
              'draining'
              ? Math.min(
                  wave.servedByNeed[
                    need
                  ],
                  3
                )
              : 0;

          return (
            <group
              key={need}
            >
              {Array.from({
                length:
                  queued
              }).map(
                (
                  _,
                  index
                ) => (
                  <AnimatedGuest
                    key={
                      `queue-${need}-${index}`
                    }
                    need={need}
                    index={
                      index +
                      needIndex
                    }
                    stage="queue"
                  />
                )
              )}

              {Array.from({
                length:
                  active
              }).map(
                (
                  _,
                  index
                ) => (
                  <AnimatedGuest
                    key={
                      `active-${need}-${index}`
                    }
                    need={need}
                    index={
                      index +
                      needIndex +
                      2
                    }
                    stage="active"
                  />
                )
              )}

              {Array.from({
                length:
                  served
              }).map(
                (
                  _,
                  index
                ) => (
                  <AnimatedGuest
                    key={
                      `served-${need}-${index}`
                    }
                    need={need}
                    index={
                      index +
                      needIndex +
                      4
                    }
                    stage="served"
                  />
                )
              )}
            </group>
          );
        }
      )}
    </>
  );
}
