import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

import type {
  EnvironmentProfile
} from './environmentProfile';
import type { IslandWaterBoundary } from './islandWaterBoundary';
import { DEFAULT_SHORE_WATER_PROFILE } from './shoreWaterProfile';

// Presentation-only wave amplitude presets. 'default' exactly preserves
// the original geometry, shading, animation timing and coastal attenuation.
export const OCEAN_WAVE_AMPLITUDE = {
  default: 1.0,
  'waves-60': 1.6
} as const;

export type OceanWavePreset = keyof typeof OCEAN_WAVE_AMPLITUDE;

const VERTEX_SHADER = `
uniform float uTime;
uniform float uWaveAmplitude;

varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying float vHeight;
varying float vSlope;

vec3 sampleWave(
  vec2 p,
  vec2 direction,
  float frequency,
  float speed,
  float amplitude,
  float warp
) {
  vec2 d =
    normalize(direction);

  float phase =
    dot(p, d) * frequency +
    uTime * speed +
    warp;

  float s =
    sin(phase);

  float c =
    cos(phase);

  return vec3(
    s * amplitude,
    c * amplitude * frequency * d.x,
    c * amplitude * frequency * d.y
  );
}

void main() {
  vec3 p =
    position;

  vec2 surface =
    p.xy;

  float islandDistance =
    length(surface);

  float offshore =
    smoothstep(
      4.8,
      11.2,
      islandDistance
    );

  float amplitudeScale =
    mix(
      0.72,
      1.28,
      offshore
    );

  float warpA =
    sin(
      surface.x * 0.17 -
      surface.y * 0.11 +
      uTime * 0.11
    ) * 0.42;

  float warpB =
    sin(
      surface.x * -0.12 +
      surface.y * 0.19 -
      uTime * 0.08
    ) * 0.34;

  vec3 w0 =
    sampleWave(
      surface,
      vec2(1.0, 0.31),
      0.56,
      0.50,
      0.115,
      warpA
    );

  vec3 w1 =
    sampleWave(
      surface,
      vec2(-0.22, 1.0),
      0.94,
      0.76,
      0.062,
      warpB
    );

  vec3 w2 =
    sampleWave(
      surface,
      vec2(0.67, -0.74),
      1.73,
      1.08,
      0.034,
      warpA - warpB
    );

  vec3 w3 =
    sampleWave(
      surface,
      vec2(-0.91, -0.38),
      3.07,
      1.68,
      0.014,
      warpB
    );

  vec3 waves =
    w0 +
    w1 +
    w2 +
    w3;

  // Height and slope must share the same gain so normals stay consistent.
  // uWaveAmplitude = 1.0 is mathematically identical to the old shader.
  float waveScale =
    amplitudeScale * uWaveAmplitude;

  float height =
    waves.x *
    waveScale;

  vec2 slope =
    waves.yz *
    waveScale;

  p.z +=
    height;

  vec3 localNormal =
    normalize(
      vec3(
        -slope.x,
        -slope.y,
        1.0
      )
    );

  vec4 world =
    modelMatrix *
    vec4(
      p,
      1.0
    );

  vWorldPosition =
    world.xyz;

  vWorldNormal =
    normalize(
      mat3(modelMatrix) *
      localNormal
    );

  vHeight =
    height;

  vSlope =
    length(slope);

  gl_Position =
    projectionMatrix *
    viewMatrix *
    world;
}
`;

const FRAGMENT_SHADER = `
uniform float uTime;
uniform float uTimeDebug;

uniform vec3 uViewDirection;
uniform vec3 uSunDirection;

uniform vec3 uDeepColor;
uniform vec3 uMidColor;
uniform vec3 uShallowColor;
uniform vec3 uSkyColor;
uniform vec3 uSunColor;

// Island geometry is supplied by an independent, replaceable spatial source.
uniform float uIslandBoundaryEnabled;
uniform sampler2D uIslandDistanceTexture;
uniform vec2 uIslandBoundaryOrigin;
uniform vec2 uIslandBoundaryExtent;
uniform float uIslandDistanceRange;
uniform float uIslandShoreOffset;
uniform float uIslandShoreFeather;

// Independent coastal-water fade. The existing land cutout is unchanged.
uniform float uShoreWaterEnabled;
uniform float uShoreEdgeOpacity;
uniform float uShoreFadeWidth;
uniform float uShoreTintStrength;

varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying float vHeight;
varying float vSlope;

float clamp01(float x) {
  return clamp(
    x,
    0.0,
    1.0
  );
}

float hash21(vec2 p) {
  p =
    fract(
      p *
      vec2(
        123.34,
        345.45
      )
    );

  p +=
    dot(
      p,
      p + 34.345
    );

  return fract(
    p.x * p.y
  );
}

float noise2(vec2 p) {
  vec2 i =
    floor(p);

  vec2 f =
    fract(p);

  f =
    f *
    f *
    (
      3.0 -
      2.0 * f
    );

  float a =
    hash21(i);

  float b =
    hash21(
      i +
      vec2(
        1.0,
        0.0
      )
    );

  float c =
    hash21(
      i +
      vec2(
        0.0,
        1.0
      )
    );

  float d =
    hash21(
      i +
      vec2(
        1.0,
        1.0
      )
    );

  return mix(
    mix(
      a,
      b,
      f.x
    ),
    mix(
      c,
      d,
      f.x
    ),
    f.y
  );
}

float fbm(vec2 p) {
  float value =
    0.0;

  value +=
    noise2(p) * 0.52;

  p =
    p * 2.03 +
    vec2(7.1, -3.4);

  value +=
    noise2(p) * 0.27;

  p =
    p * 2.11 +
    vec2(-5.2, 9.7);

  value +=
    noise2(p) * 0.14;

  p =
    p * 2.07 +
    vec2(11.8, 4.6);

  value +=
    noise2(p) * 0.07;

  return value;
}

void main() {
  float shorelineVisibility = 1.0;
  float shoreWaterAlpha = 1.0;
  float shoreWaterTint = 0.0;
  if (uIslandBoundaryEnabled > 0.5) {
    vec2 shoreUV = clamp(
      (vWorldPosition.xz - uIslandBoundaryOrigin) / uIslandBoundaryExtent,
      vec2(0.0), vec2(1.0)
    );
    vec2 encodedDistance = texture2D(uIslandDistanceTexture, shoreUV).rg;
    float normalizedDistance = dot(encodedDistance, vec2(65280.0, 255.0)) / 65535.0;
    float signedShoreDistance = (normalizedDistance * 2.0 - 1.0) * uIslandDistanceRange;

    // 0 at the coast, 1 at the outer edge of the shallow-water band.
    // The inland region is already removed by the independent land mask.
    if (uShoreWaterEnabled > 0.5) {
      float shallowProgress = clamp(
        max(signedShoreDistance, 0.0) / max(uShoreFadeWidth, 0.001),
        0.0, 1.0
      );
      float fadeToOpenSea = shallowProgress * shallowProgress * (3.0 - 2.0 * shallowProgress);
      shoreWaterAlpha = mix(uShoreEdgeOpacity, 1.0, fadeToOpenSea);
      shoreWaterTint = (1.0 - fadeToOpenSea) * uShoreTintStrength;
    }

    float halfFeather = max(0.001, uIslandShoreFeather * 0.5);
    shorelineVisibility = smoothstep(
      uIslandShoreOffset - halfFeather,
      uIslandShoreOffset + halfFeather,
      signedShoreDistance
    );
    if (shorelineVisibility <= 0.001) discard;
  }

  if (
    uTimeDebug >
    0.5
  ) {
    float pulse =
      0.5 +
      0.5 *
      sin(
        uTime * 3.0
      );

    gl_FragColor =
      vec4(
        pulse,
        1.0 - pulse,
        0.05,
        1.0
      );

    return;
  }

  vec2 p =
    vWorldPosition.xz;

  vec2 driftLarge =
    vec2(
      uTime * 0.028,
      -uTime * 0.020
    );

  vec2 driftSmall =
    vec2(
      -uTime * 0.060,
      uTime * 0.046
    );

  float largeNoise =
    fbm(
      p * 0.31 +
      driftLarge
    );

  float smallNoise =
    fbm(
      p * 1.28 +
      driftSmall
    );

  float eps =
    0.065;

  float noiseX =
    fbm(
      (
        p +
        vec2(
          eps,
          0.0
        )
      ) * 1.28 +
      driftSmall
    );

  float noiseZ =
    fbm(
      (
        p +
        vec2(
          0.0,
          eps
        )
      ) * 1.28 +
      driftSmall
    );

  vec3 normal =
    normalize(
      vWorldNormal +
      vec3(
        (
          smallNoise -
          noiseX
        ) * 0.46,
        0.0,
        (
          smallNoise -
          noiseZ
        ) * 0.46
      )
    );

  vec3 viewDir =
    normalize(
      uViewDirection
    );

  float islandDistance =
    length(p);

  float shallow =
    1.0 -
    smoothstep(
      5.8,
      10.3,
      islandDistance
    );

  float shelf =
    1.0 -
    smoothstep(
      8.8,
      14.5,
      islandDistance
    );

  float shoreBand =
    smoothstep(
      0.22,
      0.82,
      shelf
    ) *
    (
      1.0 -
      smoothstep(
        0.72,
        0.98,
        shelf
      )
    );

  vec3 deepColor =
    mix(
      uDeepColor,
      vec3(0.02, 0.36, 0.68),
      0.68
    );

  vec3 midColor =
    mix(
      uMidColor,
      vec3(0.00, 0.72, 0.88),
      0.78
    );

  vec3 shallowColor =
    mix(
      uShallowColor,
      vec3(0.22, 0.95, 1.00),
      0.82
    );

  vec3 body =
    mix(
      deepColor,
      midColor,
      shelf * 0.76
    );

  body =
    mix(
      body,
      shallowColor,
      shallow * 0.78
    );

  // Subtle shallow coloration; disabled / unmasked water retains its old color.
  body = mix(body, shallowColor, shoreWaterTint);

  float brightness =
    0.96 +
    largeNoise * 0.18 +
    smallNoise * 0.05;

  body *=
    brightness;

  float crest =
    smoothstep(
      0.045,
      0.165,
      vHeight +
      vSlope * 0.080
    );

  crest *=
    0.55 +
    0.45 * largeNoise;

  body +=
    shallowColor *
    crest *
    0.16;

  float nDotV =
    clamp01(
      dot(
        normal,
        viewDir
      )
    );

  float fresnel =
    0.02 +
    0.98 *
    pow(
      1.0 -
      nDotV,
      5.0
    );

  vec3 reflectedSky =
    mix(
      uSkyColor,
      vec3(0.74, 0.92, 1.0),
      0.42
    ) *
    (
      0.84 +
      largeNoise * 0.10
    );

  vec3 color =
    mix(
      body,
      reflectedSky,
      fresnel * 0.36
    );

  vec3 halfVector =
    normalize(
      viewDir +
      uSunDirection
    );

  float nDotH =
    clamp01(
      dot(
        normal,
        halfVector
      )
    );

  float broadSun =
    pow(
      nDotH,
      24.0
    ) * 0.16;

  float glitterNoise =
    fbm(
      p * 2.2 +
      vec2(
        uTime * 0.14,
        -uTime * 0.09
      )
    );

  float glitter =
    pow(
      nDotH,
      58.0
    ) *
    smoothstep(
      0.64,
      0.90,
      glitterNoise
    ) *
    0.25;

  color +=
    uSunColor *
    (
      broadSun +
      glitter
    );

  float foamNoise =
    fbm(
      p * 1.85 +
      vec2(
        uTime * 0.10,
        uTime * -0.07
      )
    );

  float shoreFoam =
    shoreBand *
    smoothstep(
      0.50,
      0.84,
      foamNoise + vSlope * 0.45
    );

  float crestFoam =
    smoothstep(
      0.16,
      0.36,
      vSlope
    ) *
    smoothstep(
      0.02,
      0.12,
      vHeight
    );

  crestFoam *=
    0.55 +
    0.45 *
    fbm(
      p * 2.7 +
      vec2(
        -uTime * 0.12,
        uTime * 0.11
      )
    );

  float foam =
    clamp01(
      shoreFoam * 0.95 +
      crestFoam * 0.55
    );

  vec3 foamColor =
    mix(
      vec3(0.82, 0.97, 1.0),
      vec3(1.0, 1.0, 1.0),
      0.55
    );

  color =
    mix(
      color,
      foamColor,
      foam * 0.68
    );

  float trough =
    smoothstep(
      0.08,
      -0.12,
      vHeight
    );

  color *=
    1.0 -
    trough * 0.045;

  gl_FragColor =
    vec4(
      color,
      shorelineVisibility * shoreWaterAlpha
    );
}
`;

export function ResortOcean({
  environment,
  wavePreset = 'default',
  islandBoundary = null,
  shoreMaskEnabled = true,
  shoreOffset = 0.12,
  shoreFeather = 0.24,
  shoreWaterEnabled = true,
  shoreEdgeOpacity = DEFAULT_SHORE_WATER_PROFILE.edgeOpacity,
  shoreFadeWidth = DEFAULT_SHORE_WATER_PROFILE.fadeWidth,
  shoreTintStrength = DEFAULT_SHORE_WATER_PROFILE.tintStrength
}: {
  environment: EnvironmentProfile;
  wavePreset?: OceanWavePreset;
  islandBoundary?: IslandWaterBoundary | null;
  shoreMaskEnabled?: boolean;
  shoreOffset?: number;
  shoreFeather?: number;
  shoreWaterEnabled?: boolean;
  shoreEdgeOpacity?: number;
  shoreFadeWidth?: number;
  shoreTintStrength?: number;
}) {
  const material =
    useRef<THREE.ShaderMaterial | null>(
      null
    );

  const oceanMesh =
    useRef<THREE.Mesh | null>(
      null
    );

  const motionDebug =
    typeof window !== 'undefined' &&
    new URLSearchParams(
      window.location.search
    ).has('oceanMotionDebug');

  const timeDebug =
    typeof window !== 'undefined' &&
    new URLSearchParams(
      window.location.search
    ).has('oceanTimeDebug');

  const cameraDirection =
    useMemo(
      () => new THREE.Vector3(),
      []
    );

  // A valid placeholder is needed while island geometry is loading.
  const emptyDistance = useMemo(() => {
    const texture = new THREE.DataTexture(
      new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat
    );
    texture.needsUpdate = true;
    return texture;
  }, []);
  useEffect(() => () => emptyDistance.dispose(), [emptyDistance]);

  const uniforms =
    useMemo(() => {
      const sunset =
        environment.timeOfDay ===
        'sunset';

      const sunDirection =
        new THREE.Vector3(
          sunset ? -0.72 : -0.46,
          sunset ? 0.48 : 0.84,
          sunset ? -0.31 : -0.29
        ).normalize();

      return {
        uTime: {
          value: 0
        },

        uWaveAmplitude: {
          value: 1.0
        },

        uIslandBoundaryEnabled: { value: 0 },
        uIslandDistanceTexture: { value: emptyDistance },
        uIslandBoundaryOrigin: { value: new THREE.Vector2(-21, -21) },
        uIslandBoundaryExtent: { value: new THREE.Vector2(42, 42) },
        uIslandDistanceRange: { value: 21 },
        uIslandShoreOffset: { value: 0.12 },
        uIslandShoreFeather: { value: 0.24 },
        uShoreWaterEnabled: { value: 0 },
        uShoreEdgeOpacity: { value: DEFAULT_SHORE_WATER_PROFILE.edgeOpacity },
        uShoreFadeWidth: { value: DEFAULT_SHORE_WATER_PROFILE.fadeWidth },
        uShoreTintStrength: { value: DEFAULT_SHORE_WATER_PROFILE.tintStrength },

        uTimeDebug: {
          value: timeDebug ? 1 : 0
        },

        uViewDirection: {
          value:
            new THREE.Vector3(
              0,
              1,
              0
            )
        },

        uSunDirection: {
          value: sunDirection
        },

        uDeepColor: {
          value:
            new THREE.Color(
              sunset
                ? '#06384b'
                : '#07536b'
            )
        },

        uMidColor: {
          value:
            new THREE.Color(
              sunset
                ? '#08727e'
                : '#078c99'
            )
        },

        uShallowColor: {
          value:
            new THREE.Color(
              sunset
                ? '#31aaa1'
                : '#3bc0b2'
            )
        },

        uSkyColor: {
          value:
            new THREE.Color(
              sunset
                ? '#d59a81'
                : '#79bfd0'
            )
        },

        uSunColor: {
          value:
            new THREE.Color(
              environment.sunColor
            )
        }
      };
    }, [
      environment.sunColor,
      environment.timeOfDay,
      timeDebug,
      emptyDistance
    ]);

  useFrame(
    ({
      clock,
      camera
    }, delta) => {
      if (
        motionDebug &&
        oceanMesh.current
      ) {
        oceanMesh.current.position.y =
          -2.35 +
          Math.sin(
            clock.elapsedTime * 2.0
          ) * 0.28;
      }

      if (!material.current) {
        return;
      }

      material.current.uniforms
        .uTime.value =
        clock.elapsedTime;

      const mask = material.current.uniforms;
      const activeBoundary = shoreMaskEnabled ? islandBoundary : null;
      mask.uIslandBoundaryEnabled.value = activeBoundary ? 1 : 0;
      mask.uIslandDistanceTexture.value = activeBoundary?.distanceTexture ?? emptyDistance;
      if (activeBoundary) {
        mask.uIslandBoundaryOrigin.value.copy(activeBoundary.origin);
        mask.uIslandBoundaryExtent.value.copy(activeBoundary.extent);
        mask.uIslandDistanceRange.value = activeBoundary.distanceRange;
      }
      mask.uIslandShoreOffset.value = shoreOffset;
      mask.uIslandShoreFeather.value = shoreFeather;
      mask.uShoreWaterEnabled.value = activeBoundary && shoreWaterEnabled ? 1 : 0;
      mask.uShoreEdgeOpacity.value = Math.max(0, Math.min(1, shoreEdgeOpacity));
      mask.uShoreFadeWidth.value = Math.max(0.001, shoreFadeWidth);
      mask.uShoreTintStrength.value = Math.max(0, Math.min(1, shoreTintStrength));

      // Smoothly approach the selected preset without React frame updates.
      // Only the GPU deformation gain changes; time/speed/colors stay intact.
      const waveUniform = material.current.uniforms.uWaveAmplitude;
      const target = OCEAN_WAVE_AMPLITUDE[wavePreset];
      const blend = 1 - Math.exp(-Math.min(Math.max(delta, 0), 0.1) * 3.0);
      const next = waveUniform.value + (target - waveUniform.value) * blend;
      waveUniform.value = Math.abs(target - next) < 0.0001 ? target : next;

      /*
       * getWorldDirection() returns camera forward.
       * Water needs surface -> camera, hence negate().
       */
      camera.getWorldDirection(
        cameraDirection
      );

      cameraDirection.negate();

      material.current.uniforms
        .uViewDirection.value.copy(
          cameraDirection
        );
    }
  );

  const debugOcean =
    typeof window !== 'undefined' &&
    new URLSearchParams(
      window.location.search
    ).has('oceanDebug');

  return (
    <mesh
      ref={oceanMesh}
      position={[0, -2.35, 0]}
      rotation={[
        -Math.PI / 2,
        0,
        0
      ]}
      receiveShadow
      frustumCulled={false}
    >
      <planeGeometry
        args={[
          42,
          42,
          220,
          220
        ]}
      />

      {debugOcean ? (
        <meshBasicMaterial
          color="#ff00ff"
          wireframe
          side={THREE.DoubleSide}
        />
      ) : (
        <shaderMaterial
          ref={material}
          uniforms={uniforms}
          vertexShader={
            VERTEX_SHADER
          }
          fragmentShader={
            FRAGMENT_SHADER
          }
          transparent={Boolean(islandBoundary && shoreMaskEnabled)}
          depthWrite={!(islandBoundary && shoreMaskEnabled)}
          depthTest
          side={THREE.DoubleSide}
        />
      )}
    </mesh>
  );
}
