using System;

namespace ResortEmpire.Sim
{
    // Plain save data for ResortState (between waves). Public fields only — ints, int arrays and a
    // string array — so UnityEngine.JsonUtility can serialize it as-is. Build it with
    // ResortState.ToSnapshot(), rebuild with ResortState.FromSnapshot(tuning, snapshot).
    [Serializable]
    public sealed class ResortSnapshot
    {
        public const int CurrentVersion = 1;

        public int version = CurrentVersion;
        public int coins;
        public int energy;
        public int resortValue;
        public int wavesCompleted;
        public int reputation;
        public int materials;
        public int gems;
        public int hiredWorkers;      // workers bought with Coins so far (drives the hire price)

        // Parallel per-building arrays, in unlock order.
        public int[] buildingIds;     // (int)BuildingId
        public int[] levels;          // 1-based
        public int[] workerCounts;    // workers standing on that building (0 for the Spa)

        public int[] managerIds;      // (int)BuildingId of every building with a hired Manager
        public int[] specialistIds;   // (int)SpecialistId of every hired Specialist
        public string[] decor;        // owned decor ids, in the order they were won
    }
}
