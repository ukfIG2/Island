using UnityEngine;
using UnityEngine.Rendering;

namespace ResortEmpire.Game.View
{
    // The web version's ocean: a fine 42 x 42 grid at sea level, moved and coloured by the Ocean shader.
    static class Ocean
    {
        const string MaterialPath = "Island/Ocean";
        const float Size = 42f;
        const int Segments = 160;   // the web uses 220; 160 still samples the shortest wave eight times

        public static Material Build(Transform parent, float seaLevel)
        {
            var go = new GameObject("Ocean", typeof(MeshFilter), typeof(MeshRenderer));
            go.transform.SetParent(parent, false);
            go.transform.localPosition = new Vector3(0f, seaLevel, 0f);
            go.GetComponent<MeshFilter>().sharedMesh = Grid();
            var renderer = go.GetComponent<MeshRenderer>();
            renderer.sharedMaterial = new Material(Resources.Load<Material>(MaterialPath));
            renderer.shadowCastingMode = ShadowCastingMode.Off;
            renderer.receiveShadows = false;
            return renderer.sharedMaterial;
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
