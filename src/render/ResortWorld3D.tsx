import { Canvas } from '@react-three/fiber';
import { Suspense, useMemo, useState } from 'react';
import * as THREE from 'three';

import { arrivalCompositionForWave } from '../core/arrivalComposition';
import type { BootstrapState, NormalWaveNeedId } from '../core/state';

import { environmentProfileForWave } from './environmentProfile';
import { ResortOcean } from './ResortOcean';
import { CALIBRATED_ANCHOR_POINTS, RESORT_WORLD_ANCHORS, type ResortWorldPoint } from './resortWorldAnchors';
import { SERVICE_SPATIAL } from './resortWorldSpatial';
import { ResortArrivalActivity } from './ResortArrivalActivity';
import { ResortGuestFlowActivity } from './ResortGuestFlowActivity';
import { ResortIslandModel } from './ResortIslandModel';
import {
  TropicalRain
} from './ResortWorldArt';
import { ResortWorkerActivity } from './ResortWorkerActivity';

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
  state: BootstrapState;
  selectedNeed: NormalWaveNeedId;
  onSelectNeed: (need: NormalWaveNeedId) => void;
}

interface WorldSceneProps extends ResortWorld3DProps {
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
  const spatial =
    SERVICE_SPATIAL[need];

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
  const spatial = SERVICE_SPATIAL[need];

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
function WorldScene({
  state,
  selectedNeed,
  onSelectNeed,
  calibrationMode,
  anchors,
  onPick
}: WorldSceneProps) {
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

      <ResortOcean environment={environment} />

      <Suspense fallback={null}>
        <ResortIslandModel
          onPick={calibrationMode ? onPick : undefined}
        />
      </Suspense>

      <TropicalRain
        active={environment.weather === 'tropical-rain'}
      />

      {calibrationMode ? (
        <CalibrationMarkers anchors={anchors} />
      ) : (
        <>
          <ResortArrivalActivity state={state} />
          <ResortGuestFlowActivity state={state} />
          {state.progressionStage === 'mvp' && state.vipBuildings.spa ? <VipSpaWorldBuilding /> : null}

          {activeNeeds.map(need =>
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
          )}

          <ResortWorkerActivity state={state} />
        </>
      )}
    </>
  );
}

export function ResortWorld3D(props: ResortWorld3DProps) {
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
        <WorldScene
          {...props}
          calibrationMode={calibrationMode}
          anchors={anchors}
          onPick={handlePick}
        />
      </Canvas>

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
