using NUnit.Framework;

namespace ResortEmpire.Sim.Tests
{
    // CAM-138: the building window says "guests are waiting a while" from how long the first guest in line has
    // waited. The sim only reports it; nothing in the wave changes.
    public class LongestWaitTests
    {
        static float Dt => SimClock.DefaultStep;

        static WaveSimulation Wave2()
        {
            // Wave 2 with a new resort: the Beach Bar has no Worker, so the Drinks line grows.
            var t = TuningConfig.Default;
            var sim = new WaveSimulation(ResortState.NewGame(t), WaveTable.Default8()[1], t);
            sim.StartWave();
            return sim;
        }

        [Test]
        public void AnEmptyLine_HasWaitedNothing()
        {
            var sim = Wave2();
            Assert.AreEqual(0f, sim.LongestWait(NeedId.Drinks), "before anyone arrives");
            Assert.AreEqual(0f, sim.LongestWait(NeedId.Relax), "a need the wave does not have");
        }

        [Test]
        public void TheFrontOfAGrowingLine_WaitsLonger_AndTheWaitIsTheFrontGuests()
        {
            var sim = Wave2();
            float before = 0f;
            bool grew = false;
            for (int i = 0; i < 400000 && sim.TimeInWave < 60f; i++)
            {
                sim.Tick(Dt);
                if (sim.QueueLength(NeedId.Drinks) == 0) continue;
                float wait = sim.LongestWait(NeedId.Drinks);
                Assert.GreaterOrEqual(wait, 0f);
                Assert.LessOrEqual(wait, sim.TimeInWave + 1e-3f, "never longer than the wave so far");
                if (wait > before) grew = true;
                before = wait;
            }
            Assert.IsTrue(grew, "with no Worker at the Beach Bar the front guest waits longer and longer");
            Assert.Greater(before, TuningConfig.Default.PatienceGraceSeconds,
                "after a minute the Drinks line has waited past the patience grace");
        }

        [Test]
        public void ReadingTheWait_ChangesNothingInTheResult()
        {
            var watched = Wave2();
            var unwatched = Wave2();
            for (int i = 0; i < 400000 && watched.Phase != WavePhase.WaveComplete; i++)
            {
                watched.LongestWait(NeedId.Drinks);
                watched.Tick(Dt);
                unwatched.Tick(Dt);
            }
            Assert.AreEqual(WavePhase.WaveComplete, watched.Phase);
            Assert.AreEqual(unwatched.Result.Satisfaction, watched.Result.Satisfaction);
            Assert.AreEqual(unwatched.Result.Stars, watched.Result.Stars);
        }
    }
}
