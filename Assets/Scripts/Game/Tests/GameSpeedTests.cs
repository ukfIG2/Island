using System;
using System.IO;
using NUnit.Framework;
using ResortEmpire.Sim;

namespace ResortEmpire.Game.Tests
{
    // CAM-112: game speed x1 / x2 / x4. A faster game is the same game: the result never depends on the speed.
    public class GameSpeedTests
    {
        // A running wave autosaves, so every test saves into its own temporary folder.
        static void InTempFolder(Action<string> body)
        {
            string dir = Path.Combine(Path.GetTempPath(), "island-speed-" + Guid.NewGuid().ToString("N"));
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
        public void CycleSpeed_StepsThroughOneTwoFourAndBackToOne()
        {
            var game = NewGame();
            Assert.AreEqual(1f, game.SimSpeed, "every launch starts at x1");
            game.CycleSpeed(); Assert.AreEqual(2f, game.SimSpeed);
            game.CycleSpeed(); Assert.AreEqual(4f, game.SimSpeed);
            game.CycleSpeed(); Assert.AreEqual(1f, game.SimSpeed);
            game.SimSpeed = 3f;                                         // not a step: the next press goes back to x1
            game.CycleSpeed(); Assert.AreEqual(1f, game.SimSpeed);
            Assert.AreEqual("1x", GameController.SpeedLabel(1f));
            Assert.AreEqual("4x", GameController.SpeedLabel(4f));
        }

        // Plays wave 1 with half-second frames; returns how many frames it took and the result.
        static int PlayWaveOne(float speed, out WaveResult result, out int coins)
        {
            var game = NewGame();
            game.SimSpeed = speed;
            game.StartNextWave();
            int frames = 0;
            while (game.CurrentPhase != WavePhase.WaveComplete && frames < 100000) { game.Tick(0.5f); frames++; }
            Assert.AreEqual(WavePhase.WaveComplete, game.CurrentPhase);
            result = game.ActiveWave.Result;
            coins = game.Resort.Coins;
            return frames;
        }

        [Test]
        public void TheResultOfAWaveIsTheSameAtEverySpeed_AndFasterSpeedsNeedProportionallyFewerFrames()
        {
            InTempFolder(path =>
            {
                int f1 = PlayWaveOne(1f, out var r1, out int c1);
                int f2 = PlayWaveOne(2f, out var r2, out int c2);
                int f4 = PlayWaveOne(4f, out var r4, out int c4);

                Assert.AreEqual(r1.Stars, r2.Stars); Assert.AreEqual(r1.Stars, r4.Stars);
                Assert.AreEqual(r1.Satisfaction, r2.Satisfaction); Assert.AreEqual(r1.Satisfaction, r4.Satisfaction);
                Assert.AreEqual(r1.CoinsEarned, r2.CoinsEarned); Assert.AreEqual(r1.CoinsEarned, r4.CoinsEarned);
                Assert.AreEqual(c1, c2); Assert.AreEqual(c1, c4);

                Assert.LessOrEqual(Math.Abs(f1 - 2 * f2), 2, "x2 needs half the frames");
                Assert.LessOrEqual(Math.Abs(f1 - 4 * f4), 4, "x4 needs a quarter of the frames");
            });
        }

        [Test]
        public void TheSpeedIsNotSaved_ALaunchStartsAtOne()
        {
            InTempFolder(path =>
            {
                var game = NewGame();
                game.SimSpeed = 4f;
                game.LeaveApp();
                var loaded = SaveSystem.LoadOrNew(TuningConfig.Default);
                var returned = new GameController(TuningConfig.Default, loaded.Resort, loaded.NextWaveIndex, WaveTable.Default8(), loaded.Wave);
                Assert.AreEqual(1f, returned.SimSpeed);
            });
        }
    }
}
