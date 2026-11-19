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
        readonly List<BuildingId> _opened = new List<BuildingId>();

        [SetUp]
        public void SetUp()
        {
            _canvas = new GameObject("TestCanvas", typeof(RectTransform));
            _opened.Clear();
        }

        [TearDown]
        public void TearDown() => Object.DestroyImmediate(_canvas);

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
    }
}
