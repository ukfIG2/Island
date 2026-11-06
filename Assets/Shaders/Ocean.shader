// The web version's ocean (RRH ResortOcean.tsx), ported to URP. It moves four directional waves over a fine
// grid, colours the water deep to shallow toward the island, reflects the sky at a slant and catches the sun.
// All maths runs in the web's own coordinates (Unity mirrors x, as glTFast does for the island), so the
// waves and patterns match the web exactly. Like the web's shader it does its own lighting and writes its
// colour without conversion, so the result is read back as sRGB.
Shader "ResortEmpire/Ocean"
{
    Properties
    {
        _DeepColor ("Deep", Color) = (0.027, 0.325, 0.42, 1)
        _MidColor ("Mid", Color) = (0.027, 0.549, 0.6, 1)
        _ShallowColor ("Shallow", Color) = (0.231, 0.753, 0.698, 1)
        _SkyColor ("Sky", Color) = (0.475, 0.749, 0.816, 1)
        _SunColor ("Sun", Color) = (1, 0.945, 0.792, 1)
        _SunDirection ("Sun direction (web space)", Vector) = (-0.46, 0.84, -0.29, 0)
        _ViewDirection ("Surface to camera (web space)", Vector) = (0, 1, 0, 0)
        _WaveAmplitude ("Wave amplitude", Float) = 1
    }

    SubShader
    {
        Tags { "RenderType" = "Opaque" "RenderPipeline" = "UniversalPipeline" "Queue" = "Geometry" }

        Pass
        {
            Name "Ocean"
            Tags { "LightMode" = "UniversalForward" }
            Cull Off

            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment Frag
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "Packages/com.unity.render-pipelines.core/ShaderLibrary/Color.hlsl"

            CBUFFER_START(UnityPerMaterial)
                half4 _DeepColor, _MidColor, _ShallowColor, _SkyColor, _SunColor;
                float4 _SunDirection, _ViewDirection;
                float _WaveAmplitude;
            CBUFFER_END

            struct Attributes { float4 positionOS : POSITION; };

            struct Varyings
            {
                float4 positionCS : SV_POSITION;
                float3 positionWS : TEXCOORD0;
                float3 normalWeb : TEXCOORD1;
                float height : TEXCOORD2;
                float slope : TEXCOORD3;
            };

            // Height plus its slope along the plane's two axes.
            float3 SampleWave(float2 p, float2 direction, float frequency, float speed, float amplitude, float warp)
            {
                float2 d = normalize(direction);
                float phase = dot(p, d) * frequency + _Time.y * speed + warp;
                float s = sin(phase), c = cos(phase);
                return float3(s * amplitude, c * amplitude * frequency * d.x, c * amplitude * frequency * d.y);
            }

            Varyings Vert(Attributes input)
            {
                float3 world = TransformObjectToWorld(input.positionOS.xyz);
                // The web plane's own (x, y): web x, minus web z; Unity's x is the web's mirrored.
                float2 surface = float2(-world.x, -world.z);
                float t = _Time.y;

                float offshore = smoothstep(4.8, 11.2, length(surface));
                float amplitudeScale = lerp(0.72, 1.28, offshore);
                float warpA = sin(surface.x * 0.17 - surface.y * 0.11 + t * 0.11) * 0.42;
                float warpB = sin(surface.x * -0.12 + surface.y * 0.19 - t * 0.08) * 0.34;
                float3 waves = SampleWave(surface, float2(1.0, 0.31), 0.56, 0.50, 0.115, warpA)
                    + SampleWave(surface, float2(-0.22, 1.0), 0.94, 0.76, 0.062, warpB)
                    + SampleWave(surface, float2(0.67, -0.74), 1.73, 1.08, 0.034, warpA - warpB)
                    + SampleWave(surface, float2(-0.91, -0.38), 3.07, 1.68, 0.014, warpB);

                // Height and slope share one gain so the normals stay consistent.
                float gain = amplitudeScale * _WaveAmplitude;
                float height = waves.x * gain;
                float2 slope = waves.yz * gain;
                world.y += height;

                Varyings output;
                output.positionCS = TransformWorldToHClip(world);
                output.positionWS = world;
                output.normalWeb = normalize(float3(-slope.x, 1.0, slope.y));
                output.height = height;
                output.slope = length(slope);
                return output;
            }

            float Hash21(float2 p)
            {
                p = frac(p * float2(123.34, 345.45));
                p += dot(p, p + 34.345);
                return frac(p.x * p.y);
            }

            float Noise2(float2 p)
            {
                float2 i = floor(p), f = frac(p);
                f = f * f * (3.0 - 2.0 * f);
                float a = Hash21(i), b = Hash21(i + float2(1.0, 0.0));
                float c = Hash21(i + float2(0.0, 1.0)), d = Hash21(i + float2(1.0, 1.0));
                return lerp(lerp(a, b, f.x), lerp(c, d, f.x), f.y);
            }

            float Fbm(float2 p)
            {
                float value = Noise2(p) * 0.52;
                p = p * 2.03 + float2(7.1, -3.4);
                value += Noise2(p) * 0.27;
                p = p * 2.11 + float2(-5.2, 9.7);
                value += Noise2(p) * 0.14;
                p = p * 2.07 + float2(11.8, 4.6);
                value += Noise2(p) * 0.07;
                return value;
            }

            half4 Frag(Varyings input) : SV_Target
            {
                float t = _Time.y;
                float2 p = float2(-input.positionWS.x, input.positionWS.z);   // web world x, z

                float2 driftLarge = float2(t * 0.028, -t * 0.020);
                float2 driftSmall = float2(-t * 0.060, t * 0.046);
                float largeNoise = Fbm(p * 0.31 + driftLarge);
                float smallNoise = Fbm(p * 1.28 + driftSmall);
                const float eps = 0.065;
                float noiseX = Fbm((p + float2(eps, 0.0)) * 1.28 + driftSmall);
                float noiseZ = Fbm((p + float2(0.0, eps)) * 1.28 + driftSmall);
                float3 normal = normalize(input.normalWeb
                    + float3((smallNoise - noiseX) * 0.46, 0.0, (smallNoise - noiseZ) * 0.46));
                float3 viewDir = normalize(_ViewDirection.xyz);

                // Deep blue offshore, turquoise in a ring around the island.
                float islandDistance = length(p);
                float shallow = 1.0 - smoothstep(5.8, 10.3, islandDistance);
                float shelf = 1.0 - smoothstep(8.8, 14.5, islandDistance);
                float3 deepColor = lerp(_DeepColor.rgb, float3(0.02, 0.36, 0.68), 0.68);
                float3 midColor = lerp(_MidColor.rgb, float3(0.00, 0.72, 0.88), 0.78);
                float3 shallowColor = lerp(_ShallowColor.rgb, float3(0.22, 0.95, 1.00), 0.82);
                float3 body = lerp(deepColor, midColor, shelf * 0.76);
                body = lerp(body, shallowColor, shallow * 0.78);
                body *= 0.96 + largeNoise * 0.18 + smallNoise * 0.05;

                float crest = smoothstep(0.045, 0.165, input.height + input.slope * 0.080);
                crest *= 0.55 + 0.45 * largeNoise;
                body += shallowColor * crest * 0.16;

                // The sky at a slant, a broad sun sheen and a glitter that drifts over the waves.
                float nDotV = saturate(dot(normal, viewDir));
                float fresnel = 0.02 + 0.98 * pow(1.0 - nDotV, 5.0);
                float3 reflectedSky = lerp(_SkyColor.rgb, float3(0.74, 0.92, 1.0), 0.42) * (0.84 + largeNoise * 0.10);
                float3 color = lerp(body, reflectedSky, fresnel * 0.36);
                float3 halfVector = normalize(viewDir + normalize(_SunDirection.xyz));
                float nDotH = saturate(dot(normal, halfVector));
                float broadSun = pow(nDotH, 24.0) * 0.16;
                float glitterNoise = Fbm(p * 2.2 + float2(t * 0.14, -t * 0.09));
                float glitter = pow(nDotH, 58.0) * smoothstep(0.64, 0.90, glitterNoise) * 0.25;
                color += _SunColor.rgb * (broadSun + glitter);

                float trough = smoothstep(0.08, -0.12, input.height);
                color *= 1.0 - trough * 0.045;
                return half4(SRGBToLinear(saturate(color)), 1.0);
            }
            ENDHLSL
        }
    }
}
