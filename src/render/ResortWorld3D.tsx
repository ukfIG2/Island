import { Canvas } from '@react-three/fiber';
import { arrivalCompositionForWave, arrivalCraftProjection } from '../core/arrivalComposition';
import { environmentProfileForWave } from './environmentProfile';
import type { BootstrapState, NormalWaveNeedId } from '../core/state';
import { IslandArt, ServiceBuilding, TropicalRain } from './ResortWorldArt';

const ACTIVE_SERVICE_ORDER: readonly NormalWaveNeedId[] = ['reception', 'food', 'drinks', 'relax', 'oceanView'];

interface ResortWorld3DProps {
  state: BootstrapState;
  selectedNeed: NormalWaveNeedId;
  onSelectNeed: (need: NormalWaveNeedId) => void;
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

      <IslandArt environment={environment} />

      <TropicalRain active={environment.weather === 'tropical-rain'} />


      <ArrivalTraffic state={state} />

      {activeNeeds.map(need => <ServiceBuilding key={need} need={need} state={state} selected={selectedNeed === need} onSelect={() => onSelectNeed(need)} environment={environment} />)}

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
    <div className="shell__three" data-renderer="three-r3f" data-selected-need={props.selectedNeed} data-arrival-source={arrivalCompositionForWave(props.state.currentWaveNumber).source} data-time-of-day={environmentProfileForWave(props.state.currentWaveNumber, props.state.normalWave.phase).timeOfDay} data-weather={environmentProfileForWave(props.state.currentWaveNumber, props.state.normalWave.phase).weather} data-world-art="stylized-v2" data-world-motion="materials-v1">
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
