import { Canvas } from '@react-three/fiber';
import { arrivalCompositionForWave } from '../core/arrivalComposition';
import { ResortArrivalActivity } from './ResortArrivalActivity';
import { environmentProfileForWave } from './environmentProfile';
import type { BootstrapState, NormalWaveNeedId } from '../core/state';
import { IslandArt, ServiceBuilding, TropicalRain } from './ResortWorldArt';

const ACTIVE_SERVICE_ORDER: readonly NormalWaveNeedId[] = ['reception', 'food', 'drinks', 'relax', 'oceanView'];

interface ResortWorld3DProps {
  state: BootstrapState;
  selectedNeed: NormalWaveNeedId;
  onSelectNeed: (need: NormalWaveNeedId) => void;
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


      <ResortArrivalActivity state={state} />

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
    <div className="shell__three" data-renderer="three-r3f" data-selected-need={props.selectedNeed} data-arrival-source={arrivalCompositionForWave(props.state.currentWaveNumber).source} data-time-of-day={environmentProfileForWave(props.state.currentWaveNumber, props.state.normalWave.phase).timeOfDay} data-weather={environmentProfileForWave(props.state.currentWaveNumber, props.state.normalWave.phase).weather} data-world-art="stylized-v2" data-world-motion="materials-v1" data-arrival-activity="craft-v1">
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
