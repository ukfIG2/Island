using ResortEmpire.Sim;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace ResortEmpire.Game
{
    // Scene entry point: builds the whole game procedurally — no prefabs, no hand-edited scene content.
    public sealed class GameBootstrap : MonoBehaviour
    {
        public GameController Game { get; private set; }

        void Awake()
        {
            var tuning = TuningConfig.Default;
            var loaded = SaveSystem.LoadOrNew(tuning);
            Game = new GameController(tuning, loaded.Resort, loaded.NextWaveIndex, WaveTable.Default8(), loaded.Wave);
            var island = View.IslandViewBuilder.Build(this, Game);
            Ui.GameUiBuilder.Build(this, Game, island.ResetView, () => island.ViewMoved, StartOver);
        }

        void Update() => Game.Tick(Time.deltaTime);

        // Reset progress (CAM-51): the save is deleted and the scene starts again from an empty resort. Settings such as
        // sound and music are the device's, not the resort's, and stay.
        void StartOver()
        {
            Game.Retire();
            SaveSystem.Delete();
            SceneManager.LoadScene(SceneManager.GetActiveScene().buildIndex);
        }

        // Leaving the app pauses a running wave and saves it. A phone sends Pause when the app goes to the background;
        // a computer build sends Focus. Both can arrive, which only saves twice. In the editor, Focus also fires when
        // the Game view merely loses focus (a click in the Hierarchy), so there only Pause and Quit count.
        void OnApplicationPause(bool paused) { if (paused && Game != null) Game.LeaveApp(); }
#if !UNITY_EDITOR
        void OnApplicationFocus(bool focused) { if (!focused && Game != null) Game.LeaveApp(); }
#endif
        void OnApplicationQuit() { if (Game != null) Game.LeaveApp(); }
    }
}
