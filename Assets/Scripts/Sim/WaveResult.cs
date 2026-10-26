using System.Collections.Generic;

namespace ResortEmpire.Sim
{
    // Computed exactly once on entering WaveComplete; rewards are already applied to ResortState.
    public sealed class WaveResult
    {
        public int WaveIndex;
        public float Satisfaction;     // 0..1, already floored at WaveFloor
        public int Stars;              // 1..5
        public bool Perfect;           // Satisfaction >= 1.00; implies 5 stars
        public int CoinsEarned;
        public int EnergyEarned;
        public int ResortValueGain;
        public int TotalUnits;
        public Dictionary<NeedId, float> AverageWaitByNeed;
        public NeedId? WorstNeed;      // longest total Bottleneck time — the upgrade hint
    }
}
