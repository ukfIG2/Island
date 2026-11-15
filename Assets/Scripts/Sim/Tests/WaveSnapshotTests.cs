using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
using NUnit.Framework;

namespace ResortEmpire.Sim.Tests
{
    // CAM-109: a wave in progress can be written down and rebuilt exactly.
    public class WaveSnapshotTests
    {
        const int Guard = 400000;
        static float Dt => SimClock.DefaultStep;
        static TuningConfig T => TuningConfig.Default;

        // --- a deterministic player: the same actions at the same ticks, whether or not the wave was restored ---------

        static void Step(WaveSimulation sim, ResortState resort, int tick)
        {
            if (tick == 400)       // 20 s: move a Worker onto the first unstaffed building
            {
                BuildingId? empty = null, from = null;
                foreach (var b in resort.Buildings)
                {
                    if (!b.HasWorker) { if (empty == null) empty = b.Id; }
                    else if (from == null) from = b.Id;
                }
                if (empty != null && from != null) sim.MoveWorker(from.Value, empty.Value);
            }
            if (tick == 700)       // 35 s: Speed Up the building with the longest line
            {
                BuildingId? best = null;
                int bestQueue = 0;
                foreach (var b in resort.Buildings)
                {
                    int q = sim.QueueLength(b.Serves);
                    if (q > bestQueue) { bestQueue = q; best = b.Id; }
                }
                if (best != null) sim.UseEnergyBoost(best.Value);
            }
            if (tick == 1300)      // 65 s: move a Worker back the other way
            {
                BuildingId? from = null, to = null;
                foreach (var b in resort.Buildings)
                {
                    if (b.HasWorker) { if (to == null || b.Level > 0) from = b.Id; }
                    else to = b.Id;
                }
                if (from != null && to != null) sim.MoveWorker(from.Value, to.Value);
            }
        }

        sealed class Outcome
        {
            public WaveResult Result;
            public int Ticks, Coins, Energy, ResortValue, WavesCompleted;
            public bool InWave;
        }

        static Outcome Finish(WaveSimulation sim, ResortState resort, int fromTick)
        {
            int tick = fromTick;
            while (sim.Phase != WavePhase.WaveComplete && tick < Guard)
            {
                Step(sim, resort, tick);
                sim.Tick(Dt);
                tick++;
            }
            Assert.AreEqual(WavePhase.WaveComplete, sim.Phase, "the wave never completed");
            return new Outcome
            {
                Result = sim.Result, Ticks = tick, Coins = resort.Coins, Energy = resort.Energy,
                ResortValue = resort.ResortValue, WavesCompleted = resort.WavesCompleted, InWave = resort.InWave
            };
        }

        // The resort for a wave: every need the wave has is unlocked, one building has no Worker.
        static ResortState MakeResort(int waveIndex, int variant)
        {
            var ids = new List<BuildingId> { BuildingId.Reception, BuildingId.Restaurant, BuildingId.BeachBar };
            if (waveIndex >= 4) ids.Add(BuildingId.Pool);
            if (waveIndex >= 7) ids.Add(BuildingId.Bungalows);
            int n = ids.Count;
            var levels = new int[n];
            var hasWorker = new bool[n];
            for (int i = 0; i < n; i++) { levels[i] = variant == 0 ? 1 : 2; hasWorker[i] = true; }
            hasWorker[variant == 0 ? 2 : 0] = false;   // variant 0: Beach Bar empty, Lv1; variant 1: Reception empty, Lv2
            return ResortState.Restore(T, 0, 6, 0, waveIndex - 1, n - 1, ids.ToArray(), levels, hasWorker);
        }

        static ResortState CloneResort(ResortState r)
        {
            int n = r.Buildings.Count;
            var ids = new BuildingId[n];
            var levels = new int[n];
            var hasWorker = new bool[n];
            for (int i = 0; i < n; i++) { ids[i] = r.Buildings[i].Id; levels[i] = r.Buildings[i].Level; hasWorker[i] = r.Buildings[i].HasWorker; }
            return ResortState.Restore(T, r.Coins, r.Energy, r.ResortValue, r.WavesCompleted, r.Workers, ids, levels, hasWorker);
        }

        // A deep copy that passes every number through a function, so a test can make the numbers lossy.
        static WaveSnapshot Copy(WaveSnapshot s, Func<float, float> f)
        {
            Func<UnitSnapshot[], UnitSnapshot[]> units = list =>
            {
                var o = new UnitSnapshot[list.Length];
                for (int i = 0; i < o.Length; i++) o[i] = new UnitSnapshot { spawn = f(list[i].spawn), wait = f(list[i].wait), progress = f(list[i].progress) };
                return o;
            };
            var c = new WaveSnapshot
            {
                version = s.version, waveIndex = s.waveIndex, phase = s.phase, timeInWave = f(s.timeInWave),
                incomingElapsed = f(s.incomingElapsed), rushTriggered = s.rushTriggered,
                lanes = new LaneSnapshot[s.lanes.Length], boosts = new BoostSnapshot[s.boosts.Length]
            };
            for (int i = 0; i < s.lanes.Length; i++)
            {
                var l = s.lanes[i];
                var pending = new float[l.pending.Length];
                for (int k = 0; k < pending.Length; k++) pending[k] = f(l.pending[k]);
                c.lanes[i] = new LaneSnapshot
                {
                    need = l.need, demand = l.demand, pending = pending, nextSpawn = l.nextSpawn, queue = units(l.queue), seated = units(l.seated),
                    served = l.served, waitSum = f(l.waitSum), contributionSum = f(l.contributionSum), status = l.status, prevQueue = l.prevQueue,
                    nonDecreasingSeconds = f(l.nonDecreasingSeconds), bottleneckSeconds = f(l.bottleneckSeconds),
                    unstaffedBottleneckSeconds = f(l.unstaffedBottleneckSeconds), helpGrace = f(l.helpGrace)
                };
            }
            for (int i = 0; i < s.boosts.Length; i++)
                c.boosts[i] = new BoostSnapshot { building = s.boosts[i].building, used = s.boosts[i].used, remaining = f(s.boosts[i].remaining) };
            return c;
        }

        static float SevenDigits(float v) => float.Parse(v.ToString("G7", CultureInfo.InvariantCulture), CultureInfo.InvariantCulture);

        static string Fingerprint(WaveSnapshot s)
        {
            var sb = new StringBuilder();
            sb.Append(s.waveIndex).Append('|').Append(s.phase).Append('|').Append(s.timeInWave.ToString("R", CultureInfo.InvariantCulture)).Append('|').Append(s.rushTriggered);
            foreach (var l in s.lanes)
            {
                sb.Append('#').Append(l.demand).Append(',').Append(l.nextSpawn).Append(',').Append(l.served).Append(',').Append(l.status);
                foreach (var p in l.pending) sb.Append(',').Append(p.ToString("R", CultureInfo.InvariantCulture));
                foreach (var u in l.queue) sb.Append(";q").Append(u.spawn.ToString("R", CultureInfo.InvariantCulture));
                foreach (var u in l.seated) sb.Append(";s").Append(u.progress.ToString("R", CultureInfo.InvariantCulture));
            }
            return sb.ToString();
        }

        // Every tick of a coarse grid, plus the moments where something happens: the first ticks of the arrival boat,
        // the player's actions, the Sudden rush at 45 s (tick 900), the running boost, and the last ticks of the wave.
        static SortedSet<int> Moments(int totalTicks)
        {
            var m = new SortedSet<int>();
            for (int t = 0; t < totalTicks; t += 331) m.Add(t);
            foreach (int t in new[] { 1, 2, 3, 49, 50, 51, 52, 53, 54, 55, 399, 400, 401, 699, 700, 701, 1000, 1299, 1300, 1301 }) m.Add(t);
            for (int t = 880; t <= 960; t += 5) m.Add(t);
            for (int t = totalTicks - 6; t < totalTicks; t++) m.Add(t);
            m.RemoveWhere(t => t < 0 || t >= totalTicks);
            return m;
        }

        delegate void Check(string where, Outcome reference, Outcome restored);

        // Plays the wave once uninterrupted for the reference, then again, restoring a copy at every chosen moment.
        static int RoundTripEveryWave(Func<WaveSnapshot, WaveSnapshot> transform, Check check)
        {
            int restores = 0;
            var table = WaveTable.Default8();
            for (int w = 1; w <= 8; w++)
                for (int variant = 0; variant < 2; variant++)
                {
                    var def = table[w - 1];
                    var refResort = MakeResort(w, variant);
                    var refSim = new WaveSimulation(refResort, def, T);
                    refSim.StartWave();
                    var reference = Finish(refSim, refResort, 0);

                    var moments = Moments(reference.Ticks);
                    var resort = MakeResort(w, variant);
                    var sim = new WaveSimulation(resort, def, T);
                    sim.StartWave();
                    for (int tick = 0; sim.Phase != WavePhase.WaveComplete && tick < Guard; tick++)
                    {
                        if (moments.Contains(tick))
                        {
                            var snap = transform(sim.ToSnapshot());
                            var copy = CloneResort(resort);
                            var restored = WaveSimulation.FromSnapshot(copy, def, T, snap);
                            string where = "wave " + w + ", variant " + variant + ", tick " + tick;
                            Assert.NotNull(restored, "could not restore at " + where);
                            check(where, reference, Finish(restored, copy, tick));
                            restores++;
                        }
                        Step(sim, resort, tick);
                        sim.Tick(Dt);
                    }
                }
            return restores;
        }

        // --- the proof ---------------------------------------------------------------------------------------------------

        [Test]
        public void RoundTrip_AtManyMoments_GivesExactlyTheResultOfAnUninterruptedWave()
        {
            int restores = RoundTripEveryWave(s => Copy(s, v => v), (where, a, b) =>
            {
                Assert.AreEqual(a.Ticks, b.Ticks, "completion tick at " + where);
                Assert.AreEqual(a.Result.Stars, b.Result.Stars, "stars at " + where);
                Assert.AreEqual(a.Result.Perfect, b.Result.Perfect, "perfect at " + where);
                Assert.AreEqual(a.Result.Satisfaction, b.Result.Satisfaction, "satisfaction at " + where);
                Assert.AreEqual(a.Result.CoinsEarned, b.Result.CoinsEarned, "coins earned at " + where);
                Assert.AreEqual(a.Result.EnergyEarned, b.Result.EnergyEarned, "energy earned at " + where);
                Assert.AreEqual(a.Result.WorstNeed, b.Result.WorstNeed, "worst need at " + where);
                Assert.AreEqual(a.Result.WorstNeedCause, b.Result.WorstNeedCause, "cause of the worst need at " + where);
                Assert.AreEqual(a.Coins, b.Coins, "resort coins at " + where);
                Assert.AreEqual(a.Energy, b.Energy, "resort energy at " + where);
                Assert.AreEqual(a.ResortValue, b.ResortValue, "resort value at " + where);
                Assert.AreEqual(a.WavesCompleted, b.WavesCompleted, "waves completed at " + where);
                Assert.IsFalse(b.InWave, "the resort left the wave at " + where);
            });
            Assert.Greater(restores, 300, "the test should cover many moments");
        }

        [Test]
        public void RoundTrip_SurvivesNumbersRoundedToSevenDigits()
        {
            // A text save may keep fewer digits than a float holds; the result must not change in any way that matters.
            RoundTripEveryWave(s => Copy(s, SevenDigits), (where, a, b) =>
            {
                Assert.AreEqual(a.Result.Stars, b.Result.Stars, "stars at " + where);
                Assert.AreEqual(a.Result.Perfect, b.Result.Perfect, "perfect at " + where);
                Assert.AreEqual(a.Result.Satisfaction, b.Result.Satisfaction, 1e-3f, "satisfaction at " + where);
                Assert.AreEqual(a.Result.CoinsEarned, b.Result.CoinsEarned, "coins earned at " + where);
                Assert.AreEqual(a.Coins, b.Coins, "resort coins at " + where);
            });
        }

        [Test]
        public void ToSnapshot_IsNullBeforeTheWaveStartsAndAfterItEnds()
        {
            var resort = MakeResort(1, 0);
            var sim = new WaveSimulation(resort, WaveTable.Default8()[0], T);
            Assert.IsNull(sim.ToSnapshot());                 // AwaitingWave
            sim.StartWave();
            Assert.NotNull(sim.ToSnapshot());                // WaveIncoming
            Finish(sim, resort, 0);
            Assert.IsNull(sim.ToSnapshot());                 // WaveComplete
        }

        [Test]
        public void Snapshot_DoesNotShareStateWithTheLiveWave()
        {
            var resort = MakeResort(3, 0);
            var sim = new WaveSimulation(resort, WaveTable.Default8()[2], T);
            sim.StartWave();
            for (int i = 0; i < 1500; i++) sim.Tick(Dt);
            var snap = sim.ToSnapshot();
            string before = Fingerprint(snap);
            for (int i = 0; i < 1500; i++) sim.Tick(Dt);
            Assert.AreEqual(before, Fingerprint(snap), "the snapshot changed while the wave went on");
        }

        [Test]
        public void FromSnapshot_RefusesDataThatDoesNotFit_AndLeavesTheResortUntouched()
        {
            var def = WaveTable.Default8()[1];
            var resort = MakeResort(2, 0);
            var sim = new WaveSimulation(resort, def, T);
            sim.StartWave();
            for (int i = 0; i < 1000; i++) sim.Tick(Dt);
            Func<WaveSnapshot> fresh = () => Copy(sim.ToSnapshot(), v => v);

            Assert.NotNull(WaveSimulation.FromSnapshot(CloneResort(resort), def, T, fresh()), "the untouched snapshot must fit");
            Assert.IsNull(WaveSimulation.FromSnapshot(CloneResort(resort), def, T, null));

            var wrongWave = fresh(); wrongWave.waveIndex = 5;
            Assert.IsNull(WaveSimulation.FromSnapshot(CloneResort(resort), def, T, wrongWave));

            var wrongVersion = fresh(); wrongVersion.version = 99;
            Assert.IsNull(WaveSimulation.FromSnapshot(CloneResort(resort), def, T, wrongVersion));

            var notRunning = fresh(); notRunning.phase = (int)WavePhase.WaveComplete;
            Assert.IsNull(WaveSimulation.FromSnapshot(CloneResort(resort), def, T, notRunning));

            var notANumber = fresh(); notANumber.timeInWave = float.NaN;
            Assert.IsNull(WaveSimulation.FromSnapshot(CloneResort(resort), def, T, notANumber));

            var negative = fresh(); negative.lanes[0].served = -1;
            Assert.IsNull(WaveSimulation.FromSnapshot(CloneResort(resort), def, T, negative));

            var tooFewLanes = fresh(); tooFewLanes.lanes = new LaneSnapshot[2];
            Assert.IsNull(WaveSimulation.FromSnapshot(CloneResort(resort), def, T, tooFewLanes));

            var badSpawnIndex = fresh(); badSpawnIndex.lanes[0].nextSpawn = badSpawnIndex.lanes[0].pending.Length + 1;
            Assert.IsNull(WaveSimulation.FromSnapshot(CloneResort(resort), def, T, badSpawnIndex));

            var missingBoosts = fresh(); missingBoosts.boosts = null;
            Assert.IsNull(WaveSimulation.FromSnapshot(CloneResort(resort), def, T, missingBoosts));

            // A wave that has no Pool cannot come back with guests for the Pool: locked needs never spawn (WR9).
            var withPoolGuests = fresh();
            withPoolGuests.lanes[(int)NeedId.Relax].status = (int)NeedStatus.Ok;
            Assert.IsNull(WaveSimulation.FromSnapshot(CloneResort(resort), def, T, withPoolGuests));

            // A refusal must not change the resort it was given.
            var untouched = CloneResort(resort);
            untouched.InWave = false;
            Assert.IsNull(WaveSimulation.FromSnapshot(untouched, def, T, wrongWave));
            Assert.IsFalse(untouched.InWave);
        }
    }
}
