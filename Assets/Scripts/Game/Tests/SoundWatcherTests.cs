using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using NUnit.Framework;
using ResortEmpire.Game.Sound;
using ResortEmpire.Sim;

namespace ResortEmpire.Game.Tests
{
    // CAM-117: the game asks for the right sound at the right moment. Nobody can listen to a test, so these drive a
    // real game and read the cues the watcher asks for.
    public class SoundWatcherTests
    {
        // Playing a wave saves the game; each test saves into its own temporary folder, never into the player's real save.
        static void InTempFolder(Action body)
        {
            string dir = Path.Combine(Path.GetTempPath(), "island-sound-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(dir);
            SaveSystem.PathOverride = Path.Combine(dir, "resort_save.json");
            try { body(); }
            finally
            {
                SaveSystem.PathOverride = null;
                Directory.Delete(dir, true);
            }
        }

        sealed class Heard
        {
            public readonly List<SoundCue> Cues = new List<SoundCue>();
            public readonly List<float> Volumes = new List<float>();
            public void Add(SoundCue cue, float volume) { Cues.Add(cue); Volumes.Add(volume); }
            public int Count(SoundCue cue) => Cues.Count(c => c == cue);
        }

        static GameController NewGame(int nextWave = 1)
        {
            var tuning = TuningConfig.Default;
            return new GameController(tuning, ResortState.NewGame(tuning), nextWave, WaveTable.Default8());
        }

        static GameController Reopen()
        {
            var tuning = TuningConfig.Default;
            var loaded = SaveSystem.LoadOrNew(tuning);
            return new GameController(tuning, loaded.Resort, loaded.NextWaveIndex, WaveTable.Default8(), loaded.Wave);
        }

        // One game second at a time, the way the player's frames come, with a look after each.
        static void Run(GameController game, SoundWatcher watcher, int seconds)
        {
            for (int i = 0; i < seconds && game.ActiveWave != null && game.CurrentPhase != WavePhase.WaveComplete; i++)
            {
                game.Tick(1f);
                watcher.Poll();
            }
        }

        static void RunToTheEnd(GameController game, SoundWatcher watcher)
        {
            Run(game, watcher, 3000);
            Assert.AreEqual(WavePhase.WaveComplete, game.CurrentPhase);
        }

        [Test]
        public void MovingAWorker_AsksForTheWorkerSound_OncePerMove()
        {
            var game = NewGame();
            var heard = new Heard();
            using (var watcher = new SoundWatcher(game, heard.Add))
            {
                game.StartNextWave();
                watcher.Poll();
                heard.Cues.Clear();
                Assert.IsTrue(game.MoveWorker(BuildingId.Reception, BuildingId.BeachBar));
                Assert.AreEqual(1, heard.Count(SoundCue.WorkerMoved));
            }
        }

        [Test]
        public void ARefusedMove_MakesNoSound()
        {
            var game = NewGame();
            var heard = new Heard();
            using (var watcher = new SoundWatcher(game, heard.Add))
            {
                game.StartNextWave();
                Assert.IsFalse(game.MoveWorker(BuildingId.Reception, BuildingId.Restaurant), "the Restaurant already has a Worker");
                Assert.AreEqual(0, heard.Count(SoundCue.WorkerMoved));
            }
        }

        [Test]
        public void StartingAWave_SoundsTheWaveStartOnce()
        {
            var game = NewGame();
            var heard = new Heard();
            using (var watcher = new SoundWatcher(game, heard.Add))
            {
                game.StartNextWave();
                for (int i = 0; i < 5; i++) watcher.Poll();
                Assert.AreEqual(1, heard.Count(SoundCue.WaveStart));
            }
        }

        [Test]
        public void ALineThatGrows_IsHeardOncePerChange_NotWhileItStaysLong()
        {
            var game = NewGame(2);                       // wave 2: the Beach Bar has no Worker, so Drinks grows
            var heard = new Heard();
            using (var watcher = new SoundWatcher(game, heard.Add))
            {
                game.StartNextWave();
                var needs = (NeedId[])Enum.GetValues(typeof(NeedId));
                var last = needs.Select(n => game.ActiveWave.StatusOf(n)).ToArray();
                int grew = 0, caught = 0;
                watcher.Poll();
                for (int second = 0; second < 600 && game.CurrentPhase != WavePhase.WaveComplete; second++)
                {
                    game.Tick(1f);
                    for (int n = 0; n < needs.Length; n++)
                    {
                        var now = game.ActiveWave.StatusOf(needs[n]);
                        if (now == last[n]) continue;
                        if (now == NeedStatus.Bottleneck) grew++;
                        if (now == NeedStatus.Recovering) caught++;
                        last[n] = now;
                    }
                    watcher.Poll();
                    watcher.Poll();                      // a second look in the same frame changes nothing
                }
                Assert.GreaterOrEqual(grew, 1, "wave 2 with an empty Beach Bar has a growing line");
                Assert.AreEqual(grew, heard.Count(SoundCue.LineGrowing), "one sound for every time a line started to grow");
                Assert.AreEqual(caught, heard.Count(SoundCue.LineCatchingUp), "one sound for every time help began to tell");
            }
        }

        [Test]
        public void TheSuddenRush_IsHeardOnceInWaveTwo_AndNotInWaveOne()
        {
            var two = NewGame(2);
            var heardTwo = new Heard();
            using (var watcher = new SoundWatcher(two, heardTwo.Add))
            {
                two.StartNextWave();
                Run(two, watcher, 40);
                Assert.AreEqual(0, heardTwo.Count(SoundCue.SuddenRush), "the rush lands at 45 s");
                Run(two, watcher, 20);
                Assert.AreEqual(1, heardTwo.Count(SoundCue.SuddenRush));
                Run(two, watcher, 100);
                Assert.AreEqual(1, heardTwo.Count(SoundCue.SuddenRush), "only once");
            }

            var one = NewGame(1);
            var heardOne = new Heard();
            using (var watcher = new SoundWatcher(one, heardOne.Add))
            {
                one.StartNextWave();
                Run(one, watcher, 200);
                Assert.AreEqual(0, heardOne.Count(SoundCue.SuddenRush));
            }
        }

        [Test]
        public void WhenArrivalsClose_TheGuestsArrivedSoundComesOnce_AroundTheNinetiethSecond()
        {
            var game = NewGame();
            var heard = new Heard();
            using (var watcher = new SoundWatcher(game, heard.Add))
            {
                game.StartNextWave();
                Run(game, watcher, 80);
                Assert.AreEqual(0, heard.Count(SoundCue.GuestsArrived));
                Run(game, watcher, 20);
                Assert.AreEqual(1, heard.Count(SoundCue.GuestsArrived));
                RunToTheEnd(game, watcher);
                Assert.AreEqual(1, heard.Count(SoundCue.GuestsArrived));
            }
        }

        [Test]
        public void AFinishedWave_SoundsItsResultOnce_ChosenByTheStars()
        {
            InTempFolder(() =>
            {
                var game = NewGame();
                var heard = new Heard();
                using (var watcher = new SoundWatcher(game, heard.Add))
                {
                    game.StartNextWave();
                    RunToTheEnd(game, watcher);
                    var results = heard.Cues.Where(c => c >= SoundCue.ResultOneStar && c <= SoundCue.ResultPerfect).ToList();
                    Assert.AreEqual(1, results.Count, "exactly one result sound");
                    Assert.AreEqual(SoundWatcher.ResultCue(game.ActiveWave.Result), results[0]);
                }
            });
        }

        [Test]
        public void TheResultSound_HasOneMoreNotePerStar_AndNoStarCountSoundsLikeFailure()
        {
            var expected = new[]
            {
                SoundCue.ResultOneStar, SoundCue.ResultTwoStars, SoundCue.ResultThreeStars,
                SoundCue.ResultFourStars, SoundCue.ResultFiveStars
            };
            for (int stars = 1; stars <= 5; stars++)
                Assert.AreEqual(expected[stars - 1], SoundWatcher.ResultCue(new WaveResult { Stars = stars }), stars + " stars");
            Assert.AreEqual(SoundCue.ResultPerfect, SoundWatcher.ResultCue(new WaveResult { Stars = 5, Perfect = true }));

            // A placeholder gets longer with every star, and the one-star sound is a short, quiet single note.
            int previous = 0;
            foreach (var cue in expected)
            {
                int length = ProceduralSounds.Make(cue).Length;
                Assert.Greater(length, previous, cue + " is not longer than the one before it");
                previous = length;
            }
        }

        [Test]
        public void ClaimingRewards_SoundsOnce()
        {
            InTempFolder(() =>
            {
                var game = NewGame();
                var heard = new Heard();
                using (var watcher = new SoundWatcher(game, heard.Add))
                {
                    game.StartNextWave();
                    RunToTheEnd(game, watcher);
                    Assert.AreEqual(0, heard.Count(SoundCue.RewardsClaimed));
                    game.ContinueAfterResults();
                    Assert.AreEqual(1, heard.Count(SoundCue.RewardsClaimed));
                }
            });
        }

        [Test]
        public void SpeedUp_AndTheTestAd_HaveTheirOwnSounds()
        {
            InTempFolder(() =>
            {
                var game = NewGame();
                var heard = new Heard();
                using (var watcher = new SoundWatcher(game, heard.Add))
                {
                    game.StartNextWave();
                    Assert.IsTrue(game.Boost(BuildingId.Reception));
                    Assert.AreEqual(1, heard.Count(SoundCue.SpeedUp));
                    game.WatchTestAd();
                    Assert.AreEqual(1, heard.Count(SoundCue.EnergyGained));
                }
            });
        }

        [Test]
        public void AnUpgrade_AndAnUnlock_HaveTheirOwnSounds_AndARefusedOneHasNone()
        {
            InTempFolder(() =>
            {
                var tuning = TuningConfig.Default;
                var resort = ResortState.NewGame(tuning);
                resort.WavesCompleted = 3;
                resort.Coins = 5000;
                var game = new GameController(tuning, resort, 4, WaveTable.Default8());
                var heard = new Heard();
                using (var watcher = new SoundWatcher(game, heard.Add))
                {
                    Assert.IsTrue(game.Upgrade(BuildingId.Reception));
                    Assert.AreEqual(1, heard.Count(SoundCue.Upgrade));
                    Assert.IsTrue(game.Unlock(BuildingId.Pool));
                    Assert.AreEqual(1, heard.Count(SoundCue.Unlock));
                    Assert.IsFalse(game.Unlock(BuildingId.Bungalows), "the Bungalows need wave 6 first");
                    Assert.AreEqual(1, heard.Count(SoundCue.Unlock), "a refused unlock is silent");
                }
            });
        }

        [Test]
        public void AWaveThatCameBackFromASave_AnnouncesNothingForWhatAlreadyHappened()
        {
            InTempFolder(() =>
            {
                var original = NewGame(2);
                var first = new Heard();
                using (var watcher = new SoundWatcher(original, first.Add))
                {
                    original.StartNextWave();
                    Run(original, watcher, 70);                    // the rush has landed and a line is growing
                    Assert.AreEqual(1, first.Count(SoundCue.SuddenRush));
                    original.LeaveApp();
                }

                var back = Reopen();
                Assert.IsNotNull(back.ActiveWave, "the wave came back");
                var heard = new Heard();
                using (var watcher = new SoundWatcher(back, heard.Add))
                {
                    for (int i = 0; i < 5; i++) watcher.Poll();
                    Assert.AreEqual(0, heard.Cues.Count, "nothing is announced for a wave that is already under way");
                    back.SetPaused(false);
                    Run(back, watcher, 5);
                    Assert.AreEqual(0, heard.Count(SoundCue.SuddenRush), "the rush is not announced a second time");
                    Assert.AreEqual(0, heard.Count(SoundCue.WaveStart));
                }
            });
        }

        [Test]
        public void ADisposedWatcher_HearsNothing()
        {
            var game = NewGame();
            var heard = new Heard();
            var watcher = new SoundWatcher(game, heard.Add);
            watcher.Dispose();
            game.StartNextWave();
            game.MoveWorker(BuildingId.Reception, BuildingId.BeachBar);
            watcher.Poll();
            Assert.AreEqual(0, heard.Cues.Count(c => c == SoundCue.WorkerMoved));
        }
    }
}
