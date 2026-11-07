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
            Game = new GameController(tuning, ResortState.NewGame(tuning), 1, WaveTable.Default8());
            View.IslandViewBuilder.Build(this, Game);
            Ui.GameUiBuilder.Build(this, Game);
        }

        void Update() => Game.Tick(Time.deltaTime);
    }
}
