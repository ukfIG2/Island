import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Color, type Group, type ShaderMaterial } from 'three';

import type { BootstrapState, NormalWaveNeedId } from '../core/state';
import { normalWaveServiceCapacity } from '../core/state';
import type { EnvironmentProfile } from './environmentProfile';

export const SERVICE_POSITIONS: Record<NormalWaveNeedId, readonly [number, number, number]> = {
  reception: [0, 0.62, -2.75],
  food: [-3.45, 0.58, -0.15],
  drinks: [3.55, 0.56, -0.05],
  relax: [-2.05, 0.48, 3.0],
  oceanView: [3.0, 0.52, 3.25]
};

export function serviceDepth(need: NormalWaveNeedId): number {
  return need === 'oceanView' ? 1.55 : need === 'relax' ? 1.5 : 1.25;
}

function Palm({ position, scale = 1, lean = 0 }: { position: readonly [number, number, number]; scale?: number; lean?: number }) {
  const palm = useRef<Group | null>(null);
  useFrame(({ clock }) => { if (palm.current) palm.current.rotation.z = lean * 0.35 + Math.sin(clock.elapsedTime * 0.72 + position[0] * 0.9 + position[2]) * 0.028; });
  return <group ref={palm} position={[...position]} scale={scale} rotation={[lean, 0, lean * 0.35]}>
    <mesh castShadow position={[0, 0.62, 0]} rotation={[0.04, 0, -0.08]}>
      <cylinderGeometry args={[0.055, 0.13, 1.25, 7]} />
      <meshStandardMaterial color="#7a5638" roughness={1} />
    </mesh>
    {[0, 1, 2, 3, 4, 5, 6].map(i => <mesh key={i} castShadow position={[0, 1.27, 0]} rotation={[0.18, (Math.PI * 2 * i) / 7, 0.73]}>
      <boxGeometry args={[0.98, 0.045, 0.16]} />
      <meshStandardMaterial color={i % 2 ? '#3f9755' : '#55aa5e'} roughness={0.9} />
    </mesh>)}
    {[0, 1, 2].map(i => <mesh key={`coconut-${i}`} castShadow position={[-0.08 + i * 0.08, 1.18, 0.04]}>
      <sphereGeometry args={[0.09, 7, 6]} />
      <meshStandardMaterial color="#795235" roughness={1} />
    </mesh>)}
  </group>;
}

function RockCluster({ position, scale = 1 }: { position: readonly [number, number, number]; scale?: number }) {
  return <group position={[...position]} scale={scale}>
    <mesh castShadow receiveShadow position={[0, 0.18, 0]} rotation={[0.15, 0.35, 0.1]}>
      <dodecahedronGeometry args={[0.34, 0]} />
      <meshStandardMaterial color="#718078" roughness={1} />
    </mesh>
    <mesh castShadow receiveShadow position={[0.34, 0.11, 0.16]} rotation={[0.05, -0.2, 0.12]}>
      <dodecahedronGeometry args={[0.23, 0]} />
      <meshStandardMaterial color="#899087" roughness={1} />
    </mesh>
  </group>;
}

function ShoreFoam() {
  const foam = useRef<Group | null>(null);
  useFrame(({ clock }) => {
    if (!foam.current) return;
    foam.current.rotation.y = Math.sin(clock.elapsedTime * 0.22) * 0.018;
    foam.current.position.y = -0.305 + Math.sin(clock.elapsedTime * 1.15) * 0.014;
  });
  return <group ref={foam}>
    <mesh rotation={[-Math.PI / 2, 0, 0]} scale={[1.08, 0.87, 1]}>
      <ringGeometry args={[6.05, 6.28, 64]} />
      <meshBasicMaterial color="#d9f6eb" transparent opacity={0.5} />
    </mesh>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-1.4, 0.015, 1.85]} scale={[0.72, 0.38, 1]}>
      <ringGeometry args={[2.2, 2.34, 42]} />
      <meshBasicMaterial color="#eafbf3" transparent opacity={0.34} />
    </mesh>
  </group>;
}

function ResortPier() {
  return <group position={[-5.35, 0.17, 3.55]} rotation={[0, -0.82, 0]}>
    <mesh receiveShadow><boxGeometry args={[3.0, 0.12, 0.48]} /><meshStandardMaterial color="#9b7049" roughness={1} /></mesh>
    {[-1.2, -0.4, 0.4, 1.2].flatMap((x, index) => [-0.22, 0.22].map((z, side) => <mesh key={`${index}-${side}`} castShadow position={[x, -0.2, z]}>
      <cylinderGeometry args={[0.055, 0.075, 0.7, 7]} /><meshStandardMaterial color="#64462f" roughness={1} />
    </mesh>))}
    <mesh castShadow position={[-0.75, 0.22, 0]}><boxGeometry args={[0.38, 0.32, 0.34]} /><meshStandardMaterial color="#b67a43" /></mesh>
    <mesh castShadow position={[-0.27, 0.17, 0.08]}><boxGeometry args={[0.31, 0.24, 0.28]} /><meshStandardMaterial color="#d39b55" /></mesh>
  </group>;
}

function OceanSurface({ environment }: { environment: EnvironmentProfile }) {
  const material = useRef<ShaderMaterial | null>(null);
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uOcean: { value: new Color(environment.ocean) }, uStorm: { value: environment.weather === 'clear' ? 0 : environment.weather === 'overcast' ? 0.35 : 0.72 } }), []);
  useEffect(() => { if (!material.current) return; material.current.uniforms.uOcean.value.set(environment.ocean); material.current.uniforms.uStorm.value = environment.weather === 'clear' ? 0 : environment.weather === 'overcast' ? 0.35 : 0.72; }, [environment.ocean, environment.weather]);
  useFrame(({ clock }) => { if (material.current) material.current.uniforms.uTime.value = clock.elapsedTime; });
  return <mesh receiveShadow position={[0, -0.52, 0]} rotation={[-Math.PI / 2, 0, 0]}>
    <planeGeometry args={[34, 26, 56, 42]} />
    <shaderMaterial ref={material} uniforms={uniforms} vertexShader={'varying vec2 vUv; uniform float uTime; void main(){ vUv=uv; vec3 p=position; float w=sin(p.x*0.62+uTime*1.25)*0.07+cos(p.y*0.78-uTime*0.92)*0.045; p.z+=w; gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0); }'} fragmentShader={'varying vec2 vUv; uniform float uTime; uniform vec3 uOcean; uniform float uStorm; void main(){ float ripple=sin((vUv.x+vUv.y)*28.0+uTime*2.1)*0.5+0.5; float bands=sin(vUv.y*18.0-uTime*1.35)*0.5+0.5; vec3 deep=uOcean*(0.70-0.12*uStorm); vec3 light=min(vec3(1.0),uOcean*1.30+vec3(0.05,0.12,0.10)); vec3 col=mix(deep,light,0.16*ripple+0.10*bands); float glint=pow(max(0.0,sin(vUv.x*52.0+uTime*2.8)*cos(vUv.y*35.0-uTime)),10.0)*(0.14-0.06*uStorm); gl_FragColor=vec4(col+glint,1.0); }'} />
  </mesh>;
}

export function TropicalRain({ active }: { active: boolean }) {
  const rain = useRef<Group | null>(null);
  useFrame(({ clock }) => { if (!rain.current || !active) return; rain.current.children.forEach((drop, index) => { const span=6.2; const base=1.0+((index*11)%31)/31*span; drop.position.y=0.45+((base-clock.elapsedTime*(3.8+(index%4)*0.35))%span+span)%span; const baseX=((index*37)%31)/31*14-7; drop.position.x=baseX+Math.sin(clock.elapsedTime*0.8+index)*0.04; }); });
  if (!active) return null;
  return <group ref={rain}>{Array.from({ length: 58 }).map((_, index) => { const x=((index*37)%31)/31*14-7; const z=((index*19)%37)/37*12-6; const y=1+((index*11)%31)/31*6.2; return <mesh key={index} position={[x,y,z]} rotation={[0,0,0.22]}><boxGeometry args={[0.014,0.58,0.014]} /><meshBasicMaterial color="#d8f3f6" transparent opacity={0.52} /></mesh>; })}</group>;
}

export function IslandArt({ environment }: { environment: EnvironmentProfile }) {
  return <>
    <OceanSurface environment={environment} />

    <mesh position={[-0.35, -0.405, 0.25]} rotation={[-Math.PI / 2, 0, 0]} scale={[1.16, 0.91, 1]}>
      <circleGeometry args={[7.05, 64]} />
      <meshStandardMaterial color="#56bdba" transparent opacity={0.46} roughness={0.32} />
    </mesh>
    <mesh position={[-3.9, -0.385, 2.25]} rotation={[-Math.PI / 2, 0, 0]} scale={[1.9, 0.78, 1]}>
      <circleGeometry args={[1.45, 42]} />
      <meshStandardMaterial color="#79d6c6" transparent opacity={0.58} roughness={0.38} />
    </mesh>
    <ShoreFoam />

    <group rotation={[0, 0.07, 0]}>
      <mesh receiveShadow position={[0, -0.17, 0]} scale={[1.08, 1, 0.86]}>
        <cylinderGeometry args={[6.15, 6.45, 0.34, 18]} />
        <meshStandardMaterial color="#e8d39a" roughness={1} />
      </mesh>
      <mesh receiveShadow position={[-3.8, -0.16, 1.4]} scale={[1.3, 1, 0.68]} rotation={[0, 0.3, 0]}>
        <cylinderGeometry args={[2.05, 2.25, 0.3, 11]} />
        <meshStandardMaterial color="#e5cd8b" roughness={1} />
      </mesh>
      <mesh receiveShadow position={[3.9, -0.15, -1.25]} scale={[1.18, 1, 0.64]} rotation={[0, -0.25, 0]}>
        <cylinderGeometry args={[1.95, 2.18, 0.31, 10]} />
        <meshStandardMaterial color="#ead79c" roughness={1} />
      </mesh>
    </group>

    <mesh receiveShadow position={[-0.35, 0.04, -0.05]} scale={[1.02, 1, 0.84]} rotation={[0, -0.04, 0]}>
      <cylinderGeometry args={[5.42, 5.72, 0.48, 17]} />
      <meshStandardMaterial color="#5c9e62" roughness={1} />
    </mesh>
    <mesh receiveShadow position={[0.4, 0.31, -0.65]} scale={[0.92, 1, 0.72]} rotation={[0, 0.12, 0]}>
      <cylinderGeometry args={[4.18, 4.58, 0.26, 14]} />
      <meshStandardMaterial color="#78b56a" roughness={1} />
    </mesh>
    <mesh receiveShadow position={[-2.35, 0.37, 2.55]} scale={[1.25, 1, 0.7]} rotation={[-Math.PI / 2, 0, -0.25]}>
      <circleGeometry args={[1.0, 32]} />
      <meshStandardMaterial color="#56bdc4" roughness={0.28} metalness={0.08} />
    </mesh>

    <group>
      <mesh receiveShadow position={[0, 0.47, 0.0]}><boxGeometry args={[0.48, 0.065, 5.4]} /><meshStandardMaterial color="#d7bb7d" roughness={1} /></mesh>
      <mesh receiveShadow position={[-1.85, 0.47, -0.45]} rotation={[0, 0.92, 0]}><boxGeometry args={[0.38, 0.065, 4.1]} /><meshStandardMaterial color="#d7bb7d" roughness={1} /></mesh>
      <mesh receiveShadow position={[1.88, 0.47, -0.38]} rotation={[0, -0.92, 0]}><boxGeometry args={[0.38, 0.065, 4.0]} /><meshStandardMaterial color="#d7bb7d" roughness={1} /></mesh>
      {[-1.7, -0.85, 0, 0.85, 1.7].map((z, i) => <mesh key={i} receiveShadow position={[0.02, 0.505, z]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.24, 10]} /><meshStandardMaterial color="#ead49b" roughness={1} /></mesh>)}
    </group>

    <ResortPier />

    <Palm position={[-4.75, 0.42, -2.7]} scale={0.95} lean={0.07} />
    <Palm position={[-5.0, 0.38, 0.65]} scale={0.8} lean={-0.05} />
    <Palm position={[-4.25, 0.4, 3.25]} scale={1.08} lean={0.04} />
    <Palm position={[-2.9, 0.42, -3.9]} scale={0.78} lean={0.09} />
    <Palm position={[4.75, 0.4, -2.5]} scale={1.0} lean={-0.06} />
    <Palm position={[5.0, 0.36, 0.85]} scale={0.82} lean={0.05} />
    <Palm position={[4.5, 0.39, 2.75]} scale={0.92} lean={-0.08} />
    <Palm position={[1.9, 0.48, 4.45]} scale={0.72} lean={0.04} />
    <Palm position={[-1.0, 0.48, 4.6]} scale={0.68} lean={-0.04} />

    <RockCluster position={[-5.25, 0.12, -1.35]} scale={1.1} />
    <RockCluster position={[5.0, 0.08, 1.85]} scale={0.85} />
    <RockCluster position={[3.7, 0.16, -4.05]} scale={0.78} />
    <RockCluster position={[-3.2, 0.14, 4.15]} scale={0.7} />
  </>;
}

function ReceptionArchitecture({ level, selected }: { level: number; selected: boolean }) {
  const wall = selected ? '#ffe08b' : '#ead9ac';
  return <>
    <mesh castShadow receiveShadow position={[0, 0.42, 0]}><boxGeometry args={[1.7, 0.84, 1.25]} /><meshStandardMaterial color={wall} roughness={0.82} /></mesh>
    <mesh castShadow position={[0, 1.05, 0]} rotation={[0, Math.PI / 4, 0]}><coneGeometry args={[1.28, 0.62, 4]} /><meshStandardMaterial color="#8a4b3c" roughness={0.94} /></mesh>
    <mesh castShadow position={[0, 0.43, 0.78]}><boxGeometry args={[1.0, 0.1, 0.52]} /><meshStandardMaterial color="#b87b4a" /></mesh>
    <mesh castShadow position={[-0.37, 0.22, 0.98]}><cylinderGeometry args={[0.055, 0.055, 0.45, 7]} /><meshStandardMaterial color="#775137" /></mesh>
    <mesh castShadow position={[0.37, 0.22, 0.98]}><cylinderGeometry args={[0.055, 0.055, 0.45, 7]} /><meshStandardMaterial color="#775137" /></mesh>
    {level >= 2 ? <>
      <mesh castShadow receiveShadow position={[-1.02, 0.34, -0.05]}><boxGeometry args={[0.68, 0.68, 0.96]} /><meshStandardMaterial color="#e5cf9e" /></mesh>
      <mesh castShadow receiveShadow position={[1.02, 0.34, -0.05]}><boxGeometry args={[0.68, 0.68, 0.96]} /><meshStandardMaterial color="#e5cf9e" /></mesh>
    </> : null}
    {level >= 3 ? <group position={[0, 1.24, -0.15]}>
      <mesh castShadow><boxGeometry args={[0.56, 0.68, 0.56]} /><meshStandardMaterial color="#d9c38f" /></mesh>
      <mesh castShadow position={[0, 0.52, 0]} rotation={[0, Math.PI / 4, 0]}><coneGeometry args={[0.48, 0.48, 4]} /><meshStandardMaterial color="#774338" /></mesh>
    </group> : null}
  </>;
}

function RestaurantArchitecture({ level, selected }: { level: number; selected: boolean }) {
  return <>
    <mesh castShadow receiveShadow position={[0, 0.38, 0]}><boxGeometry args={[1.95, 0.76, 1.28]} /><meshStandardMaterial color={selected ? '#ffd77a' : '#cb714d'} roughness={0.86} /></mesh>
    <mesh castShadow position={[0, 0.93, 0]} rotation={[0, Math.PI / 4, 0]} scale={[1.45, 1, 0.92]}><coneGeometry args={[1.02, 0.52, 4]} /><meshStandardMaterial color="#744339" /></mesh>
    <mesh castShadow position={[0.72, 0.38, -0.46]}><boxGeometry args={[0.22, 1.15, 0.22]} /><meshStandardMaterial color="#806352" /></mesh>
    <mesh receiveShadow position={[0, 0.06, 1.02]}><boxGeometry args={[1.65, 0.08, 0.68]} /><meshStandardMaterial color="#b88355" /></mesh>
    {[-0.52, 0, 0.52].map((x, i) => <group key={i} position={[x, 0.2, 1.05]}>
      <mesh castShadow><cylinderGeometry args={[0.18, 0.2, 0.08, 10]} /><meshStandardMaterial color="#f0d394" /></mesh>
      <mesh castShadow position={[0, 0.16, 0]}><cylinderGeometry args={[0.025, 0.035, 0.3, 6]} /><meshStandardMaterial color="#6d5544" /></mesh>
    </group>)}
    {level >= 2 ? <mesh castShadow receiveShadow position={[-1.15, 0.29, 0]}><boxGeometry args={[0.6, 0.58, 1.12]} /><meshStandardMaterial color="#d88658" /></mesh> : null}
    {level >= 3 ? <group position={[0, 1.25, 0]}>
      <mesh castShadow><boxGeometry args={[0.72, 0.46, 0.72]} /><meshStandardMaterial color="#d99a69" /></mesh>
      <mesh castShadow position={[0, 0.35, 0]} rotation={[0, Math.PI / 4, 0]}><coneGeometry args={[0.58, 0.4, 4]} /><meshStandardMaterial color="#6f3f36" /></mesh>
    </group> : null}
  </>;
}

function BeachBarArchitecture({ level, selected }: { level: number; selected: boolean }) {
  return <>
    <mesh receiveShadow position={[0, 0.06, 0]}><boxGeometry args={[1.72, 0.12, 1.32]} /><meshStandardMaterial color="#aa7b4d" /></mesh>
    <mesh castShadow position={[0, 0.4, 0.24]}><boxGeometry args={[1.5, 0.48, 0.38]} /><meshStandardMaterial color={selected ? '#ffe080' : '#e5ad52'} /></mesh>
    {[-0.62, 0.62].flatMap((x, i) => [-0.45, 0.45].map((z, j) => <mesh key={`${i}-${j}`} castShadow position={[x, 0.58, z]}><cylinderGeometry args={[0.04, 0.05, 1.15, 7]} /><meshStandardMaterial color="#705035" /></mesh>))}
    <mesh castShadow position={[0, 1.12, 0]}><boxGeometry args={[1.75, 0.11, 1.35]} /><meshStandardMaterial color="#e5c26d" /></mesh>
    {[-0.55, 0, 0.55].map((x, i) => <mesh key={i} castShadow position={[x, 0.17, 0.78]}><cylinderGeometry args={[0.12, 0.14, 0.28, 8]} /><meshStandardMaterial color="#6aa1a3" /></mesh>)}
    {level >= 2 ? <mesh receiveShadow position={[1.15, 0.07, 0]}><boxGeometry args={[0.62, 0.12, 1.2]} /><meshStandardMaterial color="#b78958" /></mesh> : null}
    {level >= 3 ? <group position={[0, 1.42, 0]}>
      <mesh castShadow><cylinderGeometry args={[0.07, 0.08, 0.55, 8]} /><meshStandardMaterial color="#6f5038" /></mesh>
      <mesh castShadow position={[0, 0.22, 0]} rotation={[0, 0, -0.12]}><boxGeometry args={[1.05, 0.08, 0.48]} /><meshStandardMaterial color="#f2d26f" /></mesh>
    </group> : null}
  </>;
}

function PoolArchitecture({ level, selected }: { level: number; selected: boolean }) {
  return <>
    <mesh receiveShadow position={[0, 0.04, 0]}><cylinderGeometry args={[1.08, 1.12, 0.1, 24]} /><meshStandardMaterial color={selected ? '#f4d878' : '#dfc28b'} /></mesh>
    <mesh position={[0, 0.105, 0]}><cylinderGeometry args={[0.82, 0.82, 0.045, 28]} /><meshStandardMaterial color="#42b9c7" roughness={0.22} metalness={0.08} /></mesh>
    <group position={[0.95, 0.22, 0.52]}>
      <mesh castShadow><boxGeometry args={[0.6, 0.34, 0.52]} /><meshStandardMaterial color="#efe0b3" /></mesh>
      <mesh castShadow position={[0, 0.31, 0]} rotation={[0, Math.PI / 4, 0]}><coneGeometry args={[0.48, 0.38, 4]} /><meshStandardMaterial color="#79a965" /></mesh>
    </group>
    {level >= 2 ? <>
      <mesh receiveShadow position={[-1.05, 0.05, -0.35]}><boxGeometry args={[0.72, 0.1, 1.32]} /><meshStandardMaterial color="#d7b77e" /></mesh>
      {[-0.25, 0.25].map((z, i) => <mesh key={i} castShadow position={[-1.05, 0.17, z - 0.35]} rotation={[0, 0.12, 0]}><boxGeometry args={[0.55, 0.08, 0.18]} /><meshStandardMaterial color="#f0d9a2" /></mesh>)}
    </> : null}
    {level >= 3 ? <group position={[0.68, 0.25, -0.7]}>
      <mesh castShadow position={[0, 0.45, 0]}><cylinderGeometry args={[0.06, 0.08, 0.9, 7]} /><meshStandardMaterial color="#d6e8de" /></mesh>
      <mesh castShadow position={[-0.25, 0.76, 0]} rotation={[0, 0, 0.48]}><boxGeometry args={[0.62, 0.1, 0.22]} /><meshStandardMaterial color="#e58b5e" /></mesh>
    </group> : null}
  </>;
}

function BungalowArchitecture({ level, selected }: { level: number; selected: boolean }) {
  const count = Math.min(3, Math.max(1, level));
  return <>
    <mesh receiveShadow position={[0, 0.03, 0]}><boxGeometry args={[2.0, 0.08, 1.4]} /><meshStandardMaterial color={selected ? '#f0d982' : '#ba9161'} /></mesh>
    {Array.from({ length: count }).map((_, index) => {
      const x = (index - (count - 1) / 2) * 0.72;
      return <group key={index} position={[x, 0.04, 0]}>
        <mesh castShadow position={[0, 0.34, 0]}><boxGeometry args={[0.62, 0.62, 0.8]} /><meshStandardMaterial color="#d7bd87" /></mesh>
        <mesh castShadow position={[0, 0.82, 0]} rotation={[0, Math.PI / 4, 0]}><coneGeometry args={[0.56, 0.48, 4]} /><meshStandardMaterial color="#7d543e" /></mesh>
        <mesh receiveShadow position={[0, 0.08, 0.56]}><boxGeometry args={[0.58, 0.08, 0.38]} /><meshStandardMaterial color="#9c754f" /></mesh>
      </group>;
    })}
    {level >= 3 ? <mesh castShadow position={[0, 1.18, -0.15]}><boxGeometry args={[1.2, 0.12, 0.18]} /><meshStandardMaterial color="#f0dfaa" /></mesh> : null}
  </>;
}

function ServiceArchitecture({ need, level, selected }: { need: NormalWaveNeedId; level: number; selected: boolean }) {
  if (need === 'reception') return <ReceptionArchitecture level={level} selected={selected} />;
  if (need === 'food') return <RestaurantArchitecture level={level} selected={selected} />;
  if (need === 'drinks') return <BeachBarArchitecture level={level} selected={selected} />;
  if (need === 'relax') return <PoolArchitecture level={level} selected={selected} />;
  return <BungalowArchitecture level={level} selected={selected} />;
}

export function ServiceBuilding({ need, state, selected, onSelect, environment }: { need: NormalWaveNeedId; state: BootstrapState; selected: boolean; onSelect: () => void; environment: EnvironmentProfile }) {
  const level = state.normalWave.buildingLevelsByNeed[need];
  const capacity = normalWaveServiceCapacity(state, need);
  const waiting = state.normalWave.queueByNeed[need];
  const workers = Object.values(state.normalWave.workerAssignments).filter(value => value === need).length;
  const [x, y, z] = SERVICE_POSITIONS[need];
  const depth = serviceDepth(need);

  return <group position={[x, y, z]} onClick={(event: ThreeEvent<MouseEvent>) => { event.stopPropagation(); onSelect(); }}>
    <ServiceArchitecture need={need} level={level} selected={selected} />
    {environment.timeOfDay !== 'day' ? <group>
      <pointLight position={[0, 1.0, 0.8]} color="#ffd27a" intensity={environment.timeOfDay === 'evening' ? 1.05 : 0.55} distance={3.2} decay={2} />
      {[-0.55, 0.55].map((lx, index) => <mesh key={index} position={[lx, 0.72, depth * 0.6]}><sphereGeometry args={[0.055, 8, 6]} /><meshStandardMaterial color="#ffd98a" emissive="#ffb84d" emissiveIntensity={environment.timeOfDay === 'evening' ? 2.8 : 1.5} /></mesh>)}
    </group> : null}

    <group position={[0.72, 0.055, depth * 0.82]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.14, 20]} />
        <meshBasicMaterial color={workers > 0 ? '#75d39a' : '#c77d68'} transparent opacity={0.88} />
      </mesh>
      <mesh position={[0, 0.018, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.17, 0.22, 20]} />
        <meshBasicMaterial color={workers > 0 ? '#d9f7e4' : '#f0c0ae'} transparent opacity={0.72} />
      </mesh>
    </group>
    <mesh position={[0, 0.035, depth * 1.62]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.4, 0.55, 28]} />
      <meshBasicMaterial color={selected ? '#ffe783' : waiting > 0 ? '#f08d64' : '#77d0b0'} transparent opacity={0.92} />
    </mesh>
    <mesh position={[0, 0.07, -depth * 0.82]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[0.22 + Math.min(capacity, 4) * 0.04, 24]} />
      <meshBasicMaterial color="#dff6e9" transparent opacity={0.65} />
    </mesh>
  </group>;
}
