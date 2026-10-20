using System;
using System.Collections.Generic;
using NUnit.Framework;

namespace ResortEmpire.Sim.Tests
{
    public class WaveSimTests
    {
        const int TickGuard = 400000; // safety cap; a stuck wave fails loudly instead of hanging

        static float Dt => SimClock.DefaultStep;

        // --- shared helpers ---------------------------------------------------

        static WaveSimulation RunFullWave(ResortState resort, WaveDef wave, TuningConfig t)
        {
            var sim = new WaveSimulation(resort, wave, t);
            sim.StartWave();
            RunToComplete(sim, "wave " + wave.Index);
            return sim;
        }

        static void RunToComplete(WaveSimulation sim, string context = "")
        {
            for (int i = 0; i < TickGuard && sim.Phase != WavePhase.WaveComplete; i++)
                sim.Tick(Dt);
            Assert.AreEqual(WavePhase.WaveComplete, sim.Phase, context + " never reached WaveComplete");
        }

        static void TickUntilActive(WaveSimulation sim)
        {
            for (int i = 0; i < TickGuard && sim.Phase != WavePhase.WaveActive; i++)
                sim.Tick(Dt);
            Assert.AreEqual(WavePhase.WaveActive, sim.Phase);
        }

        // The worker pool is always wave buildings-1 with one slot each (prototype rules), so a static
        // placement is fully described by the single wave building left empty.
        static void SetEmptyBuilding(ResortState resort, BuildingId empty)
        {
            var e = resort.Get(empty);
            Assert.NotNull(e, empty + " is not unlocked");
            if (!e.HasWorker) return;
            foreach (var b in resort.Buildings)
                if (b.IsWaveBuilding && !b.HasWorker)
                {
                    Assert.IsTrue(resort.MoveWorker(empty, b.Id));
                    return;
                }
            Assert.Fail("no empty building found; pool should be buildings-1");
        }

        static float BestStaticSatisfaction(ResortState resort, WaveDef wave, TuningConfig t)
        {
            var ids = new List<BuildingId>();
            foreach (var b in resort.Buildings)
                if (b.IsWaveBuilding) ids.Add(b.Id);
            float best = -1f;
            foreach (var empty in ids)
            {
                SetEmptyBuilding(resort, empty);
                var sim = RunFullWave(resort, wave, t);
                if (sim.Result.Satisfaction > best) best = sim.Result.Satisfaction;
            }
            return best;
        }

        static BuildingId BuildingFor(NeedId need)
        {
            foreach (BuildingId b in Enum.GetValues(typeof(BuildingId)))
                if (BuildingNeeds.IsWaveBuilding(b) && BuildingNeeds.Serves(b) == need) return b;
            throw new InvalidOperationException("no building serves " + need);
        }

        static void RunToCompleteAt(WaveSimulation sim, float dt, string context)
        {
            for (int i = 0; i < TickGuard && sim.Phase != WavePhase.WaveComplete; i++)
                sim.Tick(dt);
            Assert.AreEqual(WavePhase.WaveComplete, sim.Phase, context + " never reached WaveComplete");
        }

        static WaveDef CraftedWave(int rooms = 0, int drinks = 0, int food = 0, int relax = 0, int oceanView = 0)
        {
            var w = new WaveDef { Index = 1 };
            if (rooms > 0) w.Demand[NeedId.Rooms] = rooms;
            if (drinks > 0) w.Demand[NeedId.Drinks] = drinks;
            if (food > 0) w.Demand[NeedId.Food] = food;
            if (relax > 0) w.Demand[NeedId.Relax] = relax;
            if (oceanView > 0) w.Demand[NeedId.OceanView] = oceanView;
            return w;
        }

        static ResortState NewGameWithEmpty(TuningConfig t, BuildingId empty)
        {
            var resort = ResortState.NewGame(t);
            SetEmptyBuilding(resort, empty);
            return resort;
        }

        // Given buildings at one level, all staffed but `empty`; the pool stays buildings-1.
        static ResortState MakeResort(TuningConfig t, int level, BuildingId empty, params BuildingId[] ids)
        {
            var levels = new int[ids.Length];
            var staffed = new bool[ids.Length];
            for (int i = 0; i < ids.Length; i++)
            {
                levels[i] = level;
                staffed[i] = ids[i] != empty;
            }
            return ResortState.Restore(t, 0, t.StartingEnergy, 0, t.BungalowsEligibleAfterWave + 1,
                ids.Length - 1, ids, levels, staffed);
        }

        // Every BuildingId, the Spa included.
        static BuildingId[] AllBuildings => (BuildingId[])Enum.GetValues(typeof(BuildingId));

        // The five buildings that serve a wave need (everything but the Spa).
        static BuildingId[] WaveBuildings
        {
            get
            {
                var list = new List<BuildingId>();
                foreach (var b in AllBuildings)
                    if (BuildingNeeds.IsWaveBuilding(b)) list.Add(b);
                return list.ToArray();
            }
        }

        static void TickUntilBottleneck(WaveSimulation sim, NeedId need, int minQueue)
        {
            for (int i = 0; i < TickGuard && sim.Phase != WavePhase.WaveComplete; i++)
            {
                sim.Tick(Dt);
                if (sim.StatusOf(need) == NeedStatus.Bottleneck && sim.QueueLength(need) >= minQueue) return;
            }
            Assert.Fail(need + " never reached Bottleneck with a queue of " + minQueue);
        }

        static void TickUntilTime(WaveSimulation sim, float timeInWave)
        {
            for (int i = 0; i < TickGuard && sim.Phase != WavePhase.WaveComplete && sim.TimeInWave < timeInWave; i++)
                sim.Tick(Dt);
            Assert.GreaterOrEqual(sim.TimeInWave, timeInWave);
        }

        static void RecordPhase(List<WavePhase> seen, WavePhase phase)
        {
            if (seen[seen.Count - 1] != phase) seen.Add(phase);
        }

        // Same float expression as the sim: unit k of n spawns at k * T / n.
        static int ScheduledBy(int n, float timer, float timeInWave)
        {
            int count = 0;
            for (int k = 0; k < n; k++)
                if (k * timer / n <= timeInWave) count++;
            return count;
        }

        static int RushScheduledBy(TuningConfig t, float timeInWave)
        {
            int count = 0;
            for (int j = 0; j < t.RushUnits; j++)
                if (t.RushTimeSeconds + j * t.RushDurationSeconds / t.RushUnits <= timeInWave) count++;
            return count;
        }

        static int ExpectedCoins(TuningConfig t, int units, int tier) =>
            (int)Math.Round(units * t.CoinsPerUnit * (double)t.CoinsRatingMult[tier], MidpointRounding.AwayFromZero);

        static int StaffedCount(ResortState resort)
        {
            int n = 0;
            foreach (var b in resort.Buildings)
                if (b.HasWorker) n++;
            return n;
        }

        static void AssertUnlockRefused(ResortState resort, BuildingId b, string why)
        {
            int coins = resort.Coins, workers = resort.Workers, count = resort.Buildings.Count;
            bool wasUnlocked = resort.IsUnlocked(b);
            Assert.IsFalse(resort.CanUnlock(b, out var reason), b + ": " + why);
            Assert.IsNotNull(reason, b + ": a refusal always says why");
            Assert.IsFalse(resort.Unlock(b), b + ": " + why);
            Assert.AreEqual(wasUnlocked, resort.IsUnlocked(b));
            Assert.AreEqual(coins, resort.Coins, b + ": refused unlock must not charge");
            Assert.AreEqual(workers, resort.Workers);
            Assert.AreEqual(count, resort.Buildings.Count);
        }

        static void AssertUnlockPaid(ResortState resort, BuildingId b, int cost)
        {
            int coins = resort.Coins, workers = resort.Workers, staffed = StaffedCount(resort);
            Assert.IsTrue(resort.Unlock(b), b + " should unlock");
            Assert.AreEqual(coins - cost, resort.Coins, b + ": charged exactly the unlock cost");
            Assert.AreEqual(workers + 1, resort.Workers, b + ": exactly one new worker");
            Assert.AreEqual(staffed + 1, StaffedCount(resort), b + ": nobody else was pulled off a building");
            Assert.IsTrue(resort.Get(b).HasWorker, b + " arrives staffed");
            Assert.AreEqual(1, resort.Get(b).Level);
            Assert.AreEqual(resort.Buildings.Count - 1, resort.Workers);
        }

        static void AssertMidTier(TuningConfig t, WaveDef wave, int stars, int coins)
        {
            var resort = ResortState.NewGame(t); // BeachBar empty: Drinks waits
            int coins0 = resort.Coins, energy0 = resort.Energy, value0 = resort.ResortValue;
            var r = RunFullWave(resort, wave, t).Result;
            string ctx = "crafted wave, satisfaction " + r.Satisfaction;

            Assert.AreEqual(stars, r.Stars, ctx);
            Assert.IsFalse(r.Perfect, ctx);
            Assert.GreaterOrEqual(r.Satisfaction, t.RatingThresholds[stars - 1] - 1e-5f, ctx);
            Assert.Less(r.Satisfaction, t.RatingThresholds[stars], ctx);
            Assert.AreEqual(ExpectedCoins(t, r.TotalUnits, stars - 1), r.CoinsEarned, ctx);
            Assert.AreEqual(coins, r.CoinsEarned, ctx);
            Assert.AreEqual(t.EnergyDropByStars[stars - 1], r.EnergyEarned, ctx);
            Assert.AreEqual(stars * t.ResortValuePerStar, r.ResortValueGain, ctx);
            Assert.AreEqual(coins0 + r.CoinsEarned, resort.Coins);
            Assert.AreEqual(energy0 + r.EnergyEarned, resort.Energy);
            Assert.AreEqual(value0 + r.ResortValueGain, resort.ResortValue);
        }

        // --- tests ------------------------------------------------------------

        [Test]
        public void WR3_WaveEndsOnlyWhenQueuesEmpty()
        {
            var t = TuningConfig.Prototype;
            var resort = ResortState.NewGame(t); // BeachBar unstaffed: Drinks backlog outlives the timer
            var wave = WaveTable.Default8()[2];
            var sim = new WaveSimulation(resort, wave, t);
            sim.StartWave();

            int guard = TickGuard;
            while (sim.TimeInWave <= t.WaveTimerSeconds && guard-- > 0) sim.Tick(Dt);
            Assert.Greater(sim.TimeInWave, t.WaveTimerSeconds);

            // wave_timer closed arrivals, never the wave (WR3)
            Assert.IsTrue(sim.ArrivalsClosed);
            Assert.AreEqual(WavePhase.WaveActive, sim.Phase);
            Assert.Greater(sim.QueueLength(NeedId.Drinks), 0);

            RunToComplete(sim);
            Assert.Greater(sim.TimeInWave, t.WaveTimerSeconds);
            foreach (var pair in wave.Demand)
            {
                Assert.AreEqual(pair.Value, sim.DemandTotal(pair.Key));
                Assert.AreEqual(pair.Value, sim.ServedUnits(pair.Key), pair.Key + ": guests never leave mid-wave");
                Assert.AreEqual(0, sim.QueueLength(pair.Key));
                Assert.AreEqual(0, sim.SeatedCount(pair.Key));
            }
        }

        [Test]
        public void WR7_PassiveBestStaticPlacementNeverHitsFiveStars()
        {
            var t = TuningConfig.Prototype;
            var resort = ResortState.NewGame(t);
            float fiveStar = t.RatingThresholds[4];
            float perfect = t.RatingThresholds[5];

            foreach (var wave in WaveTable.Default8())
            {
                if (wave.Index == t.PoolEligibleAfterWave + 1)
                {
                    resort.DebugGrant(t.PoolUnlockCostCoins, 0);
                    Assert.IsTrue(resort.Unlock(BuildingId.Pool));
                }
                if (wave.Index == t.BungalowsEligibleAfterWave + 1)
                {
                    resort.DebugGrant(t.BungalowsUnlockCostCoins, 0);
                    Assert.IsTrue(resort.Unlock(BuildingId.Bungalows));
                }

                float best = BestStaticSatisfaction(resort, wave, t);
                if (wave.Index == 1)
                    Assert.GreaterOrEqual(best, perfect - 1e-4f, "wave 1 is the learning wave: placement alone must reach Perfect");
                else if (!wave.IsDebut) // waves 4 and 7 debut a need and are intentionally soft
                    Assert.Less(best, fiveStar, "wave " + wave.Index + ": a static placement must not reach 5 stars (WR7)");
            }
        }

        [Test]
        public void WR8_FullyUpgradedResortFiveStarsEverywhereWithoutEnergy()
        {
            var t = TuningConfig.Prototype;
            var resort = ResortState.NewGame(t);

            // completing the wave-6 def passes both eligibility gates; the result itself is irrelevant
            RunFullWave(resort, WaveTable.Default8()[5], t);
            resort.DebugGrant(t.PoolUnlockCostCoins + t.BungalowsUnlockCostCoins, 0);
            Assert.IsTrue(resort.Unlock(BuildingId.Pool));
            Assert.IsTrue(resort.Unlock(BuildingId.Bungalows));

            int buildingCount = WaveBuildings.Length;
            Assert.AreEqual(buildingCount - 1, resort.Workers); // pool stays buildings-1, never equal

            resort.DebugGrant(buildingCount * (t.UpgradeCostCoins[0] + t.UpgradeCostCoins[1]), 0);
            foreach (var b in WaveBuildings)
            {
                Assert.IsTrue(resort.Upgrade(b), b + " Lv1->2");
                Assert.IsTrue(resort.Upgrade(b), b + " Lv2->3");
            }

            float fiveStar = t.RatingThresholds[4];
            foreach (var wave in WaveTable.Default8())
            {
                float best = BestStaticSatisfaction(resort, wave, t);
                Assert.GreaterOrEqual(best, fiveStar, "wave " + wave.Index + ": 5 stars must be reachable without boosts (WR8)");
            }
        }

        [Test]
        public void WR1_FloorOrdering()
        {
            var t = TuningConfig.Prototype;
            Assert.Less(t.UnitFloor, t.WaveFloor);                 // WR1: UnitFloor < WaveFloor
            Assert.Less(t.WaveFloor, t.RatingThresholds[2]);       // WaveFloor < 3-star bound

            var resort = ResortState.NewGame(t);
            var wave = new WaveDef { Index = 1 };
            wave.Demand[NeedId.Rooms] = 60; // 3 Lv1 seats vs 60 units: nearly every unit bottoms out
            var sim = RunFullWave(resort, wave, t);

            Assert.AreEqual(t.WaveFloor, sim.Result.Satisfaction, 1e-4f);
            Assert.AreEqual(1, sim.Result.Stars);
            Assert.IsFalse(sim.Result.Perfect);
            Assert.Greater(sim.Result.CoinsEarned, 0); // the worst wave still pays
        }

        [Test]
        public void AC2_MovingWorkerVisiblyHelps()
        {
            var t = TuningConfig.Default;
            var resort = ResortState.NewGame(t); // BeachBar empty: Drinks queue grows
            var wave = WaveTable.Default8()[2];
            var sim = new WaveSimulation(resort, wave, t);
            sim.StartWave();

            var history = new List<KeyValuePair<float, int>>(); // (TimeInWave, drinks queue)
            int guard = TickGuard;
            while (guard-- > 0 && sim.Phase != WavePhase.WaveComplete)
            {
                sim.Tick(Dt);
                history.Add(new KeyValuePair<float, int>(sim.TimeInWave, sim.QueueLength(NeedId.Drinks)));
                if (sim.StatusOf(NeedId.Drinks) == NeedStatus.Bottleneck &&
                    sim.QueueLength(NeedId.Drinks) >= t.BottleneckThresholdUnits + 2)
                    break;
            }
            Assert.AreEqual(NeedStatus.Bottleneck, sim.StatusOf(NeedId.Drinks), "setup never bottlenecked");

            float moveTime = sim.TimeInWave;
            int drinksAtMove = sim.QueueLength(NeedId.Drinks);
            int foodAtMove = sim.QueueLength(NeedId.Food);

            int preWindowQueue = drinksAtMove;
            foreach (var p in history)
                if (p.Key >= moveTime - 20f) { preWindowQueue = p.Value; break; }
            int preDelta = drinksAtMove - preWindowQueue;
            Assert.GreaterOrEqual(preDelta, 0, "queue should not be shrinking before the move");

            Assert.IsTrue(sim.MoveWorker(BuildingId.Restaurant, BuildingId.BeachBar));

            bool sawRecovering = false, calmReached = false, recoveringFirst = false;
            int minDrinks = drinksAtMove, maxFood = foodAtMove;
            guard = TickGuard;
            while (guard-- > 0 && sim.TimeInWave < moveTime + 25f && sim.Phase != WavePhase.WaveComplete)
            {
                sim.Tick(Dt);
                var st = sim.StatusOf(NeedId.Drinks);
                if (!calmReached && st == NeedStatus.Recovering) sawRecovering = true;
                if (!calmReached && (st == NeedStatus.Ok || st == NeedStatus.Satisfied))
                {
                    calmReached = true;
                    recoveringFirst = sawRecovering;
                }
                if (sim.QueueLength(NeedId.Drinks) < minDrinks) minDrinks = sim.QueueLength(NeedId.Drinks);
                if (sim.QueueLength(NeedId.Food) > maxFood) maxFood = sim.QueueLength(NeedId.Food);
            }

            Assert.IsTrue(sawRecovering, "Recovering is the positive signal after the move");
            Assert.IsTrue(calmReached && recoveringFirst, "Recovering must show before the queue is back to Ok/Satisfied");
            int postDelta = sim.QueueLength(NeedId.Drinks) - drinksAtMove;
            Assert.Less(postDelta, preDelta, "target queue must shrink faster than before the move");
            Assert.LessOrEqual(minDrinks, drinksAtMove - 2, "target queue must visibly drain");
            Assert.Greater(maxFood, foodAtMove, "source building queue grows: its utilization dropped");

            RunToComplete(sim);
            foreach (var pair in wave.Demand)
                Assert.AreEqual(pair.Value, sim.ServedUnits(pair.Key));
        }

        [Test]
        public void WR5_MoveIsFreeAndInstant()
        {
            var t = TuningConfig.Prototype;
            var resort = ResortState.NewGame(t);
            var sim = new WaveSimulation(resort, WaveTable.Default8()[0], t);
            sim.StartWave();
            TickUntilActive(sim);

            int coins = resort.Coins;
            int energy = resort.Energy;
            Assert.IsTrue(sim.MoveWorker(BuildingId.Restaurant, BuildingId.BeachBar));
            Assert.AreEqual(coins, resort.Coins);   // free (WR5)
            Assert.AreEqual(energy, resort.Energy);
            Assert.IsFalse(resort.Get(BuildingId.Restaurant).HasWorker); // instant, no confirmation step
            Assert.IsTrue(resort.Get(BuildingId.BeachBar).HasWorker);
            Assert.IsFalse(sim.MoveWorker(BuildingId.Reception, BuildingId.BeachBar)); // target occupied
        }

        [Test]
        public void Pause_FreezesEverything()
        {
            var t = TuningConfig.Default;
            var resort = ResortState.NewGame(t);
            var sim = new WaveSimulation(resort, WaveTable.Default8()[2], t);
            sim.StartWave();

            int guard = TickGuard;
            while (sim.QueueLength(NeedId.Drinks) == 0 && guard-- > 0) sim.Tick(Dt);
            Assert.Greater(sim.QueueLength(NeedId.Drinks), 0);

            Assert.IsTrue(sim.UseEnergyBoost(BuildingId.Reception));
            Assert.Greater(sim.BoostRemaining(BuildingId.Reception), 0f);

            var needs = (NeedId[])Enum.GetValues(typeof(NeedId));
            float time = sim.TimeInWave;
            float boostLeft = sim.BoostRemaining(BuildingId.Reception);
            var phase = sim.Phase;
            int coins = resort.Coins, energy = resort.Energy;
            var arrived = new int[needs.Length];
            var queued = new int[needs.Length];
            var seated = new int[needs.Length];
            var served = new int[needs.Length];
            var status = new NeedStatus[needs.Length];
            for (int i = 0; i < needs.Length; i++)
            {
                arrived[i] = sim.ArrivedUnits(needs[i]);
                queued[i] = sim.QueueLength(needs[i]);
                seated[i] = sim.SeatedCount(needs[i]);
                served[i] = sim.ServedUnits(needs[i]);
                status[i] = sim.StatusOf(needs[i]);
            }

            sim.IsPaused = true;
            Assert.IsFalse(sim.MoveWorker(BuildingId.Restaurant, BuildingId.BeachBar)); // not while paused
            Assert.IsFalse(sim.CanBoost(BuildingId.Restaurant));
            for (int i = 0; i < 2000; i++) sim.Tick(Dt);

            Assert.AreEqual(time, sim.TimeInWave);
            Assert.AreEqual(boostLeft, sim.BoostRemaining(BuildingId.Reception)); // boost timer frozen too
            Assert.AreEqual(phase, sim.Phase);
            Assert.AreEqual(coins, resort.Coins);
            Assert.AreEqual(energy, resort.Energy);
            for (int i = 0; i < needs.Length; i++)
            {
                Assert.AreEqual(arrived[i], sim.ArrivedUnits(needs[i]));
                Assert.AreEqual(queued[i], sim.QueueLength(needs[i]));
                Assert.AreEqual(seated[i], sim.SeatedCount(needs[i]));
                Assert.AreEqual(served[i], sim.ServedUnits(needs[i]));
                Assert.AreEqual(status[i], sim.StatusOf(needs[i]));
            }

            sim.IsPaused = false;
            sim.Tick(Dt);
            Assert.Greater(sim.TimeInWave, time); // resumes exactly where it left
            Assert.Less(sim.BoostRemaining(BuildingId.Reception), boostLeft);
            RunToComplete(sim);
        }

        [Test]
        public void WR9_LockedNeedNeverSpawns()
        {
            var t = TuningConfig.Prototype;
            var resort = ResortState.NewGame(t); // Pool locked
            var wave = WaveTable.Default8()[3];  // wave 4 brings Relax demand
            Assert.IsTrue(wave.Demand.ContainsKey(NeedId.Relax));
            Assert.IsFalse(resort.IsUnlocked(BuildingId.Pool));

            var sim = new WaveSimulation(resort, wave, t);
            Assert.AreEqual(NeedStatus.Locked, sim.StatusOf(NeedId.Relax));
            sim.StartWave();
            RunToComplete(sim);

            Assert.AreEqual(NeedStatus.Locked, sim.StatusOf(NeedId.Relax));
            Assert.AreEqual(0, sim.ArrivedUnits(NeedId.Relax));
            Assert.AreEqual(0, sim.QueueLength(NeedId.Relax));
            Assert.AreEqual(0, sim.ServedUnits(NeedId.Relax));
            // engine contract: the def's number stays visible on the lane, but it never spawns (WR9)
            Assert.AreEqual(wave.Demand[NeedId.Relax], sim.DemandTotal(NeedId.Relax));

            int unlockedUnits = 0;
            foreach (var pair in wave.Demand)
                if (resort.IsUnlocked(BuildingFor(pair.Key))) unlockedUnits += pair.Value;
            Assert.AreEqual(unlockedUnits, sim.Result.TotalUnits); // locked demand never counts
        }

        [Test]
        public void Rush_AddsDemandMidWave()
        {
            var t = TuningConfig.Prototype;
            var wave = WaveTable.Default8()[1];
            Assert.IsTrue(wave.HasSuddenRush);
            var resort = ResortState.NewGame(t); // BeachBar unstaffed -> rush must target Drinks
            int baseRooms = wave.Demand[NeedId.Rooms];
            int baseDrinks = wave.Demand[NeedId.Drinks];
            int baseFood = wave.Demand[NeedId.Food];

            var sim = new WaveSimulation(resort, wave, t);
            sim.StartWave();
            int guard = TickGuard;
            while (sim.TimeInWave < t.RushTimeSeconds - 1f && guard-- > 0) sim.Tick(Dt);
            Assert.AreEqual(baseDrinks, sim.DemandTotal(NeedId.Drinks)); // not yet

            while (sim.TimeInWave < t.RushTimeSeconds + 1f && guard-- > 0) sim.Tick(Dt);
            Assert.AreEqual(baseDrinks + t.RushUnits, sim.DemandTotal(NeedId.Drinks));
            Assert.AreEqual(baseRooms, sim.DemandTotal(NeedId.Rooms));
            Assert.AreEqual(baseFood, sim.DemandTotal(NeedId.Food));

            RunToComplete(sim);
            Assert.AreEqual(baseDrinks + t.RushUnits, sim.ServedUnits(NeedId.Drinks)); // rush guests are real

            // the rush follows whichever unlocked building has no worker at trigger time
            var resort2 = ResortState.NewGame(t);
            Assert.IsTrue(resort2.MoveWorker(BuildingId.Reception, BuildingId.BeachBar)); // Reception now empty
            var wave2 = WaveTable.Default8()[1];
            var sim2 = new WaveSimulation(resort2, wave2, t);
            sim2.StartWave();
            guard = TickGuard;
            while (sim2.TimeInWave < t.RushTimeSeconds + 1f && guard-- > 0) sim2.Tick(Dt);
            Assert.AreEqual(wave2.Demand[NeedId.Rooms] + t.RushUnits, sim2.DemandTotal(NeedId.Rooms));
            Assert.AreEqual(wave2.Demand[NeedId.Drinks], sim2.DemandTotal(NeedId.Drinks));
        }

        [Test]
        public void Rewards_AppliedOnce()
        {
            var t = TuningConfig.Prototype;
            var resort = ResortState.NewGame(t);
            var wave = WaveTable.Default8()[0];
            int coins0 = resort.Coins, energy0 = resort.Energy, value0 = resort.ResortValue;

            var sim = RunFullWave(resort, wave, t);
            var r = sim.Result;
            Assert.NotNull(r);
            Assert.GreaterOrEqual(r.Stars, 1);
            Assert.LessOrEqual(r.Stars, 5);
            Assert.AreEqual(coins0 + r.CoinsEarned, resort.Coins);
            Assert.AreEqual(energy0 + r.EnergyEarned, resort.Energy);
            Assert.AreEqual(value0 + r.ResortValueGain, resort.ResortValue);
            Assert.AreEqual(wave.Index, resort.WavesCompleted);
            Assert.IsFalse(resort.InWave);

            int coins1 = resort.Coins, energy1 = resort.Energy, value1 = resort.ResortValue;
            for (int i = 0; i < 200; i++) sim.Tick(Dt);
            Assert.AreEqual(WavePhase.WaveComplete, sim.Phase);
            Assert.AreSame(r, sim.Result);
            Assert.AreEqual(coins1, resort.Coins);  // exactly once, on entering WaveComplete
            Assert.AreEqual(energy1, resort.Energy);
            Assert.AreEqual(value1, resort.ResortValue);
        }

        [Test]
        public void DtIndependence_SameResultAtAnyStep()
        {
            var t = TuningConfig.Default;
            var table = WaveTable.Default8();
            float[] steps = { 0.01f, 0.05f, 0.1f };

            foreach (int index in new[] { 2, 3, 8 })
            {
                var wave = table[index - 1];
                WaveResult reference = null;
                foreach (float dt in steps)
                {
                    // fixed setups whose results sit well inside a rating band, with real waits
                    var resort = index == 8
                        ? MakeResort(t, 1, BuildingId.BeachBar, WaveBuildings)
                        : NewGameWithEmpty(t, BuildingId.Restaurant);
                    var sim = new WaveSimulation(resort, wave, t);
                    sim.StartWave();
                    string ctx = "wave " + index + " dt=" + dt;
                    RunToCompleteAt(sim, dt, ctx);
                    var r = sim.Result;

                    if (reference == null)
                    {
                        reference = r;
                        Assert.Greater(r.Satisfaction, t.WaveFloor + 0.05f, ctx + ": setup must not sit on the floor");
                        Assert.Less(r.Satisfaction, t.RatingThresholds[5] - 0.05f, ctx + ": setup must involve real waits");
                        continue;
                    }
                    Assert.AreEqual(reference.Stars, r.Stars, ctx);
                    Assert.AreEqual(reference.Perfect, r.Perfect, ctx);
                    Assert.AreEqual(reference.Satisfaction, r.Satisfaction, 0.02f, ctx);
                    Assert.AreEqual(reference.CoinsEarned, r.CoinsEarned, ctx);
                }
            }
        }

        [Test]
        public void EnergyBoost_CostSpeedTimerAndLimits()
        {
            var t = TuningConfig.Default;
            var wave = CraftedWave(rooms: 40); // staffed Reception, 3 seats: the queue never runs dry
            var plainResort = ResortState.NewGame(t);
            var boostResort = ResortState.NewGame(t);
            plainResort.DebugGrant(0, 10); // enough for a second attempt, so a refusal is the per-wave limit
            boostResort.DebugGrant(0, 10);
            var plain = new WaveSimulation(plainResort, wave, t);
            var boosted = new WaveSimulation(boostResort, wave, t);
            plain.StartWave();
            boosted.StartWave();

            for (int i = 0; i < TickGuard && boosted.TimeInWave < 30f; i++)
            {
                plain.Tick(Dt);
                boosted.Tick(Dt);
            }
            Assert.Greater(boosted.QueueLength(NeedId.Rooms), 0, "seats must stay busy through the boost window");
            Assert.AreEqual(plain.ServedUnits(NeedId.Rooms), boosted.ServedUnits(NeedId.Rooms));

            int energy = boostResort.Energy;
            Assert.IsTrue(boosted.CanBoost(BuildingId.Reception));
            Assert.IsTrue(boosted.UseEnergyBoost(BuildingId.Reception));
            Assert.AreEqual(energy - t.EnergyBoostCost, boostResort.Energy, "costs exactly EnergyBoostCost");
            Assert.AreEqual(t.EnergyBoostDurationSeconds, boosted.BoostRemaining(BuildingId.Reception));

            int plainStart = plain.ServedUnits(NeedId.Rooms);
            int boostStart = boosted.ServedUnits(NeedId.Rooms);
            float previous = boosted.BoostRemaining(BuildingId.Reception);
            int ticks = 0;
            while (boosted.BoostRemaining(BuildingId.Reception) > 0f && ticks < TickGuard)
            {
                plain.Tick(Dt);
                boosted.Tick(Dt);
                ticks++;
                float now = boosted.BoostRemaining(BuildingId.Reception);
                Assert.Less(now, previous, "boost timer counts down every unpaused tick");
                Assert.GreaterOrEqual(now, 0f);
                previous = now;
            }
            Assert.AreEqual(0f, boosted.BoostRemaining(BuildingId.Reception));
            Assert.AreEqual(t.EnergyBoostDurationSeconds / Dt, ticks, 1.5, "boost lasts EnergyBoostDurationSeconds");
            Assert.AreEqual(WavePhase.WaveActive, boosted.Phase, "the whole window must fall inside the wave");

            int plainServed = plain.ServedUnits(NeedId.Rooms) - plainStart;
            int boostServed = boosted.ServedUnits(NeedId.Rooms) - boostStart;
            Assert.GreaterOrEqual(boostServed, plainServed + 2,
                "boosted building must serve measurably more over the window (" + boostServed + " vs " + plainServed + ")");

            // one boost per building per wave, even after it ran out and with energy to spare (AC4c)
            energy = boostResort.Energy;
            Assert.GreaterOrEqual(energy, t.EnergyBoostCost);
            Assert.IsFalse(boosted.CanBoost(BuildingId.Reception));
            Assert.IsFalse(boosted.UseEnergyBoost(BuildingId.Reception));
            Assert.AreEqual(energy, boostResort.Energy);
            Assert.AreEqual(0f, boosted.BoostRemaining(BuildingId.Reception));

            // insufficient energy: refused, nothing changes, and the attempt does not use up the building's boost
            boostResort.Energy = t.EnergyBoostCost - 1;
            Assert.IsFalse(boosted.CanBoost(BuildingId.Restaurant));
            Assert.IsFalse(boosted.UseEnergyBoost(BuildingId.Restaurant));
            Assert.AreEqual(t.EnergyBoostCost - 1, boostResort.Energy);
            Assert.AreEqual(0f, boosted.BoostRemaining(BuildingId.Restaurant));
            boostResort.DebugGrant(0, 1);
            Assert.IsTrue(boosted.UseEnergyBoost(BuildingId.Restaurant));
            Assert.AreEqual(0, boostResort.Energy);
        }

        [Test]
        public void Phases_FollowSpecOrder()
        {
            var t = TuningConfig.Default;
            var expected = new[]
            {
                WavePhase.AwaitingWave, WavePhase.WaveIncoming, WavePhase.WaveActive,
                WavePhase.WaveResolving, WavePhase.WaveComplete
            };
            // a table wave, and one so small that nobody is seated any more when arrivals close
            var waves = new[] { WaveTable.Default8()[0], CraftedWave(rooms: 1) };

            foreach (var wave in waves)
            {
                var sim = new WaveSimulation(ResortState.NewGame(t), wave, t);
                var seen = new List<WavePhase> { sim.Phase };
                for (int i = 0; i < 100; i++) sim.Tick(Dt); // nothing moves before StartWave
                RecordPhase(seen, sim.Phase);
                sim.StartWave();
                RecordPhase(seen, sim.Phase);

                int resolvingTicks = 0;
                for (int i = 0; i < TickGuard && sim.Phase != WavePhase.WaveComplete; i++)
                {
                    sim.Tick(Dt);
                    if (sim.Phase == WavePhase.WaveResolving) resolvingTicks++;
                    RecordPhase(seen, sim.Phase);
                }

                string ctx = "seen: " + string.Join(" > ", seen);
                CollectionAssert.AreEqual(expected, seen, ctx);
                Assert.GreaterOrEqual(resolvingTicks, 1, ctx + ": WaveResolving must be observable");
            }
        }

        [Test]
        public void WR6_UpgradeAndUnlockRulesAndCosts()
        {
            var t = TuningConfig.Prototype;

            // refused in every in-wave phase, although eligible and affordable
            var resort = ResortState.NewGame(t);
            resort.WavesCompleted = t.BungalowsEligibleAfterWave;
            resort.DebugGrant(100000, 0);
            var sim = new WaveSimulation(resort, WaveTable.Default8()[0], t);
            sim.StartWave();
            var checkedPhases = new HashSet<WavePhase>();
            for (int i = 0; i < TickGuard && sim.Phase != WavePhase.WaveComplete; i++)
            {
                if (checkedPhases.Add(sim.Phase))
                {
                    Assert.IsTrue(resort.InWave, sim.Phase.ToString());
                    int coins = resort.Coins;
                    Assert.IsFalse(resort.Upgrade(BuildingId.Reception), "upgrade in " + sim.Phase);
                    Assert.AreEqual(1, resort.Get(BuildingId.Reception).Level);
                    Assert.AreEqual(coins, resort.Coins);
                    AssertUnlockRefused(resort, BuildingId.Pool, "unlock in " + sim.Phase);
                    AssertUnlockRefused(resort, BuildingId.Bungalows, "unlock in " + sim.Phase);
                }
                sim.Tick(Dt);
            }
            Assert.IsTrue(checkedPhases.Contains(WavePhase.WaveIncoming));
            Assert.IsTrue(checkedPhases.Contains(WavePhase.WaveActive));
            Assert.IsTrue(checkedPhases.Contains(WavePhase.WaveResolving));
            Assert.AreEqual(WavePhase.WaveComplete, sim.Phase);
            Assert.IsFalse(resort.InWave);
            Assert.IsTrue(resort.Upgrade(BuildingId.Reception), "between waves the same upgrade goes through");

            // eligibility gates
            var early = ResortState.NewGame(t);
            early.DebugGrant(100000, 0);
            early.WavesCompleted = t.PoolEligibleAfterWave - 1;
            AssertUnlockRefused(early, BuildingId.Pool, "before the eligibility wave");
            early.WavesCompleted = t.BungalowsEligibleAfterWave - 1;
            AssertUnlockRefused(early, BuildingId.Bungalows, "before the eligibility wave");

            // eligible, Coins short by one
            var r = ResortState.NewGame(t);
            r.WavesCompleted = t.BungalowsEligibleAfterWave;
            r.Coins = t.PoolUnlockCostCoins - 1;
            AssertUnlockRefused(r, BuildingId.Pool, "Coins short");
            r.Coins = t.BungalowsUnlockCostCoins - 1;
            AssertUnlockRefused(r, BuildingId.Bungalows, "Coins short");

            // exact unlock costs; each unlock brings exactly one worker on the new building
            r.Coins = t.PoolUnlockCostCoins + 7;
            AssertUnlockPaid(r, BuildingId.Pool, t.PoolUnlockCostCoins);
            r.Coins = t.BungalowsUnlockCostCoins + 7;
            AssertUnlockPaid(r, BuildingId.Bungalows, t.BungalowsUnlockCostCoins);
            AssertUnlockRefused(r, BuildingId.Pool, "already unlocked");

            // exact upgrade costs, then the level cap and a short purse refuse without charging
            r.Coins = t.UpgradeCostCoins[0] + t.UpgradeCostCoins[1] + 7;
            var reception = r.Get(BuildingId.Reception);
            for (int level = 1; level < t.MaxLevel; level++)
            {
                int before = r.Coins;
                Assert.IsTrue(r.Upgrade(BuildingId.Reception), "Lv" + level + "->" + (level + 1));
                Assert.AreEqual(level + 1, reception.Level);
                Assert.AreEqual(before - t.UpgradeCostCoins[level - 1], r.Coins, "charged UpgradeCostCoins[level-1]");
            }
            Assert.AreEqual(7, r.Coins);
            Assert.IsFalse(r.Upgrade(BuildingId.Reception), "max level");
            Assert.IsFalse(r.Upgrade(BuildingId.Restaurant), "Coins short");
            Assert.AreEqual(1, r.Get(BuildingId.Restaurant).Level);
            Assert.AreEqual(7, r.Coins);
        }

        [Test]
        public void AC2_RecoveringShowsInSameInteraction()
        {
            var t = TuningConfig.Default;
            int graceTicks = (int)(t.RecoveringGraceSeconds / Dt) - 1; // stay clear of the float boundary

            // wave 3, BeachBar empty: the worker lands on the bottlenecked Drinks
            var sim = new WaveSimulation(ResortState.NewGame(t), WaveTable.Default8()[2], t);
            sim.StartWave();
            TickUntilBottleneck(sim, NeedId.Drinks, t.BottleneckThresholdUnits + 2);
            var foodBefore = sim.StatusOf(NeedId.Food);
            Assert.IsTrue(sim.MoveWorker(BuildingId.Restaurant, BuildingId.BeachBar));
            Assert.AreEqual(NeedStatus.Recovering, sim.StatusOf(NeedId.Drinks), "same interaction (AC2)");
            Assert.AreEqual(foodBefore, sim.StatusOf(NeedId.Food), "the building left behind is not re-rated by the move");
            sim.Tick(Dt);
            Assert.AreEqual(NeedStatus.Recovering, sim.StatusOf(NeedId.Drinks), "tick right after the move");
            for (int i = 1; i < graceTicks && sim.Phase != WavePhase.WaveComplete; i++)
            {
                sim.Tick(Dt);
                Assert.AreNotEqual(NeedStatus.Bottleneck, sim.StatusOf(NeedId.Drinks), "warning back " + (i + 1) + " ticks after help");
            }

            // overloaded Drinks: the queue keeps growing after help (move or boost); the grace holds
            // Recovering, then normal hysteresis takes over again
            foreach (bool viaBoost in new[] { false, true })
            {
                string how = viaBoost ? "boost" : "move";
                var s = new WaveSimulation(ResortState.NewGame(t), CraftedWave(drinks: 60), t);
                s.StartWave();
                TickUntilBottleneck(s, NeedId.Drinks, t.BottleneckThresholdUnits + 2);
                Assert.IsTrue(viaBoost
                    ? s.UseEnergyBoost(BuildingId.BeachBar)
                    : s.MoveWorker(BuildingId.Restaurant, BuildingId.BeachBar), how);
                Assert.AreEqual(NeedStatus.Recovering, s.StatusOf(NeedId.Drinks), how + ": same interaction (AC2)");

                int queueAtHelp = s.QueueLength(NeedId.Drinks);
                for (int i = 0; i < graceTicks; i++)
                {
                    s.Tick(Dt);
                    Assert.AreEqual(NeedStatus.Recovering, s.StatusOf(NeedId.Drinks), how + ": tick " + (i + 1) + " inside the help grace");
                }
                Assert.Greater(s.QueueLength(NeedId.Drinks), queueAtHelp, how + ": setup must keep the queue growing");

                bool warnedAgain = false;
                int limit = (int)((t.BottleneckHysteresisSeconds + 2f) / Dt);
                for (int i = 0; i < limit && !warnedAgain; i++)
                {
                    s.Tick(Dt);
                    warnedAgain = s.StatusOf(NeedId.Drinks) == NeedStatus.Bottleneck;
                }
                Assert.IsTrue(warnedAgain, how + ": after the grace a still-growing queue warns again");
            }
        }

        [Test]
        public void Rewards_MathPinnedToThresholds()
        {
            var t = TuningConfig.Prototype;

            // wave 1, Restaurant empty: 6 Food units 15 s apart never outrun 3 slow seats (~36 s each) -> Perfect
            var resort = NewGameWithEmpty(t, BuildingId.Restaurant);
            var wave = WaveTable.Default8()[0];
            var r = RunFullWave(resort, wave, t).Result;
            int units = 0;
            foreach (var pair in wave.Demand) units += pair.Value;

            Assert.IsTrue(r.Perfect);
            Assert.AreEqual(5, r.Stars);
            Assert.AreEqual(units, r.TotalUnits);
            Assert.AreEqual(ExpectedCoins(t, units, t.CoinsRatingMult.Length - 1), r.CoinsEarned);
            Assert.AreEqual(458, r.CoinsEarned); // 22 * 16 * 1.3 = 457.6 rounds, never truncates
            Assert.AreEqual(t.EnergyDropByStars[4], r.EnergyEarned);
            Assert.AreEqual(5 * t.ResortValuePerStar, r.ResortValueGain);

            AssertMidTier(t, CraftedWave(drinks: 12), 2, 115);           // 12 * 16 * 0.6 = 115.2
            AssertMidTier(t, CraftedWave(rooms: 8, drinks: 12), 3, 256); // 20 * 16 * 0.8
            AssertMidTier(t, CraftedWave(drinks: 10), 4, 160);           // 10 * 16 * 1.0
        }

        [Test]
        public void OceanView_WaitsWeighHeavier()
        {
            var t = TuningConfig.Default;
            const int rooms = 8, starved = 16;
            // twins: the same starved lane (Lv1, no worker), once as Ocean View, once as the volume need Drinks
            var oceanResort = MakeResort(t, 1, BuildingId.Bungalows, BuildingId.Reception, BuildingId.BeachBar, BuildingId.Bungalows);
            var volumeResort = MakeResort(t, 1, BuildingId.BeachBar, BuildingId.Reception, BuildingId.BeachBar, BuildingId.Bungalows);
            var ocean = RunFullWave(oceanResort, CraftedWave(rooms: rooms, oceanView: starved), t).Result;
            var volume = RunFullWave(volumeResort, CraftedWave(rooms: rooms, drinks: starved), t).Result;

            Assert.AreEqual(volume.AverageWaitByNeed[NeedId.Drinks], ocean.AverageWaitByNeed[NeedId.OceanView], 1e-4f,
                "twins must see identical waits");
            Assert.Greater(volume.AverageWaitByNeed[NeedId.Drinks], t.PatienceGraceSeconds, "the starved need must lose satisfaction");
            Assert.Less(ocean.AverageWaitByNeed[NeedId.Rooms] * rooms, t.PatienceGraceSeconds, "every Rooms unit counts 100 %");
            Assert.Greater(ocean.Satisfaction, t.WaveFloor, "the wave floor would hide the weight");
            Assert.Greater(volume.Satisfaction, t.WaveFloor, "the wave floor would hide the weight");

            Assert.Less(ocean.Satisfaction, volume.Satisfaction, "Ocean View waits must hurt more");

            // exact: take the starved lane's contribution sum from the volume twin and reweigh it
            float contribution = volume.Satisfaction * (rooms + starved) - rooms;
            float w = t.OceanViewSatisfactionWeight;
            float expected = (w * contribution + rooms) / (w * starved + rooms);
            Assert.AreEqual(expected, ocean.Satisfaction, 1e-3f);
        }

        [Test]
        public void Arrivals_FollowFixedSchedule()
        {
            var t = TuningConfig.Default;
            var wave = WaveTable.Default8()[2];
            var sim = new WaveSimulation(ResortState.NewGame(t), wave, t);
            sim.StartWave();
            foreach (float probe in new[] { 10f, 30f, 47.3f, 60f, 75f })
            {
                TickUntilTime(sim, probe);
                foreach (var pair in wave.Demand)
                {
                    int expected = ScheduledBy(pair.Value, t.WaveTimerSeconds, sim.TimeInWave);
                    Assert.Less(expected, pair.Value, "probe must be mid-wave");
                    Assert.AreEqual(expected, sim.ArrivedUnits(pair.Key), 1, pair.Key + " at " + sim.TimeInWave + " s");
                }
            }

            // rush: lockstep against the same wave without the rush; the difference is the rush alone
            var rushWave = WaveTable.Default8()[1];
            var calmWave = new WaveDef { Index = rushWave.Index, HasSuddenRush = false };
            foreach (var pair in rushWave.Demand) calmWave.Demand[pair.Key] = pair.Value;
            var rush = new WaveSimulation(ResortState.NewGame(t), rushWave, t); // BeachBar empty -> Drinks
            var calm = new WaveSimulation(ResortState.NewGame(t), calmWave, t);
            rush.StartWave();
            calm.StartWave();

            float first = -1f, last = -1f;
            int previous = 0;
            for (int i = 0; i < TickGuard && rush.TimeInWave < t.RushTimeSeconds + t.RushDurationSeconds + 1f; i++)
            {
                rush.Tick(Dt);
                calm.Tick(Dt);
                int extra = rush.ArrivedUnits(NeedId.Drinks) - calm.ArrivedUnits(NeedId.Drinks);
                Assert.LessOrEqual(extra - previous, 1, "rush units arrive one at a time, at " + rush.TimeInWave);
                Assert.AreEqual(RushScheduledBy(t, rush.TimeInWave), extra, 1, "rush schedule at " + rush.TimeInWave);
                if (extra > previous)
                {
                    if (first < 0f) first = rush.TimeInWave;
                    last = rush.TimeInWave;
                }
                previous = extra;
            }
            Assert.AreEqual(t.RushUnits, previous);
            Assert.GreaterOrEqual(first, t.RushTimeSeconds);
            Assert.AreEqual(t.RushDurationSeconds * (t.RushUnits - 1) / t.RushUnits, last - first, 2 * Dt,
                "rush spreads over RushDurationSeconds instead of landing at once");
        }

        [Test]
        public void Moves_AllowedOutsideActiveRefusedWhilePaused()
        {
            var t = TuningConfig.Default;
            var resort = ResortState.NewGame(t);
            var sim = new WaveSimulation(resort, WaveTable.Default8()[0], t);
            var restaurant = resort.Get(BuildingId.Restaurant);
            var beachBar = resort.Get(BuildingId.BeachBar);

            // AwaitingWave
            sim.IsPaused = true;
            Assert.IsFalse(sim.MoveWorker(BuildingId.Restaurant, BuildingId.BeachBar), "paused in AwaitingWave");
            Assert.IsTrue(restaurant.HasWorker);
            Assert.IsFalse(beachBar.HasWorker);
            sim.IsPaused = false;
            Assert.AreEqual(WavePhase.AwaitingWave, sim.Phase);
            Assert.IsTrue(sim.MoveWorker(BuildingId.Restaurant, BuildingId.BeachBar), "AwaitingWave");
            Assert.IsFalse(restaurant.HasWorker);
            Assert.IsTrue(beachBar.HasWorker);

            sim.StartWave();
            Assert.IsTrue(beachBar.HasWorker, "AC4d: the wave starts with the placement made before it");

            // WaveResolving: arrivals closed, moves keep working (AC4)
            for (int i = 0; i < TickGuard && sim.Phase != WavePhase.WaveResolving && sim.Phase != WavePhase.WaveComplete; i++)
                sim.Tick(Dt);
            Assert.AreEqual(WavePhase.WaveResolving, sim.Phase);
            sim.IsPaused = true;
            Assert.IsFalse(sim.MoveWorker(BuildingId.BeachBar, BuildingId.Restaurant), "paused in WaveResolving");
            Assert.IsTrue(beachBar.HasWorker);
            Assert.IsFalse(restaurant.HasWorker);
            sim.IsPaused = false;
            Assert.IsTrue(sim.MoveWorker(BuildingId.BeachBar, BuildingId.Restaurant), "WaveResolving");
            Assert.IsFalse(beachBar.HasWorker);
            Assert.IsTrue(restaurant.HasWorker);

            RunToComplete(sim);
            Assert.IsFalse(sim.MoveWorker(BuildingId.Restaurant, BuildingId.BeachBar), "a finished wave takes no moves");
        }

        [Test]
        public void Needs_SatisfiedAtEndAndWorstNeedIsTheStarvedOne()
        {
            var t = TuningConfig.Default;
            var wave = CraftedWave(rooms: 10, drinks: 30, food: 10); // BeachBar empty: only Drinks starves
            var sim = new WaveSimulation(ResortState.NewGame(t), wave, t);
            sim.StartWave();

            var needs = (NeedId[])Enum.GetValues(typeof(NeedId));
            var bottleneckSeconds = new float[needs.Length];
            for (int i = 0; i < TickGuard && sim.Phase != WavePhase.WaveComplete; i++)
            {
                sim.Tick(Dt);
                foreach (var n in needs)
                    if (sim.StatusOf(n) == NeedStatus.Bottleneck) bottleneckSeconds[(int)n] += Dt;
            }
            Assert.AreEqual(WavePhase.WaveComplete, sim.Phase);
            var r = sim.Result;

            foreach (var n in needs)
                Assert.AreEqual(wave.Demand.ContainsKey(n) ? NeedStatus.Satisfied : NeedStatus.Locked, sim.StatusOf(n), n.ToString());

            Assert.IsTrue(r.WorstNeed.HasValue, "a wave with a bottleneck names the upgrade hint (AC6)");
            var worst = r.WorstNeed.Value;
            Assert.Greater(bottleneckSeconds[(int)worst], 0f, "WorstNeed must have actually bottlenecked");
            foreach (var n in needs)
                Assert.LessOrEqual(bottleneckSeconds[(int)n], bottleneckSeconds[(int)worst] + Dt, n + " bottlenecked longer than WorstNeed");
            Assert.AreEqual(NeedId.Drinks, worst);

            Assert.AreEqual(wave.Demand.Count, r.AverageWaitByNeed.Count);
            foreach (var pair in r.AverageWaitByNeed)
                Assert.GreaterOrEqual(pair.Value, 0f, pair.Key.ToString());
            Assert.Greater(r.AverageWaitByNeed[NeedId.Drinks], r.AverageWaitByNeed[NeedId.Rooms]);
            Assert.Greater(r.AverageWaitByNeed[NeedId.Drinks], r.AverageWaitByNeed[NeedId.Food]);

            // no bottleneck at all -> no hint
            var calm = RunFullWave(ResortState.NewGame(t), WaveTable.Default8()[0], t).Result;
            Assert.IsFalse(calm.WorstNeed.HasValue);
        }

        [Test]
        public void StartWave_ReadsBuildingsAtStartAndIgnoresPause()
        {
            var t = TuningConfig.Prototype;
            var resort = ResortState.NewGame(t);
            resort.WavesCompleted = t.PoolEligibleAfterWave;
            resort.DebugGrant(t.PoolUnlockCostCoins, 0);
            var wave = WaveTable.Default8()[3]; // brings Relax
            var sim = new WaveSimulation(resort, wave, t);
            Assert.AreEqual(NeedStatus.Locked, sim.StatusOf(NeedId.Relax));

            Assert.IsTrue(resort.Unlock(BuildingId.Pool)); // still AwaitingWave: the shop is open

            sim.IsPaused = true;
            sim.StartWave();
            Assert.AreEqual(WavePhase.AwaitingWave, sim.Phase, "pause freezes the start too");
            Assert.IsFalse(resort.InWave);

            sim.IsPaused = false;
            sim.StartWave();
            Assert.AreEqual(WavePhase.WaveIncoming, sim.Phase);
            Assert.IsTrue(resort.InWave);
            Assert.AreEqual(NeedStatus.Ok, sim.StatusOf(NeedId.Relax), "unlocked before the start, so not Locked");

            RunToComplete(sim);
            Assert.AreEqual(wave.Demand[NeedId.Relax], sim.ServedUnits(NeedId.Relax));
            int units = 0;
            foreach (var pair in wave.Demand) units += pair.Value;
            Assert.AreEqual(units, sim.Result.TotalUnits);
        }

        [Test]
        public void WorstNeedCause_EmptyBuildingIsStaffingTooSmallIsCapacity()
        {
            var t = TuningConfig.Default;

            // BeachBar empty the whole wave: Drinks starves because nobody works there
            var empty = ResortState.NewGame(t);
            var r = RunFullWave(empty, CraftedWave(rooms: 10, drinks: 30, food: 10), t).Result;
            Assert.IsFalse(empty.Get(BuildingId.BeachBar).HasWorker);
            Assert.AreEqual(NeedId.Drinks, r.WorstNeed);
            Assert.AreEqual(BottleneckCause.Staffing, r.WorstNeedCause, "empty building -> staffing (AC2d)");

            // staffed Reception, 3 Lv1 seats vs 60 units: simply too small; the empty BeachBar
            // elsewhere must not leak into the answer
            var small = ResortState.NewGame(t);
            r = RunFullWave(small, CraftedWave(rooms: 60), t).Result;
            Assert.IsTrue(small.Get(BuildingId.Reception).HasWorker);
            Assert.AreEqual(NeedId.Rooms, r.WorstNeed);
            Assert.AreEqual(BottleneckCause.Capacity, r.WorstNeedCause, "staffed but too small -> capacity (AC2d)");

            // no bottleneck: no hint, no cause
            r = RunFullWave(ResortState.NewGame(t), WaveTable.Default8()[0], t).Result;
            Assert.IsFalse(r.WorstNeed.HasValue);
            Assert.AreEqual(BottleneckCause.None, r.WorstNeedCause);
        }

        [Test]
        public void WorstNeedCause_FollowsTheUnstaffedShareOfBottleneckTime()
        {
            var t = TuningConfig.Default;
            var wave = CraftedWave(drinks: 60); // more than even a staffed Lv1 BeachBar keeps up with
            const float moveAfter = 5f;         // Bottleneck seconds before the worker arrives

            foreach (bool move in new[] { false, true })
            {
                string how = move ? "moved in" : "never staffed";
                var resort = ResortState.NewGame(t); // BeachBar empty
                var beachBar = resort.Get(BuildingId.BeachBar);
                var sim = new WaveSimulation(resort, wave, t);
                sim.StartWave();

                // mirror the sim's bookkeeping: status and worker as they stand at the end of each tick
                float total = 0f, unstaffed = 0f;
                bool moved = false;
                for (int i = 0; i < TickGuard && sim.Phase != WavePhase.WaveComplete; i++)
                {
                    sim.Tick(Dt);
                    if (sim.StatusOf(NeedId.Drinks) != NeedStatus.Bottleneck) continue;
                    total += Dt;
                    if (!beachBar.HasWorker) unstaffed += Dt;
                    if (move && !moved && total >= moveAfter)
                        moved = sim.MoveWorker(BuildingId.Restaurant, BuildingId.BeachBar);
                }
                Assert.AreEqual(WavePhase.WaveComplete, sim.Phase, how);
                var r = sim.Result;
                Assert.AreEqual(NeedId.Drinks, r.WorstNeed, how);
                Assert.Greater(unstaffed, 0f, how + ": Drinks bottlenecked while the BeachBar was empty");

                if (move)
                {
                    Assert.IsTrue(moved, how);
                    Assert.Less(unstaffed * 2f, total, how + ": setup must be staffed for most of the Bottleneck time");
                    Assert.AreEqual(BottleneckCause.Capacity, r.WorstNeedCause, how + ": the worker came, the queue stayed -> too small");
                }
                else
                {
                    Assert.AreEqual(total, unstaffed, 1e-3f, how);
                    Assert.AreEqual(BottleneckCause.Staffing, r.WorstNeedCause, how);
                }
            }
        }

        [Test]
        public void Rush_ObservableFromTheTriggerTickOn()
        {
            var t = TuningConfig.Prototype;
            var wave = WaveTable.Default8()[t.RushWaveIndex - 1];
            Assert.IsTrue(wave.HasSuddenRush);

            // the rush lands on whichever building is empty at trigger time
            foreach (var empty in new[] { BuildingId.BeachBar, BuildingId.Reception })
            {
                var target = BuildingNeeds.Serves(empty);
                var sim = new WaveSimulation(NewGameWithEmpty(t, empty), wave, t);
                Assert.IsFalse(sim.RushFired, empty + ": AwaitingWave");
                Assert.IsNull(sim.RushNeed, empty + ": AwaitingWave");
                sim.StartWave();

                int before = 0, after = 0;
                for (int i = 0; i < TickGuard && sim.TimeInWave < t.RushTimeSeconds + 1f; i++)
                {
                    sim.Tick(Dt);
                    string ctx = empty + " at " + sim.TimeInWave + " s";
                    bool due = sim.TimeInWave >= t.RushTimeSeconds;
                    Assert.AreEqual(due, sim.RushFired, ctx);
                    if (due) Assert.AreEqual(target, sim.RushNeed, ctx);
                    else Assert.IsNull(sim.RushNeed, ctx);
                    Assert.AreEqual(wave.Demand[target] + (due ? t.RushUnits : 0), sim.DemandTotal(target),
                        ctx + ": the flag and the demand move together");
                    if (due) after++; else before++;
                }
                Assert.Greater(before, 0, empty.ToString());
                Assert.Greater(after, 0, empty.ToString());

                RunToComplete(sim);
                Assert.IsTrue(sim.RushFired, empty + ": stays fired through WaveComplete");
                Assert.AreEqual(target, sim.RushNeed, empty.ToString());
            }

            // a wave without the rush never fires, even well past the trigger time: wave 2's calm twin and wave 3
            var calmTwin = new WaveDef { Index = wave.Index, HasSuddenRush = false };
            foreach (var pair in wave.Demand) calmTwin.Demand[pair.Key] = pair.Value;
            foreach (var calm in new[] { calmTwin, WaveTable.Default8()[2] })
            {
                var sim = new WaveSimulation(ResortState.NewGame(t), calm, t);
                sim.StartWave();
                for (int i = 0; i < TickGuard && sim.Phase != WavePhase.WaveComplete; i++)
                {
                    sim.Tick(Dt);
                    if (sim.RushFired || sim.RushNeed.HasValue)
                        Assert.Fail("wave " + calm.Index + " fired a rush at " + sim.TimeInWave + " s");
                }
                Assert.AreEqual(WavePhase.WaveComplete, sim.Phase);
                Assert.Greater(sim.TimeInWave, t.RushTimeSeconds);
                Assert.IsFalse(sim.RushFired);
                Assert.IsNull(sim.RushNeed);
            }
        }

        [Test]
        public void Rush_PausedAcrossTheTriggerTimeDoesNotFire()
        {
            var t = TuningConfig.Prototype;
            var resort = ResortState.NewGame(t); // BeachBar empty -> Drinks
            var sim = new WaveSimulation(resort, WaveTable.Default8()[t.RushWaveIndex - 1], t);
            sim.StartWave();
            TickUntilTime(sim, t.RushTimeSeconds - 1f);
            Assert.IsFalse(sim.RushFired);
            float time = sim.TimeInWave;
            int drinks = sim.DemandTotal(NeedId.Drinks);

            sim.IsPaused = true;
            int pausedTicks = (int)(2f * t.RushTimeSeconds / Dt); // far more wall time than the second left
            for (int i = 0; i < pausedTicks; i++) sim.Tick(Dt);
            Assert.AreEqual(time, sim.TimeInWave);
            Assert.IsFalse(sim.RushFired, "paused across the trigger time");
            Assert.IsNull(sim.RushNeed);
            Assert.AreEqual(drinks, sim.DemandTotal(NeedId.Drinks));

            sim.IsPaused = false;
            TickUntilTime(sim, t.RushTimeSeconds);
            Assert.IsTrue(sim.RushFired, "fires once the unpaused clock reaches the trigger time");
            Assert.AreEqual(NeedId.Drinks, sim.RushNeed);
            Assert.AreEqual(drinks + t.RushUnits, sim.DemandTotal(NeedId.Drinks));
        }

        [Test]
        public void ResortValue_UpgradesAndUnlocksAddExactlyTheirTuning()
        {
            var t = TuningConfig.Prototype;
            Assert.Greater(t.ResortValuePerUpgrade, 0, "Resort Value only ever grows");
            Assert.Greater(t.ResortValuePerUnlock, 0, "Resort Value only ever grows");

            var r = ResortState.NewGame(t);
            int value = r.ResortValue;

            r.Coins = t.UpgradeCostCoins[0] - 1;
            Assert.IsFalse(r.Upgrade(BuildingId.Reception), "Coins short");
            r.Coins = 100000;
            Assert.IsFalse(r.Upgrade(BuildingId.Pool), "absent building");
            Assert.IsFalse(r.Unlock(BuildingId.Pool), "before the gate");
            Assert.IsFalse(r.Unlock(BuildingId.Reception), "not unlockable");
            Assert.AreEqual(value, r.ResortValue, "refusals add nothing");

            for (int level = 1; level < t.MaxLevel; level++)
            {
                Assert.IsTrue(r.Upgrade(BuildingId.Reception), "Lv" + level + "->" + (level + 1));
                Assert.AreEqual(value + t.ResortValuePerUpgrade, r.ResortValue, "Lv" + level + "->" + (level + 1));
                value = r.ResortValue;
            }
            Assert.IsFalse(r.Upgrade(BuildingId.Reception), "max level");
            Assert.AreEqual(value, r.ResortValue, "a refused upgrade adds nothing");

            r.WavesCompleted = t.BungalowsEligibleAfterWave;
            foreach (var b in new[] { BuildingId.Pool, BuildingId.Bungalows })
            {
                Assert.IsTrue(r.Unlock(b), b.ToString());
                Assert.AreEqual(value + t.ResortValuePerUnlock, r.ResortValue, b + " unlock");
                value = r.ResortValue;
                Assert.IsFalse(r.Unlock(b), b + " already unlocked");
                Assert.AreEqual(value, r.ResortValue, b + ": a refused unlock adds nothing");
            }

            // in a wave both are refused and add nothing (WR6)
            var w = ResortState.NewGame(t);
            w.WavesCompleted = t.BungalowsEligibleAfterWave;
            w.DebugGrant(100000, 0);
            int inWaveValue = w.ResortValue;
            var sim = new WaveSimulation(w, WaveTable.Default8()[0], t);
            sim.StartWave();
            Assert.IsFalse(w.Upgrade(BuildingId.Reception), "upgrade in a wave");
            Assert.IsFalse(w.Unlock(BuildingId.Pool), "unlock in a wave");
            Assert.AreEqual(inWaveValue, w.ResortValue, "in-wave refusals add nothing");
        }

        [Test]
        public void ResortValue_NeverDecreasesOverFullRunWithUpgrades()
        {
            var t = TuningConfig.Prototype;
            var resort = ResortState.NewGame(t);
            int expected = resort.ResortValue, previous = resort.ResortValue;
            int upgrades = 0, unlocks = 0;

            foreach (var wave in WaveTable.Default8())
            {
                // between waves: unlock what the gate allows (Coins granted, as in WR7), then buy
                // every upgrade the earned Coins cover
                foreach (var b in new[] { BuildingId.Pool, BuildingId.Bungalows })
                    if (resort.IsEligible(b))
                    {
                        resort.DebugGrant(resort.UnlockCost(b), 0);
                        Assert.IsTrue(resort.Unlock(b), b.ToString());
                        expected += t.ResortValuePerUnlock;
                        unlocks++;
                    }
                foreach (var b in WaveBuildings)
                    while (resort.UpgradeCost(b) >= 0 && resort.Coins >= resort.UpgradeCost(b))
                    {
                        Assert.IsTrue(resort.Upgrade(b), b.ToString());
                        expected += t.ResortValuePerUpgrade;
                        upgrades++;
                    }
                Assert.GreaterOrEqual(resort.ResortValue, previous, "before wave " + wave.Index);
                Assert.AreEqual(expected, resort.ResortValue, "before wave " + wave.Index);
                previous = resort.ResortValue;

                var sim = new WaveSimulation(resort, wave, t);
                sim.StartWave();
                for (int i = 0; i < TickGuard && sim.Phase != WavePhase.WaveComplete; i++)
                {
                    sim.Tick(Dt);
                    if (resort.ResortValue < previous)
                        Assert.Fail("Resort Value dropped in wave " + wave.Index + " at " + sim.TimeInWave + " s");
                    previous = resort.ResortValue;
                }
                Assert.AreEqual(WavePhase.WaveComplete, sim.Phase, "wave " + wave.Index);
                Assert.Greater(sim.Result.ResortValueGain, 0, "every wave adds Resort Value");
                expected += sim.Result.ResortValueGain;
                Assert.AreEqual(expected, resort.ResortValue, "after wave " + wave.Index);
            }
            Assert.AreEqual(2, unlocks);
            Assert.Greater(upgrades, 0, "the run must actually buy upgrades");
        }

        [Test]
        public void UpgradeCost_NextLevelPriceOrMinusOne()
        {
            var t = TuningConfig.Prototype;
            var r = ResortState.NewGame(t);
            r.Coins = 0;
            Assert.AreEqual(t.UpgradeCostCoins[0], r.UpgradeCost(BuildingId.Reception), "Lv1, quoted even when unaffordable");
            Assert.AreEqual(-1, r.UpgradeCost(BuildingId.Pool), "absent building");
            Assert.AreEqual(-1, r.UpgradeCost(BuildingId.Bungalows), "absent building");

            // Lv1 then Lv2: each quote is exactly what Upgrade then charges
            r.Coins = 100000;
            var reception = r.Get(BuildingId.Reception);
            for (int level = 1; level < t.MaxLevel; level++)
            {
                Assert.AreEqual(level, reception.Level);
                int cost = r.UpgradeCost(BuildingId.Reception);
                Assert.AreEqual(t.UpgradeCostCoins[level - 1], cost, "Lv" + level);
                int before = r.Coins;
                Assert.IsTrue(r.Upgrade(BuildingId.Reception));
                Assert.AreEqual(before - cost, r.Coins, "Lv" + level + ": charged the quote");
            }
            Assert.AreEqual(-1, r.UpgradeCost(BuildingId.Reception), "max level");
            Assert.AreEqual(t.UpgradeCostCoins[0], r.UpgradeCost(BuildingId.Restaurant), "other buildings keep their own level");

            // a fresh unlock starts at the Lv1 price; a restored max-level resort quotes nothing
            r.WavesCompleted = t.PoolEligibleAfterWave;
            Assert.IsTrue(r.Unlock(BuildingId.Pool));
            Assert.AreEqual(t.UpgradeCostCoins[0], r.UpgradeCost(BuildingId.Pool));
            var maxed = MakeResort(t, t.MaxLevel, BuildingId.BeachBar, WaveBuildings);
            foreach (var b in AllBuildings) // the Spa too: absent, so no quote
                Assert.AreEqual(-1, maxed.UpgradeCost(b), b + " at max level");
        }

        [Test]
        public void UnlockCostAndIsEligible_FollowTheWaveGate()
        {
            var t = TuningConfig.Prototype;
            var r = ResortState.NewGame(t);
            Assert.AreEqual(t.PoolUnlockCostCoins, r.UnlockCost(BuildingId.Pool));
            Assert.AreEqual(t.BungalowsUnlockCostCoins, r.UnlockCost(BuildingId.Bungalows));
            foreach (var b in new[] { BuildingId.Reception, BuildingId.Restaurant, BuildingId.BeachBar })
            {
                Assert.AreEqual(-1, r.UnlockCost(b), b + " is not unlockable");
                Assert.IsFalse(r.IsEligible(b), b + " is not unlockable");
            }
            var partial = MakeResort(t, 1, BuildingId.BeachBar, BuildingId.Reception, BuildingId.BeachBar);
            Assert.IsFalse(partial.IsEligible(BuildingId.Restaurant), "absent, but still not an unlockable building");

            // the gate alone decides, Coins do not; between waves CanUnlock == eligible && affordable
            foreach (int coins in new[] { 0, t.PoolUnlockCostCoins, t.BungalowsUnlockCostCoins })
                for (int waves = 0; waves <= t.BungalowsEligibleAfterWave + 1; waves++)
                {
                    r.Coins = coins;
                    r.WavesCompleted = waves;
                    string ctx = waves + " waves, " + coins + " Coins";
                    Assert.AreEqual(waves >= t.PoolEligibleAfterWave, r.IsEligible(BuildingId.Pool), "Pool, " + ctx);
                    Assert.AreEqual(waves >= t.BungalowsEligibleAfterWave, r.IsEligible(BuildingId.Bungalows), "Bungalows, " + ctx);
                    foreach (var b in AllBuildings)
                        Assert.AreEqual(r.IsEligible(b) && r.Coins >= r.UnlockCost(b), r.CanUnlock(b, out _), b + ", " + ctx);
                }

            // InWave is ignored: the gate is met mid-wave, only the unlock itself waits (WR6)
            r.WavesCompleted = t.BungalowsEligibleAfterWave;
            r.Coins = 100000;
            var sim = new WaveSimulation(r, WaveTable.Default8()[0], t);
            sim.StartWave();
            Assert.IsTrue(r.InWave);
            Assert.IsTrue(r.IsEligible(BuildingId.Pool), "in a wave");
            Assert.IsTrue(r.IsEligible(BuildingId.Bungalows), "in a wave");
            Assert.IsFalse(r.CanUnlock(BuildingId.Pool, out _), "in a wave");
            RunToComplete(sim);

            // already unlocked: no longer eligible; the price tag stays fixed per building
            Assert.IsTrue(r.Unlock(BuildingId.Pool));
            Assert.IsFalse(r.IsEligible(BuildingId.Pool), "already unlocked");
            Assert.IsTrue(r.IsEligible(BuildingId.Bungalows), "the other gate is independent");
            Assert.AreEqual(t.PoolUnlockCostCoins, r.UnlockCost(BuildingId.Pool));
        }
    }
}
