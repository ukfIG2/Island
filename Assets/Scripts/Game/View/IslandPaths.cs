using System;
using System.Collections.Generic;
using UnityEngine;

namespace ResortEmpire.Game.View
{
    // The stairs, bridges, landings and lifts of Vadzim's web island, built from the data his own code
    // computes (Tools/WebExport/export-island-paths.mjs). Purely visual.
    static class IslandPaths
    {
        const string DataPath = "Island/island-paths";

        [Serializable] sealed class Part { public float[] p, q, s; public string c; }
        [Serializable] sealed class LiftData { public string id; public float[] from, to; }
        [Serializable] sealed class Data { public Part[] boxes, cylinders; public LiftData[] lifts; }

        public sealed class Lift
        {
            public Transform Cabin;
            public Vector3 From, To;

            // 0 = lower stop, 1 = upper stop. The platform rides a little above the rail ends, as in the web.
            public void MoveTo(float fraction) => Cabin.position = Vector3.Lerp(From, To, fraction) + Vector3.up * 0.05f;
        }

        // Each lift's cabin waits at its lower stop until a guest needs it.
        public static List<Lift> Build(Transform parent)
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

            var lifts = new List<Lift>();
            foreach (var l in data.lifts)
            {
                var cabin = new GameObject("LiftCabin").transform;
                cabin.SetParent(parent, false);
                ViewKit.Prim(PrimitiveType.Cube, "Platform", cabin, Vector3.zero, new Vector3(0.32f, 0.06f, 0.32f),
                    ViewKit.Hex(0xDFBF72), collider: false);
                ViewKit.Prim(PrimitiveType.Cube, "Pole", cabin, new Vector3(0f, 0.18f, 0f), new Vector3(0.025f, 0.36f, 0.025f),
                    ViewKit.Hex(0x6B837A), collider: false);
                var lift = new Lift { Cabin = cabin, From = ToVector(l.from), To = ToVector(l.to) };
                lift.MoveTo(0f);
                lifts.Add(lift);
            }
            return lifts;
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
