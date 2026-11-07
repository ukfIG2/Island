import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import type { Group } from 'three';
import type {IslandWaterBoundary} from './islandWaterBoundary';
import {type SeaPaintStroke,type SeaPoint} from './seaCoastNavigation';
import {planSeaArrivalV4,RRH_CRAFT_PROFILE} from './seaManeuverPlanner';
import {SeaManeuverController} from './seaManeuverController';

import {
  arrivalCompositionForWave,
  arrivalCraftProjection,
  type ArrivalSourceKind
} from '../core/arrivalComposition';

import type {
  BootstrapState
} from '../core/state';

import {
  RESORT_WORLD_ANCHORS,
  type ResortWorldPoint
} from './resortWorldAnchors';

import {
  BEACH_ARRIVAL,
  GUEST_HANDOFF
} from './resortWorldSpatial';

type Point3 = ResortWorldPoint;

const SEA_SURFACE_Y = -0.70;

function smooth(value: number): number {
  return value * value * (3 - 2 * value);
}

function curve(
  start: Point3,
  control: Point3,
  end: Point3,
  t: number
): [number, number, number] {
  const u = 1 - t;

  return [
    u * u * start[0] +
      2 * u * t * control[0] +
      t * t * end[0],

    u * u * start[1] +
      2 * u * t * control[1] +
      t * t * end[1],

    u * u * start[2] +
      2 * u * t * control[2] +
      t * t * end[2]
  ];
}

function heading(
  start: Point3,
  control: Point3,
  end: Point3,
  t: number
): number {
  const dx =
    2 *
      (1 - t) *
      (control[0] - start[0]) +
    2 *
      t *
      (end[0] - control[0]);

  const dz =
    2 *
      (1 - t) *
      (control[2] - start[2]) +
    2 *
      t *
      (end[2] - control[2]);

  return Math.atan2(-dz, dx);
}

function offshorePoint(
  distance: number,
  laneOffset: number,
  y: number
): Point3 {
  const bx = BEACH_ARRIVAL[0];
  const bz = BEACH_ARRIVAL[2];

  const length =
    Math.hypot(bx, bz) || 1;

  const outwardX = bx / length;
  const outwardZ = bz / length;

  const sideX = -outwardZ;
  const sideZ = outwardX;

  return [
    bx +
      outwardX * distance +
      sideX * laneOffset,

    y,

    bz +
      outwardZ * distance +
      sideZ * laneOffset
  ];
}

function Wake({
  active,
  scale = 1
}: {
  active: boolean;
  scale?: number;
}) {
  if (!active) return null;

  return (
    <group
      position={[
        -0.75 * scale,
        -0.17,
        0
      ]}
    >
      <mesh
        rotation={[
          -Math.PI / 2,
          0,
          0
        ]}
        scale={[
          2.2 * scale,
          0.55,
          1
        ]}
      >
        <ringGeometry
          args={[0.18, 0.28, 18]}
        />

        <meshBasicMaterial
          color="#e5fbf4"
          transparent
          opacity={0.5}
        />
      </mesh>

      <mesh
        position={[
          -0.45 * scale,
          -0.01,
          0
        ]}
        rotation={[
          -Math.PI / 2,
          0,
          0
        ]}
        scale={[
          2.6 * scale,
          0.4,
          1
        ]}
      >
        <ringGeometry
          args={[0.14, 0.22, 18]}
        />

        <meshBasicMaterial
          color="#d8f7ef"
          transparent
          opacity={0.3}
        />
      </mesh>
    </group>
  );
}

function SeaCraft({
  source,progress,lane,boundary,beachStrokes,waveNumber
}: {
  source: Exclude<ArrivalSourceKind,'seaplane'>;
  progress:number;
  lane:number;
  boundary:IslandWaterBoundary|null;
  beachStrokes:readonly SeaPaintStroke[];
  waveNumber:number;
}) {
  const group=useRef<Group|null>(null);
  const displayProgress=useRef(0);
  const route=useMemo(()=>{
    if(!boundary||!beachStrokes.length)return null;
    try {
      // Distinct, deterministic random point IN the stamped discs for every
      // craft and wave. Pure presentation: no game-Core random draws.
      let seed=(Math.imul(waveNumber+1,2654435761)^(Math.round((lane+6)*1000)*40503)^
        (source==='ferry'?131:source==='speedboats'?997:311))>>>0;
      const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
      const laneOffset=(lane-.5)*.55;
      const entry=offshorePoint(6.5,laneOffset,SEA_SURFACE_Y);
      const sourceAtSea:SeaPoint=[entry[0],-2.35,entry[2]];
      // Production projection retains only arriving semantics; no invented
      // turnaround timing or Core wave commands.
      const plan=planSeaArrivalV4({boundary,beachStrokes,random},sourceAtSea,
        {...RRH_CRAFT_PROFILE,hullLength:source==='ferry'?2.35:source==='speedboats'?1.05:1.42,
          beam:source==='ferry'?1.02:source==='speedboats'?.46:.56});
      const motor=new SeaManeuverController(plan);
      if(typeof window!=='undefined'&&new URLSearchParams(window.location.search).get('seaRouteDebug')==='1')
        console.info('RRH_LIVE_SEA_PIPELINE_V4_ACTIVE',{waveNumber,source,lane,
          brushTarget:plan.brushTarget,dock:plan.dockPose.position,lens:plan.lensEntry.position});
      return {plan,motor,length:plan.arrival.slice(1).reduce((sum,p,i)=>sum+
        Math.hypot(p[0]-plan.arrival[i][0],p[2]-plan.arrival[i][2]),0)};
    }catch(error){console.error('RRH_LIVE_SEA_ROUTE_NOT_CERTIFIED',error);return null;}
  },[source,lane,boundary,beachStrokes,waveNumber]);
  const initial=useMemo(()=>route?route.motor.previewArrival(0):null,[route]);
  const position:[number,number,number]=initial?.position?[initial.position[0],SEA_SURFACE_Y,initial.position[2]]:[0,SEA_SURFACE_Y,0];
  const yaw=initial?.heading??0;

  const ferry =
    source === 'ferry';

  const speedboat =
    source === 'speedboats';

  const length =
    ferry
      ? 2.35
      : speedboat
        ? 1.05
        : 1.42;

  const width =
    ferry
      ? 1.02
      : speedboat
        ? 0.46
        : 0.56;

  useFrame(({ clock }, delta) => {
    if (!group.current||!route)return;
    let next=displayProgress.current>progress+.08?progress:Math.min(progress,displayProgress.current+
      Math.min(.08,Math.max(0,delta))*2.0/Math.max(1,route.length));
    const maxYaw=Math.max(0,delta)*RRH_CRAFT_PROFILE.maxYawRate;
    const deltaAngle=(at:number)=>{
      const targetYaw=route.motor.previewArrival(smooth(at)).heading;
      return Math.abs(Math.atan2(Math.sin(targetYaw-group.current!.rotation.y),
        Math.cos(targetYaw-group.current!.rotation.y)));
    };
    if(next>displayProgress.current && deltaAngle(next)>maxYaw){
      let lo=displayProgress.current,hi=next;
      for(let i=0;i<18;i++){
        const mid=(lo+hi)*.5;
        if(deltaAngle(mid)<=maxYaw)lo=mid;else hi=mid;
      }
      next=lo;
    }
    displayProgress.current=next;
    const sample=route.motor.previewArrival(smooth(next));
    group.current.position.set(sample.position[0],SEA_SURFACE_Y,sample.position[2]);
    group.current.position.y+=Math.sin(clock.elapsedTime*(speedboat?3.4:1.9)+lane)*
      (ferry?.018:.035);
    group.current.rotation.y=sample.heading;
    group.current.rotation.z=Math.sin(clock.elapsedTime*1.5+lane)*(ferry?.008:.018);
  });
  if(!route)return null;

  return (
    <group
      ref={group}
      position={position}
      rotation={[0, yaw, 0]}
    >
      <Wake
        active={
          progress > 0.03 &&
          progress < 0.98
        }
        scale={ferry ? 1.35 : 1}
      />

      <mesh
        castShadow
        position={[0, 0.02, 0]}
      >
        <boxGeometry
          args={[
            length,
            ferry ? 0.34 : 0.22,
            width
          ]}
        />

        <meshStandardMaterial
          color={
            speedboat
              ? '#df6849'
              : ferry
                ? '#f3e4bd'
                : '#f1d99d'
          }
          roughness={0.72}
        />
      </mesh>

      <mesh
        castShadow
        position={[
          length * 0.5 + 0.16,
          0.02,
          0
        ]}
        rotation={[
          0,
          0,
          -Math.PI / 2
        ]}
      >
        <coneGeometry
          args={[
            width * 0.54,
            ferry ? 0.5 : 0.42,
            4
          ]}
        />

        <meshStandardMaterial
          color={
            speedboat
              ? '#c64d3d'
              : ferry
                ? '#e6c98f'
                : '#dcbd79'
          }
        />
      </mesh>

      {ferry ? (
        <>
          <mesh
            castShadow
            position={[-0.12, 0.42, 0]}
          >
            <boxGeometry
              args={[1.35, 0.52, 0.78]}
            />
            <meshStandardMaterial
              color="#d9eee6"
              roughness={0.42}
            />
          </mesh>

          <mesh
            castShadow
            position={[-0.2, 0.79, 0]}
          >
            <boxGeometry
              args={[0.82, 0.22, 0.66]}
            />
            <meshStandardMaterial
              color="#f4e8c8"
            />
          </mesh>

          {[
            -0.43,
            -0.08,
            0.27
          ].map(x => (
            <mesh
              key={x}
              position={[
                x,
                0.45,
                -0.405
              ]}
            >
              <boxGeometry
                args={[
                  0.18,
                  0.17,
                  0.025
                ]}
              />

              <meshStandardMaterial
                color="#34748a"
                emissive="#173946"
                emissiveIntensity={0.18}
              />
            </mesh>
          ))}
        </>
      ) : speedboat ? (
        <>
          <mesh
            castShadow
            position={[-0.08, 0.25, 0]}
          >
            <boxGeometry
              args={[
                0.42,
                0.18,
                0.35
              ]}
            />

            <meshStandardMaterial
              color="#4e8995"
              metalness={0.08}
              roughness={0.34}
            />
          </mesh>

          <mesh
            castShadow
            position={[-0.52, 0.07, 0]}
          >
            <boxGeometry
              args={[
                0.13,
                0.24,
                0.34
              ]}
            />

            <meshStandardMaterial
              color="#4b4b46"
            />
          </mesh>
        </>
      ) : (
        <>
          <mesh
            castShadow
            position={[-0.12, 0.28, 0]}
          >
            <boxGeometry
              args={[
                0.52,
                0.3,
                0.42
              ]}
            />

            <meshStandardMaterial
              color="#5da5aa"
              roughness={0.45}
            />
          </mesh>

          <mesh
            castShadow
            position={[-0.54, 0.12, 0]}
          >
            <boxGeometry
              args={[
                0.16,
                0.22,
                0.4
              ]}
            />

            <meshStandardMaterial
              color="#6d5a43"
            />
          </mesh>
        </>
      )}
    </group>
  );
}

function Seaplane({
  progress,
  lane
}: {
  progress: number;
  lane: number;
}) {
  const group =
    useRef<Group | null>(null);

  const propeller =
    useRef<Group | null>(null);

  const t = smooth(progress);

  const laneOffset =
    (lane - 0.5) * 0.6;

  const start =
    offshorePoint(
      7.4,
      laneOffset,
      4.6
    );

  const control =
    offshorePoint(
      3.9,
      laneOffset * 0.6,
      2.0
    );

  const end =
    offshorePoint(
      0.95,
      laneOffset * 0.3,
      SEA_SURFACE_Y + 0.05
    );

  const position =
    curve(
      start,
      control,
      end,
      t
    );

  const yaw =
    heading(
      start,
      control,
      end,
      t
    );

  useFrame(
    ({ clock }, delta) => {
      if (propeller.current) {
        propeller.current.rotation.x +=
          delta * 18;
      }

      if (!group.current) return;

      const landed =
        progress > 0.84;

      group.current.position.y =
        position[1] +
        Math.sin(
          clock.elapsedTime *
            (landed ? 2.2 : 1.1) +
            lane
        ) *
          (landed ? 0.025 : 0.035);

      group.current.rotation.z =
        landed
          ? 0
          : Math.sin(
              clock.elapsedTime *
                0.65 +
                lane
            ) * 0.028;
    }
  );

  return (
    <group
      ref={group}
      position={position}
      rotation={[0, yaw, 0]}
    >
      <Wake
        active={
          progress > 0.76 &&
          progress < 0.99
        }
        scale={1.25}
      />

      <mesh castShadow>
        <boxGeometry
          args={[1.55, 0.28, 0.34]}
        />
        <meshStandardMaterial
          color="#f0deb0"
        />
      </mesh>

      <mesh
        castShadow
        position={[0.05, 0.03, 0]}
      >
        <boxGeometry
          args={[0.42, 0.09, 2.25]}
        />
        <meshStandardMaterial
          color="#c96449"
        />
      </mesh>

      <mesh
        castShadow
        position={[-0.57, 0.18, 0]}
      >
        <boxGeometry
          args={[0.4, 0.22, 0.28]}
        />
        <meshStandardMaterial
          color="#4a8390"
        />
      </mesh>

      <mesh
        castShadow
        position={[-0.56, 0.05, 0]}
      >
        <boxGeometry
          args={[0.5, 0.07, 0.9]}
        />
        <meshStandardMaterial
          color="#d6c48f"
        />
      </mesh>

      {[0.52, -0.52].map(z => (
        <mesh
          key={z}
          castShadow
          position={[
            0.12,
            -0.26,
            z
          ]}
        >
          <boxGeometry
            args={[
              0.9,
              0.09,
              0.13
            ]}
          />

          <meshStandardMaterial
            color="#e9d7a2"
          />
        </mesh>
      ))}

      <group
        ref={propeller}
        position={[0.82, 0.02, 0]}
      >
        <mesh>
          <boxGeometry
            args={[
              0.035,
              0.78,
              0.06
            ]}
          />
          <meshStandardMaterial
            color="#59483c"
          />
        </mesh>

        <mesh>
          <boxGeometry
            args={[
              0.035,
              0.06,
              0.78
            ]}
          />
          <meshStandardMaterial
            color="#59483c"
          />
        </mesh>
      </group>
    </group>
  );
}

function TransferGuest({
  index
}: {
  index: number;
}) {
  const group =
    useRef<Group | null>(null);

  const startedAt =
    useRef<number | null>(null);

  const lateral =
    ((index % 3) - 1) * 0.07;

  const from: Point3 = [
    BEACH_ARRIVAL[0] + lateral,
    BEACH_ARRIVAL[1] + 0.04,
    BEACH_ARRIVAL[2]
  ];

  const via: Point3 = [
    RESORT_WORLD_ANCHORS
      .reception.entrance[0] +
      lateral * 0.5,

    RESORT_WORLD_ANCHORS
      .reception.entrance[1] +
      0.04,

    RESORT_WORLD_ANCHORS
      .reception.entrance[2]
  ];

  const to: Point3 = [
    GUEST_HANDOFF[0],
    GUEST_HANDOFF[1] + 0.04,
    GUEST_HANDOFF[2]
  ];

  useFrame(({ clock }) => {
    if (!group.current) return;

    if (
      startedAt.current === null
    ) {
      startedAt.current =
        clock.elapsedTime;
    }

    const elapsed =
      clock.elapsedTime -
      startedAt.current;

    const t = smooth(
      Math.min(
        1,
        elapsed * 0.28
      )
    );

    const position =
      curve(
        from,
        via,
        to,
        t
      );

    group.current.position.set(
      position[0],
      position[1] +
        Math.abs(
          Math.sin(
            elapsed * 7 + index
          )
        ) *
          0.025,
      position[2]
    );
  });

  return (
    <group
      ref={group}
      position={from}
    >
      <mesh
        castShadow
        position={[0, 0.14, 0]}
      >
        <boxGeometry
          args={[0.1, 0.23, 0.1]}
        />

        <meshStandardMaterial
          color={
            index % 3 === 0
              ? '#f1a76a'
              : index % 3 === 1
                ? '#6ab4c7'
                : '#dd8f9f'
          }
        />
      </mesh>

      <mesh
        castShadow
        position={[0, 0.32, 0]}
      >
        <sphereGeometry
          args={[0.075, 8, 6]}
        />

        <meshStandardMaterial
          color="#e4b28f"
        />
      </mesh>
    </group>
  );
}

export function ResortArrivalActivity({
  state,boundary,beachStrokes
}: {
  state: BootstrapState;
  boundary:IslandWaterBoundary|null;
  beachStrokes:readonly SeaPaintStroke[];
}) {
  const wave = state.normalWave;

  const totalDemand =
    wave.activeNeedIds.reduce(
      (sum, need) =>
        sum +
        wave.demandTargetByNeed[need],
      0
    );

  const composition =
    arrivalCompositionForWave(
      state.currentWaveNumber
    );

  const craft =
    arrivalCraftProjection(
      state.currentWaveNumber,
      wave.phase,
      wave.releasedDemand,
      totalDemand
    );

  const visibleGuests =
    Math.min(
      composition.visibleGuestLimit,
      wave.releasedDemand
    );

  return (
    <>
      {craft.map(item =>
        item.source === 'seaplane' ? (
          <Seaplane
            key={item.id}
            progress={item.progress}
            lane={item.lane}
          />
        ) : (
          <SeaCraft
            key={item.id}
            source={item.source}
            progress={item.progress}
            lane={item.lane}
            boundary={boundary}
            beachStrokes={beachStrokes}
            waveNumber={state.currentWaveNumber}
          />
        )
      )}

      {Array.from({
        length: visibleGuests
      }).map((_, index) => (
        <TransferGuest
          key={`arrival-transfer-${index}`}
          index={index}
        />
      ))}
    </>
  );
}
