using System.Collections.Generic;
using ResortEmpire.Game.Ui;
using ResortEmpire.Sim;
using UnityEngine;

namespace ResortEmpire.Game.View
{
    // Guest figures in motion: arrivals walking from the boat along the island's paths to their building's
    // line, and a few served guests strolling back to the beach; on the way they may ride a lift. Purely
    // visual — the sim decides who exists and where.
    sealed class GuestFlow
    {
        const float WalkSpeed = 0.9f;   // island units per second; the web's guests walk 0.23–0.65
        const float LeisureStaySeconds = 4.5f;

        static readonly Vector3 GuestScale = new Vector3(0.28f, 0.32f, 0.28f);

        sealed class Walker
        {
            public Transform Body;
            public Renderer Renderer;
            public readonly RouteWalk Walk = new RouteWalk();
            public float Offset;
            public NeedId Need;
            public bool Leisure;
        }

        readonly Transform _parent;
        readonly float _scale;         // figure size relative to the blockout figures
        readonly List<Walker> _active = new List<Walker>();
        readonly Stack<Walker> _pool = new Stack<Walker>();
        readonly int[] _inTransit = new int[System.Enum.GetValues(typeof(NeedId)).Length];

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

        // from and to are the figure's centre at the start and the end; the route between lies on the ground.
        public void SpawnArrival(NeedId need, IslandPaths.Route route, Vector3 from, Vector3 to, int sequence)
        {
            var w = Take(need, route, from, to);
            w.Offset = ((sequence % 5) - 2) * 0.012f;
            _inTransit[(int)need]++;
        }

        public void SpawnLeisure(NeedId need, IslandPaths.Route route, Vector3 from, Vector3 to)
        {
            var w = Take(need, route, from, to);
            w.Leisure = true;
            w.Offset = 0.015f;
        }

        public void Tick(float dt)
        {
            for (int i = _active.Count - 1; i >= 0; i--)
            {
                var w = _active[i];
                var pos = w.Walk.Advance(WalkSpeed * dt);
                if (!w.Walk.Waiting && w.Walk.Walked < w.Walk.Length)
                {
                    // A small sideways offset keeps a crowd from walking in single file; a bounce for each step.
                    var ahead = w.Walk.Ahead(0.05f) - pos;
                    pos += new Vector3(-ahead.z, 0f, ahead.x).normalized * w.Offset;
                    pos.y += Mathf.Abs(Mathf.Sin(w.Walk.Walked * 12f)) * 0.06f * _scale;
                }
                w.Body.position = pos + Vector3.up * HalfHeight;

                if (!w.Leisure)
                {
                    if (w.Walk.Arrived) Recycle(i);
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
                if (!_active[i].Leisure) Recycle(i);
        }

        Walker Take(NeedId need, IslandPaths.Route route, Vector3 from, Vector3 to)
        {
            Walker w;
            if (_pool.Count > 0)
            {
                w = _pool.Pop();
                w.Body.gameObject.SetActive(true);
            }
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
            w.Need = need;
            w.Leisure = false;
            _active.Add(w);
            return w;
        }

        void Recycle(int index)
        {
            var w = _active[index];
            w.Walk.Abandon();
            if (!w.Leisure) _inTransit[(int)w.Need]--;
            w.Body.gameObject.SetActive(false);
            _active.RemoveAt(index);
            _pool.Push(w);
        }
    }
}
