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

        public bool CanUnlock(BuildingId b, out string reason)
        {
            reason = null;
            if (b != BuildingId.Pool && b != BuildingId.Bungalows)
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
            int afterWave = b == BuildingId.Pool ? _t.PoolEligibleAfterWave : _t.BungalowsEligibleAfterWave;
            if (WavesCompleted < afterWave)
            {
                reason = "Complete wave " + afterWave + " first.";
                return false;
            }
            int cost = b == BuildingId.Pool ? _t.PoolUnlockCostCoins : _t.BungalowsUnlockCostCoins;
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
            Coins -= b == BuildingId.Pool ? _t.PoolUnlockCostCoins : _t.BungalowsUnlockCostCoins;
            // A new building arrives WITH a new worker already assigned, keeping the pool at buildings-1.
            _buildings.Add(new BuildingState { Id = b, Level = 1, HasWorker = true });
            Workers++;
            return true;
        }

        public bool Upgrade(BuildingId b)
        {
            if (InWave) return false; // WR6: upgrades only between waves
            var s = Get(b);
            if (s == null || s.Level >= _t.CapacityPerLevel.Length) return false;
            int cost = _t.UpgradeCostCoins[s.Level - 1];
            if (Coins < cost) return false;
            Coins -= cost;
            s.Level++;                // capacity only; service speed never changes with level
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

        // Rebuilds an exact between-waves resort: the tests use it to set up a given resort, and the save
        // system will load through it. Purely constructive — no costs, no gameplay rules; the caller is
        // responsible for handing in a consistent snapshot.
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
