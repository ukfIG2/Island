using System;
using System.Collections.Generic;
using ResortEmpire.Sim;

namespace ResortEmpire.Game
{
    // CAM-113: what the Resort summary after the last wave shows. Plain C# on purpose, so it can be tested.
    public sealed class FinaleSummary
    {
        public int WavesCleared, TotalWaves, Stars, MaxStars, ResortValue;
        public List<string> Buildings = new List<string>();     // for example "Reception Lv 3"

        public static FinaleSummary For(ResortState resort, IReadOnlyList<WaveDef> waves)
        {
            var summary = new FinaleSummary
            {
                TotalWaves = waves.Count,
                WavesCleared = Math.Min(resort.WavesCompleted, waves.Count),
                Stars = resort.StarsEarned,
                MaxStars = waves.Count * 5,
                ResortValue = resort.ResortValue
            };
            foreach (var building in resort.Buildings)
                summary.Buildings.Add(GameController.DisplayName(building.Id) + " Lv " + building.Level);
            return summary;
        }
    }
}
