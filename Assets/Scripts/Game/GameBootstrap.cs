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
            var island = View.IslandViewBuilder.Build(this, Game);
            Ui.GameUiBuilder.Build(this, Game, island.ResetView, () => island.ViewMoved);
        }

        void Update() => Game.Tick(Time.deltaTime);
    }
}
