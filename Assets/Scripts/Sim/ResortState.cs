using System.Collections.Generic;

namespace ResortEmpire.Sim
{
    public sealed class BuildingState
    {
        public BuildingId Id;
        public int Level = 1;                     // 1-based; capacity comes from CapacityPerLevel[Level-1]
        public bool HasWorker;
        public NeedId Serves => BuildingNeeds.Serves(Id);
    }

    // Persistent state between waves. WaveSimulation mutates it during a wave.
    public sealed class ResortState
    {
        readonly TuningConfig _t;
        readonly List<BuildingState> _buildings = new List<BuildingState>();

        public IReadOnlyList<BuildingState> Buildings => _buildings;
        public int Workers { get; private set; }
        public int Coins;
        public int Energy;
        public int ResortValue;
        public int WavesCompleted;
        public bool InWave { get; internal set; } // set by WaveSimulation

        ResortState(TuningConfig t) { _t = t; }

        public static ResortState NewGame(TuningConfig t)
        {
            var s = new ResortState(t);
            s._buildings.Add(new BuildingState { Id = BuildingId.Reception, Level = 1, HasWorker = true });
            s._buildings.Add(new BuildingState { Id = BuildingId.Restaurant, Level = 1, HasWorker = true });
            s._buildings.Add(new BuildingState { Id = BuildingId.BeachBar, Level = 1, HasWorker = false });
            s.Workers = s._buildings.Count - 1;   // pool is always buildings-1, never equal
            s.Coins = t.StartingCoins;
            s.Energy = t.StartingEnergy;
            return s;
        }

        public bool IsUnlocked(BuildingId b) => Get(b) != null;

        public BuildingState Get(BuildingId b)
        {
            for (int i = 0; i < _buildings.Count; i++)
                if (_buildings[i].Id == b) return _buildings[i];
            return null;
        }

        // Fixed price per unlockable building; -1 for the three starting buildings.
        public int UnlockCost(BuildingId b)
        {
            if (b == BuildingId.Pool) return _t.PoolUnlockCostCoins;
            if (b == BuildingId.Bungalows) return _t.BungalowsUnlockCostCoins;
            return -1;
        }

        int EligibleAfterWave(BuildingId b) =>
            b == BuildingId.Pool ? _t.PoolEligibleAfterWave : _t.BungalowsEligibleAfterWave;

        // The wave gate alone: ignores Coins and InWave, so the shop can show what is coming.
        public bool IsEligible(BuildingId b) =>
            UnlockCost(b) >= 0 && !IsUnlocked(b) && WavesCompleted >= EligibleAfterWave(b);

        public bool CanUnlock(BuildingId b, out string reason)
        {
            reason = null;
            if (UnlockCost(b) < 0)
            {
                reason = "Only the Pool and the Bungalows can be unlocked.";
                return false;
            }
            if (IsUnlocked(b))
            {
                reason = "Already unlocked.";
                return false;
            }
            if (InWave)
            {
                reason = "Unlocks are only available between waves."; // WR6
                return false;
            }
            int afterWave = EligibleAfterWave(b);
            if (WavesCompleted < afterWave)
            {
                reason = "Complete wave " + afterWave + " first.";
                return false;
            }
            int cost = UnlockCost(b);
            if (Coins < cost)
            {
                reason = "Needs " + cost + " Coins.";
                return false;
            }
            return true;
        }

        public bool Unlock(BuildingId b)
        {
            if (!CanUnlock(b, out _)) return false;
            Coins -= UnlockCost(b);
            // A new building arrives WITH a new worker already assigned, keeping the pool at buildings-1.
            _buildings.Add(new BuildingState { Id = b, Level = 1, HasWorker = true });
            Workers++;
            ResortValue += _t.ResortValuePerUnlock; // only ever grows
            return true;
        }

        // Coins for the next level; -1 when the building is absent or already at max level.
        public int UpgradeCost(BuildingId b)
        {
            var s = Get(b);
            if (s == null || s.Level >= _t.CapacityPerLevel.Length) return -1;
            return _t.UpgradeCostCoins[s.Level - 1];
        }

        public bool Upgrade(BuildingId b)
        {
            if (InWave) return false; // WR6: upgrades only between waves
            int cost = UpgradeCost(b);
            if (cost < 0 || Coins < cost) return false;
            Coins -= cost;
            Get(b).Level++;           // capacity only; service speed never changes with level
            ResortValue += _t.ResortValuePerUpgrade; // only ever grows
            return true;
        }

        // Between-waves variant; during a wave use WaveSimulation.MoveWorker (pause rules live there).
        public bool MoveWorker(BuildingId from, BuildingId to)
        {
            if (InWave) return false;
            var f = Get(from);
            var t = Get(to);
            if (f == null || t == null || !f.HasWorker || t.HasWorker) return false;
            f.HasWorker = false;
            t.HasWorker = true;
            return true;
        }

        // Save-system entry point: rebuilds a between-waves snapshot verbatim. Purely constructive —
        // no costs, no gameplay rules; the caller is responsible for handing in a consistent snapshot.
        public static ResortState Restore(TuningConfig t, int coins, int energy, int resortValue,
            int wavesCompleted, int workers, BuildingId[] ids, int[] levels, bool[] hasWorker)
        {
            var s = new ResortState(t);
            for (int i = 0; i < ids.Length; i++)
                s._buildings.Add(new BuildingState { Id = ids[i], Level = levels[i], HasWorker = hasWorker[i] });
            s.Workers = workers;
            s.Coins = coins;
            s.Energy = energy;
            s.ResortValue = resortValue;
            s.WavesCompleted = wavesCompleted;
            return s;
        }

        public void DebugGrant(int coins, int energy)
        {
            Coins += coins;
            Energy += energy;
        }
    }
}
