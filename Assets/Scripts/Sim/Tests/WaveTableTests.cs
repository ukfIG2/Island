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

        // CAM-28: after wave 8 the waves are generated from wave 8, so the game can go on for as long as the player likes.
        [Test]
        public void WaveFor_GivesTheScriptedTableForWavesOneToEight()
        {
            var table = WaveTable.Default8();
            for (int w = 1; w <= 8; w++)
            {
                var wave = WaveTable.WaveFor(w);
                Assert.AreEqual(w, wave.Index);
                Assert.AreEqual(table[w - 1].HasSuddenRush, wave.HasSuddenRush, "rush in wave " + w);
                Assert.AreEqual(table[w - 1].IsDebut, wave.IsDebut, "debut flag of wave " + w);
                CollectionAssert.AreEquivalent(table[w - 1].Demand, wave.Demand, "demand of wave " + w);
            }
        }

        [Test]
        public void EndlessWaves_GrowEveryNeedBySixPercentOverWaveEight_AndBringNoNewNeed()
        {
            var t = TuningConfig.Default;
            var last = WaveTable.Default8()[7];
            for (int index = 9; index <= 40; index++)
            {
                var wave = WaveTable.WaveFor(index, t);
                Assert.AreEqual(index, wave.Index);
                Assert.IsFalse(wave.IsDebut, "generated waves never debut");
                CollectionAssert.AreEquivalent(last.Demand.Keys, wave.Demand.Keys, "no new need in wave " + index);
                foreach (var pair in last.Demand)
                {
                    int expected = (int)System.Math.Round(pair.Value * System.Math.Pow(1.06, index - 8),
                        System.MidpointRounding.AwayFromZero);
                    Assert.AreEqual(expected, wave.Demand[pair.Key], "wave " + index + ", " + pair.Key);
                }
            }
            Assert.AreEqual(33, WaveTable.WaveFor(9, t).Demand[NeedId.Rooms], "31 x 1.06, rounded");
            Assert.AreEqual(37, WaveTable.WaveFor(9, t).Demand[NeedId.Drinks], "35 x 1.06, rounded");
        }

        [Test]
        public void EndlessWaves_NeverShrink_AndEveryThirdOneCarriesTheSuddenRush()
        {
            var t = TuningConfig.Default;
            int previousTotal = 0;
            for (int index = 8; index <= 60; index++)
            {
                var wave = WaveTable.WaveFor(index, t);
                int total = 0;
                foreach (var units in wave.Demand.Values) total += units;
                Assert.GreaterOrEqual(total, previousTotal, "wave " + index + " is never smaller than the one before");
                previousTotal = total;
                if (index > 8) Assert.AreEqual(index % 3 == 0, wave.HasSuddenRush, "rush in wave " + index);
            }
        }

        [Test]
        public void EndlessWaves_AreTheSameEveryTimeTheyAreAskedFor()
        {
            var t = TuningConfig.Default;
            var a = WaveTable.WaveFor(17, t);
            var b = WaveTable.WaveFor(17, t);
            Assert.AreNotSame(a, b, "a fresh wave each time, so nobody can change the table by accident");
            CollectionAssert.AreEquivalent(a.Demand, b.Demand);
            Assert.Throws<System.ArgumentOutOfRangeException>(() => WaveTable.WaveFor(0));
        }
    }
}
