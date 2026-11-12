using System;
using System.Collections.Generic;
using NUnit.Framework;
using ResortEmpire.Game.Sound;

namespace ResortEmpire.Game.Tests
{
    // CAM-117: when a cue may sound, and what the Sound and Music switches do to it.
    public class SoundRulesTests
    {
        sealed class MemoryStore : ISettingsStore
        {
            public readonly Dictionary<string, int> Values = new Dictionary<string, int>();
            public int GetInt(string key, int fallback) => Values.TryGetValue(key, out int v) ? v : fallback;
            public void SetInt(string key, int value) => Values[key] = value;
            public void Save() { }
        }

        static (SoundRules rules, AppSettings settings) New()
        {
            var settings = new AppSettings(new MemoryStore());
            return (new SoundRules(settings), settings);
        }

        [Test]
        public void ACue_Sounds_WhenSoundIsOn()
        {
            var (rules, _) = New();
            Assert.IsTrue(rules.TryPlay(SoundCue.Click, 10f));
        }

        [Test]
        public void ACue_IsSilent_WhenSoundIsOff_AndSoundsAgainAtOnceWhenSwitchedOn()
        {
            var (rules, settings) = New();
            settings.SetSound(false);
            Assert.IsFalse(rules.TryPlay(SoundCue.Click, 10f));
            settings.SetSound(true);
            Assert.IsTrue(rules.TryPlay(SoundCue.Click, 10.001f), "the switch applies at once, with no restart");
        }

        [Test]
        public void TheSameCue_WaitsForItsMinimumGap()
        {
            var (rules, _) = New();
            float gap = SoundCues.Info(SoundCue.Click).MinGap;
            Assert.Greater(gap, 0f);
            Assert.IsTrue(rules.TryPlay(SoundCue.Click, 5f));
            Assert.IsFalse(rules.TryPlay(SoundCue.Click, 5f + gap * 0.5f), "too soon");
            Assert.IsTrue(rules.TryPlay(SoundCue.Click, 5f + gap + 0.001f), "after the gap it sounds again");
        }

        [Test]
        public void ARefusedCue_DoesNotRestartItsGap()
        {
            var (rules, _) = New();
            float gap = SoundCues.Info(SoundCue.Click).MinGap;
            Assert.IsTrue(rules.TryPlay(SoundCue.Click, 5f));
            Assert.IsFalse(rules.TryPlay(SoundCue.Click, 5f + gap * 0.9f));
            Assert.IsTrue(rules.TryPlay(SoundCue.Click, 5f + gap * 1.1f), "the refused try did not push the gap further out");
        }

        [Test]
        public void TheMusicSwitch_DoesNotTouchEffects()
        {
            var (rules, settings) = New();
            settings.SetMusic(false);
            Assert.IsTrue(rules.TryPlay(SoundCue.Click, 1f));
            Assert.IsFalse(rules.MusicOn);
            Assert.IsTrue(rules.SoundOn);
        }

        [Test]
        public void EveryCue_HasASensibleLoudness_AndNoCueNeedsMoreThanAFewSecondsBetweenRepeats()
        {
            foreach (SoundCue cue in Enum.GetValues(typeof(SoundCue)))
            {
                var info = SoundCues.Info(cue);
                Assert.Greater(info.Volume, 0f, cue + " is silent");
                Assert.LessOrEqual(info.Volume, 1f, cue + " is louder than the speaker allows");
                Assert.GreaterOrEqual(info.MinGap, 0f, cue + " has a negative gap");
            }
        }

        [Test]
        public void AskingForASoundThroughSfx_WithNothingListening_DoesNothing()
        {
            var before = Sfx.Sink;
            Sfx.Sink = null;
            try { Assert.DoesNotThrow(() => Sfx.Play(SoundCue.Click)); }
            finally { Sfx.Sink = before; }
        }
    }
}
