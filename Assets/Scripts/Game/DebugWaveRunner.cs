using System;
using System.Collections.Generic;
using ResortEmpire.Sim;
using UnityEngine;

namespace ResortEmpire.Game
{
    // OnGUI harness to play the 8-wave prototype loop end to end. The blockout island (IslandBlockout)
    // shows the same resort and wave in 3D; the panel stays on the left so the island remains visible.
    public sealed class DebugWaveRunner : MonoBehaviour
    {
        static readonly BuildingId[] AllBuildings = (BuildingId[])Enum.GetValues(typeof(BuildingId));
        static readonly NeedId[] AllNeeds = (NeedId[])Enum.GetValues(typeof(NeedId));

        TuningConfig _t;
        ResortState _resort;
        List<WaveDef> _waves;
        int _waveCursor;          // index into _waves of the NEXT wave to play
        WaveSimulation _sim;      // null between waves
        float _speed = 1f;
        float _accum;

        public ResortState Resort => _resort;
        public WaveSimulation ActiveWave => _sim;   // null between waves

        void Awake()
        {
            _t = TuningConfig.Default;
            _resort = ResortState.NewGame(_t);
            _waves = WaveTable.Default8();
        }

        void Update()
        {
            if (_sim == null) return;
            var p = _sim.Phase;
            if (p == WavePhase.AwaitingWave || p == WavePhase.WaveComplete) return;
            _accum += Time.deltaTime * _speed;
            while (_accum >= SimClock.DefaultStep)   // fixed sub-steps keep results dt-independent
            {
                _sim.Tick(SimClock.DefaultStep);
                _accum -= SimClock.DefaultStep;
            }
        }

        void OnGUI()
        {
            var panel = new Rect(8f, 8f, Mathf.Min(Screen.width * 0.42f, 780f), Screen.height - 16f);
            GUI.Box(panel, GUIContent.none);
            GUILayout.BeginArea(new Rect(panel.x + 8f, panel.y + 6f, panel.width - 16f, panel.height - 12f));
            DrawHeader();
            if (_sim != null && _sim.Phase == WavePhase.WaveComplete) DrawResult();
            else if (_sim != null && _sim.Phase != WavePhase.AwaitingWave) DrawWave();
            else DrawResort();
            GUILayout.EndArea();
        }

        void DrawHeader()
        {
            GUILayout.BeginHorizontal();
            GUILayout.Label("Coins " + _resort.Coins + "    Energy " + _resort.Energy
                + "    Resort Value " + _resort.ResortValue
                + "    Waves completed " + _resort.WavesCompleted, GUILayout.Width(460f));
            foreach (var s in new[] { 1f, 4f, 16f })
                if (GUILayout.Button((Mathf.Approximately(_speed, s) ? "> " : "") + s + "x", GUILayout.Width(54f)))
                    _speed = s;
            GUILayout.EndHorizontal();
            GUILayout.Space(6f);
        }

        // --- between waves ----------------------------------------------------

        void DrawResort()
        {
            foreach (var b in _resort.Buildings)
            {
                GUILayout.BeginHorizontal();
                GUILayout.Label(b.Id + "  Lv" + b.Level + "  cap " + _t.CapacityPerLevel[b.Level - 1]
                    + (b.HasWorker ? "  worker: yes" : "  worker: NO"), GUILayout.Width(300f));
                MoveWorkerButtons(b, inWave: false);
                if (b.Level < _t.CapacityPerLevel.Length)
                {
                    int cost = _t.UpgradeCostCoins[b.Level - 1];
                    if (_resort.Coins >= cost && GUILayout.Button("Upgrade (" + cost + "c)", GUILayout.Width(140f)))
                        _resort.Upgrade(b.Id);
                }
                GUILayout.EndHorizontal();
            }

            GUILayout.Space(6f);
            UnlockButton(BuildingId.Pool, _t.PoolUnlockCostCoins);
            UnlockButton(BuildingId.Bungalows, _t.BungalowsUnlockCostCoins);
            GUILayout.Space(6f);

            if (_waveCursor >= _waves.Count)
            {
                GUILayout.Label("Prototype complete — all " + _waves.Count + " waves played.");
                return;
            }

            var next = _waves[_waveCursor];
            GUILayout.Label("Next wave " + next.Index + " forecast:");
            foreach (var need in AllNeeds)
                if (next.Demand.TryGetValue(need, out int n) && n > 0)
                    GUILayout.Label("    " + need + ": " + n
                        + (_resort.IsUnlocked(BuildingFor(need)) ? "" : "  (building locked — will not arrive)"));

            GUILayout.Space(8f);
            if (GUILayout.Button("START WAVE " + next.Index, GUILayout.Height(44f), GUILayout.Width(260f)))
            {
                _sim = new WaveSimulation(_resort, next, _t);
                _sim.StartWave();
                _accum = 0f;
            }
        }

        void UnlockButton(BuildingId b, int cost)
        {
            if (_resort.IsUnlocked(b)) return;
            if (_resort.CanUnlock(b, out string reason))
            {
                if (GUILayout.Button("Unlock " + b + " (" + cost + "c)", GUILayout.Width(240f)))
                    _resort.Unlock(b);
            }
            else GUILayout.Label("Unlock " + b + ": " + reason);
        }

        // --- during a wave ----------------------------------------------------

        void DrawWave()
        {
            GUILayout.BeginHorizontal();
            GUILayout.Label("Wave " + _waves[_waveCursor].Index + "   " + _sim.Phase
                + "   t=" + _sim.TimeInWave.ToString("0.0") + "s"
                + (_sim.ArrivalsClosed ? "   (arrivals closed)" : ""), GUILayout.Width(420f));
            if (GUILayout.Button(_sim.IsPaused ? "Resume" : "Pause", GUILayout.Width(100f)))
                _sim.IsPaused = !_sim.IsPaused;
            GUILayout.EndHorizontal();
            GUILayout.Space(4f);

            // Spec: no live satisfaction number during the wave — queues and statuses only.
            foreach (var need in AllNeeds)
            {
                if (_sim.DemandTotal(need) == 0) continue;
                var status = _sim.StatusOf(need);
                GUI.color = StatusColor(status);
                GUILayout.BeginHorizontal();
                GUILayout.Label(need.ToString(), GUILayout.Width(90f));
                GUILayout.Label(_sim.ArrivedUnits(need) + "/" + _sim.DemandTotal(need), GUILayout.Width(60f));
                GUILayout.Label("queue " + new string('#', _sim.QueueLength(need)), GUILayout.Width(240f));
                GUILayout.Label("seated " + _sim.SeatedCount(need), GUILayout.Width(80f));
                GUILayout.Label(status.ToString(), GUILayout.Width(100f));
                GUILayout.EndHorizontal();
                GUI.color = Color.white;
            }

            GUILayout.Space(8f);
            foreach (var b in _resort.Buildings)
            {
                GUILayout.BeginHorizontal();
                GUILayout.Label(b.Id + " Lv" + b.Level + (b.HasWorker ? "  [worker]" : "  [no worker]"),
                    GUILayout.Width(220f));
                float rem = _sim.BoostRemaining(b.Id);
                if (rem > 0f) GUILayout.Label("boost " + rem.ToString("0.0") + "s", GUILayout.Width(100f));
                else if (_sim.CanBoost(b.Id)
                    && GUILayout.Button("Speed Up x2 (" + _t.EnergyBoostCost + " energy)", GUILayout.Width(190f)))
                    _sim.UseEnergyBoost(b.Id);
                MoveWorkerButtons(b, inWave: true);
                GUILayout.EndHorizontal();
            }
        }

        // One tap per valid move: the button on the empty building names the source,
        // so the tap also decides which building stays empty.
        void MoveWorkerButtons(BuildingState target, bool inWave)
        {
            if (target.HasWorker) return;
            if (inWave && _sim.IsPaused) return; // moves are not allowed while paused
            foreach (var src in _resort.Buildings)
            {
                if (!src.HasWorker) continue;
                if (GUILayout.Button("Move worker here (leave " + src.Id + " empty)", GUILayout.Width(280f)))
                {
                    if (inWave) _sim.MoveWorker(src.Id, target.Id);
                    else _resort.MoveWorker(src.Id, target.Id);
                }
            }
        }

        // --- wave complete ----------------------------------------------------

        void DrawResult()
        {
            var r = _sim.Result;
            GUILayout.Label("WAVE " + r.WaveIndex + " COMPLETE    "
                + new string('★', r.Stars) + new string('☆', 5 - r.Stars)
                + (r.Perfect ? "    PERFECT!" : ""));
            GUILayout.Label("Satisfaction: " + Mathf.RoundToInt(r.Satisfaction * 100f) + "%");
            GUILayout.Label("Coins +" + r.CoinsEarned + "    Energy +" + r.EnergyEarned
                + "    Resort Value +" + r.ResortValueGain + "    (" + r.TotalUnits + " guests)");
            foreach (var kv in r.AverageWaitByNeed)
                GUILayout.Label("    " + kv.Key + " avg wait " + kv.Value.ToString("0.0") + "s");
            if (r.WorstNeed.HasValue)
                GUILayout.Label("Consider upgrading " + BuildingFor(r.WorstNeed.Value) + ".");
            GUILayout.Space(8f);
            if (GUILayout.Button("Continue", GUILayout.Height(40f), GUILayout.Width(200f)))
            {
                _sim = null;
                _waveCursor++;
            }
        }

        // --- helpers ------------------------------------------------------------

        static BuildingId BuildingFor(NeedId need)
        {
            foreach (var b in AllBuildings)
                if (BuildingNeeds.Serves(b) == need) return b;
            return BuildingId.Reception;
        }

        static Color StatusColor(NeedStatus s)
        {
            switch (s)
            {
                case NeedStatus.Bottleneck: return Color.red;
                case NeedStatus.Recovering: return Color.yellow;
                case NeedStatus.Satisfied: return Color.green;
                case NeedStatus.Locked: return Color.gray;
                default: return Color.white;
            }
        }
    }
}
