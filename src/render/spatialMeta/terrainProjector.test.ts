import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { findIslandTerrain, makeTerrainProjector } from './terrainProjector';

describe('PMO terrain projector', () => {
  it("projects only onto transformed terrain within the author's Y band", () => {
    const root = new THREE.Group();
    root.scale.setScalar(8);
    root.position.y = 0.55;
    root.rotation.y = 70 * Math.PI / 180;
    const geometry = new THREE.PlaneGeometry(2, 2, 1, 1);
    geometry.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    mesh.position.y = 0.125;
    root.add(mesh);
    root.updateWorldMatrix(true, true);
    const projected = makeTerrainProjector(mesh);
    expect(projected.project(0, 0, 1.55)?.[1]).toBeCloseTo(1.55, 5);
    expect(projected.project(0, 0, 2.30)).toBeNull();
    expect(projected.project(200, 200, 1.55)).toBeNull();
    root.position.y += 1;
    root.updateWorldMatrix(true, true);
    expect(projected.project(0, 0, 2.55)).toBeNull();
  });
  it('does not mistake generic scene geometry for the authoritative island GLB', () => {
    const scene = new THREE.Scene();
    const group = new THREE.Group();
    group.name = 'replaceable-island-boundary-source';
    group.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
    scene.add(group);
    expect(findIslandTerrain(scene)).toBeNull();
  });
});
