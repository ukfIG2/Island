using System.Collections.Generic;
using ResortEmpire.Sim;

namespace ResortEmpire.Game
{
    public enum AreaState { Locked, Available, NotAffordable, Unlocked }

    // CAM-44 (S9): a new area (the Pool, the Bungalows) offered as a moment of growth. Its state is one of locked,
    // available, not affordable or unlocked (FR-060). Plain C# on purpose, so it can be tested without the game.
    public sealed class AreaOffer
    {
        public BuildingId Building;
        public AreaState State;
        public NeedId Need;              // the need the area adds
        public int Cost;                 // Coins
        public int Missing;              // Coins still missing; 0 unless NotAffordable
        public int EligibleAfterWave;    // the wave that has to be completed first
        public int DebutWave;            // the first wave with guests for the new need; 0 if none

        public static bool IsArea(BuildingId b) => b == BuildingId.Pool || b == BuildingId.Bungalows;

        public static AreaOffer For(ResortState resort, TuningConfig t, IReadOnlyList<WaveDef> waves, BuildingId b)
        {
            if (!IsArea(b)) return null;
            bool pool = b == BuildingId.Pool;
            int after = pool ? t.PoolEligibleAfterWave : t.BungalowsEligibleAfterWave;
            int cost = pool ? t.PoolUnlockCostCoins : t.BungalowsUnlockCostCoins;
            var need = BuildingNeeds.Serves(b);

            int debut = 0;
            if (waves != null)
                foreach (var wave in waves)
                    if (wave.Demand.TryGetValue(need, out int demand) && demand > 0)
                    {
                        debut = wave.Index;
                        break;
                    }

            AreaState state = resort.IsUnlocked(b) ? AreaState.Unlocked
                : resort.WavesCompleted < after ? AreaState.Locked
                : resort.Coins >= cost ? AreaState.Available
                : AreaState.NotAffordable;
            return new AreaOffer
            {
                Building = b, State = state, Need = need, Cost = cost,
                Missing = state == AreaState.NotAffordable ? cost - resort.Coins : 0,
                EligibleAfterWave = after, DebutWave = debut
            };
        }

        // The area that becomes available with the wave just finished: it is shown once, right after the result. Skipped,
        // it waits at its construction site. Null when no area is due.
        public static BuildingId? DueAfterWave(ResortState resort, TuningConfig t)
        {
            if (!resort.IsUnlocked(BuildingId.Pool) && resort.WavesCompleted == t.PoolEligibleAfterWave) return BuildingId.Pool;
            if (!resort.IsUnlocked(BuildingId.Bungalows) && resort.WavesCompleted == t.BungalowsEligibleAfterWave) return BuildingId.Bungalows;
            return null;
        }
    }
}
