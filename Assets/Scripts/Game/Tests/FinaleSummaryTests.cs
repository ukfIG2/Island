using NUnit.Framework;
using ResortEmpire.Sim;

namespace ResortEmpire.Game.Tests
{
    // CAM-113: the Resort summary after wave 8.
    public class FinaleSummaryTests
    {
        [Test]
        public void TheSummaryCountsWavesStarsValueAndBuildings()
        {
            var t = TuningConfig.Default;
            var ids = new[] { BuildingId.Reception, BuildingId.Restaurant, BuildingId.BeachBar, BuildingId.Pool };
            var resort = ResortState.Restore(t, 800, 3, 640, 8, 3, ids, new[] { 3, 2, 1, 2 }, new[] { true, true, true, false }, 31);

            var summary = FinaleSummary.For(resort, WaveTable.Default8());

            Assert.AreEqual(8, summary.WavesCleared);
            Assert.AreEqual(8, summary.TotalWaves);
            Assert.AreEqual(31, summary.Stars);
            Assert.AreEqual(40, summary.MaxStars, "eight waves, five stars each");
            Assert.AreEqual(640, summary.ResortValue);
            CollectionAssert.AreEqual(new[] { "Reception Lv 3", "Restaurant Lv 2", "Beach Bar Lv 1", "Pool Lv 2" }, summary.Buildings);
        }

        [Test]
        public void TheWavesClearedNeverExceedTheWavesThatExist()
        {
            var t = TuningConfig.Default;
            var ids = new[] { BuildingId.Reception };
            var resort = ResortState.Restore(t, 0, 0, 0, 12, 0, ids, new[] { 1 }, new[] { true }, 0);   // an endless game, later
            Assert.AreEqual(8, FinaleSummary.For(resort, WaveTable.Default8()).WavesCleared);
        }
    }
}
