using UnityEngine;

namespace ResortEmpire.Game.View
{
    // CAM-134: how walking guests keep apart on the island's paths, without rigidbodies or physics. Plain maths on
    // positions, so it can be tested on its own. Purely visual: the simulation never hears of it.
    public static class GuestSpacing
    {
        // CAM-140: every walker keeps to its own side of the path, the right-hand side of the way it walks. Guests
        // going up and guests coming down then pass side by side instead of through each other. The paths are
        // about two figures wide, so the side lies a little more than half a figure from the middle.
        public const float SideShare = 0.52f;          // of a figure's width, from the middle of the path
        public const float EaseDistance = 0.3f;        // island units to step onto the side after the start and off before the end

        // How far from the middle of the path a walker walks. Zero at both ends of the walk, so a guest still starts
        // exactly at the boat and ends exactly on its spot in the line.
        public static float SideOffset(float bodyWidth, float walked, float length)
        {
            float ease = Mathf.Clamp01(walked / EaseDistance) * Mathf.Clamp01((length - walked) / EaseDistance);
            return bodyWidth * SideShare * ease;
        }

        // The walker's own side: flat, one unit long, to the right of the way it walks. Zero for no direction.
        public static Vector3 Side(Vector3 heading)
        {
            heading.y = 0f;
            if (heading.sqrMagnitude < 1e-8f) return Vector3.zero;
            heading.Normalize();
            return new Vector3(heading.z, 0f, -heading.x);
        }
    }
}
