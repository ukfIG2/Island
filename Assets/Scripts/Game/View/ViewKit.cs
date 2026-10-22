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

        public static Color Hex(int rgb)
            => new Color(((rgb >> 16) & 0xFF) / 255f, ((rgb >> 8) & 0xFF) / 255f, (rgb & 0xFF) / 255f);
    }
}
