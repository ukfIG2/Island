using System.Collections.Generic;
using ResortEmpire.Game.Ui;
using ResortEmpire.Sim;
using UnityEngine;

namespace ResortEmpire.Game.View
{
    // Guest figures in motion: arrivals walking from the boat along the island's paths to their building's
    // line, a few served guests strolling back to the beach, and at Wave Complete guests walking home to the
    // vessel; on the way they may ride a lift. Purely visual — the sim decides who exists and where.
    sealed class GuestFlow
    {
        const float WalkSpeed = 0.9f;   // island units per second; the web's guests walk 0.23–0.65
        const float LeisureStaySeconds = 4.5f;
        // A guest held up this long walks on anyway, so no tangle at a crossing can hold anyone for good.
        const float MaxWaitSeconds = 8f;

        static readonly Vector3 GuestScale = new Vector3(0.28f, 0.32f, 0.28f);

        sealed class Walker
        {
            public Transform Body;
            public Renderer Renderer;
            public readonly RouteWalk Walk = new RouteWalk();
            public NeedId Need;
            public bool Leisure;
            public bool Departing;      // walking home to the vessel at Wave Complete (CAM-143)
            public float Speed = 1f;    // times the walking pace; impatient guests walk a little faster
            public int Order;           // when it set off, for the gap behind the guest ahead (CAM-141)
            public Vector3 Ground;      // where it stood after the last step, on the walking surface
            public Vector3 Heading;     // the way it walked then
            public float HeldUp;        // seconds it has stood behind another guest on the way
        }

        readonly Transform _parent;
        readonly float _scale;         // figure size relative to the blockout figures
        readonly List<Walker> _active = new List<Walker>();
        readonly Stack<Walker> _pool = new Stack<Walker>();
        readonly int[] _inTransit = new int[System.Enum.GetValues(typeof(NeedId)).Length];
        readonly List<GuestSpacing.Walker> _snapshot = new List<GuestSpacing.Walker>();
        int _order;

        public GuestFlow(Transform parent, float scale)
        {
            _parent = parent;
            _scale = scale;
        }

        // Arrivals still walking are not drawn in the line yet, so the line only grows when they get there.
        public int InTransit(NeedId need) => _inTransit[(int)need];

        public int ArrivalsWalking
        {
            get
            {
                int n = 0;
                foreach (int count in _inTransit) n += count;
                return n;
            }
        }

        // The figure's centre is half its height above the walking surface.
        float HalfHeight => GuestScale.y * _scale;
        float BodyWidth => GuestScale.x * _scale;

        // from and to are the figure's centre at the start and the end; the route between lies on the ground.
        public void SpawnArrival(NeedId need, IslandPaths.Route route, Vector3 from, Vector3 to)
        {
            Take(need, route, from, to);
            _inTransit[(int)need]++;
        }

        public void SpawnLeisure(NeedId need, IslandPaths.Route route, Vector3 from, Vector3 to)
        {
            var w = Take(need, route, from, to);
            w.Leisure = true;
        }

        // CAM-143: a guest going home walks to the vessel and boards it, which takes it off the island.
        public void SpawnDeparture(NeedId need, IslandPaths.Route route, Vector3 from, Vector3 to, float speed)
        {
            var w = Take(need, route, from, to);
            w.Departing = true;
            w.Speed = speed;
        }

        // Guests still on their way to the vessel; it waits for them.
        public int Departing
        {
            get
            {
                int n = 0;
                foreach (var w in _active) if (w.Departing) n++;
                return n;
            }
        }

        public void Tick(float dt)
        {
            // Where everyone stood after the last step: each walker keeps its gap behind those that set off earlier.
            _snapshot.Clear();
            foreach (var w in _active)
                _snapshot.Add(new GuestSpacing.Walker
                {
                    At = w.Ground, Heading = w.Heading, Order = w.Order, OnThePath = !w.Walk.Arrived
                });

            for (int i = _active.Count - 1; i >= 0; i--)
            {
                var w = _active[i];
                float step = WalkSpeed * w.Speed * dt;
                float pace = GuestSpacing.Pace(w.Ground, w.Heading, w.Order, _snapshot, BodyWidth, step, out float room); // CAM-141
                if (pace < 0.01f && w.Walk.Walked > 0f && !w.Walk.Waiting)
                {
                    w.HeldUp += dt;
                    if (w.HeldUp > MaxWaitSeconds)
                    {
                        pace = 1f;
                        room = float.MaxValue;
                    }
                }
                else w.HeldUp = 0f;
                var pos = w.Walk.Advance(Mathf.Min(step * pace, room));
                w.Heading = w.Walk.Ahead(0.05f) - pos;
                bool walking = !w.Walk.Waiting && w.Walk.Walked < w.Walk.Length;
                // Each guest keeps to its own side of the path (CAM-140).
                if (walking)
                    pos += GuestSpacing.PathSide(w.Walk.Ahead(-GuestSpacing.SideWindow), w.Walk.Ahead(GuestSpacing.SideWindow))
                           * GuestSpacing.SideOffset(BodyWidth, w.Walk.Walked, w.Walk.Length);
                w.Ground = pos;
                // A bounce for each step, settling while the guest waits behind another.
                if (walking) pos.y += Mathf.Abs(Mathf.Sin(w.Walk.Walked * 12f)) * 0.06f * _scale * Mathf.Clamp01(pace * 4f);
                w.Body.position = pos + Vector3.up * HalfHeight;
                // Guests who set off from the same spot together appear one by one, as the one ahead makes room.
                bool shown = w.Walk.Walked > 0f || w.Walk.Waiting;
                if (w.Body.gameObject.activeSelf != shown) w.Body.gameObject.SetActive(shown);

                if (!w.Leisure)
                {
                    if (w.Walk.Arrived) Recycle(i);     // in the line, or aboard the vessel
                    continue;
                }

                float remaining = LeisureStaySeconds - (w.Walk.Walked - w.Walk.Length) / WalkSpeed;
                w.Body.localScale = GuestScale * (_scale * Mathf.Clamp01(remaining));
                if (w.Walk.Arrived && remaining <= 0f) Recycle(i);
            }
        }

        public void ClearArrivals()
        {
            for (int i = _active.Count - 1; i >= 0; i--)
                if (!_active[i].Leisure && !_active[i].Departing) Recycle(i);
        }

        Walker Take(NeedId need, IslandPaths.Route route, Vector3 from, Vector3 to)
        {
            Walker w;
            if (_pool.Count > 0)
                w = _pool.Pop();
            else
            {
                var go = ViewKit.Prim(PrimitiveType.Capsule, "Guest", _parent, Vector3.zero, GuestScale,
                    Color.white, collider: false);
                w = new Walker { Body = go.transform, Renderer = go.GetComponent<Renderer>() };
            }
            var up = Vector3.up * HalfHeight;
            w.Walk.Start(IslandPaths.Route.Between(from - up, route, to - up));
            w.Renderer.sharedMaterial = ViewKit.Mat(UiFactory.NeedColor(need));
            w.Body.localScale = GuestScale * _scale;
            w.Body.position = from;
            w.Ground = from - up;
            w.Heading = w.Walk.Ahead(0.05f) - w.Walk.Ahead(0f);
            w.Order = ++_order;
            w.HeldUp = 0f;
            w.Body.gameObject.SetActive(false);   // shown by Tick once it steps off its spot
            w.Need = need;
            w.Leisure = false;
            w.Departing = false;
            w.Speed = 1f;
            _active.Add(w);
            return w;
        }

        void Recycle(int index)
        {
            var w = _active[index];
            w.Walk.Abandon();
            if (!w.Leisure && !w.Departing) _inTransit[(int)w.Need]--;
            w.Body.gameObject.SetActive(false);
            _active.RemoveAt(index);
            _pool.Push(w);
        }
    }
}
