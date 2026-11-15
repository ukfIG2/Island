using System;
using System.IO;
using NUnit.Framework;
using ResortEmpire.Sim;

namespace ResortEmpire.Game.Tests
{
    // CAM-28: the eight scripted waves are followed by endless waves, so the game goes on after the Resort summary.
    public class EndlessWavesTests
    {
        // Playing a wave saves the game; each test saves into its own temporary folder, never into the player's real save.
        static void InTempFolder(Action body)
        {
            string dir = Path.Combine(Path.GetTempPath(), "island-endless-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(dir);
            SaveSystem.PathOverride = Path.Combine(dir, "resort_save.json");
            try { body(); }
            finally
            {
                SaveSystem.PathOverride = null;
                Directory.Delete(dir, true);
            }
        }

        // A full resort (every building at Lv3, one Worker short of one per building), with the given waves cleared.
        static GameController ResortAfter(int wavesCompleted, int nextWave)
        {
            var tuning = TuningConfig.Default;
            var ids = new[] { BuildingId.Reception, BuildingId.Restaurant, BuildingId.BeachBar, BuildingId.Pool, BuildingId.Bungalows };
            var resort = ResortState.Restore(tuning, 0, 3, 0, wavesCompleted, 4, ids,
                new[] { 3, 3, 3, 3, 3 }, new[] { true, true, true, true, false });
            return new GameController(tuning, resort, nextWave, WaveTable.Default8());
        }

        static GameController Reopen()
        {
            var tuning = TuningConfig.Default;
            var loaded = SaveSystem.LoadOrNew(tuning);
            return new GameController(tuning, loaded.Resort, loaded.NextWaveIndex, WaveTable.Default8(), loaded.Wave);
        }

        static void RunToTheEnd(GameController game)
        {
            game.SetPaused(false);
            for (int i = 0; i < 3000 && game.CurrentPhase != WavePhase.WaveComplete; i++) game.Tick(1f);
            Assert.AreEqual(WavePhase.WaveComplete, game.CurrentPhase);
        }

        [Test]
        public void AfterTheEighthWave_TheGameGoesOnWithWaveNine()
        {
            InTempFolder(() =>
            {
                var game = ResortAfter(7, 8);
                Assert.IsFalse(game.CampaignComplete);
                game.StartNextWave();
                RunToTheEnd(game);
                game.ContinueAfterResults();

                Assert.IsTrue(game.CampaignComplete, "the Resort summary is earned");
                Assert.AreEqual(9, game.NextWaveIndex);
                Assert.AreEqual(9, game.NextWaveDef.Index);
                Assert.AreEqual(33, game.NextWaveDef.Demand[NeedId.Rooms], "31 x 1.06, rounded");

                game.StartNextWave();
                Assert.IsNotNull(game.ActiveWave, "wave 9 can be played");
                Assert.AreEqual(33, game.ActiveWave.DemandTotal(NeedId.Rooms));
            });
        }

        [Test]
        public void TheWavesKeepGoing_WaveAfterWave()
        {
            InTempFolder(() =>
            {
                var game = ResortAfter(8, 9);
                for (int wave = 9; wave <= 11; wave++)
                {
                    Assert.AreEqual(wave, game.NextWaveIndex);
                    game.StartNextWave();
                    RunToTheEnd(game);
                    Assert.AreEqual(wave, game.ActiveWave.Result.WaveIndex);
                    game.ContinueAfterResults();
                }
                Assert.AreEqual(12, game.NextWaveIndex);
                Assert.AreEqual(11, game.Resort.WavesCompleted);
            });
        }

        [Test]
        public void ASaveInsideWaveNine_ComesBackAsWaveNine_AndKeepsGoing()
        {
            InTempFolder(() =>
            {
                var game = ResortAfter(8, 9);
                game.StartNextWave();
                game.Tick(5f);
                game.LeaveApp();

                var back = Reopen();
                Assert.AreEqual(9, back.NextWaveIndex);
                Assert.IsNotNull(back.ActiveWave, "the running wave came back");
                Assert.IsTrue(back.IsPaused);
                Assert.AreEqual(33, back.ActiveWave.DemandTotal(NeedId.Rooms));
                RunToTheEnd(back);
                Assert.AreEqual(9, back.ActiveWave.Result.WaveIndex);
            });
        }

        [Test]
        public void TheSave_RemembersAWaveNumberBeyondEight()
        {
            InTempFolder(() =>
            {
                var game = ResortAfter(11, 12);
                game.LeaveApp();
                Assert.AreEqual(12, Reopen().NextWaveIndex);
            });
        }

        [Test]
        public void ASaveMadeBeforeTheWavesWentOn_ContinuesWithWaveNine()
        {
            // The older game stored 8 as the next wave once eight were cleared.
            var game = ResortAfter(8, 8);
            Assert.AreEqual(9, game.NextWaveIndex);
            Assert.AreEqual(9, game.NextWaveDef.Index);
        }

        [Test]
        public void EveryThirdEndlessWave_BringsTheSuddenRush_AndTheOthersDoNot()
        {
            InTempFolder(() =>
            {
                var rushing = ResortAfter(11, 12);
                rushing.StartNextWave();
                for (int i = 0; i < 50 && !rushing.ActiveWave.RushFired; i++) rushing.Tick(1f);
                Assert.IsTrue(rushing.ActiveWave.RushFired, "wave 12 has the rush");

                var calm = ResortAfter(9, 10);
                calm.StartNextWave();
                for (int i = 0; i < 70; i++) calm.Tick(1f);
                Assert.IsFalse(calm.ActiveWave.RushFired, "wave 10 has none");
            });
        }
    }
}
