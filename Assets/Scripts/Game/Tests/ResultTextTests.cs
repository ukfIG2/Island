using System.Collections.Generic;
using NUnit.Framework;
using ResortEmpire.Sim;

namespace ResortEmpire.Game.Tests
{
    // CAM-38: the wording of the Wave Complete screen.
    public class ResultTextTests
    {
        static WaveResult Result(NeedId? worst, BottleneckCause cause, params (NeedId need, float wait)[] waits)
        {
            var r = new WaveResult { WorstNeed = worst, WorstNeedCause = cause, AverageWaitByNeed = new Dictionary<NeedId, float>() };
            foreach (var w in waits) r.AverageWaitByNeed[w.need] = w.wait;
            return r;
        }

        [Test]
        public void ThePercentageIsFlooredSoAlmostNinetyNeverReadsAsNinety()
        {
            Assert.AreEqual(89, ResultText.SatisfactionPercent(0.896f));
            Assert.AreEqual(90, ResultText.SatisfactionPercent(0.90f));
            Assert.AreEqual(100, ResultText.SatisfactionPercent(1f));
            Assert.AreEqual(40, ResultText.SatisfactionPercent(0.40f));
        }

        [Test]
        public void WentWell_NamesTheNeedsServedQuicklyExceptTheWorstOne()
        {
            var r = Result(NeedId.Drinks, BottleneckCause.Staffing,
                (NeedId.Rooms, 2f), (NeedId.Food, 3f), (NeedId.Drinks, 40f));
            Assert.AreEqual("Rooms and Food were served quickly.", ResultText.WentWell(r, 10f));
        }

        [Test]
        public void WentWell_GetsTheVerbRightForOneNeed()
        {
            Assert.AreEqual("Food was served quickly.",
                ResultText.WentWell(Result(NeedId.Drinks, BottleneckCause.Capacity, (NeedId.Food, 1f), (NeedId.Drinks, 50f)), 10f));
            Assert.AreEqual("Rooms were served quickly.",
                ResultText.WentWell(Result(NeedId.Drinks, BottleneckCause.Capacity, (NeedId.Rooms, 1f), (NeedId.Drinks, 50f)), 10f));
            Assert.AreEqual("Ocean View was served quickly.",
                ResultText.WentWell(Result(NeedId.Rooms, BottleneckCause.Capacity, (NeedId.OceanView, 1f), (NeedId.Rooms, 50f)), 10f));
        }

        [Test]
        public void WentWell_ListsThreeNeedsWithCommasAndAnd()
        {
            var r = Result(null, BottleneckCause.None, (NeedId.Rooms, 1f), (NeedId.Drinks, 1f), (NeedId.Food, 1f));
            Assert.AreEqual("Rooms, Drinks and Food were served quickly.", ResultText.WentWell(r, 10f));
        }

        [Test]
        public void WentWell_FallsBackToAKindSentenceWhenNothingWasQuick()
        {
            var r = Result(NeedId.Rooms, BottleneckCause.Capacity, (NeedId.Rooms, 50f), (NeedId.Food, 30f));
            Assert.AreEqual("Every guest was looked after in the end.", ResultText.WentWell(r, 10f));
        }

        [Test]
        public void NeedsImprovement_NamesTheCause()
        {
            Assert.AreEqual("Beach Bar was without a Worker while its line grew.",
                ResultText.NeedsImprovement(Result(NeedId.Drinks, BottleneckCause.Staffing)));
            Assert.AreEqual("Restaurant had too few seats for the crowd.",
                ResultText.NeedsImprovement(Result(NeedId.Food, BottleneckCause.Capacity)));
            Assert.AreEqual("Guests waited longest at the Reception.",
                ResultText.NeedsImprovement(Result(NeedId.Rooms, BottleneckCause.None)));
            Assert.AreEqual("Every line stayed short.", ResultText.NeedsImprovement(Result(null, BottleneckCause.None)));
        }

        [Test]
        public void TheLeavingLine_IsAPictureThatGrowsAsTheStarsFall_AndNeverBlames()
        {
            Assert.AreEqual("", ResultText.LeavingLine(5));
            StringAssert.Contains("couple", ResultText.LeavingLine(4));
            StringAssert.Contains("few", ResultText.LeavingLine(3));
            StringAssert.Contains("Quite a few", ResultText.LeavingLine(2));
            StringAssert.Contains("Quite a few", ResultText.LeavingLine(1));
            for (int stars = 1; stars <= 5; stars++)
                StringAssert.DoesNotContain("lost", ResultText.LeavingLine(stars).ToLowerInvariant());
        }
    }
}
