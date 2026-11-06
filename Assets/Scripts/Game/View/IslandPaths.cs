using System;
using System.Collections.Generic;
using UnityEngine;

namespace ResortEmpire.Game.View
{
    // The stairs, bridges, landings and lifts of Vadzim's web island and the routes his guests walk, built
    // from the data his own code computes (Tools/WebExport/export-island-paths.mjs). Purely visual.
    static class IslandPaths
    {
        const string DataPath = "Island/island-paths";

        [Serializable] sealed class Part { public float[] p, q, s; public string c; }
        [Serializable] sealed class LiftData { public string id; public float[] from, to; }
        [Serializable] sealed class LiftLegData { public int at; public string id; }
        [Serializable] sealed class RouteData { public string name; public float[] p; public LiftLegData[] lifts; }
        [Serializable] sealed class SiteData { public string need; public float[] center, entrance; public bool embedded; }
        [Serializable] sealed class Data
        {
            public Part[] boxes, cylinders;
            public LiftData[] lifts;
            public SiteData[] services;
            public Shore shore;
            public RouteData[] routes;
        }

        // The island outline the web's ocean uses: a square map (island-shore.bytes) of the signed distance to
        // the coast, in the web's coordinates.
        [Serializable]
        public sealed class Shore
        {
            public float[] origin;
            public float size, range;
            public int resolution;
        }

        // Where a service stands in the web layout: its plot, the entrance guests walk to, and whether it is
        // a few props at the entrance (embedded) or a building on the plot (compact).
        public sealed class Site
        {
            public Vector3 Center, Entrance;
            public bool Embedded;
        }

        // Between point At and At + 1 of a route the guest rides this lift instead of walking.
        public struct LiftLeg
        {
            public int At;
            public Lift Lift;
        }

        // A walk along his walk areas, steps, bridges and lifts; the points lie on the walking surface.
        public sealed class Route
        {
            public readonly Vector3[] Points;
            public readonly LiftLeg[] LiftLegs;
            readonly float[] _walked;   // distance from the start at each point

            public Route(Vector3[] points, LiftLeg[] liftLegs)
            {
                Points = points;
                LiftLegs = liftLegs;
                _walked = new float[points.Length];
                for (int i = 1; i < points.Length; i++)
                    _walked[i] = _walked[i - 1] + Vector3.Distance(points[i - 1], points[i]);
            }

            public float Length => _walked[_walked.Length - 1];
            public float DistanceAt(int index) => _walked[index];

            public Vector3 PointAt(float distance)
            {
                if (distance <= 0f) return Points[0];
                for (int i = 1; i < Points.Length; i++)
                    if (_walked[i] >= distance)
                    {
                        float span = _walked[i] - _walked[i - 1];
                        return span > 0f ? Vector3.Lerp(Points[i - 1], Points[i], (distance - _walked[i - 1]) / span) : Points[i];
                    }
                return Points[Points.Length - 1];
            }
        }

        public sealed class Network
        {
            public readonly List<Lift> Lifts = new List<Lift>();
            public Shore Shore;
            readonly Dictionary<string, Route> _routes = new Dictionary<string, Route>();
            readonly Dictionary<string, Site> _sites = new Dictionary<string, Site>();

            // Places as his routes name them: "beach", "reception", "food", "drinks", "relax", "oceanView".
            public Route Route(string from, string to) => _routes.TryGetValue(from + ">" + to, out var r) ? r : null;
            public Site Site(string place) => _sites.TryGetValue(place, out var s) ? s : null;

            public void Add(string name, Route route) => _routes[name] = route;
            public void Add(string place, Site site) => _sites[place] = site;
        }

        // One cabin carrying one guest at a time, as the web's lifts do. It moves only when a guest needs it:
        // it fetches an empty ride to the guest's stop, then carries the guest to the other stop.
        public sealed class Lift
        {
            const float Speed = 0.6f;   // island units per second, the web's cabin speed

            public string Id;
            public Transform Cabin;
            public Vector3 From, To;    // lower and upper stop
            float _at, _goal;           // 0 = lower stop, 1 = upper stop
            object _rider, _caller;

            public Vector3 Floor => Cabin.position + Vector3.up * 0.03f;

            public void Park(float stop)
            {
                _goal = stop;
                Place(stop);
            }

            public float StopNear(Vector3 point) =>
                (point - From).sqrMagnitude <= (point - To).sqrMagnitude ? 0f : 1f;

            // True when the rider is aboard. Otherwise the empty cabin is called to the rider's stop; the first
            // call stands until the cabin gets there, so guests at both stops cannot send it back and forth.
            public bool TryBoard(object rider, float stop)
            {
                if (_rider == rider) return true;
                if (_rider != null) return false;
                if (_at != stop)
                {
                    if (_caller == null)
                    {
                        _caller = rider;
                        _goal = stop;
                    }
                    return false;
                }
                _rider = rider;
                _caller = null;
                _goal = 1f - stop;
                return true;
            }

            public bool Arrived(object rider) => _rider == rider && _at == _goal;

            // Also releases a call, so a guest who is gone never keeps the cabin waiting.
            public void StepOff(object rider)
            {
                if (_rider == rider) _rider = null;
                if (_caller == rider) _caller = null;
            }

            public void Tick(float dt)
            {
                if (_at != _goal) Place(Mathf.MoveTowards(_at, _goal, Speed * dt / Vector3.Distance(From, To)));
            }

            // The platform rides a little above the rail ends, as in the web.
            void Place(float fraction)
            {
                _at = fraction;
                Cabin.position = Vector3.Lerp(From, To, fraction) + Vector3.up * 0.05f;
            }
        }

        // Each lift's cabin waits at its lower stop until a guest needs it.
        public static Network Build(Transform parent)
        {
            var data = JsonUtility.FromJson<Data>(Resources.Load<TextAsset>(DataPath).text);
            var root = new GameObject("Paths").transform;
            root.SetParent(parent, false);
            foreach (var part in data.boxes)
                Place(PrimitiveType.Cube, part, new Vector3(part.s[0], part.s[1], part.s[2]), root);
            foreach (var part in data.cylinders) // a Unity cylinder is 2 units tall
                Place(PrimitiveType.Cylinder, part, new Vector3(part.s[0], part.s[1] * 0.5f, part.s[2]), root);
            // A few hundred small parts that never move: batch them so the phone draws them in a few calls.
            StaticBatchingUtility.Combine(root.gameObject);

            var network = new Network { Shore = data.shore };
            foreach (var l in data.lifts)
            {
                var cabin = new GameObject("LiftCabin").transform;
                cabin.SetParent(parent, false);
                ViewKit.Prim(PrimitiveType.Cube, "Platform", cabin, Vector3.zero, new Vector3(0.32f, 0.06f, 0.32f),
                    ViewKit.Hex(0xDFBF72), collider: false);
                ViewKit.Prim(PrimitiveType.Cube, "Pole", cabin, new Vector3(0f, 0.18f, 0f), new Vector3(0.025f, 0.36f, 0.025f),
                    ViewKit.Hex(0x6B837A), collider: false);
                var lift = new Lift { Id = l.id, Cabin = cabin, From = ToVector(l.from), To = ToVector(l.to) };
                lift.Park(0f);
                network.Lifts.Add(lift);
            }

            foreach (var s in data.services)
                network.Add(s.need, new Site { Center = ToVector(s.center), Entrance = ToVector(s.entrance), Embedded = s.embedded });

            foreach (var r in data.routes)
            {
                var points = new Vector3[r.p.Length / 3];
                for (int i = 0; i < points.Length; i++) points[i] = new Vector3(r.p[i * 3], r.p[i * 3 + 1], r.p[i * 3 + 2]);
                var legs = new LiftLeg[r.lifts.Length];
                for (int i = 0; i < legs.Length; i++)
                    legs[i] = new LiftLeg { At = r.lifts[i].at, Lift = network.Lifts.Find(x => x.Id == r.lifts[i].id) };
                network.Add(r.name, new Route(points, legs));
            }
            return network;
        }

        static void Place(PrimitiveType type, Part part, Vector3 scale, Transform root)
        {
            ColorUtility.TryParseHtmlString(part.c, out var color);
            var go = ViewKit.Prim(type, "Path", root, ToVector(part.p), scale, color, collider: false);
            go.transform.localRotation = new Quaternion(part.q[0], part.q[1], part.q[2], part.q[3]);
        }

        static Vector3 ToVector(float[] v) => new Vector3(v[0], v[1], v[2]);
    }
}
