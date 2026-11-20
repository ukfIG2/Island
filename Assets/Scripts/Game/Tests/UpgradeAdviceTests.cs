using System.Collections.Generic;
using NUnit.Framework;
using ResortEmpire.Sim;

namespace ResortEmpire.Game.Tests
{
    // CAM-41: the upgrade suggestion after a wave.
    public class UpgradeAdviceTests
    {
        static TuningConfig T => TuningConfig.Default;

        static WaveResult Result(NeedId? worst, BottleneckCause cause, params (NeedId need, float wait)[] waits)
        {
            var r = new WaveResult { WorstNeed = worst, WorstNeedCause = cause, AverageWaitByNeed = new Dictionary<NeedId, float>() };
            foreach (var w in waits) r.AverageWaitByNeed[w.need] = w.wait;
            return r;
        }

        static ResortState Resort(int coins, params int[] levels)   // Reception, Restaurant, Beach Bar levels
        {
            var ids = new[] { BuildingId.Reception, BuildingId.Restaurant, BuildingId.BeachBar };
            return ResortState.Restore(T, coins, 3, 0, 2, 2, ids, levels, new[] { true, true, false });
        }

        [Test]
        public void TheWorstLinesBuildingComesFirst_WithSeatsCostAndValue()
        {
            var advice = UpgradeAdvice.For(Resort(100, 1, 1, 1), T,
                Result(NeedId.Drinks, BottleneckCause.Capacity, (NeedId.Rooms, 5f), (NeedId.Drinks, 40f)));
            Assert.NotNull(advice);
            Assert.AreEqual(BuildingId.BeachBar, advice.Building);
            Assert.IsTrue(advice.FromWorst);
            Assert.AreEqual(BottleneckCause.Capacity, advice.Cause);
            Assert.AreEqual(1, advice.FromLevel);
            Assert.AreEqual(2, advice.ToLevel);
            Assert.AreEqual(3, advice.SeatsBefore);
            Assert.AreEqual(5, advice.SeatsAfter);
            Assert.AreEqual(500, advice.Cost);
            Assert.AreEqual(20, advice.ValueGain);
            Assert.IsFalse(advice.Affordable, "100 Coins do not buy a 500 Coin upgrade");
        }

        [Test]
        public void ItIsAffordableExactlyWhenTheCoinsReachTheCost()
        {
            var worst = Result(NeedId.Food, BottleneckCause.Capacity);
            Assert.IsFalse(UpgradeAdvice.For(Resort(499, 1, 1, 1), T, worst).Affordable);
            Assert.IsTrue(UpgradeAdvice.For(Resort(500, 1, 1, 1), T, worst).Affordable);
        }

        [Test]
        public void TheNextLevelCostsMore_AndTheCauseIsKept()
        {
            var advice = UpgradeAdvice.For(Resort(5000, 1, 2, 1), T, Result(NeedId.Food, BottleneckCause.Staffing));
            Assert.AreEqual(BuildingId.Restaurant, advice.Building);
            Assert.AreEqual(5, advice.SeatsBefore);
            Assert.AreEqual(7, advice.SeatsAfter);
            Assert.AreEqual(1200, advice.Cost);
            Assert.AreEqual(BottleneckCause.Staffing, advice.Cause);
        }

        [Test]
        public void WhenTheWorstBuildingIsAtTheTopLevel_TheLongestWaitAmongTheOthersIsSuggested()
        {
            var advice = UpgradeAdvice.For(Resort(5000, 3, 1, 1), T,
                Result(NeedId.Rooms, BottleneckCause.Capacity, (NeedId.Rooms, 50f), (NeedId.Food, 8f), (NeedId.Drinks, 20f)));
            Assert.AreEqual(BuildingId.BeachBar, advice.Building);
            Assert.IsFalse(advice.FromWorst);
            Assert.AreEqual(BottleneckCause.None, advice.Cause, "the cause belongs to the worst line, not to this one");
        }

        [Test]
        public void WithNoBottleneck_OnlyAWaitPastTheGraceTimeIsWorthAnOffer()
        {
            Assert.IsNull(UpgradeAdvice.For(Resort(5000, 1, 1, 1), T,
                Result(null, BottleneckCause.None, (NeedId.Rooms, 2f), (NeedId.Drinks, T.PatienceGraceSeconds))));

            var advice = UpgradeAdvice.For(Resort(5000, 1, 1, 1), T,
                Result(null, BottleneckCause.None, (NeedId.Rooms, 2f), (NeedId.Food, T.PatienceGraceSeconds + 1f)));
            Assert.AreEqual(BuildingId.Restaurant, advice.Building);
        }

        [Test]
        public void WhenEveryBuildingIsAtTheTopLevel_ThereIsNothingToSuggest()
        {
            Assert.IsNull(UpgradeAdvice.For(Resort(9999, 3, 3, 3), T,
                Result(NeedId.Drinks, BottleneckCause.Capacity, (NeedId.Drinks, 60f))));
        }

        [Test]
        public void ABuildingThatIsNotUnlockedIsNeverSuggested()
        {
            // Only Reception, Restaurant and Beach Bar exist; a long wait recorded for the Pool's need cannot lead to the Pool.
            var advice = UpgradeAdvice.For(Resort(5000, 3, 3, 3), T,
                Result(NeedId.Relax, BottleneckCause.Capacity, (NeedId.Relax, 90f)));
            Assert.IsNull(advice);
        }
    }
}
