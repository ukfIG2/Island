using System;

namespace ResortEmpire.Sim
{
    // P11: a VIP offer appears after waves 4, 7, 10, ... (one at a time); the types rotate
    // Travel Blogger -> Wedding Couple -> Investor -> Influencer. Holding, "Maybe later" and "Decline"
    // are flow decisions of the game layer.
    public static class VipSchedule
    {
        static readonly int TypeCount = Enum.GetValues(typeof(VipType)).Length;

        // True right after a wave that opens a VIP slot. Without a tuning, TuningConfig.Default.
        public static bool OfferDue(int wavesCompleted, TuningConfig tuning = null)
        {
            var t = tuning ?? TuningConfig.Default;
            if (!t.MvpSystems || t.VipEveryWaves <= 0 || wavesCompleted < t.VipFirstAfterWave) return false;
            return (wavesCompleted - t.VipFirstAfterWave) % t.VipEveryWaves == 0;
        }

        // 1-based number of the slot that wave count opens (after wave 4 -> 1, after 7 -> 2, ...); 0 when none.
        public static int SlotNumber(int wavesCompleted, TuningConfig tuning = null)
        {
            var t = tuning ?? TuningConfig.Default;
            if (!OfferDue(wavesCompleted, t)) return 0;
            return (wavesCompleted - t.VipFirstAfterWave) / t.VipEveryWaves + 1;
        }

        // The guest type of the visitNumber-th visit (1-based), rotating through the four types.
        public static VipType NextType(int visitNumber)
        {
            int i = ((visitNumber - 1) % TypeCount + TypeCount) % TypeCount;
            return (VipType)i;
        }
    }
}
