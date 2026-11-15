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
            public float UnstaffedBottleneckSeconds;          // part of BottleneckSeconds with no Worker on the building
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

        // Only a warning carries a cause; Recovering and calm lines need nothing.
        public QueueCause CauseOf(NeedId n)
        {
            var lane = _lanes[(int)n];
            if (lane.Status != NeedStatus.Bottleneck || lane.Building == null) return QueueCause.None;
            return lane.Building.HasWorker ? QueueCause.TooFewSeats : QueueCause.NoWorker;
        }

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

        // --- saving and restoring a wave in progress (CAM-109) ---------------------------------------------

        // The wave exactly as it is now, or null before it starts and after it has completed.
        public WaveSnapshot ToSnapshot()
        {
            if (Phase == WavePhase.AwaitingWave || Phase == WavePhase.WaveComplete) return null;
            var snap = new WaveSnapshot
            {
                waveIndex = _wave.Index,
                phase = (int)Phase,
                timeInWave = TimeInWave,
                incomingElapsed = _incomingElapsed,
                rushTriggered = _rushTriggered,
                lanes = new LaneSnapshot[_lanes.Length]
            };
            for (int i = 0; i < _lanes.Length; i++)
            {
                var lane = _lanes[i];
                snap.lanes[i] = new LaneSnapshot
                {
                    need = (int)lane.Need,
                    demand = lane.Demand,
                    pending = lane.Pending.ToArray(),
                    nextSpawn = lane.NextSpawn,
                    queue = ToUnits(lane.Queue),
                    seated = ToUnits(lane.Seated),
                    served = lane.Served,
                    waitSum = lane.WaitSum,
                    contributionSum = lane.ContributionSum,
                    status = (int)lane.Status,
                    prevQueue = lane.PrevQueue,
                    nonDecreasingSeconds = lane.NonDecreasingSeconds,
                    bottleneckSeconds = lane.BottleneckSeconds,
                    unstaffedBottleneckSeconds = lane.UnstaffedBottleneckSeconds,
                    helpGrace = lane.HelpGrace
                };
            }
            var buildings = (BuildingId[])Enum.GetValues(typeof(BuildingId));
            snap.boosts = new BoostSnapshot[buildings.Length];
            for (int i = 0; i < buildings.Length; i++)
                snap.boosts[i] = new BoostSnapshot { building = (int)buildings[i], used = _boosts[buildings[i]].Used, remaining = _boosts[buildings[i]].Remaining };
            return snap;
        }

        // Rebuilds the wave from a snapshot, on a resort restored to the same moment. Returns null when the snapshot
        // does not fit this wave or holds impossible values; the resort is left untouched in that case. The wave
        // comes back not paused: the caller pauses it.
        public static WaveSimulation FromSnapshot(ResortState resort, WaveDef wave, TuningConfig tuning, WaveSnapshot snap)
        {
            if (resort == null || wave == null || tuning == null || !Fits(snap, wave)) return null;

            var sim = new WaveSimulation(resort, wave, tuning);
            for (int i = 0; i < sim._lanes.Length; i++)       // check every lane against the resort before changing anything
            {
                var ls = snap.lanes[i];
                bool locked = resort.Get(BuildingFor(sim._lanes[i].Need)) == null;
                if (locked != ((NeedStatus)ls.status == NeedStatus.Locked)) return null;
                if (locked && (ls.queue.Length > 0 || ls.seated.Length > 0 || ls.nextSpawn > 0)) return null; // locked needs never spawn (WR9)
            }

            sim.Phase = (WavePhase)snap.phase;
            sim.TimeInWave = snap.timeInWave;
            sim._incomingElapsed = snap.incomingElapsed;
            sim._rushTriggered = snap.rushTriggered;
            for (int i = 0; i < sim._lanes.Length; i++)
            {
                var lane = sim._lanes[i];
                var ls = snap.lanes[i];
                lane.Building = resort.Get(BuildingFor(lane.Need));
                lane.Demand = ls.demand;
                lane.Pending = new List<float>(ls.pending);
                lane.NextSpawn = ls.nextSpawn;
                lane.Queue = new Queue<Unit>();
                foreach (var u in ls.queue) lane.Queue.Enqueue(ToUnit(u));
                lane.Seated = new List<Unit>();
                foreach (var u in ls.seated) lane.Seated.Add(ToUnit(u));
                lane.Served = ls.served;
                lane.WaitSum = ls.waitSum;
                lane.ContributionSum = ls.contributionSum;
                lane.Status = (NeedStatus)ls.status;
                lane.PrevQueue = ls.prevQueue;
                lane.NonDecreasingSeconds = ls.nonDecreasingSeconds;
                lane.BottleneckSeconds = ls.bottleneckSeconds;
                lane.UnstaffedBottleneckSeconds = ls.unstaffedBottleneckSeconds;
                lane.HelpGrace = ls.helpGrace;
            }
            foreach (var b in snap.boosts)
            {
                var boost = sim._boosts[(BuildingId)b.building];
                boost.Used = b.used;
                boost.Remaining = b.remaining;
            }
            resort.InWave = true;
            return sim;
        }

        static UnitSnapshot[] ToUnits(IEnumerable<Unit> units)
        {
            var list = new List<UnitSnapshot>();
            foreach (var u in units) list.Add(new UnitSnapshot { spawn = u.SpawnTime, wait = u.Wait, progress = u.Progress });
            return list.ToArray();
        }

        static Unit ToUnit(UnitSnapshot u) => new Unit { SpawnTime = u.spawn, Wait = u.wait, Progress = u.progress };

        static bool Ok(float f) => !float.IsNaN(f) && !float.IsInfinity(f) && f >= 0f;

        // Structure and numbers only; whether the lanes agree with the resort is checked by the caller.
        static bool Fits(WaveSnapshot snap, WaveDef wave)
        {
            if (snap == null || snap.version != WaveSnapshot.CurrentVersion || snap.waveIndex != wave.Index) return false;
            var phase = (WavePhase)snap.phase;
            if (phase != WavePhase.WaveIncoming && phase != WavePhase.WaveActive && phase != WavePhase.WaveResolving) return false;
            if (!Ok(snap.timeInWave) || !Ok(snap.incomingElapsed)) return false;

            var needs = (NeedId[])Enum.GetValues(typeof(NeedId));
            if (snap.lanes == null || snap.lanes.Length != needs.Length) return false;
            for (int i = 0; i < needs.Length; i++)
            {
                var ls = snap.lanes[i];
                if (ls == null || ls.need != (int)needs[i] || ls.pending == null || ls.queue == null || ls.seated == null) return false;
                if (ls.demand < 0 || ls.served < 0 || ls.prevQueue < 0 || ls.nextSpawn < 0 || ls.nextSpawn > ls.pending.Length) return false;
                if (!Enum.IsDefined(typeof(NeedStatus), ls.status)) return false;
                if (!Ok(ls.waitSum) || !Ok(ls.contributionSum) || !Ok(ls.nonDecreasingSeconds) || !Ok(ls.bottleneckSeconds) || !Ok(ls.unstaffedBottleneckSeconds) || !Ok(ls.helpGrace)) return false;
                foreach (float f in ls.pending) if (!Ok(f)) return false;
                foreach (var u in ls.queue) if (u == null || !Ok(u.spawn) || !Ok(u.wait) || !Ok(u.progress)) return false;
                foreach (var u in ls.seated) if (u == null || !Ok(u.spawn) || !Ok(u.wait) || !Ok(u.progress)) return false;
            }

            var buildings = (BuildingId[])Enum.GetValues(typeof(BuildingId));
            if (snap.boosts == null || snap.boosts.Length != buildings.Length) return false;
            for (int i = 0; i < buildings.Length; i++)
            {
                var b = snap.boosts[i];
                if (b == null || b.building != (int)buildings[i] || b.used < 0 || !Ok(b.remaining)) return false;
            }
            return true;
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
                    lane.ContributionSum += Contribution(u.Wait);
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

        float Contribution(float wait)
        {
            if (wait <= _t.PatienceGraceSeconds) return 1f;
            if (wait >= _t.PatienceFloorAfterSeconds) return _t.UnitFloor; // unit never leaves
            float f = (wait - _t.PatienceGraceSeconds) / (_t.PatienceFloorAfterSeconds - _t.PatienceGraceSeconds);
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
                    // Empty for more than half of its trouble: a staffing problem; otherwise too small for the crowd.
                    r.WorstNeedCause = lane.UnstaffedBottleneckSeconds * 2f > lane.BottleneckSeconds
                        ? BottleneckCause.Staffing
                        : BottleneckCause.Capacity;
                }
            }

            r.Satisfaction = weightSum > 0f ? Math.Max(_t.WaveFloor, contribSum / weightSum) : 1f;
            int tier = 0;
            for (int i = _t.RatingThresholds.Length - 1; i >= 0; i--)
                if (r.Satisfaction >= _t.RatingThresholds[i] - 1e-5f) { tier = i; break; }
            r.Stars = Math.Min(tier + 1, 5);
            r.Perfect = tier == _t.RatingThresholds.Length - 1;
            r.CoinsEarned = (int)Math.Round(r.TotalUnits * _t.CoinsPerUnit * (double)_t.CoinsRatingMult[tier],
                MidpointRounding.AwayFromZero);
            r.EnergyEarned = _t.EnergyDropByStars[r.Stars - 1];
            r.ResortValueGain = r.Stars * _t.ResortValuePerStar;
            Result = r;

            // Rewards apply to ResortState exactly once, here.
            _resort.Coins += r.CoinsEarned;
            _resort.Energy += r.EnergyEarned;
            _resort.ResortValue += r.ResortValueGain;
            _resort.WavesCompleted = Math.Max(_resort.WavesCompleted, _wave.Index);
            _resort.InWave = false;
        }
    }
}
