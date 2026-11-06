using System.Collections.Generic;
using ResortEmpire.Sim;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem;
using UnityEngine.Rendering;

namespace ResortEmpire.Game.View
{
    // The island from the web version with our buildings on it. Reads GameController/sim state every frame
    // and reconciles visuals to it; it never changes game state except by reporting building taps to the controller.
    public sealed class IslandView : MonoBehaviour
    {
        // Vadzim's island model, placed exactly as in the web version: raised 0.55 and scaled 8, with the
        // 70° turn stored in the model itself. His sea lies at -2.35, below the beaches.
        const string IslandModel = "Island/cascade-isle-v2";
        const float IslandScale = 8f;
        const float IslandLift = 0.55f;
        const float SeaLevel = -2.35f;

        // The island sits in the screen band left free by the forecast card (left) and the wave panel (right).
        static readonly Vector3 IslandCenter = new Vector3(-1.2f, 0f, 3.5f);
        const float GroundY = 0.53f;
        const float BoatSpeed = 7.5f;
        const int MaxSpawnsPerFrame = 4;

        static readonly Vector3 WalkStart = new Vector3(-1.2f, 0.77f, -3.8f);   // end of the dock
        static readonly Vector3 BoatDocked = new Vector3(0.5f, 0f, -3.8f);
        static readonly Vector3 BoatAway = new Vector3(16f, 0f, -7f);

        GameController _game;
        readonly List<BuildingView> _views = new List<BuildingView>();
        readonly Dictionary<NeedId, BuildingView> _byNeed = new Dictionary<NeedId, BuildingView>();
        GuestFlow _guests;
        Transform _boat;
        Vector3[] _beachSpots;

        WaveSimulation _trackedSim;
        readonly int[] _lastArrived = new int[System.Enum.GetValues(typeof(NeedId)).Length];
        readonly int[] _lastServed = new int[System.Enum.GetValues(typeof(NeedId)).Length];
        int _spawnSequence;
        int _servedSequence;

        public void Init(GameController game)
        {
            _game = game;
            BuildTerrain();
            BuildBoat();
            _guests = new GuestFlow(new GameObject("Guests").transform);

            AddBuilding(BuildingId.Reception, new Vector3(-1.2f, GroundY, 8.0f), +1f);
            AddBuilding(BuildingId.Restaurant, new Vector3(-4.8f, GroundY, 5.6f), +1f);
            AddBuilding(BuildingId.BeachBar, new Vector3(-5.6f, GroundY, 1.6f), +1f);
            AddBuilding(BuildingId.Pool, new Vector3(2.4f, GroundY, 5.6f), -1f);
            AddBuilding(BuildingId.Bungalows, new Vector3(3.2f, GroundY, 1.2f), -1f);
        }

        void Update()
        {
            if (_game == null) return;
            HandleTap();

            var sim = _game.ActiveWave;
            if (sim != _trackedSim) TrackNewWave(sim);

            float animDt = sim != null && sim.IsPaused ? 0f : Time.deltaTime * _game.SimSpeed;
            if (sim != null) ReconcileGuests(sim);
            _guests.Tick(animDt);

            bool showStatus = sim != null && sim.Phase != WavePhase.WaveComplete;
            float time = Time.time;
            foreach (var view in _views)
            {
                int seated = sim != null ? sim.SeatedCount(view.Need) : 0;
                int line = sim != null ? Mathf.Max(0, sim.QueueLength(view.Need) - _guests.InTransit(view.Need)) : 0;
                var status = sim != null ? sim.StatusOf(view.Need) : NeedStatus.Ok;
                view.Sync(_game.Resort.Get(view.Id), _game.Tuning, SiteAvailable(view.Id), seated, line,
                    status, showStatus, time);
            }

            UpdateBoat(sim, animDt);
        }

        void HandleTap()
        {
            var pointer = Pointer.current;
            if (pointer == null || !pointer.press.wasPressedThisFrame) return;
            if (EventSystem.current != null && EventSystem.current.IsPointerOverGameObject()) return;
            var cam = Camera.main;
            if (cam == null) return;

            var ray = cam.ScreenPointToRay(pointer.position.ReadValue());
            if (!Physics.Raycast(ray, out var hit, 200f)) return;
            var tag = hit.collider.GetComponentInParent<BuildingTag>();
            if (tag != null) _game.RaiseBuildingTapped(tag.Id);
        }

        void TrackNewWave(WaveSimulation sim)
        {
            _trackedSim = sim;
            System.Array.Clear(_lastArrived, 0, _lastArrived.Length);
            System.Array.Clear(_lastServed, 0, _lastServed.Length);
            _guests.ClearArrivals();
            if (sim != null) _boat.position = BoatAway;
        }

        void ReconcileGuests(WaveSimulation sim)
        {
            foreach (var pair in _byNeed)
            {
                var need = pair.Key;
                var view = pair.Value;
                int index = (int)need;

                int arrived = sim.ArrivedUnits(need);
                int newcomers = arrived - _lastArrived[index];
                _lastArrived[index] = arrived;
                int line = Mathf.Max(0, sim.QueueLength(need) - _guests.InTransit(need));
                for (int k = 0; k < Mathf.Min(newcomers, MaxSpawnsPerFrame); k++)
                    _guests.SpawnArrival(need, WalkStart, view.QueueSlotWorld(Mathf.Min(line + k, 11)), _spawnSequence++);

                int served = sim.ServedUnits(need);
                int finished = served - _lastServed[index];
                _lastServed[index] = served;
                for (int k = 0; k < Mathf.Min(finished, 2); k++)
                    if (++_servedSequence % 3 == 0)
                        _guests.SpawnLeisure(need, view.EntranceWorld, _beachSpots[(_servedSequence / 3) % _beachSpots.Length]);
            }
        }

        void UpdateBoat(WaveSimulation sim, float animDt)
        {
            bool docked = sim != null &&
                          (sim.Phase == WavePhase.WaveIncoming || (sim.Phase == WavePhase.WaveActive && !sim.ArrivalsClosed));
            var target = docked ? BoatDocked : BoatAway;
            _boat.position = Vector3.MoveTowards(_boat.position, target, BoatSpeed * animDt);
            bool visible = docked || (_boat.position - BoatAway).sqrMagnitude > 0.01f;
            if (_boat.gameObject.activeSelf != visible) _boat.gameObject.SetActive(visible);
        }

        bool SiteAvailable(BuildingId id)
        {
            var t = _game.Tuning;
            int done = _game.Resort.WavesCompleted;
            if (id == BuildingId.Pool) return done >= t.PoolEligibleAfterWave;
            if (id == BuildingId.Bungalows) return done >= t.BungalowsEligibleAfterWave;
            return false;
        }

        void AddBuilding(BuildingId id, Vector3 position, float queueSide)
        {
            var view = new BuildingView(transform, id, position, queueSide);
            _views.Add(view);
            _byNeed[view.Need] = view;
        }

        void BuildTerrain()
        {
            var t = transform;
            var c = IslandCenter;
            // His ocean plane is 42 units wide; a Unity plane is 10.
            ViewKit.Prim(PrimitiveType.Plane, "Ocean", t, new Vector3(0f, SeaLevel, 0f), new Vector3(4.2f, 1f, 4.2f),
                ViewKit.Hex(0x1F7FA6));
            BuildIslandModel(t);

            ViewKit.Prim(PrimitiveType.Cube, "Dock", t, new Vector3(-1.2f, 0.38f, -3.1f),
                new Vector3(1.2f, 0.14f, 2f), ViewKit.Hex(0x8B5A33));
            foreach (var z in new[] { -3.9f, -2.6f })
                foreach (var x in new[] { -1.75f, -0.65f })
                    ViewKit.Prim(PrimitiveType.Cylinder, "DockPost", t, new Vector3(x, 0.25f, z),
                        new Vector3(0.14f, 0.3f, 0.14f), ViewKit.Hex(0x6B4A2E), collider: false);

            // Spots on the sand ring where served guests stroll to; the dock side is left free.
            var spots = new List<Vector3>();
            for (int deg = 0; deg < 360; deg += 30)
            {
                if (deg > 240 && deg < 300) continue;
                float a = deg * Mathf.Deg2Rad;
                spots.Add(c + new Vector3(Mathf.Cos(a) * 6.3f, 0.77f, Mathf.Sin(a) * 5.3f));
            }
            _beachSpots = spots.ToArray();
        }

        static void BuildIslandModel(Transform parent)
        {
            var island = new GameObject("Island").transform;
            island.SetParent(parent, false);
            island.localPosition = new Vector3(0f, IslandLift, 0f);
            island.localScale = Vector3.one * IslandScale;
            Object.Instantiate(Resources.Load<GameObject>(IslandModel), island, false);

            // Same tuning as the web: nothing on the island is metal, the surface stays matte, the 2K normal
            // map is pushed a little for small-scale detail, and textures stay sharp at a slant.
            foreach (var r in island.GetComponentsInChildren<MeshRenderer>())
            {
                r.shadowCastingMode = ShadowCastingMode.On;
                r.receiveShadows = true;
                var m = r.material;
                m.SetFloat("metallicFactor", 0f);
                m.SetFloat("roughnessFactor", 0.92f);
                m.SetFloat("normalTexture_scale", 1.28f);
                foreach (var name in m.GetTexturePropertyNames())
                    if (m.GetTexture(name) is Texture2D texture) texture.anisoLevel = 8;
            }
        }

        void BuildBoat()
        {
            _boat = new GameObject("Boat").transform;
            _boat.SetParent(transform, false);
            ViewKit.Prim(PrimitiveType.Cube, "Hull", _boat, new Vector3(0f, 0.22f, 0f),
                new Vector3(2.4f, 0.45f, 1f), ViewKit.Hex(0xF4F1EA), collider: false);
            ViewKit.Prim(PrimitiveType.Cube, "Stripe", _boat, new Vector3(0f, 0.3f, 0f),
                new Vector3(2.42f, 0.1f, 1.02f), ViewKit.Hex(0xC0392B), collider: false);
            ViewKit.Prim(PrimitiveType.Cube, "Cabin", _boat, new Vector3(-0.3f, 0.7f, 0f),
                new Vector3(0.9f, 0.5f, 0.7f), ViewKit.Hex(0x2F6F86), collider: false);
            _boat.position = BoatAway;
            _boat.gameObject.SetActive(false);
        }
    }
}
