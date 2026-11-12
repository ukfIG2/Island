using System;
using ResortEmpire.Sim;

namespace ResortEmpire.Game
{
    // CAM-41 (S5): which building to suggest after a wave and what its next level brings. The suggestion is linked to
    // what the wave showed (FR-015): the building behind the worst line first; failing that the one whose guests
    // waited longest. It is only ever an offer: the player can say Later. Plain C# on purpose, so it can be tested.
    public sealed class UpgradeAdvice
    {
        public BuildingId Building;
        public int FromLevel, ToLevel;
        public int SeatsBefore, SeatsAfter;
        public int Cost;                  // Coins
        public int ValueGain;             // Resort Value
        public bool Affordable;
        public bool FromWorst;            // the building behind the wave's worst line
        public BottleneckCause Cause;     // why that line grew; None unless FromWorst

        // Null when the wave left nothing to improve, so the flow skips S5.
        public static UpgradeAdvice For(ResortState resort, TuningConfig t, WaveResult r)
        {
            if (resort == null || t == null || r == null) return null;

            BuildingId? pick = null;
            bool fromWorst = false;
            if (r.WorstNeed.HasValue)
            {
                var worst = BuildingNeeds.BuildingFor(r.WorstNeed.Value);
                if (CanUpgrade(resort, t, worst))
                {
                    pick = worst;
                    fromWorst = true;
                }
            }
            if (pick == null && r.AverageWaitByNeed != null)
            {
                // With a bottleneck on record any wait is worth widening; otherwise only waits past the grace time.
                float bestWait = r.WorstNeed.HasValue ? 0f : t.PatienceGraceSeconds;
                foreach (NeedId need in Enum.GetValues(typeof(NeedId)))   // enum order, so ties always resolve the same way
                {
                    var b = BuildingNeeds.BuildingFor(need);
                    if (r.AverageWaitByNeed.TryGetValue(need, out float wait) && wait > bestWait && CanUpgrade(resort, t, b))
                    {
                        pick = b;
                        bestWait = wait;
                    }
                }
            }
            if (pick == null) return null;

            var state = resort.Get(pick.Value);
            int level = state.Level;
            int cost = t.UpgradeCostCoins[level - 1];
            return new UpgradeAdvice
            {
                Building = pick.Value,
                FromLevel = level,
                ToLevel = level + 1,
                SeatsBefore = t.CapacityPerLevel[level - 1],
                SeatsAfter = t.CapacityPerLevel[level],
                Cost = cost,
                ValueGain = t.ResortValuePerUpgrade,
                Affordable = resort.Coins >= cost,
                FromWorst = fromWorst,
                Cause = fromWorst ? r.WorstNeedCause : BottleneckCause.None
            };
        }

        static bool CanUpgrade(ResortState resort, TuningConfig t, BuildingId building)
        {
            var state = resort.Get(building);
            return state != null && state.Level < t.CapacityPerLevel.Length;
        }
    }
}
