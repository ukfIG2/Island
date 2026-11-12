using System;
using NUnit.Framework;
using ResortEmpire.Game.Sound;

namespace ResortEmpire.Game.Tests
{
    // CAM-117: nobody can listen to a test, so these check what a bad sound would show in its numbers: silence,
    // clipping, a broken number, a click at the start or end, a seam in a loop that should be seamless.
    public class ProceduralSoundTests
    {
        static float Rms(float[] b)
        {
            double sum = 0;
            foreach (float s in b) sum += s * s;
            return (float)Math.Sqrt(sum / b.Length);
        }

        [Test]
        public void EveryPlaceholder_IsAFiniteSoundThatIsNotSilentAndNeverClips()
        {
            int checkedCues = 0;
            foreach (SoundCue cue in Enum.GetValues(typeof(SoundCue)))
            {
                var samples = ProceduralSounds.Make(cue);
                if (samples == null) continue;
                checkedCues++;
                Assert.Greater(samples.Length, ProceduralSounds.Rate / 40, cue + " is too short to hear");
                float peak = 0f;
                foreach (float s in samples)
                {
                    Assert.IsFalse(float.IsNaN(s) || float.IsInfinity(s), cue + " has a broken number");
                    peak = Math.Max(peak, Math.Abs(s));
                }
                Assert.AreEqual(ProceduralSounds.Peak, peak, 0.001f, cue + " is not scaled to the standard peak");
                Assert.Greater(Rms(samples), 0.01f, cue + " is practically silent");
            }
            Assert.Greater(checkedCues, 0);
        }

        [Test]
        public void ASoundThatIsNotALoop_StartsAndEndsAtSilence_SoItNeverClicks()
        {
            foreach (SoundCue cue in Enum.GetValues(typeof(SoundCue)))
            {
                var samples = ProceduralSounds.Make(cue);
                if (samples == null || SoundCues.Info(cue).Loop) continue;
                Assert.Less(Math.Abs(samples[0]), 0.08f, cue + " starts with a click");
                Assert.Less(Math.Abs(samples[samples.Length - 1]), 0.02f, cue + " ends with a click");
            }
        }

        [Test]
        public void ALoop_HasNoSeam_ItsEndLeadsStraightIntoItsStart()
        {
            foreach (SoundCue cue in Enum.GetValues(typeof(SoundCue)))
            {
                if (!SoundCues.Info(cue).Loop) continue;
                var samples = ProceduralSounds.Make(cue);
                Assert.IsNotNull(samples, cue + " is a loop with no sound");
                float jump = Math.Abs(samples[0] - samples[samples.Length - 1]);
                float typicalStep = 0f;
                for (int i = 1; i < samples.Length; i += 7) typicalStep = Math.Max(typicalStep, Math.Abs(samples[i] - samples[i - 1]));
                Assert.LessOrEqual(jump, typicalStep * 1.5f + 0.02f, cue + " would click where it repeats");
            }
        }

        [Test]
        public void ThePlaceholders_AreTheSameEveryTime()
        {
            foreach (SoundCue cue in Enum.GetValues(typeof(SoundCue)))
            {
                var a = ProceduralSounds.Make(cue);
                var b = ProceduralSounds.Make(cue);
                if (a == null) continue;
                CollectionAssert.AreEqual(a, b, cue + " changes from one making to the next");
            }
        }
    }
}
