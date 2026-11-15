using System;
using System.IO;
using System.Text.RegularExpressions;
using NUnit.Framework;
using ResortEmpire.Sim;

namespace ResortEmpire.Game.Tests
{
    // CAM-110: the game saves when the app is left and about every 10 seconds while a wave runs.
    // CAM-111: a saved wave comes back paused, exactly where it stopped.
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
                Assert.AreEqual(2, loaded.NextWaveIndex);
                Assert.AreEqual(coins, loaded.Resort.Coins);
                Assert.AreEqual(1, loaded.Resort.WavesCompleted);
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

        // --- CAM-111: coming back ------------------------------------------------------------------------------------

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
        public void ANewGame_StartsBetweenWaves()
        {
            InTempFolder(path =>
            {
                var game = Reopen();
                Assert.IsNull(game.ActiveWave);
                Assert.AreEqual(1, game.NextWaveIndex);
            });
        }

        [Test]
        public void ALeftWave_ComesBackPausedExactlyWhereItStopped_AndFinishesLikeTheOriginal()
        {
            InTempFolder(path =>
            {
                var original = NewGame();
                original.StartNextWave();
                original.Tick(30f);
                original.MoveWorker(BuildingId.Reception, BuildingId.BeachBar);   // a move during the wave is part of the moment
                original.Tick(12f);
                original.LeaveApp();

                var returned = Reopen();

                Assert.NotNull(returned.ActiveWave, "the wave should come back");
                Assert.IsTrue(returned.IsPaused, "it comes back paused, waiting for Resume");
                Assert.AreEqual(1, returned.NextWaveIndex);
                Assert.AreEqual(original.ActiveWave.TimeInWave, returned.ActiveWave.TimeInWave, 1e-3f);
                Assert.AreEqual(original.Resort.Energy, returned.Resort.Energy);
                foreach (NeedId need in Enum.GetValues(typeof(NeedId)))
                {
                    Assert.AreEqual(original.ActiveWave.QueueLength(need), returned.ActiveWave.QueueLength(need), "queue of " + need);
                    Assert.AreEqual(original.ActiveWave.SeatedCount(need), returned.ActiveWave.SeatedCount(need), "seated at " + need);
                    Assert.AreEqual(original.ActiveWave.ServedUnits(need), returned.ActiveWave.ServedUnits(need), "served at " + need);
                    Assert.AreEqual(original.ActiveWave.ArrivedUnits(need), returned.ActiveWave.ArrivedUnits(need), "arrived at " + need);
                }
                foreach (var b in original.Resort.Buildings)
                    Assert.AreEqual(b.HasWorker, returned.Resort.Get(b.Id).HasWorker, "Worker at " + b.Id);

                float held = returned.ActiveWave.TimeInWave;
                returned.Tick(5f);
                Assert.AreEqual(held, returned.ActiveWave.TimeInWave, "nothing runs until Resume");

                RunToTheEnd(original);
                RunToTheEnd(returned);
                Assert.AreEqual(original.ActiveWave.Result.Stars, returned.ActiveWave.Result.Stars);
                Assert.AreEqual(original.ActiveWave.Result.CoinsEarned, returned.ActiveWave.Result.CoinsEarned);
                Assert.AreEqual(original.ActiveWave.Result.Satisfaction, returned.ActiveWave.Result.Satisfaction, 1e-3f);
                Assert.AreEqual(original.Resort.Coins, returned.Resort.Coins);
            });
        }

        [Test]
        public void ASavedWave_RemembersWhereTheSuddenRushLanded()
        {
            InTempFolder(path =>
            {
                var tuning = TuningConfig.Default;
                var original = new GameController(tuning, ResortState.NewGame(tuning), 2, WaveTable.Default8());   // wave 2 has the rush
                original.StartNextWave();
                for (int i = 0; i < 600 && !original.ActiveWave.RushFired; i++) original.Tick(0.5f);
                Assert.IsTrue(original.ActiveWave.RushFired, "the rush should have landed by now");
                original.LeaveApp();

                var returned = Reopen();

                Assert.NotNull(returned.ActiveWave);
                Assert.IsTrue(returned.ActiveWave.RushFired, "a wave that comes back must not offer the rush prompt again");
                Assert.AreEqual(original.ActiveWave.RushNeed, returned.ActiveWave.RushNeed);
            });
        }

        [Test]
        public void AWaveThatDoesNotFit_IsIgnored_AndTheGameStartsBetweenWaves()
        {
            InTempFolder(path =>
            {
                var game = NewGame();
                game.StartNextWave();
                game.Tick(20f);
                game.LeaveApp();
                File.WriteAllText(path, File.ReadAllText(path).Replace("\"waveIndex\":1", "\"waveIndex\":5"));

                var returned = Reopen();

                Assert.IsNull(returned.ActiveWave);
                Assert.AreEqual(1, returned.NextWaveIndex);
            });
        }

        [Test]
        public void ASaveCutShortInTheMiddleOfAWave_ComesBackFromTheBackup()
        {
            InTempFolder(path =>
            {
                var game = NewGame();
                game.StartNextWave();
                game.Tick(20f);
                game.LeaveApp();
                game.SetPaused(false);
                game.Tick(10f);
                game.LeaveApp();                                       // the second save leaves the first as the backup
                string whole = File.ReadAllText(path);
                File.WriteAllText(path, whole.Substring(0, whole.Length / 2));   // the app was killed while writing

                var returned = Reopen();

                Assert.NotNull(returned.ActiveWave, "the backup holds the wave");
                Assert.IsTrue(returned.IsPaused);
            });
        }
    }
}
