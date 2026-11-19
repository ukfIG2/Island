using NUnit.Framework;
using ResortEmpire.Sim;

namespace ResortEmpire.Game.Tests
{
    // CAM-135: the vessel waits for its guests and takes them home after the wave. Visual only.
    public class HomecomingTests
    {
        // CAM-142
        [Test]
        public void TheVessel_WaitsAtTheBeachForTheWholeWave_WaveCompleteIncluded()
        {
            Assert.IsTrue(Homecoming.VesselWaits(WavePhase.WaveIncoming), "coming in");
            Assert.IsTrue(Homecoming.VesselWaits(WavePhase.WaveActive), "while guests arrive, and after arrivals close");
            Assert.IsTrue(Homecoming.VesselWaits(WavePhase.WaveResolving), "while the last guests are served");
            Assert.IsTrue(Homecoming.VesselWaits(WavePhase.WaveComplete), "on the result");
            Assert.IsFalse(Homecoming.VesselWaits(null), "between waves");
            Assert.IsFalse(Homecoming.VesselWaits(WavePhase.AwaitingWave));
        }
    }
}
