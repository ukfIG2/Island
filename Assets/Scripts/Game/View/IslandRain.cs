using System.Collections.Generic;
using UnityEngine;

namespace ResortEmpire.Game.View
{
    // The web version's tropical rain (ResortWorldArt.tsx TropicalRain): thin slanted streaks falling over the
    // island, each on its own loop, pale and half see-through.
    sealed class IslandRain
    {
        const int Drops = 58;
        const float Span = 6.2f;   // height each drop falls through before it starts again

        readonly GameObject _root;
        readonly List<Transform> _drops = new List<Transform>();

        public IslandRain(Transform parent)
        {
            _root = new GameObject("Rain");
            _root.transform.SetParent(parent, false);
            var water = ViewKit.Hex(0xD8F3F6);
            water.a = 0.52f;
            for (int i = 0; i < Drops; i++)
            {
                var drop = ViewKit.Prim(PrimitiveType.Cube, "Drop", _root.transform, Vector3.zero,
                    new Vector3(0.014f, 0.58f, 0.014f), water, collider: false);
                var renderer = drop.GetComponent<Renderer>();
                renderer.sharedMaterial = ViewKit.Flat(water);
                renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
                drop.transform.localRotation = Quaternion.Euler(0f, 0f, -0.22f * Mathf.Rad2Deg);   // web x mirrored
                _drops.Add(drop.transform);
            }
            _root.SetActive(false);
        }

        public void Tick(float time, bool raining)
        {
            if (_root.activeSelf != raining) _root.SetActive(raining);
            if (!raining) return;
            for (int i = 0; i < _drops.Count; i++)
            {
                // The web's spread and speeds, x mirrored like the island.
                float x = -(((i * 37) % 31) / 31f * 14f - 7f) - Mathf.Sin(time * 0.8f + i) * 0.04f;
                float z = ((i * 19) % 37) / 37f * 12f - 6f;
                float start = 1f + ((i * 11) % 31) / 31f * Span;
                float fall = time * (3.8f + (i % 4) * 0.35f);
                float y = 0.45f + Mathf.Repeat(start - fall, Span);
                _drops[i].localPosition = new Vector3(x, y, z);
            }
        }
    }
}
