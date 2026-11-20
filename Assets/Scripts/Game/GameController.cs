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
        WaveDef _cachedWave;                       // the UI asks for the next wave several times a second
        float _accum;
        float _sinceSave;
        bool _waveCompletedFired;
        bool _retired;

        // Real seconds between saves while a wave runs, so a killed app loses at most this much (CAM-110).
        public const float AutosaveIntervalSeconds = 10f;

        public ResortState Resort { get; }
        public TuningConfig Tuning { get; }
        public WaveSimulation ActiveWave { get; private set; }     // null between waves
        public int NextWaveIndex { get; private set; }             // 1-based; goes on past wave 8 (endless waves, CAM-28)

        // The eight scripted waves are cleared. The game does not end there: the waves go on, so this only says that the
        // Resort summary has been earned.
        public bool CampaignComplete => Resort.WavesCompleted >= _waves.Count;

        // A resort that is under way: the main menu says CONTINUE for it and PLAY for a new one (CAM-50).
        public bool HasProgress => ActiveWave != null || NextWaveIndex > 1 || Resort.WavesCompleted > 0;

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
        public IReadOnlyList<WaveDef> Waves => _waves;       // the eight scripted waves
        public WaveDef NextWaveDef => WaveFor(NextWaveIndex);

        // Any wave: the scripted ones, then waves generated from wave 8 (see WaveTable.WaveFor).
        public WaveDef WaveFor(int index)
        {
            if (index <= _waves.Count) return _waves[Math.Max(index, 1) - 1];
            if (_cachedWave == null || _cachedWave.Index != index) _cachedWave = WaveTable.WaveFor(index, Tuning);
            return _cachedWave;
        }

        public event Action WaveStarted;
        public event Action<WaveResult> WaveCompleted;             // fired exactly once per wave
        public event Action StateChanged;
        public event Action<string> Toast;
        public event Action<BuildingId> BuildingTapped;
        public event Action WorkerMoved;                           // a Worker was moved, before or during a wave
        public event Action<BuildingId> BoostUsed;                 // Speed Up started at a building
        public event Action AdWatched;                             // the test rewarded video gave Energy
        public event Action<BuildingId> Upgraded;
        public event Action<BuildingId> Unlocked;
        public event Action ResultsClaimed;                        // the result screen was closed with Claim rewards

        public GameController(TuningConfig tuning, ResortState resort, int nextWaveIndex, List<WaveDef> waves,
            WaveSnapshot savedWave = null)
        {
            Tuning = tuning;
            Resort = resort;
            _waves = waves;
            NextWaveIndex = Math.Max(nextWaveIndex, 1);
            // A save made before the waves went on stored 8 after wave 8; the next wave follows the last one cleared.
            if (resort.WavesCompleted >= waves.Count) NextWaveIndex = Math.Max(NextWaveIndex, resort.WavesCompleted + 1);
            if (savedWave != null) RestoreWave(savedWave);
        }

        // Brings back the wave that was running when the game was saved (CAM-111). It comes back paused, so the
        // player resumes it when ready. A snapshot that does not fit is ignored: the game then starts between waves.
        bool RestoreWave(WaveSnapshot saved)
        {
            var wave = WaveSimulation.FromSnapshot(Resort, NextWaveDef, Tuning, saved);
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
            if (ActiveWave != null) return;
            ActiveWave = new WaveSimulation(Resort, NextWaveDef, Tuning);
            _accum = 0f;
            _sinceSave = 0f;
            _waveCompletedFired = false;
            ActiveWave.StartWave();
            WaveStarted?.Invoke();
        }

        // "Reset progress" (CAM-51): this game is thrown away. Nothing runs or saves after this, so the old resort can
        // never be written over the empty save while the scene reloads.
        public void Retire() => _retired = true;

        void Persist()
        {
            if (!_retired) SaveSystem.Save(this);
        }

        public void Tick(float unscaledDt)
        {
            if (ActiveWave == null || _retired) return;
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
                    Persist();
                }
            }
        }

        // The app goes to the background or closes: a running wave pauses (nothing runs while the player is away)
        // and the exact moment is saved.
        public void LeaveApp()
        {
            if (ActiveWave != null && ActiveWave.Phase != WavePhase.WaveComplete) SetPaused(true);
            Persist();
        }

        public void ContinueAfterResults()
        {
            if (ActiveWave == null || ActiveWave.Phase != WavePhase.WaveComplete) return;
            NextWaveIndex++;
            ActiveWave = null;
            Persist();
            StateChanged?.Invoke();
            ResultsClaimed?.Invoke();
        }

        // --- player actions -------------------------------------------------

        // Free, instant, no confirmation (WR5); during a wave both buildings change speed at once.
        public bool MoveWorker(BuildingId from, BuildingId to)
        {
            bool inWave = ActiveWave != null && ActiveWave.Phase != WavePhase.WaveComplete;
            bool ok = inWave ? ActiveWave.MoveWorker(from, to) : Resort.MoveWorker(from, to);
            if (!ok) return false;
            if (ActiveWave == null) Persist();
            StateChanged?.Invoke();
            Toast?.Invoke("Worker moved to " + DisplayName(to));
            WorkerMoved?.Invoke();
            return true;
        }

        public bool Boost(BuildingId b)
        {
            if (ActiveWave == null || ActiveWave.Phase == WavePhase.WaveComplete) return false;
            if (!ActiveWave.UseEnergyBoost(b)) return false;
            StateChanged?.Invoke();
            Toast?.Invoke("Speed Up active at " + DisplayName(b));
            BoostUsed?.Invoke(b);
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
            if (ActiveWave == null) Persist();
            StateChanged?.Invoke();
            Toast?.Invoke("Test ad watched: +" + TestAdEnergy + " Energy");
            AdWatched?.Invoke();
        }

        public bool Upgrade(BuildingId b)
        {
            if (ActiveWave != null) return false; // upgrades exist only between waves (WR6)
            if (!Resort.Upgrade(b)) return false;
            Persist();
            StateChanged?.Invoke();
            Toast?.Invoke(DisplayName(b) + " upgraded to Lv" + Resort.Get(b).Level);
            Upgraded?.Invoke(b);
            return true;
        }

        public bool Unlock(BuildingId b)
        {
            if (ActiveWave != null) return false; // unlocks exist only between waves (WR6)
            if (!Resort.Unlock(b)) return false;
            Persist();
            StateChanged?.Invoke();
            Toast?.Invoke(DisplayName(b) + " unlocked");
            Unlocked?.Invoke(b);
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
