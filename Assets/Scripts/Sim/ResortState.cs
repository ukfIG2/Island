using System;
using System.Collections.Generic;

namespace ResortEmpire.Sim
{
    public sealed class BuildingState
    {
        public BuildingId Id;
        public int Level = 1;                                   // 1-based; capacity comes from CapacityPerLevel[Level-1]
        public int WorkerCount { get; internal set; }           // workers standing here; never above the building's slots
        public bool HasWorker => WorkerCount > 0;               // read-only shortcut kept from the prototype
        public bool HasManager { get; internal set; }           // its named Manager is hired (wave buildings only)
        public bool IsWaveBuilding => BuildingNeeds.IsWaveBuilding(Id);
        public NeedId Serves => BuildingNeeds.Serves(Id);       // only meaningful when IsWaveBuilding
    }

    // Persistent state between waves. WaveSimulation mutates it during a wave; VipVisit spends and
    // rewards through it.
    //
    // Worker invariant (hard spec rule, Build §5.3.5): Workers < TotalSlots, always. A new wave building
    // brings exactly one worker (the prototype's "workers = wave buildings - 1" at the start); the Spa
    // brings none; more are hired for Coins up to WorkerCap.
    public sealed class ResortState
    {
        static readonly int SpecialistCount = Enum.GetValues(typeof(SpecialistId)).Length;

        readonly TuningConfig _t;
        readonly List<BuildingState> _buildings = new List<BuildingState>();
        readonly List<string> _decor = new List<string>();
        readonly bool[] _specialists = new bool[SpecialistCount];

        public IReadOnlyList<BuildingState> Buildings => _buildings;
        public int Coins;
        public int Energy;
        public int ResortValue;                                 // status only; only ever grows
        public int WavesCompleted;
        public int Materials;                                   // S8: VIP Fix and Lv4-Lv5 upgrades
        public int Gems;                                        // S9: permanent premium purchases only
        public int Reputation { get; private set; }             // S6: cumulative unlock currency, never decreases, never spent
        public int HiredWorkers { get; private set; }           // workers bought with Coins (drives HireWorkerCost)
        public bool InWave { get; internal set; }               // set by WaveSimulation
        public IReadOnlyList<string> Decor => _decor;

        ResortState(TuningConfig t)
        {
            _t = t ?? throw new ArgumentNullException(nameof(t));
        }

        public static ResortState NewGame(TuningConfig t)
        {
            var s = new ResortState(t);
            s._buildings.Add(new BuildingState { Id = BuildingId.Reception, Level = 1, WorkerCount = 1 });
            s._buildings.Add(new BuildingState { Id = BuildingId.Restaurant, Level = 1, WorkerCount = 1 });
            s._buildings.Add(new BuildingState { Id = BuildingId.BeachBar, Level = 1, WorkerCount = 0 });
            // workers = wave buildings - 1: one building always starts empty
            s.Coins = t.StartingCoins;
            s.Energy = t.StartingEnergy;
            s.Materials = t.StartingMaterials;
            s.Gems = t.StartingGems;
            return s;
        }

        public bool IsUnlocked(BuildingId b) => Get(b) != null;

        public BuildingState Get(BuildingId b)
        {
            for (int i = 0; i < _buildings.Count; i++)
                if (_buildings[i].Id == b) return _buildings[i];
            return null;
        }

        // --- workers and slots ---------------------------------------------------------------

        // Every worker stands on a building, so the pool is the sum of the buildings' workers.
        public int Workers
        {
            get
            {
                int n = 0;
                for (int i = 0; i < _buildings.Count; i++) n += _buildings[i].WorkerCount;
                return n;
            }
        }

        // Worker slots of an unlocked wave building at its level; 0 for the Spa or an absent building.
        public int SlotsOf(BuildingId b)
        {
            var s = Get(b);
            if (s == null || !s.IsWaveBuilding) return 0;
            return LevelValue(_t.WorkerSlotsPerLevel, s.Level);
        }

        public int FreeSlotsOf(BuildingId b)
        {
            var s = Get(b);
            return s == null ? 0 : Math.Max(0, SlotsOf(b) - s.WorkerCount);
        }

        public int TotalSlots
        {
            get
            {
                int n = 0;
                for (int i = 0; i < _buildings.Count; i++) n += SlotsOf(_buildings[i].Id);
                return n;
            }
        }

        // Hiring stops here: floor(WorkerCapRatio x TotalSlots), and always below TotalSlots.
        public int WorkerCap
        {
            get
            {
                int slots = TotalSlots;
                int cap = (int)Math.Floor(_t.WorkerCapRatio * (double)slots + 1e-6);
                return Math.Max(0, Math.Min(cap, slots - 1));
            }
        }

        // Coins for the next hired worker; -1 at the cap (or without MVP hiring). The price grows with
        // every worker already hired; workers that came with a building do not count.
        public int HireWorkerCost()
        {
            if (!_t.MvpSystems || Workers >= WorkerCap) return -1;
            return _t.HireWorkerBaseCost + _t.HireWorkerCostStep * HiredWorkers;
        }

        // Between waves only; the new worker starts on `placeOn`, which needs a free slot.
        public bool HireWorker(BuildingId placeOn)
        {
            if (InWave) return false;
            int cost = HireWorkerCost();
            if (cost < 0 || Coins < cost) return false;
            var s = Get(placeOn);
            if (s == null || FreeSlotsOf(placeOn) <= 0) return false;
            Coins -= cost;
            s.WorkerCount++;
            HiredWorkers++;
            ResortValue += _t.ResortValuePerHire;
            return true;
        }

        // Between-waves variant; during a wave use WaveSimulation.MoveWorker (pause rules live there).
        // Moves ONE worker into a free slot (prototype: from a staffed building to the empty one).
        public bool MoveWorker(BuildingId from, BuildingId to)
        {
            if (InWave) return false;
            return TryMoveWorker(from, to);
        }

        internal bool TryMoveWorker(BuildingId from, BuildingId to)
        {
            if (from == to) return false;
            var f = Get(from);
            var t = Get(to);
            if (f == null || t == null || f.WorkerCount <= 0 || FreeSlotsOf(to) <= 0) return false;
            f.WorkerCount--;
            t.WorkerCount++;
            return true;
        }

        // --- Managers and Specialists (Build §5.3.2) -------------------------------------------------

        public bool HasManager(BuildingId b)
        {
            var s = Get(b);
            return s != null && s.HasManager;
        }

        // Coins for that building's Manager; -1 when the building is absent, is the Spa, already has
        // its Manager, or MVP hiring is off.
        public int ManagerCost(BuildingId b)
        {
            var s = Get(b);
            if (!_t.MvpSystems || s == null || !s.IsWaveBuilding || s.HasManager) return -1;
            return _t.ManagerCostCoins;
        }

        // Between waves only, once per building.
        public bool HireManager(BuildingId b)
        {
            if (InWave) return false;
            int cost = ManagerCost(b);
            if (cost < 0 || Coins < cost) return false;
            Coins -= cost;
            Get(b).HasManager = true;
            ResortValue += _t.ResortValuePerHire;
            return true;
        }

        public bool HasSpecialist(SpecialistId s)
        {
            int i = (int)s;
            return i >= 0 && i < _specialists.Length && _specialists[i];
        }

        // Coins for the Specialist; -1 when already hired or MVP hiring is off.
        public int SpecialistCost(SpecialistId s)
        {
            int i = (int)s;
            if (!_t.MvpSystems || i < 0 || i >= _specialists.Length || _specialists[i]) return -1;
            return _t.SpecialistCostCoins;
        }

        // Between waves only, once per Specialist.
        public bool HireSpecialist(SpecialistId s)
        {
            if (InWave) return false;
            int cost = SpecialistCost(s);
            if (cost < 0 || Coins < cost) return false;
            Coins -= cost;
            _specialists[(int)s] = true;
            ResortValue += _t.ResortValuePerHire;
            return true;
        }

        // --- levels ------------------------------------------------------------------------------

        public int MaxLevel => Math.Max(1, Math.Min(_t.MaxLevel, _t.CapacityPerLevel.Length));

        // Seats of an unlocked wave building at its level; 0 for the Spa or an absent building.
        public int CapacityOf(BuildingId b)
        {
            var s = Get(b);
            if (s == null || !s.IsWaveBuilding) return 0;
            return LevelValue(_t.CapacityPerLevel, s.Level);
        }

        // P9: quality tier of an unlocked wave building (Lv4 = 1, Lv5 = 2); 0 otherwise.
        public int QualityTier(BuildingId b)
        {
            var s = Get(b);
            if (s == null || !s.IsWaveBuilding) return 0;
            return LevelValue(_t.QualityTierPerLevel, s.Level);
        }

        // Coins for the next level; -1 when the building is absent, is the Spa (one level, P3) or is
        // already at MaxLevel.
        public int UpgradeCost(BuildingId b)
        {
            var s = Get(b);
            if (!CanLevelUp(s)) return -1;
            return _t.UpgradeCostCoins[s.Level - 1];
        }

        // Materials for the next level (0 for Lv2 and Lv3); -1 exactly when UpgradeCost is -1.
        public int UpgradeMaterialsCost(BuildingId b)
        {
            var s = Get(b);
            if (!CanLevelUp(s)) return -1;
            int i = s.Level - 1;
            return i < _t.UpgradeCostMaterials.Length ? _t.UpgradeCostMaterials[i] : 0;
        }

        bool CanLevelUp(BuildingState s) =>
            s != null && s.IsWaveBuilding && s.Level < MaxLevel && s.Level - 1 < _t.UpgradeCostCoins.Length;

        public bool CanUpgrade(BuildingId b, out string reason)
        {
            reason = null;
            var s = Get(b);
            if (s == null)
            {
                reason = "Unlock this building first.";
                return false;
            }
            if (UpgradeCost(b) < 0)
            {
                reason = s.IsWaveBuilding ? "Already at the highest level." : "This building has a single level.";
                return false;
            }
            if (InWave)
            {
                reason = "Upgrades are only available between waves."; // WR6
                return false;
            }
            int coins = UpgradeCost(b), materials = UpgradeMaterialsCost(b);
            if (Coins < coins)
            {
                reason = "Needs " + coins + " Coins.";
                return false;
            }
            if (Materials < materials)
            {
                reason = "Needs " + materials + " Materials.";
                return false;
            }
            return true;
        }

        public bool Upgrade(BuildingId b)
        {
            if (!CanUpgrade(b, out _)) return false; // WR6: refused during a wave
            Coins -= UpgradeCost(b);
            Materials -= UpgradeMaterialsCost(b);
            Get(b).Level++;           // seats, slots and quality tier; service speed never changes with level
            ResortValue += _t.ResortValuePerUpgrade; // only ever grows
            return true;
        }

        // --- unlocks: gate (Reputation or waves) makes it available, Coins buy it (S6) -------------

        // Fixed price per unlockable building (Pool, Bungalows, and the Spa with MVP systems); -1 otherwise.
        public int UnlockCost(BuildingId b)
        {
            if (b == BuildingId.Pool) return _t.PoolUnlockCostCoins;
            if (b == BuildingId.Bungalows) return _t.BungalowsUnlockCostCoins;
            if (b == BuildingId.Spa && _t.MvpSystems) return _t.SpaUnlockCostCoins;
            return -1;
        }

        // Reputation threshold of an unlockable building; -1 for buildings that cannot be unlocked.
        public int ReputationGate(BuildingId b)
        {
            if (UnlockCost(b) < 0) return -1;
            if (b == BuildingId.Pool) return _t.PoolReputationGate;
            if (b == BuildingId.Bungalows) return _t.BungalowsReputationGate;
            return _t.SpaReputationGate;
        }

        int EligibleAfterWave(BuildingId b)
        {
            if (b == BuildingId.Pool) return _t.PoolEligibleAfterWave;
            if (b == BuildingId.Bungalows) return _t.BungalowsEligibleAfterWave;
            return _t.SpaEligibleAfterWave;
        }

        bool GateMet(BuildingId b) =>
            _t.UseReputationGates ? Reputation >= ReputationGate(b) : WavesCompleted >= EligibleAfterWave(b);

        // The gate alone: ignores Coins and InWave, so the shop can show what is coming.
        public bool IsEligible(BuildingId b) => UnlockCost(b) >= 0 && !IsUnlocked(b) && GateMet(b);

        public bool CanUnlock(BuildingId b, out string reason)
        {
            reason = null;
            if (UnlockCost(b) < 0)
            {
                reason = "This building cannot be unlocked.";
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
            if (!GateMet(b))
            {
                reason = _t.UseReputationGates
                    ? "Reach " + ReputationGate(b) + " Reputation first."
                    : "Complete wave " + EligibleAfterWave(b) + " first.";
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
            // A new wave building arrives WITH a new worker already assigned (keeps Workers < TotalSlots);
            // the Spa has no slot and brings nobody.
            _buildings.Add(new BuildingState { Id = b, Level = 1, WorkerCount = BuildingNeeds.IsWaveBuilding(b) ? 1 : 0 });
            ResortValue += _t.ResortValuePerUnlock; // only ever grows
            return true;
        }

        // --- currencies, rewards, decor -----------------------------------------------------------

        // Rewards from outside the sim (comeback gift, test ads). Negative amounts are ignored, so
        // Reputation never decreases.
        public void Grant(int coins, int energy, int materials = 0, int reputation = 0, int gems = 0)
        {
            if (coins > 0) Coins += coins;
            if (energy > 0) Energy += energy;
            if (materials > 0) Materials += materials;
            if (gems > 0) Gems += gems;
            AddReputation(reputation);
        }

        internal void AddReputation(int amount)
        {
            if (amount > 0) Reputation += amount;
        }

        // P17: owned decor items (ids from VipCatalog); each adds ResortValuePerDecor once.
        public bool AddDecor(string id)
        {
            if (string.IsNullOrEmpty(id) || _decor.Contains(id)) return false;
            _decor.Add(id);
            ResortValue += _t.ResortValuePerDecor;
            return true;
        }

        public void DebugGrant(int coins, int energy)
        {
            Coins += coins;
            Energy += energy;
        }

        // --- save / restore ---------------------------------------------------------------------

        public ResortSnapshot ToSnapshot()
        {
            int n = _buildings.Count;
            var snap = new ResortSnapshot
            {
                coins = Coins,
                energy = Energy,
                resortValue = ResortValue,
                wavesCompleted = WavesCompleted,
                reputation = Reputation,
                materials = Materials,
                gems = Gems,
                hiredWorkers = HiredWorkers,
                buildingIds = new int[n],
                levels = new int[n],
                workerCounts = new int[n],
                decor = _decor.ToArray()
            };
            var managers = new List<int>();
            for (int i = 0; i < n; i++)
            {
                var b = _buildings[i];
                snap.buildingIds[i] = (int)b.Id;
                snap.levels[i] = b.Level;
                snap.workerCounts[i] = b.WorkerCount;
                if (b.HasManager) managers.Add((int)b.Id);
            }
            snap.managerIds = managers.ToArray();
            var specialists = new List<int>();
            for (int i = 0; i < _specialists.Length; i++)
                if (_specialists[i]) specialists.Add(i);
            snap.specialistIds = specialists.ToArray();
            return snap;
        }

        // Rebuilds a between-waves state verbatim (no costs, no rewards). Throws ArgumentException for
        // a snapshot that breaks the rules (unknown or duplicate building, level or worker count out of
        // range, a Manager on an absent building, Workers not below TotalSlots), so a caller can fall
        // back to a new game.
        public static ResortState FromSnapshot(TuningConfig tuning, ResortSnapshot snapshot)
        {
            if (snapshot == null) throw new ArgumentNullException(nameof(snapshot));
            var s = new ResortState(tuning);
            var ids = snapshot.buildingIds;
            var levels = snapshot.levels;
            var workers = snapshot.workerCounts;
            if (ids == null || levels == null || workers == null || ids.Length == 0
                || ids.Length != levels.Length || ids.Length != workers.Length)
                throw new ArgumentException("Snapshot building arrays are missing or of different lengths.");

            for (int i = 0; i < ids.Length; i++)
            {
                if (!Enum.IsDefined(typeof(BuildingId), ids[i]))
                    throw new ArgumentException("Unknown building id " + ids[i] + ".");
                var id = (BuildingId)ids[i];
                if (s.Get(id) != null) throw new ArgumentException("Duplicate building " + id + ".");
                bool wave = BuildingNeeds.IsWaveBuilding(id);
                int maxLevel = wave ? s.MaxLevel : 1;
                if (levels[i] < 1 || levels[i] > maxLevel)
                    throw new ArgumentException(id + " level " + levels[i] + " is out of range.");
                int slots = wave ? LevelValue(tuning.WorkerSlotsPerLevel, levels[i]) : 0;
                if (workers[i] < 0 || workers[i] > slots)
                    throw new ArgumentException(id + " holds " + workers[i] + " workers for " + slots + " slots.");
                s._buildings.Add(new BuildingState { Id = id, Level = levels[i], WorkerCount = workers[i] });
            }
            if (s.Workers >= s.TotalSlots)
                throw new ArgumentException("Workers must stay below the total worker slots.");

            if (snapshot.managerIds != null)
                foreach (int m in snapshot.managerIds)
                {
                    var b = Enum.IsDefined(typeof(BuildingId), m) ? s.Get((BuildingId)m) : null;
                    if (b == null || !b.IsWaveBuilding)
                        throw new ArgumentException("Manager for building " + m + ", which is absent or has no Manager.");
                    b.HasManager = true;
                }
            if (snapshot.specialistIds != null)
                foreach (int sp in snapshot.specialistIds)
                {
                    if (sp < 0 || sp >= s._specialists.Length)
                        throw new ArgumentException("Unknown specialist id " + sp + ".");
                    s._specialists[sp] = true;
                }
            if (snapshot.decor != null)
                foreach (var d in snapshot.decor)
                    if (!string.IsNullOrEmpty(d) && !s._decor.Contains(d)) s._decor.Add(d);

            s.Coins = snapshot.coins;
            s.Energy = snapshot.energy;
            s.ResortValue = snapshot.resortValue;
            s.WavesCompleted = snapshot.wavesCompleted;
            s.Reputation = Math.Max(0, snapshot.reputation);
            s.Materials = snapshot.materials;
            s.Gems = snapshot.gems;
            s.HiredWorkers = Math.Max(0, snapshot.hiredWorkers);
            return s;
        }

        // LEGACY — the prototype save format (one worker flag per building). Kept so the current
        // SaveSystem keeps loading; new code saves with ToSnapshot/FromSnapshot. Purely constructive:
        // no costs, no gameplay rules; the caller hands in a consistent snapshot. `workers` is implied
        // by `hasWorker` (every worker stands on a building) and only kept for the signature. Currencies
        // the prototype did not have start at their starting values.
        public static ResortState Restore(TuningConfig t, int coins, int energy, int resortValue,
            int wavesCompleted, int workers, BuildingId[] ids, int[] levels, bool[] hasWorker)
        {
            var s = new ResortState(t);
            for (int i = 0; i < ids.Length; i++)
                s._buildings.Add(new BuildingState
                {
                    Id = ids[i],
                    Level = levels[i],
                    WorkerCount = hasWorker[i] && BuildingNeeds.IsWaveBuilding(ids[i]) ? 1 : 0
                });
            s.Coins = coins;
            s.Energy = energy;
            s.ResortValue = resortValue;
            s.WavesCompleted = wavesCompleted;
            s.Materials = t.StartingMaterials;
            s.Gems = t.StartingGems;
            return s;
        }

        // Value of a 1-based per-level table; levels past the table use its last entry.
        static int LevelValue(int[] table, int level)
        {
            if (table == null || table.Length == 0) return 0;
            int i = Math.Max(0, Math.Min(level - 1, table.Length - 1));
            return table[i];
        }
    }
}
