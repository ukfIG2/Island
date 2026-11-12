using System;
using System.IO;
using NUnit.Framework;
using ResortEmpire.Sim;

namespace ResortEmpire.Game.Tests
{
    // CAM-113: the stars of every finished wave are added up, for the finale summary, and survive a save.
    public class StarsEarnedTests
    {
        static void InTempFolder(Action<string> body)
        {
            string dir = Path.Combine(Path.GetTempPath(), "island-stars-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(dir);
            SaveSystem.PathOverride = Path.Combine(dir, "resort_save.json");
            try { body(SaveSystem.PathOverride); }
            finally
            {
                SaveSystem.PathOverride = null;
                Directory.Delete(dir, true);
            }
        }

        [Test]
        public void TheStarsOfEveryWaveAreAddedUp_AndSurviveASave()
        {
            InTempFolder(path =>
            {
                var tuning = TuningConfig.Default;
                var game = new GameController(tuning, ResortState.NewGame(tuning), 1, WaveTable.Default8());
                Assert.AreEqual(0, game.Resort.StarsEarned);

                int expected = 0;
                for (int wave = 1; wave <= 3; wave++)
                {
                    game.StartNextWave();
                    for (int i = 0; i < 3000 && game.CurrentPhase != WavePhase.WaveComplete; i++) game.Tick(1f);
                    Assert.AreEqual(WavePhase.WaveComplete, game.CurrentPhase);
                    expected += game.ActiveWave.Result.Stars;
                    game.ContinueAfterResults();
                    Assert.AreEqual(expected, game.Resort.StarsEarned, "after wave " + wave);
                }
                Assert.Greater(expected, 0);

                var loaded = SaveSystem.LoadOrNew(tuning);
                Assert.AreEqual(expected, loaded.Resort.StarsEarned);
            });
        }
    }
}
