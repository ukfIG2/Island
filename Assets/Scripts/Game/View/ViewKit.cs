using System.Collections.Generic;
using UnityEngine;

namespace ResortEmpire.Game.View
{
    // Shared blockout helpers: one cached URP Lit material per color, and primitives built in code.
    static class ViewKit
    {
        static readonly Dictionary<Color, Material> Materials = new Dictionary<Color, Material>();
        static Shader _lit;

        public static Material Mat(Color color)
        {
            if (Materials.TryGetValue(color, out var cached) && cached != null) return cached;
            if (_lit == null) _lit = Shader.Find("Universal Render Pipeline/Lit");
            var mat = new Material(_lit) { color = color };
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
