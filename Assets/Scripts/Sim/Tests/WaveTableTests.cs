using NUnit.Framework;

namespace ResortEmpire.Sim.Tests
{
    // CAM-27: the eight waves are the build document's table (section 4.8), unit for unit.
    public class WaveTableTests
    {
        // Rooms, Drinks, Food, Relax, Ocean View
        static readonly int[][] Expected =
        {
            new[] { 8, 8, 6, 0, 0 },        // wave 1: nothing to fix, the player learns to read the panel
            new[] { 12, 16, 10, 0, 0 },     // wave 2: the first bottleneck, and the Sudden rush
            new[] { 16, 18, 14, 0, 0 },     // wave 3: pressure on two needs, then the Pool unlock
            new[] { 16, 18, 14, 8, 0 },     // wave 4: Relax debuts, softly
            new[] { 20, 22, 18, 16, 0 },    // wave 5: the first four-need wave
            new[] { 25, 28, 22, 20, 0 },    // wave 6: the peak before the Bungalows unlock
            new[] { 25, 28, 22, 20, 10 },   // wave 7: Ocean View debuts, softly
            new[] { 31, 35, 28, 25, 16 }    // wave 8: the full resort, the Prototype's finale
        };

        [Test]
        public void TheEightWavesMatchTheBuildDocumentTable()
        {
            var table = WaveTable.Default8();
            Assert.AreEqual(8, table.Count);
            var needs = new[] { NeedId.Rooms, NeedId.Drinks, NeedId.Food, NeedId.Relax, NeedId.OceanView };
            for (int w = 0; w < 8; w++)
            {
                Assert.AreEqual(w + 1, table[w].Index);
                for (int n = 0; n < needs.Length; n++)
                {
                    table[w].Demand.TryGetValue(needs[n], out int units);
                    Assert.AreEqual(Expected[w][n], units, "wave " + (w + 1) + ", " + needs[n]);
                }
            }
        }

        [Test]
        public void OnlyWaveTwoHasTheSuddenRush_AndTheNewNeedsDebutInWavesFourAndSeven()
        {
            var table = WaveTable.Default8();
            for (int w = 0; w < 8; w++)
            {
                Assert.AreEqual(w == 1, table[w].HasSuddenRush, "rush in wave " + (w + 1));
                Assert.AreEqual(w == 3 || w == 6, table[w].IsDebut, "debut flag of wave " + (w + 1));
                Assert.IsFalse(table[w].IsDebut && table[w].HasSuddenRush, "the rush never falls in a debut wave");
            }
        }
    }
}
