using System;
using System.IO;
using NUnit.Framework;
using ResortEmpire.Sim;

namespace ResortEmpire.Game.Tests
{
    // CAM-74 (FR-033): Energy comes from finished waves and, optionally, from a rewarded video (a test stub for now).
    // A lack of Energy never blocks the service.
    public class EnergySourcesTests
    {
        static void InTempFolder(Action<string> body)
        {
            string dir = Path.Combine(Path.GetTempPath(), "island-energy-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(dir);
            SaveSystem.PathOverride = Path.Combine(dir, "resort_save.json");
            try { body(SaveSystem.PathOverride); }
            finally
            {
                SaveSystem.PathOverride = null;
                Directory.Delete(dir, true);
            }
        }

        static GameController NewGame(int energy)
        {
            var tuning = TuningConfig.Default;
            var resort = ResortState.NewGame(tuning);
            resort.Energy = energy;
            return new GameController(tuning, resort, 1, WaveTable.Default8());
        }

        [Test]
        public void TheVideoIsOfferedOnlyWhereSpeedUpWouldBeButTheEnergyIsShort()
        {
            InTempFolder(path =>
            {
                var game = NewGame(0);
                Assert.IsFalse(game.CanOfferTestAd(BuildingId.Reception), "nothing is offered between waves");

                game.StartNextWave();
                game.Tick(10f);
                Assert.IsTrue(game.CanOfferTestAd(BuildingId.Reception), "Energy is short");
                Assert.IsFalse(game.CanOfferTestAd(BuildingId.Pool), "a building that is not unlocked gets no offer");

                game.Resort.Energy = game.Tuning.EnergyBoostCost;
                Assert.IsFalse(game.CanOfferTestAd(BuildingId.Reception), "with the Energy for Speed Up the video is not needed");
                Assert.IsTrue(game.ActiveWave.CanBoost(BuildingId.Reception));

                game.Boost(BuildingId.Reception);
                game.Resort.Energy = 0;
                Assert.IsFalse(game.CanOfferTestAd(BuildingId.Reception), "the building is already boosted or has used its Speed Up");

                game.SetPaused(true);
                Assert.IsFalse(game.CanOfferTestAd(BuildingId.Restaurant), "nothing is offered while paused");
            });
        }

        [Test]
        public void WatchingTheVideo_AddsOneSpeedUpsWorthOfEnergy_AndTheWaveKeepsRunning()
        {
            InTempFolder(path =>
            {
                var game = NewGame(0);
                game.StartNextWave();
                game.Tick(10f);
                float before = game.ActiveWave.TimeInWave;

                game.WatchTestAd();

                Assert.AreEqual(game.Tuning.EnergyBoostCost, game.Resort.Energy);
                Assert.IsFalse(game.IsPaused, "the video never pauses the wave");
                game.Tick(2f);
                Assert.Greater(game.ActiveWave.TimeInWave, before, "the wave went on");
                Assert.IsTrue(game.Boost(BuildingId.Reception), "the Energy now buys a Speed Up");
            });
        }

        [Test]
        public void ALackOfEnergy_NeverBlocksAWave_AndTheWaveThenPaysEnergyOut()
        {
            InTempFolder(path =>
            {
                var game = NewGame(0);
                game.StartNextWave();
                for (int i = 0; i < 3000 && game.CurrentPhase != WavePhase.WaveComplete; i++) game.Tick(1f);
                Assert.AreEqual(WavePhase.WaveComplete, game.CurrentPhase);
                Assert.AreEqual(game.Tuning.EnergyDropByStars[game.ActiveWave.Result.Stars - 1], game.Resort.Energy,
                    "the finished wave is the main source of Energy");
            });
        }
    }
}
