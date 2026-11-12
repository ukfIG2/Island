using System;
using ResortEmpire.Sim;

namespace ResortEmpire.Game.Sound
{
    // CAM-117: turns what happens in the game into cues. It listens to the controller's events and, every frame, looks
    // at the running wave for the changes that have no event of their own (a line that starts to grow, the Sudden
    // rush, arrivals closing, the wave ending). Plain C# on purpose: the tests drive a real game and read the cues
    // it asks for, which is how a sound can be checked by someone who cannot hear it.
    // A wave that comes back from a save is already under way, so nothing is announced for what had happened before.
    public sealed class SoundWatcher : IDisposable
    {
        static readonly NeedId[] Needs = (NeedId[])Enum.GetValues(typeof(NeedId));

        readonly GameController _game;
        readonly Action<SoundCue, float> _emit;     // the cue and how loud, 0..1 of its own loudness
        readonly NeedStatus[] _status = new NeedStatus[Needs.Length];
        WaveSimulation _sim;
        bool _rushSeen, _closedSeen, _completeSeen;

        public SoundWatcher(GameController game, Action<SoundCue, float> emit)
        {
            _game = game;
            _emit = emit;
            game.WorkerMoved += OnWorkerMoved;
            game.BoostUsed += OnBoostUsed;
            game.AdWatched += OnAdWatched;
            game.Upgraded += OnUpgraded;
            game.Unlocked += OnUnlocked;
            game.ResultsClaimed += OnResultsClaimed;
            _sim = game.ActiveWave;
            if (_sim != null) Remember(_sim, atTheStart: false);
        }

        public void Dispose()
        {
            _game.WorkerMoved -= OnWorkerMoved;
            _game.BoostUsed -= OnBoostUsed;
            _game.AdWatched -= OnAdWatched;
            _game.Upgraded -= OnUpgraded;
            _game.Unlocked -= OnUnlocked;
            _game.ResultsClaimed -= OnResultsClaimed;
        }

        void OnWorkerMoved() => _emit(SoundCue.WorkerMoved, 1f);
        void OnBoostUsed(BuildingId b) => _emit(SoundCue.SpeedUp, 1f);
        void OnAdWatched() => _emit(SoundCue.EnergyGained, 1f);
        void OnUpgraded(BuildingId b) => _emit(SoundCue.Upgrade, 1f);
        void OnUnlocked(BuildingId b) => _emit(SoundCue.Unlock, 1f);
        void OnResultsClaimed() => _emit(SoundCue.RewardsClaimed, 1f);

        // What the wave looks like now, so only later changes are announced. At the start of a wave nothing has
        // happened yet; for a wave restored from a save everything that had happened is already in the past.
        void Remember(WaveSimulation sim, bool atTheStart)
        {
            foreach (var need in Needs) _status[(int)need] = sim.StatusOf(need);
            _rushSeen = !atTheStart && sim.RushFired;
            _closedSeen = !atTheStart && sim.ArrivalsClosed;
            _completeSeen = !atTheStart && sim.Phase == WavePhase.WaveComplete;
        }

        // Called every frame.
        public void Poll()
        {
            var sim = _game.ActiveWave;
            if (!ReferenceEquals(sim, _sim))
            {
                _sim = sim;
                if (sim == null) return;
                Remember(sim, atTheStart: true);
                if (sim.Phase != WavePhase.AwaitingWave) _emit(SoundCue.WaveStart, 1f);
            }
            if (sim == null) return;

            if (sim.Phase != WavePhase.WaveComplete)
                foreach (var need in Needs)
                {
                    var now = sim.StatusOf(need);
                    var before = _status[(int)need];
                    if (now == before) continue;
                    _status[(int)need] = now;
                    if (now == NeedStatus.Bottleneck) _emit(SoundCue.LineGrowing, 1f);
                    else if (now == NeedStatus.Recovering) _emit(SoundCue.LineCatchingUp, 1f);
                }

            if (!_rushSeen && sim.RushFired)
            {
                _rushSeen = true;
                _emit(SoundCue.SuddenRush, 1f);
            }

            if (!_closedSeen && sim.ArrivalsClosed)
            {
                _closedSeen = true;
                _emit(SoundCue.GuestsArrived, 1f);
            }

            if (!_completeSeen && sim.Phase == WavePhase.WaveComplete)
            {
                _completeSeen = true;
                if (sim.Result != null) _emit(ResultCue(sim.Result), 1f);
            }
        }

        // One more note for every star; a 1-star result is a quiet single note, never a "fail" sound.
        public static SoundCue ResultCue(WaveResult result)
        {
            if (result.Perfect) return SoundCue.ResultPerfect;
            switch (result.Stars)
            {
                case 2: return SoundCue.ResultTwoStars;
                case 3: return SoundCue.ResultThreeStars;
                case 4: return SoundCue.ResultFourStars;
                case 5: return SoundCue.ResultFiveStars;
                default: return SoundCue.ResultOneStar;
            }
        }
    }
}
