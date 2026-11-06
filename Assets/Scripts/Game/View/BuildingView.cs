using System.Collections.Generic;
using ResortEmpire.Game.Ui;
using ResortEmpire.Sim;
using UnityEngine;

namespace ResortEmpire.Game.View
{
    // One building spot. The player must read three things at a glance (build doc AC2d):
    // seat count (pips in front), staffing (worker marker above the roof) and the waiting line.
    // While locked the spot shows a construction site, marked when it can be bought.
    sealed class BuildingView
    {
        const int MaxVisibleQueue = 12;
        const float PipSpacing = 0.32f;

        static readonly Color PipEmpty = ViewKit.Hex(0xF2EEE6);
        static readonly Color WorkerColor = ViewKit.Hex(0xE8743B);
        static readonly Color RingBottleneck = ViewKit.Hex(0xC0392B);
        static readonly Color RingRecovering = ViewKit.Hex(0xE3B23C);
        static readonly Color SiteMarkerLocked = ViewKit.Hex(0x9A9A93);
        static readonly Color SiteMarkerAvailable = ViewKit.Hex(0xE8743B);
        static readonly Vector3 GuestScale = new Vector3(0.28f, 0.32f, 0.28f);

        public readonly BuildingId Id;
        public readonly NeedId Need;

        readonly Transform _root;
        readonly Transform _body;
        readonly GameObject _built;
        readonly GameObject _site;
        readonly Transform _siteMarker;
        readonly Renderer _siteMarkerRenderer;
        readonly Transform _worker;
        readonly Transform _ring;
        readonly Renderer _ringRenderer;
        readonly Transform _pipRow;
        readonly List<Renderer> _pips = new List<Renderer>();
        readonly List<GameObject> _queue = new List<GameObject>();
        readonly Material _guestMat;
        readonly float _roofY;
        readonly float _frontZ;
        readonly float _ringDiameter;
        readonly float _side;          // +1: queue extends right of the seats, -1: left
        readonly float _bobPhase;
        int _shownLevel = -1;
        float _levelScale = 1f;

        public BuildingView(Transform parent, BuildingId id, Vector3 position, float queueSide)
        {
            Id = id;
            Need = BuildingNeeds.Serves(id);
            _side = queueSide;
            _bobPhase = (int)id * 1.3f;
            _guestMat = ViewKit.Mat(UiFactory.NeedColor(Need));

            _root = new GameObject(GameController.DisplayName(id)).transform;
            _root.SetParent(parent, false);
            _root.localPosition = position;

            _built = new GameObject("Built");
            _built.transform.SetParent(_root, false);
            _body = new GameObject("Body").transform;
            _body.SetParent(_built.transform, false);
            _roofY = BuildBody(id, _body, out _frontZ, out _ringDiameter);

            _pipRow = new GameObject("Seats").transform;
            _pipRow.SetParent(_built.transform, false);

            _worker = ViewKit.Prim(PrimitiveType.Capsule, "Worker", _built.transform,
                Vector3.zero, new Vector3(0.34f, 0.34f, 0.34f), WorkerColor, collider: false).transform;

            _ring = ViewKit.Prim(PrimitiveType.Cylinder, "StatusRing", _built.transform,
                new Vector3(0f, 0.02f, 0f), new Vector3(_ringDiameter, 0.01f, _ringDiameter), RingBottleneck,
                collider: false).transform;
            _ringRenderer = _ring.GetComponent<Renderer>();
            _ring.gameObject.SetActive(false);

            _site = new GameObject("ConstructionSite");
            _site.transform.SetParent(_root, false);
            ViewKit.Prim(PrimitiveType.Cube, "Slab", _site.transform, new Vector3(0f, 0.05f, 0f),
                new Vector3(3f, 0.1f, 2.4f), ViewKit.Hex(0xB9B4A8));
            for (int i = 0; i < 4; i++)
            {
                float x = i % 2 == 0 ? -1.4f : 1.4f;
                float z = i < 2 ? -1.1f : 1.1f;
                ViewKit.Prim(PrimitiveType.Cylinder, "Post", _site.transform, new Vector3(x, 0.5f, z),
                    new Vector3(0.12f, 0.5f, 0.12f), ViewKit.Hex(0x6B4A2E));
            }
            _siteMarker = ViewKit.Prim(PrimitiveType.Sphere, "Marker", _site.transform, new Vector3(0f, 1.5f, 0f),
                new Vector3(0.45f, 0.45f, 0.45f), SiteMarkerLocked).transform;
            _siteMarkerRenderer = _siteMarker.GetComponent<Renderer>();
        }

        public Vector3 EntranceWorld => _root.TransformPoint(new Vector3(0f, 0.32f, _pipRow.localPosition.z));

        public Vector3 QueueSlotWorld(int index)
        {
            float half = (_pips.Count - 1) * 0.5f * PipSpacing;
            var origin = new Vector3(_side * (half + 0.55f), 0.32f, _pipRow.localPosition.z - 0.05f);
            var slot = origin + new Vector3(_side * (index % 2) * 0.4f, 0f, -(index / 2) * 0.42f);
            return _root.TransformPoint(slot);
        }

        public void Sync(BuildingState state, TuningConfig tuning, bool siteAvailable, int seated,
            int queueShown, NeedStatus status, bool showStatus, float time)
        {
            bool built = state != null;
            if (_built.activeSelf != built) _built.SetActive(built);
            if (_site.activeSelf == built) _site.SetActive(!built);

            if (!built)
            {
                _siteMarkerRenderer.sharedMaterial = ViewKit.Mat(siteAvailable ? SiteMarkerAvailable : SiteMarkerLocked);
                float lift = siteAvailable ? Mathf.Sin(time * 3f) * 0.12f : 0f;
                _siteMarker.localPosition = new Vector3(0f, 1.5f + lift, 0f);
                return;
            }

            if (state.Level != _shownLevel) ApplyLevel(state.Level, tuning);

            _worker.gameObject.SetActive(state.HasWorker);
            if (state.HasWorker)
                _worker.localPosition = new Vector3(0f,
                    _roofY * _levelScale + 0.55f + Mathf.Sin(time * 2.4f + _bobPhase) * 0.08f, 0f);

            for (int i = 0; i < _pips.Count; i++)
                _pips[i].sharedMaterial = i < seated ? _guestMat : ViewKit.Mat(PipEmpty);

            SetQueue(queueShown);
            SetRing(showStatus ? status : NeedStatus.Ok, time);
        }

        // Each level makes the building a little bigger and gives it the seats that level holds.
        void ApplyLevel(int level, TuningConfig tuning)
        {
            _shownLevel = level;
            _levelScale = 1f + 0.1f * (level - 1);
            _body.localScale = Vector3.one * _levelScale;

            int capacity = tuning.CapacityPerLevel[Mathf.Clamp(level, 1, tuning.CapacityPerLevel.Length) - 1];
            foreach (var pip in _pips) Object.Destroy(pip.gameObject);
            _pips.Clear();
            _pipRow.localPosition = new Vector3(0f, 0.08f, _frontZ * _levelScale - 0.15f);
            for (int i = 0; i < capacity; i++)
            {
                float x = (i - (capacity - 1) * 0.5f) * PipSpacing;
                var pip = ViewKit.Prim(PrimitiveType.Cube, "Seat", _pipRow, new Vector3(x, 0f, 0f),
                    new Vector3(0.22f, 0.12f, 0.22f), PipEmpty, collider: false);
                _pips.Add(pip.GetComponent<Renderer>());
            }
            // Queue slots hang off the seat row, so already-placed guests must follow its new width.
            for (int i = 0; i < _queue.Count; i++) _queue[i].transform.position = QueueSlotWorld(i);
        }

        void SetQueue(int count)
        {
            int visible = Mathf.Min(count, MaxVisibleQueue);
            while (_queue.Count < visible)
            {
                var guest = ViewKit.Prim(PrimitiveType.Capsule, "Waiting", _root, Vector3.zero, GuestScale,
                    UiFactory.NeedColor(Need), collider: false);
                guest.transform.position = QueueSlotWorld(_queue.Count);
                _queue.Add(guest);
            }
            for (int i = 0; i < _queue.Count; i++)
            {
                bool on = i < visible;
                if (_queue[i].activeSelf != on) _queue[i].SetActive(on);
            }
            // A longer line than we draw is shown as a bigger last guest, never as a number.
            if (visible > 0)
                _queue[visible - 1].transform.localScale = count > MaxVisibleQueue ? GuestScale * 1.35f : GuestScale;
        }

        void SetRing(NeedStatus status, float time)
        {
            bool bottleneck = status == NeedStatus.Bottleneck;
            bool recovering = status == NeedStatus.Recovering;
            bool on = bottleneck || recovering;
            if (_ring.gameObject.activeSelf != on) _ring.gameObject.SetActive(on);
            if (!on) return;

            _ringRenderer.sharedMaterial = ViewKit.Mat(bottleneck ? RingBottleneck : RingRecovering);
            float d = _ringDiameter * _levelScale * (bottleneck ? 1f + Mathf.Sin(time * 6f) * 0.05f : 1f);
            _ring.localScale = new Vector3(d, 0.01f, d);
        }

        // Distinct silhouettes from primitives (build doc "what buildings communicate"). Front faces -z.
        static float BuildBody(BuildingId id, Transform body, out float frontZ, out float ringDiameter)
        {
            var dark = ViewKit.Hex(0x3B3A36);
            var wood = ViewKit.Hex(0x6B4A2E);
            var glass = ViewKit.Hex(0x9FD3E8);
            var straw = ViewKit.Hex(0xD9B26A);
            switch (id)
            {
                case BuildingId.Reception:
                    ViewKit.Prim(PrimitiveType.Cube, "Block", body, new Vector3(0f, 1.5f, 0f), new Vector3(2.2f, 3f, 1.8f), ViewKit.Hex(0xF1E6CC));
                    ViewKit.Prim(PrimitiveType.Cube, "Roof", body, new Vector3(0f, 3.11f, 0f), new Vector3(2.5f, 0.22f, 2.1f), dark);
                    ViewKit.Prim(PrimitiveType.Cube, "Door", body, new Vector3(0f, 0.45f, -0.92f), new Vector3(0.6f, 0.9f, 0.05f), wood, collider: false);
                    foreach (float y in new[] { 1.45f, 2.35f })
                        foreach (float x in new[] { -0.65f, 0f, 0.65f })
                            ViewKit.Prim(PrimitiveType.Cube, "Window", body, new Vector3(x, y, -0.92f), new Vector3(0.38f, 0.38f, 0.05f), glass, collider: false);
                    frontZ = -1.25f; ringDiameter = 3.6f;
                    return 3.22f;

                case BuildingId.Restaurant:
                    ViewKit.Prim(PrimitiveType.Cube, "Hall", body, new Vector3(0f, 0.7f, 0f), new Vector3(3f, 1.4f, 2f), ViewKit.Hex(0xE8975A));
                    ViewKit.Prim(PrimitiveType.Cube, "Roof", body, new Vector3(0f, 1.49f, 0f), new Vector3(3.4f, 0.18f, 2.4f), ViewKit.Hex(0xFAF6EE));
                    ViewKit.Prim(PrimitiveType.Cube, "Awning", body, new Vector3(0f, 1.2f, -1.15f), new Vector3(3f, 0.12f, 0.4f), ViewKit.Hex(0xC0392B), collider: false);
                    ViewKit.Prim(PrimitiveType.Cube, "Door", body, new Vector3(0f, 0.45f, -1.02f), new Vector3(0.7f, 0.9f, 0.05f), wood, collider: false);
                    frontZ = -1.45f; ringDiameter = 4.2f;
                    return 1.58f;

                case BuildingId.BeachBar:
                    ViewKit.Prim(PrimitiveType.Cube, "Counter", body, new Vector3(0f, 0.45f, 0f), new Vector3(1.8f, 0.9f, 1f), ViewKit.Hex(0xF2C94C));
                    ViewKit.Prim(PrimitiveType.Cube, "CounterTop", body, new Vector3(0f, 0.94f, 0f), new Vector3(2f, 0.08f, 1.2f), straw);
                    ViewKit.Prim(PrimitiveType.Cylinder, "Pole", body, new Vector3(0f, 1.5f, 0.3f), new Vector3(0.12f, 0.55f, 0.12f), wood);
                    ViewKit.Prim(PrimitiveType.Cylinder, "Roof", body, new Vector3(0f, 2.08f, 0.1f), new Vector3(2.4f, 0.06f, 2.4f), straw, collider: false);
                    frontZ = -0.9f; ringDiameter = 3f;
                    return 2.12f;

                case BuildingId.Pool:
                    ViewKit.Prim(PrimitiveType.Cube, "Deck", body, new Vector3(0f, 0.1f, 0f), new Vector3(3.2f, 0.2f, 2.4f), ViewKit.Hex(0xFAF6EE));
                    ViewKit.Prim(PrimitiveType.Cube, "Water", body, new Vector3(0f, 0.21f, 0.1f), new Vector3(2.5f, 0.06f, 1.6f), ViewKit.Hex(0x6FD3F0), collider: false);
                    ViewKit.Prim(PrimitiveType.Cube, "Lounger", body, new Vector3(-1.42f, 0.26f, 0f), new Vector3(0.3f, 0.12f, 0.9f), ViewKit.Hex(0xE3B23C), collider: false);
                    ViewKit.Prim(PrimitiveType.Cube, "Lounger", body, new Vector3(1.42f, 0.26f, 0f), new Vector3(0.3f, 0.12f, 0.9f), ViewKit.Hex(0xE3B23C), collider: false);
                    frontZ = -1.55f; ringDiameter = 4f;
                    return 0.3f;

                default: // Bungalows: several small huts, so it never reads as one hotel block like Reception
                    var hutXs = new[] { -1.2f, 0f, 1.2f };
                    var hutZs = new[] { 0.3f, -0.2f, 0.3f };
                    for (int i = 0; i < 3; i++)
                    {
                        ViewKit.Prim(PrimitiveType.Cube, "Hut", body, new Vector3(hutXs[i], 0.4f, hutZs[i]), new Vector3(0.9f, 0.8f, 0.9f), ViewKit.Hex(0x9A6B43));
                        ViewKit.Prim(PrimitiveType.Cube, "HutRoof", body, new Vector3(hutXs[i], 0.86f, hutZs[i]), new Vector3(1.1f, 0.12f, 1.1f), dark);
                    }
                    frontZ = -1.05f; ringDiameter = 4.4f;
                    return 0.92f;
            }
        }
    }
}
