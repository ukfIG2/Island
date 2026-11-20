using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using NUnit.Framework;
using ResortEmpire.Game.Ui;
using ResortEmpire.Sim;
using UnityEngine;
using UnityEngine.UI;

namespace ResortEmpire.Game.Tests
{
    // CAM-132: "Start over?" is asked only when there is something to erase. The tests press the real buttons of the
    // app shell; the start-over action itself is a counter here, so no scene is reloaded and no save is deleted.
    public class StartOverTests
    {
        sealed class MemoryStore : ISettingsStore
        {
            readonly Dictionary<string, int> _values = new Dictionary<string, int>();
            public int GetInt(string key, int fallback) => _values.TryGetValue(key, out int v) ? v : fallback;
            public void SetInt(string key, int value) => _values[key] = value;
            public void Save() { }
        }

        GameObject _canvas;
        string _dir;
        int _startedOver;

        [SetUp]
        public void SetUp()
        {
            // Starting a wave may save; it goes into a temporary folder, never into the player's real save.
            _dir = Path.Combine(Path.GetTempPath(), "island-startover-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(_dir);
            SaveSystem.PathOverride = Path.Combine(_dir, "resort_save.json");
            _canvas = new GameObject("TestCanvas", typeof(RectTransform));
            _startedOver = 0;
        }

        [TearDown]
        public void TearDown()
        {
            UnityEngine.Object.DestroyImmediate(_canvas);
            SaveSystem.PathOverride = null;
            Directory.Delete(_dir, true);
        }

        static GameController NewGame()
        {
            var tuning = TuningConfig.Default;
            return new GameController(tuning, ResortState.NewGame(tuning), 1, WaveTable.Default8());
        }

        AppShellUi Shell(GameController game) =>
            new AppShellUi(_canvas.transform, game, new AppSettings(new MemoryStore()), () => _startedOver++);

        // Only a button the player can see: the hidden pause menu has its own Settings button.
        void Press(string name) =>
            _canvas.GetComponentsInChildren<Button>(false).Single(b => b.name == name).onClick.Invoke();

        bool ConfirmShown => _canvas.transform.Find("ConfirmDialog").gameObject.activeSelf;

        [Test]
        public void ANewResort_StartsOverAtOnce_WithoutTheQuestion()
        {
            var shell = Shell(NewGame());
            shell.OpenMainMenu();
            Press("Settings");
            Press("ResetProgress");

            Assert.AreEqual(1, _startedOver, "nothing to erase, so nothing to ask");
            Assert.IsFalse(ConfirmShown);
        }

        [Test]
        public void AResortUnderWay_AsksFirst_AndCancelLeavesItAlone()
        {
            var game = NewGame();
            game.StartNextWave();
            var shell = Shell(game);
            shell.OpenMainMenu();
            Press("NewGame");

            Assert.IsTrue(ConfirmShown, "a resort under way is asked about first");
            Assert.AreEqual(0, _startedOver);

            Press("Cancel");
            Assert.IsFalse(ConfirmShown);
            Assert.AreEqual(0, _startedOver, "Cancel keeps the resort");
            Assert.IsTrue(shell.IsOpen, "and goes back to the main menu");
        }

        [Test]
        public void AResortUnderWay_StartsOverOnlyAfterConfirm()
        {
            var game = NewGame();
            game.StartNextWave();
            var shell = Shell(game);
            shell.OpenMainMenu();
            Press("Settings");
            Press("ResetProgress");
            Assert.IsTrue(ConfirmShown);
            Assert.AreEqual(0, _startedOver);

            Press("Confirm");
            Assert.AreEqual(1, _startedOver);
        }
    }
}
