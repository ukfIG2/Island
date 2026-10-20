namespace ResortEmpire.Sim
{
    // All values from build-document-prototype-mvp.pdf §4.8 parameter table.
    // Values marked TUNING there are starting points for the economist, not final.
    public sealed class TuningConfig
    {
        public float WaveTimerSeconds = 90f;          // closes ARRIVALS, never the wave (WR3)
        public float WaveIncomingSeconds = 2.5f;      // boat/shuttle transient, spec says ~2-4 s

        public float ServiceTimeSeconds = 12f;        // same for all prototype buildings
        public float UtilizationStaffed = 1.0f;
        public float UtilizationEmpty = 0.33f;        // empty building runs slow, never zero (WR2)

        public int[] CapacityPerLevel = { 3, 5, 7 };  // Lv1/2/3 seats; upgrades change ONLY this
        public int[] UpgradeCostCoins = { 500, 1200 };// Lv1->2, Lv2->3

        public float PatienceGraceSeconds = 10f;      // wait below this contributes 100 %
        public float PatienceFloorAfterSeconds = 30f; // wait above this sits on the unit floor
        public float UnitFloor = 0.25f;               // WR1: UnitFloor < WaveFloor < 3-star bound
        public float WaveFloor = 0.40f;               // worst possible wave result = 1 star

        // 1..5 stars + Perfect: satisfaction >= threshold.
        public float[] RatingThresholds = { 0.40f, 0.55f, 0.70f, 0.80f, 0.90f, 1.00f };
        public int CoinsPerUnit = 16;
        public float[] CoinsRatingMult = { 0.4f, 0.6f, 0.8f, 1.0f, 1.2f, 1.3f }; // 1..5 stars, Perfect
        public int[] EnergyDropByStars = { 0, 1, 2, 3, 5 };                      // 1..5 stars
        public int ResortValuePerStar = 5;            // TUNING — spec leaves the exact gain open

        public int BottleneckThresholdUnits = 4;      // queued units, seated do not count
        public float BottleneckHysteresisSeconds = 3f;
        public float RecoveringGraceSeconds = 12f;    // AC2: after help lands, one service time before the warning may return

        public float OceanViewSatisfactionWeight = 1.5f; // premium need hurts more while waiting
        public float VolumeNeedWeight = 1.0f;

        public int PoolEligibleAfterWave = 3;
        public int BungalowsEligibleAfterWave = 6;
        public int PoolUnlockCostCoins = 1200;
        public int BungalowsUnlockCostCoins = 2500;

        public int EnergyBoostCost = 3;
        public float EnergyBoostDurationSeconds = 15f;
        public float EnergyBoostSpeedFactor = 2.0f;   // Mode A: service_time effectively halved
        public int MaxBoostsPerBuildingPerWave = 1;

        public int RushWaveIndex = 2;                 // Sudden rush lives in wave 2 only
        public float RushTimeSeconds = 45f;
        public int RushUnits = 6;
        public float RushDurationSeconds = 10f;

        public int StartingCoins = 0;
        public int StartingEnergy = 3;

        public static TuningConfig Default => new TuningConfig();
    }
}
