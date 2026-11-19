using System.Collections.Generic;
using NUnit.Framework;
using ResortEmpire.Game.View;
using UnityEngine;

namespace ResortEmpire.Game.Tests
{
    // CAM-134: walking guests keep apart without physics.
    public class GuestSpacingTests
    {
        const float Body = 0.168f;     // a walking guest's width on the island: 0.28 x the 0.6 figure scale

        // CAM-140
        [Test]
        public void EachGuestKeepsToTheRightOfTheWayItWalks()
        {
            Assert.AreEqual(Vector3.right, GuestSpacing.Side(Vector3.forward));
            Assert.AreEqual(Vector3.left, GuestSpacing.Side(Vector3.back));
            Assert.AreEqual(Vector3.back, GuestSpacing.Side(Vector3.right));
            Assert.AreEqual(Vector3.zero, GuestSpacing.Side(Vector3.zero), "no direction, no side");

            var climbing = GuestSpacing.Side(new Vector3(0f, 0.8f, 0.6f));
            Assert.AreEqual(0f, climbing.y, "the side stays flat on stairs");
            Assert.AreEqual(1f, climbing.magnitude, 1e-5f);
        }

        [Test]
        public void GuestsGoingOppositeWays_PassSideBySide_NotThroughEachOther()
        {
            var middle = new Vector3(2f, 0f, 3f);
            float offset = GuestSpacing.SideOffset(Body, 1f, 2f);
            var up = middle + GuestSpacing.Side(Vector3.forward) * offset;
            var down = middle + GuestSpacing.Side(Vector3.back) * offset;
            Assert.GreaterOrEqual(Vector3.Distance(up, down), Body, "a full figure apart when they meet");
        }

        // A switchback: up one flight, across a short landing, back along the next flight.
        static readonly Vector3[] Switchback =
        {
            new Vector3(0f, 0f, 0f), new Vector3(0f, 0.6f, 1.2f), new Vector3(0.3f, 0.6f, 1.2f), new Vector3(0.3f, 1.2f, 0f)
        };

        static Vector3 PointAt(Vector3[] path, float distance)
        {
            if (distance <= 0f) return path[0];
            for (int i = 1; i < path.Length; i++)
            {
                float span = Vector3.Distance(path[i - 1], path[i]);
                if (distance <= span) return Vector3.Lerp(path[i - 1], path[i], distance / span);
                distance -= span;
            }
            return path[path.Length - 1];
        }

        static float LengthOf(Vector3[] path)
        {
            float length = 0f;
            for (int i = 1; i < path.Length; i++) length += Vector3.Distance(path[i - 1], path[i]);
            return length;
        }

        static Vector3 OnItsSide(Vector3[] path, float walked)
        {
            float length = LengthOf(path);
            var side = GuestSpacing.PathSide(PointAt(path, walked - GuestSpacing.SideWindow), PointAt(path, walked + GuestSpacing.SideWindow));
            return PointAt(path, walked) + side * GuestSpacing.SideOffset(Body, walked, length);
        }

        [Test]
        public void GuestsGoingUpAndDownASwitchback_PassAFigureApart_AlsoRoundTheCorners()
        {
            var down = (Vector3[])Switchback.Clone();
            System.Array.Reverse(down);
            float length = LengthOf(Switchback);
            float sameSpot = float.MaxValue, aStepApart = float.MaxValue;
            // Away from both ends (where every guest steps back to the middle), at every point of the climb, with the
            // guest coming down at the same point or a step either side of it.
            for (float s = GuestSpacing.EaseDistance + 0.05f; s <= length - GuestSpacing.EaseDistance - 0.05f; s += 0.01f)
                foreach (float apart in new[] { -0.05f, 0f, 0.05f })
                {
                    var flat = OnItsSide(Switchback, s) - OnItsSide(down, length - s - apart);
                    if (Mathf.Abs(flat.y) > 0.25f) continue;          // a flight above or below, not the same spot
                    flat.y = 0f;
                    if (apart == 0f) sameSpot = Mathf.Min(sameSpot, flat.magnitude);
                    else aStepApart = Mathf.Min(aStepApart, flat.magnitude);
                }
            Assert.GreaterOrEqual(sameSpot, Body * 0.99f, "on the same spot a full figure apart, corners included");
            // Right on a 90-degree corner the inner side is shorter, so guests a step apart brush shoulders (a look ahead
            // alone let them come within 0.58 of a figure there).
            Assert.GreaterOrEqual(aStepApart, Body * 0.85f, "a step apart they never walk through each other");
        }

        [Test]
        public void TheSideStaysOnThePath_AboutTwoFiguresWide()
        {
            float offset = GuestSpacing.SideOffset(Body, 1f, 2f);
            Assert.LessOrEqual(offset + Body * 0.5f, 0.175f, "the outer edge of the figure stays on a 0.35 wide stair");
            Assert.Greater(offset, 0.012f * 2f, "much wider than the old 0.012-0.024 offsets");
        }

        [Test]
        public void TheGuestStartsOnTheBoatSpot_AndEndsOnItsSpotInTheLine()
        {
            Assert.AreEqual(0f, GuestSpacing.SideOffset(Body, 0f, 3f), "at the start");
            Assert.AreEqual(0f, GuestSpacing.SideOffset(Body, 3f, 3f), "at the end");
            Assert.AreEqual(Body * GuestSpacing.SideShare, GuestSpacing.SideOffset(Body, 1.5f, 3f), 1e-6f, "on its side between");
            Assert.Less(GuestSpacing.SideOffset(Body, 0.1f, 3f), GuestSpacing.SideOffset(Body, 0.2f, 3f), "eases onto its side");
        }

        // CAM-141
        static GuestSpacing.Walker Ahead(float distance, int order = 1, Vector3? heading = null, float height = 0f,
            float sideways = 0f, bool onThePath = true) => new GuestSpacing.Walker
        {
            At = new Vector3(sideways, height, distance),
            Heading = heading ?? Vector3.forward,
            Order = order,
            OnThePath = onThePath
        };

        static float Pace(params GuestSpacing.Walker[] others) =>
            GuestSpacing.Pace(Vector3.zero, Vector3.forward, 2, others, Body);

        [Test]
        public void AGuestBehindAnother_StandsStillWhenClose_SlowsDown_AndWalksOnWhenThereIsRoom()
        {
            Assert.AreEqual(0f, Pace(Ahead(0f)), "on the same spot: waits");
            Assert.AreEqual(0f, Pace(Ahead(Body * GuestSpacing.StopBodies)), "one stop distance ahead: waits");
            float between = Pace(Ahead(Body * (GuestSpacing.StopBodies + GuestSpacing.GapBodies) * 0.5f));
            Assert.Greater(between, 0f);
            Assert.Less(between, 1f, "closing in: slower");
            Assert.AreEqual(1f, Pace(Ahead(Body * GuestSpacing.GapBodies + 0.01f)), "far enough: full pace");
            Assert.AreEqual(1f, Pace(), "nobody ahead: full pace");
        }

        [Test]
        public void ALongStep_CannotCarryAGuestIntoOneStandingJustBeyondTheGap()
        {
            // A slow frame at 4x: a 0.36 step, longer than the gap. The guest ahead stands 0.35 away.
            var standing = new List<GuestSpacing.Walker> { Ahead(0.35f) };
            float pace = GuestSpacing.Pace(Vector3.zero, Vector3.forward, 2, standing, Body, 0.36f, out float room);
            Assert.AreEqual(1f, pace, "beyond the gap the pace is full");
            Assert.AreEqual(0.35f - Body * GuestSpacing.StopBodies, room, 1e-5f, "but the step stops behind the guest");
        }

        [Test]
        public void TwoGuestsOnOneSpot_TheOneWhoSetOffFirstGoesFirst()
        {
            var first = new GuestSpacing.Walker { At = Vector3.zero, Heading = Vector3.forward, Order = 1, OnThePath = true };
            var second = new GuestSpacing.Walker { At = Vector3.zero, Heading = Vector3.forward, Order = 2, OnThePath = true };
            var both = new List<GuestSpacing.Walker> { first, second };
            Assert.AreEqual(1f, GuestSpacing.Pace(first.At, first.Heading, 1, both, Body), "the first goes on");
            Assert.AreEqual(0f, GuestSpacing.Pace(second.At, second.Heading, 2, both, Body), "the second waits");
        }

        [Test]
        public void AGuestWhoSetOffFirstButFellBehind_WaitsToo_InsteadOfWalkingThrough()
        {
            var later = new GuestSpacing.Walker { At = new Vector3(0f, 0f, 0.1f), Heading = Vector3.forward, Order = 2, OnThePath = true };
            Assert.AreEqual(0f, GuestSpacing.Pace(Vector3.zero, Vector3.forward, 1, new List<GuestSpacing.Walker> { later }, Body));
        }

        [Test]
        public void TwoGuestsMeetingAtACrossing_OneWaits_NeitherWalksThroughTheOther_BothGoOn()
        {
            // One walks north, one walks east; both reach the crossing at the same moment.
            const float speed = 0.9f, dt = 1f / 60f;
            var at = new[] { new Vector3(0f, 0f, -1f), new Vector3(-1f, 0f, 0f) };
            var heading = new[] { Vector3.forward, Vector3.right };
            var walkers = new List<GuestSpacing.Walker>();
            float closest = float.MaxValue;
            int frames = 0;
            for (; frames < 600 && (at[0].z < 1f || at[1].x < 1f); frames++)
            {
                walkers.Clear();
                for (int i = 0; i < 2; i++)
                    walkers.Add(new GuestSpacing.Walker { At = at[i], Heading = heading[i], Order = i + 1, OnThePath = true });
                for (int i = 0; i < 2; i++)
                    at[i] += heading[i] * speed * dt * GuestSpacing.Pace(at[i], heading[i], i + 1, walkers, Body);
                closest = Mathf.Min(closest, Vector3.Distance(at[0], at[1]));
            }
            Assert.Less(frames, 600, "both go on");
            Assert.GreaterOrEqual(closest, Body * 0.95f, "they never walk through each other");
        }

        [Test]
        public void OnlyTheGuestAheadOnTheSamePathCounts()
        {
            Assert.AreEqual(1f, Pace(Ahead(-0.1f)), "behind");
            Assert.AreEqual(1f, Pace(Ahead(0.1f, sideways: Body)), "beside, with room to pass");
            Assert.AreEqual(1f, Pace(Ahead(0.1f, height: 0.5f)), "on a bridge above");
            Assert.AreEqual(1f, Pace(Ahead(0.1f, heading: Vector3.back)), "coming the other way on its own side");
            Assert.AreEqual(1f, Pace(Ahead(0.1f, onThePath: false)), "arrived and standing at its spot");
            Assert.AreEqual(0f, Pace(Ahead(0.1f, heading: Vector3.right)), "crossing right in front: waits");
        }

        // 60 frames a second, 10 (an editor in the background), and one 0.4 s step (10 frames a second at 4x speed).
        [TestCase(1f / 60f)]
        [TestCase(0.1f)]
        [TestCase(0.4f)]
        public void GuestsSettingOffTogether_WalkOneBehindAnother_AndAllArrive(float dt)
        {
            // Eight guests leave the same boat spot in the same frame and walk a straight 4-unit path at 0.9 a second,
            // as the island does. A guest shows once it has stepped off the spot.
            const int count = 8;
            const float length = 4f, speed = 0.9f;
            var walked = new float[count];
            var walkers = new List<GuestSpacing.Walker>();
            float closest = float.MaxValue;
            int frames = 0;
            for (; frames < 60 * 60; frames++)
            {
                walkers.Clear();
                for (int i = 0; i < count; i++)
                    walkers.Add(new GuestSpacing.Walker
                    {
                        At = new Vector3(0f, 0f, walked[i]), Heading = Vector3.forward, Order = i + 1,
                        OnThePath = walked[i] < length
                    });
                for (int i = 0; i < count; i++)
                    if (walked[i] < length)
                    {
                        float pace = GuestSpacing.Pace(walkers[i].At, Vector3.forward, i + 1, walkers, Body, speed * dt, out float room);
                        walked[i] = Mathf.Min(length, walked[i] + Mathf.Min(speed * dt * pace, room));
                    }

                for (int a = 0; a < count; a++)
                for (int b = a + 1; b < count; b++)
                {
                    bool bothShown = walked[a] > 0f && walked[a] < length && walked[b] > 0f && walked[b] < length;
                    if (bothShown) closest = Mathf.Min(closest, Mathf.Abs(walked[a] - walked[b]));
                }
                bool allThere = true;
                foreach (float w in walked) allThere &= w >= length;
                if (allThere) break;
            }

            Assert.Less(frames * dt, 60f, "everyone arrives within a minute: nobody waits for good");
            Assert.GreaterOrEqual(closest, Body, "two shown guests never overlap");
        }
    }
}
