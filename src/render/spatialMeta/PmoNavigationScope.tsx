/** Renderer-only PMO terrain binding. Gameplay Core never receives mutable spatial state. */
import { createContext, useContext, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { getSpatialSnapshot, subscribeSpatial } from './registry';
import { getPublishedPmoRegistry } from './pmoServiceLayout';
import { findIslandTerrain, makeTerrainProjector } from './terrainProjector';
import { buildPmoNavigationWorld, type PmoNavigationWorld } from './pmoNavigationWorld';
import type { SpatialRegistry } from './registry';

/** Opt-in until 3D browser acceptance proves all animated consumers. */
export const PMO_WORLD_ENABLED = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('pmoWorld') !== '0';

interface TerrainBinding {
  mesh: THREE.Mesh;
  matrix: THREE.Matrix4;
  registry: SpatialRegistry;
  world: PmoNavigationWorld;
}
const Context = createContext<PmoNavigationWorld | null>(null);
export const usePmoNavigationWorld = (): PmoNavigationWorld | null => useContext(Context);

/** Single instance per exact authored registry object and island mesh world transform.
 * No virtual route can be promoted here; serviceRoute independently fails closed.
 */
export function PmoNavigationScope({children}: {children: ReactNode}) {
  const scene = useThree(s => s.scene);
  const snapshot = useSyncExternalStore(subscribeSpatial, getSpatialSnapshot);
  const published = useMemo(() => getPublishedPmoRegistry(), [snapshot.registry]);
  const cache = useRef<TerrainBinding | null>(null);
  const rejected = useRef<{mesh: THREE.Mesh; registry: SpatialRegistry; matrix: THREE.Matrix4} | null>(null);
  const [binding, setBinding] = useState<TerrainBinding | null>(null);
  useFrame((_, delta) => {
    if (cache.current?.world) cache.current.world.liftTransit.tick(Math.min(delta,0.05));
    if (!PMO_WORLD_ENABLED) return;
    const mesh = findIslandTerrain(scene);
    if (!mesh) {
      if (cache.current) {cache.current = null; setBinding(null);}
      return;
    }
    mesh.updateWorldMatrix(true, false);
    const matrix = mesh.matrixWorld;
    const same = (v: {mesh: THREE.Mesh; registry: SpatialRegistry; matrix: THREE.Matrix4} | null) =>
      !!v && v.mesh === mesh && v.registry === published.registry && v.matrix.equals(matrix);
    if (same(cache.current) || same(rejected.current)) return;
    try {
      const world = buildPmoNavigationWorld(published.registry, makeTerrainProjector(mesh), published.authority);
      const next: TerrainBinding = {mesh, matrix: matrix.clone(), registry: published.registry, world};
      cache.current = next;
      rejected.current = null;
      setBinding(next);
    } catch (error) {
      rejected.current = {mesh, registry: published.registry, matrix: matrix.clone()};
      cache.current = null;
      setBinding(null);
      console.error('PMO_TERRAIN_BINDING_FAILED', error);
    }
  });
  // Invalidate synchronously when the author edits the registry, before useFrame rebuilds it.
  const value = PMO_WORLD_ENABLED && binding?.registry === published.registry ? binding.world : null;
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
