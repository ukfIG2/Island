import { IslandOrbitCamera, type OrbitAction, type OrbitRequest } from './IslandOrbitCamera';
import { Canvas, useFrame } from '@react-three/fiber';
// RRH SPATIAL META DEV V5
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { PMO_WORLD_ENABLED, PmoNavigationScope, usePmoNavigationWorld } from './spatialMeta/PmoNavigationScope';
import * as THREE from 'three';

import { arrivalCompositionForWave } from '../core/arrivalComposition';
import type { BootstrapState, NormalWaveNeedId } from '../core/state';

import { environmentProfileForWave } from './environmentProfile';
import { serviceGrowthTiers } from './serviceGrowthVisual';
import { ResortOcean, type OceanWavePreset } from './ResortOcean';
import { DEFAULT_SHORE_WATER_PROFILE } from './shoreWaterProfile';
import {
  ISLAND_MESH_BOUNDARY_SOURCE,
  type IslandWaterBoundary,
  type IslandWaterBoundarySource
} from './islandWaterBoundary';
import { CALIBRATED_ANCHOR_POINTS, RESORT_WORLD_ANCHORS, type ResortWorldPoint } from './resortWorldAnchors';
import { SERVICE_SPATIAL } from './resortWorldSpatial';
import { ResortArrivalActivity } from './ResortArrivalActivity';
import {getPublishedPmoRegistry} from './spatialMeta/pmoServiceLayout';
import {readSeaBeachPmoStrokes} from './seaBeachPmoStrokes';
import type {SeaContourInput} from './seaCoastNavigation';
import { ResortGuestFlowActivity } from './ResortGuestFlowActivity';
import { PmoProductionGuestTraffic } from './PmoProductionGuestTraffic';
import { ResortIslandModel } from './ResortIslandModel';
import { PmoTransitionStructures } from './PmoTransitionStructures';
import type { PathfindingTestStatus } from '../dev/PathfindingTestScene';
import {
  TropicalRain
} from './ResortWorldArt';
import { ResortWorkerActivity } from './ResortWorkerActivity';

// The lab is never part of the production module graph. Both components and
// their expensive transitive dependencies are loaded only in DEV sessions.
const DevPmoPortalInspection = import.meta.env.DEV
  ? lazy(async () => ({default:(await import('./PmoPortalInspection')).PmoPortalInspection}))
  : null;
const DevPathfindingTestScene = import.meta.env.DEV
  ? lazy(async () => ({default:(await import('../dev/PathfindingTestScene')).PathfindingTestScene}))
  : null;
const DevPathfindingTestPanel = import.meta.env.DEV
  ? lazy(async () => ({default:(await import('../dev/PathfindingTestPanel')).PathfindingTestPanel}))
  : null;
const DevSpatialMetaCanvasBridge = import.meta.env.DEV
  ? lazy(async () => ({default:(await import('./spatialMeta/SpatialMetaCanvasBridge')).SpatialMetaCanvasBridge}))
  : null;
const DevSpatialMetaPanel = import.meta.env.DEV
  ? lazy(async () => ({default:(await import('./spatialMeta/SpatialMetaDev')).SpatialMetaDevPanel}))
  : null;

// PMO_WORLD_BINDING_V1 · PMO_NAV_SCOPE_V1: scene poses come from one terrain-bound world; legacy agents disabled in preview until PMO routes are wired.


const ACTIVE_SERVICE_ORDER: readonly NormalWaveNeedId[] = [
  'reception',
  'food',
  'drinks',
  'relax',
  'oceanView'
];

const ANCHOR_IDS = [
  'beachArrival',

  'reception.center',
  'reception.entrance',
  'reception.queue',

  'relax.center',
  'relax.entrance',

  'hotel.center',
  'hotel.entrance',

  'food.build',
  'food.entrance',

  'drinks.build',
  'drinks.entrance',

  'expansion.slot01',
  'expansion.slot02',
  'expansion.slot03',
  'expansion.slot04',
  'expansion.slot05',
  'expansion.slot06',
  'expansion.slot07',

  'landmark.waterfall',
  'landmark.mountainLake',
  'landmark.reserve'
] as const;

type AnchorId = typeof ANCHOR_IDS[number];
type Point3 = ResortWorldPoint;

interface ResortWorld3DProps {
  pathfindingTest?: boolean;
  state: BootstrapState;
  selectedNeed: NormalWaveNeedId;
  onSelectNeed: (need: NormalWaveNeedId) => void;
}

interface WorldSceneProps extends ResortWorld3DProps {
  shuffleKey: number;
  waveKey: number;
  fullWaveKey: number;
  fullAuditKey:number;
  onTestStatus: (status: PathfindingTestStatus) => void;
  wavePreset: OceanWavePreset;
  shoreMaskEnabled: boolean;
  shoreOffset: number;
  shoreFeather: number;
  shoreWaterEnabled: boolean;
  shoreEdgeOpacity: number;
  shoreFadeWidth: number;
  shoreTintStrength: number;
  calibrationMode: boolean;
  anchors: Partial<Record<AnchorId, Point3>>;
  onPick: (point: Point3) => void;
}

function CalibrationMarkers({
  anchors
}: {
  anchors: Partial<Record<AnchorId, Point3>>;
}) {
  return (
    <>
      {Object.entries(anchors).map(([id, point]) => {
        if (!point) return null;

        return (
          <group
            key={id}
            position={[point[0], point[1] + 0.12, point[2]]}
          >
            <mesh>
              <sphereGeometry args={[0.105, 12, 8]} />
              <meshBasicMaterial color="#ffd84d" />
            </mesh>

            <mesh rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.15, 0.20, 24]} />
              <meshBasicMaterial
                color="#fff4a8"
                transparent
                opacity={0.9}
              />
            </mesh>
          </group>
        );
      })}
    </>
  );
}


/** Purely visual Core-level projection: no colliders, destinations or extra gameplay state. */
function ServiceGrowthArchitecture({need,level,compact}:{need:NormalWaveNeedId;level:number;compact:boolean}){
 const width=compact?0.72:0.51,depth=compact?0.49:0.35;
 return <group name={`service-growth-${need}`} userData={{level,visualOnly:true}}>
  {serviceGrowthTiers(level).map(stage=>{const tier=stage-2,scale=1-tier*0.06;return <group key={stage} name={`service-growth-tier-${stage}`} position={[0,(compact?0.58:0.54)+tier*0.17,0]}>
   <mesh castShadow raycast={()=>{}} position={[0,0.16,0]}><boxGeometry args={[width*scale,0.05,depth*scale]}/><meshStandardMaterial color={tier%2?'#b66a48':'#e1bb76'} roughness={0.78}/></mesh>
   {[-1,1].map(side=><mesh key={side} castShadow raycast={()=>{}} position={[side*width*(0.36-tier*0.02),0.08,0]}><boxGeometry args={[0.04,0.15,depth*scale*0.72]}/><meshStandardMaterial color='#80583e' roughness={0.88}/></mesh>)}
  </group>})}
 </group>;
}

function EmbeddedServiceAnchor({
  need,
  state,
  selected,
  onSelect
}: {
  need: NormalWaveNeedId;
  state: BootstrapState;
  selected: boolean;
  onSelect: () => void;
}) {
  const pmoWorld = usePmoNavigationWorld();
  const spatial = PMO_WORLD_ENABLED ? pmoWorld?.layout.services[need] : SERVICE_SPATIAL[need];
  if (!spatial) return null;

  const dx =
    spatial.center[0] -
    spatial.entrance[0];

  const dz =
    spatial.center[2] -
    spatial.entrance[2];

  const yaw =
    Math.atan2(dx, dz);

  const waiting =
    state.normalWave.queueByNeed[need];

  const workers =
    Object.values(
      state.normalWave.workerAssignments
    ).filter(
      value => value === need
    ).length;

  const accent =
    selected
      ? '#ffe787'
      : waiting > 0
        ? '#ef8c62'
        : workers > 0
          ? '#72c9aa'
          : '#d9bf7b';

  return (
    <group
      position={[...spatial.entrance]}
      rotation={[0, yaw, 0]}
    >
      <ServiceGrowthArchitecture need={need} level={state.normalWave.buildingLevelsByNeed[need]} compact={false} />
      <mesh
        position={[0, 0.025, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={event => {
          event.stopPropagation();
          onSelect();
        }}
      >
        <ringGeometry
          args={[
            selected ? 0.29 : 0.25,
            selected ? 0.34 : 0.30,
            28
          ]}
        />

        <meshBasicMaterial
          color={accent}
          transparent
          opacity={selected ? 0.9 : 0.48}
        />
      </mesh>

      {need === 'reception' ? (
        <>
          {/* compact arrival desk */}
          <mesh
            castShadow
            receiveShadow
            position={[0, 0.045, 0]}
          >
            <boxGeometry
              args={[0.46, 0.09, 0.31]}
            />

            <meshStandardMaterial
              color="#b88657"
              roughness={0.9}
            />
          </mesh>

          <mesh
            castShadow
            position={[0, 0.20, -0.07]}
          >
            <boxGeometry
              args={[0.34, 0.20, 0.10]}
            />

            <meshStandardMaterial
              color="#e7cd94"
              roughness={0.84}
            />
          </mesh>

          {[-0.18, 0.18].map(x => (
            <mesh
              key={x}
              castShadow
              position={[x, 0.26, 0]}
            >
              <boxGeometry
                args={[0.035, 0.43, 0.035]}
              />

              <meshStandardMaterial
                color="#76543b"
                roughness={0.9}
              />
            </mesh>
          ))}

          <mesh
            castShadow
            position={[0, 0.49, 0]}
          >
            <boxGeometry
              args={[0.52, 0.045, 0.36]}
            />

            <meshStandardMaterial
              color="#d2ad62"
              roughness={0.74}
            />
          </mesh>

          <mesh
            castShadow
            position={[0, 0.39, -0.14]}
          >
            <boxGeometry
              args={[0.20, 0.10, 0.025]}
            />

            <meshStandardMaterial
              color="#4f887b"
              roughness={0.62}
            />
          </mesh>
        </>
      ) : need === 'relax' ? (
        <>
          {/* compact pool deck */}
          <mesh
            castShadow
            receiveShadow
            position={[0, 0.035, 0]}
          >
            <boxGeometry
              args={[0.52, 0.07, 0.34]}
            />

            <meshStandardMaterial
              color="#c59762"
              roughness={0.92}
            />
          </mesh>

          {/* umbrella pole */}
          <mesh
            castShadow
            position={[-0.13, 0.25, -0.03]}
          >
            <cylinderGeometry
              args={[
                0.018,
                0.018,
                0.42,
                8
              ]}
            />

            <meshStandardMaterial
              color="#755943"
            />
          </mesh>

          {/* umbrella */}
          <mesh
            castShadow
            position={[-0.13, 0.47, -0.03]}
            rotation={[0, 0, 0]}
          >
            <coneGeometry
              args={[
                0.22,
                0.09,
                16,
                1,
                true
              ]}
            />

            <meshStandardMaterial
              color="#e9d28a"
              roughness={0.75}
              side={2}
            />
          </mesh>

          {/* loungers */}
          {[-0.13, 0.13].map(z => (
            <mesh
              key={z}
              castShadow
              position={[
                0.14,
                0.105,
                z
              ]}
              rotation={[
                0,
                0,
                -0.10
              ]}
            >
              <boxGeometry
                args={[
                  0.24,
                  0.045,
                  0.085
                ]}
              />

              <meshStandardMaterial
                color="#efe1b3"
                roughness={0.8}
              />
            </mesh>
          ))}
        </>
      ) : (
        <>
          {/* compact hotel terrace */}
          <mesh
            castShadow
            receiveShadow
            position={[0, 0.045, 0]}
          >
            <boxGeometry
              args={[0.58, 0.09, 0.33]}
            />

            <meshStandardMaterial
              color="#b37c52"
              roughness={0.88}
            />
          </mesh>

          {/* back canopy */}
          <mesh
            castShadow
            position={[0, 0.39, -0.09]}
          >
            <boxGeometry
              args={[0.54, 0.045, 0.26]}
            />

            <meshStandardMaterial
              color="#b75f3f"
              roughness={0.72}
            />
          </mesh>

          {[-0.22, 0.22].map(x => (
            <mesh
              key={x}
              castShadow
              position={[x, 0.23, -0.09]}
            >
              <boxGeometry
                args={[0.03, 0.34, 0.03]}
              />

              <meshStandardMaterial
                color="#75553e"
              />
            </mesh>
          ))}

          {/* rail */}
          <mesh
            castShadow
            position={[0, 0.18, 0.145]}
          >
            <boxGeometry
              args={[0.54, 0.025, 0.025]}
            />

            <meshStandardMaterial
              color="#e4cf9d"
              roughness={0.76}
            />
          </mesh>

          {[-0.23, -0.08, 0.08, 0.23].map(x => (
            <mesh
              key={x}
              castShadow
              position={[x, 0.12, 0.145]}
            >
              <boxGeometry
                args={[0.018, 0.15, 0.018]}
              />

              <meshStandardMaterial
                color="#e4cf9d"
              />
            </mesh>
          ))}

          {/* table */}
          <mesh
            castShadow
            position={[0, 0.15, 0.015]}
          >
            <cylinderGeometry
              args={[
                0.095,
                0.095,
                0.035,
                14
              ]}
            />

            <meshStandardMaterial
              color="#dec58c"
            />
          </mesh>
        </>
      )}
    </group>
  );
}

function CompactServiceBuilding({
  need,
  state,
  selected,
  onSelect
}: {
  need: NormalWaveNeedId;
  state: BootstrapState;
  selected: boolean;
  onSelect: () => void;
}) {
  const pmoWorld = usePmoNavigationWorld();
  const spatial = PMO_WORLD_ENABLED ? pmoWorld?.layout.services[need] : SERVICE_SPATIAL[need];
  if (!spatial) return null;

  const dx =
    spatial.entrance[0] -
    spatial.center[0];

  const dz =
    spatial.entrance[2] -
    spatial.center[2];

  const yaw =
    Math.atan2(dx, dz);

  const waiting =
    state.normalWave.queueByNeed[need];

  const workers =
    Object.values(
      state.normalWave.workerAssignments
    ).filter(
      value => value === need
    ).length;

  const accent =
    selected
      ? '#ffe787'
      : waiting > 0
        ? '#ef8c62'
        : workers > 0
          ? '#72c9aa'
          : '#d7ba78';

  const food = need === 'food';

  return (
    <group
      position={[...spatial.center]}
      rotation={[0, yaw, 0]}
    >
      <ServiceGrowthArchitecture need={need} level={state.normalWave.buildingLevelsByNeed[need]} compact={true} />
      {/* Selection / activity marker */}
      <mesh
        position={[0, 0.025, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={event => {
          event.stopPropagation();
          onSelect();
        }}
      >
        <ringGeometry
          args={[
            selected ? 0.48 : 0.42,
            selected ? 0.54 : 0.48,
            32
          ]}
        />

        <meshBasicMaterial
          color={accent}
          transparent
          opacity={selected ? 0.92 : 0.58}
        />
      </mesh>

      {food ? (
        <>
          {/* Restaurant terrace */}
          <mesh
            receiveShadow
            castShadow
            position={[0, 0.055, 0]}
            onClick={event => {
              event.stopPropagation();
              onSelect();
            }}
          >
            <boxGeometry
              args={[0.92, 0.11, 0.66]}
            />

            <meshStandardMaterial
              color="#bd8b5c"
              roughness={0.88}
            />
          </mesh>

          {/* Low rear wall / service counter */}
          <mesh
            castShadow
            position={[
              0,
              0.23,
              -0.24
            ]}
          >
            <boxGeometry
              args={[0.68, 0.34, 0.10]}
            />

            <meshStandardMaterial
              color="#e8d1a0"
              roughness={0.82}
            />
          </mesh>

          {/* Thin canopy */}
          <mesh
            castShadow
            position={[
              0,
              0.51,
              -0.03
            ]}
          >
            <boxGeometry
              args={[0.78, 0.055, 0.53]}
            />

            <meshStandardMaterial
              color="#b85f3e"
              roughness={0.74}
            />
          </mesh>

          {[
            [-0.32, -0.23],
            [0.32, -0.23],
            [-0.32, 0.18],
            [0.32, 0.18]
          ].map(([x, z], index) => (
            <mesh
              key={index}
              castShadow
              position={[
                x,
                0.285,
                z
              ]}
            >
              <boxGeometry
                args={[
                  0.045,
                  0.46,
                  0.045
                ]}
              />

              <meshStandardMaterial
                color="#815d3f"
                roughness={0.9}
              />
            </mesh>
          ))}

          {/* Tiny tables */}
          {[-0.22, 0.22].map(
            (x, index) => (
              <group
                key={x}
                position={[
                  x,
                  0.15,
                  0.20
                ]}
              >
                <mesh castShadow>
                  <cylinderGeometry
                    args={[
                      0.105,
                      0.105,
                      0.045,
                      14
                    ]}
                  />

                  <meshStandardMaterial
                    color={
                      index === 0
                        ? '#ddc488'
                        : '#e2cd97'
                    }
                    roughness={0.83}
                  />
                </mesh>

                <mesh
                  castShadow
                  position={[
                    0,
                    -0.075,
                    0
                  ]}
                >
                  <cylinderGeometry
                    args={[
                      0.027,
                      0.027,
                      0.14,
                      8
                    ]}
                  />

                  <meshStandardMaterial
                    color="#755842"
                  />
                </mesh>
              </group>
            )
          )}
        </>
      ) : (
        <>
          {/* Small open bar deck */}
          <mesh
            receiveShadow
            castShadow
            position={[0, 0.05, 0]}
            onClick={event => {
              event.stopPropagation();
              onSelect();
            }}
          >
            <boxGeometry
              args={[0.70, 0.10, 0.58]}
            />

            <meshStandardMaterial
              color="#a9764c"
              roughness={0.88}
            />
          </mesh>

          {/* Bar counter */}
          <mesh
            castShadow
            position={[
              0,
              0.20,
              -0.16
            ]}
          >
            <boxGeometry
              args={[0.48, 0.25, 0.12]}
            />

            <meshStandardMaterial
              color="#d6b478"
              roughness={0.8}
            />
          </mesh>

          {/* Light roof */}
          <mesh
            castShadow
            position={[
              0,
              0.49,
              -0.02
            ]}
          >
            <boxGeometry
              args={[0.59, 0.045, 0.47]}
            />

            <meshStandardMaterial
              color="#d0a75e"
              roughness={0.76}
            />
          </mesh>

          {[
            [-0.25, -0.18],
            [0.25, -0.18],
            [-0.25, 0.16],
            [0.25, 0.16]
          ].map(([x, z], index) => (
            <mesh
              key={index}
              castShadow
              position={[
                x,
                0.27,
                z
              ]}
            >
              <boxGeometry
                args={[
                  0.035,
                  0.44,
                  0.035
                ]}
              />

              <meshStandardMaterial
                color="#795a3d"
                roughness={0.92}
              />
            </mesh>
          ))}

          {/* Two stools */}
          {[-0.14, 0.14].map(x => (
            <group
              key={x}
              position={[
                x,
                0.13,
                0.13
              ]}
            >
              <mesh castShadow>
                <cylinderGeometry
                  args={[
                    0.07,
                    0.07,
                    0.045,
                    12
                  ]}
                />

                <meshStandardMaterial
                  color="#d9c280"
                />
              </mesh>

              <mesh
                castShadow
                position={[
                  0,
                  -0.07,
                  0
                ]}
              >
                <cylinderGeometry
                  args={[
                    0.02,
                    0.02,
                    0.13,
                    8
                  ]}
                />

                <meshStandardMaterial
                  color="#6c513c"
                />
              </mesh>
            </group>
          ))}
        </>
      )}
    </group>
  );
}
/** VIP Spa world projection: independent of normal-wave buildings and staffing. */
function VipSpaWorldBuilding() {
  return (
    <group name="vip-spa-building" position={[...RESORT_WORLD_ANCHORS.expansion.slot07]}>
      <mesh receiveShadow position={[0, 0.035, 0]}>
        <cylinderGeometry args={[0.73, 0.77, 0.07, 8]} />
        <meshStandardMaterial color="#d3b68c" roughness={0.9} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 0.27, 0]}>
        <boxGeometry args={[0.91, 0.46, 0.79]} />
        <meshStandardMaterial color="#eadcc2" roughness={0.8} />
      </mesh>
      <mesh castShadow position={[0, 0.57, 0]}>
        <coneGeometry args={[0.74, 0.29, 4]} />
        <meshStandardMaterial color="#7eac91" roughness={0.76} />
      </mesh>
      <mesh position={[0, 0.23, 0.4]}>
        <boxGeometry args={[0.21, 0.32, 0.025]} />
        <meshStandardMaterial color="#6b7e75" roughness={0.72} />
      </mesh>
    </group>
  );
}
/** Geometry-derived water boundary, independent of the island model's implementation.
 * New island assets only have to render meshes; they can optionally annotate
 * terrain with mesh.userData.oceanBoundary = true and exclude props with false.
 */
function IslandBoundaryCapture({
  onPick,
  onBoundary,
  source = ISLAND_MESH_BOUNDARY_SOURCE
}: {
  onPick?: (point: Point3) => void;
  onBoundary: (next: IslandWaterBoundary | null) => void;
  source?: IslandWaterBoundarySource;
}) {
  const root = useRef<THREE.Group>(null);
  const signature = useRef('');
  const elapsed = useRef(0);

  // Only resample when the source geometry changes. Never dispatch every frame.
  useFrame((_, delta) => {
    elapsed.current += Math.min(Math.max(delta, 0), 1);
    if (elapsed.current < 0.75 || !root.current) return;
    elapsed.current = 0;
    const nextSignature = source.fingerprint(root.current);
    if (nextSignature === signature.current) return;
    signature.current = nextSignature;
    try {
      onBoundary(source.capture(root.current, {
        seaLevel: -0.78,
        originX: -21,
        originZ: -21,
        worldSize: 42,
        resolution: 512
      }));
    } catch (error) {
      console.warn('Island water boundary capture failed; retaining unmasked ocean', error);
      onBoundary(null);
    }
  });

  return (
    <group ref={root} name="replaceable-island-boundary-source">
      <ResortIslandModel onPick={onPick} />
    </group>
  );
}

function WorldScene({
  pathfindingTest, shuffleKey, waveKey, fullWaveKey, fullAuditKey, onTestStatus,
  state,
  selectedNeed,
  onSelectNeed,
  wavePreset,
  shoreMaskEnabled,
  shoreOffset,
  shoreFeather,
  shoreWaterEnabled,
  shoreEdgeOpacity,
  shoreFadeWidth,
  shoreTintStrength,
  calibrationMode,
  anchors,
  onPick
}: WorldSceneProps) {
  const [islandBoundary, setIslandBoundary] = useState<IslandWaterBoundary | null>(null);
  const seaPublishedRegistry=getPublishedPmoRegistry().registry;
  const seaPaint=useMemo(()=>readSeaBeachPmoStrokes(seaPublishedRegistry),[seaPublishedRegistry]);
  const seaContour=useMemo<SeaContourInput|null>(()=>islandBoundary&&seaPaint.length
    ?{boundary:islandBoundary,beachStrokes:seaPaint}:null,[islandBoundary,seaPaint]);
  // GPU textures are owned by the receiving scene; old generations are disposed.
  useEffect(() => () => islandBoundary?.distanceTexture.dispose(), [islandBoundary]);

  const environment = environmentProfileForWave(
    state.currentWaveNumber,
    state.normalWave.phase
  );

  const activeNeeds = ACTIVE_SERVICE_ORDER.filter(
    need => state.normalWave.activeNeedIds.includes(need)
  );

  return (
    <>
      <color attach="background" args={[environment.sky]} />

      <fog
        attach="fog"
        args={[
          environment.fog,
          environment.fogNear * 0.43,
          environment.fogFar * 0.54
        ]}
      />

      <ambientLight
        intensity={
          environment.ambientIntensity *
          0.42
        }
      />

      <hemisphereLight
        intensity={
          environment.hemisphereIntensity *
          0.58
        }
        color={
          environment.timeOfDay === 'day'
            ? '#d8f5ff'
            : environment.sunColor
        }
        groundColor="#24584f"
      />

      <directionalLight
        castShadow
        position={
          environment.timeOfDay === 'sunset'
            ? [-10, 5.5, -3]
            : [-6, 11, -5]
        }
        intensity={
          environment.sunIntensity *
          1.12
        }
        color={environment.sunColor}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
        shadow-camera-near={0.5}
        shadow-camera-far={40}
        shadow-bias={-0.00035}
        shadow-normalBias={0.035}
      />

      <ResortOcean
        environment={environment}
        wavePreset={wavePreset}
        islandBoundary={islandBoundary}
        shoreMaskEnabled={shoreMaskEnabled}
        shoreOffset={shoreOffset}
        shoreFeather={shoreFeather}
        shoreWaterEnabled={shoreWaterEnabled}
        shoreEdgeOpacity={shoreEdgeOpacity}
        shoreFadeWidth={shoreFadeWidth}
        shoreTintStrength={shoreTintStrength}
      />

      <Suspense fallback={null}>
        <IslandBoundaryCapture
          onPick={calibrationMode ? onPick : undefined}
          onBoundary={setIslandBoundary}
        />
      </Suspense>

      <PmoTransitionStructures />
      <TropicalRain
        active={environment.weather === 'tropical-rain'}
      />

      {calibrationMode ? (
        <CalibrationMarkers anchors={anchors} />
      ) : (
        <>
          {!PMO_WORLD_ENABLED ? <ResortArrivalActivity state={state} boundary={islandBoundary} beachStrokes={seaPaint} /> : null}
          {!pathfindingTest ? <ResortGuestFlowActivity state={state} /> : null}
          {!pathfindingTest && PMO_WORLD_ENABLED ? <PmoProductionGuestTraffic state={state} /> : null}
          {state.progressionStage === 'mvp' && state.vipBuildings.spa ? <VipSpaWorldBuilding /> : null}

          {!pathfindingTest ? activeNeeds.map(need =>
            SERVICE_SPATIAL[need].embedded ? (
              <EmbeddedServiceAnchor
                key={need}
                need={need}
                state={state}
                selected={selectedNeed === need}
                onSelect={() => onSelectNeed(need)}
              />
            ) : (
              <CompactServiceBuilding
                key={need}
                need={need}
                state={state}
                selected={selectedNeed === need}
                onSelect={() => onSelectNeed(need)}
              />
            )
          ) : null}

          {!pathfindingTest ? <ResortWorkerActivity state={state} /> : null}
          {pathfindingTest && DevPathfindingTestScene ? <Suspense fallback={null}><DevPathfindingTestScene shuffleKey={shuffleKey} waveKey={waveKey} fullWaveKey={fullWaveKey} fullAuditKey={fullAuditKey} onStatus={onTestStatus} seaContour={seaContour} /></Suspense> : null}
        </>
      )}
    </>
  );
}

export function ResortWorld3D(props: ResortWorld3DProps) {
  // Pathfinding inspection starts with the REAL PMO editor visible. The
  // canonical registry is read-only until the user explicitly forks a copy.
  const [showSpatialEditor, setShowSpatialEditor] = useState(
    () => import.meta.env.DEV && (RRH_SPATIAL_DEV_ENABLED || Boolean(props.pathfindingTest))
  );
  const [showPmoInspection, setShowPmoInspection] = useState(false);
  const [orbitRequest, setOrbitRequest] = useState<OrbitRequest | null>(null);
  const rotateIsland = (action: OrbitAction) => setOrbitRequest(prev => ({serial:(prev?.serial ?? 0) + 1, action}));
  const [shuffleKey,setShuffleKey]=useState(0);
  const [waveKey,setWaveKey]=useState(0);
  const [fullWaveKey,setFullWaveKey]=useState(0);
  const [fullAuditKey,setFullAuditKey]=useState(0);
  const [testStatus,setTestStatus]=useState<PathfindingTestStatus|null>(null);
  const devPathfindingTest=import.meta.env.DEV && Boolean(props.pathfindingTest);
  // Wave selection belongs to renderer presentation, not gameplay state.
  const [wavePreset, setWavePreset] = useState<OceanWavePreset>('default');
  const [shoreMaskEnabled, setShoreMaskEnabled] = useState(true);
  const [shoreOffset, setShoreOffset] = useState(0.12);
  const [shoreFeather, setShoreFeather] = useState(0.24);
  const [shoreWaterEnabled, setShoreWaterEnabled] = useState(true);
  const [shoreEdgeOpacity, setShoreEdgeOpacity] = useState<number>(DEFAULT_SHORE_WATER_PROFILE.edgeOpacity);
  const [shoreFadeWidth, setShoreFadeWidth] = useState<number>(DEFAULT_SHORE_WATER_PROFILE.fadeWidth);
  const [shoreTintStrength, setShoreTintStrength] = useState<number>(DEFAULT_SHORE_WATER_PROFILE.tintStrength);
  const shoreDebug = useMemo(
    () => new URLSearchParams(window.location.search).has('shoreDebug'),
    []
  );

  const calibrationMode = useMemo(
    () =>
      new URLSearchParams(window.location.search).get('calibrate') === '1',
    []
  );

  const [selectedAnchor, setSelectedAnchor] =
    useState<AnchorId>('expansion.slot07');

  const [anchors, setAnchors] = useState<
    Partial<Record<AnchorId, Point3>>
  >({ ...CALIBRATED_ANCHOR_POINTS });

  const anchorJson = useMemo(
    () => JSON.stringify(anchors, null, 2),
    [anchors]
  );

  function handlePick(point: Point3) {
    const rounded: Point3 = [
      Number(point[0].toFixed(4)),
      Number(point[1].toFixed(4)),
      Number(point[2].toFixed(4))
    ];

    setAnchors(current => ({
      ...current,
      [selectedAnchor]: rounded
    }));

    const index = ANCHOR_IDS.indexOf(selectedAnchor);

    if (index >= 0 && index < ANCHOR_IDS.length - 1) {
      setSelectedAnchor(ANCHOR_IDS[index + 1]);
    }
  }

  return (
    <div
      className="shell__three"
      style={{ position: 'relative' }}
      data-renderer="three-r3f"
      data-ocean-wave-preset={wavePreset}
      data-selected-need={props.selectedNeed}
      data-arrival-source={
        arrivalCompositionForWave(
          props.state.currentWaveNumber
        ).source
      }
      data-time-of-day={
        environmentProfileForWave(
          props.state.currentWaveNumber,
          props.state.normalWave.phase
        ).timeOfDay
      }
      data-weather={
        environmentProfileForWave(
          props.state.currentWaveNumber,
          props.state.normalWave.phase
        ).weather
      }
      data-world-art="meshy-emerald-cascade-v1"
      data-world-motion="materials-v1"
      data-arrival-activity="craft-v1"
      data-worker-activity="transfer-v1"
      data-guest-flow="service-v1"
    >
      <Canvas
        orthographic
        shadows
        dpr={[1, 1.5]}
        camera={{
          position: [10.5, 12.5, 13.5],
          zoom: 37,
          near: 0.1,
          far: 80
        }}
        gl={{
          antialias: true,
          powerPreference: 'high-performance'
        }}
        onCreated={({
          camera,
          gl
        }) => {
          camera.lookAt(
            0,
            0,
            0
          );

          gl.toneMapping =
            THREE.ACESFilmicToneMapping;

          gl.toneMappingExposure =
            1.08;

          gl.outputColorSpace =
            THREE.SRGBColorSpace;

          gl.shadowMap.type =
            THREE.PCFShadowMap;
        }}
      >
        {(RRH_SPATIAL_DEV_ENABLED || devPathfindingTest || calibrationMode) ? <IslandOrbitCamera request={orbitRequest} /> : null}
        {showPmoInspection && DevPmoPortalInspection ? <Suspense fallback={null}><DevPmoPortalInspection /></Suspense> : null}
        {showSpatialEditor && DevSpatialMetaCanvasBridge ? <Suspense fallback={null}><DevSpatialMetaCanvasBridge /></Suspense> : null}
        <PmoNavigationScope>
        <WorldScene
          {...props}
          pathfindingTest={devPathfindingTest}
          shuffleKey={shuffleKey}
          waveKey={waveKey}
          fullWaveKey={fullWaveKey}
          fullAuditKey={fullAuditKey}
          onTestStatus={setTestStatus}
          wavePreset={wavePreset}
          shoreMaskEnabled={shoreMaskEnabled}
          shoreOffset={shoreOffset}
          shoreFeather={shoreFeather}
          shoreWaterEnabled={shoreWaterEnabled}
          shoreEdgeOpacity={shoreEdgeOpacity}
          shoreFadeWidth={shoreFadeWidth}
          shoreTintStrength={shoreTintStrength}
          calibrationMode={calibrationMode}
          anchors={anchors}
          onPick={handlePick}
        />
        </PmoNavigationScope>
      </Canvas>
      {(RRH_SPATIAL_DEV_ENABLED || devPathfindingTest || calibrationMode) ? (
        <div role="group" aria-label="Orbit camera controls" style={{
          position:'absolute',left:12,top:12,zIndex:55,display:'flex',flexWrap:'wrap',maxWidth:'calc(100% - 24px)',gap:4,alignItems:'center',
          padding:5,borderRadius:8,background:'rgba(5,20,24,0.85)',color:'white',
          fontFamily:'system-ui,sans-serif',fontSize:12
        }}>
          <span style={{padding:'0 5px'}}>Camera</span>
          {([['left','↶'],['right','↷'],['up','↑'],['down','↓'],['reset','Reset']] as const).map(([action,label])=>(
            <button type="button" key={action} title={'Orbit camera: '+action}
              onClick={()=>rotateIsland(action)} style={{padding:'5px 8px',color:'#eef9f4',
                background:'rgba(255,255,255,0.12)',border:'1px solid rgba(255,255,255,.25)',borderRadius:5,
                cursor:'pointer'}}>{label}</button>
          ))}
          {devPathfindingTest ? <button type="button" title="Toggle non-destructive experimental bridge-3 approach"
            aria-pressed={new URLSearchParams(window.location.search).get('pmoBentBridge3')==='1'}
            onClick={()=>{const url=new URL(window.location.href);
              if(url.searchParams.get('pmoBentBridge3')==='1')url.searchParams.delete('pmoBentBridge3');
              else url.searchParams.set('pmoBentBridge3','1');
              window.location.assign(url.toString());}}
            style={{padding:'5px 8px',color:'#eef9f4',background:'rgba(255,255,255,0.12)',
              border:'1px solid rgba(255,255,255,.25)',borderRadius:5,cursor:'pointer'}}>Bridge 3 lab</button> : null}
          {devPathfindingTest ? <button type="button" title="Experiment: paint actual terrain, retire all generated stair surfaces and edges"
            aria-pressed={new URLSearchParams(window.location.search).get('pmoWalkPaintLab')==='1'}
            onClick={()=>{const url=new URL(window.location.href);
              if(url.searchParams.get('pmoWalkPaintLab')==='1')url.searchParams.delete('pmoWalkPaintLab');
              else {url.searchParams.set('pmoWalkPaintLab','1');url.searchParams.delete('pmoBentBridge3');}
              window.location.assign(url.toString());}}
            style={{padding:'5px 8px',color:'#eef9f4',
              background:new URLSearchParams(window.location.search).get('pmoWalkPaintLab')==='1'?'#346c57':'rgba(255,255,255,0.12)',
              border:'1px solid rgba(255,255,255,.25)',borderRadius:5,cursor:'pointer'}}>Walk paint lab</button> : null}
          {DevSpatialMetaPanel ? <button type="button" aria-pressed={showSpatialEditor} title="Открыть реальный PMO-реестр и редактор"
            onClick={() => setShowSpatialEditor(v => !v)}
            style={{padding:'5px 8px',color:'#eef9f4',
              background:showSpatialEditor?'#345d70':'rgba(255,255,255,0.12)',
              border:'1px solid rgba(255,255,255,.25)',borderRadius:5,cursor:'pointer'}}>
            {showSpatialEditor ? 'Закрыть PMO' : 'Реестр PMO'}
          </button> : null}
          {DevPmoPortalInspection ? <button type="button" aria-pressed={showPmoInspection} title="Show authored building 3/8/9 and transition axes"
            onClick={()=>setShowPmoInspection(v=>!v)} style={{padding:'5px 8px',color:'#eef9f4',
              background:showPmoInspection?'#345d70':'rgba(255,255,255,0.12)',
              border:'1px solid rgba(255,255,255,.25)',borderRadius:5,cursor:'pointer'}}>PMO points</button> : null}
          <span style={{opacity:.7,padding:'0 4px'}}>Right drag · wheel</span>
        </div>
      ) : null}
      {showSpatialEditor && DevSpatialMetaPanel ? <Suspense fallback={null}><DevSpatialMetaPanel inPathfindingTest={devPathfindingTest} /></Suspense> : null}
      {devPathfindingTest && DevPathfindingTestPanel ? <Suspense fallback={null}><DevPathfindingTestPanel status={testStatus}
        onWave={()=>setWaveKey(n=>n+1)}
        onFullWave={()=>setFullWaveKey(n=>n>0?n+1:1)} onCrowd={()=>setFullWaveKey(n=>n<0?n-1:-1)} onShuffle={()=>setShuffleKey(n=>n+1)} onFullAudit={()=>setFullAuditKey(n=>n+1)} /></Suspense> : null}

      {!calibrationMode ? (
        <div
          role="group"
          aria-label="Ocean wave preset"
          style={{
            position: 'absolute',
            left: 12,
            bottom: 12,
            zIndex: 20,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 8px',
            borderRadius: 10,
            border: '1px solid rgba(255,255,255,0.20)',
            background: 'rgba(5,20,24,0.82)',
            color: '#eef9f4',
            fontFamily: 'inherit',
            fontSize: 11
          }}
        >
          <span style={{ marginRight: 3 }}>Sea</span>
          {(['default', 'waves-60'] as const).map(preset => {
            const selected = wavePreset === preset;

            return (
              <button
                key={preset}
                type="button"
                aria-pressed={selected}
                onClick={() => setWavePreset(preset)}
                style={{
                  cursor: 'pointer',
                  padding: '5px 8px',
                  borderRadius: 7,
                  fontSize: 11,
                  color: selected ? '#102c34' : '#e8f7f6',
                  background: selected ? '#aee9dc' : 'rgba(255,255,255,0.10)',
                  border: selected
                    ? '1px solid #aee9dc'
                    : '1px solid rgba(255,255,255,0.20)'
                }}
              >
                {preset === 'default' ? 'Default' : 'Waves +60%'}
              </button>
            );
          })}
        </div>
      ) : null}

      {shoreDebug ? (
        <section
          aria-label="Island water boundary diagnostics"
          style={{
            position: 'absolute', right: 12, bottom: 12, zIndex: 30,
            width: 240, padding: 12, borderRadius: 10,
            background: 'rgba(5,20,24,0.88)', color: '#eef9f4',
            border: '1px solid rgba(255,255,255,.2)',
            fontFamily: 'monospace', fontSize: 11
          }}
        >
          <strong>IslandWaterBoundary</strong>
          <label style={{ display: 'block', marginTop: 10 }}>
            <input
              type="checkbox" checked={shoreMaskEnabled}
              onChange={event => setShoreMaskEnabled(event.target.checked)}
            />{' '}Coast cutout
          </label>
          <label style={{ display: 'block', marginTop: 10 }}>
            Shore offset: {shoreOffset.toFixed(2)}
            <input type="range" min="-0.5" max="0.7" step="0.02"
              value={shoreOffset}
              onChange={event => setShoreOffset(Number(event.target.value))}
              style={{ display: 'block', width: '100%' }}
            />
          </label>
          <label style={{ display: 'block', marginTop: 10 }}>
            Feather: {shoreFeather.toFixed(2)}
            <input type="range" min="0.04" max="0.7" step="0.02"
              value={shoreFeather}
              onChange={event => setShoreFeather(Number(event.target.value))}
              style={{ display: 'block', width: '100%' }}
            />
          </label>
          <div style={{ borderTop: '1px solid rgba(255,255,255,.18)', marginTop: 12, paddingTop: 10 }}>
            <strong>Shallow-water gradient</strong>
          </div>
          <label style={{ display: 'block', marginTop: 10 }}>
            <input
              type="checkbox" checked={shoreWaterEnabled}
              onChange={event => setShoreWaterEnabled(event.target.checked)}
            />{' '}Coastal transparency
          </label>
          <label style={{ display: 'block', marginTop: 10 }}>
            Water opacity at shore: {Math.round(shoreEdgeOpacity * 100)}%
            <input type="range" min="0.35" max="1" step="0.01"
              value={shoreEdgeOpacity}
              onChange={event => setShoreEdgeOpacity(Number(event.target.value))}
              style={{ display: 'block', width: '100%' }}
            />
          </label>
          <label style={{ display: 'block', marginTop: 10 }}>
            Fade distance: {shoreFadeWidth.toFixed(2)}
            <input type="range" min="0.2" max="3" step="0.05"
              value={shoreFadeWidth}
              onChange={event => setShoreFadeWidth(Number(event.target.value))}
              style={{ display: 'block', width: '100%' }}
            />
          </label>
          <label style={{ display: 'block', marginTop: 10 }}>
            Shallow tint: {Math.round(shoreTintStrength * 100)}%
            <input type="range" min="0" max="0.2" step="0.01"
              value={shoreTintStrength}
              onChange={event => setShoreTintStrength(Number(event.target.value))}
              style={{ display: 'block', width: '100%' }}
            />
          </label>
          <div style={{ opacity: 0.7, marginTop: 10 }}>
            Geometry-derived coast. Gradient leaves waves unchanged.
          </div>
        </section>
      ) : null}

      {calibrationMode ? (
        <section
          aria-label="Island anchor calibration"
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            zIndex: 50,
            width: 320,
            maxHeight: 'calc(100% - 32px)',
            overflow: 'auto',
            padding: 14,
            borderRadius: 12,
            background: 'rgba(5, 20, 24, 0.92)',
            color: '#eef9f4',
            fontFamily: 'monospace',
            fontSize: 12,
            border: '1px solid rgba(255,255,255,.18)'
          }}
        >
          <strong>Island calibration</strong>

          <p style={{ opacity: 0.75 }}>
            РЎвЂ№Р В±Р ВµРЎР‚Р С‘ anchor Р С‘ Р С”Р В»Р С‘Р С”Р Р…Р С‘ Р С—Р С• РЎвЂљР С•РЎвЂЎР Р…Р С•Р СРЎС“ Р СР ВµРЎРѓРЎвЂљРЎС“ Р С•РЎРѓРЎвЂљРЎР‚Р С•Р Р†Р В°.
          </p>

          <select
            value={selectedAnchor}
            onChange={event =>
              setSelectedAnchor(event.target.value as AnchorId)
            }
            style={{
              width: '100%',
              padding: 8,
              marginBottom: 10
            }}
          >
            {ANCHOR_IDS.map(id => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>

          <div style={{ marginBottom: 8 }}>
            Saved: {Object.keys(anchors).length} / {ANCHOR_IDS.length}
          </div>

          <textarea
            readOnly
            value={anchorJson}
            style={{
              width: '100%',
              minHeight: 260,
              resize: 'vertical',
              fontFamily: 'monospace',
              fontSize: 11
            }}
          />
        </section>
      ) : null}
    </div>
  );
}

// RRH SPATIAL META DEV V5: isolated debug mode only.
const RRH_SPATIAL_DEV_ENABLED = import.meta.env.DEV && typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('spatialDev') === '1' &&
  new URLSearchParams(window.location.search).get('calibrate') !== '1';
