using System.Collections.Generic;
using ResortEmpire.Sim;
using UnityEngine;

namespace ResortEmpire.Game.View
{
    // Sprint 1 blockout island, built from primitives in code. It reads the debug runner's resort and wave
    // every frame and reconciles the visuals to them; it never changes simulation state.
    // Sprint 2 swaps the ground for the 3D island model from the web version.
    public sealed class IslandBlockout : MonoBehaviour
    {
        static readonly Vector3 IslandCenter = new Vector3(-1.2f, 0f, 3.5f);
        const float GroundY = 0.53f;
        const float LevelHeightStep = 0.3f;   // each level makes a building this much taller (x its base height)

        // The camera looks past the debug panel on the left, so the island sits in the free right part.
        static readonly Vector3 CameraPosition = new Vector3(-6.5f, 15.5f, -12.5f);
        static readonly Vector3 CameraAngles = new Vector3(44f, 0f, 0f);

        static readonly Dictionary<BuildingId, Vector3> SpotPositions = new Dictionary<BuildingId, Vector3>
        {
            { BuildingId.Reception, new Vector3(-1.2f, GroundY, 8.0f) },
            { BuildingId.Restaurant, new Vector3(-4.8f, GroundY, 5.6f) },
            { BuildingId.BeachBar, new Vector3(-5.6f, GroundY, 1.6f) },
            { BuildingId.Pool, new Vector3(2.4f, GroundY, 5.6f) },
            { BuildingId.Bungalows, new Vector3(3.2f, GroundY, 1.2f) },
        };

        static readonly Color BottleneckColor = ViewKit.Hex(0xE04B3A);
        static readonly Color RecoveringColor = ViewKit.Hex(0xF2C230);
        static readonly Color WorkerColor = ViewKit.Hex(0xF39C34);

        sealed class Spot
        {
            public BuildingId Id;
            public Transform Root;
            public GameObject Visual;     // building or construction site, rebuilt when it changes
            public Renderer Ring;         // need status under the building, only during a wave
            public Transform Worker;      // marker above the roof while a Worker is assigned
            public bool ShownUnlocked;
            public int ShownLevel;
            public float RoofY;
        }

        DebugWaveRunner _runner;
        readonly List<Spot> _spots = new List<Spot>();

        // Any scene with a debug runner gets the island, so no scene content has to be edited by hand.
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void AttachToRunner()
        {
            var runner = FindAnyObjectByType<DebugWaveRunner>();
            if (runner != null && runner.GetComponent<IslandBlockout>() == null)
                runner.gameObject.AddComponent<IslandBlockout>();
        }

        void Start()
        {
            _runner = GetComponent<DebugWaveRunner>();
            var root = new GameObject("Island").transform;
            BuildTerrain(root);
            foreach (var pair in SpotPositions)
                _spots.Add(BuildSpot(root, pair.Key, pair.Value));
            FrameCamera();
        }

        void Update()
        {
            var resort = _runner != null ? _runner.Resort : null;
            if (resort == null) return;
            var wave = _runner.ActiveWave;
            bool waveRunning = wave != null && wave.Phase != WavePhase.AwaitingWave && wave.Phase != WavePhase.WaveComplete;

            foreach (var spot in _spots)
            {
                var state = resort.Get(spot.Id);   // null while the area is still a construction site
                bool unlocked = state != null;
                int level = unlocked ? state.Level : 0;
                if (unlocked != spot.ShownUnlocked || level != spot.ShownLevel)
                    Rebuild(spot, unlocked, level);

                bool hasWorker = unlocked && state.HasWorker;
                if (spot.Worker.gameObject.activeSelf != hasWorker) spot.Worker.gameObject.SetActive(hasWorker);
                if (hasWorker)
                    spot.Worker.localPosition = new Vector3(0f, spot.RoofY + 0.55f + Mathf.Sin(Time.time * 2.5f) * 0.08f, 0f);

                var status = waveRunning && unlocked ? wave.StatusOf(BuildingNeeds.Serves(spot.Id)) : NeedStatus.Ok;
                bool showRing = status == NeedStatus.Bottleneck || status == NeedStatus.Recovering;
                if (spot.Ring.gameObject.activeSelf != showRing) spot.Ring.gameObject.SetActive(showRing);
                if (showRing)
                    spot.Ring.sharedMaterial = ViewKit.Mat(status == NeedStatus.Bottleneck ? BottleneckColor : RecoveringColor);
            }
        }

        static void FrameCamera()
        {
            var cam = Camera.main;
            if (cam == null) return;
            cam.transform.SetPositionAndRotation(CameraPosition, Quaternion.Euler(CameraAngles));
            cam.orthographic = false;
            cam.fieldOfView = 38f;
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = new Color(0.47f, 0.76f, 0.95f);
        }

        // --- spots ---------------------------------------------------------------

        static Spot BuildSpot(Transform parent, BuildingId id, Vector3 position)
        {
            var root = new GameObject(id.ToString()).transform;
            root.SetParent(parent, false);
            root.localPosition = position;

            var spot = new Spot { Id = id, Root = root, ShownLevel = -1 };
            spot.Ring = ViewKit.Prim(PrimitiveType.Cylinder, "StatusRing", root, new Vector3(0f, 0.02f, 0f),
                new Vector3(3.1f, 0.01f, 3.1f), BottleneckColor, collider: false).GetComponent<Renderer>();
            spot.Ring.gameObject.SetActive(false);
            spot.Worker = ViewKit.Prim(PrimitiveType.Sphere, "Worker", root, Vector3.zero,
                new Vector3(0.45f, 0.45f, 0.45f), WorkerColor, collider: false).transform;
            spot.Worker.gameObject.SetActive(false);
            return spot;
        }

        static void Rebuild(Spot spot, bool unlocked, int level)
        {
            if (spot.Visual != null) Destroy(spot.Visual);
            spot.Visual = new GameObject(unlocked ? "Building" : "ConstructionSite");
            spot.Visual.transform.SetParent(spot.Root, false);
            float grow = 1f + LevelHeightStep * Mathf.Max(0, level - 1);
            spot.RoofY = unlocked ? BuildBuilding(spot.Id, spot.Visual.transform, grow) : BuildSite(spot.Visual.transform);
            spot.ShownUnlocked = unlocked;
            spot.ShownLevel = level;
        }

        // Returns the roof height, so the Worker marker can float above it.
        static float BuildBuilding(BuildingId id, Transform t, float grow)
        {
            switch (id)
            {
                case BuildingId.Reception:
                {
                    float h = 2.2f * grow;
                    ViewKit.Prim(PrimitiveType.Cube, "Walls", t, new Vector3(0f, h / 2f, 0f), new Vector3(2.4f, h, 1.6f), ViewKit.Hex(0xF4EBD9));
                    ViewKit.Prim(PrimitiveType.Cube, "Roof", t, new Vector3(0f, h + 0.12f, 0f), new Vector3(2.7f, 0.24f, 1.9f), ViewKit.Hex(0xC0503A));
                    ViewKit.Prim(PrimitiveType.Cube, "Door", t, new Vector3(0f, 0.45f, -0.81f), new Vector3(0.6f, 0.9f, 0.04f), ViewKit.Hex(0x7A4E2D), collider: false);
                    return h + 0.24f;
                }
                case BuildingId.Restaurant:
                {
                    float h = 1.5f * grow;
                    ViewKit.Prim(PrimitiveType.Cube, "Walls", t, new Vector3(0f, h / 2f, 0f), new Vector3(2.4f, h, 1.8f), ViewKit.Hex(0xFFF3E0));
                    ViewKit.Prim(PrimitiveType.Cube, "Roof", t, new Vector3(0f, h + 0.1f, 0f), new Vector3(2.7f, 0.2f, 2.1f), ViewKit.Hex(0xE67E22));
                    ViewKit.Prim(PrimitiveType.Cube, "Awning", t, new Vector3(0f, h * 0.7f, -1.05f), new Vector3(2.2f, 0.08f, 0.5f), ViewKit.Hex(0xD35400), collider: false);
                    return h + 0.2f;
                }
                case BuildingId.BeachBar:
                {
                    float h = 1.0f * grow;
                    ViewKit.Prim(PrimitiveType.Cube, "Counter", t, new Vector3(0f, h / 2f, 0f), new Vector3(1.6f, h, 1.0f), ViewKit.Hex(0xA9774A));
                    ViewKit.Prim(PrimitiveType.Cylinder, "ThatchRoof", t, new Vector3(0f, h + 0.45f, 0f), new Vector3(2.2f, 0.12f, 2.2f), ViewKit.Hex(0xD9B56A));
                    foreach (var x in new[] { -0.7f, 0.7f })
                        ViewKit.Prim(PrimitiveType.Cylinder, "Post", t, new Vector3(x, (h + 0.4f) / 2f, -0.45f), new Vector3(0.08f, (h + 0.4f) / 2f, 0.08f), ViewKit.Hex(0x6B4A2E), collider: false);
                    return h + 0.55f;
                }
                case BuildingId.Pool:
                {
                    float d = 0.25f * grow;
                    ViewKit.Prim(PrimitiveType.Cube, "Deck", t, new Vector3(0f, d / 2f, 0f), new Vector3(2.8f, d, 2.0f), ViewKit.Hex(0xF2F2F2));
                    ViewKit.Prim(PrimitiveType.Cube, "Water", t, new Vector3(0f, d + 0.01f, 0f), new Vector3(2.2f, 0.02f, 1.4f), ViewKit.Hex(0x3FC1E0), collider: false);
                    return d + 0.3f;
                }
                default: // Bungalows: two huts on stilts
                {
                    float h = 1.0f * grow;
                    foreach (var x in new[] { -0.75f, 0.75f })
                    {
                        ViewKit.Prim(PrimitiveType.Cube, "Hut", t, new Vector3(x, 0.4f + h / 2f, 0f), new Vector3(1.1f, h, 1.1f), ViewKit.Hex(0xC69C6D));
                        ViewKit.Prim(PrimitiveType.Cube, "HutRoof", t, new Vector3(x, 0.4f + h + 0.1f, 0f), new Vector3(1.3f, 0.2f, 1.3f), ViewKit.Hex(0x8E5B3A));
                        ViewKit.Prim(PrimitiveType.Cylinder, "Stilt", t, new Vector3(x, 0.2f, 0f), new Vector3(0.12f, 0.2f, 0.12f), ViewKit.Hex(0x6B4A2E), collider: false);
                    }
                    return 0.4f + h + 0.2f;
                }
            }
        }

        // A construction site: a dirt pad, corner cones and a sign post.
        static float BuildSite(Transform t)
        {
            ViewKit.Prim(PrimitiveType.Cube, "Pad", t, new Vector3(0f, 0.04f, 0f), new Vector3(2.6f, 0.08f, 2.0f), ViewKit.Hex(0xA0805A));
            foreach (var x in new[] { -1.15f, 1.15f })
                foreach (var z in new[] { -0.85f, 0.85f })
                    ViewKit.Prim(PrimitiveType.Cylinder, "Cone", t, new Vector3(x, 0.25f, z), new Vector3(0.18f, 0.2f, 0.18f), ViewKit.Hex(0xF39C12), collider: false);
            ViewKit.Prim(PrimitiveType.Cube, "SignPost", t, new Vector3(0f, 0.5f, 0.6f), new Vector3(0.08f, 1.0f, 0.08f), ViewKit.Hex(0x6B4A2E), collider: false);
            ViewKit.Prim(PrimitiveType.Cube, "Sign", t, new Vector3(0f, 0.95f, 0.6f), new Vector3(0.9f, 0.45f, 0.06f), ViewKit.Hex(0xF5E6C8), collider: false);
            return 1.2f;
        }

        // --- terrain -------------------------------------------------------------

        static void BuildTerrain(Transform t)
        {
            var c = IslandCenter;
            ViewKit.Prim(PrimitiveType.Plane, "Ocean", t, Vector3.zero, new Vector3(30f, 1f, 30f), ViewKit.Hex(0x1F7FA6));
            ViewKit.Prim(PrimitiveType.Cylinder, "Lagoon", t, c + new Vector3(0f, 0.01f, 0f),
                new Vector3(17.5f, 0.01f, 15f), ViewKit.Hex(0x5CC6CF), collider: false);
            ViewKit.Prim(PrimitiveType.Cylinder, "Sand", t, c + new Vector3(0f, 0.2f, 0f),
                new Vector3(14f, 0.25f, 12f), ViewKit.Hex(0xEED9A4), collider: false);
            ViewKit.Prim(PrimitiveType.Cylinder, "Grass", t, c + new Vector3(0f, 0.25f, 0f),
                new Vector3(11.2f, 0.28f, 9.6f), ViewKit.Hex(0x7FBF5A), collider: false);
            ViewKit.Prim(PrimitiveType.Cube, "Dock", t, new Vector3(-1.2f, 0.38f, -3.1f),
                new Vector3(1.2f, 0.14f, 2f), ViewKit.Hex(0x8B5A33), collider: false);

            foreach (var p in new[] { new Vector3(4.9f, 0f, 3.4f), new Vector3(-7.3f, 0f, 3.6f),
                         new Vector3(1.4f, 0f, 8.6f), new Vector3(-4.4f, 0f, 8.3f) })
            {
                var palm = new GameObject("Palm").transform;
                palm.SetParent(t, false);
                palm.localPosition = p + new Vector3(0f, GroundY, 0f);
                ViewKit.Prim(PrimitiveType.Cylinder, "Trunk", palm, new Vector3(0f, 1f, 0f),
                    new Vector3(0.18f, 1f, 0.18f), ViewKit.Hex(0x8B6B45), collider: false);
                ViewKit.Prim(PrimitiveType.Sphere, "Crown", palm, new Vector3(0f, 2.1f, 0f),
                    new Vector3(1.5f, 0.45f, 1.5f), ViewKit.Hex(0x3E8E5A), collider: false);
            }
        }
    }
}
