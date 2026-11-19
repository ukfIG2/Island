using NUnit.Framework;
using ResortEmpire.Sim;

namespace ResortEmpire.Game.Tests
{
    // CAM-44: the offer of a new area: its four states, the debut wave and when it is shown on its own.
    public class AreaOfferTests
    {
        static TuningConfig T => TuningConfig.Default;
        static System.Collections.Generic.IReadOnlyList<WaveDef> Waves => WaveTable.Default8();

        static ResortState Resort(int wavesCompleted, int coins)
        {
            var ids = new[] { BuildingId.Reception, BuildingId.Restaurant, BuildingId.BeachBar };
            return ResortState.Restore(T, coins, 3, 0, wavesCompleted, 2, ids, new[] { 1, 1, 1 }, new[] { true, true, false });
        }

        [Test]
        public void AnAreaIsLockedUntilItsWaveIsDone_ThenAvailableOrNotAffordable()
        {
            Assert.AreEqual(AreaState.Locked, AreaOffer.For(Resort(2, 5000), T, Waves, BuildingId.Pool).State);
            Assert.AreEqual(AreaState.Available, AreaOffer.For(Resort(3, 1200), T, Waves, BuildingId.Pool).State);

            var short1 = AreaOffer.For(Resort(3, 1000), T, Waves, BuildingId.Pool);
            Assert.AreEqual(AreaState.NotAffordable, short1.State);
            Assert.AreEqual(200, short1.Missing);
            Assert.AreEqual(0, AreaOffer.For(Resort(3, 1200), T, Waves, BuildingId.Pool).Missing);
        }

        [Test]
        public void AnUnlockedAreaIsUnlocked_AndEachAreaHasItsOwnPriceAndWave()
        {
            var resort = Resort(3, 5000);
            Assert.IsTrue(resort.Unlock(BuildingId.Pool));
            Assert.AreEqual(AreaState.Unlocked, AreaOffer.For(resort, T, Waves, BuildingId.Pool).State);

            var pool = AreaOffer.For(Resort(3, 0), T, Waves, BuildingId.Pool);
            var bungalows = AreaOffer.For(Resort(6, 0), T, Waves, BuildingId.Bungalows);
            Assert.AreEqual(1200, pool.Cost);
            Assert.AreEqual(3, pool.EligibleAfterWave);
            Assert.AreEqual(NeedId.Relax, pool.Need);
            Assert.AreEqual(2500, bungalows.Cost);
            Assert.AreEqual(6, bungalows.EligibleAfterWave);
            Assert.AreEqual(NeedId.OceanView, bungalows.Need);
        }

        [Test]
        public void TheNewNeedDebutsInTheWaveTableWhereTheDesignerPutsIt()
        {
            Assert.AreEqual(4, AreaOffer.For(Resort(3, 0), T, Waves, BuildingId.Pool).DebutWave);
            Assert.AreEqual(7, AreaOffer.For(Resort(6, 0), T, Waves, BuildingId.Bungalows).DebutWave);
        }

        [Test]
        public void OnlyTheAreasAreOffered()
        {
            Assert.IsNull(AreaOffer.For(Resort(8, 9999), T, Waves, BuildingId.Reception));
            Assert.IsFalse(AreaOffer.IsArea(BuildingId.BeachBar));
        }

        [Test]
        public void AnAreaIsShownOnItsOwnOnlyRightAfterTheWaveThatMakesItAvailable()
        {
            Assert.IsNull(AreaOffer.DueAfterWave(Resort(2, 0), T));
            Assert.AreEqual(BuildingId.Pool, AreaOffer.DueAfterWave(Resort(3, 0), T));
            Assert.IsNull(AreaOffer.DueAfterWave(Resort(4, 5000), T), "skipped at wave 3: it waits at its construction site");
            Assert.AreEqual(BuildingId.Bungalows, AreaOffer.DueAfterWave(Resort(6, 0), T));
            Assert.IsNull(AreaOffer.DueAfterWave(Resort(7, 0), T));
        }

        [Test]
        public void ABuiltAreaIsNotOfferedAgain()
        {
            var resort = Resort(3, 5000);
            Assert.IsTrue(resort.Unlock(BuildingId.Pool));
            Assert.IsNull(AreaOffer.DueAfterWave(resort, T));
        }

        // CAM-129: the banner opens the area that waits, the Pool first, for as long as it waits.
        [Test]
        public void TheWaitingArea_IsThePoolFirst_AndStaysUntilItIsBuilt()
        {
            Assert.IsNull(AreaOffer.Waiting(Resort(2, 9999), T), "nothing before wave 3 is done");
            Assert.AreEqual(BuildingId.Pool, AreaOffer.Waiting(Resort(3, 0), T), "waiting even without the Coins");
            Assert.AreEqual(BuildingId.Pool, AreaOffer.Waiting(Resort(5, 0), T), "skipped, it still waits");
            Assert.AreEqual(BuildingId.Pool, AreaOffer.Waiting(Resort(7, 0), T), "both wait: the Pool comes first");

            var resort = Resort(6, 5000);
            Assert.IsTrue(resort.Unlock(BuildingId.Pool));
            Assert.AreEqual(BuildingId.Bungalows, AreaOffer.Waiting(resort, T));
            Assert.IsTrue(resort.Unlock(BuildingId.Bungalows));
            Assert.IsNull(AreaOffer.Waiting(resort, T), "everything built");
        }

        // CAM-130: the construction site names the area and its price while it can be built, and nothing otherwise.
        [Test]
        public void TheSiteLabel_NamesTheAreaAndItsPrice_OnlyWhileItCanBeBuilt()
        {
            Assert.AreEqual("Build Pool · 1,200", AreaOffer.For(Resort(3, 5000), T, Waves, BuildingId.Pool).SiteLabel);
            Assert.AreEqual("Build Pool · 1,200", AreaOffer.For(Resort(3, 100), T, Waves, BuildingId.Pool).SiteLabel,
                "also while Coins are missing");
            Assert.AreEqual("Build Bungalows · 2,500", AreaOffer.For(Resort(6, 0), T, Waves, BuildingId.Bungalows).SiteLabel);

            Assert.IsNull(AreaOffer.For(Resort(2, 5000), T, Waves, BuildingId.Pool).SiteLabel, "locked: no label");
            var resort = Resort(3, 5000);
            Assert.IsTrue(resort.Unlock(BuildingId.Pool));
            Assert.IsNull(AreaOffer.For(resort, T, Waves, BuildingId.Pool).SiteLabel, "built: no label");
        }
    }
}
