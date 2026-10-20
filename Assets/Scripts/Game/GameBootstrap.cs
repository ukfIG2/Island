using ResortEmpire.Sim;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace ResortEmpire.Game
{
    // Scene entry point: builds the whole game procedurally — no prefabs, no hand-edited scene content.
    public sealed class GameBootstrap : MonoBehaviour
    {
        bool _startingOver;

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

        // New Game / Reset progress: wipe the save and rebuild the scene, so every layer starts fresh.
        public void StartOver()
        {
            if (_startingOver) return;
            _startingOver = true;
            SaveSystem.Delete();
            var scene = SceneManager.GetActiveScene();
#if UNITY_EDITOR
            // A scene opened in the editor without being in Build Settings has no build index.
            if (scene.buildIndex < 0)
            {
                UnityEditor.SceneManagement.EditorSceneManager.LoadSceneInPlayMode(scene.path,
                    new LoadSceneParameters(LoadSceneMode.Single));
                return;
            }
#endif
            SceneManager.LoadScene(scene.buildIndex);
        }

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
            if (Game == null || _startingOver) return; // a deleted save must stay deleted until the reload
            Game.SetPaused(true);
            if (Game.ActiveWave == null) SaveSystem.Save(Game);
        }
    }
}
