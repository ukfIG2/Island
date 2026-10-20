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
            public float ContributionSum;
            public NeedStatus Status;
            public int PrevQueue;
            public float NonDecreasingSeconds;
            public float BottleneckSeconds;
            public float UnstaffedBottleneckSeconds;          // part of BottleneckSeconds with no worker on the building
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
        public WaveResult Result { get; private set; }
        public bool RushFired { get; private set; }     // true from the trigger tick on; pause-frozen with the clock
        public NeedId? RushNeed { get; private set; }   // the need the rush landed on; null until it fires

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
        // Lanes exist per need, so the Spa (no need) never gets one.
        void ResolveLanes()
        {
            foreach (var lane in _lanes)
            {
                lane.Building = _resort.Get(BuildingNeeds.BuildingFor(lane.Need));
                lane.Status = lane.Building == null ? NeedStatus.Locked : NeedStatus.Ok;
                lane.Pending.Clear();
                if (lane.Building != null)
                    for (int k = 0; k < lane.Demand; k++)         // unit k at k * T / N, no randomness
                        lane.Pending.Add(k * _t.WaveTimerSeconds / lane.Demand);
            }
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

        // Moves ONE worker into a free slot of `to` (prototype: the single empty building).
        public bool MoveWorker(BuildingId from, BuildingId to)
        {
            if (IsPaused || Phase == WavePhase.WaveComplete) return false;
            if (!_resort.TryMoveWorker(from, to)) return false; // takes effect immediately, including units already seated
            HelpLanded(to);     // the building left behind keeps normal hysteresis
            return true;
        }

        public bool CanBoost(BuildingId b)
        {
            if (IsPaused) return false;
            if (Phase != WavePhase.WaveIncoming && Phase != WavePhase.WaveActive && Phase != WavePhase.WaveResolving)
                return false;
            if (!BuildingNeeds.IsWaveBuilding(b) || !_resort.IsUnlocked(b)) return false;
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
            if (!BuildingNeeds.IsWaveBuilding(b)) return;
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
            var target = RushTarget();
            if (target == null) return;                 // no wave building with a slot: no rush, nothing to report
            target.Demand += _t.RushUnits;              // rush raises the displayed demand total too
            for (int j = 0; j < _t.RushUnits; j++)
                target.Pending.Add(_t.RushTimeSeconds + j * _t.RushDurationSeconds / _t.RushUnits);
            target.Pending.Sort();                      // rush times never precede already-spawned ones
            RushNeed = target.Need;
            RushFired = true;
        }

        // The rush lands on the wave building with the fewest workers relative to its slots, right now;
        // ties go to the larger demand, then to unlock order. With one slot per building (prototype)
        // that is exactly the building without a worker. Workers < TotalSlots keeps a candidate below 100 %.
        Lane RushTarget()
        {
            Lane best = null;
            int bestWorkers = 0, bestSlots = 1;
            foreach (var b in _resort.Buildings)
            {
                if (!b.IsWaveBuilding) continue;
                int slots = _resort.SlotsOf(b.Id);
                if (slots <= 0) continue;
                var lane = _lanes[(int)b.Serves];
                if (best != null)
                {
                    long mine = (long)b.WorkerCount * bestSlots;   // compare workers/slots without floats
                    long theirs = (long)bestWorkers * slots;
                    if (mine > theirs || (mine == theirs && lane.Demand <= best.Demand)) continue;
                }
                best = lane;
                bestWorkers = b.WorkerCount;
                bestSlots = slots;
            }
            return best;
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
                int tier = _resort.QualityTier(lane.Building.Id);
                while (lane.Queue.Count > 0 && lane.Seated.Count < capacity)
                {
                    var u = lane.Queue.Dequeue();
                    u.Wait = Math.Max(0f, TimeInWave - u.SpawnTime); // waiting stops here
                    lane.WaitSum += u.Wait;
                    lane.ContributionSum += Contribution(u.Wait, tier);
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
                // Build §5.3.1: service time = service_time / (utilization x manager_multiplier x energy_boost).
                float utilization = _t.WorkerUtilization(lane.Building.WorkerCount);
                float manager = lane.Building.HasManager ? _t.ManagerMultiplier : 1f;
                float boost = _boosts[lane.Building.Id].Remaining > 0f ? _t.EnergyBoostSpeedFactor : 1f;
                float inc = utilization * manager * boost / _t.ServiceTimeSeconds * dt;
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

                if (lane.Status == NeedStatus.Bottleneck)
                {
                    lane.BottleneckSeconds += dt;
                    if (!lane.Building.HasWorker) lane.UnstaffedBottleneckSeconds += dt;
                }
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

        // P9: each quality tier of the serving building shifts both patience bounds by
        // QualityGraceSecondsPerTier, so its guests start losing satisfaction later.
        float Contribution(float wait, int tier)
        {
            float extra = tier * _t.QualityGraceSecondsPerTier;
            float grace = _t.PatienceGraceSeconds + extra;
            float floorAfter = _t.PatienceFloorAfterSeconds + extra;
            if (wait <= grace) return 1f;
            if (wait >= floorAfter) return _t.UnitFloor; // unit never leaves
            float f = (wait - grace) / (floorAfter - grace);
            return 1f + f * (_t.UnitFloor - 1f);
        }

        void Complete()
        {
            Phase = WavePhase.WaveComplete;
            var r = new WaveResult
            {
                WaveIndex = _wave.Index,
                AverageWaitByNeed = new Dictionary<NeedId, float>()
            };

            float weightSum = 0f, contribSum = 0f;
            float worstSeconds = 0f;
            foreach (var lane in _lanes)
            {
                if (lane.Building == null || lane.Demand == 0) continue; // Locked needs never spawned
                r.TotalUnits += lane.Demand;
                float w = lane.Need == NeedId.OceanView ? _t.OceanViewSatisfactionWeight : _t.VolumeNeedWeight;
                weightSum += w * lane.Served;
                contribSum += w * lane.ContributionSum;
                r.AverageWaitByNeed[lane.Need] = lane.Served > 0 ? lane.WaitSum / lane.Served : 0f;
                if (lane.BottleneckSeconds > worstSeconds)
                {
                    worstSeconds = lane.BottleneckSeconds;
                    r.WorstNeed = lane.Need;
                    // AC2d: empty for more than half of its Bottleneck time -> staffing, else too small
                    r.WorstNeedCause = lane.UnstaffedBottleneckSeconds * 2f > lane.BottleneckSeconds
                        ? BottleneckCause.Staffing
                        : BottleneckCause.Capacity;
                }
            }

            r.Satisfaction = weightSum > 0f ? Math.Max(_t.WaveFloor, contribSum / weightSum) : 1f;
            int tier = RatingScale.TierFor(r.Satisfaction, _t);
            r.Stars = RatingScale.StarsFor(tier);
            r.Perfect = RatingScale.IsPerfect(tier, _t);
            r.CoinsEarned = (int)Math.Round(r.TotalUnits * _t.CoinsPerUnit * (double)_t.CoinsRatingMult[tier],
                MidpointRounding.AwayFromZero);
            r.EnergyEarned = _t.EnergyDropByStars[r.Stars - 1];
            r.ResortValueGain = r.Stars * _t.ResortValuePerStar;
            r.ReputationEarned = r.Stars * _t.ReputationPerWaveStar;
            r.MaterialsEarned = _t.MaterialsDropByStars[r.Stars - 1];
            Result = r;

            // Rewards apply to ResortState exactly once, here.
            _resort.Coins += r.CoinsEarned;
            _resort.Energy += r.EnergyEarned;
            _resort.ResortValue += r.ResortValueGain;
            _resort.AddReputation(r.ReputationEarned);
            _resort.Materials += r.MaterialsEarned;
            _resort.WavesCompleted = Math.Max(_resort.WavesCompleted, _wave.Index);
            _resort.InWave = false;
        }
    }
}
