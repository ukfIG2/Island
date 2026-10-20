using System.Collections.Generic;
using ResortEmpire.Game.View;
using ResortEmpire.Sim;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem.UI;
using UnityEngine.UI;

namespace ResortEmpire.Game.Ui
{
    // Builds the whole interface on one runtime canvas: S1 home, S2 wave panel and rush prompt, S3 worker
    // sheet, toasts, the post-wave screens S4 / S5 / S9, the Staff screen, the comeback card, the coach
    // hints and the app shell. A small driver keeps it in sync.
    public static class GameUiBuilder
    {
        public static void Build(GameBootstrap host, GameController game)
        {
            var canvasGo = new GameObject("GameUi", typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
            canvasGo.GetComponent<Canvas>().renderMode = RenderMode.ScreenSpaceOverlay;
            var scaler = canvasGo.GetComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1920f, 1080f);
            scaler.matchWidthOrHeight = 0.5f;

            if (Object.FindFirstObjectByType<EventSystem>() == null)
                new GameObject("EventSystem", typeof(EventSystem), typeof(InputSystemUIInputModule));

            canvasGo.AddComponent<GameUiDriver>().Init(host, game);
        }
    }

    // Owns panel lifetimes, event wiring, the post-wave flow and the few-times-per-second refresh.
    public sealed class GameUiDriver : MonoBehaviour
    {
        const float RefreshInterval = 0.25f;
        // A short beat on the island before S4, so the guests heading home are seen, not hidden by the dim.
        const float ResultBeatSeconds = 0.6f;
        const float LeavingBeatSeconds = 1.8f;

        // Post-wave flow S4 -> S5 -> S9. Claiming S4 closes the wave first, so S5 and S9 run between
        // waves where upgrades, hiring and unlocks are allowed (WR6).
        enum Flow { None, Beat, Results, Upgrade, Unlock }

        GameController _game;
        TopBarUi _topBar;
        HomeUi _home;
        NeedsPanelUi _needs;
        RushPromptUi _rush;
        WorkerSheetUi _sheet;
        ToastUi _toasts;
        WaveCompleteUi _results;
        UpgradeSuggestionUi _upgrade;
        AreaUnlockUi _unlock;
        StaffUi _staff;
        ComebackUi _comeback;
        TutorialUi _tutorial;
        AppShellUi _shell;
        VipPreviewUi _vipPreview;
        VipBoardUi _vipBoard;
        bool _vipTab;                 // during a wave the right side shows the Request Board instead of S2
        NeedStatus[] _lastStatus;
        float _sinceRefresh;

        Flow _flow;
        WaveResult _flowResult;
        float _beatLeft;
        WaveSimulation _rushSeenIn;
        // Sites already eligible when the wave started; S9 opens by itself only for a site whose gate
        // was reached during the wave just played (false -> true), whatever the gate is made of.
        readonly HashSet<BuildingId> _eligibleAtWaveStart = new HashSet<BuildingId>();

        public void Init(GameBootstrap host, GameController game)
        {
            _game = game;
            var canvas = transform;
            _topBar = new TopBarUi(canvas, game, OnMenuPressed, OnGemsPressed);
            _toasts = new ToastUi(canvas);
            _sheet = new WorkerSheetUi(canvas, game, _toasts);
            _home = new HomeUi(canvas, game, _sheet, OpenStaff, OpenVip);
            _needs = new NeedsPanelUi(canvas, game, _sheet, OnVipTab);
            _vipBoard = new VipBoardUi(canvas, game, OnBoardBack);
            _rush = new RushPromptUi(canvas, game, _sheet);
            _vipPreview = new VipPreviewUi(canvas, game, OnVipAccepted, RefreshAll);
            _results = new WaveCompleteUi(canvas, game, OnResultsClaimed, OnVipResultClaimed);
            _upgrade = new UpgradeSuggestionUi(canvas, game, OnUpgradeClosed);
            _unlock = new AreaUnlockUi(canvas, game, OnUnlockClosed);
            _staff = new StaffUi(canvas, game, RefreshAll);
            _comeback = new ComebackUi(canvas, game, RefreshAll);
            _tutorial = new TutorialUi(canvas, game);
            _shell = new AppShellUi(canvas, game, host.StartOver, RefreshAll, OnSessionStarted);
            // Draw order, back to front: top bar, home, wave panel, VIP board, rush prompt, sheet, toasts,
            // S6, S4 / S8, S5, S9, Staff, comeback card, coach hints, menus.
            _vipBoard.Root.transform.SetAsLastSibling();
            _rush.Root.transform.SetAsLastSibling();
            _sheet.Root.transform.SetAsLastSibling();
            _toasts.Root.transform.SetAsLastSibling();
            _vipPreview.Root.transform.SetAsLastSibling();
            _results.Root.transform.SetAsLastSibling();
            _upgrade.Root.transform.SetAsLastSibling();
            _unlock.Root.transform.SetAsLastSibling();
            _staff.Root.transform.SetAsLastSibling();
            _comeback.Root.transform.SetAsLastSibling();
            _tutorial.Root.transform.SetAsLastSibling();
            _shell.BringToFront();

            _lastStatus = new NeedStatus[System.Enum.GetValues(typeof(NeedId)).Length];

            _game.StateChanged += OnStateChanged;
            _game.WaveStarted += OnWaveStarted;
            _game.WaveCompleted += OnWaveCompleted;
            _game.Toast += OnToast;
            _game.BuildingTapped += OnBuildingTapped;
            _game.WorkerMoved += OnWorkerMoved;
            _game.VipChanged += RefreshAll;

            _shell.OpenMainMenu();
            RefreshAll();
        }

        void OnDestroy()
        {
            if (_game == null) return;
            _game.StateChanged -= OnStateChanged;
            _game.WaveStarted -= OnWaveStarted;
            _game.WaveCompleted -= OnWaveCompleted;
            _game.Toast -= OnToast;
            _game.BuildingTapped -= OnBuildingTapped;
            _game.WorkerMoved -= OnWorkerMoved;
            _game.VipChanged -= RefreshAll;
        }

        // --- VIP layer (S6 / S7 / S8) ---------------------------------------------

        // Home chip: a waiting VIP opens S6, a running stay opens S7. Never auto-opened over other flows.
        void OpenVip()
        {
            if (_game.ActiveWave != null || _flow != Flow.None) return;
            _home.CloseCard();
            _sheet.Close();
            if (_game.ActiveVip != null) _vipBoard.Show(false);
            else if (_game.VipOffer != null) _vipPreview.Show();
            RefreshAll();
        }

        void OnVipAccepted()
        {
            if (_game.ActiveVip != null) _vipBoard.Show(_game.WaveRunning);
            RefreshAll();
        }

        void OnVipTab()
        {
            if (!_game.WaveRunning || _game.ActiveVip == null) return;
            _vipTab = true;
            _vipBoard.Show(true);
            RefreshAll();
        }

        void OnBoardBack()
        {
            _vipTab = false;
            _vipBoard.Hide();
            RefreshAll();
        }

        // Rewards were applied by the sim when the stay ended; claiming clears it. A gate the stay opened
        // leads straight on to S9, like after a wave.
        void OnVipResultClaimed()
        {
            _game.ClaimVipResult();
            var site = _game.TakeVipOpenedSite();
            if (site.HasValue && _game.ActiveWave == null && _flow == Flow.None)
            {
                _home.CloseCard();
                _unlock.Show(site.Value);
            }
            RefreshAll();
        }

        // S8 shows by itself once nothing else is in the way: not during a wave or its post-wave flow,
        // not under menus or other cards. Until then the finished stay simply waits.
        void TryShowVipResult()
        {
            if (!_game.VipResultPending || _game.ActiveWave != null || _flow != Flow.None) return;
            if (_shell.IsOpen || _unlock.Visible || _staff.Visible || _comeback.Visible || _vipPreview.Visible
                || _results.Visible || _upgrade.Visible) return;
            _vipBoard.Hide();
            _home.CloseCard();
            _sheet.Close();
            _results.ShowVip(_game.ActiveVip);
        }

        void Update()
        {
            if (_game == null) return;
            float dt = Time.deltaTime;
            _toasts.Tick(dt);
            _rush.Tick(dt);
            _unlock.Tick(dt);
            TickBeat(dt);
            _sinceRefresh += dt;
            if (_sinceRefresh < RefreshInterval) return;
            _sinceRefresh = 0f;
            WatchStatusShifts();
            WatchRush();
            RefreshAll();
        }

        void OnToast(string message) => _toasts.Push(message);

        void OnStateChanged()
        {
            _sheet.OnStateChanged();
            RefreshAll();
        }

        void OnMenuPressed()
        {
            _shell.OpenPauseMenu();
            RefreshAll();
        }

        void OnGemsPressed()
        {
            _shell.OpenShop();
            RefreshAll();
        }

        // First CONTINUE of the session: a returning player may have a welcome-back gift waiting (P14).
        void OnSessionStarted()
        {
            if (_game.TryGetComebackGift(out var gift))
            {
                _home.CloseCard();
                _comeback.Show(gift);
            }
            RefreshAll();
        }

        void OpenStaff()
        {
            if (_game.ActiveWave != null || _flow != Flow.None) return; // between waves only
            _home.CloseCard();
            _sheet.Close();
            _staff.Show();
            RefreshAll();
        }

        void OnWaveStarted()
        {
            var sim = _game.ActiveWave;
            foreach (NeedId need in System.Enum.GetValues(typeof(NeedId)))
                _lastStatus[(int)need] = sim.StatusOf(need);
            _eligibleAtWaveStart.Clear();
            foreach (var site in AreaUnlockUi.Sites)
                if (_game.Resort.IsEligible(site)) _eligibleAtWaveStart.Add(site);
            _home.CloseCard();
            _sheet.Close();
            _tutorial.Resolve(TutorialUi.Hint.StartWave);
            _tutorial.Resolve(TutorialUi.Hint.Result);
            _tutorial.Trigger(TutorialUi.Hint.WavePanel);
            RefreshAll();
        }

        void OnWorkerMoved(BuildingId from, BuildingId to)
        {
            _tutorial.Resolve(TutorialUi.Hint.Bottleneck);
            _tutorial.Trigger(TutorialUi.Hint.WorkerMoved);
        }

        // --- post-wave flow -----------------------------------------------------

        void OnWaveCompleted(WaveResult result)
        {
            _sheet.Close();
            _rush.Hide();
            _vipTab = false;
            _vipBoard.Hide();
            _tutorial.Resolve(TutorialUi.Hint.WavePanel);
            _tutorial.Resolve(TutorialUi.Hint.Bottleneck);
            _tutorial.Resolve(TutorialUi.Hint.WorkerMoved);
            _flowResult = result;
            _flow = Flow.Beat;
            _beatLeft = IslandView.LeavingGuestCount(result.Stars) > 0 ? LeavingBeatSeconds : ResultBeatSeconds;
            RefreshAll();
        }

        void TickBeat(float dt)
        {
            if (_flow != Flow.Beat || _shell.IsOpen) return;
            _beatLeft -= dt;
            if (_beatLeft > 0f) return;
            _flow = Flow.Results;
            _results.Show(_flowResult);
            _tutorial.Trigger(TutorialUi.Hint.Result);
            RefreshAll();
        }

        // Waves never run out (P10): every result leads on to S5 and the next wave.
        void OnResultsClaimed()
        {
            _tutorial.Resolve(TutorialUi.Hint.Result);
            _game.ContinueAfterResults();
            ShowUpgradeStep();
        }

        void ShowUpgradeStep()
        {
            _flow = Flow.Upgrade;
            if (_upgrade.TryShow(_flowResult)) RefreshAll();
            else ShowUnlockStep();
        }

        void OnUpgradeClosed()
        {
            if (_flow == Flow.Upgrade) ShowUnlockStep();
        }

        // S9 appears by itself only for a site whose gate the wave just played opened.
        void ShowUnlockStep()
        {
            foreach (var site in AreaUnlockUi.Sites)
            {
                if (!_game.Resort.IsEligible(site) || _eligibleAtWaveStart.Contains(site)) continue;
                _flow = Flow.Unlock;
                _unlock.Show(site);
                RefreshAll();
                return;
            }
            EndFlow();
        }

        void OnUnlockClosed()
        {
            if (_flow == Flow.Unlock) EndFlow();
            else RefreshAll();
        }

        void EndFlow()
        {
            _flow = Flow.None;
            _flowResult = null;
            RefreshAll();
        }

        // --- taps and in-wave signals ---------------------------------------------

        // During a wave taps only route workers; between waves they open the action card, or S9 on an
        // eligible construction site. During the post-wave flow and under any menu they do nothing.
        void OnBuildingTapped(BuildingId building)
        {
            if (_flow != Flow.None || _shell.IsOpen || _unlock.Visible || _staff.Visible || _comeback.Visible
                || _vipPreview.Visible || _results.Visible || (_vipBoard.Visible && _game.ActiveWave == null)) return;
            if (!BuildingNeeds.IsWaveBuilding(building))
            {
                OnSpaTapped();
                return;
            }
            var resort = _game.Resort;
            if (_game.ActiveWave == null)
            {
                _sheet.Close();
                if (resort.IsEligible(building))
                {
                    _home.CloseCard();
                    _unlock.Show(building);
                    RefreshAll();
                    return;
                }
                _home.OpenCard(building);
                return;
            }
            if (_game.CurrentPhase == WavePhase.WaveComplete) return;
            var state = resort.Get(building);
            if (state == null) return;
            if (state.WorkerCount < resort.SlotsOf(building))
            {
                _sheet.Open(building);
                return;
            }
            // Tapping a full building offers the move toward one that stands empty (the prototype case),
            // or else toward any building with a free shift.
            BuildingId? target = null;
            foreach (var b in resort.Buildings)
                if (BuildingNeeds.IsWaveBuilding(b.Id) && b.WorkerCount == 0) { target = b.Id; break; }
            if (target == null)
                foreach (var b in resort.Buildings)
                    if (BuildingNeeds.IsWaveBuilding(b.Id) && b.WorkerCount < resort.SlotsOf(b.Id)) { target = b.Id; break; }
            if (target.HasValue) _sheet.Open(target.Value);
        }

        // The Spa (VIP building): between waves an eligible site opens S9, a locked one the gate card,
        // the built Spa a short info card. During a wave it does nothing — it has no worker slot.
        void OnSpaTapped()
        {
            if (_game.ActiveWave != null) return;
            _sheet.Close();
            if (_game.Resort.IsEligible(BuildingId.Spa))
            {
                _home.CloseCard();
                _unlock.Show(BuildingId.Spa);
                RefreshAll();
                return;
            }
            _home.OpenCard(BuildingId.Spa);
        }

        // The Sudden rush prompt shows once per wave, as soon as the sim reports the rush.
        void WatchRush()
        {
            var sim = _game.ActiveWave;
            if (sim == null || sim == _rushSeenIn || !sim.RushFired) return;
            _rushSeenIn = sim;
            if (sim.Phase == WavePhase.WaveComplete || !sim.RushNeed.HasValue) return;
            _vipTab = false; // the rush prompt lives on the wave panel, so the wave side comes back
            _rush.Show(UiFactory.BuildingFor(sim.RushNeed.Value));
        }

        // Status shifts drive the guest-voice toasts; the panel rows carry the persistent signal.
        void WatchStatusShifts()
        {
            var sim = _game.ActiveWave;
            if (sim == null || sim.Phase == WavePhase.WaveComplete) return;
            foreach (NeedId need in System.Enum.GetValues(typeof(NeedId)))
            {
                var now = sim.StatusOf(need);
                var before = _lastStatus[(int)need];
                _lastStatus[(int)need] = now;
                if (now == before) continue;
                if (now == NeedStatus.Bottleneck)
                {
                    _toasts.Push("“" + GuestQuote(need) + "”");
                    _tutorial.Trigger(TutorialUi.Hint.Bottleneck);
                }
                else if (now == NeedStatus.Recovering)
                    _toasts.Push(GameController.DisplayName(UiFactory.BuildingFor(need)) + " is catching up");
            }
        }

        static string GuestQuote(NeedId need)
        {
            switch (need)
            {
                case NeedId.Rooms: return "Check-in takes a bit too long.";
                case NeedId.Drinks: return "Drinks take a bit too long.";
                case NeedId.Food: return "Food takes a bit too long.";
                case NeedId.Relax: return "The pool line takes a bit too long.";
                default: return "The bungalows take a bit too long.";
            }
        }

        void RefreshAll()
        {
            bool betweenWaves = _game.ActiveWave == null;
            bool waveRunning = _game.WaveRunning;
            _topBar.Refresh();
            TryShowVipResult();

            // The Request Board: a tab of the right side during a wave, its own screen between waves.
            if (waveRunning)
            {
                if (_vipTab && _game.ActiveVip != null && !_rush.Visible)
                {
                    if (!_vipBoard.Visible) _vipBoard.Show(true);
                }
                else
                {
                    _vipTab = false;
                    _vipBoard.Hide();
                }
            }
            else if (!betweenWaves) _vipBoard.Hide();
            _vipBoard.Refresh();
            _vipPreview.Refresh();
            bool boardScreen = _vipBoard.Visible && betweenWaves;

            // One main button per screen: START WAVE stays hidden under S5 / S9, Staff, the comeback card,
            // the VIP screens and the menus.
            bool homeVisible = betweenWaves && _flow == Flow.None && !_unlock.Visible && !_staff.Visible
                               && !_comeback.Visible && !_shell.IsOpen && !_vipPreview.Visible && !_results.Visible
                               && !boardScreen;
            _home.SetVisible(homeVisible);
            if (homeVisible) _home.Refresh();
            _needs.SetVisible(waveRunning && !_vipTab);
            _needs.SetVipTab(_game.ActiveVip != null);
            if (waveRunning) _needs.Refresh();
            _rush.Refresh();
            _staff.Refresh();

            // Coach hints step aside under menus and modal cards, and while the worker sheet is open (the
            // player is already doing what the hint asks); they come back if the moment is still open.
            if (homeVisible) _tutorial.Trigger(TutorialUi.Hint.StartWave);
            bool hintOffScreen = _tutorial.Current == TutorialUi.Hint.StartWave && !homeVisible;
            _tutorial.SetSuppressed(_shell.IsOpen || _comeback.Visible || _staff.Visible || _unlock.Visible
                                    || _sheet.IsOpen || hintOffScreen || _vipPreview.Visible || _results.ShowingVip
                                    || boardScreen);
        }
    }
}
