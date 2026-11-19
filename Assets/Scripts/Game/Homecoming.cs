using ResortEmpire.Sim;

namespace ResortEmpire.Game
{
    // CAM-135: a wave is a visit with a beginning and an end. The vessel that brings the guests waits at the beach for
    // them. Visual only: the simulation, the rating and the next wave never hear of it.
    public static class Homecoming
    {
        // CAM-142: the wave's vessel stays at the beach for as long as its wave lasts, Wave Complete included, instead of
        // leaving when arrivals close. phase is null between waves.
        public static bool VesselWaits(WavePhase? phase) => phase != null && phase != WavePhase.AwaitingWave;
    }
}
