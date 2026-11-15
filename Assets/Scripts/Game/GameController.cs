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
        float _sinceSave;
        bool _waveCompletedFired;

        // Real seconds between saves while a wave runs, so a killed app loses at most this much (CAM-110).
        public const float AutosaveIntervalSeconds = 10f;

        public ResortState Resort { get; }
        public TuningConfig Tuning { get; }
        public WaveSimulation ActiveWave { get; private set; }     // null between waves
        public int NextWaveIndex { get; private set; }             // 1-based
        public bool PrototypeComplete { get; private set; }        // wave 8 result claimed

        // Game speed. x1 is the pace the designer's numbers are made for; x2 and x4 run the same game faster, for a short
        // demo or a confident player. The result of a wave never depends on it. It is not saved: every launch starts at x1.
        public static readonly float[] SpeedSteps = { 1f, 2f, 4f };
        public float SimSpeed { get; set; } = 1f;
        public static string SpeedLabel(float speed) => (int)speed + "x";

        public void CycleSpeed()
        {
            int at = Array.IndexOf(SpeedSteps, SimSpeed);   // -1 for a speed that is no step: back to x1
            SimSpeed = SpeedSteps[(at + 1) % SpeedSteps.Length];
        }

        public WavePhase CurrentPhase => ActiveWave != null ? ActiveWave.Phase : WavePhase.AwaitingWave;
        public bool IsPaused => ActiveWave != null && ActiveWave.IsPaused;
        public IReadOnlyList<WaveDef> Waves => _waves;
        public WaveDef NextWaveDef => PrototypeComplete ? null : _waves[NextWaveIndex - 1];

        public event Action WaveStarted;
        public event Action<WaveResult> WaveCompleted;             // fired exactly once per wave
        public event Action StateChanged;
        public event Action<string> Toast;
        public event Action<BuildingId> BuildingTapped;

        public GameController(TuningConfig tuning, ResortState resort, int nextWaveIndex, List<WaveDef> waves,
            WaveSnapshot savedWave = null)
        {
            Tuning = tuning;
            Resort = resort;
            _waves = waves;
            NextWaveIndex = Math.Min(Math.Max(nextWaveIndex, 1), waves.Count);
            PrototypeComplete = resort.WavesCompleted >= waves[waves.Count - 1].Index;
            if (savedWave != null) RestoreWave(savedWave);
        }

        // Brings back the wave that was running when the game was saved (CAM-111). It comes back paused, so the
        // player resumes it when ready. A snapshot that does not fit is ignored: the game then starts between waves.
        bool RestoreWave(WaveSnapshot saved)
        {
            if (PrototypeComplete) return false;
            var wave = WaveSimulation.FromSnapshot(Resort, _waves[NextWaveIndex - 1], Tuning, saved);
            if (wave == null) return false;
            wave.IsPaused = true;
            ActiveWave = wave;
            _accum = 0f;
            _sinceSave = 0f;
            _waveCompletedFired = false;
            return true;
        }

        public void StartNextWave()
        {
            if (ActiveWave != null || PrototypeComplete) return;
            ActiveWave = new WaveSimulation(Resort, _waves[NextWaveIndex - 1], Tuning);
            _accum = 0f;
            _sinceSave = 0f;
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

            if (ActiveWave != null && ActiveWave.Phase != WavePhase.WaveComplete)
            {
                _sinceSave += unscaledDt;                // real time, whatever the game speed
                if (_sinceSave >= AutosaveIntervalSeconds)
                {
                    _sinceSave = 0f;
                    SaveSystem.Save(this);
                }
            }
        }

        // The app goes to the background or closes: a running wave pauses (nothing runs while the player is away)
        // and the exact moment is saved.
        public void LeaveApp()
        {
            if (ActiveWave != null && ActiveWave.Phase != WavePhase.WaveComplete) SetPaused(true);
            SaveSystem.Save(this);
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

        // Free, instant, no confirmation (WR5); during a wave both buildings change speed at once.
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

        // Energy sources (CAM-74): finished waves pay it out; an optional rewarded video, a test stub for now, adds more.
        // The video is offered only where Speed Up would be offered but the Energy is short, so Energy is never a gate:
        // the wave goes on either way, and watching never pauses it.
        public int TestAdEnergy => Tuning.EnergyBoostCost;                       // one Speed Up's worth

        public bool CanOfferTestAd(BuildingId b)
            => ActiveWave != null && ActiveWave.Phase != WavePhase.WaveComplete && !ActiveWave.IsPaused
               && Resort.IsUnlocked(b) && !ActiveWave.BoostSpent(b) && ActiveWave.BoostRemaining(b) <= 0f
               && Resort.Energy < Tuning.EnergyBoostCost;

        public void WatchTestAd()
        {
            Resort.Energy += TestAdEnergy;
            if (ActiveWave == null) SaveSystem.Save(this);
            StateChanged?.Invoke();
            Toast?.Invoke("Test ad watched: +" + TestAdEnergy + " Energy");
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
