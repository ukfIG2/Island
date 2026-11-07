/** Orbit inspection for the existing RRH Canvas (no second camera/world).
 * Right mouse drag rotates; wheel zooms. Left click remains available to PMO painting.
 * The companion on-screen controls work on a touchscreen.
 */
import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export type OrbitAction = 'left' | 'right' | 'up' | 'down' | 'reset';
export interface OrbitRequest { serial: number; action: OrbitAction }
const DEFAULT_POSITION = new THREE.Vector3(10.5, 12.5, 13.5);
const TARGET = new THREE.Vector3(0, 0, 0);

export function IslandOrbitCamera({request}: {request: OrbitRequest | null}) {
  const { camera, gl, invalidate } = useThree();
  const controlsRef = useRef<OrbitControls | null>(null);
  useEffect(() => {
    const controls = new OrbitControls(camera, gl.domElement);
    controls.target.copy(TARGET);
    controls.enableDamping = false;
    controls.enablePan = false;
    controls.enableZoom = true;
    controls.enableRotate = true;
    controls.minPolarAngle = 0.12;
    controls.maxPolarAngle = Math.PI * 0.50 - 0.03;
    controls.minZoom = 17;
    controls.maxZoom = 100;
    controls.minDistance = 7;
    controls.maxDistance = 33;
    // Left pointer is owned by island pick/paint tools, NOT the orbit camera.
    controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
    controls.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY;
    controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
    controls.touches.ONE = THREE.TOUCH.ROTATE;
    controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
    controls.update();
    const onControlsChange = () => invalidate();
    controls.addEventListener('change', onControlsChange);
    controlsRef.current = controls;
    const noContextMenu = (event: MouseEvent) => event.preventDefault();
    gl.domElement.addEventListener('contextmenu', noContextMenu);
    return () => {
      controls.removeEventListener('change', onControlsChange);
      gl.domElement.removeEventListener('contextmenu', noContextMenu);
      controls.dispose();
      controlsRef.current = null;
    };
  }, [camera, gl, invalidate]);

  useEffect(() => {
    if (!request || !controlsRef.current) return;
    const controls = controlsRef.current;
    const spherical = new THREE.Spherical().setFromVector3(camera.position.clone().sub(TARGET));
    switch (request.action) {
      case 'left': spherical.theta -= Math.PI / 8; break;
      case 'right': spherical.theta += Math.PI / 8; break;
      case 'up': spherical.phi = Math.max(0.12, spherical.phi - Math.PI / 18); break;
      case 'down': spherical.phi = Math.min(Math.PI * 0.5 - 0.03, spherical.phi + Math.PI / 18); break;
      case 'reset':
        camera.position.copy(DEFAULT_POSITION);
        if ('zoom' in camera) { camera.zoom = 37; camera.updateProjectionMatrix(); }
        camera.lookAt(TARGET);
        controls.target.copy(TARGET);
        controls.update(); invalidate(); return;
    }
    camera.position.copy(new THREE.Vector3().setFromSpherical(spherical).add(TARGET));
    camera.lookAt(TARGET);
    controls.update();
    invalidate();
  }, [request, camera, invalidate]);
  return null;
}
