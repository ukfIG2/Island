using UnityEngine;
using UnityEngine.Rendering;

namespace ResortEmpire.Game.View
{
    // The web version's ocean: a fine 42 x 42 grid at sea level, moved and coloured by the Ocean shader, kept out
    // of the island and softened along its coast by the web's island outline.
    static class Ocean
    {
        const string MaterialPath = "Island/Ocean";
        const string ShorePath = "Island/island-shore";
        const float Size = 42f;
        const int Segments = 160;   // the web uses 220; 160 still samples the shortest wave eight times

        public static Material Build(Transform parent, float seaLevel, IslandPaths.Shore shore)
        {
            var go = new GameObject("Ocean", typeof(MeshFilter), typeof(MeshRenderer));
            go.transform.SetParent(parent, false);
            go.transform.localPosition = new Vector3(0f, seaLevel, 0f);
            go.GetComponent<MeshFilter>().sharedMesh = Grid();
            var renderer = go.GetComponent<MeshRenderer>();
            var material = new Material(Resources.Load<Material>(MaterialPath));
            renderer.sharedMaterial = material;
            renderer.shadowCastingMode = ShadowCastingMode.Off;
            renderer.receiveShadows = false;

            // Two bytes per texel, high then low, exactly as the web packs its distance texture.
            var map = new Texture2D(shore.resolution, shore.resolution, TextureFormat.RG16, false, true)
            {
                name = "IslandShore", filterMode = FilterMode.Bilinear, wrapMode = TextureWrapMode.Clamp
            };
            map.LoadRawTextureData(Resources.Load<TextAsset>(ShorePath).bytes);
            map.Apply(false, true);
            material.SetTexture("_ShoreDistance", map);
            material.SetVector("_ShoreArea", new Vector4(shore.origin[0], shore.origin[1], shore.size, shore.size));
            material.SetFloat("_ShoreRange", shore.range);
            return material;
        }

        // The shader works in the web's coordinates, where x is mirrored.
        public static Vector4 WebDirection(Vector3 v) => new Vector4(-v.x, v.y, v.z, 0f);

        static Mesh Grid()
        {
            const int side = Segments + 1;
            var vertices = new Vector3[side * side];
            for (int z = 0; z < side; z++)
                for (int x = 0; x < side; x++)
                    vertices[z * side + x] = new Vector3((x / (float)Segments - 0.5f) * Size, 0f,
                        (z / (float)Segments - 0.5f) * Size);
            var triangles = new int[Segments * Segments * 6];
            for (int z = 0, t = 0; z < Segments; z++)
                for (int x = 0; x < Segments; x++)
                {
                    int i = z * side + x;
                    triangles[t++] = i;
                    triangles[t++] = i + side;
                    triangles[t++] = i + 1;
                    triangles[t++] = i + 1;
                    triangles[t++] = i + side;
                    triangles[t++] = i + side + 1;
                }
            var mesh = new Mesh { name = "OceanGrid", vertices = vertices, triangles = triangles };
            // The waves lift the surface in the shader; keep the bounds tall enough that it is never culled.
            mesh.bounds = new Bounds(Vector3.zero, new Vector3(Size, 2f, Size));
            return mesh;
        }
    }
}
