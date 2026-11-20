using System.Collections.Generic;
using NUnit.Framework;

namespace ResortEmpire.Game.Tests
{
    // CAM-51: Sound and Music are remembered, start On, and are not part of the resort.
    public class AppSettingsTests
    {
        sealed class MemoryStore : ISettingsStore
        {
            public readonly Dictionary<string, int> Values = new Dictionary<string, int>();
            public int Saves;
            public int GetInt(string key, int fallback) => Values.TryGetValue(key, out int v) ? v : fallback;
            public void SetInt(string key, int value) => Values[key] = value;
            public void Save() => Saves++;
        }

        [Test]
        public void BothStartOn()
        {
            var settings = new AppSettings(new MemoryStore());
            Assert.IsTrue(settings.SoundOn);
            Assert.IsTrue(settings.MusicOn);
        }

        [Test]
        public void TurningOneOff_LeavesTheOtherAlone_AndIsWrittenDownAtOnce()
        {
            var store = new MemoryStore();
            var settings = new AppSettings(store);

            Assert.IsFalse(settings.ToggleMusic());
            Assert.IsFalse(settings.MusicOn);
            Assert.IsTrue(settings.SoundOn);
            Assert.AreEqual(1, store.Saves, "a choice must survive the app being closed straight away");

            Assert.IsTrue(settings.ToggleMusic());
            Assert.IsTrue(settings.MusicOn);
        }

        [Test]
        public void TheChoiceIsKeptByTheStore_SoANewSessionSeesIt()
        {
            var store = new MemoryStore();
            new AppSettings(store).SetSound(false);

            var nextSession = new AppSettings(store);
            Assert.IsFalse(nextSession.SoundOn);
            Assert.IsTrue(nextSession.MusicOn);
        }
    }
}
