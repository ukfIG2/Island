using System;
using System.Collections.Generic;
using ResortEmpire.Sim;

namespace ResortEmpire.Game
{
    // The words of the S4 Wave Complete screen. The tone stays "it went well, I can improve it": never a loss screen.
    // Plain C# on purpose, so the wording can be tested without the game running.
    public static class ResultText
    {
        // Floored, not rounded: 89.6 % must not read as the 90 % that a fifth star needs.
        public static int SatisfactionPercent(float satisfaction) => (int)Math.Floor(satisfaction * 100f + 0.001f);

        public static string NeedName(NeedId need) => need == NeedId.OceanView ? "Ocean View" : need.ToString();

        // The needs whose guests waited no longer than the grace time, except the worst one.
        public static string WentWell(WaveResult r, float graceSeconds)
        {
            var quick = new List<NeedId>();
            if (r.AverageWaitByNeed != null)
                foreach (NeedId need in Enum.GetValues(typeof(NeedId)))
                    if (need != r.WorstNeed && r.AverageWaitByNeed.TryGetValue(need, out float wait) && wait <= graceSeconds)
                        quick.Add(need);
            if (quick.Count == 0) return "Every guest was looked after in the end.";

            bool plural = quick.Count > 1 || quick[0] == NeedId.Rooms || quick[0] == NeedId.Drinks;
            var names = new List<string>();
            foreach (var need in quick) names.Add(NeedName(need));
            return JoinNames(names) + (plural ? " were" : " was") + " served quickly.";
        }

        // What to improve, naming the cause when the wave knows it: a Worker, or more seats.
        public static string NeedsImprovement(WaveResult r)
        {
            if (!r.WorstNeed.HasValue) return "Every line stayed short.";
            string building = GameController.DisplayName(BuildingNeeds.BuildingFor(r.WorstNeed.Value));
            switch (r.WorstNeedCause)
            {
                case BottleneckCause.Staffing: return building + " was without a Worker while its line grew.";
                case BottleneckCause.Capacity: return building + " had too few seats for the crowd.";
                default: return "Guests waited longest at the " + building + ".";
            }
        }

        // A picture of the result, never a tally of real guests: nobody leaves during a wave (UI handoff S4).
        public static string LeavingLine(int stars)
        {
            if (stars >= 5) return "";
            if (stars == 4) return "A couple of guests left a little impatient.";
            if (stars == 3) return "A few guests left a bit impatient.";
            return "Quite a few guests left impatient. The resort can do better next time.";
        }

        static string JoinNames(List<string> names)
        {
            if (names.Count == 1) return names[0];
            return string.Join(", ", names.GetRange(0, names.Count - 1)) + " and " + names[names.Count - 1];
        }
    }
}
