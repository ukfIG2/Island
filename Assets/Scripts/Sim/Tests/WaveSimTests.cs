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

        // The worker pool is always buildings-1, so a static placement is fully
        // described by the single building left empty.
        static void SetEmptyBuilding(ResortState resort, BuildingId empty)
        {
            var e = resort.Get(empty);
            Assert.NotNull(e, empty + " is not unlocked");
            if (!e.HasWorker) return;
            foreach (var b in resort.Buildings)
                if (!b.HasWorker)
                {
                    Assert.IsTrue(resort.MoveWorker(empty, b.Id));
                    return;
                }
            Assert.Fail("no empty building found; pool should be buildings-1");
        }

        static float BestStaticSatisfaction(ResortState resort, WaveDef wave, TuningConfig t)
        {
            var ids = new List<BuildingId>();
            foreach (var b in resort.Buildings) ids.Add(b.Id);
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
                if (BuildingNeeds.Serves(b) == need) return b;
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

        static BuildingId[] AllBuildings => (BuildingId[])Enum.GetValues(typeof(BuildingId));

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
            var t = TuningConfig.Default;
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
            var t = TuningConfig.Default;
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
            var t = TuningConfig.Default;
            var resort = ResortState.NewGame(t);

            // completing the wave-6 def passes both eligibility gates; the result itself is irrelevant
            RunFullWave(resort, WaveTable.Default8()[5], t);
            resort.DebugGrant(t.PoolUnlockCostCoins + t.BungalowsUnlockCostCoins, 0);
            Assert.IsTrue(resort.Unlock(BuildingId.Pool));
            Assert.IsTrue(resort.Unlock(BuildingId.Bungalows));

            int buildingCount = Enum.GetValues(typeof(BuildingId)).Length;
            Assert.AreEqual(buildingCount - 1, resort.Workers); // pool stays buildings-1, never equal

            resort.DebugGrant(buildingCount * (t.UpgradeCostCoins[0] + t.UpgradeCostCoins[1]), 0);
            foreach (BuildingId b in Enum.GetValues(typeof(BuildingId)))
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
            var t = TuningConfig.Default;
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
            var t = TuningConfig.Default;
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
            var t = TuningConfig.Default;
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
            var t = TuningConfig.Default;
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
            var t = TuningConfig.Default;
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
                        ? MakeResort(t, 1, BuildingId.BeachBar, AllBuildings)
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
            var t = TuningConfig.Default;

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
            for (int level = 1; level < t.CapacityPerLevel.Length; level++)
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
            var t = TuningConfig.Default;

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
            var t = TuningConfig.Default;
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

        // WR2: an empty building runs slower but never stops, otherwise its line could never clear
        // and the wave would never end.
        [Test]
        public void WR2_UnstaffedBuildingStillFinishesTheWave()
        {
            var t = TuningConfig.Default;
            Assert.Greater(t.UtilizationEmpty, 0f, "an empty building must never run at zero (WR2)");

            var resort = NewGameWithEmpty(t, BuildingId.BeachBar);
            Assert.IsFalse(resort.Get(BuildingId.BeachBar).HasWorker);
            var sim = new WaveSimulation(resort, CraftedWave(rooms: 4, drinks: 12, food: 4), t);
            sim.StartWave();
            RunToComplete(sim, "wave with an unstaffed Beach Bar");

            Assert.AreEqual(12, sim.ServedUnits(NeedId.Drinks), "the unstaffed Beach Bar still served every guest");
            Assert.AreEqual(0, sim.QueueLength(NeedId.Drinks));
        }

        // WR4: during a wave a unit never leaves and never counts for less than unit_floor, however
        // long it waits. The wave floor is switched off here so the raw result is visible.
        [Test]
        public void WR4_NoUnitLeavesAndNoneCountsBelowTheFloor()
        {
            var t = TuningConfig.Default;
            t.WaveFloor = 0f;
            var resort = NewGameWithEmpty(t, BuildingId.BeachBar);
            var sim = new WaveSimulation(resort, CraftedWave(drinks: 40), t);
            sim.StartWave();
            RunToComplete(sim, "long Drinks line at an unstaffed Beach Bar");

            Assert.AreEqual(40, sim.ArrivedUnits(NeedId.Drinks));
            Assert.AreEqual(40, sim.ServedUnits(NeedId.Drinks), "nobody left the line");
            Assert.Greater(sim.Result.AverageWaitByNeed[NeedId.Drinks], t.PatienceFloorAfterSeconds,
                "the line must be long enough that guests wait past the floor point");
            Assert.GreaterOrEqual(sim.Result.Satisfaction, t.UnitFloor - 1e-5f, "no unit counts below unit_floor");
        }
    }
}
