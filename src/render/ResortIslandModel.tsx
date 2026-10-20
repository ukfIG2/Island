import {
  useEffect
} from 'react';

import {
  useLoader,
  useThree,
  type ThreeEvent
} from '@react-three/fiber';

import * as THREE from 'three';

import {
  GLTFLoader
} from 'three/examples/jsm/loaders/GLTFLoader.js';

interface ResortIslandModelProps {
  onPick?: (
    point: readonly [
      number,
      number,
      number
    ]
  ) => void;
}

function tuneTexture(
  texture: THREE.Texture | null | undefined,
  anisotropy: number
) {
  if (!texture) {
    return;
  }

  texture.anisotropy =
    anisotropy;

  texture.magFilter =
    THREE.LinearFilter;

  texture.minFilter =
    THREE.LinearMipmapLinearFilter;

  texture.generateMipmaps =
    true;

  texture.needsUpdate =
    true;
}

function tuneMaterial(
  material: THREE.Material,
  anisotropy: number
) {
  if (
    !(
      material instanceof
      THREE.MeshStandardMaterial
    )
  ) {
    return;
  }

  /*
   * Meshy exports one metallic/roughness response
   * across the unified scene. Almost everything on
   * this island should behave as dielectric.
   */
  material.metalness =
    0.0;

  /*
   * Preserve the embedded roughness map but stop
   * the surface becoming glossy/plastic.
   */
  material.roughness =
    0.92;

  /*
   * Recover some apparent small-scale definition
   * from the existing 2K normal texture.
   */
  if (material.normalMap) {
    material.normalScale.set(
      1.28,
      1.28
    );
  }

  tuneTexture(
    material.map,
    anisotropy
  );

  tuneTexture(
    material.normalMap,
    anisotropy
  );

  tuneTexture(
    material.roughnessMap,
    anisotropy
  );

  tuneTexture(
    material.metalnessMap,
    anisotropy
  );

  tuneTexture(
    material.aoMap,
    anisotropy
  );

  tuneTexture(
    material.emissiveMap,
    anisotropy
  );

  tuneTexture(
    material.alphaMap,
    anisotropy
  );

  material.needsUpdate =
    true;
}

export function ResortIslandModel({
  onPick
}: ResortIslandModelProps) {
  const gltf =
    useLoader(
      GLTFLoader,
      '/models/emerald-cascade-island.glb'
    );

  const gl =
    useThree(
      state =>
        state.gl
    );

  useEffect(() => {
    const anisotropy =
      Math.min(
        16,
        gl.capabilities
          .getMaxAnisotropy()
      );

    gltf.scene.traverse(
      object => {
        if (
          !(
            object instanceof
            THREE.Mesh
          )
        ) {
          return;
        }

        object.castShadow =
          true;

        object.receiveShadow =
          true;

        const materials =
          Array.isArray(
            object.material
          )
            ? object.material
            : [object.material];

        for (
          const material
          of materials
        ) {
          tuneMaterial(
            material,
            anisotropy
          );
        }
      }
    );
  }, [
    gl,
    gltf.scene
  ]);

  return (
    <group
      scale={8}
      position={[
        0,
        0.55,
        0
      ]}
      rotation={[
        0,
        0,
        0
      ]}
      onClick={
        onPick
          ? (
              event:
                ThreeEvent<MouseEvent>
            ) => {
              event.stopPropagation();

              onPick([
                event.point.x,
                event.point.y,
                event.point.z
              ]);
            }
          : undefined
      }
    >
      <primitive
        object={
          gltf.scene
        }
      />
    </group>
  );
}

useLoader.preload(
  GLTFLoader,
  '/models/emerald-cascade-island.glb'
);
