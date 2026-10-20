using ResortEmpire.Game.View;
using ResortEmpire.Sim;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem.UI;
using UnityEngine.UI;

namespace ResortEmpire.Game.Ui
{
    // Builds the whole interface on one runtime canvas: S1 home, S2 wave panel and rush prompt, S3 worker
    // sheet, toasts, the post-wave screens S4 / S5 / S9 and the app shell. A small driver keeps it in sync.
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
        // waves where upgrades and unlocks are allowed (WR6).
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
        AppShellUi _shell;
        NeedStatus[] _lastStatus;
        float _sinceRefresh;

        Flow _flow;
        WaveResult _flowResult;
        float _beatLeft;
        WaveSimulation _rushSeenIn;

        public void Init(GameBootstrap host, GameController game)
        {
            _game = game;
            var canvas = transform;
            _topBar = new TopBarUi(canvas, game, OnMenuPressed);
            _toasts = new ToastUi(canvas);
            _sheet = new WorkerSheetUi(canvas, game, _toasts);
            _home = new HomeUi(canvas, game, _sheet);
            _needs = new NeedsPanelUi(canvas, game, _sheet);
            _rush = new RushPromptUi(canvas, game, _sheet);
            _results = new WaveCompleteUi(canvas, game, OnResultsClaimed);
            _upgrade = new UpgradeSuggestionUi(canvas, game, OnUpgradeClosed);
            _unlock = new AreaUnlockUi(canvas, game, OnUnlockClosed);
            _shell = new AppShellUi(canvas, game, host.StartOver, RefreshAll);
            // Draw order, back to front: top bar, home, wave panel, rush prompt, sheet, toasts,
            // S4, S5, S9, menus.
            _rush.Root.transform.SetAsLastSibling();
            _sheet.Root.transform.SetAsLastSibling();
            _toasts.Root.transform.SetAsLastSibling();
            _results.Root.transform.SetAsLastSibling();
            _upgrade.Root.transform.SetAsLastSibling();
            _unlock.Root.transform.SetAsLastSibling();
            _shell.BringToFront();

            _lastStatus = new NeedStatus[System.Enum.GetValues(typeof(NeedId)).Length];

            _game.StateChanged += OnStateChanged;
            _game.WaveStarted += OnWaveStarted;
            _game.WaveCompleted += OnWaveCompleted;
            _game.Toast += OnToast;
            _game.BuildingTapped += OnBuildingTapped;

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

        void OnWaveStarted()
        {
            var sim = _game.ActiveWave;
            foreach (NeedId need in System.Enum.GetValues(typeof(NeedId)))
                _lastStatus[(int)need] = sim.StatusOf(need);
            _home.CloseCard();
            _sheet.Close();
            RefreshAll();
        }

        // --- post-wave flow -----------------------------------------------------

        void OnWaveCompleted(WaveResult result)
        {
            _sheet.Close();
            _rush.Hide();
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
        }

        void OnResultsClaimed()
        {
            bool last = _flowResult.WaveIndex >= _game.LastWaveIndex;
            _game.ContinueAfterResults();
            if (last) EndFlow(); // the prototype ends here; nothing left to upgrade for
            else ShowUpgradeStep();
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

        // S9 appears by itself only right after the wave that opens the area's gate.
        void ShowUnlockStep()
        {
            var area = AreaUnlockUi.AreaOpenedBy(_game.Tuning, _flowResult.WaveIndex);
            if (area.HasValue && _game.Resort.IsEligible(area.Value))
            {
                _flow = Flow.Unlock;
                _unlock.Show(area.Value);
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
            if (_flow != Flow.None || _shell.IsOpen || _unlock.Visible) return;
            if (_game.ActiveWave == null)
            {
                _sheet.Close();
                if (_game.Resort.IsEligible(building))
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
            var state = _game.Resort.Get(building);
            if (state == null) return;
            if (!state.HasWorker)
            {
                _sheet.Open(building);
                return;
            }
            // Tapping a staffed building offers the move toward the building that stands empty.
            foreach (var b in _game.Resort.Buildings)
                if (!b.HasWorker)
                {
                    _sheet.Open(b.Id);
                    return;
                }
        }

        // The Sudden rush prompt shows once per wave, as soon as the sim reports the rush.
        void WatchRush()
        {
            var sim = _game.ActiveWave;
            if (sim == null || sim == _rushSeenIn || !sim.RushFired) return;
            _rushSeenIn = sim;
            if (sim.Phase == WavePhase.WaveComplete || !sim.RushNeed.HasValue) return;
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
                if (now == NeedStatus.Bottleneck) _toasts.Push("“" + GuestQuote(need) + "”");
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
            bool waveRunning = !betweenWaves && _game.CurrentPhase != WavePhase.WaveComplete;
            _topBar.Refresh();
            // One main button per screen: START WAVE stays hidden under S5 / S9 and the menus.
            bool homeVisible = betweenWaves && _flow == Flow.None && !_unlock.Visible && !_shell.IsOpen;
            _home.SetVisible(homeVisible);
            if (homeVisible) _home.Refresh();
            _needs.SetVisible(waveRunning);
            if (waveRunning) _needs.Refresh();
            _rush.Refresh();
        }
    }
}
