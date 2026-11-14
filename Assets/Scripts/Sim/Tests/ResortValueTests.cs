using NUnit.Framework;

namespace ResortEmpire.Sim.Tests
{
    // CAM-40: Resort Value is status only. It grows with waves, upgrades and unlocks and never decreases.
    public class ResortValueTests
    {
        static TuningConfig T => TuningConfig.Default;

        static void FinishWave(ResortState resort, int index)
        {
            var sim = new WaveSimulation(resort, WaveTable.Default8()[index - 1], T);
            sim.StartWave();
            for (int i = 0; i < 400000 && sim.Phase != WavePhase.WaveComplete; i++) sim.Tick(SimClock.DefaultStep);
            Assert.AreEqual(WavePhase.WaveComplete, sim.Phase);
        }

        [Test]
        public void AnUpgradeAddsItsValue_AndAnUnlockAddsItsOwn()
        {
            var resort = ResortState.NewGame(T);
            resort.Coins = 10000;
            resort.WavesCompleted = 3;

            int before = resort.ResortValue;
            Assert.IsTrue(resort.Upgrade(BuildingId.Reception));
            Assert.AreEqual(before + T.ResortValuePerUpgrade, resort.ResortValue);
            Assert.AreEqual(20, T.ResortValuePerUpgrade, "GDD / Jira CAM-40: upgrades are worth +20");

            before = resort.ResortValue;
            Assert.IsTrue(resort.Unlock(BuildingId.Pool));
            Assert.AreEqual(before + T.ResortValuePerUnlock, resort.ResortValue);
            Assert.AreEqual(50, T.ResortValuePerUnlock, "GDD / Jira CAM-40: unlocks are worth +50");
        }

        [Test]
        public void AnActionThatIsRefused_AddsNothing()
        {
            var resort = ResortState.NewGame(T);                       // no Coins
            int before = resort.ResortValue;
            Assert.IsFalse(resort.Upgrade(BuildingId.Reception));
            Assert.IsFalse(resort.Unlock(BuildingId.Pool));
            Assert.AreEqual(before, resort.ResortValue);
        }

        [Test]
        public void ResortValue_NeverDecreasesAcrossWavesUpgradesAndUnlocks()
        {
            var resort = ResortState.NewGame(T);
            resort.Coins = 20000;
            int last = resort.ResortValue;
            System.Action<string> check = what =>
            {
                Assert.GreaterOrEqual(resort.ResortValue, last, "Resort Value fell after " + what);
                last = resort.ResortValue;
            };
            for (int wave = 1; wave <= 8; wave++)
            {
                FinishWave(resort, wave); check("wave " + wave);
                resort.Upgrade(BuildingId.Reception); check("an upgrade after wave " + wave);
                resort.Upgrade(BuildingId.Restaurant); check("another upgrade after wave " + wave);
                resort.Unlock(BuildingId.Pool); check("a Pool unlock after wave " + wave);
                resort.Unlock(BuildingId.Bungalows); check("a Bungalows unlock after wave " + wave);
            }
            Assert.Greater(resort.ResortValue, 0);
        }
    }
}
