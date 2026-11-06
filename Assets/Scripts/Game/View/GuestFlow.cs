using System.Collections.Generic;
using ResortEmpire.Game.Ui;
using ResortEmpire.Sim;
using UnityEngine;

namespace ResortEmpire.Game.View
{
    // Guest figures in motion: arrivals walking from the boat to their building's line, and a few
    // served guests strolling to the beach. Purely visual — the sim decides who exists and where.
    sealed class GuestFlow
    {
        const float WalkSpeed = 4.2f;
        const float LeisureWalkSeconds = 3.5f;
        const float LeisureStaySeconds = 4.5f;

        static readonly Vector3 GuestScale = new Vector3(0.28f, 0.32f, 0.28f);

        sealed class Walker
        {
            public Transform Body;
            public Renderer Renderer;
            public Vector3 From, To;
            public float Elapsed, Duration, Sway;
            public NeedId Need;
            public bool Leisure;
        }

        readonly Transform _parent;
        readonly float _scale;         // figure size, walking speed and sway shrink together with the world
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

        public void SpawnArrival(NeedId need, Vector3 from, Vector3 to, int sequence)
        {
            var w = Take(need, from, to);
            w.Duration = Mathf.Max(0.6f, Vector3.Distance(from, to) / (WalkSpeed * _scale));
            w.Sway = ((sequence % 5) - 2) * 0.3f * _scale;
            _inTransit[(int)need]++;
        }

        public void SpawnLeisure(NeedId need, Vector3 from, Vector3 to)
        {
            var w = Take(need, from, to);
            w.Leisure = true;
            w.Duration = LeisureWalkSeconds;
            w.Sway = 0.4f * _scale;
        }

        public void Tick(float dt)
        {
            for (int i = _active.Count - 1; i >= 0; i--)
            {
                var w = _active[i];
                w.Elapsed += dt;
                float t = Mathf.Clamp01(w.Elapsed / w.Duration);

                var travel = w.To - w.From;
                var side = new Vector3(-travel.z, 0f, travel.x).normalized;
                var pos = Vector3.Lerp(w.From, w.To, t) + side * (Mathf.Sin(t * Mathf.PI) * w.Sway);
                if (t < 1f) pos.y += Mathf.Abs(Mathf.Sin(w.Elapsed * 9f)) * 0.06f * _scale;
                w.Body.position = pos;

                if (!w.Leisure)
                {
                    if (t >= 1f) Recycle(i);
                    continue;
                }

                float remaining = LeisureWalkSeconds + LeisureStaySeconds - w.Elapsed;
                w.Body.localScale = GuestScale * (_scale * Mathf.Clamp01(remaining));
                if (remaining <= 0f) Recycle(i);
            }
        }

        public void ClearArrivals()
        {
            for (int i = _active.Count - 1; i >= 0; i--)
                if (!_active[i].Leisure) Recycle(i);
        }

        Walker Take(NeedId need, Vector3 from, Vector3 to)
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
            w.Renderer.sharedMaterial = ViewKit.Mat(UiFactory.NeedColor(need));
            w.Body.localScale = GuestScale * _scale;
            w.Body.position = from;
            w.From = from;
            w.To = to;
            w.Need = need;
            w.Elapsed = 0f;
            w.Leisure = false;
            _active.Add(w);
            return w;
        }

        void Recycle(int index)
        {
            var w = _active[index];
            if (!w.Leisure) _inTransit[(int)w.Need]--;
            w.Body.gameObject.SetActive(false);
            _active.RemoveAt(index);
            _pool.Push(w);
        }
    }
}
