using System;
using System.IO;
using NUnit.Framework;
using ResortEmpire.Sim;

namespace ResortEmpire.Game.Tests
{
    // CAM-50: the main menu says PLAY for a new resort and CONTINUE for one that is under way.
    // CAM-125: New Game and the start-over question appear only when there is something to start over.
    public class MainMenuTests
    {
        // Finishing a wave saves the game; each test saves into its own temporary folder, never into the player's real save.
        static void InTempFolder(Action body)
        {
            string dir = Path.Combine(Path.GetTempPath(), "island-menu-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(dir);
            SaveSystem.PathOverride = Path.Combine(dir, "resort_save.json");
            try { body(); }
            finally
            {
                SaveSystem.PathOverride = null;
                Directory.Delete(dir, true);
            }
        }

        static GameController NewGame()
        {
            var tuning = TuningConfig.Default;
            return new GameController(tuning, ResortState.NewGame(tuning), 1, WaveTable.Default8());
        }

        [Test]
        public void ANewResort_HasNoProgress()
        {
            Assert.IsFalse(NewGame().HasProgress);
        }

        [Test]
        public void AWaveUnderWay_IsProgress()
        {
            InTempFolder(() =>
            {
                var game = NewGame();
                game.StartNextWave();
                Assert.IsTrue(game.HasProgress);
            });
        }

        [Test]
        public void AFinishedWave_IsProgress_EvenAfterTheResultIsClaimed()
        {
            InTempFolder(() =>
            {
                var game = NewGame();
                game.StartNextWave();
                for (int i = 0; i < 3000 && game.CurrentPhase != WavePhase.WaveComplete; i++) game.Tick(1f);
                Assert.AreEqual(WavePhase.WaveComplete, game.CurrentPhase);
                game.ContinueAfterResults();
                Assert.IsNull(game.ActiveWave, "between waves again");
                Assert.IsTrue(game.HasProgress);
            });
        }

        // CAM-131: on a new resort New Game would do what PLAY does, so it is not shown and Settings takes its place.
        [Test]
        public void NewGame_ShowsOnlyWhenThereIsProgress_AndSettingsMovesUpWhenItIsGone()
        {
            var canvas = new UnityEngine.GameObject("TestCanvas", typeof(UnityEngine.RectTransform));
            try
            {
                var menu = new Ui.MainMenuUi(canvas.transform, null, null, null);
                var settings = (UnityEngine.RectTransform)menu.Root.transform.Find("Card/Settings");
                var newGame = (UnityEngine.RectTransform)menu.Root.transform.Find("Card/NewGame");

                menu.Show(false);
                Assert.IsFalse(menu.NewGameShown, "a new resort has nothing to start over");
                Assert.AreEqual(newGame.anchoredPosition.y, settings.anchoredPosition.y, "Settings sits where New Game was");

                menu.Show(true);
                Assert.IsTrue(menu.NewGameShown, "a resort under way can start over");
                Assert.Less(settings.anchoredPosition.y, newGame.anchoredPosition.y, "Settings is below New Game again");

                menu.Show(false);
                Assert.IsFalse(menu.NewGameShown, "and it goes away again after a start over");
            }
            finally
            {
                UnityEngine.Object.DestroyImmediate(canvas);
            }
        }
    }
}
