namespace ResortEmpire.Sim
{
    public enum NeedId
    {
        Rooms,
        Drinks,
        Food,
        Relax,
        OceanView
    }

    public enum BuildingId
    {
        Reception,
        Restaurant,
        BeachBar,
        Pool,
        Bungalows
    }

    // Spec (project rules §6): the calm state is AwaitingWave; the i-word is banned project-wide.
    public enum WavePhase
    {
        AwaitingWave,
        WaveIncoming,
        WaveActive,
        WaveResolving,
        WaveComplete
    }

    public enum NeedStatus
    {
        Locked,
        Ok,
        Bottleneck,
        Recovering,
        Satisfied
    }

    public static class BuildingNeeds
    {
        // Build doc §4.5: Reception = hotel block -> Rooms; Bungalows = premium ocean huts -> OceanView.
        public static NeedId Serves(BuildingId building)
        {
            switch (building)
            {
                case BuildingId.Reception: return NeedId.Rooms;
                case BuildingId.Restaurant: return NeedId.Food;
                case BuildingId.BeachBar: return NeedId.Drinks;
                case BuildingId.Pool: return NeedId.Relax;
                case BuildingId.Bungalows: return NeedId.OceanView;
                default: return NeedId.Rooms;
            }
        }
    }
}
