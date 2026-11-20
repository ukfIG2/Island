using System.Linq;
using NUnit.Framework;
using ResortEmpire.Sim;

namespace ResortEmpire.Game.Tests
{
    // CAM-135: the vessel waits for its guests and takes them home after the wave. Visual only.
    public class HomecomingTests
    {
        // CAM-142
        [Test]
        public void TheVessel_WaitsAtTheBeachForTheWholeWave_WaveCompleteIncluded()
        {
            Assert.IsTrue(Homecoming.VesselWaits(WavePhase.WaveIncoming), "coming in");
            Assert.IsTrue(Homecoming.VesselWaits(WavePhase.WaveActive), "while guests arrive, and after arrivals close");
            Assert.IsTrue(Homecoming.VesselWaits(WavePhase.WaveResolving), "while the last guests are served");
            Assert.IsTrue(Homecoming.VesselWaits(WavePhase.WaveComplete), "on the result");
            Assert.IsFalse(Homecoming.VesselWaits(null), "between waves");
            Assert.IsFalse(Homecoming.VesselWaits(WavePhase.AwaitingWave));
        }

        // CAM-143
        [Test]
        public void AfterTheWave_TheVesselWaitsOnWhileGuestsAreBoarding()
        {
            Assert.IsTrue(Homecoming.VesselWaits(null, boarding: true), "the result claimed, guests still walking home");
            Assert.IsFalse(Homecoming.VesselWaits(null, boarding: false), "everyone aboard: it leaves");
        }

        [Test]
        public void HowManyLeaveImpatient_FollowsTheStars_AndTheResultsLeavingLine()
        {
            Assert.AreEqual(0, Homecoming.ImpatientGuests(5, false), "5 stars: nobody");
            Assert.AreEqual(0, Homecoming.ImpatientGuests(5, true), "Perfect: nobody");
            Assert.AreEqual(2, Homecoming.ImpatientGuests(4, false), "4 stars: a couple");
            Assert.AreEqual(3, Homecoming.ImpatientGuests(3, false), "3 stars: a few");
            Assert.AreEqual(5, Homecoming.ImpatientGuests(2, false));
            Assert.AreEqual(6, Homecoming.ImpatientGuests(1, false), "1 star: a visible group");
            for (int stars = 1; stars <= 5; stars++)
                Assert.AreEqual(ResultText.LeavingLine(stars) == "", Homecoming.ImpatientGuests(stars, false) == 0,
                    "the island shows impatient guests exactly when the result says some left impatient (" + stars + " stars)");
        }

        [Test]
        public void TheImpatientOnesGoFirst_FasterAndTogether_ThenTheOthers()
        {
            var needs = new[] { NeedId.Rooms, NeedId.Drinks, NeedId.Food };
            var plan = Homecoming.Plan(1, false, needs);
            Assert.AreEqual(Homecoming.Walkers, plan.Count);
            var impatient = plan.Where(d => d.Impatient).ToList();
            var calm = plan.Where(d => !d.Impatient).ToList();
            Assert.AreEqual(6, impatient.Count);
            Assert.Less(impatient.Max(d => d.Delay), calm.Min(d => d.Delay), "every impatient guest sets off before any other");
            Assert.Greater(Homecoming.ImpatientPace, 1f, "and walks a little faster");
            CollectionAssert.IsSubsetOf(plan.Select(d => d.Need).Distinct(), needs, "only from buildings that stand");
            CollectionAssert.AreEquivalent(needs, plan.Select(d => d.Need).Distinct(), "and from each of them");
        }

        [Test]
        public void AFiveStarWave_SendsEveryoneHomeCalm_AndNoBuildingsMeansNobody()
        {
            var plan = Homecoming.Plan(5, false, new[] { NeedId.Rooms, NeedId.Drinks, NeedId.Food, NeedId.Relax });
            Assert.AreEqual(Homecoming.Walkers, plan.Count);
            Assert.IsFalse(plan.Any(d => d.Impatient));
            Assert.AreEqual(0f, plan[0].Delay, "the first guest sets off at once");
            Assert.IsEmpty(Homecoming.Plan(1, false, new NeedId[0]));
        }
    }
}
