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
        Bungalows,
        Spa             // MVP VIP building (Build §5.4): no wave need, no worker slot. Always the last value.
    }

    // Build §5.3.2: VIP roster staff that belongs to no building and does nothing in waves.
    public enum SpecialistId
    {
        Butler,
        Captain
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

    // AC2d: is the bottlenecked building empty (Staffing) or too small (Capacity)?
    public enum BottleneckCause
    {
        None,
        Staffing,
        Capacity
    }

    public static class BuildingNeeds
    {
        // Every building except the Spa serves a wave need and has worker slots.
        public static bool IsWaveBuilding(BuildingId building) => building != BuildingId.Spa;

        // Build doc §4.5: Reception = hotel block -> Rooms; Bungalows = premium ocean huts -> OceanView.
        // Only meaningful for wave buildings — check IsWaveBuilding first (the Spa answers Rooms here).
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

        // The wave building that serves a need (never the Spa).
        public static BuildingId BuildingFor(NeedId need)
        {
            switch (need)
            {
                case NeedId.Rooms: return BuildingId.Reception;
                case NeedId.Food: return BuildingId.Restaurant;
                case NeedId.Drinks: return BuildingId.BeachBar;
                case NeedId.Relax: return BuildingId.Pool;
                case NeedId.OceanView: return BuildingId.Bungalows;
                default: return BuildingId.Reception;
            }
        }

        // Build §5.2: the named Manager of each wave building; null for the Spa (it has no Manager).
        public static string ManagerTitle(BuildingId building)
        {
            switch (building)
            {
                case BuildingId.Reception: return "Receptionist";
                case BuildingId.Restaurant: return "Chef";
                case BuildingId.BeachBar: return "Bartender";
                case BuildingId.Pool: return "Lifeguard";
                case BuildingId.Bungalows: return "Bellhop";
                default: return null;
            }
        }

        // Player-facing building name used in sim-built texts (VIP roster labels).
        public static string DisplayName(BuildingId building)
            => building == BuildingId.BeachBar ? "Beach Bar" : building.ToString();
    }
}
