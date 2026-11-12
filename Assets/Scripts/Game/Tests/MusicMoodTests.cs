using System;
using System.IO;
using NUnit.Framework;
using ResortEmpire.Game.Sound;
using ResortEmpire.Sim;

namespace ResortEmpire.Game.Tests
{
    // CAM-117: the music follows the game: calm between waves, busier in a wave, quieter under the result screen.
    public class MusicMoodTests
    {
        static void InTempFolder(Action body)
        {
            string dir = Path.Combine(Path.GetTempPath(), "island-music-" + Guid.NewGuid().ToString("N"));
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
        public void BetweenWaves_TheMusicIsCalm_AndNotDucked()
        {
            var game = NewGame();
            Assert.IsFalse(MusicMood.Busy(game));
            Assert.AreEqual(1f, MusicMood.Duck(game));
        }

        [Test]
        public void WhileAWaveRuns_TheMusicIsBusier_EvenWhenPaused()
        {
            InTempFolder(() =>
            {
                var game = NewGame();
                game.StartNextWave();
                Assert.IsTrue(MusicMood.Busy(game));
                game.Tick(10f);
                game.SetPaused(true);
                Assert.IsTrue(MusicMood.Busy(game), "a paused wave keeps its mood; the music does not jump about");
                Assert.AreEqual(1f, MusicMood.Duck(game));
            });
        }

        [Test]
        public void UnderTheResultScreen_TheMusicIsCalmAndSteppedBack_AndComesBackAfterTheClaim()
        {
            InTempFolder(() =>
            {
                var game = NewGame();
                game.StartNextWave();
                for (int i = 0; i < 3000 && game.CurrentPhase != WavePhase.WaveComplete; i++) game.Tick(1f);
                Assert.AreEqual(WavePhase.WaveComplete, game.CurrentPhase);
                Assert.IsFalse(MusicMood.Busy(game));
                Assert.AreEqual(MusicMood.DuckedLevel, MusicMood.Duck(game));
                Assert.Less(MusicMood.Duck(game), 1f);
                game.ContinueAfterResults();
                Assert.AreEqual(1f, MusicMood.Duck(game), "the music is back to its level once rewards are claimed");
            });
        }

        [Test]
        public void TheTwoMoodsAreLoopsOfMusic_AndTheBusyOneIsQuicker()
        {
            foreach (var cue in new[] { SoundCue.MusicCalm, SoundCue.MusicBusy })
            {
                Assert.IsTrue(SoundCues.Info(cue).Loop, cue + " must loop");
                Assert.AreEqual(SoundCategory.Music, SoundCues.Info(cue).Category);
            }
            int calm = ProceduralSounds.Make(SoundCue.MusicCalm).Length;
            int busy = ProceduralSounds.Make(SoundCue.MusicBusy).Length;
            Assert.AreEqual(16 * ProceduralSounds.Rate, calm, "four chords of four beats at 60 beats a minute");
            Assert.Less(busy, calm, "the same four chords at a quicker pace");
            Assert.Greater(busy, 8 * ProceduralSounds.Rate);
        }

        [Test]
        public void TheMusicSwitch_IsSeparateFromSound_AndMusicIsNeverPlayedAsAnEffect()
        {
            var settings = new AppSettings(new Store());
            var rules = new SoundRules(settings);
            settings.SetMusic(false);
            Assert.IsTrue(rules.SoundOn);
            Assert.IsFalse(rules.MusicOn);
            foreach (var cue in new[] { SoundCue.MusicCalm, SoundCue.MusicBusy })
                Assert.IsFalse(rules.TryPlay(cue, 1f), cue + " is kept running by the director");
        }

        sealed class Store : ISettingsStore
        {
            readonly System.Collections.Generic.Dictionary<string, int> _values = new System.Collections.Generic.Dictionary<string, int>();
            public int GetInt(string key, int fallback) => _values.TryGetValue(key, out int v) ? v : fallback;
            public void SetInt(string key, int value) => _values[key] = value;
            public void Save() { }
        }
    }
}
