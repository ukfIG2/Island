using System;
using System.Collections.Generic;
using ResortEmpire.Sim;

namespace ResortEmpire.Game
{
    // CAM-135: a wave is a visit with a beginning and an end. The vessel that brings the guests waits at the beach for
    // them, and at Wave Complete takes them home. Visual only: the simulation, the rating and the next wave never hear
    // of it. Presentation numbers (how many figures walk home, how fast) live here, not in the tuning.
    public static class Homecoming
    {
        // CAM-142: the wave's vessel stays at the beach for as long as its wave lasts, Wave Complete included, instead of
        // leaving when arrivals close; after the wave it waits on while guests are still boarding (CAM-143).
        // phase is null between waves.
        public static bool VesselWaits(WavePhase? phase, bool boarding = false) =>
            boarding || (phase != null && phase != WavePhase.AwaitingWave);

        // CAM-143: at Wave Complete this many figures walk from the buildings back to the vessel and board, a sample of
        // the guests as the arrivals are. The impatient ones go first, together, a little faster; the others follow.
        public const int Walkers = 8;
        public const float ImpatientPace = 1.35f;     // times the normal walking pace
        public const float ImpatientGap = 0.35f;      // seconds between impatient guests setting off
        public const float CalmStart = 1.6f;          // the others set off once the impatient group is under way
        public const float CalmGap = 0.6f;

        public struct Departure
        {
            public float Delay;        // seconds after Wave Complete
            public NeedId Need;        // the building it leaves from
            public bool Impatient;
        }

        // How many of the walkers leave impatient, from the stars, in step with the result's leaving line
        // (ResultText.LeavingLine): nobody at 5 stars, a couple at 4, a few at 3, a visible group at 2 and 1.
        public static int ImpatientGuests(int stars, bool perfect)
        {
            if (perfect || stars >= 5) return 0;
            switch (stars)
            {
                case 4: return 2;
                case 3: return 3;
                case 2: return 5;
                default: return 6;
            }
        }

        // Who walks home and when. needs: the needs whose buildings stand, in a fixed order; guests leave from them in
        // turn. The impatient ones all set off before any calm one.
        public static List<Departure> Plan(int stars, bool perfect, IReadOnlyList<NeedId> needs)
        {
            var plan = new List<Departure>();
            if (needs == null || needs.Count == 0) return plan;
            int impatient = Math.Min(ImpatientGuests(stars, perfect), Walkers);
            float calmStart = impatient > 0 ? Math.Max(CalmStart, (impatient - 1) * ImpatientGap + 0.5f) : 0f;
            for (int i = 0; i < Walkers; i++)
            {
                bool isImpatient = i < impatient;
                plan.Add(new Departure
                {
                    Delay = isImpatient ? i * ImpatientGap : calmStart + (i - impatient) * CalmGap,
                    Need = needs[i % needs.Count],
                    Impatient = isImpatient
                });
            }
            return plan;
        }
    }
}
