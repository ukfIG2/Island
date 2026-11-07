import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { getSpatialSnapshot, handleSpatialPick, setSpatialError } from './registry';
import { SpatialMetaOverlay } from './SpatialMetaDev';

/**
 * Editor-only picking bridge.
 *
 * This lives directly inside the existing R3F Canvas and does not depend on
 * WorldScene's internal JSX or on the old calibration onPick prop.
 * It resolves the dominant GLTF terrain mesh by position vertex count and
 * raycasts ONLY that mesh, excluding the animated ocean, buildings and the
 * editor's own point/paint markers.
 */
export function SpatialMetaCanvasBridge() {
  const { gl, camera, scene } = useThree();

  useEffect(() => {
    const element = gl.domElement;
    const raycaster = new THREE.Raycaster();
    const cursor = new THREE.Vector2();

    function click(event: MouseEvent) {
      if (event.button !== 0) return;
      const state = getSpatialSnapshot();
      if (!state.selectedId || (state.tool !== 'point' && state.tool !== 'paint')) return;

      const bounds = element.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      cursor.set(
        ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
        -((event.clientY - bounds.top) / bounds.height) * 2 + 1
      );

      let terrain: THREE.Mesh | null = null;
      let mostVertices = 0;
      scene.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        const geom = object.geometry;
        if (!(geom instanceof THREE.BufferGeometry)) return;
        const count = geom.getAttribute('position')?.count ?? 0;
        if (count > mostVertices) {
          mostVertices = count;
          terrain = object;
        }
      });

      // A missing/different island is not a license to pick ocean/buildings.
      if (!terrain || mostVertices < 3000) {
        setSpatialError('Не удалось уверенно определить mesh острова (нет геометрии с >=3000 вершинами). Точка не добавлена.');
        return;
      }

      raycaster.setFromCamera(cursor, camera);
      const hits = raycaster.intersectObject(terrain as THREE.Mesh, true);
      if (!hits.length) return;

      const world = hits[0].point;
      try {
        handleSpatialPick([world.x, world.y, world.z]);
        // Spatial editing should not accidentally trigger ordinary scene clicks.
        event.preventDefault();
        event.stopImmediatePropagation();
      } catch (error) {
        setSpatialError(error instanceof Error ? error.message : String(error));
      }
    }

    // Capture on the actual WebGL canvas, without changing existing scene props.
    element.addEventListener('click', click, true);
    return () => element.removeEventListener('click', click, true);
  }, [gl, camera, scene]);

  return <SpatialMetaOverlay />;
}
