using System;
using System.Collections.Generic;
using ResortEmpire.Sim;

namespace ResortEmpire.Game
{
    // Single owner of game flow: wave lifecycle, player actions, autosave, change events.
    // Plain C# on purpose — the view and UI layers subscribe and render, they never decide.
    public sealed class GameController
    {
        readonly List<WaveDef> _waves;
        float _accum;
        bool _waveCompletedFired;

        public ResortState Resort { get; }
        public TuningConfig Tuning { get; }
        public WaveSimulation ActiveWave { get; private set; }     // null between waves
        public int NextWaveIndex { get; private set; }             // 1-based
        public bool PrototypeComplete { get; private set; }        // wave 8 result claimed
        public float SimSpeed { get; set; } = 1f;

        public WavePhase CurrentPhase => ActiveWave != null ? ActiveWave.Phase : WavePhase.AwaitingWave;
        public bool IsPaused => ActiveWave != null && ActiveWave.IsPaused;
        public IReadOnlyList<WaveDef> Waves => _waves;
        public WaveDef NextWaveDef => PrototypeComplete ? null : _waves[NextWaveIndex - 1];

        public event Action WaveStarted;
        public event Action<WaveResult> WaveCompleted;             // fired exactly once per wave
        public event Action StateChanged;
        public event Action<string> Toast;
        public event Action<BuildingId> BuildingTapped;

        public GameController(TuningConfig tuning, ResortState resort, int nextWaveIndex, List<WaveDef> waves)
        {
            Tuning = tuning;
            Resort = resort;
            _waves = waves;
            NextWaveIndex = Math.Min(Math.Max(nextWaveIndex, 1), waves.Count);
            PrototypeComplete = resort.WavesCompleted >= waves[waves.Count - 1].Index;
        }

        public void StartNextWave()
        {
            if (ActiveWave != null || PrototypeComplete) return;
            ActiveWave = new WaveSimulation(Resort, _waves[NextWaveIndex - 1], Tuning);
            _accum = 0f;
            _waveCompletedFired = false;
            ActiveWave.StartWave();
            WaveStarted?.Invoke();
        }

        public void Tick(float unscaledDt)
        {
            if (ActiveWave == null) return;
            if (ActiveWave.IsPaused) { _accum = 0f; return; } // paused time never banks up

            _accum += unscaledDt * SimSpeed;
            while (_accum >= SimClock.DefaultStep && ActiveWave.Phase != WavePhase.WaveComplete)
            {
                ActiveWave.Tick(SimClock.DefaultStep);
                _accum -= SimClock.DefaultStep;
            }

            if (!_waveCompletedFired && ActiveWave.Phase == WavePhase.WaveComplete)
            {
                _waveCompletedFired = true;         // sim object stays alive for the result screen
                StateChanged?.Invoke();             // rewards just landed on ResortState
                WaveCompleted?.Invoke(ActiveWave.Result);
            }
        }

        public void ContinueAfterResults()
        {
            if (ActiveWave == null || ActiveWave.Phase != WavePhase.WaveComplete) return;
            if (NextWaveIndex >= _waves.Count) PrototypeComplete = true; // wave 8 result just claimed
            NextWaveIndex = Math.Min(NextWaveIndex + 1, _waves.Count);
            ActiveWave = null;
            SaveSystem.Save(this);
            StateChanged?.Invoke();
        }

        // --- player actions -------------------------------------------------

        public bool MoveWorker(BuildingId from, BuildingId to)
        {
            bool inWave = ActiveWave != null && ActiveWave.Phase != WavePhase.WaveComplete;
            bool ok = inWave ? ActiveWave.MoveWorker(from, to) : Resort.MoveWorker(from, to);
            if (!ok) return false;
            if (ActiveWave == null) SaveSystem.Save(this);
            StateChanged?.Invoke();
            Toast?.Invoke("Worker moved to " + DisplayName(to));
            return true;
        }

        public bool Boost(BuildingId b)
        {
            if (ActiveWave == null || ActiveWave.Phase == WavePhase.WaveComplete) return false;
            if (!ActiveWave.UseEnergyBoost(b)) return false;
            StateChanged?.Invoke();
            Toast?.Invoke("Speed Up active at " + DisplayName(b));
            return true;
        }

        public bool Upgrade(BuildingId b)
        {
            if (ActiveWave != null) return false; // upgrades exist only between waves (WR6)
            if (!Resort.Upgrade(b)) return false;
            SaveSystem.Save(this);
            StateChanged?.Invoke();
            Toast?.Invoke(DisplayName(b) + " upgraded to Lv" + Resort.Get(b).Level);
            return true;
        }

        public bool Unlock(BuildingId b)
        {
            if (ActiveWave != null) return false; // unlocks exist only between waves (WR6)
            if (!Resort.Unlock(b)) return false;
            SaveSystem.Save(this);
            StateChanged?.Invoke();
            Toast?.Invoke(DisplayName(b) + " unlocked");
            return true;
        }

        public void SetPaused(bool paused)
        {
            if (ActiveWave == null || ActiveWave.Phase == WavePhase.WaveComplete) return;
            if (ActiveWave.IsPaused == paused) return;
            ActiveWave.IsPaused = paused;
            StateChanged?.Invoke();
        }

        // The view layer reports taps here; UI panels subscribe to BuildingTapped.
        public void RaiseBuildingTapped(BuildingId b) => BuildingTapped?.Invoke(b);

        public static string DisplayName(BuildingId b)
            => b == BuildingId.BeachBar ? "Beach Bar" : b.ToString();
    }
}
