using System.Collections.Generic;
using UnityEngine;

namespace ResortEmpire.Game.View
{
    // The vessels that bring each wave, as in the web (arrivalComposition.ts, ResortArrivalActivity.tsx): the island
    // shuttle, speedboats, the resort ferry or a seaplane, depending on the wave. They come in to the main beach
    // when a wave starts, wait there side by side while guests arrive, then turn and leave once arrivals close.
    // Shapes, colours, bobbing and wakes are the web's; the course is fitted to this island's beach, because the
    // web's own course still belongs to its earlier island.
    sealed class IslandBoats
    {
        enum Kind { Shuttle, Speedboat, Ferry, Seaplane }

        // The web's arrivals per wave: which vessel and how many.
        static readonly (Kind kind, int count)[] ByWave =
        {
            (Kind.Shuttle, 1), (Kind.Speedboat, 3), (Kind.Ferry, 1), (Kind.Shuttle, 2),
            (Kind.Speedboat, 3), (Kind.Ferry, 1), (Kind.Seaplane, 1), (Kind.Seaplane, 2)
        };

        const float Travel = 9f;          // how far out at sea a vessel starts
        const float DockOffset = 1.6f;    // from the beach out to where a vessel waits
        const float LaneSpacing = 1.1f;
        const float CruiseSpeed = 3.6f;   // island units per second
        const float TurnSpeed = 150f;     // degrees per second when turning round to leave

        sealed class Craft
        {
            public Transform Body, Wake, Propeller;
            public Kind Kind;
            public float Lane, Pace, Progress, Yaw;   // Progress: 0 out at sea, 1 at the beach
        }

        readonly Transform _parent;
        readonly Vector3 _beach;
        readonly Vector3 _outward;   // from the beach out to sea
        readonly Vector3 _side;
        readonly float _seaLevel;
        readonly List<Craft> _crafts = new List<Craft>();
        int _wave = -1;

        public IslandBoats(Transform parent, Vector3 beach, float seaLevel)
        {
            _parent = parent;
            _beach = new Vector3(beach.x, seaLevel, beach.z);
            _outward = new Vector3(beach.x, 0f, beach.z).normalized;
            _side = new Vector3(_outward.z, 0f, -_outward.x);
            _seaLevel = seaLevel;
        }

        // A new wave's vessels are made once the last wave's have gone.
        public void Tick(int wave, bool atBeach, float dt, float time)
        {
            if (wave != _wave && _crafts.TrueForAll(c => c.Progress <= 0f))
            {
                _wave = wave;
                Rebuild(ByWave[Mathf.Clamp(wave, 1, ByWave.Length) - 1]);
            }
            foreach (var craft in _crafts) Steer(craft, atBeach, dt, time);
        }

        void Steer(Craft craft, bool atBeach, float dt, float time)
        {
            // Coming in, a vessel faces the beach; to leave it first turns round, then heads out.
            var heading = atBeach ? -_outward : _outward;
            craft.Yaw = Mathf.MoveTowardsAngle(craft.Yaw, YawFor(heading), TurnSpeed * dt);
            bool turned = Mathf.Abs(Mathf.DeltaAngle(craft.Yaw, YawFor(heading))) < 10f;
            float before = craft.Progress;
            if (atBeach || turned)
                craft.Progress = Mathf.MoveTowards(craft.Progress, atBeach ? 1f : 0f, dt * CruiseSpeed * craft.Pace / Travel);

            bool visible = atBeach || craft.Progress > 0f;
            if (craft.Body.gameObject.activeSelf != visible) craft.Body.gameObject.SetActive(visible);
            if (!visible) return;

            var dock = _beach + _outward * DockOffset + _side * (craft.Lane * LaneSpacing);
            float s = Mathf.SmoothStep(0f, 1f, craft.Progress);
            Vector3 position;
            if (craft.Kind == Kind.Seaplane)
            {
                // The web's descent: high out at sea, over a lower point, down onto the water near the beach.
                var start = dock + _outward * Travel + Vector3.up * 4.6f;
                var control = dock + _outward * (Travel * 0.45f) + Vector3.up * 2f;
                position = (1 - s) * (1 - s) * start + 2 * (1 - s) * s * control + s * s * (dock + Vector3.up * 0.3f);
                craft.Propeller.localRotation = Quaternion.Euler(time * 900f, 0f, 0f);
            }
            else
            {
                position = dock + _outward * (Travel * (1f - s)) + Vector3.up * 0.05f;
                bool ferry = craft.Kind == Kind.Ferry;
                position.y += Mathf.Sin(time * (craft.Kind == Kind.Speedboat ? 3.4f : 1.9f) + craft.Lane) * (ferry ? 0.018f : 0.035f);
            }
            craft.Body.position = position;
            float roll = Mathf.Sin(time * 1.5f + craft.Lane) * (craft.Kind == Kind.Ferry ? 0.008f : 0.018f) * Mathf.Rad2Deg;
            craft.Body.rotation = Quaternion.Euler(0f, craft.Yaw, roll);

            if (craft.Wake != null)
            {
                bool moving = !Mathf.Approximately(before, craft.Progress) && craft.Progress > 0.03f && craft.Progress < 0.98f;
                if (craft.Wake.gameObject.activeSelf != moving) craft.Wake.gameObject.SetActive(moving);
            }
        }

        // Vessels point their bow along +x, as the web's do.
        static float YawFor(Vector3 heading) => Mathf.Atan2(heading.x, heading.z) * Mathf.Rad2Deg - 90f;

        void Rebuild((Kind kind, int count) arrival)
        {
            foreach (var craft in _crafts) Object.Destroy(craft.Body.gameObject);
            _crafts.Clear();
            for (int i = 0; i < arrival.count; i++)
            {
                // The web staggers several vessels: later ones come a little slower.
                float pace = arrival.kind == Kind.Speedboat ? 1.45f : arrival.kind == Kind.Ferry ? 0.9f : 1f;
                var craft = new Craft
                {
                    Kind = arrival.kind,
                    Lane = i - (arrival.count - 1) * 0.5f,
                    Pace = pace * (1f - 0.15f * i),
                    Yaw = YawFor(-_outward)
                };
                Build(craft);
                craft.Body.gameObject.SetActive(false);
                _crafts.Add(craft);
            }
        }

        void Build(Craft craft)
        {
            var body = new GameObject(craft.Kind.ToString()).transform;
            body.SetParent(_parent, false);
            craft.Body = body;
            switch (craft.Kind)
            {
                case Kind.Seaplane:
                    Box(body, 1.55f, 0.28f, 0.34f, 0f, 0f, 0f, 0xF0DEB0);          // fuselage
                    Box(body, 0.42f, 0.09f, 2.25f, 0.05f, 0.03f, 0f, 0xC96449);    // wing
                    Box(body, 0.4f, 0.22f, 0.28f, -0.57f, 0.18f, 0f, 0x4A8390);    // cockpit
                    Box(body, 0.5f, 0.07f, 0.9f, -0.56f, 0.05f, 0f, 0xD6C48F);     // tail
                    foreach (float z in new[] { 0.52f, -0.52f }) Box(body, 0.9f, 0.09f, 0.13f, 0.12f, -0.26f, z, 0xE9D7A2);
                    craft.Propeller = new GameObject("Propeller").transform;
                    craft.Propeller.SetParent(body, false);
                    craft.Propeller.localPosition = new Vector3(0.82f, 0.02f, 0f);
                    Box(craft.Propeller, 0.035f, 0.78f, 0.06f, 0f, 0f, 0f, 0x59483C);
                    Box(craft.Propeller, 0.035f, 0.06f, 0.78f, 0f, 0f, 0f, 0x59483C);
                    return;

                case Kind.Ferry:
                    Hull(body, 2.35f, 1.02f, 0.34f, 0.5f, 0xF3E4BD, 0xE6C98F);
                    Box(body, 1.35f, 0.52f, 0.78f, -0.12f, 0.42f, 0f, 0xD9EEE6);
                    Box(body, 0.82f, 0.22f, 0.66f, -0.2f, 0.79f, 0f, 0xF4E8C8);
                    foreach (float x in new[] { -0.43f, -0.08f, 0.27f })
                        foreach (float z in new[] { -0.405f, 0.405f })
                            Box(body, 0.18f, 0.17f, 0.025f, x, 0.45f, z, 0x34748A);   // windows on both sides
                    craft.Wake = Wake(body, 1.35f);
                    return;

                case Kind.Speedboat:
                    Hull(body, 1.05f, 0.46f, 0.22f, 0.42f, 0xDF6849, 0xC64D3D);
                    Box(body, 0.42f, 0.18f, 0.35f, -0.08f, 0.25f, 0f, 0x4E8995);   // windshield
                    Box(body, 0.13f, 0.24f, 0.34f, -0.52f, 0.07f, 0f, 0x4B4B46);   // motor
                    craft.Wake = Wake(body, 1f);
                    return;

                default: // the island shuttle
                    Hull(body, 1.42f, 0.56f, 0.22f, 0.42f, 0xF1D99D, 0xDCBD79);
                    Box(body, 0.52f, 0.3f, 0.42f, -0.12f, 0.28f, 0f, 0x5DA5AA);    // cabin
                    Box(body, 0.16f, 0.22f, 0.4f, -0.54f, 0.12f, 0f, 0x6D5A43);    // stern
                    craft.Wake = Wake(body, 1f);
                    return;
            }
        }

        // Hull with the web's four-sided pointed bow.
        static void Hull(Transform body, float length, float width, float height, float bow, int hull, int bowColor)
        {
            Box(body, length, height, width, 0f, 0.02f, 0f, hull);
            ViewKit.Cone("Bow", body, new Vector3(length * 0.5f + 0.16f, 0.02f, 0f), width * 0.54f, bow, 4,
                ViewKit.Hex(bowColor));
        }

        // Two pale ripples trailing the hull, as the web's Wake.
        static Transform Wake(Transform body, float scale)
        {
            var wake = new GameObject("Wake").transform;
            wake.SetParent(body, false);
            wake.localPosition = new Vector3(-0.75f * scale, 0.06f, 0f);
            Ripple(wake, 0.18f, 0.28f, Vector3.zero, new Vector3(2.2f * scale, 1f, 0.55f), 0xE5FBF4, 0.5f);
            Ripple(wake, 0.14f, 0.22f, new Vector3(-0.45f * scale, -0.01f, 0f), new Vector3(2.6f * scale, 1f, 0.4f), 0xD8F7EF, 0.3f);
            wake.gameObject.SetActive(false);
            return wake;
        }

        static void Ripple(Transform parent, float inner, float outer, Vector3 position, Vector3 scale, int rgb, float alpha)
        {
            var color = ViewKit.Hex(rgb);
            color.a = alpha;
            var ring = ViewKit.Ring("Ripple", parent, inner, outer, color);
            ring.transform.localPosition = position;
            ring.transform.localScale = scale;
            ring.GetComponent<Renderer>().sharedMaterial = ViewKit.Flat(color);
        }

        static void Box(Transform parent, float l, float h, float w, float x, float y, float z, int color)
            => ViewKit.Prim(PrimitiveType.Cube, "Part", parent, new Vector3(x, y, z), new Vector3(l, h, w),
                ViewKit.Hex(color), collider: false);
    }
}
