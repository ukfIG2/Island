using System;
using System.Collections.Generic;

namespace ResortEmpire.Sim
{
    // One instance per wave. Pure, deterministic, fixed-step friendly (dt <= 0.1s).
    public sealed class WaveSimulation
    {
        sealed class Unit
        {
            public float SpawnTime;   // scheduled time, used for waits so results stay dt-independent
            public float Wait;        // final once seated; service time is not waiting
            public float Progress;
        }

        sealed class Lane
        {
            public NeedId Need;
            public BuildingState Building;                    // null -> Locked, need never spawns (WR9); resolved at StartWave
            public int Demand;                                // rush raises this at trigger time
            public List<float> Pending = new List<float>();   // sorted spawn times
            public int NextSpawn;
            public Queue<Unit> Queue = new Queue<Unit>();     // FIFO
            public List<Unit> Seated = new List<Unit>();
            public int Served;
            public float WaitSum;
            public NeedStatus Status;
            public int PrevQueue;
            public float NonDecreasingSeconds;
            public float BottleneckSeconds;
            public float HelpGrace;                           // AC2: no return to Bottleneck while > 0
        }

        sealed class Boost
        {
            public int Used;
            public float Remaining;
        }

        readonly ResortState _resort;
        readonly WaveDef _wave;
        readonly TuningConfig _t;
        readonly Lane[] _lanes;
        readonly Dictionary<BuildingId, Boost> _boosts = new Dictionary<BuildingId, Boost>();
        float _incomingElapsed;
        bool _rushTriggered;

        public WavePhase Phase { get; private set; } = WavePhase.AwaitingWave;
        public bool IsPaused { get; set; }
        public float TimeInWave { get; private set; } // seconds inside WaveActive, pause-frozen

        public WaveSimulation(ResortState resort, WaveDef wave, TuningConfig tuning)
        {
            _resort = resort;
            _wave = wave;
            _t = tuning;

            var needs = (NeedId[])Enum.GetValues(typeof(NeedId));
            _lanes = new Lane[needs.Length];
            foreach (var need in needs)
            {
                var lane = new Lane { Need = need };
                wave.Demand.TryGetValue(need, out lane.Demand);
                _lanes[(int)need] = lane;
            }
            ResolveLanes(); // preview for AwaitingWave; StartWave resolves again

            foreach (BuildingId b in Enum.GetValues(typeof(BuildingId)))
                _boosts[b] = new Boost();
        }

        // Read at StartWave so a building unlocked in AwaitingWave takes part in this wave.
        void ResolveLanes()
        {
            foreach (var lane in _lanes)
            {
                lane.Building = _resort.Get(BuildingFor(lane.Need));
                lane.Status = lane.Building == null ? NeedStatus.Locked : NeedStatus.Ok;
                lane.Pending.Clear();
                if (lane.Building != null)
                    for (int k = 0; k < lane.Demand; k++)         // unit k at k * T / N, no randomness
                        lane.Pending.Add(k * _t.WaveTimerSeconds / lane.Demand);
            }
        }

        static BuildingId BuildingFor(NeedId need)
        {
            foreach (BuildingId b in Enum.GetValues(typeof(BuildingId)))
                if (BuildingNeeds.Serves(b) == need) return b;
            return BuildingId.Reception;
        }

        public void StartWave()
        {
            if (IsPaused || Phase != WavePhase.AwaitingWave) return;
            ResolveLanes();
            Phase = WavePhase.WaveIncoming;
            _resort.InWave = true;
        }

        public void Tick(float dt)
        {
            if (IsPaused || dt <= 0f) return;
            if (Phase == WavePhase.AwaitingWave || Phase == WavePhase.WaveComplete) return;

            TickBoosts(dt);

            if (Phase == WavePhase.WaveIncoming)
            {
                _incomingElapsed += dt;
                if (_incomingElapsed < _t.WaveIncomingSeconds) return;
                dt = Math.Min(dt, _incomingElapsed - _t.WaveIncomingSeconds); // carry the remainder
                Phase = WavePhase.WaveActive;
                if (dt <= 0f) return;
            }

            if (Phase == WavePhase.WaveActive)
            {
                TimeInWave += dt;
                if (!_rushTriggered && _wave.HasSuddenRush && TimeInWave >= _t.RushTimeSeconds)
                    TriggerRush();
                SpawnDue();
                SeatFromQueues();
            }

            ProgressSeated(dt);
            SeatFromQueues(); // refill seats freed this tick; no-op once queues are empty
            UpdateBottlenecks(dt);
            UpdatePhase();
        }

        // --- player actions -------------------------------------------------

        public bool MoveWorker(BuildingId from, BuildingId to)
        {
            if (IsPaused || Phase == WavePhase.WaveComplete) return false;
            var f = _resort.Get(from);
            var t = _resort.Get(to);
            if (f == null || t == null || !f.HasWorker || t.HasWorker) return false;
            f.HasWorker = false;
            t.HasWorker = true; // takes effect immediately, including units already seated
            HelpLanded(to);     // the building left behind keeps normal hysteresis
            return true;
        }

        public bool CanBoost(BuildingId b)
        {
            if (IsPaused) return false;
            if (Phase != WavePhase.WaveIncoming && Phase != WavePhase.WaveActive && Phase != WavePhase.WaveResolving)
                return false;
            if (!_resort.IsUnlocked(b)) return false;
            return _boosts[b].Used < _t.MaxBoostsPerBuildingPerWave && _resort.Energy >= _t.EnergyBoostCost;
        }

        public bool UseEnergyBoost(BuildingId b)
        {
            if (!CanBoost(b)) return false; // insufficient energy -> false, service continues normally
            _resort.Energy -= _t.EnergyBoostCost;
            var boost = _boosts[b];
            boost.Used++;
            boost.Remaining += _t.EnergyBoostDurationSeconds;
            HelpLanded(b);
            return true;
        }

        // AC2: help on a bottlenecked building turns the warning into Recovering in the same
        // interaction; the faster service then gets RecoveringGraceSeconds to show before
        // the warning may return.
        void HelpLanded(BuildingId b)
        {
            var lane = _lanes[(int)BuildingNeeds.Serves(b)];
            if (lane.Status != NeedStatus.Bottleneck) return;
            lane.Status = NeedStatus.Recovering;
            lane.HelpGrace = _t.RecoveringGraceSeconds;
            lane.NonDecreasingSeconds = 0f;
        }

        public float BoostRemaining(BuildingId b) => _boosts[b].Remaining;

        // --- per-need queries -----------------------------------------------

        public int DemandTotal(NeedId n) => _lanes[(int)n].Demand;
        public int ArrivedUnits(NeedId n) => _lanes[(int)n].NextSpawn;
        public int QueueLength(NeedId n) => _lanes[(int)n].Queue.Count;
        public int SeatedCount(NeedId n) => _lanes[(int)n].Seated.Count;
        public int ServedUnits(NeedId n) => _lanes[(int)n].Served;
        public NeedStatus StatusOf(NeedId n) => _lanes[(int)n].Status;

        public bool ArrivalsClosed
        {
            get
            {
                if (Phase == WavePhase.WaveResolving || Phase == WavePhase.WaveComplete) return true;
                if (Phase != WavePhase.WaveActive || TimeInWave < _t.WaveTimerSeconds) return false;
                foreach (var lane in _lanes)
                    if (lane.NextSpawn < lane.Pending.Count) return false;
                return true;
            }
        }

        // --- internals --------------------------------------------------------

        void TriggerRush()
        {
            _rushTriggered = true;
            Lane target = null;
            foreach (var b in _resort.Buildings)        // the unlocked building with no worker, right now
                if (!b.HasWorker) { target = _lanes[(int)b.Serves]; break; }
            if (target == null) return;
            target.Demand += _t.RushUnits;              // rush raises the displayed demand total too
            for (int j = 0; j < _t.RushUnits; j++)
                target.Pending.Add(_t.RushTimeSeconds + j * _t.RushDurationSeconds / _t.RushUnits);
            target.Pending.Sort();                      // rush times never precede already-spawned ones
        }

        void SpawnDue()
        {
            foreach (var lane in _lanes)
                while (lane.NextSpawn < lane.Pending.Count && lane.Pending[lane.NextSpawn] <= TimeInWave)
                {
                    lane.Queue.Enqueue(new Unit { SpawnTime = lane.Pending[lane.NextSpawn] });
                    lane.NextSpawn++;
                }
        }

        void SeatFromQueues()
        {
            foreach (var lane in _lanes)
            {
                if (lane.Building == null) continue;
                int capacity = _t.CapacityPerLevel[lane.Building.Level - 1];
                while (lane.Queue.Count > 0 && lane.Seated.Count < capacity)
                {
                    var u = lane.Queue.Dequeue();
                    u.Wait = Math.Max(0f, TimeInWave - u.SpawnTime); // waiting stops here
                    lane.WaitSum += u.Wait;
                    lane.Seated.Add(u);
                }
            }
        }

        void ProgressSeated(float dt)
        {
            foreach (var lane in _lanes)
            {
                if (lane.Building == null || lane.Seated.Count == 0) continue;
                // Rate is read live: worker and boost changes apply to units already seated (WR2 keeps it > 0).
                float utilization = lane.Building.HasWorker ? _t.UtilizationStaffed : _t.UtilizationEmpty;
                float boost = _boosts[lane.Building.Id].Remaining > 0f ? _t.EnergyBoostSpeedFactor : 1f;
                float inc = utilization * boost / _t.ServiceTimeSeconds * dt;
                for (int i = lane.Seated.Count - 1; i >= 0; i--)
                {
                    var u = lane.Seated[i];
                    u.Progress += inc;
                    if (u.Progress >= 1f)
                    {
                        lane.Seated.RemoveAt(i);
                        lane.Served++;
                    }
                }
            }
        }

        void TickBoosts(float dt)
        {
            foreach (var boost in _boosts.Values)
                if (boost.Remaining > 0f) boost.Remaining = Math.Max(0f, boost.Remaining - dt);
        }

        void UpdateBottlenecks(float dt)
        {
            bool closed = ArrivalsClosed;
            foreach (var lane in _lanes)
            {
                if (lane.Building == null) continue; // stays Locked
                int q = lane.Queue.Count;
                if (q < lane.PrevQueue) lane.NonDecreasingSeconds = 0f;
                else lane.NonDecreasingSeconds += dt;
                if (lane.HelpGrace > 0f) lane.HelpGrace = Math.Max(0f, lane.HelpGrace - dt);
                bool mayWarn = lane.HelpGrace <= 0f; // also covers Recovering -> Ok -> Bottleneck flicker

                if (closed && q == 0 && lane.Seated.Count == 0)
                    lane.Status = NeedStatus.Satisfied;
                else switch (lane.Status)
                {
                    case NeedStatus.Ok:
                        if (mayWarn && q > _t.BottleneckThresholdUnits && lane.NonDecreasingSeconds >= _t.BottleneckHysteresisSeconds)
                            lane.Status = NeedStatus.Bottleneck;
                        break;
                    case NeedStatus.Bottleneck:
                        if (q <= _t.BottleneckThresholdUnits) lane.Status = NeedStatus.Ok;
                        else if (q < lane.PrevQueue) lane.Status = NeedStatus.Recovering;
                        break;
                    case NeedStatus.Recovering:
                        if (q <= _t.BottleneckThresholdUnits) lane.Status = NeedStatus.Ok;
                        else if (mayWarn && q >= lane.PrevQueue && lane.NonDecreasingSeconds >= _t.BottleneckHysteresisSeconds)
                            lane.Status = NeedStatus.Bottleneck;
                        break;
                }

                if (lane.Status == NeedStatus.Bottleneck) lane.BottleneckSeconds += dt;
                lane.PrevQueue = q;
            }
        }

        void UpdatePhase()
        {
            if (Phase == WavePhase.WaveActive)
            {
                if (ArrivalsClosed && AllQueuesEmpty())
                    Phase = WavePhase.WaveResolving; // WR3: arrivals close, the wave itself always finishes
                return; // WaveResolving lasts at least one tick, even if nobody is seated
            }
            if (Phase == WavePhase.WaveResolving && NothingSeated())
                Complete();
        }

        bool AllQueuesEmpty()
        {
            foreach (var lane in _lanes)
                if (lane.Queue.Count > 0) return false;
            return true;
        }

        bool NothingSeated()
        {
            foreach (var lane in _lanes)
                if (lane.Seated.Count > 0) return false;
            return true;
        }

        void Complete()
        {
            Phase = WavePhase.WaveComplete;
            _resort.WavesCompleted = Math.Max(_resort.WavesCompleted, _wave.Index);
            _resort.InWave = false;
        }
    }
}
