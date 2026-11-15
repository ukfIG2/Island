using NUnit.Framework;

namespace ResortEmpire.Sim.Tests
{
    // CAM-38: the result says why the worst line grew, so the player picks a Worker or an upgrade.
    public class WaveCauseTests
    {
        static float Dt => SimClock.DefaultStep;

        static WaveResult Play(ResortState resort, int waveIndex)
        {
            var sim = new WaveSimulation(resort, WaveTable.Default8()[waveIndex - 1], TuningConfig.Default);
            sim.StartWave();
            for (int i = 0; i < 400000 && sim.Phase != WavePhase.WaveComplete; i++) sim.Tick(Dt);
            Assert.AreEqual(WavePhase.WaveComplete, sim.Phase);
            return sim.Result;
        }

        [Test]
        public void ALineThatGrewWithNobodyThere_IsAStaffingProblem()
        {
            var t = TuningConfig.Default;
            var result = Play(ResortState.NewGame(t), 2);              // the Beach Bar has no Worker
            Assert.AreEqual(NeedId.Drinks, result.WorstNeed);
            Assert.AreEqual(BottleneckCause.Staffing, result.WorstNeedCause);
        }

        [Test]
        public void ALineThatGrewAtAStaffedBuilding_IsACapacityProblem()
        {
            var t = TuningConfig.Default;
            var ids = new[] { BuildingId.Reception, BuildingId.Restaurant, BuildingId.BeachBar, BuildingId.Pool, BuildingId.Bungalows };
            var levels = new[] { 1, 1, 1, 1, 3 };
            var hasWorker = new[] { true, true, true, true, false };   // the Bungalows have no Worker but enough seats to cope
            var resort = ResortState.Restore(t, 0, 3, 0, 6, 4, ids, levels, hasWorker);
            var result = Play(resort, 8);
            Assert.IsTrue(result.WorstNeed.HasValue);
            Assert.AreNotEqual(NeedId.OceanView, result.WorstNeed, "the worst line is a staffed one");
            Assert.AreEqual(BottleneckCause.Capacity, result.WorstNeedCause);
        }

        [Test]
        public void AWaveWithNoBottleneck_HasNoCause()
        {
            var t = TuningConfig.Default;
            var ids = new[] { BuildingId.Reception, BuildingId.Restaurant, BuildingId.BeachBar };
            var resort = ResortState.Restore(t, 0, 3, 0, 0, 2, ids, new[] { 3, 3, 3 }, new[] { true, true, false });
            var result = Play(resort, 1);                              // wave 1 with the biggest buildings: lines stay short
            Assert.IsFalse(result.WorstNeed.HasValue);
            Assert.AreEqual(BottleneckCause.None, result.WorstNeedCause);
        }
    }
}
