using System.Collections.Generic;
using UnityEngine;

namespace ResortEmpire.Game.View
{
    // Shared blockout helpers: one cached URP Lit material per color, and primitives built in code.
    static class ViewKit
    {
        static readonly Dictionary<Color, Material> Materials = new Dictionary<Color, Material>();

        // Each colour copies a URP Lit material kept in Resources: a shader only looked up by name is left out of
        // phone builds, and nothing could be built there.
        public static Material Mat(Color color)
        {
            if (Materials.TryGetValue(color, out var cached) && cached != null) return cached;
            var mat = new Material(Resources.Load<Material>("Island/Lit")) { color = color };
            if (mat.HasProperty("_BaseColor")) mat.SetColor("_BaseColor", color);
            if (mat.HasProperty("_Smoothness")) mat.SetFloat("_Smoothness", 0.15f);
            Materials[color] = mat;
            return mat;
        }

        public static GameObject Prim(PrimitiveType type, string name, Transform parent,
            Vector3 localPosition, Vector3 localScale, Color color, bool collider = true)
        {
            var go = GameObject.CreatePrimitive(type);
            go.name = name;
            go.transform.SetParent(parent, false);
            go.transform.localPosition = localPosition;
            go.transform.localScale = localScale;
            go.GetComponent<Renderer>().sharedMaterial = Mat(color);
            if (!collider) Object.Destroy(go.GetComponent<Collider>());
            return go;
        }

        // An unlit, optionally see-through colour (the ResortEmpire/Flat shader), one cached material per colour.
        public static Material Flat(Color color)
        {
            if (FlatMaterials.TryGetValue(color, out var cached) && cached != null) return cached;
            var mat = new Material(Resources.Load<Material>("Island/Flat"));
            mat.SetColor("_Color", color);
            FlatMaterials[color] = mat;
            return mat;
        }

        static readonly Dictionary<Color, Material> FlatMaterials = new Dictionary<Color, Material>();

        public static Color Hex(int rgb)
            => new Color(((rgb >> 16) & 0xFF) / 255f, ((rgb >> 8) & 0xFF) / 255f, (rgb & 0xFF) / 255f);

        // A pointed cone along +x with the given number of sides (the web's 4-sided bows), base cap included.
        public static GameObject Cone(string name, Transform parent, Vector3 position, float radius, float length,
            int sides, Color color)
        {
            var go = new GameObject(name, typeof(MeshFilter), typeof(MeshRenderer));
            go.transform.SetParent(parent, false);
            go.transform.localPosition = position;
            var vertices = new List<Vector3>();
            var tip = new Vector3(length * 0.5f, 0f, 0f);
            var centre = new Vector3(-length * 0.5f, 0f, 0f);
            for (int i = 0; i < sides; i++)
            {
                float a0 = i * Mathf.PI * 2f / sides, a1 = (i + 1) * Mathf.PI * 2f / sides;
                var b0 = centre + new Vector3(0f, Mathf.Cos(a0), Mathf.Sin(a0)) * radius;
                var b1 = centre + new Vector3(0f, Mathf.Cos(a1), Mathf.Sin(a1)) * radius;
                vertices.Add(tip); vertices.Add(b0); vertices.Add(b1);         // side, facing out
                vertices.Add(centre); vertices.Add(b1); vertices.Add(b0);      // base cap, facing back
            }
            var triangles = new int[vertices.Count];
            for (int i = 0; i < triangles.Length; i++) triangles[i] = i;
            var mesh = new Mesh { name = "Cone", vertices = vertices.ToArray(), triangles = triangles };
            mesh.RecalculateNormals();
            go.GetComponent<MeshFilter>().sharedMesh = mesh;
            go.GetComponent<MeshRenderer>().sharedMaterial = Mat(color);
            return go;
        }

        // A flat ring lying on the ground, seen from either side.
        public static GameObject Ring(string name, Transform parent, float inner, float outer, Color color)
        {
            var go = new GameObject(name, typeof(MeshFilter), typeof(MeshRenderer));
            go.transform.SetParent(parent, false);
            go.GetComponent<MeshFilter>().sharedMesh = RingMesh(inner, outer);
            var renderer = go.GetComponent<MeshRenderer>();
            renderer.sharedMaterial = Mat(color);
            renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            return go;
        }

        static Mesh RingMesh(float inner, float outer)
        {
            const int segments = 32;
            var vertices = new Vector3[(segments + 1) * 2];
            var normals = new Vector3[vertices.Length];
            for (int i = 0; i <= segments; i++)
            {
                float a = i * Mathf.PI * 2f / segments;
                var d = new Vector3(Mathf.Cos(a), 0f, Mathf.Sin(a));
                vertices[i * 2] = d * inner;
                vertices[i * 2 + 1] = d * outer;
                normals[i * 2] = normals[i * 2 + 1] = Vector3.up;
            }
            var triangles = new int[segments * 12];
            for (int i = 0, t = 0; i < segments; i++)
            {
                int a = i * 2, b = a + 1, c = a + 2, d = a + 3;
                foreach (int v in new[] { a, c, b, b, c, d, a, b, c, b, d, c }) triangles[t++] = v;
            }
            return new Mesh { name = "Ring", vertices = vertices, normals = normals, triangles = triangles };
        }
    }
}
