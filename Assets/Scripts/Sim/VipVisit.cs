using System;
using System.Collections.Generic;

namespace ResortEmpire.Sim
{
    // One VIP stay (Build §5.4, UI S6-S8). Solved by preparedness, never by assigning staff:
    //  - consumable gaps (Materials) start MISSING and are fixed on the spot with Fix;
    //  - roster gaps (building, Manager, Specialist) never block, they lower the request's QualityCap.
    // Before Accept the roster readiness follows the resort live (S6 shows it before accepting); from
    // Accept on it is frozen, because the roster cannot be completed during the stay (S7).
    // Services run on real time (Tick), also while the app is closed, alongside normal waves (P18).
    // Energy is optional: a fully prepared resort reaches Perfect without it (HR2).
    public sealed class VipVisit
    {
        readonly ResortState _resort;
        readonly TuningConfig _t;
        readonly List<VipRequest> _requests;

        struct Rewards
        {
            public int Coins, Reputation, Energy, Materials;
        }

        internal VipVisit(VipType type, int visitNumber, ResortState resort, TuningConfig tuning, List<VipRequest> requests)
        {
            Type = type;
            VisitNumber = visitNumber;
            _resort = resort;
            _t = tuning;
            _requests = requests;
            GuestName = VipCatalog.GuestNameFor(type, visitNumber);
            DecorId = VipCatalog.DecorFor(type);
            RefreshReadiness();
        }

        public VipType Type { get; }
        public int VisitNumber { get; }
        public string GuestName { get; }
        public string DecorId { get; }                     // decor a Perfect stay unlocks (first time per type)
        public bool Accepted { get; private set; }
        public bool Served { get; private set; }           // Serve All was pressed
        public VipResult Result { get; private set; }      // null until IsFinished; rewards applied exactly once

        // Main requests first, the bonus request last. Readiness is live until Accept.
        public IReadOnlyList<VipRequest> Requests
        {
            get
            {
                RefreshReadiness();
                return _requests;
            }
        }

        // Every served request has completed.
        public bool IsFinished
        {
            get
            {
                if (!Served) return false;
                foreach (var r in _requests)
                    if (r.State == RequestState.InProgress) return false;
                return true;
            }
        }

        // --- player actions -----------------------------------------------------------------------

        // Always possible (P4). Freezes roster readiness and quality caps.
        public bool Accept()
        {
            if (Accepted) return false;
            RefreshReadiness();
            Accepted = true;
            return true;
        }

        public bool CanFix(VipRequest request) =>
            Owns(request) && Accepted && !Served && request.State == RequestState.Missing
            && _resort.Materials >= request.MaterialsNeeded;

        // Consumable layer: spends the request's Materials, MISSING -> READY. Refused without enough Materials.
        public bool Fix(VipRequest request)
        {
            if (!CanFix(request)) return false;
            _resort.Materials -= request.MaterialsNeeded;
            request.State = RequestState.Ready;
            return true;
        }

        // Starts every READY request; a main request still MISSING is served too, at
        // VipMissingServedQuality (never zero); a bonus request still MISSING is optional and skipped.
        public bool ServeAll()
        {
            if (!Accepted || Served) return false;
            foreach (var r in _requests)
            {
                if (r.State == RequestState.Ready)
                    Start(r, r.QualityCap, false);
                else if (r.State == RequestState.Missing && !r.IsBonus)
                    Start(r, MissingQuality(r), true);
            }
            Served = true;
            TryFinish();
            return true;
        }

        public bool CanSpeedUp(VipRequest request) =>
            Owns(request) && request.State == RequestState.InProgress && !request.SpedUp
            && _resort.Energy >= _t.EnergyBoostCost;

        // Energy Mode A (P12): halves the remaining time of a running service, once per request.
        public bool SpeedUp(VipRequest request)
        {
            if (!CanSpeedUp(request)) return false;
            _resort.Energy -= _t.EnergyBoostCost;
            request.Remaining *= _t.VipSpeedUpFactor;
            request.SpedUp = true;
            return true;
        }

        public bool CanQualityBoost(VipRequest request) =>
            Owns(request) && Accepted && !Served && request.State == RequestState.Ready
            && !request.QualityBoosted && request.QualityCap < 1f - 1e-6f
            && _resort.Energy >= _t.EnergyBoostCost;

        // Energy Mode B (P12): in READY, buys back part of a lowered quality cap, once per request.
        public bool QualityBoost(VipRequest request)
        {
            if (!CanQualityBoost(request)) return false;
            _resort.Energy -= _t.EnergyBoostCost;
            request.QualityCap = Math.Min(1f, request.QualityCap + _t.VipQualityBoostAmount);
            request.QualityBoosted = true;
            return true;
        }

        // Real seconds since the last call (also the whole time the app was closed).
        public void Tick(float realSeconds)
        {
            if (!Served || Result != null || !(realSeconds > 0f)) return;
            foreach (var r in _requests)
            {
                if (r.State != RequestState.InProgress) continue;
                r.Remaining -= realSeconds;
                if (r.Remaining <= 0f)
                {
                    r.Remaining = 0f;
                    r.State = RequestState.Completed;
                }
            }
            TryFinish();
        }

        // --- preview (S6, S7) -------------------------------------------------------------------

        // The satisfaction this stay reaches as prepared right now, without Energy: READY requests at
        // their cap, MISSING ones at their cap if the current Materials can fix them (main requests
        // first), otherwise main requests at VipMissingServedQuality and the bonus not at all.
        // After the visit: its result.
        public float ProjectedQuality
        {
            get
            {
                if (Result != null) return Result.Satisfaction;
                RefreshReadiness();
                return Satisfaction(true, out _);
            }
        }

        public int ProjectedStars => RatingScale.StarsFor(RatingScale.TierFor(ProjectedQuality, _t));

        // Min = rewards of the projected rating, Max = rewards of a Perfect stay (decor not included).
        public VipRewardRange RewardRange
        {
            get
            {
                var min = RewardsFor(RatingScale.TierFor(ProjectedQuality, _t));
                var max = RewardsFor(_t.RatingThresholds.Length - 1);
                return new VipRewardRange
                {
                    MinCoins = min.Coins,
                    MaxCoins = max.Coins,
                    MinReputation = min.Reputation,
                    MaxReputation = max.Reputation,
                    MinMaterials = min.Materials,
                    MaxMaterials = max.Materials,
                    MinEnergy = min.Energy,
                    MaxEnergy = max.Energy,
                };
            }
        }

        // --- save / restore -----------------------------------------------------------------------

        public VipVisitSnapshot ToSnapshot()
        {
            int n = _requests.Count;
            var s = new VipVisitSnapshot
            {
                type = (int)Type,
                visitNumber = VisitNumber,
                accepted = Accepted,
                served = Served,
                states = new int[n],
                remaining = new float[n],
                qualityCaps = new float[n],
                readiness = new int[n],
                rosterGaps = new string[n],
                qualityBoosted = new bool[n],
                spedUp = new bool[n],
                servedMissing = new bool[n],
                servedQuality = new float[n],
                resultDecor = "",
            };
            for (int i = 0; i < n; i++)
            {
                var r = _requests[i];
                s.states[i] = (int)r.State;
                s.remaining[i] = r.Remaining;
                s.qualityCaps[i] = r.QualityCap;
                s.readiness[i] = (int)r.Readiness;
                s.rosterGaps[i] = r.RosterGap ?? "";
                s.qualityBoosted[i] = r.QualityBoosted;
                s.spedUp[i] = r.SpedUp;
                s.servedMissing[i] = r.ServedMissing;
                s.servedQuality[i] = r.ServedQuality;
            }
            if (Result != null)
            {
                s.finished = true;
                s.resultSatisfaction = Result.Satisfaction;
                s.resultStars = Result.Stars;
                s.resultPerfect = Result.Perfect;
                s.resultReputation = Result.ReputationEarned;
                s.resultCoins = Result.CoinsEarned;
                s.resultEnergy = Result.EnergyEarned;
                s.resultMaterials = Result.MaterialsEarned;
                s.resultResortValue = Result.ResortValueGain;
                s.resultDecor = Result.DecorUnlocked ?? "";
                s.resultRequestsCompleted = Result.RequestsCompleted;
                s.resultBonusCompleted = Result.BonusCompleted;
            }
            return s;
        }

        // Rebuilds a saved visit on top of `resort`. A finished visit comes back with its result and
        // never applies its rewards again. Throws ArgumentException for a snapshot that does not fit
        // the catalog.
        public static VipVisit FromSnapshot(VipVisitSnapshot snapshot, ResortState resort, TuningConfig tuning)
        {
            if (snapshot == null) throw new ArgumentNullException(nameof(snapshot));
            if (!Enum.IsDefined(typeof(VipType), snapshot.type))
                throw new ArgumentException("Unknown VIP type " + snapshot.type + ".");
            var v = VipCatalog.Create((VipType)snapshot.type, resort, tuning, snapshot.visitNumber);
            int n = v._requests.Count;
            if (!Fits(snapshot.states, n) || !Fits(snapshot.remaining, n) || !Fits(snapshot.qualityCaps, n)
                || !Fits(snapshot.readiness, n) || !Fits(snapshot.rosterGaps, n) || !Fits(snapshot.qualityBoosted, n)
                || !Fits(snapshot.spedUp, n) || !Fits(snapshot.servedMissing, n) || !Fits(snapshot.servedQuality, n))
                throw new ArgumentException("VIP snapshot arrays do not match the " + n + " catalog requests.");

            for (int i = 0; i < n; i++)
            {
                var r = v._requests[i];
                if (!Enum.IsDefined(typeof(RequestState), snapshot.states[i])
                    || !Enum.IsDefined(typeof(Readiness), snapshot.readiness[i]))
                    throw new ArgumentException("VIP snapshot request " + i + " has an unknown state.");
                r.State = (RequestState)snapshot.states[i];
                r.Remaining = Math.Max(0f, snapshot.remaining[i]);
                r.QualityCap = snapshot.qualityCaps[i];
                r.Readiness = (Readiness)snapshot.readiness[i];
                r.RosterGap = snapshot.rosterGaps[i] ?? "";
                r.QualityBoosted = snapshot.qualityBoosted[i];
                r.SpedUp = snapshot.spedUp[i];
                r.ServedMissing = snapshot.servedMissing[i];
                r.ServedQuality = snapshot.servedQuality[i];
            }
            v.Accepted = snapshot.accepted;
            v.Served = snapshot.served;
            v.RefreshReadiness(); // live again if the visit was not accepted yet

            if (snapshot.finished)
                v.Result = new VipResult
                {
                    Type = v.Type,
                    Satisfaction = snapshot.resultSatisfaction,
                    Stars = snapshot.resultStars,
                    Perfect = snapshot.resultPerfect,
                    ReputationEarned = snapshot.resultReputation,
                    CoinsEarned = snapshot.resultCoins,
                    EnergyEarned = snapshot.resultEnergy,
                    MaterialsEarned = snapshot.resultMaterials,
                    ResortValueGain = snapshot.resultResortValue,
                    DecorUnlocked = string.IsNullOrEmpty(snapshot.resultDecor) ? null : snapshot.resultDecor,
                    RequestsCompleted = snapshot.resultRequestsCompleted,
                    BonusCompleted = snapshot.resultBonusCompleted,
                };
            return v;
        }

        // --- internals ------------------------------------------------------------------------------

        bool Owns(VipRequest request) => request != null && _requests.Contains(request);

        float MissingQuality(VipRequest r) => Math.Min(r.QualityCap, _t.VipMissingServedQuality);

        static void Start(VipRequest r, float quality, bool missing)
        {
            r.ServedQuality = quality;
            r.ServedMissing = missing;
            r.State = RequestState.InProgress;
            r.Remaining = r.DurationSeconds;
        }

        void RefreshReadiness()
        {
            if (Accepted) return;
            foreach (var r in _requests)
            {
                string gap = RosterGapOf(r);
                bool risky = gap.Length > 0;
                r.RosterGap = gap;
                r.Readiness = risky ? Readiness.Risky : Readiness.Good;
                r.QualityCap = risky ? Math.Min(1f, _t.VipRosterGapCap) : 1f;
            }
        }

        string RosterGapOf(VipRequest r)
        {
            var missing = new List<string>();
            if (r.RequiredBuilding.HasValue && !_resort.IsUnlocked(r.RequiredBuilding.Value))
                missing.Add(BuildingNeeds.DisplayName(r.RequiredBuilding.Value));
            if (r.RequiredManager.HasValue && !_resort.HasManager(r.RequiredManager.Value))
                missing.Add(BuildingNeeds.ManagerTitle(r.RequiredManager.Value));
            if (r.RequiredSpecialist.HasValue && !_resort.HasSpecialist(r.RequiredSpecialist.Value))
                missing.Add(r.RequiredSpecialist.Value.ToString());
            return string.Join(" + ", missing);
        }

        // P13: average quality of the main requests, + VipBonusSatisfaction for a (projected) completed
        // bonus, kept within WaveFloor..1 so the worst stay is still 1 star.
        float Satisfaction(bool projected, out bool bonusCounts)
        {
            int budget = _resort.Materials;
            float mainSum = 0f;
            int mains = 0;
            bonusCounts = false;
            for (int pass = 0; pass < 2; pass++)          // main requests claim the Materials first
                foreach (var r in _requests)
                {
                    if (r.IsBonus != (pass == 1)) continue;
                    float quality;
                    bool counts;
                    if (r.IsServed)
                    {
                        quality = r.ServedQuality;
                        counts = projected || r.State == RequestState.Completed;
                    }
                    else if (!projected || Served)         // never served (a skipped bonus)
                    {
                        quality = MissingQuality(r);
                        counts = false;
                    }
                    else if (r.State == RequestState.Ready)
                    {
                        quality = r.QualityCap;
                        counts = true;
                    }
                    else if (budget >= r.MaterialsNeeded)  // MISSING, but the Materials are there to fix it
                    {
                        budget -= r.MaterialsNeeded;
                        quality = r.QualityCap;
                        counts = true;
                    }
                    else
                    {
                        quality = MissingQuality(r);
                        counts = false;
                    }

                    if (!r.IsBonus)
                    {
                        mainSum += quality;
                        mains++;
                    }
                    else if (counts) bonusCounts = true;
                }

            float s = mains > 0 ? mainSum / mains : 1f;
            if (bonusCounts) s += _t.VipBonusSatisfaction;
            return Math.Max(_t.WaveFloor, Math.Min(1f, s));
        }

        Rewards RewardsFor(int tier)
        {
            int stars = RatingScale.StarsFor(tier);
            bool perfect = RatingScale.IsPerfect(tier, _t);
            return new Rewards
            {
                Coins = (int)Math.Round(_t.VipCoinsBase * (double)_t.CoinsRatingMult[tier], MidpointRounding.AwayFromZero),
                Reputation = _t.VipReputationBase + _t.VipReputationPerStar * stars + (perfect ? _t.VipReputationPerfectBonus : 0),
                Energy = ByStars(_t.VipEnergyByStars, stars),
                Materials = ByStars(_t.VipMaterialsByStars, stars),
            };
        }

        static int ByStars(int[] table, int stars)
        {
            if (table == null || table.Length == 0) return 0;
            return table[Math.Max(0, Math.Min(stars - 1, table.Length - 1))];
        }

        void TryFinish()
        {
            if (Result != null || !IsFinished) return;
            float satisfaction = Satisfaction(false, out bool bonus);
            int tier = RatingScale.TierFor(satisfaction, _t);
            var rewards = RewardsFor(tier);
            int completed = 0;
            foreach (var r in _requests)
                if (r.State == RequestState.Completed) completed++;

            var result = new VipResult
            {
                Type = Type,
                Satisfaction = satisfaction,
                Stars = RatingScale.StarsFor(tier),
                Perfect = RatingScale.IsPerfect(tier, _t),
                ReputationEarned = rewards.Reputation,
                CoinsEarned = rewards.Coins,
                EnergyEarned = rewards.Energy,
                MaterialsEarned = rewards.Materials,
                RequestsCompleted = completed,
                BonusCompleted = bonus,
            };
            result.ResortValueGain = result.Stars * _t.VipResortValuePerStar;

            // Rewards apply to ResortState exactly once, here (S8 order: Reputation first).
            _resort.AddReputation(result.ReputationEarned);
            _resort.Coins += result.CoinsEarned;
            _resort.Energy += result.EnergyEarned;
            _resort.Materials += result.MaterialsEarned;
            _resort.ResortValue += result.ResortValueGain;
            if (result.Perfect && _resort.AddDecor(DecorId)) // P17: first Perfect of this type only
            {
                result.DecorUnlocked = DecorId;
                result.ResortValueGain += _t.ResortValuePerDecor;
            }
            Result = result;
        }

        static bool Fits<T>(T[] array, int n) => array != null && array.Length == n;
    }
}
