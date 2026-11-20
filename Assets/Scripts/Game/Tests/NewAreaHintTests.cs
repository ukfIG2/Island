using System.Collections.Generic;
using System.Linq;
using NUnit.Framework;
using ResortEmpire.Game.Ui;
using ResortEmpire.Sim;
using UnityEngine;
using UnityEngine.UI;

namespace ResortEmpire.Game.Tests
{
    // CAM-124: the island screen shows where a new area can be built. These tests build the real island screen
    // (HomeUi) on a bare canvas and press its buttons; nothing is saved.
    public class NewAreaHintTests
    {
        GameObject _canvas;
        string _dir;
        readonly List<BuildingId> _opened = new List<BuildingId>();

        [SetUp]
        public void SetUp()
        {
            // Nothing here should save, but if anything does, it goes into a temporary folder, never the real save.
            _dir = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "island-areahint-" + System.Guid.NewGuid().ToString("N"));
            System.IO.Directory.CreateDirectory(_dir);
            SaveSystem.PathOverride = System.IO.Path.Combine(_dir, "resort_save.json");
            _canvas = new GameObject("TestCanvas", typeof(RectTransform));
            _opened.Clear();
        }

        [TearDown]
        public void TearDown()
        {
            Object.DestroyImmediate(_canvas);
            SaveSystem.PathOverride = null;
            System.IO.Directory.Delete(_dir, true);
        }

        static GameController Game(int wavesCompleted, int coins)
        {
            var t = TuningConfig.Default;
            var ids = new[] { BuildingId.Reception, BuildingId.Restaurant, BuildingId.BeachBar };
            var resort = ResortState.Restore(t, coins, 3, 0, wavesCompleted, 2, ids, new[] { 1, 1, 1 },
                new[] { true, true, false });
            return new GameController(t, resort, wavesCompleted + 1, WaveTable.Default8());
        }

        HomeUi Home(GameController game)
        {
            var sheet = new WorkerSheetUi(_canvas.transform, game, new ToastUi(_canvas.transform));
            var home = new HomeUi(_canvas.transform, game, sheet, b => _opened.Add(b));
            home.Refresh();
            return home;
        }

        Button Visible(string name) =>
            _canvas.GetComponentsInChildren<Button>(false).SingleOrDefault(b => b.name == name);

        // CAM-129
        [Test]
        public void TheBanner_IsAButton_ThatOpensTheWaitingArea()
        {
            Home(Game(3, 0));
            var banner = Visible("UnlockBanner");
            Assert.IsNotNull(banner, "the Pool waits after wave 3, so the banner shows and can be tapped");
            Assert.AreEqual("New area available — tap the site", banner.GetComponentInChildren<Text>().text,
                "the banner keeps its text");

            banner.onClick.Invoke();
            CollectionAssert.AreEqual(new[] { BuildingId.Pool }, _opened);
        }

        [Test]
        public void NoBanner_BeforeAnAreaWaits()
        {
            Home(Game(2, 5000));
            Assert.IsNull(Visible("UnlockBanner"));
        }

        // CAM-130
        [Test]
        public void TheSite_IsLabelledWithTheAreaAndItsPrice_WhetherOrNotTheCoinsAreThere()
        {
            var game = Game(3, 100);
            var home = Home(game);
            Assert.IsTrue(home.SiteLabelShown(BuildingId.Pool, out string text), "Coins still missing: the label shows");
            Assert.AreEqual("Build Pool · 1,200", text);
            Assert.IsFalse(home.SiteLabelShown(BuildingId.Bungalows, out _), "the Bungalows are still locked");

            game.Resort.Coins += 5000;
            home.Refresh();
            Assert.IsTrue(home.SiteLabelShown(BuildingId.Pool, out text), "affordable: the label stays");
            Assert.AreEqual("Build Pool · 1,200", text);
        }

        [Test]
        public void TheSiteLabel_OpensTheOffer_AndGoesAwayOnceTheAreaIsBuilt()
        {
            var game = Game(3, 5000);
            var home = Home(game);
            Visible("SiteLabelPool").onClick.Invoke();
            CollectionAssert.AreEqual(new[] { BuildingId.Pool }, _opened);

            Assert.IsTrue(game.Resort.Unlock(BuildingId.Pool));
            home.Refresh();
            Assert.IsFalse(home.SiteLabelShown(BuildingId.Pool, out _), "built: no label");
            Assert.IsNull(Visible("UnlockBanner"), "and no banner");
        }

        [Test]
        public void NoSiteLabel_WhileTheAreaIsLocked()
        {
            var home = Home(Game(2, 5000));
            Assert.IsFalse(home.SiteLabelShown(BuildingId.Pool, out _));
            Assert.IsNull(Visible("SiteLabelPool"));
        }

        [Test]
        public void NoSiteLabel_DuringAWave()
        {
            var home = Home(Game(3, 5000));
            Assert.IsNotNull(Visible("SiteLabelPool"), "between waves the label shows");
            home.SetVisible(false);                                   // what the island screen does when a wave starts
            Assert.IsNull(Visible("SiteLabelPool"), "during a wave nothing changes on the island");
        }
    }
}
