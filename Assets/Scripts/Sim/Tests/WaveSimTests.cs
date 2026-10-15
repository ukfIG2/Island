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
    }
}
