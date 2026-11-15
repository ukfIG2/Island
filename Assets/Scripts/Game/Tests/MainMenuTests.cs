using System;
using System.IO;
using NUnit.Framework;
using ResortEmpire.Sim;

namespace ResortEmpire.Game.Tests
{
    // CAM-50: the main menu says PLAY for a new resort and CONTINUE for one that is under way.
    public class MainMenuTests
    {
        // Finishing a wave saves the game; each test saves into its own temporary folder, never into the player's real save.
        static void InTempFolder(Action body)
        {
            string dir = Path.Combine(Path.GetTempPath(), "island-menu-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(dir);
            SaveSystem.PathOverride = Path.Combine(dir, "resort_save.json");
            try { body(); }
            finally
            {
                SaveSystem.PathOverride = null;
                Directory.Delete(dir, true);
            }
        }

        static GameController NewGame()
        {
            var tuning = TuningConfig.Default;
            return new GameController(tuning, ResortState.NewGame(tuning), 1, WaveTable.Default8());
        }

        [Test]
        public void ANewResort_HasNoProgress()
        {
            Assert.IsFalse(NewGame().HasProgress);
        }

        [Test]
        public void AWaveUnderWay_IsProgress()
        {
            InTempFolder(() =>
            {
                var game = NewGame();
                game.StartNextWave();
                Assert.IsTrue(game.HasProgress);
            });
        }

        [Test]
        public void AFinishedWave_IsProgress_EvenAfterTheResultIsClaimed()
        {
            InTempFolder(() =>
            {
                var game = NewGame();
                game.StartNextWave();
                for (int i = 0; i < 3000 && game.CurrentPhase != WavePhase.WaveComplete; i++) game.Tick(1f);
                Assert.AreEqual(WavePhase.WaveComplete, game.CurrentPhase);
                game.ContinueAfterResults();
                Assert.IsNull(game.ActiveWave, "between waves again");
                Assert.IsTrue(game.HasProgress);
            });
        }
    }
}
