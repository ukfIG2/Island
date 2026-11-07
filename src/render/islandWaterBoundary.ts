import * as THREE from 'three';

/** Presentation-only result of an island-coastline source. World XZ coordinates. */
export interface IslandWaterBoundary {
  readonly distanceTexture: THREE.DataTexture;
  readonly origin: THREE.Vector2;
  readonly extent: THREE.Vector2;
  readonly distanceRange: number;
  readonly sourceSignature: string;
}

export interface IslandBoundaryOptions {
  readonly seaLevel: number;
  readonly originX: number;
  readonly originZ: number;
  readonly worldSize: number;
  readonly resolution: number;
}

/** The model may later be replaced by a polygon-, terrain-, or authored-mask source. */
export interface IslandWaterBoundarySource {
  fingerprint(root: THREE.Object3D): string;
  capture(root: THREE.Object3D, options: IslandBoundaryOptions): IslandWaterBoundary | null;
}

const LARGE_DISTANCE = 1000000;
const DIAGONAL = Math.SQRT2;

/** Keep the principal land mass, rather than loose props or detached decorations. */
export function keepLargestLandMass(source: Uint8Array, width: number, height: number): Uint8Array {
  const count = width * height;
  if (source.length !== count || width < 1 || height < 1) {
    throw new Error('Invalid shoreline coverage dimensions');
  }
  const visited = new Uint8Array(count);
  const queue = new Int32Array(count);
  let largest: number[] = [];
  for (let first = 0; first < count; first++) {
    if (!source[first] || visited[first]) continue;
    let read = 0;
    let write = 1;
    queue[0] = first;
    visited[first] = 1;
    while (read < write) {
      const index = queue[read++];
      const x = index % width;
      const y = Math.floor(index / width);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
          const next = yy * width + xx;
          if (source[next] && !visited[next]) {
            visited[next] = 1;
            queue[write++] = next;
          }
        }
      }
    }
    if (write > largest.length) {
      largest = Array.from(queue.subarray(0, write));
    }
  }
  const result = new Uint8Array(count);
  for (const index of largest) result[index] = 1;
  return result;
}

/** Two-pass eight-neighbor chamfer approximation in pixel units. */
function distanceToClass(coverage: Uint8Array, width: number, height: number, target: number): Float32Array {
  const distance = new Float32Array(coverage.length);
  for (let i = 0; i < distance.length; i++) {
    distance[i] = coverage[i] === target ? 0 : LARGE_DISTANCE;
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (x > 0) distance[i] = Math.min(distance[i], distance[i - 1] + 1);
      if (y > 0) {
        distance[i] = Math.min(distance[i], distance[i - width] + 1);
        if (x > 0) distance[i] = Math.min(distance[i], distance[i - width - 1] + DIAGONAL);
        if (x + 1 < width) distance[i] = Math.min(distance[i], distance[i - width + 1] + DIAGONAL);
      }
    }
  }
  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      const i = y * width + x;
      if (x + 1 < width) distance[i] = Math.min(distance[i], distance[i + 1] + 1);
      if (y + 1 < height) {
        distance[i] = Math.min(distance[i], distance[i + width] + 1);
        if (x > 0) distance[i] = Math.min(distance[i], distance[i + width - 1] + DIAGONAL);
        if (x + 1 < width) distance[i] = Math.min(distance[i], distance[i + width + 1] + DIAGONAL);
      }
    }
  }
  return distance;
}

/** Negative values mark solid land, positive values mark ocean. */
export function buildSignedShoreDistances(coverage: Uint8Array, width: number, height: number, pixelSize: number): Float32Array {
  if (coverage.length !== width * height || width < 1 || height < 1 || !Number.isFinite(pixelSize) || pixelSize <= 0) {
    throw new Error('Invalid shoreline distance field dimensions');
  }
  const toLand = distanceToClass(coverage, width, height, 1);
  const toWater = distanceToClass(coverage, width, height, 0);
  const sdf = new Float32Array(coverage.length);
  for (let i = 0; i < sdf.length; i++) {
    sdf[i] = (coverage[i] ? -toWater[i] : toLand[i]) * pixelSize;
  }
  return sdf;
}

interface WorldPoint { x: number; y: number; z: number }

/** Clip one triangle against the sea plane; only exposed/above-water terrain contributes. */
function clipAboveSea(points: WorldPoint[], seaLevel: number): WorldPoint[] {
  const result: WorldPoint[] = [];
  for (let i = 0; i < points.length; i++) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    const a = current.y >= seaLevel;
    const b = next.y >= seaLevel;
    if (a) result.push(current);
    if (a !== b) {
      const t = (seaLevel - current.y) / (next.y - current.y);
      result.push({
        x: current.x + (next.x - current.x) * t,
        y: seaLevel,
        z: current.z + (next.z - current.z) * t
      });
    }
  }
  return result;
}

function eligibleMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  const explicitlyIncluded: THREE.Mesh[] = [];
  root.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !(mesh.geometry instanceof THREE.BufferGeometry)) return;
    // For future islands, tag only terrain meshes as userData.oceanBoundary = true.
    // Explicitly exclude boats, props, foliage, and non-terrain surfaces if necessary.
    if (mesh.userData.oceanBoundary === false) return;
    const positions = mesh.geometry.getAttribute('position');
    if (!positions || positions.count < 3) return;
    meshes.push(mesh);
    if (mesh.userData.oceanBoundary === true) explicitlyIncluded.push(mesh);
  });
  return explicitlyIncluded.length > 0 ? explicitlyIncluded : meshes;
}

function signatureFor(root: THREE.Object3D): string {
  // Animated props must NOT cause expensive coastline rasterization every frame.
  // Geometry replacement changes UUIDs; the source root may explicitly bump
  // userData.boundaryRevision after in-place terrain/transform edits.
  return `${root.userData.boundaryRevision ?? 0}|` + eligibleMeshes(root).map(mesh => {
    const position = mesh.geometry.getAttribute('position');
    return `${mesh.uuid}:${mesh.geometry.uuid}:${mesh.geometry.index?.count ?? position.count}:${mesh.userData.oceanBoundary ?? 'auto'}`;
  }).join('|');
}

function captureFromGeometry(root: THREE.Object3D, options: IslandBoundaryOptions): IslandWaterBoundary | null {
  const { seaLevel, originX, originZ, worldSize, resolution } = options;
  if (![seaLevel, originX, originZ, worldSize, resolution].every(Number.isFinite) || worldSize <= 0 || resolution < 16 || resolution > 1024 || !Number.isInteger(resolution)) {
    throw new Error('Invalid island-boundary capture options');
  }
  const meshes = eligibleMeshes(root);
  if (!meshes.length || typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = resolution;
  canvas.height = resolution;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  context.fillStyle = '#ffffff';
  const toPixel = (value: number, origin: number) => (value - origin) / worldSize * (resolution - 1);
  const point = (vertex: number, positions: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, elements: number[]): WorldPoint => {
    const x = positions.getX(vertex);
    const y = positions.getY(vertex);
    const z = positions.getZ(vertex);
    return {
      x: elements[0] * x + elements[4] * y + elements[8] * z + elements[12],
      y: elements[1] * x + elements[5] * y + elements[9] * z + elements[13],
      z: elements[2] * x + elements[6] * y + elements[10] * z + elements[14]
    };
  };
  root.updateWorldMatrix(true, true);
  let triangles = 0;
  for (const mesh of meshes) {
    const geometry = mesh.geometry;
    const attr = geometry.getAttribute('position');
    const index = geometry.index;
    const total = index ? index.count : attr.count;
    const start = Math.max(0, geometry.drawRange.start);
    const end = Math.min(total, start + geometry.drawRange.count);
    const elements = mesh.matrixWorld.elements;
    for (let i = start; i + 2 < end; i += 3) {
      const triangle = [
        point(index ? index.getX(i) : i, attr, elements),
        point(index ? index.getX(i + 1) : i + 1, attr, elements),
        point(index ? index.getX(i + 2) : i + 2, attr, elements)
      ];
      const polygon = clipAboveSea(triangle, seaLevel);
      if (polygon.length < 3) continue;
      context.beginPath();
      context.moveTo(toPixel(polygon[0].x, originX), toPixel(polygon[0].z, originZ));
      for (let k = 1; k < polygon.length; k++) {
        context.lineTo(toPixel(polygon[k].x, originX), toPixel(polygon[k].z, originZ));
      }
      context.closePath();
      context.fill();
      triangles++;
    }
  }
  if (triangles === 0) return null;
  const rgba = context.getImageData(0, 0, resolution, resolution).data;
  const coverage = new Uint8Array(resolution * resolution);
  for (let i = 0; i < coverage.length; i++) coverage[i] = rgba[i * 4 + 3] > 127 ? 1 : 0;
  const land = keepLargestLandMass(coverage, resolution, resolution);
  const count = land.reduce((acc, value) => acc + value, 0);
  // Never silently erase the entire sea or attempt a fake circular fallback.
  if (count < 64 || count / land.length > 0.75) return null;
  const distances = buildSignedShoreDistances(land, resolution, resolution, worldSize / (resolution - 1));
  const distanceRange = worldSize * 0.5;
  const pixels = new Uint8Array(land.length * 4);
  for (let i = 0; i < land.length; i++) {
    // Encode the signed distance across two color channels for sub-pixel shore precision.
    const packed = Math.max(0, Math.min(65535, Math.round((distances[i] / distanceRange * 0.5 + 0.5) * 65535)));
    pixels[i * 4] = packed >>> 8;
    pixels[i * 4 + 1] = packed & 255;
    pixels[i * 4 + 2] = 0;
    pixels[i * 4 + 3] = 255;
  }
  const texture = new THREE.DataTexture(pixels, resolution, resolution, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.flipY = false;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return {
    distanceTexture: texture,
    origin: new THREE.Vector2(originX, originZ),
    extent: new THREE.Vector2(worldSize, worldSize),
    distanceRange,
    sourceSignature: signatureFor(root)
  };
}

export const ISLAND_MESH_BOUNDARY_SOURCE: IslandWaterBoundarySource = {
  fingerprint: signatureFor,
  capture: captureFromGeometry
};
