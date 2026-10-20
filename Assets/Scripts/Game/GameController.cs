using System;
using System.Collections.Generic;
using ResortEmpire.Sim;

namespace ResortEmpire.Game
{
    // Single owner of game flow: wave lifecycle, player actions, autosave, change events.
    // Plain C# on purpose — the view and UI layers subscribe and render, they never decide.
    public sealed class GameController
    {
        readonly Dictionary<BuildingId, int> _boostsThisWave = new Dictionary<BuildingId, int>();
        float _accum;
        bool _waveCompletedFired;
        WaveDef _nextWave;
        int _nextWaveFor;
        bool _comebackSettled;

        public ResortState Resort { get; }
        public TuningConfig Tuning { get; }
        public WaveSimulation ActiveWave { get; private set; }     // null between waves
        public int NextWaveIndex { get; private set; }             // 1-based; grows without limit (P10)
        public float SimSpeed { get; set; } = 1f;

        // When the save this session started from was written (Unix seconds); 0 for a brand-new game.
        // Read once at load, so a save made later in the session never hides a comeback (P14).
        public long LastSeenUnixSeconds { get; }

        public WavePhase CurrentPhase => ActiveWave != null ? ActiveWave.Phase : WavePhase.AwaitingWave;
        public bool IsPaused => ActiveWave != null && ActiveWave.IsPaused;
        public bool WaveRunning => ActiveWave != null && ActiveWave.Phase != WavePhase.WaveComplete;

        // Scripted waves 1-8, generated ones after that; cached because the UI asks several times a second.
        public WaveDef NextWaveDef
        {
            get
            {
                if (_nextWave == null || _nextWaveFor != NextWaveIndex)
                {
                    _nextWave = WaveTable.WaveFor(NextWaveIndex, Tuning);
                    _nextWaveFor = NextWaveIndex;
                }
                return _nextWave;
            }
        }

        // A test rewarded video grants exactly one Speed Up's worth of Energy (P16 stub, spec HR1).
        public int TestAdEnergy => Tuning.EnergyBoostCost;

        public event Action WaveStarted;
        public event Action<WaveResult> WaveCompleted;             // fired exactly once per wave
        public event Action StateChanged;
        public event Action<string> Toast;
        public event Action<BuildingId> BuildingTapped;
        public event Action<BuildingId, BuildingId> WorkerMoved;   // from, to

        public GameController(TuningConfig tuning, ResortState resort, int nextWaveIndex, long lastSeenUnixSeconds)
        {
            Tuning = tuning;
            Resort = resort;
            // The next wave always follows the last one completed (a version-1 save that finished the
            // prototype stored 8/8 and continues with wave 9 here).
            NextWaveIndex = Math.Max(Math.Max(nextWaveIndex, 1), resort.WavesCompleted + 1);
            LastSeenUnixSeconds = lastSeenUnixSeconds;
        }

        public void StartNextWave()
        {
            if (ActiveWave != null) return;
            ActiveWave = new WaveSimulation(Resort, NextWaveDef, Tuning);
            _accum = 0f;
            _waveCompletedFired = false;
            _boostsThisWave.Clear();
            ActiveWave.StartWave();
            WaveStarted?.Invoke();
        }

        public void Tick(float unscaledDt)
        {
            if (ActiveWave == null) return;
            if (ActiveWave.IsPaused) { _accum = 0f; return; } // paused time never banks up

            _accum += unscaledDt * SimSpeed;
            while (_accum >= SimClock.DefaultStep && ActiveWave.Phase != WavePhase.WaveComplete)
            {
                ActiveWave.Tick(SimClock.DefaultStep);
                _accum -= SimClock.DefaultStep;
            }

            if (!_waveCompletedFired && ActiveWave.Phase == WavePhase.WaveComplete)
            {
                _waveCompletedFired = true;         // sim object stays alive for the result screen
                StateChanged?.Invoke();             // rewards just landed on ResortState
                WaveCompleted?.Invoke(ActiveWave.Result);
            }
        }

        public void ContinueAfterResults()
        {
            if (ActiveWave == null || ActiveWave.Phase != WavePhase.WaveComplete) return;
            NextWaveIndex++;
            ActiveWave = null;
            TryOfferVip();
            SaveSystem.Save(this);
            StateChanged?.Invoke();
        }

        // --- VIP layer (S6-S8, P11, P18) ------------------------------------------

        // Real time a stay may catch up after the app was closed; services last 1-3 minutes (P12).
        public const float MaxOfflineVipSeconds = 6f * 60f * 60f;

        public VipVisit VipOffer { get; private set; }     // offered, not accepted yet; null when none
        public VipVisit ActiveVip { get; private set; }    // accepted stay; kept after it finishes until S8 is claimed
        public int VipVisitCount { get; private set; }     // offers made so far; the next visit is VipVisitCount + 1
        public bool VipOfferSeen { get; private set; }     // the player already looked at the offer ("Maybe later")
        int _vipOpenedSites;                               // bit mask of sites whose gate the last stay opened

        public event Action<VipVisit> VipOffered;
        public event Action VipChanged;
        public event Action<VipResult> VipFinished;

        public bool VipResultPending => ActiveVip != null && ActiveVip.Result != null;

        // Rebuilds the saved VIP state on load and lets the stay catch up the real time since the save.
        public void RestoreVip(VipVisitSnapshot offer, VipVisitSnapshot active, int visitCount, bool offerSeen,
            long savedAtUnixSeconds)
        {
            VipVisitCount = Math.Max(0, visitCount);
            VipOffer = TryRestore(offer);
            if (VipOffer != null && VipOffer.Accepted) VipOffer = null;
            ActiveVip = TryRestore(active);
            if (ActiveVip != null && !ActiveVip.Accepted) ActiveVip = null;
            VipOfferSeen = VipOffer != null && offerSeen;
            if (ActiveVip == null || savedAtUnixSeconds <= 0) return;
            long now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
            float away = Math.Min(MaxOfflineVipSeconds, Math.Max(0f, now - savedAtUnixSeconds));
            bool wasFinished = ActiveVip.Result != null;
            TickVip(away);
            if (!wasFinished && ActiveVip.Result != null) SaveSystem.Save(this);
        }

        VipVisit TryRestore(VipVisitSnapshot snapshot)
        {
            if (snapshot == null) return null;
            try { return VipVisit.FromSnapshot(snapshot, Resort, Tuning); }
            catch (Exception) { return null; } // an unreadable stay is dropped, never the whole save
        }

        void TryOfferVip()
        {
            if (VipOffer != null || (ActiveVip != null && ActiveVip.Result == null)) return; // one at a time
            if (!VipSchedule.OfferDue(Resort.WavesCompleted, Tuning)) return;
            VipVisitCount++;
            VipOffer = VipCatalog.Create(VipSchedule.NextType(VipVisitCount), Resort, Tuning, VipVisitCount);
            VipOfferSeen = false;
            Toast?.Invoke("VIP guest waiting: " + VipOffer.GuestName);
            VipOffered?.Invoke(VipOffer);
            VipChanged?.Invoke();
        }

        public bool AcceptVip()
        {
            if (VipOffer == null || ActiveVip != null) return false;
            if (!VipOffer.Accept()) return false;
            ActiveVip = VipOffer;
            VipOffer = null;
            VipOfferSeen = false;
            AfterVipAction(ActiveVip.GuestName + " has checked in");
            return true;
        }

        // The offer simply keeps waiting — no expiry (P11).
        public void MaybeLaterVip()
        {
            if (VipOffer == null) return;
            VipOfferSeen = true;
            AfterVipAction(null);
        }

        // Never punished: the offer goes away until the next VIP slot (P11).
        public bool DeclineVip()
        {
            if (VipOffer == null) return false;
            string name = VipOffer.GuestName;
            VipOffer = null;
            VipOfferSeen = false;
            AfterVipAction(name + " will visit another time");
            return true;
        }

        public bool FixRequest(VipRequest r)
        {
            if (ActiveVip == null || !ActiveVip.Fix(r)) return false;
            AfterVipAction("Ready: " + r.Title);
            return true;
        }

        public bool ServeAllVip()
        {
            if (ActiveVip == null) return false;
            int before = EligibleSiteMask();
            if (!ActiveVip.ServeAll()) return false;
            AfterVipAction("Services started for " + ActiveVip.GuestName);
            CheckVipFinished(before);
            return true;
        }

        public bool SpeedUpRequest(VipRequest r)
        {
            if (ActiveVip == null || !ActiveVip.SpeedUp(r)) return false;
            AfterVipAction("Speed Up: " + r.Title);
            return true;
        }

        public bool QualityBoostRequest(VipRequest r)
        {
            if (ActiveVip == null || !ActiveVip.QualityBoost(r)) return false;
            AfterVipAction("Quality boost: " + r.Title);
            return true;
        }

        // S8 CLAIM REWARDS: the sim applied the rewards when the stay finished; this only clears it.
        public bool ClaimVipResult()
        {
            if (!VipResultPending) return false;
            ActiveVip = null;
            AfterVipAction(null);
            return true;
        }

        // A site whose gate the last finished stay opened (S9 may follow S8); consumed once.
        public BuildingId? TakeVipOpenedSite()
        {
            foreach (var b in UnlockableSites)
                if ((_vipOpenedSites & (1 << (int)b)) != 0 && Resort.IsEligible(b))
                {
                    _vipOpenedSites = 0;
                    return b;
                }
            _vipOpenedSites = 0;
            return null;
        }

        static readonly BuildingId[] UnlockableSites = { BuildingId.Pool, BuildingId.Bungalows, BuildingId.Spa };

        int EligibleSiteMask()
        {
            int mask = 0;
            foreach (var b in UnlockableSites)
                if (Resort.IsEligible(b)) mask |= 1 << (int)b;
            return mask;
        }

        // Real seconds (unscaled wall-clock time): runs during waves, while a wave is paused and under menus,
        // because VIP services are not wave time (P18).
        public void TickVip(float realSeconds)
        {
            var v = ActiveVip;
            if (v == null || !v.Served || v.Result != null || !(realSeconds > 0f)) return;
            int before = EligibleSiteMask();
            int done = CompletedCount(v);
            v.Tick(Math.Min(realSeconds, MaxOfflineVipSeconds));
            if (v.Result == null)
            {
                if (CompletedCount(v) > done)
                {
                    Toast?.Invoke(v.GuestName + ": a request is complete");
                    VipChanged?.Invoke();
                }
                return;
            }
            CheckVipFinished(before);
        }

        void CheckVipFinished(int eligibleBefore)
        {
            var v = ActiveVip;
            if (v == null || v.Result == null) return;
            _vipOpenedSites = EligibleSiteMask() & ~eligibleBefore;
            if (ActiveWave == null) SaveSystem.Save(this);
            StateChanged?.Invoke();
            Toast?.Invoke(v.GuestName + "'s stay is complete");
            VipChanged?.Invoke();
            VipFinished?.Invoke(v.Result);
        }

        static int CompletedCount(VipVisit v)
        {
            int n = 0;
            foreach (var r in v.Requests)
                if (r.State == RequestState.Completed) n++;
            return n;
        }

        void AfterVipAction(string toast)
        {
            if (ActiveWave == null) SaveSystem.Save(this);
            StateChanged?.Invoke();
            if (toast != null) Toast?.Invoke(toast);
            VipChanged?.Invoke();
        }

        // --- player actions -------------------------------------------------

        public bool MoveWorker(BuildingId from, BuildingId to)
        {
            bool ok = WaveRunning ? ActiveWave.MoveWorker(from, to) : Resort.MoveWorker(from, to);
            if (!ok) return false;
            if (ActiveWave == null) SaveSystem.Save(this);
            StateChanged?.Invoke();
            Toast?.Invoke("Worker moved to " + DisplayName(to));
            WorkerMoved?.Invoke(from, to);
            return true;
        }

        public bool Boost(BuildingId b)
        {
            if (!WaveRunning) return false;
            if (!ActiveWave.UseEnergyBoost(b)) return false;
            _boostsThisWave.TryGetValue(b, out int used);
            _boostsThisWave[b] = used + 1;
            StateChanged?.Invoke();
            Toast?.Invoke("Speed Up active at " + DisplayName(b));
            return true;
        }

        // True once this building has used its Speed Up allowance in the running wave.
        public bool BoostSpent(BuildingId b)
            => _boostsThisWave.TryGetValue(b, out int used) && used >= Tuning.MaxBoostsPerBuildingPerWave;

        // The rewarded-video stub replaces Speed Up only where Speed Up would be offered but Energy is short.
        public bool CanOfferTestAd(BuildingId b)
            => WaveRunning && !ActiveWave.IsPaused && Resort.IsUnlocked(b) && !BoostSpent(b)
               && ActiveWave.BoostRemaining(b) <= 0f && Resort.Energy < Tuning.EnergyBoostCost;

        // Test ad: grants immediately, never pauses or blocks the wave.
        public void WatchTestAd()
        {
            Resort.Grant(0, TestAdEnergy);
            if (ActiveWave == null) SaveSystem.Save(this);
            StateChanged?.Invoke();
            Toast?.Invoke("Test ad watched: +" + TestAdEnergy + " Energy");
        }

        public bool Upgrade(BuildingId b)
        {
            if (ActiveWave != null) return false; // upgrades exist only between waves (WR6)
            if (!Resort.Upgrade(b)) return false;
            SaveSystem.Save(this);
            StateChanged?.Invoke();
            Toast?.Invoke(DisplayName(b) + " upgraded to Lv" + Resort.Get(b).Level);
            return true;
        }

        public bool Unlock(BuildingId b)
        {
            if (ActiveWave != null) return false; // unlocks exist only between waves (WR6)
            if (!Resort.Unlock(b)) return false;
            SaveSystem.Save(this);
            StateChanged?.Invoke();
            Toast?.Invoke(DisplayName(b) + " unlocked");
            return true;
        }

        // Hiring follows the upgrade rule: between waves only (build doc §5.3.7).
        public bool HireWorker(BuildingId placeOn)
        {
            if (ActiveWave != null) return false;
            if (!Resort.HireWorker(placeOn)) return false;
            SaveSystem.Save(this);
            StateChanged?.Invoke();
            Toast?.Invoke("New worker at " + DisplayName(placeOn));
            return true;
        }

        public bool HireManager(BuildingId b)
        {
            if (ActiveWave != null) return false;
            if (!Resort.HireManager(b)) return false;
            SaveSystem.Save(this);
            StateChanged?.Invoke();
            Toast?.Invoke(ManagerTitle(b) + " joined the " + DisplayName(b));
            return true;
        }

        public bool HireSpecialist(SpecialistId s)
        {
            if (ActiveWave != null) return false;
            if (!Resort.HireSpecialist(s)) return false;
            SaveSystem.Save(this);
            StateChanged?.Invoke();
            Toast?.Invoke(SpecialistTitle(s) + " joined your resort");
            return true;
        }

        // --- comeback reward (P14) -------------------------------------------

        // The sim decides whether a gift is due from the save's timestamp; the game layer only passes
        // the clock. A brand-new game has no timestamp and never gets one.
        public bool TryGetComebackGift(out ComebackResult gift)
        {
            gift = default;
            if (LastSeenUnixSeconds <= 0 || ActiveWave != null)
            {
                _comebackSettled = true;
                return false;
            }
            long now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
            gift = ComebackReward.Evaluate(LastSeenUnixSeconds, now, Tuning);
            if (!gift.Due) _comebackSettled = true;
            return gift.Due;
        }

        public void CollectComebackGift(ComebackResult gift)
        {
            if (!gift.Due) return;
            _comebackSettled = true;
            Resort.Grant(gift.Coins, gift.Energy);
            SaveSystem.Save(this); // moves the timestamp to now, so the same return pays out once
            StateChanged?.Invoke();
        }

        // The "last seen" time a save should store. Until this session's comeback check is settled
        // (nothing due, or the gift collected) a save keeps the loaded time, so backgrounding the app on
        // the main menu or under the welcome card never uses the gift up.
        public long LastSeenForSave(long nowUnixSeconds)
            => _comebackSettled || LastSeenUnixSeconds <= 0 ? nowUnixSeconds : LastSeenUnixSeconds;

        public void SetPaused(bool paused)
        {
            if (!WaveRunning) return;
            if (ActiveWave.IsPaused == paused) return;
            ActiveWave.IsPaused = paused;
            StateChanged?.Invoke();
        }

        // The view layer reports taps here; UI panels subscribe to BuildingTapped.
        public void RaiseBuildingTapped(BuildingId b) => BuildingTapped?.Invoke(b);

        public static string DisplayName(BuildingId b)
            => b == BuildingId.BeachBar ? "Beach Bar" : b.ToString();

        // Staff names (build doc §5.3.2): one named Manager per wave building, two building-free Specialists.
        public static string ManagerTitle(BuildingId b)
        {
            switch (b)
            {
                case BuildingId.Reception: return "Receptionist";
                case BuildingId.Restaurant: return "Chef";
                case BuildingId.BeachBar: return "Bartender";
                case BuildingId.Pool: return "Lifeguard";
                case BuildingId.Bungalows: return "Bellhop";
                default: return "Manager";
            }
        }

        public static string SpecialistTitle(SpecialistId s) => s.ToString();
    }
}
