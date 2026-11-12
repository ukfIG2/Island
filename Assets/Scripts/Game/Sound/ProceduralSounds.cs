using System;

namespace ResortEmpire.Game.Sound
{
    // CAM-117: placeholder sounds made in code, so the timing of every cue can be heard before the real sounds exist.
    // A real sound dropped into Resources/Sound under the cue's name takes over (see SoundBank). Plain C# on purpose:
    // it returns samples, not clips, so the tests can check them without Unity's audio.
    public static class ProceduralSounds
    {
        public const int Rate = 44100;
        public const float Peak = 0.8f;    // every sound is scaled to this; how loud a cue is lives in CueInfo.Volume

        // Mono samples between -Peak and Peak, or null for a cue that has no placeholder.
        public static float[] Make(SoundCue cue)
        {
            float[] samples;
            switch (cue)
            {
                case SoundCue.Click: samples = Click(); break;
                default: return null;
            }
            return Finish(samples);
        }

        // --- the sounds ----------------------------------------------------------------------------------------

        static float[] Click()
        {
            var b = Silence(0.07f);
            Sweep(b, 0f, 0.07f, 1500f, 800f, 1f, fade: 55f, attack: 0.002f);
            return b;
        }

        // --- building blocks -----------------------------------------------------------------------------------

        static float[] Silence(float seconds) => new float[(int)(seconds * Rate)];

        // A tone that glides from f0 to f1, with a quick attack and an exponential fade, ending at zero.
        static void Sweep(float[] b, float at, float length, float f0, float f1, float amp, float fade, float attack)
        {
            int start = (int)(at * Rate), n = (int)(length * Rate);
            double k = (f1 - f0) / length;
            for (int i = 0; i < n && start + i < b.Length; i++)
            {
                double t = i / (double)Rate;
                double phase = 2 * Math.PI * (f0 * t + 0.5 * k * t * t);
                b[start + i] += amp * Envelope(i, n, t, attack, fade) * (float)Math.Sin(phase);
            }
        }

        // Quick attack, exponential fade, and a short release so a sound never ends on a click.
        static float Envelope(int i, int n, double t, float attack, float fade)
        {
            float rise = attack > 0f ? Math.Min(1f, (float)t / attack) : 1f;
            float release = Math.Min(1f, (n - 1 - i) / (0.015f * Rate));
            return rise * (float)Math.Exp(-fade * t) * release;
        }

        // Scales the sound so its loudest point is Peak. A sound of silence stays silent.
        static float[] Finish(float[] b)
        {
            float max = 0f;
            foreach (float s in b) max = Math.Max(max, Math.Abs(s));
            if (max < 1e-6f) return b;
            float scale = Peak / max;
            for (int i = 0; i < b.Length; i++) b[i] *= scale;
            return b;
        }
    }
}
