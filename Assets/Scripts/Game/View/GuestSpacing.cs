using System.Collections.Generic;
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
        public const float EaseDistance = 0.12f;       // island units to step onto the side after the start and off before the end

        // How far from the middle of the path a walker walks. Zero at both ends of the walk, so a guest still starts
        // exactly at the boat and ends exactly on its spot in the line.
        public static float SideOffset(float bodyWidth, float walked, float length)
        {
            float ease = Mathf.Clamp01(walked / EaseDistance) * Mathf.Clamp01((length - walked) / EaseDistance);
            return bodyWidth * SideShare * ease;
        }

        // The path's direction at a walker is taken from SideWindow behind it to SideWindow ahead of it. On the same path
        // that direction is exactly opposite for two guests walking opposite ways, so their sides stay opposite on
        // stairs and round switchback corners too, where a look ahead alone would point them at different legs.
        public const float SideWindow = 0.15f;

        // The walker's side from the points of its path SideWindow behind and ahead of it.
        public static Vector3 PathSide(Vector3 behind, Vector3 ahead) => Side(ahead - behind);

        // The walker's own side: flat, one unit long, to the right of the way it walks. Zero for no direction.
        public static Vector3 Side(Vector3 heading)
        {
            heading.y = 0f;
            if (heading.sqrMagnitude < 1e-8f) return Vector3.zero;
            heading.Normalize();
            return new Vector3(heading.z, 0f, -heading.x);
        }

        // CAM-141: a walker keeps a gap behind the guest ahead. It walks at full pace while the guest ahead is more
        // than GapBodies figures away, slows down closer, and stands still at StopBodies, so the two never overlap.
        public const float GapBodies = 1.7f;
        public const float StopBodies = 1.1f;
        const float LevelTolerance = 0.25f;     // more height apart than this is another path: a bridge, stairs above
        const float OncomingDot = -0.3f;        // headings further apart than this are coming the other way

        // Where a walker stands and goes. Order is when it set off: a smaller number set off earlier.
        public struct Walker
        {
            public Vector3 At;           // on the walking surface, its side of the path included
            public Vector3 Heading;      // the way it walks; zero when unknown
            public int Order;
            public bool OnThePath;       // false once it has arrived and stands at its spot
        }

        // How fast this walker may go, from 0 (stand still) to 1 (full pace). It waits for any walker in its way ahead.
        // When two are in each other's way (side by side on one spot, or meeting at a crossing) the one that set off
        // first goes on and the other waits, so they never wait for each other. Walkers beside it with room to pass,
        // on another level, or coming the other way (they keep to their own side) are not in its way.
        public static float Pace(Vector3 at, Vector3 heading, int order, IReadOnlyList<Walker> others, float bodyWidth)
            => Pace(at, heading, order, others, bodyWidth, 0f, out _);

        // step: how far it would walk in this frame at full pace. room: how far it may walk without coming closer than
        // StopBodies to a walker in its way; float.MaxValue when nobody is. The look-ahead reaches at least one step past
        // the stop distance, so a long step (a slow frame at 4x speed) cannot carry it into the guest ahead.
        public static float Pace(Vector3 at, Vector3 heading, int order, IReadOnlyList<Walker> others, float bodyWidth,
            float step, out float room)
        {
            float gap = bodyWidth * GapBodies;
            float stop = bodyWidth * StopBodies;
            float reach = Mathf.Max(gap, stop + step);
            float pace = 1f;
            room = float.MaxValue;
            for (int i = 0; i < others.Count; i++)
            {
                var other = others[i];
                if (!other.OnThePath || other.Order == order) continue;
                if (!InTheWay(at, heading, other.At, other.Heading, bodyWidth, reach, out float forward)) continue;
                if (other.Order > order && InTheWay(other.At, other.Heading, at, heading, bodyWidth, reach, out _)) continue;
                pace = Mathf.Min(pace, Mathf.Clamp01((forward - stop) / (gap - stop)));
                room = Mathf.Min(room, Mathf.Max(0f, forward - stop));
            }
            return pace;
        }

        // Whether the other walker stands in this one's way: ahead of it, within reach, no room to pass beside, on
        // the same level and not coming the other way. forward is how far ahead it stands.
        static bool InTheWay(Vector3 at, Vector3 heading, Vector3 otherAt, Vector3 otherHeading, float bodyWidth,
            float reach, out float forward)
        {
            forward = 0f;
            heading.y = 0f;
            if (heading.sqrMagnitude < 1e-8f) return false;
            heading.Normalize();
            var d = otherAt - at;
            if (Mathf.Abs(d.y) > LevelTolerance) return false;
            d.y = 0f;
            forward = Vector3.Dot(d, heading);
            if (forward < -0.01f || forward > reach) return false;               // behind, or far enough ahead
            if ((d - heading * forward).magnitude >= bodyWidth) return false;      // beside, with room to pass
            otherHeading.y = 0f;
            return otherHeading.sqrMagnitude < 1e-8f || Vector3.Dot(otherHeading.normalized, heading) >= OncomingDot;
        }
    }
}
