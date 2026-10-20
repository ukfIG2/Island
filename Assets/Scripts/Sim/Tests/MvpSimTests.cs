using System;
using System.Collections.Generic;
using NUnit.Framework;
using static ResortEmpire.Sim.Tests.SimTestKit;

namespace ResortEmpire.Sim.Tests
{
    // MVP rules (TuningConfig.Default) on top of the prototype: Reputation gates, Spa, Lv4-Lv5 with
    // Materials, worker slots and hiring, Managers, quality tiers, wave Reputation/Materials, endless
    // waves, snapshots, Grant and the comeback gift. See Documentation/MVP_DECISIONS.md.
    public class MvpSimTests
    {
        static void AssertUnlockRefused(ResortState r, BuildingId b, string why)
        {
            int coins = r.Coins, workers = r.Workers, count = r.Buildings.Count;
            Assert.IsFalse(r.CanUnlock(b, out var reason), b + ": " + why);
            Assert.IsNotNull(reason, b + ": a refusal always says why");
            Assert.IsFalse(r.Unlock(b), b + ": " + why);
            Assert.AreEqual(coins, r.Coins, b + ": refused unlock must not charge");
            Assert.AreEqual(workers, r.Workers);
            Assert.AreEqual(count, r.Buildings.Count);
        }

        static void UpgradeTo(ResortState r, BuildingId b, int level)
        {
            while (r.Get(b).Level < level)
                Assert.IsTrue(r.Upgrade(b), b + " Lv" + r.Get(b).Level + "->" + (r.Get(b).Level + 1));
        }

        [Test]
        public void Config_DefaultIsMvpPrototypeKeepsPrototypeRules()
        {
            var mvp = TuningConfig.Default;
            var proto = TuningConfig.Prototype;

            Assert.IsTrue(mvp.UseReputationGates);
            Assert.IsFalse(proto.UseReputationGates);
            Assert.IsTrue(mvp.MvpSystems);
            Assert.IsFalse(proto.MvpSystems);
            Assert.AreEqual(5, mvp.MaxLevel);
            Assert.AreEqual(3, proto.MaxLevel);
            CollectionAssert.AreEqual(new[] { 3, 5, 7, 7, 10 }, mvp.CapacityPerLevel);
            CollectionAssert.AreEqual(new[] { 1, 1, 1, 2, 3 }, mvp.WorkerSlotsPerLevel);
            CollectionAssert.AreEqual(new[] { 0, 0, 0, 1, 2 }, mvp.QualityTierPerLevel);
            CollectionAssert.AreEqual(new[] { 500, 1200, 2500, 5000 }, mvp.UpgradeCostCoins);
            CollectionAssert.AreEqual(new[] { 0, 0, 4, 8 }, mvp.UpgradeCostMaterials);

            // utilization: 0 workers = empty, exactly one = the prototype's staffed value
            Assert.AreEqual(mvp.UtilizationEmpty, mvp.WorkerUtilization(0));
            Assert.AreEqual(mvp.UtilizationStaffed, mvp.WorkerUtilization(1));
            Assert.AreEqual(mvp.UtilizationStaffed - mvp.UtilizationEmpty, mvp.WorkerMarginalUtilization[0], 1e-5f,
                "the table's first entry is the first worker's gain");

            var m = ResortState.NewGame(mvp);
            Assert.AreEqual(mvp.StartingMaterials, m.Materials);
            Assert.AreEqual(3, m.Materials, "P6: start with 3 Materials");
            Assert.AreEqual(0, m.Reputation);
            Assert.AreEqual(0, m.Gems, "P16: start with 0 Gems");
            Assert.AreEqual(2, m.Workers, "workers = wave buildings - 1, as in the prototype");
            Assert.AreEqual(5, m.MaxLevel);

            var p = ResortState.NewGame(proto);
            Assert.AreEqual(0, p.Materials);
            Assert.AreEqual(3, p.MaxLevel);
            Assert.AreEqual(-1, p.UnlockCost(BuildingId.Spa), "no Spa in the prototype");
            Assert.AreEqual(-1, p.ReputationGate(BuildingId.Spa));
            Assert.AreEqual(-1, p.ManagerCost(BuildingId.Reception), "no Managers in the prototype");
            Assert.AreEqual(-1, p.SpecialistCost(SpecialistId.Butler), "no Specialists in the prototype");
            Assert.AreEqual(-1, p.HireWorkerCost(), "no hiring in the prototype");
            Assert.IsFalse(VipSchedule.OfferDue(4, proto), "no VIPs in the prototype");
            Assert.IsTrue(VipSchedule.OfferDue(4, mvp));
        }

        [Test]
        public void Gates_ReputationThresholdsThenCoinsIncludingSpa()
        {
            var t = TuningConfig.Default;
            var r = ResortState.NewGame(t);
            r.WavesCompleted = 50;              // wave counts open nothing under Reputation gates
            r.Grant(100000, 0);

            Assert.AreEqual(t.PoolReputationGate, r.ReputationGate(BuildingId.Pool));
            Assert.AreEqual(t.BungalowsReputationGate, r.ReputationGate(BuildingId.Bungalows));
            Assert.AreEqual(t.SpaReputationGate, r.ReputationGate(BuildingId.Spa));
            Assert.AreEqual(10, t.PoolReputationGate);
            Assert.AreEqual(30, t.BungalowsReputationGate);
            Assert.AreEqual(45, t.SpaReputationGate);
            Assert.AreEqual(-1, r.ReputationGate(BuildingId.Reception), "starting buildings have no gate");
            Assert.AreEqual(t.SpaUnlockCostCoins, r.UnlockCost(BuildingId.Spa));
            Assert.AreEqual(3000, t.SpaUnlockCostCoins);

            foreach (var b in new[] { BuildingId.Pool, BuildingId.Bungalows, BuildingId.Spa })
            {
                Assert.IsFalse(r.IsEligible(b), b + " at 0 Reputation");
                AssertUnlockRefused(r, b, "0 Reputation");
            }
            Assert.IsFalse(r.CanUnlock(BuildingId.Pool, out var reason));
            StringAssert.Contains("Reputation", reason);

            // step 1: the threshold makes it available ...
            r.Grant(0, 0, reputation: t.PoolReputationGate - 1);
            Assert.IsFalse(r.IsEligible(BuildingId.Pool), "one short");
            r.Grant(0, 0, reputation: 1);
            Assert.IsTrue(r.IsEligible(BuildingId.Pool));
            Assert.IsFalse(r.IsEligible(BuildingId.Bungalows));
            Assert.AreEqual(t.PoolReputationGate, r.Reputation, "Reputation is never spent");

            // ... step 2: Coins buy it; a new wave building brings exactly one worker and one slot
            r.Coins = t.PoolUnlockCostCoins - 1;
            AssertUnlockRefused(r, BuildingId.Pool, "Coins short");
            r.Coins = t.PoolUnlockCostCoins + 5;
            int workers = r.Workers, slots = r.TotalSlots, rep = r.Reputation;
            Assert.IsTrue(r.Unlock(BuildingId.Pool));
            Assert.AreEqual(5, r.Coins);
            Assert.AreEqual(workers + 1, r.Workers);
            Assert.AreEqual(slots + 1, r.TotalSlots);
            Assert.AreEqual(1, r.Get(BuildingId.Pool).WorkerCount);
            Assert.AreEqual(rep, r.Reputation, "unlocking spends no Reputation");
            Assert.IsFalse(r.IsEligible(BuildingId.Pool), "already unlocked");

            r.Coins = 100000;
            r.Grant(0, 0, reputation: t.BungalowsReputationGate - r.Reputation);
            Assert.IsTrue(r.Unlock(BuildingId.Bungalows));
            Assert.IsFalse(r.IsEligible(BuildingId.Spa), "Spa gate is higher");

            // the Spa: same two steps, but no worker and no slot
            r.Grant(0, 0, reputation: t.SpaReputationGate - r.Reputation);
            Assert.IsTrue(r.IsEligible(BuildingId.Spa));
            int coins = r.Coins, cap = r.WorkerCap;
            workers = r.Workers;
            slots = r.TotalSlots;
            Assert.IsTrue(r.Unlock(BuildingId.Spa));
            Assert.AreEqual(coins - t.SpaUnlockCostCoins, r.Coins);
            Assert.AreEqual(workers, r.Workers, "the Spa brings no worker");
            Assert.AreEqual(slots, r.TotalSlots, "the Spa has no worker slot");
            Assert.AreEqual(cap, r.WorkerCap);
            Assert.AreEqual(0, r.Get(BuildingId.Spa).WorkerCount);
            Assert.AreEqual(0, r.SlotsOf(BuildingId.Spa));
            Assert.AreEqual(0, r.CapacityOf(BuildingId.Spa));
            Assert.AreEqual(-1, r.UpgradeCost(BuildingId.Spa), "P3: one level");
            Assert.AreEqual(-1, r.ManagerCost(BuildingId.Spa), "the Spa has no Manager");
            Assert.IsFalse(r.MoveWorker(BuildingId.Reception, BuildingId.Spa));
            Assert.IsFalse(r.HireWorker(BuildingId.Spa));
            Assert.Less(r.Workers, r.TotalSlots, "hard rule: workers stay below slots");

            // Reputation never decreases
            rep = r.Reputation;
            r.Grant(0, 0, reputation: -50);
            Assert.AreEqual(rep, r.Reputation);
        }

        [Test]
        public void Levels_Lv4AndLv5CostCoinsAndMaterials()
        {
            var t = TuningConfig.Default;
            var r = ResortState.NewGame(t);
            r.Coins = 100000;
            r.Materials = 0;

            // Lv1-3 unchanged from the prototype: Coins only
            Assert.AreEqual(0, r.UpgradeMaterialsCost(BuildingId.Reception));
            UpgradeTo(r, BuildingId.Reception, 3);
            Assert.AreEqual(100000 - 500 - 1200, r.Coins);

            // Lv3 -> Lv4: 2,500 Coins + 4 Materials; refused one Material short, nothing spent
            Assert.AreEqual(2500, r.UpgradeCost(BuildingId.Reception));
            Assert.AreEqual(4, r.UpgradeMaterialsCost(BuildingId.Reception));
            r.Materials = 3;
            int coins = r.Coins;
            Assert.IsFalse(r.CanUpgrade(BuildingId.Reception, out var reason));
            StringAssert.Contains("Materials", reason);
            Assert.IsFalse(r.Upgrade(BuildingId.Reception));
            Assert.AreEqual(3, r.Get(BuildingId.Reception).Level);
            Assert.AreEqual(coins, r.Coins);
            Assert.AreEqual(3, r.Materials);

            r.Materials = 5;
            Assert.IsTrue(r.Upgrade(BuildingId.Reception));
            Assert.AreEqual(4, r.Get(BuildingId.Reception).Level);
            Assert.AreEqual(coins - 2500, r.Coins);
            Assert.AreEqual(1, r.Materials);
            Assert.AreEqual(7, r.CapacityOf(BuildingId.Reception), "Lv4 adds no seats");
            Assert.AreEqual(2, r.SlotsOf(BuildingId.Reception), "Lv4: second worker slot");
            Assert.AreEqual(1, r.QualityTier(BuildingId.Reception), "Lv4: first quality tier");

            // Lv4 -> Lv5: 5,000 Coins + 8 Materials
            Assert.AreEqual(5000, r.UpgradeCost(BuildingId.Reception));
            Assert.AreEqual(8, r.UpgradeMaterialsCost(BuildingId.Reception));
            r.Materials = 8;
            coins = r.Coins;
            Assert.IsTrue(r.Upgrade(BuildingId.Reception));
            Assert.AreEqual(5, r.Get(BuildingId.Reception).Level);
            Assert.AreEqual(coins - 5000, r.Coins);
            Assert.AreEqual(0, r.Materials);
            Assert.AreEqual(10, r.CapacityOf(BuildingId.Reception));
            Assert.AreEqual(3, r.SlotsOf(BuildingId.Reception));
            Assert.AreEqual(2, r.QualityTier(BuildingId.Reception));

            // Lv5 is the end of the line
            Assert.AreEqual(-1, r.UpgradeCost(BuildingId.Reception));
            Assert.AreEqual(-1, r.UpgradeMaterialsCost(BuildingId.Reception));
            r.Materials = 100;
            Assert.IsFalse(r.Upgrade(BuildingId.Reception));
            Assert.AreEqual(100, r.Materials);

            // enough Materials but Coins short: refused, nothing spent
            UpgradeTo(r, BuildingId.Restaurant, 3);
            r.Coins = 2499;
            Assert.IsFalse(r.Upgrade(BuildingId.Restaurant));
            Assert.AreEqual(2499, r.Coins);
            Assert.AreEqual(100, r.Materials);

            // upgrades wait for the end of a wave (WR6)
            r.Coins = 100000;
            var sim = new WaveSimulation(r, WaveTable.WaveFor(1), t);
            sim.StartWave();
            Assert.IsFalse(r.Upgrade(BuildingId.Restaurant), "in a wave");
            RunToComplete(sim);
            Assert.IsTrue(r.Upgrade(BuildingId.Restaurant), "between waves");

            // the prototype stops at Lv3
            var p = ResortState.NewGame(TuningConfig.Prototype);
            p.Coins = 100000;
            p.Materials = 100;
            UpgradeTo(p, BuildingId.Reception, 3);
            Assert.AreEqual(-1, p.UpgradeCost(BuildingId.Reception));
            Assert.IsFalse(p.Upgrade(BuildingId.Reception));
        }

        [Test]
        public void Workers_SlotsCapAndHireCostGrowth()
        {
            var t = TuningConfig.Default;
            var r = ResortState.NewGame(t);
            r.Coins = 100000;
            r.Materials = 100;

            Assert.AreEqual(3, r.TotalSlots);
            Assert.AreEqual(2, r.WorkerCap, "floor(0.8 x 3)");
            Assert.AreEqual(2, r.Workers);
            Assert.AreEqual(-1, r.HireWorkerCost(), "at the cap");
            int coins = r.Coins;
            Assert.IsFalse(r.HireWorker(BuildingId.BeachBar), "a free slot alone is not enough at the cap");
            Assert.AreEqual(coins, r.Coins);

            // Lv4 opens a second slot: 4 slots, cap 3
            UpgradeTo(r, BuildingId.Reception, 4);
            Assert.AreEqual(4, r.TotalSlots);
            Assert.AreEqual(3, r.WorkerCap);
            Assert.AreEqual(t.HireWorkerBaseCost, r.HireWorkerCost());
            Assert.AreEqual(400, r.HireWorkerCost());
            Assert.IsFalse(r.HireWorker(BuildingId.Restaurant), "its only slot is taken");
            Assert.IsFalse(r.HireWorker(BuildingId.Pool), "absent building");

            coins = r.Coins;
            int value = r.ResortValue;
            Assert.IsTrue(r.HireWorker(BuildingId.Reception));
            Assert.AreEqual(coins - 400, r.Coins);
            Assert.AreEqual(2, r.Get(BuildingId.Reception).WorkerCount);
            Assert.AreEqual(3, r.Workers);
            Assert.AreEqual(1, r.HiredWorkers);
            Assert.AreEqual(value + t.ResortValuePerHire, r.ResortValue);
            Assert.AreEqual(-1, r.HireWorkerCost(), "cap 3 reached");

            // the next hire costs HireWorkerCostStep more
            UpgradeTo(r, BuildingId.Restaurant, 4);
            Assert.AreEqual(5, r.TotalSlots);
            Assert.AreEqual(4, r.WorkerCap);
            Assert.AreEqual(400 + 200, r.HireWorkerCost());
            Assert.IsTrue(r.HireWorker(BuildingId.BeachBar));
            Assert.AreEqual(1, r.Get(BuildingId.BeachBar).WorkerCount);
            Assert.AreEqual(2, r.HiredWorkers);
            Assert.AreEqual(-1, r.HireWorkerCost());
            Assert.Less(r.Workers, r.TotalSlots, "hard rule: workers stay below slots");

            // a fully built resort: 15 slots, cap 12; the unlock gifts do not raise the price
            var full = Build(t,
                new Spec(BuildingId.Reception, 5, 1), new Spec(BuildingId.Restaurant, 5, 1),
                new Spec(BuildingId.BeachBar, 5, 0), new Spec(BuildingId.Pool, 5, 1), new Spec(BuildingId.Bungalows, 5, 1));
            Assert.AreEqual(15, full.TotalSlots);
            Assert.AreEqual(12, full.WorkerCap);
            Assert.AreEqual(t.HireWorkerBaseCost, full.HireWorkerCost());

            // hiring waits for the end of a wave (S13)
            var w = Build(t, new Spec(BuildingId.Reception, 4, 1), new Spec(BuildingId.Restaurant, 1, 1),
                new Spec(BuildingId.BeachBar, 1, 0));
            w.Coins = 10000;
            var sim = new WaveSimulation(w, WaveTable.WaveFor(1), t);
            sim.StartWave();
            Assert.IsFalse(w.HireWorker(BuildingId.Reception), "in a wave");
            Assert.AreEqual(10000, w.Coins);
            RunToComplete(sim);
            Assert.IsTrue(w.HireWorker(BuildingId.Reception), "between waves");
        }

        [Test]
        public void Staff_ManagersAndSpecialistsHiredOnceBetweenWaves()
        {
            var t = TuningConfig.Default;
            var r = ResortState.NewGame(t);
            r.Coins = 10000;

            Assert.AreEqual(t.ManagerCostCoins, r.ManagerCost(BuildingId.BeachBar));
            Assert.AreEqual(800, t.ManagerCostCoins);
            Assert.AreEqual(-1, r.ManagerCost(BuildingId.Pool), "absent building");
            Assert.AreEqual(-1, r.ManagerCost(BuildingId.Spa));
            Assert.IsFalse(r.HireManager(BuildingId.Pool));

            int value = r.ResortValue;
            Assert.IsFalse(r.HasManager(BuildingId.BeachBar));
            Assert.IsTrue(r.HireManager(BuildingId.BeachBar));
            Assert.AreEqual(10000 - 800, r.Coins);
            Assert.IsTrue(r.HasManager(BuildingId.BeachBar));
            Assert.IsTrue(r.Get(BuildingId.BeachBar).HasManager);
            Assert.AreEqual(value + t.ResortValuePerHire, r.ResortValue);
            Assert.AreEqual(-1, r.ManagerCost(BuildingId.BeachBar), "hired once");
            Assert.IsFalse(r.HireManager(BuildingId.BeachBar));
            Assert.AreEqual(10000 - 800, r.Coins);
            Assert.AreEqual(2, r.Workers, "a Manager is not a worker");

            Assert.AreEqual(t.SpecialistCostCoins, r.SpecialistCost(SpecialistId.Butler));
            Assert.AreEqual(1000, t.SpecialistCostCoins);
            Assert.IsTrue(r.HireSpecialist(SpecialistId.Butler));
            Assert.IsTrue(r.HasSpecialist(SpecialistId.Butler));
            Assert.IsFalse(r.HasSpecialist(SpecialistId.Captain));
            Assert.AreEqual(-1, r.SpecialistCost(SpecialistId.Butler));
            Assert.IsFalse(r.HireSpecialist(SpecialistId.Butler));
            Assert.AreEqual(10000 - 1800, r.Coins);
            Assert.AreEqual(value + 2 * t.ResortValuePerHire, r.ResortValue);

            r.Coins = 999;
            Assert.IsFalse(r.HireSpecialist(SpecialistId.Captain), "Coins short");
            Assert.AreEqual(999, r.Coins);

            // only between waves
            r.Coins = 10000;
            var sim = new WaveSimulation(r, WaveTable.WaveFor(1), t);
            sim.StartWave();
            Assert.IsFalse(r.HireManager(BuildingId.Reception), "in a wave");
            Assert.IsFalse(r.HireSpecialist(SpecialistId.Captain), "in a wave");
            Assert.AreEqual(10000, r.Coins);
            RunToComplete(sim);
            Assert.IsTrue(r.HireManager(BuildingId.Reception));
            Assert.IsTrue(r.HireSpecialist(SpecialistId.Captain));
        }

        [Test]
        public void Workers_SecondWorkerHelpsLessThanTheFirst()
        {
            var t = TuningConfig.Default;
            float u0 = t.WorkerUtilization(0), u1 = t.WorkerUtilization(1), u2 = t.WorkerUtilization(2), u3 = t.WorkerUtilization(3);
            Assert.Greater(u2, u1);
            Assert.Greater(u3, u2);
            Assert.Less(u2 - u1, u1 - u0, "second worker adds less than the first");
            Assert.Less(u3 - u2, u2 - u1, "third worker adds less than the second");
            Assert.Less(u2, 2f * u1, "two workers are not twice as fast");

            // in the sim: a Lv4 Reception (7 seats, 2 slots) on a long Rooms queue with 0, 1, 2 workers
            var served = new int[3];
            for (int w = 0; w < 3; w++)
            {
                var resort = Build(t, new Spec(BuildingId.Reception, 4, w), new Spec(BuildingId.Restaurant, 1, 0),
                    new Spec(BuildingId.BeachBar, 1, 0));
                var sim = new WaveSimulation(resort, CraftedWave(rooms: 200), t);
                sim.StartWave();
                TickUntilTime(sim, 54f);
                served[w] = sim.ServedUnits(NeedId.Rooms);
            }
            string ctx = "served by 54 s with 0/1/2 workers: " + served[0] + "/" + served[1] + "/" + served[2];
            Assert.Greater(served[1], served[0], ctx);
            Assert.Greater(served[2], served[1], ctx + ": the second worker still helps");
            Assert.Less(served[2] - served[1], served[1] - served[0], ctx + ": but less than the first");
            Assert.Less(served[2], 2 * served[1], ctx + ": two workers are not twice as fast");
        }

        [Test]
        public void Managers_SpeedUpService()
        {
            var t = TuningConfig.Default;
            Assert.AreEqual(1.2f, t.ManagerMultiplier);
            var served = new int[2];
            var duration = new float[2];
            for (int m = 0; m < 2; m++)
            {
                var resort = Build(t, new Spec(BuildingId.Reception, 3, 1, m == 1), new Spec(BuildingId.Restaurant, 1, 0),
                    new Spec(BuildingId.BeachBar, 1, 0));
                var sim = new WaveSimulation(resort, CraftedWave(rooms: 200), t);
                sim.StartWave();
                TickUntilTime(sim, 54f);
                served[m] = sim.ServedUnits(NeedId.Rooms);
                RunToComplete(sim);
                duration[m] = sim.TimeInWave;
            }
            Assert.GreaterOrEqual(served[1], served[0] + 5,
                "the Receptionist serves measurably more (" + served[1] + " vs " + served[0] + ")");
            Assert.Less(duration[1], duration[0] * 0.9f, "the managed wave drains clearly sooner");
        }

        [Test]
        public void QualityTier_DelaysTheSatisfactionDrop()
        {
            var t = TuningConfig.Default;
            var results = new WaveResult[2];
            for (int i = 0; i < 2; i++)
            {
                int level = 3 + i; // Lv3 and Lv4 have the same 7 seats; one worker on each
                var resort = Build(t, new Spec(BuildingId.Reception, 1, 0), new Spec(BuildingId.Restaurant, 1, 0),
                    new Spec(BuildingId.BeachBar, level, 1));
                Assert.AreEqual(i, resort.QualityTier(BuildingId.BeachBar));
                results[i] = RunFullWave(resort, CraftedWave(drinks: 70), t).Result;
            }
            float waitLv3 = results[0].AverageWaitByNeed[NeedId.Drinks];
            float waitLv4 = results[1].AverageWaitByNeed[NeedId.Drinks];
            Assert.AreEqual(waitLv3, waitLv4, 1e-4f, "same seats, same worker: identical waits");
            Assert.Greater(waitLv3, t.PatienceGraceSeconds, "the waits must reach past the plain grace");
            Assert.Greater(results[1].Satisfaction, results[0].Satisfaction + 0.05f,
                "tier 1 lets the same waits hurt later (" + results[1].Satisfaction + " vs " + results[0].Satisfaction + ")");
            Assert.Greater(results[1].Stars, results[0].Stars);
        }

        [Test]
        public void Rush_TargetsTheLeastStaffedBuildingRelativeToItsSlots()
        {
            var t = TuningConfig.Default;
            var wave2 = WaveTable.WaveFor(2); // Rooms 12, Drinks 16, Food 10, with the rush

            NeedId? RushOn(WaveDef wave, params Spec[] specs)
            {
                var sim = new WaveSimulation(Build(t, specs), wave, t);
                sim.StartWave();
                TickUntilTime(sim, t.RushTimeSeconds + 0.5f);
                Assert.IsTrue(sim.RushFired);
                var need = sim.RushNeed.Value;
                Assert.AreEqual(wave.Demand[need] + t.RushUnits, sim.DemandTotal(need), "rush demand lands on " + need);
                return need;
            }

            // half-staffed Lv4 Reception beats two full buildings
            Assert.AreEqual(NeedId.Rooms, RushOn(wave2,
                new Spec(BuildingId.Reception, 4, 1), new Spec(BuildingId.Restaurant, 1, 1), new Spec(BuildingId.BeachBar, 4, 2)));
            // an empty building beats a half-staffed one
            Assert.AreEqual(NeedId.Food, RushOn(wave2,
                new Spec(BuildingId.Reception, 4, 1), new Spec(BuildingId.Restaurant, 1, 0), new Spec(BuildingId.BeachBar, 4, 2)));
            // same share of slots: the larger demand takes it
            Assert.AreEqual(NeedId.Drinks, RushOn(wave2,
                new Spec(BuildingId.Reception, 4, 1), new Spec(BuildingId.Restaurant, 1, 1), new Spec(BuildingId.BeachBar, 4, 1)));
            Assert.AreEqual(NeedId.Rooms, RushOn(CraftedWave(rooms: 20, drinks: 10, food: 10, rush: true),
                new Spec(BuildingId.Reception, 4, 1), new Spec(BuildingId.Restaurant, 1, 1), new Spec(BuildingId.BeachBar, 4, 1)));
        }

        [Test]
        public void Workers_MoveOneWorkerIntoAFreeSlot()
        {
            var t = TuningConfig.Default;
            var r = Build(t, new Spec(BuildingId.Reception, 4, 1), new Spec(BuildingId.Restaurant, 1, 1),
                new Spec(BuildingId.BeachBar, 1, 0));
            var reception = r.Get(BuildingId.Reception);
            var restaurant = r.Get(BuildingId.Restaurant);
            var beachBar = r.Get(BuildingId.BeachBar);

            // between waves: concentrate on the Lv4 Reception
            Assert.AreEqual(1, r.FreeSlotsOf(BuildingId.Reception));
            Assert.IsTrue(r.MoveWorker(BuildingId.Restaurant, BuildingId.Reception));
            Assert.AreEqual(2, reception.WorkerCount);
            Assert.AreEqual(0, restaurant.WorkerCount);
            Assert.IsFalse(r.MoveWorker(BuildingId.BeachBar, BuildingId.Reception), "nobody to move");
            Assert.IsFalse(r.MoveWorker(BuildingId.Reception, BuildingId.Reception), "same building");
            Assert.AreEqual(2, r.Workers);

            // during a wave: one worker at a time, only into a free slot
            var sim = new WaveSimulation(r, WaveTable.WaveFor(1), t);
            sim.StartWave();
            Assert.IsTrue(sim.MoveWorker(BuildingId.Reception, BuildingId.BeachBar));
            Assert.AreEqual(1, reception.WorkerCount);
            Assert.AreEqual(1, beachBar.WorkerCount);
            Assert.IsFalse(sim.MoveWorker(BuildingId.Reception, BuildingId.BeachBar), "BeachBar's single slot is full");
            Assert.IsTrue(sim.MoveWorker(BuildingId.Reception, BuildingId.Restaurant));
            Assert.AreEqual(0, reception.WorkerCount);
            Assert.AreEqual(2, r.Workers, "moves never create or lose workers");
            RunToComplete(sim);
        }

        [Test]
        public void Spa_NeverTakesPartInWaves()
        {
            var t = TuningConfig.Default;
            // the Spa listed first, so every loop over the buildings meets it before the wave buildings
            var r = Build(t, new Spec(BuildingId.Spa, 1, 0), new Spec(BuildingId.Reception, 1, 1),
                new Spec(BuildingId.Restaurant, 1, 1), new Spec(BuildingId.BeachBar, 1, 0),
                new Spec(BuildingId.Pool, 1, 1), new Spec(BuildingId.Bungalows, 1, 1));
            r.Energy = 10;
            var wave = WaveTable.WaveFor(2); // with the rush
            var sim = new WaveSimulation(r, wave, t);
            sim.StartWave();
            TickUntilTime(sim, 5f);
            Assert.IsFalse(sim.CanBoost(BuildingId.Spa));
            Assert.IsFalse(sim.UseEnergyBoost(BuildingId.Spa));
            Assert.AreEqual(10, r.Energy);
            Assert.IsFalse(sim.MoveWorker(BuildingId.Reception, BuildingId.Spa));
            RunToComplete(sim);

            Assert.AreEqual(NeedId.Drinks, sim.RushNeed, "the rush lands on the empty wave building, never on the Spa");
            Assert.AreEqual(0, r.Get(BuildingId.Spa).WorkerCount);
            Assert.AreEqual(Units(wave) + t.RushUnits, sim.Result.TotalUnits);
            foreach (NeedId n in Enum.GetValues(typeof(NeedId)))
                Assert.AreEqual(NeedStatus.Satisfied, sim.StatusOf(n), n + ": every need's building is unlocked");
        }

        [Test]
        public void WaveRewards_ReputationAndMaterialsAppliedOnce()
        {
            var t = TuningConfig.Default;
            Assert.AreEqual(1, t.ReputationPerWaveStar, "P5: Reputation = stars");

            // wave 1 with the Restaurant empty is Perfect (pinned in the prototype suite)
            var r = ResortState.NewGame(t);
            Assert.IsTrue(r.MoveWorker(BuildingId.Restaurant, BuildingId.BeachBar));
            int rep0 = r.Reputation, mat0 = r.Materials;
            var sim = RunFullWave(r, WaveTable.WaveFor(1), t);
            var res = sim.Result;
            Assert.IsTrue(res.Perfect);
            Assert.AreEqual(5, res.ReputationEarned);
            Assert.AreEqual(2, res.MaterialsEarned, "P6: 2 Materials at 5 stars / Perfect");
            Assert.AreEqual(rep0 + 5, r.Reputation);
            Assert.AreEqual(mat0 + 2, r.Materials);
            for (int i = 0; i < 200; i++) sim.Tick(Dt);
            Assert.AreSame(res, sim.Result);
            Assert.AreEqual(rep0 + 5, r.Reputation, "exactly once");
            Assert.AreEqual(mat0 + 2, r.Materials, "exactly once");

            // 4 stars -> 1 Material, 3 and 2 stars -> none (crafted waves pinned in the prototype suite)
            var cases = new[]
            {
                new KeyValuePair<WaveDef, int>(CraftedWave(drinks: 10), 4),
                new KeyValuePair<WaveDef, int>(CraftedWave(rooms: 8, drinks: 12), 3),
                new KeyValuePair<WaveDef, int>(CraftedWave(drinks: 12), 2),
            };
            foreach (var c in cases)
            {
                var resort = ResortState.NewGame(t); // BeachBar empty
                rep0 = resort.Reputation;
                mat0 = resort.Materials;
                var result = RunFullWave(resort, c.Key, t).Result;
                Assert.AreEqual(c.Value, result.Stars);
                Assert.AreEqual(c.Value, result.ReputationEarned);
                Assert.AreEqual(c.Value >= 4 ? 1 : 0, result.MaterialsEarned, c.Value + " stars");
                Assert.AreEqual(rep0 + result.ReputationEarned, resort.Reputation);
                Assert.AreEqual(mat0 + result.MaterialsEarned, resort.Materials);
            }

            // the prototype rules give neither
            var tp = TuningConfig.Prototype;
            var p = ResortState.NewGame(tp);
            Assert.IsTrue(p.MoveWorker(BuildingId.Restaurant, BuildingId.BeachBar));
            var pr = RunFullWave(p, WaveTable.WaveFor(1), tp).Result;
            Assert.IsTrue(pr.Perfect);
            Assert.AreEqual(0, pr.ReputationEarned);
            Assert.AreEqual(0, pr.MaterialsEarned);
            Assert.AreEqual(0, p.Reputation);
            Assert.AreEqual(0, p.Materials);
        }

        [Test]
        public void HR2_FullyBuiltResortFiveStarsWithoutEnergyInWaves1To12()
        {
            var t = TuningConfig.Default;
            var r = ResortState.NewGame(t);
            r.Grant(1000000, 0, materials: 1000, reputation: 1000);

            // build it with the real actions: every unlock, every level, every Manager, workers to the cap
            foreach (var b in new[] { BuildingId.Pool, BuildingId.Bungalows, BuildingId.Spa })
                Assert.IsTrue(r.Unlock(b), b.ToString());
            foreach (var b in WaveBuildings)
            {
                UpgradeTo(r, b, t.MaxLevel);
                Assert.IsTrue(r.HireManager(b), b.ToString());
            }
            // best placement: 3 on the two largest needs (Rooms, Drinks), 2 everywhere else
            var target = new Dictionary<BuildingId, int>
            {
                { BuildingId.Reception, 3 }, { BuildingId.Restaurant, 2 }, { BuildingId.BeachBar, 3 },
                { BuildingId.Pool, 2 }, { BuildingId.Bungalows, 2 },
            };
            foreach (var pair in target)
                while (r.Get(pair.Key).WorkerCount < pair.Value)
                    Assert.IsTrue(r.HireWorker(pair.Key), "hire on " + pair.Key);
            Assert.AreEqual(15, r.TotalSlots);
            Assert.AreEqual(12, r.WorkerCap);
            Assert.AreEqual(12, r.Workers, "workers at the cap");
            Assert.AreEqual(-1, r.HireWorkerCost());

            r.Energy = 0; // no Energy anywhere: it can only grow from rewards, and nothing spends it
            for (int i = 1; i <= 12; i++)
            {
                var wave = WaveTable.WaveFor(i, t);
                int energy = r.Energy;
                var result = RunFullWave(r, wave, t).Result;
                Assert.GreaterOrEqual(result.Satisfaction, t.RatingThresholds[4],
                    "wave " + i + ": 5 stars without Energy (HR2), got " + result.Satisfaction);
                Assert.AreEqual(5, result.Stars, "wave " + i);
                Assert.AreEqual(energy + result.EnergyEarned, r.Energy, "wave " + i + ": no Energy spent");
            }
        }

        [Test]
        public void Endless_WavesDeterministicGrowingWithARushEveryThirdWave()
        {
            var t = TuningConfig.Default;
            var table = WaveTable.Default8();
            for (int i = 1; i <= WaveTable.ScriptedWaveCount; i++)
            {
                var w = WaveTable.WaveFor(i);
                var s = table[i - 1];
                Assert.AreEqual(i, w.Index);
                Assert.AreEqual(s.IsDebut, w.IsDebut, "wave " + i);
                Assert.AreEqual(s.HasSuddenRush, w.HasSuddenRush, "wave " + i);
                CollectionAssert.AreEquivalent(s.Demand, w.Demand, "wave " + i + " is the scripted one");
            }

            // P10: wave 9 = wave 8 x 1.06, rounded (31/35/28/25/16 -> 33/37/30/27/17), with a rush
            var w9 = WaveTable.WaveFor(9);
            Assert.AreEqual(33, w9.Demand[NeedId.Rooms]);
            Assert.AreEqual(37, w9.Demand[NeedId.Drinks]);
            Assert.AreEqual(30, w9.Demand[NeedId.Food]);
            Assert.AreEqual(27, w9.Demand[NeedId.Relax]);
            Assert.AreEqual(17, w9.Demand[NeedId.OceanView]);
            Assert.IsTrue(w9.HasSuddenRush);

            var w8 = table[7];
            var previous = w8;
            for (int i = 9; i <= 40; i++)
            {
                var a = WaveTable.WaveFor(i, t);
                var b = WaveTable.WaveFor(i, t);
                Assert.AreNotSame(a, b, "fresh WaveDef on every call");
                CollectionAssert.AreEquivalent(a.Demand, b.Demand, "wave " + i + " is deterministic");
                Assert.AreEqual(i, a.Index);
                Assert.IsFalse(a.IsDebut, "generated waves never debut");
                Assert.AreEqual(i % 3 == 0, a.HasSuddenRush, "wave " + i + ": rush every 3rd wave");
                CollectionAssert.AreEquivalent(w8.Demand.Keys, a.Demand.Keys, "no new needs");
                foreach (var pair in w8.Demand)
                {
                    int expected = (int)Math.Round(pair.Value * Math.Pow(t.EndlessGrowthPerWave, i - 8),
                        MidpointRounding.AwayFromZero);
                    Assert.AreEqual(expected, a.Demand[pair.Key], "wave " + i + " " + pair.Key);
                    Assert.GreaterOrEqual(a.Demand[pair.Key], previous.Demand[pair.Key], "wave " + i + " " + pair.Key + " never shrinks");
                }
                Assert.Greater(Units(a), Units(previous), "wave " + i + " is bigger than wave " + (i - 1));
                previous = a;
            }

            Assert.Throws<ArgumentOutOfRangeException>(() => WaveTable.WaveFor(0));
        }

        [Test]
        public void ResortSnapshot_RoundTripKeepsEverything()
        {
            var t = TuningConfig.Default;
            var r = ResortState.NewGame(t);
            r.Grant(100000, 7, materials: 9, reputation: 50, gems: 4);
            foreach (var b in new[] { BuildingId.Pool, BuildingId.Bungalows, BuildingId.Spa })
                Assert.IsTrue(r.Unlock(b));
            UpgradeTo(r, BuildingId.Reception, 4);
            UpgradeTo(r, BuildingId.Restaurant, 4);        // 7 slots, cap 5: room for one hire
            Assert.IsTrue(r.HireWorker(BuildingId.Reception));
            Assert.IsTrue(r.MoveWorker(BuildingId.Restaurant, BuildingId.BeachBar));
            Assert.IsTrue(r.HireManager(BuildingId.BeachBar));
            Assert.IsTrue(r.HireSpecialist(SpecialistId.Captain));
            Assert.IsTrue(r.AddDecor("golden_palm"));
            r.WavesCompleted = 9;

            var snap = r.ToSnapshot();
            string json = UnityEngine.JsonUtility.ToJson(snap);
            var back = UnityEngine.JsonUtility.FromJson<ResortSnapshot>(json);
            var q = ResortState.FromSnapshot(t, back);

            Assert.AreEqual(r.Coins, q.Coins);
            Assert.AreEqual(r.Energy, q.Energy);
            Assert.AreEqual(r.ResortValue, q.ResortValue);
            Assert.AreEqual(r.WavesCompleted, q.WavesCompleted);
            Assert.AreEqual(r.Reputation, q.Reputation);
            Assert.AreEqual(r.Materials, q.Materials);
            Assert.AreEqual(r.Gems, q.Gems);
            Assert.AreEqual(r.HiredWorkers, q.HiredWorkers);
            Assert.AreEqual(r.Workers, q.Workers);
            Assert.AreEqual(r.TotalSlots, q.TotalSlots);
            Assert.AreEqual(r.WorkerCap, q.WorkerCap);
            Assert.AreEqual(r.HireWorkerCost(), q.HireWorkerCost());
            Assert.IsFalse(q.InWave);
            Assert.AreEqual(r.Buildings.Count, q.Buildings.Count);
            for (int i = 0; i < r.Buildings.Count; i++)
            {
                var a = r.Buildings[i];
                var b = q.Buildings[i];
                Assert.AreEqual(a.Id, b.Id, "unlock order kept");
                Assert.AreEqual(a.Level, b.Level, a.Id.ToString());
                Assert.AreEqual(a.WorkerCount, b.WorkerCount, a.Id.ToString());
                Assert.AreEqual(a.HasManager, b.HasManager, a.Id.ToString());
            }
            foreach (SpecialistId s in Enum.GetValues(typeof(SpecialistId)))
                Assert.AreEqual(r.HasSpecialist(s), q.HasSpecialist(s), s.ToString());
            CollectionAssert.AreEqual(r.Decor, q.Decor);
            Assert.AreEqual(json, UnityEngine.JsonUtility.ToJson(q.ToSnapshot()), "a second round trip is identical");

            // broken snapshots are refused, so the save system can fall back to a new game
            // order: Reception Lv4, Restaurant Lv4, BeachBar Lv1, Pool Lv1, Bungalows Lv1, Spa
            ResortSnapshot Broken(Action<ResortSnapshot> breakIt)
            {
                var copy = UnityEngine.JsonUtility.FromJson<ResortSnapshot>(json);
                breakIt(copy);
                return copy;
            }
            Assert.Catch<ArgumentException>(() => ResortState.FromSnapshot(t, null));
            Assert.Catch<ArgumentException>(() => ResortState.FromSnapshot(t, Broken(x => x.buildingIds = null)));
            Assert.Catch<ArgumentException>(() => ResortState.FromSnapshot(t, Broken(x => x.levels = new int[1])));
            Assert.Catch<ArgumentException>(() => ResortState.FromSnapshot(t, Broken(x => x.buildingIds[1] = 99)));
            Assert.Catch<ArgumentException>(() => ResortState.FromSnapshot(t, Broken(x => x.buildingIds[1] = x.buildingIds[0])));
            Assert.Catch<ArgumentException>(() => ResortState.FromSnapshot(t, Broken(x => x.levels[0] = 6)));
            Assert.Catch<ArgumentException>(() => ResortState.FromSnapshot(t, Broken(x => x.workerCounts[2] = 2)), "over the slots");
            Assert.Catch<ArgumentException>(() => ResortState.FromSnapshot(t, Broken(x => x.managerIds = new[] { (int)BuildingId.Spa })));
            Assert.Catch<ArgumentException>(() => ResortState.FromSnapshot(t, Broken(x =>
            {
                for (int i = 0; i < x.buildingIds.Length; i++)
                    if (x.buildingIds[i] != (int)BuildingId.Spa) x.workerCounts[i] = x.levels[i] >= 4 ? 2 : 1;
            })), "every slot filled breaks Workers < TotalSlots");
            Assert.Catch<ArgumentException>(() => ResortState.FromSnapshot(TuningConfig.Prototype, back), "Lv4 under the prototype");
        }

        [Test]
        public void LegacyRestore_StillReadsThePrototypeSave()
        {
            var t = TuningConfig.Default;
            var ids = new[] { BuildingId.Reception, BuildingId.Restaurant, BuildingId.BeachBar, BuildingId.Pool };
            var r = ResortState.Restore(t, 1234, 5, 300, 4, 3, ids, new[] { 2, 1, 3, 1 }, new[] { true, false, true, true });
            Assert.AreEqual(1234, r.Coins);
            Assert.AreEqual(5, r.Energy);
            Assert.AreEqual(300, r.ResortValue);
            Assert.AreEqual(4, r.WavesCompleted);
            Assert.AreEqual(3, r.Workers);
            Assert.AreEqual(1, r.Get(BuildingId.Reception).WorkerCount);
            Assert.AreEqual(0, r.Get(BuildingId.Restaurant).WorkerCount);
            Assert.AreEqual(3, r.Get(BuildingId.BeachBar).Level);
            Assert.AreEqual(t.StartingMaterials, r.Materials, "the prototype had no Materials: start value");
            Assert.AreEqual(0, r.Reputation);
            Assert.IsTrue(r.MoveWorker(BuildingId.Reception, BuildingId.Restaurant));
        }

        [Test]
        public void Grant_AddsOutsideRewardsAndNeverTakes()
        {
            var t = TuningConfig.Default;
            var r = ResortState.NewGame(t);
            int coins = r.Coins, energy = r.Energy, materials = r.Materials, rep = r.Reputation, gems = r.Gems;

            r.Grant(150, 3);
            Assert.AreEqual(coins + 150, r.Coins);
            Assert.AreEqual(energy + 3, r.Energy);
            Assert.AreEqual(materials, r.Materials);
            Assert.AreEqual(rep, r.Reputation);
            Assert.AreEqual(gems, r.Gems);

            r.Grant(1, 2, materials: 3, reputation: 4, gems: 5);
            Assert.AreEqual(coins + 151, r.Coins);
            Assert.AreEqual(energy + 5, r.Energy);
            Assert.AreEqual(materials + 3, r.Materials);
            Assert.AreEqual(rep + 4, r.Reputation);
            Assert.AreEqual(gems + 5, r.Gems);

            r.Grant(-100, -100, -100, -100, -100);
            Assert.AreEqual(coins + 151, r.Coins, "Grant never takes");
            Assert.AreEqual(energy + 5, r.Energy);
            Assert.AreEqual(materials + 3, r.Materials);
            Assert.AreEqual(rep + 4, r.Reputation, "Reputation never decreases");
            Assert.AreEqual(gems + 5, r.Gems);

            // decor: each id once, +ResortValuePerDecor
            int value = r.ResortValue;
            Assert.IsTrue(r.AddDecor("golden_palm"));
            Assert.AreEqual(value + t.ResortValuePerDecor, r.ResortValue);
            Assert.AreEqual(25, t.ResortValuePerDecor);
            Assert.IsFalse(r.AddDecor("golden_palm"));
            Assert.IsFalse(r.AddDecor(""));
            Assert.IsFalse(r.AddDecor(null));
            Assert.AreEqual(value + t.ResortValuePerDecor, r.ResortValue);
            CollectionAssert.AreEqual(new[] { "golden_palm" }, r.Decor);
        }

        [Test]
        public void Comeback_FixedGiftAfterTwelveHoursOnly()
        {
            var t = TuningConfig.Default;
            const long t0 = 1700000000L;
            const long twelveHours = 12L * 60L * 60L;
            Assert.AreEqual(twelveHours, t.ComebackAfterSeconds);

            var early = ComebackReward.Evaluate(t0, t0 + twelveHours - 1, t);
            Assert.IsFalse(early.Due);
            Assert.AreEqual(0, early.Coins);
            Assert.AreEqual(0, early.Energy);

            var due = ComebackReward.Evaluate(t0, t0 + twelveHours, t);
            Assert.IsTrue(due.Due);
            Assert.AreEqual(150, due.Coins);
            Assert.AreEqual(3, due.Energy);

            var month = ComebackReward.Evaluate(t0, t0 + 30L * 24L * 60L * 60L, t);
            Assert.IsTrue(month.Due);
            Assert.AreEqual(due.Coins, month.Coins, "never a function of the time away");
            Assert.AreEqual(due.Energy, month.Energy);

            Assert.IsFalse(ComebackReward.Evaluate(0L, t0, t).Due, "no earlier session");
            Assert.IsFalse(ComebackReward.Evaluate(t0, t0 - twelveHours * 3, t).Due, "clock set back");
            Assert.IsFalse(ComebackReward.Evaluate(t0, t0 + twelveHours * 2, TuningConfig.Prototype).Due, "prototype rules");
            Assert.IsTrue(ComebackReward.Evaluate(t0, t0 + twelveHours * 2, null).Due, "null tuning = Default");
        }
    }
}
