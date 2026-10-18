import { Canvas, type ThreeEvent } from '@react-three/fiber';
import { arrivalCompositionForWave, arrivalCraftProjection } from '../core/arrivalComposition';
import { environmentProfileForWave } from './environmentProfile';
import type { BootstrapState, NormalWaveNeedId } from '../core/state';
import { normalWaveServiceCapacity } from '../core/state';

interface ResortWorld3DProps {
  state: BootstrapState;
  selectedNeed: NormalWaveNeedId;
  onSelectNeed: (need: NormalWaveNeedId) => void;
}

const SERVICE_POSITIONS: Record<NormalWaveNeedId, readonly [number, number, number]> = {
  reception: [0, 0.62, -2.75],
  food: [-3.45, 0.58, -0.15],
  drinks: [3.55, 0.56, -0.05],
  relax: [-2.05, 0.48, 3.0],
  oceanView: [3.0, 0.52, 3.25]
};

const ACTIVE_SERVICE_ORDER: readonly NormalWaveNeedId[] = ['reception', 'food', 'drinks', 'relax', 'oceanView'];

function Building({ need, state, selected, onSelect }: { need: NormalWaveNeedId; state: BootstrapState; selected: boolean; onSelect: () => void }) {
  const level = state.normalWave.buildingLevelsByNeed[need];
  const capacity = normalWaveServiceCapacity(state, need);
  const waiting = state.normalWave.queueByNeed[need];
  const workers = Object.values(state.normalWave.workerAssignments).filter(value => value === need).length;
  const [x, y, z] = SERVICE_POSITIONS[need];
  const width = need === 'reception' ? 1.65 : need === 'food' ? 1.8 : 1.5;
  const depth = need === 'oceanView' ? 1.55 : 1.25;
  const height = 0.62 + level * 0.18;

  return (
    <group position={[x, y, z]} onClick={(event: ThreeEvent<MouseEvent>) => { event.stopPropagation(); onSelect(); }}>
      <mesh castShadow receiveShadow position={[0, height / 2, 0]}>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial color={selected ? '#ffd970' : need === 'drinks' ? '#e6b55a' : need === 'food' ? '#cf7650' : need === 'reception' ? '#ead9ac' : '#84b57f'} roughness={0.8} />
      </mesh>
      <mesh castShadow position={[0, height + 0.18, 0]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[width * 0.72, 0.55, 4]} />
        <meshStandardMaterial color={selected ? '#fff0a6' : '#8d4b3c'} roughness={0.9} />
      </mesh>
      {Array.from({ length: workers }).map((_, index) => (
        <group key={`worker-${index}`} position={[-0.48 + index * 0.28, 0.18, depth * 0.75]}>
          <mesh castShadow position={[0, 0.16, 0]}><boxGeometry args={[0.16, 0.32, 0.16]} /><meshStandardMaterial color="#4f8f6b" /></mesh>
          <mesh castShadow position={[0, 0.4, 0]}><sphereGeometry args={[0.11, 10, 8]} /><meshStandardMaterial color="#d9a47d" /></mesh>
          <mesh castShadow position={[0, 0.5, 0]}><boxGeometry args={[0.22, 0.06, 0.22]} /><meshStandardMaterial color="#ffd56d" /></mesh>
        </group>
      ))}
      {Array.from({ length: Math.min(waiting, 6) }).map((_, index) => (
        <group key={`queue-${index}`} position={[-0.62 + (index % 3) * 0.28, 0.12, depth * 1.12 + Math.floor(index / 3) * 0.3]}>
          <mesh castShadow position={[0, 0.16, 0]}><boxGeometry args={[0.12, 0.24, 0.12]} /><meshStandardMaterial color="#72b4c0" /></mesh>
          <mesh castShadow position={[0, 0.34, 0]}><sphereGeometry args={[0.085, 8, 6]} /><meshStandardMaterial color="#e6b995" /></mesh>
        </group>
      ))}
      <mesh position={[0, 0.035, depth * 1.55]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.38, 0.52, 28]} />
        <meshBasicMaterial color={selected ? '#ffe783' : waiting > 0 ? '#f08d64' : '#77d0b0'} transparent opacity={0.9} />
      </mesh>
      <mesh position={[0, 0.07, -depth * 0.8]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.22 + Math.min(capacity, 4) * 0.04, 24]} />
        <meshBasicMaterial color="#dff6e9" transparent opacity={0.65} />
      </mesh>
    </group>
  );
}

function Palm({ x, z, scale = 1 }: { x: number; z: number; scale?: number }) {
  return (
    <group position={[x, 0.45, z]} scale={scale}>
      <mesh castShadow position={[0, 0.55, 0]}><cylinderGeometry args={[0.06, 0.1, 1.1, 7]} /><meshStandardMaterial color="#79563b" /></mesh>
      {[0, 1, 2, 3, 4].map(i => (
        <mesh key={i} castShadow position={[0, 1.13, 0]} rotation={[0.18, (Math.PI * 2 * i) / 5, 0.65]}>
          <boxGeometry args={[0.9, 0.06, 0.18]} /><meshStandardMaterial color="#3f8e57" />
        </mesh>
      ))}
    </group>
  );
}

function ArrivalCraft({ source, progress, lane }: { source: 'small-boat' | 'speedboats' | 'ferry' | 'seaplane'; progress: number; lane: number }) {
  const seaStart: readonly [number, number, number] = [-8.2, -0.12, 5.6 + lane * 0.9];
  const seaEnd: readonly [number, number, number] = [-5.1, -0.08, 3.9 + lane * 0.42];
  const airStart: readonly [number, number, number] = [7.8, 4.5 + lane * 0.35, -7.2];
  const airEnd: readonly [number, number, number] = [4.8, 1.05 + lane * 0.18, 3.8];
  const start = source === 'seaplane' ? airStart : seaStart;
  const end = source === 'seaplane' ? airEnd : seaEnd;
  const smooth = progress * progress * (3 - 2 * progress);
  const position: [number, number, number] = [
    start[0] + (end[0] - start[0]) * smooth,
    start[1] + (end[1] - start[1]) * smooth,
    start[2] + (end[2] - start[2]) * smooth
  ];

  if (source === 'seaplane') {
    return <group position={position} rotation={[0, -0.35, 0]}>
      <mesh castShadow><boxGeometry args={[1.3, 0.25, 0.28]} /><meshStandardMaterial color="#f1dfb0" /></mesh>
      <mesh castShadow position={[0, 0.02, 0]}><boxGeometry args={[0.35, 0.08, 2.1]} /><meshStandardMaterial color="#cf704f" /></mesh>
      <mesh castShadow position={[-0.25, -0.22, 0.46]}><boxGeometry args={[0.72, 0.08, 0.12]} /><meshStandardMaterial color="#e7d59f" /></mesh>
      <mesh castShadow position={[-0.25, -0.22, -0.46]}><boxGeometry args={[0.72, 0.08, 0.12]} /><meshStandardMaterial color="#e7d59f" /></mesh>
    </group>;
  }

  const length = source === 'ferry' ? 2.25 : source === 'speedboats' ? 0.95 : 1.35;
  const width = source === 'ferry' ? 1.05 : 0.48;
  return <group position={position} rotation={[0, -0.95, 0]}>
    <mesh castShadow><boxGeometry args={[length, 0.24, width]} /><meshStandardMaterial color={source === 'speedboats' ? '#e16e4d' : '#f0e0b4'} /></mesh>
    <mesh castShadow position={[0, 0.27, 0]}><boxGeometry args={[length * 0.48, source === 'ferry' ? 0.5 : 0.28, width * 0.72]} /><meshStandardMaterial color={source === 'ferry' ? '#d8ede5' : '#5fa8ae'} /></mesh>
    {source === 'ferry' ? <mesh castShadow position={[0, 0.67, 0]}><boxGeometry args={[1.05, 0.28, 0.68]} /><meshStandardMaterial color="#f5e7bf" /></mesh> : null}
  </group>;
}

function ArrivalTraffic({ state }: { state: BootstrapState }) {
  const wave = state.normalWave;
  const totalDemand = wave.activeNeedIds.reduce((sum, need) => sum + wave.demandTargetByNeed[need], 0);
  const composition = arrivalCompositionForWave(state.currentWaveNumber);
  const craft = arrivalCraftProjection(state.currentWaveNumber, wave.phase, wave.releasedDemand, totalDemand);
  const visibleGuests = Math.min(composition.visibleGuestLimit, wave.releasedDemand);
  return <>
    {craft.map(item => <ArrivalCraft key={item.id} source={item.source} progress={item.progress} lane={item.lane} />)}
    {Array.from({ length: visibleGuests }).map((_, index) => {
      const t = (index + 1) / (visibleGuests + 1);
      return <group key={`arrival-guest-${index}`} position={[-4.8 + 3.2 * t, 0.48, 3.65 - 2.05 * t]}>
        <mesh castShadow position={[0, 0.14, 0]}><boxGeometry args={[0.1, 0.23, 0.1]} /><meshStandardMaterial color={index % 2 ? '#f1a76a' : '#6ab4c7'} /></mesh>
        <mesh castShadow position={[0, 0.32, 0]}><sphereGeometry args={[0.075, 8, 6]} /><meshStandardMaterial color="#e4b28f" /></mesh>
      </group>;
    })}
  </>;
}

function WorldScene({ state, selectedNeed, onSelectNeed }: ResortWorld3DProps) {
  const environment = environmentProfileForWave(state.currentWaveNumber, state.normalWave.phase);
  const activeNeeds = ACTIVE_SERVICE_ORDER.filter(need => state.normalWave.activeNeedIds.includes(need));
  const activeGuests = activeNeeds.reduce((sum, need) => sum + state.normalWave.activeByNeed[need], 0);

  return (
    <>
      <color attach="background" args={[environment.sky]} />
      <fog attach="fog" args={[environment.fog, environment.fogNear, environment.fogFar]} />
      <ambientLight intensity={environment.ambientIntensity} />
      <hemisphereLight intensity={environment.hemisphereIntensity} color={environment.sunColor} groundColor="#24584f" />
      <directionalLight castShadow position={environment.timeOfDay === 'sunset' ? [-10, 5.5, -3] : [-6, 11, -5]} intensity={environment.sunIntensity} color={environment.sunColor} shadow-mapSize-width={1024} shadow-mapSize-height={1024} />

      <mesh receiveShadow position={[0, -0.52, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[34, 26]} />
        <meshStandardMaterial color={environment.ocean} roughness={environment.weather === 'clear' ? 0.32 : 0.48} metalness={0.08} />
      </mesh>
      <mesh receiveShadow position={[0, -0.18, 0]}>
        <cylinderGeometry args={[6.55, 6.9, 0.32, 48]} />
        <meshStandardMaterial color="#e4cf91" roughness={1} />
      </mesh>
      <mesh receiveShadow position={[0, 0.02, 0]}>
        <cylinderGeometry args={[5.85, 6.1, 0.48, 48]} />
        <meshStandardMaterial color="#5a9a63" roughness={1} />
      </mesh>
      <mesh receiveShadow position={[0, 0.28, 0]}>
        <cylinderGeometry args={[4.75, 5.3, 0.22, 36]} />
        <meshStandardMaterial color="#74af68" roughness={1} />
      </mesh>

      <mesh receiveShadow position={[0, 0.43, 0.15]}><boxGeometry args={[0.55, 0.07, 5.5]} /><meshStandardMaterial color="#d5b879" /></mesh>
      <mesh receiveShadow position={[-1.8, 0.43, -0.5]} rotation={[0, 0.95, 0]}><boxGeometry args={[0.42, 0.07, 4.0]} /><meshStandardMaterial color="#d5b879" /></mesh>
      <mesh receiveShadow position={[1.8, 0.43, -0.4]} rotation={[0, -0.95, 0]}><boxGeometry args={[0.42, 0.07, 4.0]} /><meshStandardMaterial color="#d5b879" /></mesh>

      <Palm x={-4.7} z={-2.7} scale={0.9} /><Palm x={4.6} z={-2.4} /><Palm x={-4.4} z={3.1} scale={1.1} /><Palm x={4.8} z={2.8} scale={0.85} />

      {environment.weather === 'tropical-rain' ? <group>
        {Array.from({ length: 44 }).map((_, index) => {
          const x = ((index * 37) % 23) / 23 * 13 - 6.5;
          const z = ((index * 19) % 29) / 29 * 11 - 5.5;
          const y = 1.3 + ((index * 11) % 17) / 17 * 5.2;
          return <mesh key={`rain-${index}`} position={[x, y, z]} rotation={[0, 0, 0.18]}>
            <boxGeometry args={[0.018, 0.5, 0.018]} />
            <meshBasicMaterial color="#c7e8ec" transparent opacity={0.58} />
          </mesh>;
        })}
      </group> : null}


      <ArrivalTraffic state={state} />

      {activeNeeds.map(need => <Building key={need} need={need} state={state} selected={selectedNeed === need} onSelect={() => onSelectNeed(need)} />)}

      {Array.from({ length: Math.min(activeGuests, 10) }).map((_, index) => {
        const angle = (index / Math.max(1, Math.min(activeGuests, 10))) * Math.PI * 2;
        return (
          <group key={`guest-${index}`} position={[Math.cos(angle) * 1.55, 0.53, Math.sin(angle) * 1.35]}>
            <mesh castShadow position={[0, 0.15, 0]}><boxGeometry args={[0.11, 0.25, 0.11]} /><meshStandardMaterial color={index % 2 ? '#f0a868' : '#6db6c8'} /></mesh>
            <mesh castShadow position={[0, 0.34, 0]}><sphereGeometry args={[0.08, 8, 6]} /><meshStandardMaterial color="#e4b28f" /></mesh>
          </group>
        );
      })}
    </>
  );
}

export function ResortWorld3D(props: ResortWorld3DProps) {
  return (
    <div className="shell__three" data-renderer="three-r3f" data-selected-need={props.selectedNeed} data-arrival-source={arrivalCompositionForWave(props.state.currentWaveNumber).source} data-time-of-day={environmentProfileForWave(props.state.currentWaveNumber, props.state.normalWave.phase).timeOfDay} data-weather={environmentProfileForWave(props.state.currentWaveNumber, props.state.normalWave.phase).weather}>
      <Canvas
        orthographic
        shadows
        dpr={[1, 1.5]}
        camera={{ position: [10.5, 12.5, 13.5], zoom: 47, near: 0.1, far: 80 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        onCreated={({ camera }) => camera.lookAt(0, 0, 0)}
      >
        <WorldScene {...props} />
      </Canvas>
    </div>
  );
}
