using ResortEmpire.Sim;
using UnityEngine;

namespace ResortEmpire.Game
{
    // Scene entry point: builds the whole game procedurally — no prefabs, no hand-edited scene content.
    public sealed class GameBootstrap : MonoBehaviour
    {
        public GameController Game { get; private set; }

        void Awake()
        {
            var tuning = TuningConfig.Default;
            var (resort, nextWaveIndex) = SaveSystem.LoadOrNew(tuning);
            Game = new GameController(tuning, resort, nextWaveIndex, WaveTable.Default8());
            View.IslandViewBuilder.Build(this, Game);
            Ui.GameUiBuilder.Build(this, Game);
        }

        void Update() => Game.Tick(Time.deltaTime);

        void OnApplicationPause(bool paused)
        {
            if (paused) Freeze();
        }

        // On a phone losing focus means the app left the foreground; in the editor it only means another
        // window was clicked, which must not pause a wave mid-test.
        void OnApplicationFocus(bool focused)
        {
            if (!focused && !Application.isEditor) Freeze();
        }

        // Backgrounding freezes any running wave in memory; only between-waves state hits disk.
        void Freeze()
        {
            if (Game == null) return;
            Game.SetPaused(true);
            if (Game.ActiveWave == null) SaveSystem.Save(Game);
        }
    }
}
