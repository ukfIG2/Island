using ResortEmpire.Sim;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem.UI;
using UnityEngine.UI;

namespace ResortEmpire.Game.Ui
{
    // Builds the whole interface on one runtime canvas: top bar, S1 home, S2 wave panel, S3 worker sheet
    // and toasts. A small driver keeps the visible widgets refreshed.
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

            canvasGo.AddComponent<GameUiDriver>().Init(game);
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
        NeedStatus[] _lastStatus;
        float _sinceRefresh;

        public void Init(GameController game)
        {
            _game = game;
            var canvas = transform;
            _topBar = new TopBarUi(canvas, game);
            _home = new HomeUi(canvas, game);
            _toasts = new ToastUi(canvas);
            _sheet = new WorkerSheetUi(canvas, game, _toasts);
            _needs = new NeedsPanelUi(canvas, game, _sheet);
            // Draw order, back to front: top bar, home, wave panel, sheet, toasts.
            _sheet.Root.transform.SetAsLastSibling();
            _toasts.Root.transform.SetAsLastSibling();

            _lastStatus = new NeedStatus[System.Enum.GetValues(typeof(NeedId)).Length];

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

        void OnWaveStarted()
        {
            var sim = _game.ActiveWave;
            foreach (NeedId need in System.Enum.GetValues(typeof(NeedId)))
                _lastStatus[(int)need] = sim.StatusOf(need);
            _sheet.Close();
            RefreshAll();
        }

        // No result screen yet: the island goes straight back to the next START WAVE.
        void OnWaveCompleted(WaveResult result)
        {
            _sheet.Close();
            _game.ContinueAfterResults();
        }

        // A tap on an empty building opens the sheet for it; a tap on a staffed one offers the move
        // toward the building that stands empty.
        void OnBuildingTapped(BuildingId building)
        {
            if (_game.CurrentPhase == WavePhase.WaveComplete) return;
            var state = _game.Resort.Get(building);
            if (state == null) return;
            if (!state.HasWorker)
            {
                _sheet.Open(building);
                return;
            }
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
            _home.SetVisible(betweenWaves);
            if (betweenWaves) _home.Refresh();
            _needs.SetVisible(waveRunning);
            if (waveRunning) _needs.Refresh();
        }
    }
}
