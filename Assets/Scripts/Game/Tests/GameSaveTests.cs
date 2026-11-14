using System;
using System.IO;
using System.Text.RegularExpressions;
using NUnit.Framework;
using ResortEmpire.Sim;

namespace ResortEmpire.Game.Tests
{
    // CAM-110: the game saves when the app is left and about every 10 seconds while a wave runs.
    public class GameSaveTests
    {
        // Each test saves into its own temporary folder, never into the player's real save.
        static void InTempFolder(Action<string> body)
        {
            string dir = Path.Combine(Path.GetTempPath(), "island-save-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(dir);
            SaveSystem.PathOverride = Path.Combine(dir, "resort_save.json");
            try { body(SaveSystem.PathOverride); }
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
        public void LeavingTheApp_PausesARunningWaveAndSavesIt()
        {
            InTempFolder(path =>
            {
                var game = NewGame();
                game.StartNextWave();
                game.Tick(3f);
                float before = game.ActiveWave.TimeInWave;

                game.LeaveApp();

                Assert.IsTrue(game.IsPaused);
                Assert.IsTrue(File.Exists(path));
                StringAssert.Contains("\"hasWave\":true", File.ReadAllText(path));
                game.Tick(5f);                                         // nothing runs while the player is away
                Assert.AreEqual(before, game.ActiveWave.TimeInWave);
            });
        }

        [Test]
        public void LeavingTheApp_BetweenWaves_SavesWithoutAWave()
        {
            InTempFolder(path =>
            {
                var game = NewGame();
                game.LeaveApp();
                Assert.IsFalse(game.IsPaused);
                StringAssert.Contains("\"hasWave\":false", File.ReadAllText(path));
            });
        }

        [Test]
        public void ARunningWave_IsSavedAboutEveryTenSeconds()
        {
            InTempFolder(path =>
            {
                var game = NewGame();
                game.StartNextWave();
                game.Tick(4f);
                Assert.IsFalse(File.Exists(path), "too early for a save");
                game.Tick(7f);                                         // 11 real seconds in
                Assert.IsTrue(File.Exists(path), "the first autosave");
                Assert.IsFalse(File.Exists(SafeFile.BackupPath(path)));
                game.Tick(11f);                                        // the second autosave leaves the first as the backup
                Assert.IsTrue(File.Exists(SafeFile.BackupPath(path)));
            });
        }

        [Test]
        public void LeavingTheApp_AtTheResultScreen_SavesTheNextWaveWithTheRewardsPaidOnce()
        {
            InTempFolder(path =>
            {
                var game = NewGame();
                game.StartNextWave();
                for (int i = 0; i < 2000 && game.CurrentPhase != WavePhase.WaveComplete; i++) game.Tick(1f);
                Assert.AreEqual(WavePhase.WaveComplete, game.CurrentPhase);
                int coins = game.Resort.Coins;
                Assert.Greater(coins, 0);

                game.LeaveApp();

                StringAssert.Contains("\"hasWave\":false", File.ReadAllText(path));
                var loaded = SaveSystem.LoadOrNew(TuningConfig.Default);
                Assert.AreEqual(2, loaded.nextWaveIndex);
                Assert.AreEqual(coins, loaded.resort.Coins);
                Assert.AreEqual(1, loaded.resort.WavesCompleted);
            });
        }

        [Test]
        public void TheSave_KeepsTheTimeOfTheLastPlay()
        {
            InTempFolder(path =>
            {
                NewGame().LeaveApp();
                long saved = long.Parse(Regex.Match(File.ReadAllText(path), "\"savedAtUnix\":(\\d+)").Groups[1].Value);
                long now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
                Assert.LessOrEqual(Math.Abs(now - saved), 120);
            });
        }
    }
}
