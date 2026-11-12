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
        // resetView brings the island camera back to its starting view; viewMoved says whether it has left it.
        public static void Build(GameBootstrap host, GameController game, System.Action resetView,
            System.Func<bool> viewMoved)
        {
            var canvasGo = new GameObject("GameUi", typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
            canvasGo.GetComponent<Canvas>().renderMode = RenderMode.ScreenSpaceOverlay;
            var scaler = canvasGo.GetComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1920f, 1080f);
            scaler.matchWidthOrHeight = 0.5f;

            if (Object.FindFirstObjectByType<EventSystem>() == null)
                new GameObject("EventSystem", typeof(EventSystem), typeof(InputSystemUIInputModule));

            canvasGo.AddComponent<GameUiDriver>().Init(game, resetView, viewMoved);
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
        ResumeOverlayUi _resume;
        Button _resetView;
        System.Func<bool> _viewMoved;
        NeedStatus[] _lastStatus;
        float _sinceRefresh;

        public void Init(GameController game, System.Action resetView, System.Func<bool> viewMoved)
        {
            _game = game;
            _viewMoved = viewMoved;
            var canvas = transform;
            _topBar = new TopBarUi(canvas, game);
            // Shown only once the player has turned or zoomed the island.
            _resetView = UiFactory.TextButton(canvas, "ResetView", "Reset view", 22, UiFactory.Panel, UiFactory.Cream,
                () => resetView());
            UiFactory.PlaceFixed(_resetView.gameObject, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(20f, -96f),
                new Vector2(170f, 52f));
            _resetView.gameObject.SetActive(false);
            _toasts = new ToastUi(canvas);
            _sheet = new WorkerSheetUi(canvas, game, _toasts);
            _home = new HomeUi(canvas, game, _sheet);
            _needs = new NeedsPanelUi(canvas, game, _sheet);
            _results = new ResultOverlayUi(canvas, game, OnResultClaimed);
            _suggestion = new UpgradeSuggestionUi(canvas, game, OnSuggestionClosed);
            _area = new AreaOfferUi(canvas, game);
            _resume = new ResumeOverlayUi(canvas, game);
            // Draw order, back to front: top bar, home, wave panel, sheet, resume card, upgrade suggestion, area offer, toasts, result overlay.
            _sheet.Root.transform.SetAsLastSibling();
            _resume.Root.transform.SetAsLastSibling();
            _suggestion.Root.transform.SetAsLastSibling();
            _area.Root.transform.SetAsLastSibling();
            _toasts.Root.transform.SetAsLastSibling();
            _results.Root.transform.SetAsLastSibling();

            _lastStatus = new NeedStatus[System.Enum.GetValues(typeof(NeedId)).Length];
            RememberStatuses();   // a wave restored from a save is already under way: no "line is long" toast for it

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
            bool moved = _viewMoved();
            if (_resetView.gameObject.activeSelf != moved) _resetView.gameObject.SetActive(moved);
            _sinceRefresh += Time.deltaTime;
            if (_sinceRefresh < RefreshInterval) return;
            _sinceRefresh = 0f;
            WatchStatusShifts();
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
            _home.CloseCard();
            _sheet.Close();
            RefreshAll();
        }

        void OnWaveCompleted(WaveResult result)
        {
            _sheet.Close();
            _results.Show(result);
            RefreshAll();
        }

        // S4 leads on to S5 (UI handoff): one optional investment, skipped when the wave left nothing to improve and after
        // the last wave. Then S9 follows when the wave just finished made a new area available; skipped, that area waits
        // at its construction site. "Later" on either card goes back to the island.
        void OnResultClaimed(WaveResult result)
        {
            if (!_game.PrototypeComplete && !_suggestion.TryShow(result)) ShowDueArea();
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

        // During a wave taps only route workers; between waves they open the action card.
        void OnBuildingTapped(BuildingId building)
        {
            if (_results.Visible || _suggestion.Visible || _area.Visible) return;
            if (_game.ActiveWave == null)
            {
                _sheet.Close();
                // An area that can be built reopens its offer from the construction site; everything else opens the card.
                var offer = AreaOffer.For(_game.Resort, _game.Tuning, _game.Waves, building);
                if (offer != null && (offer.State == AreaState.Available || offer.State == AreaState.NotAffordable))
                {
                    _home.CloseCard();
                    _area.Show(building);
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
            bool homeVisible = betweenWaves && !_results.Visible && !_suggestion.Visible && !_area.Visible;
            _home.SetVisible(homeVisible);
            if (homeVisible) _home.Refresh();
            _needs.SetVisible(waveRunning);
            if (waveRunning) _needs.Refresh();
            _resume.Refresh();
            _suggestion.Refresh();
            _area.Refresh();
        }
    }
}
