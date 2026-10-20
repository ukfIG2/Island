using System;
using System.Collections.Generic;
using NUnit.Framework;

namespace ResortEmpire.Sim.Tests
{
    // Shared helpers for the MVP and VIP tests (the prototype suite keeps its own).
    static class SimTestKit
    {
        public const int TickGuard = 400000; // a stuck wave fails loudly instead of hanging

        public static float Dt => SimClock.DefaultStep;

        public static readonly BuildingId[] WaveBuildings =
        {
            BuildingId.Reception, BuildingId.Restaurant, BuildingId.BeachBar, BuildingId.Pool, BuildingId.Bungalows
        };

        public static WaveSimulation RunFullWave(ResortState resort, WaveDef wave, TuningConfig t)
        {
            var sim = new WaveSimulation(resort, wave, t);
            sim.StartWave();
            RunToComplete(sim, "wave " + wave.Index);
            return sim;
        }

        public static void RunToComplete(WaveSimulation sim, string context = "")
        {
            for (int i = 0; i < TickGuard && sim.Phase != WavePhase.WaveComplete; i++)
                sim.Tick(Dt);
            Assert.AreEqual(WavePhase.WaveComplete, sim.Phase, context + " never reached WaveComplete");
        }

        public static void TickUntilTime(WaveSimulation sim, float timeInWave)
        {
            for (int i = 0; i < TickGuard && sim.Phase != WavePhase.WaveComplete && sim.TimeInWave < timeInWave; i++)
                sim.Tick(Dt);
            Assert.GreaterOrEqual(sim.TimeInWave, timeInWave);
        }

        public static WaveDef CraftedWave(int rooms = 0, int drinks = 0, int food = 0, int relax = 0, int oceanView = 0,
            bool rush = false)
        {
            var w = new WaveDef { Index = 1, HasSuddenRush = rush };
            if (rooms > 0) w.Demand[NeedId.Rooms] = rooms;
            if (drinks > 0) w.Demand[NeedId.Drinks] = drinks;
            if (food > 0) w.Demand[NeedId.Food] = food;
            if (relax > 0) w.Demand[NeedId.Relax] = relax;
            if (oceanView > 0) w.Demand[NeedId.OceanView] = oceanView;
            return w;
        }

        public struct Spec
        {
            public BuildingId Id;
            public int Level;
            public int Workers;
            public bool Manager;

            public Spec(BuildingId id, int level, int workers, bool manager = false)
            {
                Id = id;
                Level = level;
                Workers = workers;
                Manager = manager;
            }
        }

        // A between-waves snapshot with exactly these buildings (in this order) and nothing else.
        public static ResortSnapshot Snapshot(params Spec[] buildings)
        {
            var managers = new List<int>();
            var snap = new ResortSnapshot
            {
                buildingIds = new int[buildings.Length],
                levels = new int[buildings.Length],
                workerCounts = new int[buildings.Length],
                specialistIds = new int[0],
                decor = new string[0],
                energy = 3,
            };
            for (int i = 0; i < buildings.Length; i++)
            {
                snap.buildingIds[i] = (int)buildings[i].Id;
                snap.levels[i] = buildings[i].Level;
                snap.workerCounts[i] = buildings[i].Workers;
                if (buildings[i].Manager) managers.Add((int)buildings[i].Id);
            }
            snap.managerIds = managers.ToArray();
            return snap;
        }

        public static ResortState Build(TuningConfig t, params Spec[] buildings) =>
            ResortState.FromSnapshot(t, Snapshot(buildings));

        // Every roster item a VIP can ask for: the five wave buildings with their Managers, the Spa and
        // both Specialists. Lv1, four workers, no Coins.
        public static ResortState FullyPrepared(TuningConfig t, int materials, int energy, bool spa = true)
        {
            var specs = new List<Spec>
            {
                new Spec(BuildingId.Reception, 1, 1, true),
                new Spec(BuildingId.Restaurant, 1, 1, true),
                new Spec(BuildingId.BeachBar, 1, 0, true),
                new Spec(BuildingId.Pool, 1, 1, true),
                new Spec(BuildingId.Bungalows, 1, 1, true),
            };
            if (spa) specs.Add(new Spec(BuildingId.Spa, 1, 0));
            var snap = Snapshot(specs.ToArray());
            snap.specialistIds = new[] { (int)SpecialistId.Butler, (int)SpecialistId.Captain };
            snap.materials = materials;
            snap.energy = energy;
            snap.reputation = 100;
            return ResortState.FromSnapshot(t, snap);
        }

        public static VipRequest Find(VipVisit visit, string title)
        {
            foreach (var r in visit.Requests)
                if (r.Title == title) return r;
            Assert.Fail(visit.Type + " has no request \"" + title + "\"");
            return null;
        }

        public static int Units(WaveDef wave)
        {
            int n = 0;
            foreach (var pair in wave.Demand) n += pair.Value;
            return n;
        }

        public static int ExpectedVipCoins(TuningConfig t, int tier) =>
            (int)Math.Round(t.VipCoinsBase * (double)t.CoinsRatingMult[tier], MidpointRounding.AwayFromZero);
    }
}
