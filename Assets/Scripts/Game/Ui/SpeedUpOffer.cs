using ResortEmpire.Sim;

namespace ResortEmpire.Game.Ui
{
    // Speed Up is offered only where a building is overloaded: an offer, never a gate (build doc 5.3.9). A running
    // boost shows as a word, not a countdown. Where Energy is short, the same spot offers the rewarded video (a test
    // stub). One rule for the wave panel's rows and the building window (CAM-139).
    public static class SpeedUpOffer
    {
        // The button's label, or null when nothing is offered. interactable is false while a boost runs.
        public static string Label(GameController game, BuildingId building, out bool interactable)
        {
            interactable = false;
            var sim = game.ActiveWave;
            if (sim == null || sim.Phase == WavePhase.WaveComplete) return null;
            if (sim.BoostRemaining(building) > 0f) return "Speeding up";
            var status = sim.StatusOf(BuildingNeeds.Serves(building));
            if (status != NeedStatus.Bottleneck && status != NeedStatus.Recovering) return null;
            interactable = true;
            if (sim.CanBoost(building)) return "Speed Up " + game.Tuning.EnergyBoostCost;
            if (game.CanOfferTestAd(building)) return NeedsPanelUi.TestAdLabel(game);
            interactable = false;
            return null;
        }

        // Speed Up where Energy is there, the video where it is short.
        public static void Use(GameController game, BuildingId building)
        {
            if (game.CanOfferTestAd(building)) game.WatchTestAd();
            else game.Boost(building);
        }
    }
}
