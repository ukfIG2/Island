namespace ResortEmpire.Sim
{
    // All values from build-document-prototype-mvp.pdf §4.8 parameter table (prototype) and §5 plus
    // Documentation/MVP_DECISIONS.md §2 (MVP, marked P1..P18 there). Values marked TUNING are starting
    // points for the economist, not final balance.
    //
    // Default   = the MVP rule set.
    // Prototype = the prototype rules (wave-count gates, Lv1-3, no MVP systems); the prototype rule
    //             tests (WR1-WR9) run against it.
    public sealed class TuningConfig
    {
        // --- rule set ---------------------------------------------------------
        public bool UseReputationGates = true;        // S6: unlock gates follow Reputation; false = wave-count gates
        public bool MvpSystems = true;                // Spa, hiring (Workers/Managers/Specialists), VIP offers, comeback gift

        // --- wave flow ----------------------------------------------------------
        public float WaveTimerSeconds = 90f;          // closes ARRIVALS, never the wave (WR3)
        public float WaveIncomingSeconds = 2.5f;      // boat/shuttle transient, spec says ~2-4 s

        public float ServiceTimeSeconds = 12f;        // same for all prototype buildings
        public float UtilizationStaffed = 1.0f;       // exactly one worker
        public float UtilizationEmpty = 0.33f;        // empty building runs slow, never zero (WR2)
        // P8: utilization gained by the 1st, 2nd, 3rd worker on one building (diminishing returns).
        // [0] is the first worker's gain (UtilizationStaffed - UtilizationEmpty); one worker always runs
        // at exactly UtilizationStaffed, so the prototype stays bit-identical.
        public float[] WorkerMarginalUtilization = { 0.67f, 0.30f, 0.15f };

        // --- building levels (Build §5.3.6) -----------------------------------------
        public int MaxLevel = 5;                                 // Prototype: 3
        public int[] CapacityPerLevel = { 3, 5, 7, 7, 10 };      // Lv1..Lv5 seats; Lv4 adds no seats
        public int[] WorkerSlotsPerLevel = { 1, 1, 1, 2, 3 };    // Lv1..Lv5 worker slots
        public int[] QualityTierPerLevel = { 0, 0, 0, 1, 2 };    // Lv1..Lv5 quality tier (P9)
        public int[] UpgradeCostCoins = { 500, 1200, 2500, 5000 }; // Lv1->2, Lv2->3, Lv3->4, Lv4->5
        public int[] UpgradeCostMaterials = { 0, 0, 4, 8 };     // P6: Lv4 and Lv5 also cost Materials
        public float QualityGraceSecondsPerTier = 4f;            // P9: each tier lets that need wait 4 s longer

        public float PatienceGraceSeconds = 10f;      // wait below this contributes 100 %
        public float PatienceFloorAfterSeconds = 30f; // wait above this sits on the unit floor
        public float UnitFloor = 0.25f;               // WR1: UnitFloor < WaveFloor < 3-star bound
        public float WaveFloor = 0.40f;               // worst possible wave result = 1 star

        // 1..5 stars + Perfect: satisfaction >= threshold. VIPs use the same scale (P2).
        public float[] RatingThresholds = { 0.40f, 0.55f, 0.70f, 0.80f, 0.90f, 1.00f };
        public int CoinsPerUnit = 16;
        public float[] CoinsRatingMult = { 0.4f, 0.6f, 0.8f, 1.0f, 1.2f, 1.3f }; // 1..5 stars, Perfect
        public int[] EnergyDropByStars = { 0, 1, 2, 3, 5 };                      // 1..5 stars
        public int ReputationPerWaveStar = 1;         // P5: a wave gives Reputation = its stars
        public int[] MaterialsDropByStars = { 0, 0, 0, 1, 2 }; // P6: 1 at 4 stars, 2 at 5 stars / Perfect
        public int ResortValuePerStar = 5;            // TUNING — spec leaves the exact gain open
        public int ResortValuePerUpgrade = 20;        // TUNING — GDD: Resort Value grows with buildings and upgrades, never decreases
        public int ResortValuePerUnlock = 50;         // TUNING — same GDD rule; a new building counts more than a level
        public int ResortValuePerHire = 10;           // TUNING — each Worker, Manager or Specialist hire
        public int ResortValuePerDecor = 25;          // P17

        public int BottleneckThresholdUnits = 4;      // queued units, seated do not count
        public float BottleneckHysteresisSeconds = 3f;
        public float RecoveringGraceSeconds = 12f;    // AC2: after help lands, one service time before the warning may return

        public float OceanViewSatisfactionWeight = 1.5f; // premium need hurts more while waiting
        public float VolumeNeedWeight = 1.0f;

        // --- unlocks: gate first (Reputation or waves), then Coins buy it (S6) --------------------
        public int PoolEligibleAfterWave = 3;         // wave-count gates, used when !UseReputationGates
        public int BungalowsEligibleAfterWave = 6;
        public int SpaEligibleAfterWave = 10;         // TUNING — only for MVP systems without Reputation gates
        public int PoolReputationGate = 10;           // P5
        public int BungalowsReputationGate = 30;      // P5
        public int SpaReputationGate = 45;            // P3
        public int PoolUnlockCostCoins = 1200;
        public int BungalowsUnlockCostCoins = 2500;
        public int SpaUnlockCostCoins = 3000;         // P3: one level, no upgrades

        // --- staff (Build §5.3.2, §5.3.5) ----------------------------------------------------
        public float WorkerCapRatio = 0.8f;           // hiring stops at floor(ratio x total slots), always below the slots
        public int HireWorkerBaseCost = 400;          // P8
        public int HireWorkerCostStep = 200;          // P8: +200 for each worker already hired
        public float ManagerMultiplier = 1.2f;        // P7: service speed of a building with its Manager
        public int ManagerCostCoins = 800;            // P7
        public int SpecialistCostCoins = 1000;        // P7

        // --- Energy -----------------------------------------------------------------
        public int EnergyBoostCost = 3;               // wave Speed Up, VIP Speed Up and VIP Quality boost (P12)
        public float EnergyBoostDurationSeconds = 15f;
        public float EnergyBoostSpeedFactor = 2.0f;   // Mode A: service_time effectively halved
        public int MaxBoostsPerBuildingPerWave = 1;

        // --- Sudden rush and endless waves -------------------------------------------------
        public int RushWaveIndex = 2;                 // Sudden rush lives in wave 2 of the scripted table
        public float RushTimeSeconds = 45f;
        public int RushUnits = 6;
        public float RushDurationSeconds = 10f;
        public double EndlessGrowthPerWave = 1.06;    // P10: every need x 1.06 per wave after wave 8, rounded
        public int EndlessRushEveryNthWave = 3;       // P10: generated waves 9, 12, 15, ... carry a Sudden rush

        // --- VIP (P2, P4, P11-P13, P17) -------------------------------------------------------
        public int VipFirstAfterWave = 4;             // P11: offers after waves 4, 7, 10, ...
        public int VipEveryWaves = 3;
        public float VipRosterGapCap = 0.70f;         // P13: a missing roster item caps the request at 3 stars
        public float VipQualityBoostAmount = 0.15f;   // P12: Mode B raises a lowered cap by 15 points, once
        public float VipSpeedUpFactor = 0.5f;         // P12: Speed Up halves the remaining time, once
        public float VipMissingServedQuality = 0.40f; // P13: still MISSING when served -> 40 %, never zero
        public float VipBonusSatisfaction = 0.10f;    // P13: a completed bonus request adds +10 (max 100 %)
        public int VipReputationBase = 10;            // P5: 10 + 4 per star (+5 for Perfect)
        public int VipReputationPerStar = 4;
        public int VipReputationPerfectBonus = 5;
        public int[] VipMaterialsByStars = { 1, 2, 2, 3, 3 }; // P6: 1 + half the stars (rounded down), 1..5 stars
        public int VipCoinsBase = 1500;               // TUNING — x CoinsRatingMult, so Perfect = 1950 Coins
        public int[] VipEnergyByStars = { 0, 1, 2, 3, 5 };    // TUNING — same drop as a wave
        public int VipResortValuePerStar = 10;        // TUNING — a VIP is a spike, twice a wave

        // --- economy start and comeback ---------------------------------------------------------
        public int StartingCoins = 0;
        public int StartingEnergy = 3;
        public int StartingMaterials = 3;             // P6
        public int StartingGems = 0;                  // P16
        public long ComebackAfterSeconds = 12L * 60L * 60L; // P14: at least 12 h away
        public int ComebackEnergy = 3;                // P14
        public int ComebackCoins = 150;               // P14

        // P8: service utilization of a wave building staffed by `workers`. 0 workers run at
        // UtilizationEmpty, exactly one at UtilizationStaffed (prototype-identical), each further
        // worker adds its WorkerMarginalUtilization entry (none beyond the table).
        public float WorkerUtilization(int workers)
        {
            if (workers <= 0) return UtilizationEmpty;
            float u = UtilizationStaffed;
            for (int i = 1; i < workers && i < WorkerMarginalUtilization.Length; i++)
                u += WorkerMarginalUtilization[i];
            return u;
        }

        // The MVP rule set.
        public static TuningConfig Default => new TuningConfig();

        // The finished prototype: wave-count gates, Lv1-3 only, one slot per building, no Reputation,
        // Materials, Spa, hiring, VIPs or comeback gift. Everything else is identical to Default.
        public static TuningConfig Prototype => new TuningConfig
        {
            UseReputationGates = false,
            MvpSystems = false,
            MaxLevel = 3,
            ReputationPerWaveStar = 0,
            MaterialsDropByStars = new[] { 0, 0, 0, 0, 0 },
            StartingMaterials = 0,
        };
    }
}
