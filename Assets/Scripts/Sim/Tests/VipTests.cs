using System;
using System.Collections.Generic;
using NUnit.Framework;
using static ResortEmpire.Sim.Tests.SimTestKit;

namespace ResortEmpire.Sim.Tests
{
    // VIP layer (Build §5.4, UI S6-S8, MVP_DECISIONS P2, P4, P11-P13, P17): readiness and quality caps,
    // Fix, Serve All, real-time services, Speed Up, Quality boost, rating, rewards, decor, snapshots.
    public class VipTests
    {
        static readonly VipType[] AllTypes = (VipType[])Enum.GetValues(typeof(VipType));

        // Accept, fix what the Materials allow, serve, run every service to its end.
        static VipResult PlayThrough(VipVisit v)
        {
            Assert.IsTrue(v.Accept(), v.Type + ": accept");
            foreach (var r in v.Requests)
                if (r.State == RequestState.Missing) v.Fix(r);
            Assert.IsTrue(v.ServeAll(), v.Type + ": serve all");
            v.Tick(1000f);
            Assert.IsTrue(v.IsFinished, v.Type + ": finished");
            Assert.IsNotNull(v.Result);
            return v.Result;
        }

        static VipVisitSnapshot ThroughJson(VipVisitSnapshot s) =>
            UnityEngine.JsonUtility.FromJson<VipVisitSnapshot>(UnityEngine.JsonUtility.ToJson(s));

        [Test]
        public void Schedule_OffersAfterWaves4_7_10AndRotatesTypes()
        {
            var due = new List<int>();
            for (int w = 0; w <= 20; w++)
                if (VipSchedule.OfferDue(w)) due.Add(w);
            CollectionAssert.AreEqual(new[] { 4, 7, 10, 13, 16, 19 }, due);
            Assert.AreEqual(1, VipSchedule.SlotNumber(4));
            Assert.AreEqual(2, VipSchedule.SlotNumber(7));
            Assert.AreEqual(3, VipSchedule.SlotNumber(10));
            Assert.AreEqual(0, VipSchedule.SlotNumber(5));

            var expected = new[]
            {
                VipType.TravelBlogger, VipType.WeddingCouple, VipType.Investor, VipType.Influencer,
                VipType.TravelBlogger, VipType.WeddingCouple, VipType.Investor, VipType.Influencer,
            };
            for (int n = 1; n <= expected.Length; n++)
                Assert.AreEqual(expected[n - 1], VipSchedule.NextType(n), "visit " + n);

            Assert.IsFalse(VipSchedule.OfferDue(4, TuningConfig.Prototype), "no VIPs under the prototype rules");
        }

        [Test]
        public void Catalog_ThreeMainRequestsAndOneBonusPerType()
        {
            var t = TuningConfig.Default;
            var resort = ResortState.NewGame(t);
            var spaTypes = new HashSet<VipType>();
            bool butler = false, captain = false;
            var decor = new HashSet<string>();

            foreach (var type in AllTypes)
            {
                var v = VipCatalog.Create(type, resort, t, 1);
                Assert.AreEqual(type, v.Type);
                Assert.IsFalse(string.IsNullOrEmpty(v.GuestName), type.ToString());
                Assert.IsFalse(v.Accepted);
                Assert.IsFalse(v.Served);
                Assert.IsNull(v.Result);
                Assert.AreEqual(4, v.Requests.Count, type + ": 3 + 1 bonus");
                for (int i = 0; i < v.Requests.Count; i++)
                {
                    var r = v.Requests[i];
                    string ctx = type + " / " + r.Title;
                    Assert.AreEqual(i, r.Index, ctx);
                    Assert.AreEqual(i == 3, r.IsBonus, ctx + ": the bonus request is last");
                    Assert.IsFalse(string.IsNullOrEmpty(r.Title), ctx);
                    Assert.IsFalse(string.IsNullOrEmpty(r.Flavor), ctx);
                    Assert.GreaterOrEqual(r.DurationSeconds, 60f, ctx + ": P12");
                    Assert.LessOrEqual(r.DurationSeconds, 180f, ctx + ": P12");
                    Assert.AreEqual(r.MaterialsNeeded > 0 ? RequestState.Missing : RequestState.Ready, r.State, ctx);
                    Assert.AreEqual(r.MaterialsNeeded > 0, r.MaterialsLabel.Length > 0, ctx);
                    Assert.AreEqual(r.HasRosterRequirement, r.RosterLabel.Length > 0, ctx);
                    if (r.RequiredBuilding == BuildingId.Spa) spaTypes.Add(type);
                    if (r.RequiredSpecialist == SpecialistId.Butler) butler = true;
                    if (r.RequiredSpecialist == SpecialistId.Captain) captain = true;
                }
                Assert.IsTrue(decor.Add(v.DecorId), type + ": one decor item per type (P17)");
            }
            Assert.GreaterOrEqual(spaTypes.Count, 2, "S14: at least two VIP types depend on the Spa");
            Assert.IsTrue(butler, "the Butler is asked for");
            Assert.IsTrue(captain, "the Captain is asked for");

            Assert.AreEqual(BuildingId.Spa, Find(VipCatalog.Create(VipType.WeddingCouple, resort, t, 2), "Couples Spa").RequiredBuilding);
            var influencer = VipCatalog.Create(VipType.Influencer, resort, t, 4);
            Assert.AreEqual(BuildingId.Spa, Find(influencer, "Wellness Content Shoot").RequiredBuilding);
            var maiTai = Find(influencer, "Signature Mai Tai");
            Assert.AreEqual(BuildingId.BeachBar, maiTai.RequiredManager);
            Assert.AreEqual("Bartender", maiTai.RosterLabel);
            Assert.AreEqual(2, maiTai.MaterialsNeeded);
            Assert.AreEqual("2x Mangoes", maiTai.MaterialsLabel);

            Assert.AreEqual("Maya", VipCatalog.Create(VipType.TravelBlogger, resort, t, 1).GuestName);
            Assert.AreEqual("Ana & Leo", VipCatalog.Create(VipType.WeddingCouple, resort, t, 2).GuestName);
            Assert.AreEqual("Mr. Hale", VipCatalog.Create(VipType.Investor, resort, t, 3).GuestName);
            Assert.AreEqual("Chloe", VipCatalog.Create(VipType.Influencer, resort, t, 4).GuestName);
            Assert.AreEqual("Jonas", VipCatalog.Create(VipType.TravelBlogger, resort, t, 5).GuestName, "second round");
            Assert.AreEqual("Travel Blogger", VipCatalog.DisplayName(VipType.TravelBlogger));
            Assert.AreEqual("Golden Palm", VipCatalog.DecorDisplayName(VipCatalog.DecorFor(VipType.TravelBlogger)));
        }

        [Test]
        public void Readiness_FollowsTheRosterUntilAcceptedThenFreezes()
        {
            var t = TuningConfig.Default;
            var r = ResortState.NewGame(t);
            r.Grant(100000, 0, reputation: 100);
            var v = VipCatalog.Create(VipType.WeddingCouple, r, t, 2);

            var spa = Find(v, "Couples Spa");
            Assert.AreEqual(Readiness.Risky, spa.Readiness, "no Spa");
            Assert.AreEqual(0.70f, t.VipRosterGapCap);
            Assert.AreEqual(t.VipRosterGapCap, spa.QualityCap, 1e-6f, "P13: capped at 70 %");
            Assert.AreEqual("Spa", spa.RosterGap);
            Assert.AreEqual("Spa", spa.RosterLabel);
            Assert.AreEqual(RequestState.Ready, spa.State, "a roster gap never blocks (S2)");

            var arch = Find(v, "Flower Arch Photos");
            Assert.AreEqual(Readiness.Good, arch.Readiness, "Materials are not a roster item");
            Assert.AreEqual(1f, arch.QualityCap);
            Assert.AreEqual(RequestState.Missing, arch.State);

            // preparing before accepting lifts the cap: S6 shows readiness live
            Assert.IsTrue(r.Unlock(BuildingId.Spa));
            spa = Find(v, "Couples Spa");
            Assert.AreEqual(Readiness.Good, spa.Readiness);
            Assert.AreEqual(1f, spa.QualityCap);
            Assert.AreEqual("", spa.RosterGap);

            var dinner = Find(v, "Candlelit Dinner");
            Assert.AreEqual(Readiness.Risky, dinner.Readiness);
            Assert.AreEqual("Chef", dinner.RosterGap);
            Assert.AreEqual(RequestState.Missing, dinner.State, "a request can be MISSING and capped at once");

            // accepting is always possible (P4) and freezes the roster: it cannot be completed mid-stay (S7)
            Assert.IsTrue(v.Accept());
            Assert.IsTrue(v.Accepted);
            Assert.IsFalse(v.Accept(), "accepted once");
            Assert.IsTrue(r.HireManager(BuildingId.Restaurant));
            dinner = Find(v, "Candlelit Dinner");
            Assert.AreEqual(Readiness.Risky, dinner.Readiness, "frozen at Accept");
            Assert.AreEqual(t.VipRosterGapCap, dinner.QualityCap, 1e-6f);

            foreach (var type in AllTypes)
                Assert.IsTrue(VipCatalog.Create(type, ResortState.NewGame(t), t, 1).Accept(), type + ": always acceptable");
        }

        [Test]
        public void Fix_SpendsMaterialsOnlyWhenThereAreEnough()
        {
            var t = TuningConfig.Default;
            var r = ResortState.NewGame(t);
            r.Materials = 1;
            var v = VipCatalog.Create(VipType.Influencer, r, t, 4);
            var maiTai = Find(v, "Signature Mai Tai");
            Assert.AreEqual(RequestState.Missing, maiTai.State);

            Assert.IsFalse(v.Fix(maiTai), "accept first");
            Assert.AreEqual(1, r.Materials);
            Assert.IsTrue(v.Accept());

            Assert.IsFalse(v.CanFix(maiTai));
            Assert.IsFalse(v.Fix(maiTai), "1 of 2 Materials");
            Assert.AreEqual(1, r.Materials, "a refused Fix spends nothing");
            Assert.AreEqual(RequestState.Missing, maiTai.State);

            r.Grant(0, 0, materials: 2);
            Assert.IsTrue(v.CanFix(maiTai));
            Assert.IsTrue(v.Fix(maiTai));
            Assert.AreEqual(1, r.Materials, "spent exactly MaterialsNeeded");
            Assert.AreEqual(RequestState.Ready, maiTai.State);
            Assert.IsFalse(v.Fix(maiTai), "already READY");
            Assert.AreEqual(1, r.Materials);

            var stream = Find(v, "Poolside Live Stream");
            Assert.AreEqual(RequestState.Ready, stream.State);
            Assert.IsFalse(v.Fix(stream), "nothing to fix");
            Assert.IsFalse(v.Fix(null));
            var other = VipCatalog.Create(VipType.Influencer, r, t, 4);
            Assert.IsFalse(v.Fix(Find(other, "Floating Breakfast")), "another visit's card");

            Assert.IsTrue(v.ServeAll());
            var breakfast = Find(v, "Floating Breakfast");
            Assert.AreEqual(RequestState.Missing, breakfast.State, "an unfixed bonus is skipped");
            r.Materials = 10;
            Assert.IsFalse(v.Fix(breakfast), "Fix happens before Serve All");
            Assert.AreEqual(10, r.Materials);
        }

        [Test]
        public void ServeAll_TickToCompletion_RewardsAppliedOnce()
        {
            var t = TuningConfig.Default;
            var r = FullyPrepared(t, materials: 10, energy: 0);
            var v = VipCatalog.Create(VipType.TravelBlogger, r, t, 1);
            Assert.IsFalse(v.ServeAll(), "accept first");
            Assert.IsTrue(v.Accept());

            v.Tick(500f); // nothing runs before Serve All
            foreach (var q in v.Requests)
            {
                Assert.AreNotEqual(RequestState.InProgress, q.State, q.Title);
                Assert.AreNotEqual(RequestState.Completed, q.State, q.Title);
            }
            foreach (var q in v.Requests)
                if (q.State == RequestState.Missing) Assert.IsTrue(v.Fix(q), q.Title);

            Assert.IsTrue(v.ServeAll());
            Assert.IsTrue(v.Served);
            Assert.IsFalse(v.ServeAll(), "once");
            float shortest = float.MaxValue;
            foreach (var q in v.Requests)
            {
                Assert.AreEqual(RequestState.InProgress, q.State, q.Title);
                Assert.AreEqual(q.DurationSeconds, q.Remaining, q.Title);
                Assert.AreEqual(1f, q.ServedQuality, q.Title);
                Assert.IsFalse(q.ServedMissing, q.Title);
                shortest = Math.Min(shortest, q.DurationSeconds);
            }
            Assert.IsFalse(v.IsFinished);
            Assert.IsNull(v.Result);

            v.Tick(shortest - 1f);
            foreach (var q in v.Requests)
                Assert.AreEqual(RequestState.InProgress, q.State, q.Title + " one second early");
            v.Tick(1f);
            foreach (var q in v.Requests)
                Assert.AreEqual(q.DurationSeconds <= shortest ? RequestState.Completed : RequestState.InProgress, q.State, q.Title);
            Assert.IsFalse(v.IsFinished);

            int coins = r.Coins, energy = r.Energy, materials = r.Materials, rep = r.Reputation, value = r.ResortValue;
            v.Tick(1000f); // e.g. the app was closed meanwhile
            Assert.IsTrue(v.IsFinished);
            var res = v.Result;
            Assert.IsNotNull(res);
            foreach (var q in v.Requests)
            {
                Assert.AreEqual(RequestState.Completed, q.State, q.Title);
                Assert.AreEqual(0f, q.Remaining, q.Title);
            }

            Assert.AreEqual(VipType.TravelBlogger, res.Type);
            Assert.IsTrue(res.Perfect);
            Assert.AreEqual(5, res.Stars);
            Assert.AreEqual(1f, res.Satisfaction, 1e-5f);
            Assert.IsTrue(res.BonusCompleted);
            Assert.AreEqual(4, res.RequestsCompleted);
            Assert.AreEqual(t.VipReputationBase + 5 * t.VipReputationPerStar + t.VipReputationPerfectBonus, res.ReputationEarned);
            Assert.AreEqual(35, res.ReputationEarned, "P5: 10 + 4 x 5 + 5");
            Assert.AreEqual(ExpectedVipCoins(t, t.RatingThresholds.Length - 1), res.CoinsEarned);
            Assert.AreEqual(t.VipEnergyByStars[4], res.EnergyEarned);
            Assert.AreEqual(t.VipMaterialsByStars[4], res.MaterialsEarned);
            Assert.AreEqual(3, res.MaterialsEarned, "P6: 1 + half of 5 stars");
            Assert.AreEqual(5 * t.VipResortValuePerStar + t.ResortValuePerDecor, res.ResortValueGain, "stars plus the first decor");

            Assert.AreEqual(rep + res.ReputationEarned, r.Reputation);
            Assert.AreEqual(coins + res.CoinsEarned, r.Coins);
            Assert.AreEqual(energy + res.EnergyEarned, r.Energy);
            Assert.AreEqual(materials + res.MaterialsEarned, r.Materials);
            Assert.AreEqual(value + res.ResortValueGain, r.ResortValue);

            v.Tick(1000f);
            Assert.AreSame(res, v.Result);
            Assert.AreEqual(rep + res.ReputationEarned, r.Reputation, "exactly once");
            Assert.AreEqual(coins + res.CoinsEarned, r.Coins, "exactly once");
            Assert.AreEqual(value + res.ResortValueGain, r.ResortValue, "exactly once");
        }

        [Test]
        public void SpeedUp_HalvesTheRemainingTimeOnce()
        {
            var t = TuningConfig.Default;
            var r = FullyPrepared(t, materials: 10, energy: 2 * t.EnergyBoostCost + 1);
            var v = VipCatalog.Create(VipType.Investor, r, t, 3);
            Assert.IsTrue(v.Accept());
            var yacht = Find(v, "Private Yacht Meeting");
            Assert.AreEqual(150f, yacht.DurationSeconds);
            Assert.IsFalse(v.SpeedUp(yacht), "not running yet");
            Assert.AreEqual(7, r.Energy);

            foreach (var q in v.Requests)
                if (q.State == RequestState.Missing) Assert.IsTrue(v.Fix(q));
            Assert.IsTrue(v.ServeAll());
            v.Tick(30f);
            Assert.AreEqual(120f, yacht.Remaining, 1e-3f);

            Assert.IsTrue(v.CanSpeedUp(yacht));
            Assert.IsTrue(v.SpeedUp(yacht));
            Assert.AreEqual(7 - t.EnergyBoostCost, r.Energy);
            Assert.AreEqual(60f, yacht.Remaining, 1e-3f, "P12: half the remaining time");
            Assert.IsTrue(yacht.SpedUp);
            Assert.IsFalse(v.SpeedUp(yacht), "once per request");
            Assert.AreEqual(7 - t.EnergyBoostCost, r.Energy);

            var butler = Find(v, "Personal Butler");
            r.Energy = t.EnergyBoostCost - 1;
            Assert.IsFalse(v.SpeedUp(butler), "not enough Energy");
            Assert.AreEqual(t.EnergyBoostCost - 1, r.Energy);
            Assert.AreEqual(90f, butler.Remaining, 1e-3f);

            v.Tick(60f);
            Assert.AreEqual(RequestState.Completed, yacht.State, "done at 90 s instead of 150 s");
            Assert.AreEqual(RequestState.InProgress, butler.State);
            v.Tick(1000f);
            Assert.IsTrue(v.Result.Perfect, "Speed Up changes time, never quality");
        }

        [Test]
        public void QualityBoost_BuysBackALoweredCapOnce()
        {
            var t = TuningConfig.Default;
            var r = ResortState.NewGame(t); // no Captain, Butler or Receptionist: every main request is Risky
            r.Energy = 10;
            r.Materials = 10;
            var v = VipCatalog.Create(VipType.Investor, r, t, 3);
            var butler = Find(v, "Personal Butler");
            Assert.AreEqual(Readiness.Risky, butler.Readiness);
            Assert.IsFalse(v.QualityBoost(butler), "accept first");
            Assert.AreEqual(10, r.Energy);
            Assert.IsTrue(v.Accept());

            Assert.IsTrue(v.CanQualityBoost(butler));
            Assert.IsTrue(v.QualityBoost(butler));
            Assert.AreEqual(10 - t.EnergyBoostCost, r.Energy);
            Assert.AreEqual(t.VipRosterGapCap + t.VipQualityBoostAmount, butler.QualityCap, 1e-5f, "P12: +15 points");
            Assert.IsTrue(butler.QualityBoosted);
            Assert.IsFalse(v.QualityBoost(butler), "once per request");
            Assert.AreEqual(10 - t.EnergyBoostCost, r.Energy);

            var wine = Find(v, "Vintage Wine Tasting");
            Assert.IsFalse(v.QualityBoost(wine), "MISSING: fix it first");
            Assert.IsTrue(v.Fix(wine));
            Assert.AreEqual(Readiness.Good, wine.Readiness);
            Assert.IsFalse(v.QualityBoost(wine), "a full cap has nothing to buy back");

            var yacht = Find(v, "Private Yacht Meeting");
            r.Energy = t.EnergyBoostCost - 1;
            Assert.IsFalse(v.QualityBoost(yacht), "not enough Energy");
            Assert.AreEqual(t.VipRosterGapCap, yacht.QualityCap, 1e-6f);
            r.Energy = 10;

            Assert.IsTrue(v.ServeAll());
            Assert.IsFalse(v.QualityBoost(yacht), "Mode B lives in READY only");
            Assert.AreEqual(10, r.Energy);

            v.Tick(1000f);
            // main requests at 0.70 / 0.85 / 0.70, bonus completed: 0.75 + 0.10
            Assert.AreEqual(0.85f, v.Result.Satisfaction, 1e-4f);
            Assert.AreEqual(4, v.Result.Stars);
            Assert.IsFalse(v.Result.Perfect);
        }

        [Test]
        public void MissingRequest_IsServedAtFortyPercent()
        {
            var t = TuningConfig.Default;
            var r = FullyPrepared(t, materials: 0, energy: 0);
            var v = VipCatalog.Create(VipType.TravelBlogger, r, t, 1);
            Assert.IsTrue(v.Accept());
            var picnic = Find(v, "Beach Picnic");
            var juice = Find(v, "Fresh Juice Stand");
            Assert.AreEqual(RequestState.Missing, picnic.State);
            Assert.AreEqual(RequestState.Missing, juice.State);

            Assert.IsTrue(v.ServeAll());
            Assert.AreEqual(RequestState.InProgress, picnic.State, "a main request is served anyway");
            Assert.IsTrue(picnic.ServedMissing);
            Assert.AreEqual(t.VipMissingServedQuality, picnic.ServedQuality);
            Assert.AreEqual(0.40f, t.VipMissingServedQuality);
            Assert.AreEqual(RequestState.Missing, juice.State, "an unfixed bonus is optional and skipped");
            Assert.IsFalse(juice.IsServed);

            v.Tick(1000f);
            Assert.IsTrue(v.IsFinished, "the skipped bonus is not waited for");
            var res = v.Result;
            Assert.AreEqual(0.8f, res.Satisfaction, 1e-4f, "(1 + 1 + 0.40) / 3");
            Assert.AreEqual(4, res.Stars);
            Assert.IsFalse(res.BonusCompleted);
            Assert.AreEqual(3, res.RequestsCompleted);
            Assert.GreaterOrEqual(res.Satisfaction, t.WaveFloor, "never zero");
        }

        [Test]
        public void HR2_FullyPreparedResortReachesPerfectWithoutEnergy()
        {
            var t = TuningConfig.Default;
            for (int i = 0; i < AllTypes.Length; i++)
            {
                var type = AllTypes[i];
                var r = FullyPrepared(t, materials: 20, energy: 0);
                var v = VipCatalog.Create(type, r, t, i + 1);
                foreach (var q in v.Requests)
                {
                    Assert.AreEqual(Readiness.Good, q.Readiness, type + " / " + q.Title);
                    Assert.AreEqual(1f, q.QualityCap, type + " / " + q.Title);
                }
                Assert.AreEqual(1f, v.ProjectedQuality, 1e-5f, type.ToString());
                Assert.AreEqual(5, v.ProjectedStars, type.ToString());

                var res = PlayThrough(v);
                Assert.IsTrue(res.Perfect, type + ": Perfect without Energy (HR2), got " + res.Satisfaction);
                Assert.AreEqual(res.EnergyEarned, r.Energy, type + ": no Energy existed and none was needed");
                foreach (var q in v.Requests)
                {
                    Assert.IsFalse(q.SpedUp, q.Title);
                    Assert.IsFalse(q.QualityBoosted, q.Title);
                }
            }
        }

        [Test]
        public void Decor_UnlocksOnTheFirstPerfectStayOnly()
        {
            var t = TuningConfig.Default;
            var r = FullyPrepared(t, materials: 50, energy: 0);
            int value = r.ResortValue;

            var first = PlayThrough(VipCatalog.Create(VipType.WeddingCouple, r, t, 2));
            Assert.IsTrue(first.Perfect);
            Assert.AreEqual(VipCatalog.DecorFor(VipType.WeddingCouple), first.DecorUnlocked);
            Assert.AreEqual("flower_arch", first.DecorUnlocked);
            CollectionAssert.Contains(r.Decor, "flower_arch");
            Assert.AreEqual(5 * t.VipResortValuePerStar + t.ResortValuePerDecor, first.ResortValueGain);
            Assert.AreEqual(value + first.ResortValueGain, r.ResortValue);

            value = r.ResortValue;
            var again = VipCatalog.Create(VipType.WeddingCouple, r, t, 6);
            Assert.AreEqual("Sofia & Tom", again.GuestName);
            var second = PlayThrough(again);
            Assert.IsTrue(second.Perfect);
            Assert.IsNull(second.DecorUnlocked, "only the first Perfect of a type");
            Assert.AreEqual(5 * t.VipResortValuePerStar, second.ResortValueGain);
            Assert.AreEqual(value + second.ResortValueGain, r.ResortValue);
            Assert.AreEqual(1, r.Decor.Count);

            // below Perfect: no decor (no Spa, no Materials for the Mai Tai -> 0.70 / 0.40 / 1.00)
            var bare = FullyPrepared(t, materials: 0, energy: 0, spa: false);
            var plain = PlayThrough(VipCatalog.Create(VipType.Influencer, bare, t, 4));
            Assert.IsFalse(plain.Perfect);
            Assert.AreEqual(3, plain.Stars);
            Assert.IsNull(plain.DecorUnlocked);
            Assert.AreEqual(0, bare.Decor.Count);
        }

        [Test]
        public void Preview_ProjectedQualityAndRewardRangeMatchTheResult()
        {
            var t = TuningConfig.Default;
            var r = ResortState.NewGame(t); // 3 Materials; no Captain, Butler or Receptionist
            r.Coins = 5000;
            var v = VipCatalog.Create(VipType.Investor, r, t, 3);

            // every main request capped at 70 %, the bonus fixable with the starting Materials: 0.70 + 0.10
            Assert.AreEqual(0.8f, v.ProjectedQuality, 1e-4f);
            Assert.AreEqual(4, v.ProjectedStars);
            var range = v.RewardRange;
            Assert.AreEqual(ExpectedVipCoins(t, 3), range.MinCoins);
            Assert.AreEqual(ExpectedVipCoins(t, 5), range.MaxCoins, "upper bound = Perfect stay");
            Assert.AreEqual(1950, range.MaxCoins);
            Assert.AreEqual(t.VipReputationBase + 4 * t.VipReputationPerStar, range.MinReputation);
            Assert.AreEqual(t.VipReputationBase + 5 * t.VipReputationPerStar + t.VipReputationPerfectBonus, range.MaxReputation);
            Assert.AreEqual(t.VipMaterialsByStars[3], range.MinMaterials);
            Assert.AreEqual(t.VipMaterialsByStars[4], range.MaxMaterials);
            Assert.AreEqual(t.VipEnergyByStars[3], range.MinEnergy);
            Assert.AreEqual(t.VipEnergyByStars[4], range.MaxEnergy);

            // without the Materials the bonus drops out of the projection
            r.Materials = 1;
            Assert.AreEqual(0.7f, v.ProjectedQuality, 1e-4f);
            Assert.AreEqual(3, v.ProjectedStars);
            r.Materials = 3;

            // hiring the Captain before accepting lifts it to 5 stars
            Assert.IsTrue(r.HireSpecialist(SpecialistId.Captain));
            Assert.AreEqual(0.9f, v.ProjectedQuality, 1e-4f);
            Assert.AreEqual(5, v.ProjectedStars);
            range = v.RewardRange;
            Assert.AreEqual(ExpectedVipCoins(t, 4), range.MinCoins);
            Assert.LessOrEqual(range.MinCoins, range.MaxCoins);
            Assert.LessOrEqual(range.MinReputation, range.MaxReputation);

            // the stay delivers exactly what the preview promised (S6 must match S8)
            var res = PlayThrough(v);
            Assert.AreEqual(0.9f, res.Satisfaction, 1e-4f);
            Assert.AreEqual(5, res.Stars);
            Assert.IsFalse(res.Perfect);
            Assert.AreEqual(range.MinCoins, res.CoinsEarned);
            Assert.AreEqual(range.MinReputation, res.ReputationEarned);
            Assert.AreEqual(res.Satisfaction, v.ProjectedQuality, "after the stay: its result");
        }

        [Test]
        public void Snapshot_RoundTripMidStayAndAfterTheResult()
        {
            var t = TuningConfig.Default;
            var r = FullyPrepared(t, materials: 10, energy: 10, spa: false);
            var v = VipCatalog.Create(VipType.Influencer, r, t, 8);
            Assert.AreEqual("Kiki", v.GuestName);

            // before Accept: comes back open, readiness still live
            var open = VipVisit.FromSnapshot(ThroughJson(v.ToSnapshot()), r, t);
            Assert.IsFalse(open.Accepted);
            Assert.AreEqual(v.Type, open.Type);
            Assert.AreEqual(8, open.VisitNumber);
            Assert.AreEqual("Kiki", open.GuestName);

            Assert.IsTrue(v.Accept());
            var wellness = Find(v, "Wellness Content Shoot");
            Assert.AreEqual(Readiness.Risky, wellness.Readiness, "no Spa");
            Assert.IsTrue(v.QualityBoost(wellness));
            Assert.IsTrue(v.Fix(Find(v, "Signature Mai Tai")));
            Assert.IsTrue(v.Fix(Find(v, "Floating Breakfast")));
            Assert.IsTrue(v.ServeAll());
            v.Tick(30f);
            Assert.IsTrue(v.SpeedUp(Find(v, "Poolside Live Stream")));

            // the Spa arrives mid-stay: the accepted stay keeps its frozen cap, also after a reload
            r.Grant(10000, 0);
            Assert.IsTrue(r.Unlock(BuildingId.Spa));
            var w = VipVisit.FromSnapshot(ThroughJson(v.ToSnapshot()), r, t);
            Assert.IsTrue(w.Accepted);
            Assert.IsTrue(w.Served);
            Assert.AreEqual(v.Requests.Count, w.Requests.Count);
            for (int i = 0; i < v.Requests.Count; i++)
            {
                var a = v.Requests[i];
                var b = w.Requests[i];
                Assert.AreEqual(a.Title, b.Title);
                Assert.AreEqual(a.State, b.State, a.Title);
                Assert.AreEqual(a.Remaining, b.Remaining, 1e-4f, a.Title);
                Assert.AreEqual(a.QualityCap, b.QualityCap, 1e-6f, a.Title);
                Assert.AreEqual(a.Readiness, b.Readiness, a.Title);
                Assert.AreEqual(a.RosterGap, b.RosterGap, a.Title);
                Assert.AreEqual(a.QualityBoosted, b.QualityBoosted, a.Title);
                Assert.AreEqual(a.SpedUp, b.SpedUp, a.Title);
                Assert.AreEqual(a.ServedMissing, b.ServedMissing, a.Title);
                Assert.AreEqual(a.ServedQuality, b.ServedQuality, 1e-6f, a.Title);
            }
            Assert.AreEqual(Readiness.Risky, Find(w, "Wellness Content Shoot").Readiness, "still frozen after the reload");
            Assert.AreEqual(v.ProjectedQuality, w.ProjectedQuality, 1e-6f);

            // the reloaded stay finishes and pays once
            int rep = r.Reputation;
            w.Tick(1000f);
            Assert.IsTrue(w.IsFinished);
            var res = w.Result;
            Assert.AreEqual(rep + res.ReputationEarned, r.Reputation);

            // a finished stay reloads with its result and never pays again
            var done = VipVisit.FromSnapshot(ThroughJson(w.ToSnapshot()), r, t);
            rep = r.Reputation;
            int coins = r.Coins, value = r.ResortValue;
            Assert.IsTrue(done.IsFinished);
            Assert.IsNotNull(done.Result);
            Assert.AreEqual(res.Satisfaction, done.Result.Satisfaction, 1e-6f);
            Assert.AreEqual(res.Stars, done.Result.Stars);
            Assert.AreEqual(res.Perfect, done.Result.Perfect);
            Assert.AreEqual(res.CoinsEarned, done.Result.CoinsEarned);
            Assert.AreEqual(res.ReputationEarned, done.Result.ReputationEarned);
            Assert.AreEqual(res.ResortValueGain, done.Result.ResortValueGain);
            Assert.AreEqual(res.DecorUnlocked, done.Result.DecorUnlocked);
            Assert.AreEqual(res.BonusCompleted, done.Result.BonusCompleted);
            done.Tick(1000f);
            Assert.AreEqual(rep, r.Reputation);
            Assert.AreEqual(coins, r.Coins);
            Assert.AreEqual(value, r.ResortValue);

            // snapshots that do not fit the catalog are refused
            var bad = ThroughJson(v.ToSnapshot());
            bad.type = 42;
            Assert.Catch<ArgumentException>(() => VipVisit.FromSnapshot(bad, r, t));
            bad = ThroughJson(v.ToSnapshot());
            bad.states = new int[2];
            Assert.Catch<ArgumentException>(() => VipVisit.FromSnapshot(bad, r, t));
            Assert.Catch<ArgumentException>(() => VipVisit.FromSnapshot(null, r, t));
        }
    }
}
