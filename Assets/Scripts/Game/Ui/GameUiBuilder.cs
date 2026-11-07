using ResortEmpire.Sim;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem.UI;
using UnityEngine.UI;

namespace ResortEmpire.Game.Ui
{
    // Builds the whole interface on one runtime canvas: S1 home and S2 wave panel.
    // A small driver keeps the visible widgets refreshed.
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
        HomeUi _home;
        NeedsPanelUi _needs;
        float _sinceRefresh;

        public void Init(GameController game)
        {
            _game = game;
            var canvas = transform;
            _home = new HomeUi(canvas, game);
            _needs = new NeedsPanelUi(canvas, game);

            _game.StateChanged += OnStateChanged;
            _game.WaveStarted += OnWaveStarted;
            _game.WaveCompleted += OnWaveCompleted;
            RefreshAll();
        }

        void OnDestroy()
        {
            if (_game == null) return;
            _game.StateChanged -= OnStateChanged;
            _game.WaveStarted -= OnWaveStarted;
            _game.WaveCompleted -= OnWaveCompleted;
        }

        void Update()
        {
            if (_game == null) return;
            _sinceRefresh += Time.deltaTime;
            if (_sinceRefresh < RefreshInterval) return;
            _sinceRefresh = 0f;
            RefreshAll();
        }

        void OnStateChanged() => RefreshAll();

        void OnWaveStarted() => RefreshAll();

        // No result screen yet: the island goes straight back to the next START WAVE.
        void OnWaveCompleted(WaveResult result) => _game.ContinueAfterResults();

        void RefreshAll()
        {
            bool betweenWaves = _game.ActiveWave == null;
            bool waveRunning = !betweenWaves && _game.CurrentPhase != WavePhase.WaveComplete;
            _home.SetVisible(betweenWaves);
            if (betweenWaves) _home.Refresh();
            _needs.SetVisible(waveRunning);
            if (waveRunning) _needs.Refresh();
        }
    }
}
