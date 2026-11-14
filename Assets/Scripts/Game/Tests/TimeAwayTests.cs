using System;
using System.IO;
using System.Text.RegularExpressions;
using NUnit.Framework;
using ResortEmpire.Sim;

namespace ResortEmpire.Game.Tests
{
    // CAM-54 (FR-063, FR-034): time away never lowers anything, and nothing is earned while away. Nothing in the
    // game reads the clock to change the resort; these tests keep it that way.
    public class TimeAwayTests
    {
        static void InTempFolder(Action<string> body)
        {
            string dir = Path.Combine(Path.GetTempPath(), "island-away-" + Guid.NewGuid().ToString("N"));
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

        static GameController Reopen()
        {
            var tuning = TuningConfig.Default;
            var loaded = SaveSystem.LoadOrNew(tuning);
            return new GameController(tuning, loaded.Resort, loaded.NextWaveIndex, WaveTable.Default8(), loaded.Wave);
        }

        [Test]
        public void ASaveOpenedLongAfterItWasWritten_ComesBackExactlyAsItWasLeft()
        {
            InTempFolder(path =>
            {
                var game = NewGame();
                game.StartNextWave();
                game.Tick(40f);
                game.LeaveApp();
                // Pretend the app was left in 1970: the longest time away there can be.
                File.WriteAllText(path, Regex.Replace(File.ReadAllText(path), "\"savedAtUnix\":\\d+", "\"savedAtUnix\":1"));

                var returned = Reopen();

                Assert.AreEqual(game.Resort.Coins, returned.Resort.Coins);
                Assert.AreEqual(game.Resort.Energy, returned.Resort.Energy);
                Assert.AreEqual(game.Resort.ResortValue, returned.Resort.ResortValue);
                Assert.AreEqual(game.Resort.WavesCompleted, returned.Resort.WavesCompleted);
                foreach (var b in game.Resort.Buildings)
                {
                    Assert.AreEqual(b.Level, returned.Resort.Get(b.Id).Level, "level of " + b.Id);
                    Assert.AreEqual(b.HasWorker, returned.Resort.Get(b.Id).HasWorker, "Worker at " + b.Id);
                }
                Assert.NotNull(returned.ActiveWave);
                Assert.AreEqual(game.ActiveWave.TimeInWave, returned.ActiveWave.TimeInWave, 1e-3f);
            });
        }

        [Test]
        public void ASavedWave_DoesNotAdvanceWhilePausedHoweverMuchTimePasses()
        {
            InTempFolder(path =>
            {
                var game = NewGame();
                game.StartNextWave();
                game.Tick(40f);
                game.LeaveApp();
                var returned = Reopen();
                float held = returned.ActiveWave.TimeInWave;
                int served = returned.ActiveWave.ServedUnits(NeedId.Rooms);

                returned.Tick(86400f);                                 // a whole day of real time

                Assert.IsTrue(returned.IsPaused);
                Assert.AreEqual(held, returned.ActiveWave.TimeInWave);
                Assert.AreEqual(served, returned.ActiveWave.ServedUnits(NeedId.Rooms));
            });
        }

        [Test]
        public void BetweenWaves_NoCoinsOrEnergyAppearWithTime()
        {
            var game = NewGame();
            int coins = game.Resort.Coins, energy = game.Resort.Energy, value = game.Resort.ResortValue;

            game.Tick(1000000f);                                       // no wave is running: nothing happens

            Assert.IsNull(game.ActiveWave);
            Assert.AreEqual(coins, game.Resort.Coins);
            Assert.AreEqual(energy, game.Resort.Energy);
            Assert.AreEqual(value, game.Resort.ResortValue);
        }
    }
}
