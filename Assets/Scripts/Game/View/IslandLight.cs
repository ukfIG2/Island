using UnityEngine;
using UnityEngine.Rendering;

namespace ResortEmpire.Game.View
{
    // The web version's light and weather for each wave (environmentProfile.ts): sky, ambient light and the sun,
    // and the ocean's colours with it. A new look blends in over a few seconds instead of switching at once.
    // The web also adds a light fog; URP's linear fog misreads depth with an orthographic camera and hazes the
    // whole island, so it is left out.
    sealed class IslandLight
    {
        const float BlendSeconds = 2.5f;

        enum Weather { Clear, Overcast, Rain }

        struct Look
        {
            public Color Sky, Sun, AmbientSky, AmbientGround, Deep, Mid, Shallow, Glow;
            public float SunIntensity, Ambient;
            public Vector3 SunFrom, OceanSun;   // where the sun stands (Unity), and its direction in the web's space
            public bool Raining;
        }

        // The web's profiles: time of day, weather, sky, ambient, hemisphere, sun intensity and sun colour.
        static Look Profile(string time, Weather weather, int sky, float ambient, float hemisphere, float sun,
            int sunColor)
        {
            bool sunset = time == "sunset";
            var sunTint = ViewKit.Hex(sunColor);
            // The web adds a sky-to-ground hemisphere light; day's is pale blue, otherwise the sun's colour.
            var hemisphereSky = time == "day" ? ViewKit.Hex(0xD8F5FF) : sunTint;
            // Our day light is the reference; the others scale by the web's own ratios.
            float ambientScale = (ambient * 0.42f + hemisphere * 0.58f) / (1.35f * 0.42f + 1.15f * 0.58f);
            return new Look
            {
                Sky = ViewKit.Hex(sky),
                Sun = sunTint,
                SunIntensity = DaySunIntensity * sun / 2.3f,
                // The web's ambient and hemisphere lights, as a three-tone ambient from sky to ground.
                AmbientSky = Color.Lerp(DayAmbientSky, hemisphereSky * DayAmbientSky.maxColorComponent, 0.35f),
                AmbientGround = DayAmbientGround,
                Ambient = ambientScale,
                SunFrom = sunset ? new Vector3(10f, 5.5f, -3f) : new Vector3(6f, 11f, -5f),   // web x mirrored
                OceanSun = sunset ? new Vector3(-0.72f, 0.48f, -0.31f) : new Vector3(-0.46f, 0.84f, -0.29f),
                Deep = ViewKit.Hex(sunset ? 0x06384B : 0x07536B),
                Mid = ViewKit.Hex(sunset ? 0x08727E : 0x078C99),
                Shallow = ViewKit.Hex(sunset ? 0x31AAA1 : 0x3BC0B2),
                Glow = ViewKit.Hex(sunset ? 0xD59A81 : 0x79BFD0),
                Raining = weather == Weather.Rain
            };
        }

        const float DaySunIntensity = 1.1f;
        static readonly Color DayAmbientSky = new Color(0.50f, 0.57f, 0.62f);
        static readonly Color DayAmbientGround = new Color(0.17f, 0.24f, 0.22f);

        static readonly Look DayClear = Profile("day", Weather.Clear, 0x59BCD0, 1.35f, 1.15f, 2.3f, 0xFFF1CA);
        static readonly Look SunsetClear = Profile("sunset", Weather.Clear, 0xDC8D63, 1.05f, 0.9f, 2.0f, 0xFFC06F);
        static readonly Look EveningClear = Profile("evening", Weather.Clear, 0x31536D, 0.7f, 0.65f, 1.1f, 0xFFD69A);
        static readonly Look DayOvercast = Profile("day", Weather.Overcast, 0x78979D, 0.95f, 0.8f, 1.15f, 0xE2E5D9);
        static readonly Look DayRain = Profile("day", Weather.Rain, 0x4D7078, 0.8f, 0.7f, 0.8f, 0xCCD8D4);
        static readonly Look SunsetRain = Profile("sunset", Weather.Rain, 0x685D66, 0.65f, 0.58f, 0.72f, 0xD99678);

        // The web's wave table: waves 1–2 day, 3 sunset, 4 overcast, 5 rain, 6 sunset with rain, 7 evening, 8 sunset.
        static readonly Look[] ByWave = { DayClear, DayClear, SunsetClear, DayOvercast, DayRain, SunsetRain, EveningClear, SunsetClear };

        readonly Camera _camera;
        readonly Light _sun;
        readonly Material _ocean;
        Look _from, _to, _now;
        float _blend = 1f;
        int _shown = -1;   // which entry of ByWave is showing or blending in

        public bool Raining => _blend >= 0.5f ? _to.Raining : _from.Raining;

        public IslandLight(Camera camera, Light sun, Material ocean)
        {
            _camera = camera;
            _sun = sun;
            _ocean = ocean;
            RenderSettings.ambientMode = AmbientMode.Trilight;
            RenderSettings.fog = false;
            _from = _to = _now = DayClear;
            Apply(_now);
        }

        public void Show(int wave, bool complete)
        {
            int index = Mathf.Clamp(wave, 1, ByWave.Length) - 1;
            // A finished clear day (waves 1 and 2) turns to sunset, as in the web; ByWave[2] is that sunset.
            if (complete && index < 2) index = 2;
            if (index == _shown) return;
            _shown = index;
            _from = _now;
            _to = ByWave[index];
            _blend = 0f;
        }

        public void Tick(float dt)
        {
            if (_blend >= 1f) return;
            _blend = Mathf.Min(1f, _blend + dt / BlendSeconds);
            _now = Lerp(_from, _to, Mathf.SmoothStep(0f, 1f, _blend));
            Apply(_now);
        }

        void Apply(Look look)
        {
            if (_camera != null) _camera.backgroundColor = look.Sky;
            RenderSettings.ambientSkyColor = look.AmbientSky * look.Ambient;
            RenderSettings.ambientEquatorColor = Color.Lerp(look.AmbientSky, look.AmbientGround, 0.5f) * look.Ambient;
            RenderSettings.ambientGroundColor = look.AmbientGround * look.Ambient;
            if (_sun != null)
            {
                _sun.color = look.Sun;
                _sun.intensity = look.SunIntensity;
                _sun.transform.rotation = Quaternion.LookRotation(-look.SunFrom);
            }
            _ocean.SetColor("_DeepColor", look.Deep);
            _ocean.SetColor("_MidColor", look.Mid);
            _ocean.SetColor("_ShallowColor", look.Shallow);
            _ocean.SetColor("_SkyColor", look.Glow);
            _ocean.SetColor("_SunColor", look.Sun);
            _ocean.SetVector("_SunDirection", look.OceanSun);
        }

        static Look Lerp(Look a, Look b, float t) => new Look
        {
            Sky = Color.Lerp(a.Sky, b.Sky, t),
            Sun = Color.Lerp(a.Sun, b.Sun, t),
            AmbientSky = Color.Lerp(a.AmbientSky, b.AmbientSky, t),
            AmbientGround = Color.Lerp(a.AmbientGround, b.AmbientGround, t),
            Deep = Color.Lerp(a.Deep, b.Deep, t),
            Mid = Color.Lerp(a.Mid, b.Mid, t),
            Shallow = Color.Lerp(a.Shallow, b.Shallow, t),
            Glow = Color.Lerp(a.Glow, b.Glow, t),
            SunIntensity = Mathf.Lerp(a.SunIntensity, b.SunIntensity, t),
            Ambient = Mathf.Lerp(a.Ambient, b.Ambient, t),
            SunFrom = Vector3.Slerp(a.SunFrom, b.SunFrom, t),
            OceanSun = Vector3.Slerp(a.OceanSun, b.OceanSun, t),
            Raining = t < 0.5f ? a.Raining : b.Raining
        };
    }
}
