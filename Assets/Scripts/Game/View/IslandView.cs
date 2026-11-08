using System.Collections.Generic;
using ResortEmpire.Sim;
using UnityEngine;

namespace ResortEmpire.Game.View
{
    // The 3D blockout island. Reads GameController/sim state every frame and reconciles visuals to it;
    // it never changes game state.
    public sealed class IslandView : MonoBehaviour
    {
        // The island sits in the screen band left free by the forecast card (left) and the wave panel (right).
        static readonly Vector3 IslandCenter = new Vector3(-1.2f, 0f, 3.5f);
        const float GroundY = 0.53f;
        const float BoatSpeed = 7.5f;

        static readonly Vector3 BoatDocked = new Vector3(0.5f, 0f, -3.8f);
        static readonly Vector3 BoatAway = new Vector3(16f, 0f, -7f);

        GameController _game;
        readonly List<BuildingView> _views = new List<BuildingView>();
        Transform _boat;

        WaveSimulation _trackedSim;

        public void Init(GameController game)
        {
            _game = game;
            BuildTerrain();
            BuildBoat();

            AddBuilding(BuildingId.Reception, new Vector3(-1.2f, GroundY, 8.0f), +1f);
            AddBuilding(BuildingId.Restaurant, new Vector3(-4.8f, GroundY, 5.6f), +1f);
            AddBuilding(BuildingId.BeachBar, new Vector3(-5.6f, GroundY, 1.6f), +1f);
            AddBuilding(BuildingId.Pool, new Vector3(2.4f, GroundY, 5.6f), -1f);
            AddBuilding(BuildingId.Bungalows, new Vector3(3.2f, GroundY, 1.2f), -1f);
        }

        void Update()
        {
            if (_game == null) return;

            var sim = _game.ActiveWave;
            if (sim != _trackedSim) TrackNewWave(sim);

            float animDt = sim != null && sim.IsPaused ? 0f : Time.deltaTime * _game.SimSpeed;

            float time = Time.time;
            foreach (var view in _views)
            {
                int seated = sim != null ? sim.SeatedCount(view.Need) : 0;
                int line = sim != null ? sim.QueueLength(view.Need) : 0;
                view.Sync(_game.Resort.Get(view.Id), _game.Tuning, SiteAvailable(view.Id), seated, line, time);
            }

            UpdateBoat(sim, animDt);
        }

        void TrackNewWave(WaveSimulation sim)
        {
            _trackedSim = sim;
            if (sim != null) _boat.position = BoatAway;
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
            _views.Add(new BuildingView(transform, id, position, queueSide));
        }

        void BuildTerrain()
        {
            var t = transform;
            var c = IslandCenter;
            ViewKit.Prim(PrimitiveType.Plane, "Ocean", t, Vector3.zero, new Vector3(30f, 1f, 30f), ViewKit.Hex(0x1F7FA6));
            ViewKit.Prim(PrimitiveType.Cylinder, "Lagoon", t, c + new Vector3(0f, 0.01f, 0f),
                new Vector3(17.5f, 0.01f, 15f), ViewKit.Hex(0x5CC6CF), collider: false);
            // A flattened cylinder's capsule collider inflates into a huge sphere that would swallow every
            // building tap, so the ground discs carry no colliders.
            ViewKit.Prim(PrimitiveType.Cylinder, "Sand", t, c + new Vector3(0f, 0.2f, 0f),
                new Vector3(14f, 0.25f, 12f), ViewKit.Hex(0xEED9A4), collider: false);
            ViewKit.Prim(PrimitiveType.Cylinder, "Grass", t, c + new Vector3(0f, 0.25f, 0f),
                new Vector3(11.2f, 0.28f, 9.6f), ViewKit.Hex(0x7FBF5A), collider: false);
            ViewKit.Prim(PrimitiveType.Cylinder, "Plaza", t, new Vector3(-1.2f, 0.54f, 3f),
                new Vector3(3f, 0.01f, 2.4f), ViewKit.Hex(0xE6D2A0), collider: false);

            ViewKit.Prim(PrimitiveType.Cube, "Dock", t, new Vector3(-1.2f, 0.38f, -3.1f),
                new Vector3(1.2f, 0.14f, 2f), ViewKit.Hex(0x8B5A33));
            foreach (var z in new[] { -3.9f, -2.6f })
                foreach (var x in new[] { -1.75f, -0.65f })
                    ViewKit.Prim(PrimitiveType.Cylinder, "DockPost", t, new Vector3(x, 0.25f, z),
                        new Vector3(0.14f, 0.3f, 0.14f), ViewKit.Hex(0x6B4A2E), collider: false);

            foreach (var p in new[] { new Vector3(4.9f, 0f, 3.4f), new Vector3(-7.3f, 0f, 3.6f),
                         new Vector3(1.4f, 0f, 8.6f), new Vector3(-4.4f, 0f, 8.3f) })
                BuildPalm(t, p + new Vector3(0f, GroundY, 0f));
        }

        static void BuildPalm(Transform parent, Vector3 basePosition)
        {
            var palm = new GameObject("Palm").transform;
            palm.SetParent(parent, false);
            palm.localPosition = basePosition;
            ViewKit.Prim(PrimitiveType.Cylinder, "Trunk", palm, new Vector3(0f, 1f, 0f),
                new Vector3(0.18f, 1f, 0.18f), ViewKit.Hex(0x8B6B45), collider: false);
            ViewKit.Prim(PrimitiveType.Sphere, "Crown", palm, new Vector3(0f, 2.1f, 0f),
                new Vector3(1.5f, 0.45f, 1.5f), ViewKit.Hex(0x3E8E5A), collider: false);
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
