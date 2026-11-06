using System.Collections.Generic;
using ResortEmpire.Game.Ui;
using ResortEmpire.Sim;
using UnityEngine;

namespace ResortEmpire.Game.View
{
    // One building spot, placed and shaped like the web version's (ResortWorld3D.tsx), in island units.
    // The player must read three things at a glance (build doc AC2d): seat count (pips toward the arriving
    // guests), staffing (worker marker above the roof) and the waiting line. While locked the plot shows a
    // construction site, marked when it can be bought.
    sealed class BuildingView
    {
        const int MaxVisibleQueue = 12;
        const int LineWidth = 3;           // waiting guests stand in rows of three
        const float PipSpacing = 0.1f;
        const float BlockoutScale = 0.3f;  // the blockout shapes that still stand in for the web's props

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
        readonly Transform _line;
        readonly List<GameObject> _queue = new List<GameObject>();
        readonly Material _guestMat;
        readonly float _roofY;
        readonly float _footprint;         // radius of the building on the ground
        readonly Vector3 _entrance;        // where served guests leave from
        readonly Vector3 _lineDirection;   // from the building toward the path its guests arrive by
        readonly Vector3 _guestScale;      // waiting figures stand at full guest size
        readonly float _guestSpacing;
        readonly float _bobPhase;
        int _shownLevel = -1;
        float _levelScale = 1f;

        public BuildingView(Transform parent, BuildingId id, IslandPaths.Site site, Vector3 approach, float guestSize)
        {
            Id = id;
            Need = BuildingNeeds.Serves(id);
            _bobPhase = (int)id * 1.3f;
            _guestMat = ViewKit.Mat(UiFactory.NeedColor(Need));
            _guestScale = GuestScale * guestSize;
            _guestSpacing = _guestScale.x * 1.25f;
            _entrance = site.Entrance + Vector3.up * _guestScale.y;

            // A building stands on its plot and faces its entrance (+z), as the web's compact buildings do.
            _root = new GameObject(GameController.DisplayName(id)).transform;
            _root.SetParent(parent, false);
            _root.localPosition = site.Center;
            _root.localRotation = Quaternion.LookRotation(Flat(site.Entrance - site.Center, Vector3.forward));
            _root.gameObject.AddComponent<BuildingTag>().Id = id;
            _line = new GameObject(GameController.DisplayName(id) + " Line").transform;
            _line.SetParent(parent, false);
            _lineDirection = Flat(approach - site.Center, _root.forward);

            _built = new GameObject("Built");
            _built.transform.SetParent(_root, false);
            _body = new GameObject("Body").transform;
            _body.SetParent(_built.transform, false);
            _roofY = BuildBody(id, _body, out _footprint);

            // At island scale the parts are small to hit with a finger, so one box around the plot takes the taps.
            var tapArea = _root.gameObject.AddComponent<BoxCollider>();
            tapArea.center = new Vector3(0f, 0.3f, 0f);
            tapArea.size = new Vector3(_footprint * 2.2f, 0.6f, _footprint * 2.2f);

            // The seats sit on the ground between the building and its line.
            var lineLocal = _root.InverseTransformDirection(_lineDirection);
            _pipRow = new GameObject("Seats").transform;
            _pipRow.SetParent(_built.transform, false);
            _pipRow.localPosition = lineLocal * (_footprint + 0.06f) + Vector3.up * 0.02f;
            _pipRow.localRotation = Quaternion.LookRotation(lineLocal);

            _worker = ViewKit.Prim(PrimitiveType.Capsule, "Worker", _built.transform,
                Vector3.zero, Vector3.one * 0.12f, WorkerColor, collider: false).transform;

            _ring = ViewKit.Prim(PrimitiveType.Cylinder, "StatusRing", _built.transform,
                new Vector3(0f, 0.006f, 0f), new Vector3(_footprint * 2f, 0.003f, _footprint * 2f), RingBottleneck,
                collider: false).transform;
            _ringRenderer = _ring.GetComponent<Renderer>();
            _ring.gameObject.SetActive(false);

            _site = new GameObject("ConstructionSite");
            _site.transform.SetParent(_root, false);
            ViewKit.Prim(PrimitiveType.Cube, "Slab", _site.transform, new Vector3(0f, 0.015f, 0f),
                new Vector3(0.9f, 0.03f, 0.72f), ViewKit.Hex(0xB9B4A8));
            for (int i = 0; i < 4; i++)
            {
                float x = i % 2 == 0 ? -0.42f : 0.42f;
                float z = i < 2 ? -0.33f : 0.33f;
                ViewKit.Prim(PrimitiveType.Cylinder, "Post", _site.transform, new Vector3(x, 0.15f, z),
                    new Vector3(0.036f, 0.15f, 0.036f), ViewKit.Hex(0x6B4A2E));
            }
            _siteMarker = ViewKit.Prim(PrimitiveType.Sphere, "Marker", _site.transform, new Vector3(0f, 0.45f, 0f),
                Vector3.one * 0.135f, SiteMarkerLocked).transform;
            _siteMarkerRenderer = _siteMarker.GetComponent<Renderer>();
        }

        public Vector3 EntranceWorld => _entrance;

        // Waiting guests stand in rows of three from behind the seats toward the path they came by.
        public Vector3 QueueSlotWorld(int index)
        {
            int row = index / LineWidth, column = index % LineWidth;
            float start = _footprint + 0.2f;
            var across = new Vector3(_lineDirection.z, 0f, -_lineDirection.x);
            return _root.position + _lineDirection * (start + row * _guestSpacing)
                + across * ((column - (LineWidth - 1) * 0.5f) * _guestSpacing) + Vector3.up * _guestScale.y;
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
                float lift = siteAvailable ? Mathf.Sin(time * 3f) * 0.036f : 0f;
                _siteMarker.localPosition = new Vector3(0f, 0.45f + lift, 0f);
                return;
            }

            if (state.Level != _shownLevel) ApplyLevel(state.Level, tuning);

            _worker.gameObject.SetActive(state.HasWorker);
            if (state.HasWorker)
                _worker.localPosition = new Vector3(0f,
                    _roofY * _levelScale + 0.2f + Mathf.Sin(time * 2.4f + _bobPhase) * 0.03f, 0f);

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
            for (int i = 0; i < capacity; i++)
            {
                float x = (i - (capacity - 1) * 0.5f) * PipSpacing;
                var pip = ViewKit.Prim(PrimitiveType.Cube, "Seat", _pipRow, new Vector3(x, 0f, 0f),
                    new Vector3(0.066f, 0.036f, 0.066f), PipEmpty, collider: false);
                _pips.Add(pip.GetComponent<Renderer>());
            }
        }

        void SetQueue(int count)
        {
            int visible = Mathf.Min(count, MaxVisibleQueue);
            while (_queue.Count < visible)
            {
                var guest = ViewKit.Prim(PrimitiveType.Capsule, "Waiting", _line, Vector3.zero, _guestScale,
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
                _queue[visible - 1].transform.localScale = count > MaxVisibleQueue ? _guestScale * 1.35f : _guestScale;
        }

        void SetRing(NeedStatus status, float time)
        {
            bool bottleneck = status == NeedStatus.Bottleneck;
            bool recovering = status == NeedStatus.Recovering;
            bool on = bottleneck || recovering;
            if (_ring.gameObject.activeSelf != on) _ring.gameObject.SetActive(on);
            if (!on) return;

            _ringRenderer.sharedMaterial = ViewKit.Mat(bottleneck ? RingBottleneck : RingRecovering);
            float d = _footprint * 2f * (bottleneck ? 1f + Mathf.Sin(time * 6f) * 0.05f : 1f);
            _ring.localScale = new Vector3(d, 0.003f, d);
        }

        static Vector3 Flat(Vector3 v, Vector3 fallback)
        {
            v.y = 0f;
            return v.sqrMagnitude > 0.0025f ? v.normalized : fallback;
        }

        // Returns the roof height; footprint is the building's radius on the ground.
        static float BuildBody(BuildingId id, Transform body, out float footprint)
        {
            switch (id)
            {
                case BuildingId.Restaurant: // the web's restaurant terrace under a canopy
                    footprint = 0.48f;
                    Box(body, 0.92f, 0.11f, 0.66f, 0f, 0.055f, 0f, 0xBD8B5C);
                    Box(body, 0.68f, 0.34f, 0.10f, 0f, 0.23f, -0.24f, 0xE8D1A0);   // low rear wall, counter
                    Box(body, 0.78f, 0.055f, 0.53f, 0f, 0.51f, -0.03f, 0xB85F3E);  // thin canopy
                    foreach (var p in new[] { new Vector2(-0.32f, -0.23f), new Vector2(0.32f, -0.23f),
                                 new Vector2(-0.32f, 0.18f), new Vector2(0.32f, 0.18f) })
                        Box(body, 0.045f, 0.46f, 0.045f, p.x, 0.285f, p.y, 0x815D3F);
                    // Two small tables; x is mirrored from the web, as the island is.
                    Table(body, 0.22f, 0.2f, 0.105f, 0xDDC488);
                    Table(body, -0.22f, 0.2f, 0.105f, 0xE2CD97);
                    return 0.5375f;

                case BuildingId.BeachBar: // the web's small open bar deck
                    footprint = 0.48f;
                    Box(body, 0.70f, 0.10f, 0.58f, 0f, 0.05f, 0f, 0xA9764C);
                    Box(body, 0.48f, 0.25f, 0.12f, 0f, 0.20f, -0.16f, 0xD6B478);   // bar counter
                    Box(body, 0.59f, 0.045f, 0.47f, 0f, 0.49f, -0.02f, 0xD0A75E);  // light roof
                    foreach (var p in new[] { new Vector2(-0.25f, -0.18f), new Vector2(0.25f, -0.18f),
                                 new Vector2(-0.25f, 0.16f), new Vector2(0.25f, 0.16f) })
                        Box(body, 0.035f, 0.44f, 0.035f, p.x, 0.27f, p.y, 0x795A3D);
                    foreach (float x in new[] { -0.14f, 0.14f }) Stool(body, x, 0.13f);
                    return 0.5125f;

                default:
                    var blockout = new GameObject("Blockout").transform;
                    blockout.SetParent(body, false);
                    blockout.localScale = Vector3.one * BlockoutScale;
                    blockout.localRotation = Quaternion.Euler(0f, 180f, 0f); // its front (-z) toward the entrance
                    float roof = BuildBlockout(id, blockout, out float ringDiameter);
                    footprint = ringDiameter * 0.5f * BlockoutScale;
                    return roof * BlockoutScale;
            }
        }

        static void Box(Transform parent, float w, float h, float d, float x, float y, float z, int color)
            => ViewKit.Prim(PrimitiveType.Cube, "Part", parent, new Vector3(x, y, z), new Vector3(w, h, d),
                ViewKit.Hex(color), collider: false);

        // A Unity cylinder is 1 wide and 2 tall.
        static void Cylinder(Transform parent, float radius, float height, float x, float y, float z, int color)
            => ViewKit.Prim(PrimitiveType.Cylinder, "Part", parent, new Vector3(x, y, z),
                new Vector3(radius * 2f, height * 0.5f, radius * 2f), ViewKit.Hex(color), collider: false);

        static void Table(Transform parent, float x, float z, float radius, int color)
        {
            Cylinder(parent, radius, 0.045f, x, 0.15f, z, color);
            Cylinder(parent, 0.027f, 0.14f, x, 0.075f, z, 0x755842);
        }

        static void Stool(Transform parent, float x, float z)
        {
            Cylinder(parent, 0.07f, 0.045f, x, 0.13f, z, 0xD9C280);
            Cylinder(parent, 0.02f, 0.13f, x, 0.06f, z, 0x6C513C);
        }

        // Distinct silhouettes from primitives (build doc "what buildings communicate"). Front faces -z.
        static float BuildBlockout(BuildingId id, Transform body, out float ringDiameter)
        {
            var dark = ViewKit.Hex(0x3B3A36);
            var wood = ViewKit.Hex(0x6B4A2E);
            var glass = ViewKit.Hex(0x9FD3E8);
            switch (id)
            {
                case BuildingId.Reception:
                    ViewKit.Prim(PrimitiveType.Cube, "Block", body, new Vector3(0f, 1.5f, 0f), new Vector3(2.2f, 3f, 1.8f), ViewKit.Hex(0xF1E6CC));
                    ViewKit.Prim(PrimitiveType.Cube, "Roof", body, new Vector3(0f, 3.11f, 0f), new Vector3(2.5f, 0.22f, 2.1f), dark);
                    ViewKit.Prim(PrimitiveType.Cube, "Door", body, new Vector3(0f, 0.45f, -0.92f), new Vector3(0.6f, 0.9f, 0.05f), wood, collider: false);
                    foreach (float y in new[] { 1.45f, 2.35f })
                        foreach (float x in new[] { -0.65f, 0f, 0.65f })
                            ViewKit.Prim(PrimitiveType.Cube, "Window", body, new Vector3(x, y, -0.92f), new Vector3(0.38f, 0.38f, 0.05f), glass, collider: false);
                    ringDiameter = 3.6f;
                    return 3.22f;

                case BuildingId.Pool:
                    ViewKit.Prim(PrimitiveType.Cube, "Deck", body, new Vector3(0f, 0.1f, 0f), new Vector3(3.2f, 0.2f, 2.4f), ViewKit.Hex(0xFAF6EE));
                    ViewKit.Prim(PrimitiveType.Cube, "Water", body, new Vector3(0f, 0.21f, 0.1f), new Vector3(2.5f, 0.06f, 1.6f), ViewKit.Hex(0x6FD3F0), collider: false);
                    ViewKit.Prim(PrimitiveType.Cube, "Lounger", body, new Vector3(-1.42f, 0.26f, 0f), new Vector3(0.3f, 0.12f, 0.9f), ViewKit.Hex(0xE3B23C), collider: false);
                    ViewKit.Prim(PrimitiveType.Cube, "Lounger", body, new Vector3(1.42f, 0.26f, 0f), new Vector3(0.3f, 0.12f, 0.9f), ViewKit.Hex(0xE3B23C), collider: false);
                    ringDiameter = 4f;
                    return 0.3f;

                default: // Bungalows: several small huts, so it never reads as one hotel block like Reception
                    var hutXs = new[] { -1.2f, 0f, 1.2f };
                    var hutZs = new[] { 0.3f, -0.2f, 0.3f };
                    for (int i = 0; i < 3; i++)
                    {
                        ViewKit.Prim(PrimitiveType.Cube, "Hut", body, new Vector3(hutXs[i], 0.4f, hutZs[i]), new Vector3(0.9f, 0.8f, 0.9f), ViewKit.Hex(0x9A6B43));
                        ViewKit.Prim(PrimitiveType.Cube, "HutRoof", body, new Vector3(hutXs[i], 0.86f, hutZs[i]), new Vector3(1.1f, 0.12f, 1.1f), dark);
                    }
                    ringDiameter = 4.4f;
                    return 0.92f;
            }
        }
    }
}
