using System;
using System.Collections.Generic;

namespace ResortEmpire.Sim
{
    public sealed class WaveDef
    {
        public int Index;                 // 1-based
        public bool IsDebut;              // waves 4 and 7 debut a new need and are intentionally soft
        public bool HasSuddenRush;
        public Dictionary<NeedId, int> Demand = new Dictionary<NeedId, int>();
    }

    public static class WaveTable
    {
        public const int ScriptedWaveCount = 8;

        // Build doc §4.8 wave progression table (8 scripted waves, not procedural).
        public static List<WaveDef> Default8()
        {
            return new List<WaveDef>
            {
                Wave(1, false, false, r: 8,  d: 8,  f: 6),
                Wave(2, false, true,  r: 12, d: 16, f: 10),
                Wave(3, false, false, r: 16, d: 18, f: 14),
                Wave(4, true,  false, r: 16, d: 18, f: 14, x: 8),
                Wave(5, false, false, r: 20, d: 22, f: 18, x: 16),
                Wave(6, false, false, r: 25, d: 28, f: 22, x: 20),
                Wave(7, true,  false, r: 25, d: 28, f: 22, x: 20, o: 10),
                Wave(8, false, false, r: 31, d: 35, f: 28, x: 25, o: 16),
            };
        }

        // Any wave, 1-based: the scripted table for 1-8, then endless waves generated from wave 8 (P10):
        // every need x EndlessGrowthPerWave per extra wave (compounded, rounded half away from zero),
        // a Sudden rush on every EndlessRushEveryNthWave-th wave (9, 12, 15, ...), no new needs and no
        // debut softening. Deterministic: the same index always gives the same wave. A fresh WaveDef
        // on every call.
        public static WaveDef WaveFor(int index, TuningConfig tuning = null)
        {
            if (index < 1) throw new ArgumentOutOfRangeException(nameof(index), "Waves are 1-based.");
            var scripted = Default8();
            if (index <= scripted.Count) return scripted[index - 1];

            var t = tuning ?? TuningConfig.Default;
            var last = scripted[scripted.Count - 1];
            double factor = Math.Pow(t.EndlessGrowthPerWave, index - last.Index);
            var wave = new WaveDef
            {
                Index = index,
                IsDebut = false,
                HasSuddenRush = t.EndlessRushEveryNthWave > 0 && index % t.EndlessRushEveryNthWave == 0
            };
            foreach (var pair in last.Demand)
                wave.Demand[pair.Key] = (int)Math.Round(pair.Value * factor, MidpointRounding.AwayFromZero);
            return wave;
        }

        static WaveDef Wave(int index, bool debut, bool rush, int r, int d, int f, int x = 0, int o = 0)
        {
            var w = new WaveDef { Index = index, IsDebut = debut, HasSuddenRush = rush };
            w.Demand[NeedId.Rooms] = r;
            w.Demand[NeedId.Drinks] = d;
            w.Demand[NeedId.Food] = f;
            if (x > 0) w.Demand[NeedId.Relax] = x;
            if (o > 0) w.Demand[NeedId.OceanView] = o;
            return w;
        }
    }
}
