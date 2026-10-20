using System;

namespace ResortEmpire.Sim
{
    // One rating scale for waves and VIP visits (P2): tier 0..5 = 1..5 stars, then Perfect.
    public static class RatingScale
    {
        // Highest threshold the satisfaction reaches (small tolerance for float sums); 0 below the 1-star bound.
        public static int TierFor(float satisfaction, TuningConfig t)
        {
            for (int i = t.RatingThresholds.Length - 1; i >= 0; i--)
                if (satisfaction >= t.RatingThresholds[i] - 1e-5f) return i;
            return 0;
        }

        public static int StarsFor(int tier) => Math.Min(tier + 1, 5);

        public static bool IsPerfect(int tier, TuningConfig t) => tier == t.RatingThresholds.Length - 1;
    }
}
