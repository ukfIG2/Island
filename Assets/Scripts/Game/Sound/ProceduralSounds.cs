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
                case SoundCue.WorkerMoved: samples = WorkerMoved(); break;
                case SoundCue.LineGrowing: samples = LineGrowing(); break;
                case SoundCue.LineCatchingUp: samples = LineCatchingUp(); break;
                case SoundCue.SuddenRush: samples = SuddenRush(); break;
                case SoundCue.BoatShuttle: samples = BoatShuttle(); break;
                case SoundCue.BoatSpeedboats: samples = BoatSpeedboats(); break;
                case SoundCue.BoatFerry: samples = BoatFerry(); break;
                case SoundCue.BoatSeaplane: samples = BoatSeaplane(); break;
                case SoundCue.WaveStart: samples = WaveStart(); break;
                case SoundCue.GuestsArrived: samples = GuestsArrived(); break;
                case SoundCue.ResultOneStar: samples = Result(1, false); break;
                case SoundCue.ResultTwoStars: samples = Result(2, false); break;
                case SoundCue.ResultThreeStars: samples = Result(3, false); break;
                case SoundCue.ResultFourStars: samples = Result(4, false); break;
                case SoundCue.ResultFiveStars: samples = Result(5, false); break;
                case SoundCue.ResultPerfect: samples = Result(5, true); break;
                case SoundCue.RewardsClaimed: samples = RewardsClaimed(); break;
                case SoundCue.SpeedUp: samples = SpeedUp(); break;
                case SoundCue.EnergyGained: samples = EnergyGained(); break;
                case SoundCue.Upgrade: samples = Upgrade(); break;
                case SoundCue.Unlock: samples = Unlock(); break;
                case SoundCue.AreaOffer: samples = AreaOffer(); break;
                case SoundCue.ResortSummary: samples = ResortSummary(); break;
                case SoundCue.Ocean: samples = Ocean(); break;
                case SoundCue.Rain: samples = Rain(); break;
                case SoundCue.Gull: samples = Gull(); break;
                case SoundCue.MusicCalm: samples = Music(beatSeconds: 1.0f, busy: false); break;
                case SoundCue.MusicBusy: samples = Music(beatSeconds: 2f / 3f, busy: true); break;
                default: return null;
            }
            return Finish(samples);
        }

        // Notes, in Hz.
        const float A3 = 220.00f, C4 = 261.63f, D4 = 293.66f, E4 = 329.63f, G4 = 392.00f, B4 = 493.88f;
        const float C5 = 523.25f, D5 = 587.33f, E5 = 659.25f, G5 = 783.99f, A5 = 880.00f, B5 = 987.77f;
        const float C6 = 1046.50f, E6 = 1318.51f, G6 = 1567.98f, A6 = 1760.00f, C7 = 2093.00f;

        // The voices: how loud each overtone is next to the note itself.
        static readonly float[] Warm = { 1f, 2f, 3f }, WarmGain = { 1f, 0.20f, 0.06f };
        static readonly float[] Pluck = { 1f, 2f, 3f }, PluckGain = { 1f, 0.35f, 0.12f };
        static readonly float[] Bell = { 1f, 2.76f, 5.40f }, BellGain = { 1f, 0.45f, 0.20f };
        static readonly float[] Gong = { 1f, 2.00f, 2.76f, 4.10f }, GongGain = { 1f, 0.50f, 0.35f, 0.15f };
        static readonly float[] Horn = { 1f, 2f, 3f, 4f }, HornGain = { 1f, 0.5f, 0.3f, 0.15f };
        static readonly float[] Pad = { 1f, 1.004f, 0.996f, 2f }, PadGain = { 1f, 0.6f, 0.6f, 0.12f };

        // --- the sounds ----------------------------------------------------------------------------------------

        // A Worker was moved: a soft pop, then two light footsteps.
        static float[] WorkerMoved()
        {
            var b = Silence(0.34f);
            Sweep(b, 0f, 0.10f, 640f, 380f, 0.8f, fade: 32f, attack: 0.004f);
            Thud(b, 0.11f, 0.07f, 700f, 5f, 11);
            Thud(b, 0.23f, 0.07f, 650f, 4f, 12);
            return b;
        }

        // A line starts to grow: two soft low notes, falling. A hint, not an alarm.
        static float[] LineGrowing()
        {
            var b = Silence(1.2f);
            Tone(b, 0f, 0.60f, D4, 0.7f, 0.06f, 4.5f, Warm, WarmGain);
            Tone(b, 0.30f, 0.85f, A3, 0.7f, 0.06f, 3.6f, Warm, WarmGain);
            return b;
        }

        // Help landed and the line is shrinking: two soft notes, rising.
        static float[] LineCatchingUp()
        {
            var b = Silence(1.2f);
            Tone(b, 0f, 0.55f, E4, 0.7f, 0.01f, 5f, Pluck, PluckGain);
            Tone(b, 0.20f, 0.90f, B4, 0.7f, 0.01f, 4f, Pluck, PluckGain);
            return b;
        }

        // The Sudden rush: a friendly ding-dong over a little crowd, nothing like the line sound.
        static float[] SuddenRush()
        {
            var b = Silence(1.6f);
            Tone(b, 0f, 0.9f, G5, 0.7f, 0.004f, 4f, Bell, BellGain);
            Tone(b, 0.38f, 1.2f, E5, 0.7f, 0.004f, 3.2f, Bell, BellGain);
            Murmur(b, 0f, 1.5f, 0.18f, 21);
            return b;
        }

        // The vessels swell as they come in and fade as they go, so one sound serves both: a little motor and a short
        // horn for the shuttle, a busy buzz for the speedboats, a deep slow horn for the ferry, a propeller flying past
        // for the seaplane.
        static float[] BoatShuttle()
        {
            var b = Silence(2.2f);
            Engine(b, 0f, 2.1f, 70f, 95f, 17f, 0.8f, 41);
            Tone(b, 1.35f, 0.7f, 311.13f, 0.45f, 0.06f, 1.2f, Horn, HornGain, release: 0.3f);
            return b;
        }

        static float[] BoatSpeedboats()
        {
            var b = Silence(2.2f);
            Engine(b, 0f, 2.1f, 95f, 150f, 26f, 1.0f, 42);
            Engine(b, 0.15f, 1.9f, 110f, 170f, 31f, 0.7f, 43);
            return b;
        }

        static float[] BoatFerry()
        {
            var b = Silence(2.8f);
            Engine(b, 0f, 2.7f, 48f, 62f, 9f, 0.6f, 44);
            Tone(b, 0.9f, 1.6f, 110f, 0.55f, 0.12f, 0.9f, Horn, HornGain, release: 0.5f);
            Tone(b, 0.9f, 1.6f, 138.59f, 0.40f, 0.12f, 0.9f, Horn, HornGain, release: 0.5f);
            return b;
        }

        static float[] BoatSeaplane()
        {
            var b = Silence(2.6f);
            Propeller(b, 0f, 2.5f, 1f, 45);
            return b;
        }

        static float[] WaveStart()
        {
            var b = Silence(2.3f);
            Tone(b, 0f, 2.2f, 196f, 0.8f, 0.01f, 2.0f, Gong, GongGain);
            Tone(b, 0f, 2.0f, 98f, 0.5f, 0.02f, 2.4f, Warm, WarmGain);
            return b;
        }

        // Arrivals have closed: three small bells.
        static float[] GuestsArrived()
        {
            var b = Silence(1.1f);
            Tone(b, 0f, 0.6f, C6, 0.6f, 0.003f, 6.5f, Bell, BellGain);
            Tone(b, 0.13f, 0.6f, E6, 0.6f, 0.003f, 6.5f, Bell, BellGain);
            Tone(b, 0.26f, 0.7f, G6, 0.6f, 0.003f, 6f, Bell, BellGain);
            return b;
        }

        // One more note for every star. A single note for one star is plain and quiet, never a "fail" sound;
        // a Perfect wave adds a warm chord.
        static float[] Result(int stars, bool perfect)
        {
            float[] scale = { C5, D5, E5, G5, A5 };
            var b = Silence(0.15f * (stars - 1) + (perfect ? 2.4f : 1.1f));
            for (int k = 0; k < stars; k++) Tone(b, 0.15f * k, 0.95f, scale[k], 0.7f, 0.004f, 5f, Pluck, PluckGain);
            if (perfect)
            {
                float at = 0.15f * stars;
                foreach (float f in new[] { C5, E5, G5, C6 }) Tone(b, at, 1.7f, f, 0.45f, 0.06f, 1.4f, Pad, PadGain, release: 0.6f);
            }
            return b;
        }

        static float[] RewardsClaimed()
        {
            var b = Silence(0.7f);
            Tone(b, 0f, 0.4f, G6, 0.7f, 0.002f, 9f, Bell, BellGain);
            Tone(b, 0.08f, 0.55f, C7, 0.7f, 0.002f, 8f, Bell, BellGain);
            return b;
        }

        // Speed Up: a rising whoosh with a bright note climbing through it.
        static float[] SpeedUp()
        {
            var b = Silence(0.6f);
            Whoosh(b, 0f, 0.55f, 400f, 3200f, 0.9f, 31);
            Sweep(b, 0f, 0.45f, 520f, 1040f, 0.5f, fade: 5f, attack: 0.01f);
            return b;
        }

        static float[] EnergyGained()
        {
            var b = Silence(0.8f);
            Tone(b, 0f, 0.45f, B5, 0.7f, 0.002f, 7f, Bell, BellGain);
            Tone(b, 0.09f, 0.5f, E6, 0.7f, 0.002f, 7f, Bell, BellGain);
            Tone(b, 0.18f, 0.6f, G6, 0.7f, 0.002f, 6f, Bell, BellGain);
            return b;
        }

        // An upgrade: a quick rising chord, then a bell.
        static float[] Upgrade()
        {
            var b = Silence(1.3f);
            float[] notes = { C5, E5, G5 };
            for (int k = 0; k < notes.Length; k++) Tone(b, 0.07f * k, 0.5f, notes[k], 0.6f, 0.004f, 6f, Pluck, PluckGain);
            Tone(b, 0.21f, 1.0f, C6, 0.6f, 0.003f, 4f, Bell, BellGain);
            return b;
        }

        // A new building: a longer rising run that settles into a chord.
        static float[] Unlock()
        {
            var b = Silence(2.0f);
            float[] notes = { C5, E5, G5, C6, E6 };
            for (int k = 0; k < notes.Length; k++) Tone(b, 0.07f * k, 0.6f, notes[k], 0.55f, 0.004f, 5f, Pluck, PluckGain);
            foreach (float f in new[] { C5, E5, G5 }) Tone(b, 0.35f, 1.6f, f, 0.4f, 0.08f, 1.5f, Pad, PadGain, release: 0.6f);
            return b;
        }

        // A new area is on offer: a handful of small sparkles.
        static float[] AreaOffer()
        {
            var b = Silence(1.1f);
            float[] at = { 0f, 0.08f, 0.17f, 0.27f, 0.40f };
            float[] freq = { C6, E6, G6, A6, C7 };
            for (int k = 0; k < at.Length; k++) Tone(b, at[k], 0.5f, freq[k], 0.5f, 0.002f, 7f, Bell, BellGain);
            return b;
        }

        // The Resort summary: a warm, slow chord that swells and settles.
        static float[] ResortSummary()
        {
            var b = Silence(3.6f);
            foreach (float f in new[] { C4, E4, G4, B4 }) Tone(b, 0f, 3.5f, f, 0.45f, 0.9f, 0.5f, Pad, PadGain, release: 1.2f);
            Tone(b, 0f, 3.5f, C4 / 2f, 0.4f, 0.9f, 0.5f, Warm, WarmGain, release: 1.2f);
            return b;
        }

        static float[] Click()
        {
            var b = Silence(0.07f);
            Sweep(b, 0f, 0.07f, 1500f, 800f, 1f, fade: 55f, attack: 0.002f);
            return b;
        }

        // The sea and a light wind, 16 seconds that repeat without a seam: the swell rises and falls three and five
        // times in the loop, so its end leads straight into its start.
        static float[] Ocean()
        {
            const int seconds = 16;
            int n = seconds * Rate, fade = Rate / 2, total = n + fade;
            var surfNoise = Noise(total, 61);
            var foamNoise = Noise(total, 62);
            var windNoise = Noise(total, 63);
            float surfStep = LowPassStep(700f), foamHigh = LowPassStep(2500f), foamLow = LowPassStep(900f), windStep = LowPassStep(250f);
            float ys = 0f, yfh = 0f, yfl = 0f, yw = 0f;
            var raw = new float[total];
            for (int i = 0; i < total; i++)
            {
                double t = i / (double)Rate;
                float swell = 0.55f + 0.30f * (float)Math.Sin(2 * Math.PI * 3 * t / seconds + 0.4)
                                    + 0.15f * (float)Math.Sin(2 * Math.PI * 5 * t / seconds + 1.7);
                float gust = 1f + 0.4f * (float)Math.Sin(2 * Math.PI * 2 * t / seconds + 2.2);
                ys += surfStep * (surfNoise[i] - ys);
                yfh += foamHigh * (foamNoise[i] - yfh);
                yfl += foamLow * (foamNoise[i] - yfl);
                yw += windStep * (windNoise[i] - yw);
                raw[i] = 3.2f * ys * swell + 2.2f * (yfh - yfl) * swell * swell + 2.5f * yw * gust * 0.5f;
            }
            return SeamlessLoop(raw, n, fade);
        }

        // Rain: bright noise with a slow, uneven patter, 10 seconds that repeat without a seam.
        static float[] Rain()
        {
            const int seconds = 10;
            int n = seconds * Rate, fade = Rate / 2, total = n + fade;
            var noise = Noise(total, 71);
            var patter = Noise(total, 72);
            float low = LowPassStep(1200f), patterStep = LowPassStep(2600f), yl = 0f, yp = 0f;
            var raw = new float[total];
            for (int i = 0; i < total; i++)
            {
                double t = i / (double)Rate;
                float uneven = 0.85f + 0.15f * (float)Math.Sin(2 * Math.PI * 2 * t / seconds + 0.9);
                yl += low * (noise[i] - yl);
                yp += patterStep * (patter[i] - yp);
                raw[i] = uneven * ((noise[i] - yl) * 0.55f + yp * 0.7f);
            }
            return SeamlessLoop(raw, n, fade);
        }

        // A gull: two short cries, the second falling.
        static float[] Gull()
        {
            var b = Silence(0.65f);
            Sweep(b, 0f, 0.22f, 1700f, 2400f, 0.8f, fade: 6f, attack: 0.02f);
            Sweep(b, 0f, 0.22f, 3400f, 4800f, 0.2f, fade: 7f, attack: 0.02f);
            Sweep(b, 0.27f, 0.32f, 2300f, 1500f, 0.7f, fade: 5f, attack: 0.02f);
            Sweep(b, 0.27f, 0.32f, 4600f, 3000f, 0.18f, fade: 6f, attack: 0.02f);
            return b;
        }

        // Music that repeats without a seam: four chords of four beats (a warm C major, A minor, F major, G), a soft pad
        // that swells through each change, a low note on the first beat, and small notes of the pentatonic scale on top.
        // The calm mood lets a few of them ring; the busy mood plays them as a steady, light run of eighth notes.
        // Every note is written round the end of the loop, so the end leads straight into the start.
        static float[] Music(float beatSeconds, bool busy)
        {
            const int chords = 4, beatsPerChord = 4;
            float chordSeconds = beatsPerChord * beatSeconds;
            var b = Silence(chords * chordSeconds);

            float[][] pad =
            {
                new[] { 130.81f, 164.81f, 196.00f, 246.94f },    // C major seventh
                new[] { 110.00f, 130.81f, 164.81f, 196.00f },    // A minor seventh
                new[] { 174.61f, 220.00f, 261.63f, 329.63f },    // F major seventh
                new[] { 196.00f, 246.94f, 293.66f, 329.63f },    // G with a sixth
            };
            float[] root = { 65.41f, 55.00f, 87.31f, 98.00f };
            // The calm melody: (beat in the chord, pitch). Only a few notes, left to ring.
            (float beat, float freq)[][] calm =
            {
                new[] { (0.5f, E5), (2.5f, G5), (3.5f, D5) },
                new[] { (0.5f, C5), (2.0f, E5), (3.0f, A5) },
                new[] { (0.5f, A5), (2.5f, G5), (3.5f, E5) },
                new[] { (0.5f, D5), (1.5f, G5), (3.0f, E5) },
            };
            // The busy run: eighth notes through the chord's own notes, an octave up.
            int[][] runShape = { new[] { 0, 1, 2, 3, 2, 1, 2, 1 }, new[] { 0, 2, 1, 3, 2, 1, 3, 2 } };

            for (int c = 0; c < chords; c++)
            {
                float at = c * chordSeconds;
                foreach (float f in pad[c])
                    Tone(b, at, chordSeconds + 1.2f, f, 0.30f, 1.0f, 0f, Pad, PadGain, release: 1.2f, wrap: true);
                Tone(b, at, chordSeconds + 0.8f, root[c], 0.40f, 0.12f, 0.35f, Warm, WarmGain, release: 0.8f, wrap: true);
                if (!busy)
                {
                    foreach (var note in calm[c])
                        Tone(b, at + note.beat * beatSeconds, 2.2f, note.freq, 0.20f, 0.006f, 2.0f, Pluck, PluckGain, wrap: true);
                }
                else
                {
                    var shape = runShape[c % 2];
                    for (int k = 0; k < 8; k++)
                    {
                        float f = pad[c][shape[k]] * 2f;
                        Tone(b, at + k * beatSeconds * 0.5f, 0.9f, f, 0.15f, 0.005f, 4.5f, Pluck, PluckGain, wrap: true);
                    }
                    Tone(b, at + 2f * beatSeconds, 0.9f, root[c], 0.30f, 0.03f, 2.5f, Warm, WarmGain, wrap: true);   // a soft pulse
                }
            }
            return b;
        }

        // --- building blocks -----------------------------------------------------------------------------------

        // Makes a loop of n samples from n + fade samples: the extra tail is faded into the start, so the last
        // sample leads straight into the first (the tail is the very next stretch of the same sound).
        static float[] SeamlessLoop(float[] raw, int n, int fade)
        {
            var o = new float[n];
            for (int i = 0; i < n; i++)
            {
                if (i < fade)
                {
                    float w = i / (float)fade;
                    o[i] = raw[i] * (float)Math.Sqrt(w) + raw[n + i] * (float)Math.Sqrt(1f - w);
                }
                else o[i] = raw[i];
            }
            return o;
        }

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

        // Quick attack, exponential fade, and a release so a sound never ends on a click.
        static float Envelope(int i, int n, double t, float attack, float fade, float release = 0.015f)
        {
            float rise = attack > 0f ? Math.Min(1f, (float)t / attack) : 1f;
            float fall = Math.Min(1f, (n - 1 - i) / (release * Rate));
            return rise * (float)Math.Exp(-fade * t) * fall;
        }

        // A note with overtones: the ratios are the overtones' pitch next to the note, the gains how loud they are.
        // With wrap, what runs past the end of the sound carries on at its start (for loops).
        static void Tone(float[] b, float at, float length, float freq, float amp, float attack, float fade,
            float[] ratios, float[] gains, float release = 0.015f, bool wrap = false)
        {
            int start = (int)(at * Rate), n = (int)(length * Rate);
            for (int i = 0; i < n; i++)
            {
                int index = start + i;
                if (wrap) index %= b.Length;
                else if (index >= b.Length) break;
                double t = i / (double)Rate;
                float s = 0f;
                for (int p = 0; p < ratios.Length; p++) s += gains[p] * (float)Math.Sin(2 * Math.PI * freq * ratios[p] * t);
                b[index] += amp * Envelope(i, n, t, attack, fade, release) * s;
            }
        }

        // Noise that cannot change from one making to the next.
        static float[] Noise(int n, uint seed)
        {
            var b = new float[n];
            uint x = seed * 2654435761u + 1u;
            for (int i = 0; i < n; i++)
            {
                x ^= x << 13; x ^= x >> 17; x ^= x << 5;
                b[i] = (x / (float)uint.MaxValue) * 2f - 1f;
            }
            return b;
        }

        static float LowPassStep(float cutoff) => 1f - (float)Math.Exp(-2.0 * Math.PI * cutoff / Rate);

        // A soft footstep: low-passed noise with a quick fade.
        static void Thud(float[] b, float at, float length, float cutoff, float amp, uint seed)
        {
            int start = (int)(at * Rate), n = (int)(length * Rate);
            var noise = Noise(n, seed);
            float a = LowPassStep(cutoff), y = 0f;
            for (int i = 0; i < n && start + i < b.Length; i++)
            {
                y += a * (noise[i] - y);
                b[start + i] += amp * y * Envelope(i, n, i / (double)Rate, 0.002f, 55f);
            }
        }

        // A little crowd: noise between about 300 and 900 Hz that swells and settles.
        static void Murmur(float[] b, float at, float length, float amp, uint seed)
        {
            int start = (int)(at * Rate), n = (int)(length * Rate);
            var noise = Noise(n, seed);
            float high = LowPassStep(900f), low = LowPassStep(300f), yh = 0f, yl = 0f;
            for (int i = 0; i < n && start + i < b.Length; i++)
            {
                yh += high * (noise[i] - yh);
                yl += low * (noise[i] - yl);
                float swell = (float)Math.Sin(Math.PI * i / n);
                b[start + i] += amp * 6f * (yh - yl) * swell * swell;
            }
        }

        // A motor heard from a distance, swelling and fading: low noise pulsing at the engine's beat over a low hum.
        static void Engine(float[] b, float at, float length, float f0, float f1, float beatHz, float amp, uint seed)
        {
            int start = (int)(at * Rate), n = (int)(length * Rate);
            var noise = Noise(n, seed);
            float a = LowPassStep(420f), y = 0f;
            double hum = 0, beat = 0;
            for (int i = 0; i < n && start + i < b.Length; i++)
            {
                float f = f0 + (f1 - f0) * i / n;
                hum += 2 * Math.PI * f / Rate;
                beat += 2 * Math.PI * beatHz / Rate;
                y += a * (noise[i] - y);
                float swell = (float)Math.Sin(Math.PI * i / n);
                swell *= swell;
                float pulse = 0.65f + 0.35f * (float)Math.Sin(beat);
                b[start + i] += amp * swell * pulse * (3.5f * y + 0.5f * (float)Math.Sin(hum));
            }
        }

        // A propeller passing by: bright noise beating about 36 times a second, its pitch bending as it flies past.
        static void Propeller(float[] b, float at, float length, float amp, uint seed)
        {
            int start = (int)(at * Rate), n = (int)(length * Rate);
            var noise = Noise(n, seed);
            float a = LowPassStep(800f), y = 0f;
            double beat = 0, hum = 0;
            for (int i = 0; i < n && start + i < b.Length; i++)
            {
                float u = (float)i / n;
                float beatHz = 46f - 16f * u;                       // the beat slows as the plane passes
                float f = 190f - 50f * u;
                beat += 2 * Math.PI * beatHz / Rate;
                hum += 2 * Math.PI * f / Rate;
                y += a * (noise[i] - y);
                float swell = (float)Math.Sin(Math.PI * Math.Pow(u, 0.8));
                swell *= swell;
                float pulse = 0.4f + 0.6f * (0.5f + 0.5f * (float)Math.Sin(beat));
                b[start + i] += amp * swell * pulse * (0.9f * (noise[i] - y) + 0.35f * (float)Math.Sin(hum));
            }
        }

        // Noise that brightens: a low-pass whose cutoff climbs from one pitch to another.
        static void Whoosh(float[] b, float at, float length, float from, float to, float amp, uint seed)
        {
            int start = (int)(at * Rate), n = (int)(length * Rate);
            var noise = Noise(n, seed);
            float y = 0f;
            for (int i = 0; i < n && start + i < b.Length; i++)
            {
                float cutoff = from + (to - from) * i / n;
                y += LowPassStep(cutoff) * (noise[i] - y);
                float swell = (float)Math.Sin(Math.PI * i / n);
                b[start + i] += amp * 3f * y * swell * swell;
            }
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
