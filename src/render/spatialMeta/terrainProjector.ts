/** Terrain-only PMO projection. No gameplay state, no metadata mutation and no global raycast patches. */
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import type { TerrainProjector } from './navigation';
import type { SpatialPoint } from './registry';

// These counts identify the currently approved GLB's single island mesh, not a generic "biggest mesh".
const TERRAIN_POSITIONS = 422916;
const TERRAIN_INDICES = 2003928;
const ISLAND_ROOT = 'replaceable-island-boundary-source';

/** Require the exact scene-owned island; never use ocean or editor decorations as terrain. */
export function findIslandTerrain(scene: THREE.Object3D): THREE.Mesh | null {
  const root = scene.getObjectByName(ISLAND_ROOT);
  if (!root) return null;
  const matches: THREE.Mesh[] = [];
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const geometry = object.geometry;
    if (!(geometry instanceof THREE.BufferGeometry)) return;
    if (geometry.getAttribute('position')?.count === TERRAIN_POSITIONS &&
        geometry.index?.count === TERRAIN_INDICES) matches.push(object);
  });
  return matches.length === 1 ? matches[0] : null;
}

/** Build one independent BVH over immutable terrain triangles. `indirect` preserves rendering indices. */
export function makeTerrainProjector(mesh: THREE.Mesh, toleranceY = 0.52): TerrainProjector {
  if (!Number.isFinite(toleranceY) || toleranceY <= 0) throw new Error('BAD_TERRAIN_TOLERANCE');
  if (!(mesh.geometry instanceof THREE.BufferGeometry)) throw new Error('TERRAIN_MESH_REQUIRED');
  mesh.updateWorldMatrix(true, false);
  const boundMatrix = mesh.matrixWorld.clone();
  const inverse = boundMatrix.clone().invert();
  const bvh = new MeshBVH(mesh.geometry, { indirect: true });
  const ray = new THREE.Ray();
  const scratch = new THREE.Vector3();
  const start = new THREE.Vector3();
  const down = new THREE.Vector3(0, -1, 0);
  const memo = new Map<string, SpatialPoint | null>();
  return {
    project(x: number, z: number, nearY: number): SpatialPoint | null {
      if (![x, z, nearY].every(Number.isFinite)) return null;
      mesh.updateWorldMatrix(true, false);
      // A transformed or replaced scene mesh invalidates all derived paths. Rebind explicitly.
      if (!mesh.matrixWorld.equals(boundMatrix)) return null;
      const key = [x, z, nearY].map(n => n.toFixed(5)).join(':');
      if (memo.has(key)) return memo.get(key)!;
      start.set(x, nearY + toleranceY + 0.01, z);
      ray.set(start, down).applyMatrix4(inverse);
      let best: SpatialPoint | null = null;
      let minDelta = Infinity;
      for (const hit of bvh.raycast(ray, THREE.DoubleSide)) {
        scratch.copy(hit.point).applyMatrix4(boundMatrix);
        const delta = Math.abs(scratch.y - nearY);
        if (delta <= toleranceY + 1e-5 && delta < minDelta) {
          best = [scratch.x, scratch.y, scratch.z];
          minDelta = delta;
        }
      }
      memo.set(key, best);
      return best;
    }
  };
}

export function bindIslandTerrain(scene: THREE.Object3D): TerrainProjector | null {
  const mesh = findIslandTerrain(scene);
  return mesh ? makeTerrainProjector(mesh) : null;
}
