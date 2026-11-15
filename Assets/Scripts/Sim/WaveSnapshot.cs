using System;

namespace ResortEmpire.Sim
{
    // A wave in progress, written down so it can be rebuilt exactly (CAM-109). Plain serializable data (arrays and
    // public fields only) so Unity's JsonUtility can store it as it is. Together with the resort at the same moment it
    // holds everything the wave needs; nothing is predicted, only the present moment is saved.
    [Serializable]
    public sealed class UnitSnapshot
    {
        public float spawn;      // scheduled arrival time
        public float wait;       // final once seated
        public float progress;   // service progress, 0..1
    }

    [Serializable]
    public sealed class LaneSnapshot
    {
        public int need;                      // NeedId
        public int demand;                    // includes the Sudden rush once it has fired
        public float[] pending;               // sorted spawn times
        public int nextSpawn;
        public UnitSnapshot[] queue;          // in line order, first in line first
        public UnitSnapshot[] seated;
        public int served;
        public float waitSum;
        public float contributionSum;
        public int status;                    // NeedStatus
        public int prevQueue;
        public float nonDecreasingSeconds;
        public float bottleneckSeconds;
        public float unstaffedBottleneckSeconds;   // part of bottleneckSeconds with no Worker on the building
        public float helpGrace;
    }

    [Serializable]
    public sealed class BoostSnapshot
    {
        public int building;                  // BuildingId
        public int used;
        public float remaining;
    }

    [Serializable]
    public sealed class WaveSnapshot
    {
        public const int CurrentVersion = 1;

        public int version = CurrentVersion;
        public int waveIndex;                 // 1-based, as in WaveDef.Index
        public int phase;                     // WavePhase: WaveIncoming, WaveActive or WaveResolving
        public float timeInWave;
        public float incomingElapsed;
        public bool rushTriggered;
        public LaneSnapshot[] lanes;          // one per NeedId, in order
        public BoostSnapshot[] boosts;        // one per BuildingId, in order
    }
}
