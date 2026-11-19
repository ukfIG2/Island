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
    }
}
