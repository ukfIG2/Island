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
