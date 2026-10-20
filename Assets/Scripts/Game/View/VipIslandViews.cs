using System.Collections.Generic;
using ResortEmpire.Sim;
using UnityEngine;

namespace ResortEmpire.Game.View
{
    // The Spa (VIP building, Build §5.4): a construction site until unlocked, then a calm low pavilion
    // with a lilac roof and two small round pools. No seats, no queue, no worker markers — it plays no
    // part in waves. Placed at the back right, behind the Pool: the front-right spot near (1.3, -0.6)
    // overlaps the Bungalows' queue and the dock-to-Bungalows/Pool walking lines.
    sealed class SpaView
    {
        public static readonly Vector3 Position = new Vector3(2.6f, 0.53f, 7.8f);
        public const float ClearRadius = 1.7f;   // beach spots inside this radius are not used by strollers

        static readonly Color SiteMarkerLocked = ViewKit.Hex(0x9A9A93);
        static readonly Color SiteMarkerAvailable = ViewKit.Hex(0xE8743B);

        readonly GameObject _root;
        readonly GameObject _built;
        readonly GameObject _site;
        readonly Transform _marker;
        readonly Renderer _markerRenderer;

        public SpaView(Transform parent)
        {
            _root = new GameObject("Spa");
            _root.transform.SetParent(parent, false);
            _root.transform.localPosition = Position;
            _root.AddComponent<BuildingTag>().Id = BuildingId.Spa;

            _built = new GameObject("Built");
            _built.transform.SetParent(_root.transform, false);
            var b = _built.transform;
            var white = ViewKit.Hex(0xF7F3EC);
            var lilac = ViewKit.Hex(0xC3A6E8);
            ViewKit.Prim(PrimitiveType.Cube, "Plinth", b, new Vector3(0f, -0.02f, 0f), new Vector3(2.5f, 0.2f, 1.3f), ViewKit.Hex(0xEDE7DA));
            ViewKit.Prim(PrimitiveType.Cube, "Pavilion", b, new Vector3(-0.5f, 0.38f, 0.1f), new Vector3(1.3f, 0.6f, 0.9f), white);
            ViewKit.Prim(PrimitiveType.Cube, "Roof", b, new Vector3(-0.5f, 0.74f, 0.1f), new Vector3(1.55f, 0.12f, 1.1f), lilac, collider: false);
            ViewKit.Prim(PrimitiveType.Cube, "RoofTop", b, new Vector3(-0.5f, 0.85f, 0.1f), new Vector3(0.95f, 0.1f, 0.6f), lilac, collider: false);
            ViewKit.Prim(PrimitiveType.Cube, "Door", b, new Vector3(-0.5f, 0.28f, -0.36f), new Vector3(0.36f, 0.42f, 0.04f), ViewKit.Hex(0xB89BD8), collider: false);
            foreach (var p in new[] { new Vector3(0.6f, 0f, -0.25f), new Vector3(0.82f, 0f, 0.32f) })
            {
                ViewKit.Prim(PrimitiveType.Cylinder, "PoolRim", b, p + new Vector3(0f, 0.1f, 0f), new Vector3(0.62f, 0.04f, 0.62f), white, collider: false);
                ViewKit.Prim(PrimitiveType.Cylinder, "PoolWater", b, p + new Vector3(0f, 0.13f, 0f), new Vector3(0.5f, 0.02f, 0.5f), ViewKit.Hex(0x8FE3E0), collider: false);
            }

            _site = new GameObject("ConstructionSite");
            _site.transform.SetParent(_root.transform, false);
            ViewKit.Prim(PrimitiveType.Cube, "Slab", _site.transform, new Vector3(0f, 0.05f, 0f), new Vector3(2.4f, 0.1f, 1.4f), ViewKit.Hex(0xB9B4A8));
            for (int i = 0; i < 4; i++)
            {
                float x = i % 2 == 0 ? -1.1f : 1.1f;
                float z = i < 2 ? -0.6f : 0.6f;
                ViewKit.Prim(PrimitiveType.Cylinder, "Post", _site.transform, new Vector3(x, 0.5f, z),
                    new Vector3(0.12f, 0.5f, 0.12f), ViewKit.Hex(0x6B4A2E));
            }
            _marker = ViewKit.Prim(PrimitiveType.Sphere, "Marker", _site.transform, new Vector3(0f, 1.5f, 0f),
                new Vector3(0.45f, 0.45f, 0.45f), SiteMarkerLocked).transform;
            _markerRenderer = _marker.GetComponent<Renderer>();
        }

        // offered: the Spa exists in this rule set (MVP systems); built / available as in ResortState.
        public void Sync(bool offered, bool built, bool available, float time)
        {
            bool show = offered || built;
            if (_root.activeSelf != show) _root.SetActive(show);
            if (!show) return;
            if (_built.activeSelf != built) _built.SetActive(built);
            if (_site.activeSelf == built) _site.SetActive(!built);
            if (built) return;
            _markerRenderer.sharedMaterial = ViewKit.Mat(available ? SiteMarkerAvailable : SiteMarkerLocked);
            float lift = available ? Mathf.Sin(time * 3f) * 0.12f : 0f;
            _marker.localPosition = new Vector3(0f, 1.5f + lift, 0f);
        }
    }

    // P17 decor won at Perfect VIP stays, each at a fixed spot chosen off the guests' walking lines.
    // Appears with a short grow-in when won during the session.
    sealed class DecorView
    {
        public static readonly Vector3 FountainSpot = new Vector3(-1.2f, 0.54f, 3.0f);   // plaza center

        sealed class Item
        {
            public string Id;
            public Transform Root;
            public float Age = -1f;
        }

        const float GrowSeconds = 0.6f;
        readonly List<Item> _items = new List<Item>();
        bool _first = true;

        public DecorView(Transform parent)
        {
            _items.Add(new Item { Id = "golden_palm", Root = GoldenPalm(parent, new Vector3(5.3f, 0.53f, 2.5f)) });
            _items.Add(new Item { Id = "flower_arch", Root = FlowerArch(parent, new Vector3(-1.2f, 0.45f, -1.55f)) });
            _items.Add(new Item { Id = "marble_fountain", Root = Fountain(parent, FountainSpot) });
            _items.Add(new Item { Id = "neon_flamingo", Root = Flamingo(parent, new Vector3(3.7f, 0.02f, -1.9f)) });
        }

        public void Sync(IReadOnlyList<string> owned, float dt)
        {
            foreach (var item in _items)
            {
                bool on = false;
                for (int i = 0; i < owned.Count; i++) if (owned[i] == item.Id) on = true;
                if (item.Root.gameObject.activeSelf != on)
                {
                    item.Root.gameObject.SetActive(on);
                    item.Age = on && !_first ? 0f : -1f;
                }
                if (!on) continue;
                if (item.Age >= 0f)
                {
                    item.Age += dt;
                    float k = Mathf.Clamp01(item.Age / GrowSeconds);
                    item.Root.localScale = Vector3.one * Mathf.Lerp(0.1f, 1f, 1f - (1f - k) * (1f - k));
                    if (k >= 1f) item.Age = -1f;
                }
                else item.Root.localScale = Vector3.one;
            }
            _first = false;
        }

        static Transform Root(Transform parent, string name, Vector3 position)
        {
            var t = new GameObject(name).transform;
            t.SetParent(parent, false);
            t.localPosition = position;
            t.gameObject.SetActive(false);
            return t;
        }

        static Transform GoldenPalm(Transform parent, Vector3 p)
        {
            var t = Root(parent, "GoldenPalm", p);
            ViewKit.Prim(PrimitiveType.Cylinder, "Trunk", t, new Vector3(0f, 1f, 0f), new Vector3(0.18f, 1f, 0.18f), ViewKit.Hex(0xC9A227), collider: false);
            ViewKit.Prim(PrimitiveType.Sphere, "Crown", t, new Vector3(0f, 2.1f, 0f), new Vector3(1.5f, 0.45f, 1.5f), ViewKit.Hex(0xF2C94C), collider: false);
            ViewKit.Prim(PrimitiveType.Sphere, "Coconut", t, new Vector3(0.15f, 1.9f, -0.1f), new Vector3(0.2f, 0.2f, 0.2f), ViewKit.Hex(0xE3B23C), collider: false);
            return t;
        }

        // Spans the walkway from the dock; every arrival line passes between or beside its posts.
        static Transform FlowerArch(Transform parent, Vector3 p)
        {
            var t = Root(parent, "FlowerArch", p);
            var post = ViewKit.Hex(0xF7F3EC);
            var pink = ViewKit.Hex(0xF29BC2);
            foreach (float x in new[] { -1.05f, 1.05f })
                ViewKit.Prim(PrimitiveType.Cylinder, "Post", t, new Vector3(x, 0.7f, 0f), new Vector3(0.1f, 0.7f, 0.1f), post, collider: false);
            ViewKit.Prim(PrimitiveType.Cube, "Beam", t, new Vector3(0f, 1.42f, 0f), new Vector3(2.3f, 0.1f, 0.14f), post, collider: false);
            for (int i = 0; i < 7; i++)
                ViewKit.Prim(PrimitiveType.Sphere, "Flower", t, new Vector3(-1.05f + i * 0.35f, 1.5f, -0.02f),
                    new Vector3(0.24f, 0.2f, 0.24f), i % 2 == 0 ? pink : ViewKit.Hex(0xFFD1E3), collider: false);
            return t;
        }

        static Transform Fountain(Transform parent, Vector3 p)
        {
            var t = Root(parent, "MarbleFountain", p);
            var marble = ViewKit.Hex(0xEEEAE4);
            ViewKit.Prim(PrimitiveType.Cylinder, "Basin", t, new Vector3(0f, 0.12f, 0f), new Vector3(0.8f, 0.12f, 0.8f), marble, collider: false);
            ViewKit.Prim(PrimitiveType.Cylinder, "Water", t, new Vector3(0f, 0.25f, 0f), new Vector3(0.66f, 0.02f, 0.66f), ViewKit.Hex(0x8FD6EA), collider: false);
            ViewKit.Prim(PrimitiveType.Cylinder, "Column", t, new Vector3(0f, 0.45f, 0f), new Vector3(0.12f, 0.3f, 0.12f), marble, collider: false);
            ViewKit.Prim(PrimitiveType.Cylinder, "Bowl", t, new Vector3(0f, 0.76f, 0f), new Vector3(0.36f, 0.05f, 0.36f), marble, collider: false);
            ViewKit.Prim(PrimitiveType.Sphere, "Spout", t, new Vector3(0f, 0.86f, 0f), new Vector3(0.14f, 0.18f, 0.14f), ViewKit.Hex(0xBFE9F5), collider: false);
            return t;
        }

        // Stands in the shallow lagoon right of the Bungalows' line, clear of the boat route.
        static Transform Flamingo(Transform parent, Vector3 p)
        {
            var t = Root(parent, "NeonFlamingo", p);
            var pink = ViewKit.Hex(0xFF5FA2);
            foreach (float x in new[] { -0.05f, 0.05f })
                ViewKit.Prim(PrimitiveType.Cylinder, "Leg", t, new Vector3(x, 0.25f, 0f), new Vector3(0.03f, 0.25f, 0.03f), pink, collider: false);
            ViewKit.Prim(PrimitiveType.Sphere, "Body", t, new Vector3(0f, 0.6f, 0f), new Vector3(0.42f, 0.26f, 0.24f), pink, collider: false);
            var neck = ViewKit.Prim(PrimitiveType.Cylinder, "Neck", t, new Vector3(0.18f, 0.85f, 0f), new Vector3(0.05f, 0.22f, 0.05f), pink, collider: false);
            neck.transform.localEulerAngles = new Vector3(0f, 0f, -15f);
            ViewKit.Prim(PrimitiveType.Sphere, "Head", t, new Vector3(0.24f, 1.08f, 0f), new Vector3(0.12f, 0.12f, 0.12f), pink, collider: false);
            ViewKit.Prim(PrimitiveType.Cube, "Beak", t, new Vector3(0.33f, 1.06f, 0f), new Vector3(0.1f, 0.03f, 0.03f), ViewKit.Hex(0x2B2A27), collider: false);
            return t;
        }
    }
}
