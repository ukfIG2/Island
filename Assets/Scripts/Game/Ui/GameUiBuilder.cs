using ResortEmpire.Sim;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem.UI;
using UnityEngine.UI;

namespace ResortEmpire.Game.Ui
{
    // Builds the whole interface on one runtime canvas: S1 home, S2 wave panel, S3 worker sheet,
    // toasts and the result overlay. A small driver keeps the visible widgets refreshed.
    public static class GameUiBuilder
    {
        // resetView brings the island camera back to its starting view; viewMoved says whether it has left it;
        // sitePoint gives where a construction site's label hangs in the world (CAM-130);
        // startOver throws the game away and begins again (Reset progress); showMenu opens the main menu at once (app start).
        public static void Build(GameBootstrap host, GameController game, System.Action resetView,
            System.Func<bool> viewMoved, System.Func<BuildingId, Vector3?> sitePoint, System.Action startOver, bool showMenu)
        {
            var canvasGo = new GameObject("GameUi", typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
            canvasGo.GetComponent<Canvas>().renderMode = RenderMode.ScreenSpaceOverlay;
            var scaler = canvasGo.GetComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1920f, 1080f);
            scaler.matchWidthOrHeight = 0.5f;

            if (Object.FindFirstObjectByType<EventSystem>() == null)
                new GameObject("EventSystem", typeof(EventSystem), typeof(InputSystemUIInputModule));

            canvasGo.AddComponent<GameUiDriver>().Init(game, resetView, viewMoved, sitePoint, startOver, showMenu);
        }
    }

    // Owns panel lifetimes, event wiring and the few-times-per-second refresh.
    public sealed class GameUiDriver : MonoBehaviour
    {
        const float RefreshInterval = 0.25f;

        GameController _game;
        TopBarUi _topBar;
        HomeUi _home;
        NeedsPanelUi _needs;
        WorkerSheetUi _sheet;
        ToastUi _toasts;
        ResultOverlayUi _results;
        UpgradeSuggestionUi _suggestion;
        AreaOfferUi _area;
        FinaleUi _finale;
        ResumeOverlayUi _resume;
        AppShellUi _shell;
        RushPromptUi _rush;
        bool _rushHandled;                 // the prompt is offered once per wave
        WaveResult _finaleResult;          // the eighth wave's result, kept while the Resort summary is open
        Button _resetView;
        System.Func<bool> _viewMoved;
        NeedStatus[] _lastStatus;
        float _sinceRefresh;

        public void Init(GameController game, System.Action resetView, System.Func<bool> viewMoved,
            System.Func<BuildingId, Vector3?> sitePoint, System.Action startOver, bool showMenu)
        {
            _game = game;
            _viewMoved = viewMoved;
            var canvas = transform;
            _topBar = new TopBarUi(canvas, game);
            // The menu (pause, settings, start over) is always one tap away, under the top bar on the left.
            var menu = UiFactory.TextButton(canvas, "Menu", "Menu", 22, UiFactory.Panel, UiFactory.Cream, () => _shell.OpenPauseMenu());
            UiFactory.PlaceFixed(menu.gameObject, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(20f, -96f),
                new Vector2(130f, 52f));
            // Shown only once the player has turned or zoomed the island.
            _resetView = UiFactory.TextButton(canvas, "ResetView", "Reset view", 22, UiFactory.Panel, UiFactory.Cream,
                () => resetView());
            UiFactory.PlaceFixed(_resetView.gameObject, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(162f, -96f),
                new Vector2(170f, 52f));
            _resetView.gameObject.SetActive(false);
            _toasts = new ToastUi(canvas);
            _sheet = new WorkerSheetUi(canvas, game, _toasts);
            _home = new HomeUi(canvas, game, _sheet, OpenArea, sitePoint);
            _needs = new NeedsPanelUi(canvas, game, _sheet);
            _results = new ResultOverlayUi(canvas, game, OnResultClaimed);
            _suggestion = new UpgradeSuggestionUi(canvas, game, OnSuggestionClosed);
            _area = new AreaOfferUi(canvas, game);
            _finale = new FinaleUi(canvas, game, OnFinaleClosed);
            _resume = new ResumeOverlayUi(canvas, game);
            _rush = new RushPromptUi(canvas, game, _sheet);
            _shell = new AppShellUi(canvas, game, DeviceSettings.Current, startOver);
            // Draw order, back to front: top bar, home, wave panel, rush prompt, sheet, resume card, upgrade suggestion, area offer, toasts, result overlay, app shell.
            _rush.Root.transform.SetAsLastSibling();
            _sheet.Root.transform.SetAsLastSibling();
            _resume.Root.transform.SetAsLastSibling();
            _suggestion.Root.transform.SetAsLastSibling();
            _area.Root.transform.SetAsLastSibling();
            _finale.Root.transform.SetAsLastSibling();
            _toasts.Root.transform.SetAsLastSibling();
            _results.Root.transform.SetAsLastSibling();
            _shell.BringToFront();                                   // menus, settings and confirm cover everything
            if (showMenu) _shell.OpenMainMenu();

            _lastStatus = new NeedStatus[System.Enum.GetValues(typeof(NeedId)).Length];
            RememberStatuses();   // a wave restored from a save is already under way: no "line is long" toast for it
            _rushHandled = _game.ActiveWave != null && _game.ActiveWave.RushFired;   // ...and no stale rush prompt either

            _game.StateChanged += OnStateChanged;
            _game.WaveStarted += OnWaveStarted;
            _game.WaveCompleted += OnWaveCompleted;
            _game.Toast += OnToast;
            _game.BuildingTapped += OnBuildingTapped;
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
            _toasts.Tick(Time.deltaTime);
            _rush.Tick(Time.deltaTime);
            bool moved = _viewMoved();
            if (_resetView.gameObject.activeSelf != moved) _resetView.gameObject.SetActive(moved);
            _home.TrackSites();                                     // the site labels follow the camera every frame
            _sinceRefresh += Time.deltaTime;
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

        void RememberStatuses()
        {
            var sim = _game.ActiveWave;
            if (sim == null) return;
            foreach (NeedId need in System.Enum.GetValues(typeof(NeedId)))
                _lastStatus[(int)need] = sim.StatusOf(need);
        }

        void OnWaveStarted()
        {
            RememberStatuses();
            _rushHandled = false;
            _rush.Hide();
            _home.CloseCard();
            _sheet.Close();
            RefreshAll();
        }

        void OnWaveCompleted(WaveResult result)
        {
            _rush.Hide();
            _sheet.Close();
            _results.Show(result);
            RefreshAll();
        }

        // S4 leads on to S5 (UI handoff): one optional investment, skipped when the wave left nothing to improve. Then S9
        // follows when the wave just finished made a new area available; skipped, that area waits at its construction
        // site. "Later" on either card goes back to the island. After wave 8 the Resort summary comes first, and its
        // Keep playing button leads on the same way (CAM-28: the waves go on).
        void OnResultClaimed(WaveResult result)
        {
            if (result.WaveIndex == _game.Waves.Count)
            {
                _finaleResult = result;
                _finale.Show();
            }
            else if (!_suggestion.TryShow(result)) ShowDueArea();
            RefreshAll();
        }

        void OnFinaleClosed()
        {
            if (_finaleResult == null || !_suggestion.TryShow(_finaleResult)) ShowDueArea();
            _finaleResult = null;
            RefreshAll();
        }

        void OnSuggestionClosed()
        {
            ShowDueArea();
            RefreshAll();
        }

        void ShowDueArea()
        {
            var due = AreaOffer.DueAfterWave(_game.Resort, _game.Tuning);
            if (due.HasValue) _area.Show(due.Value);
        }

        // The area offer (S9) on demand: from the construction site and from the "New area available" banner (CAM-129).
        // Between waves only; never over another card.
        void OpenArea(BuildingId building)
        {
            if (_game.ActiveWave != null) return;
            if (_results.Visible || _suggestion.Visible || _area.Visible || _finale.Visible) return;
            _sheet.Close();
            _home.CloseCard();
            _area.Show(building);
            RefreshAll();
        }

        // During a wave taps only route workers; between waves they open the action card.
        void OnBuildingTapped(BuildingId building)
        {
            if (_results.Visible || _suggestion.Visible || _area.Visible || _finale.Visible) return;
            if (_game.ActiveWave == null)
            {
                _sheet.Close();
                // An area that can be built reopens its offer from the construction site; everything else opens the card.
                var offer = AreaOffer.For(_game.Resort, _game.Tuning, _game.Waves, building);
                if (offer != null && (offer.State == AreaState.Available || offer.State == AreaState.NotAffordable))
                {
                    OpenArea(building);
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

        // The Sudden rush (CAM-48) is not forecast: the prompt appears when the sim reports it, once per wave.
        void WatchRush()
        {
            var sim = _game.ActiveWave;
            if (sim == null || _rushHandled || !sim.RushFired || sim.Phase == WavePhase.WaveComplete) return;
            _rushHandled = true;
            _rush.Show(UiFactory.BuildingFor(sim.RushNeed.Value), _needs.RowsBottom);
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
            bool homeVisible = betweenWaves && !_results.Visible && !_suggestion.Visible && !_area.Visible && !_finale.Visible;
            _home.SetVisible(homeVisible);
            if (homeVisible) _home.Refresh();
            _needs.SetVisible(waveRunning);
            if (waveRunning) _needs.Refresh();
            _resume.Refresh(_shell.IsOpen);
            _rush.Refresh();
            _suggestion.Refresh();
            _area.Refresh();
        }
    }
}
