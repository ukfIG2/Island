using System;
using System.IO;
using System.Linq;
using NUnit.Framework;
using ResortEmpire.Game.Ui;
using ResortEmpire.Sim;
using UnityEngine;
using UnityEngine.UI;

namespace ResortEmpire.Game.Tests
{
    // CAM-133: the building window during a wave. The tests build it on a bare canvas over a real game; whatever the
    // game saves goes into a temporary folder, never into the player's real save.
    public class BuildingWindowTests
    {
        const float Dt = 0.05f;

        GameObject _canvas;
        string _dir;

        [SetUp]
        public void SetUp()
        {
            _dir = Path.Combine(Path.GetTempPath(), "island-window-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(_dir);
            SaveSystem.PathOverride = Path.Combine(_dir, "resort_save.json");
            _canvas = new GameObject("TestCanvas", typeof(RectTransform));
        }

        [TearDown]
        public void TearDown()
        {
            UnityEngine.Object.DestroyImmediate(_canvas);
            SaveSystem.PathOverride = null;
            Directory.Delete(_dir, true);
        }

        // Wave 2 on a new resort: the Beach Bar has no Worker, so its Drinks line grows.
        static GameController Wave2()
        {
            var t = TuningConfig.Default;
            var game = new GameController(t, ResortState.NewGame(t), 2, WaveTable.Default8());
            game.StartNextWave();
            return game;
        }

        static void RunUntil(GameController game, Func<bool> done)
        {
            for (int i = 0; i < 20000 && !done(); i++) game.Tick(Dt);
            Assert.IsTrue(done(), "the wave got there");
        }

        string Text(string name) => _canvas.transform.Find("BuildingWindow/" + name).GetComponent<Text>().text;

        // CAM-138
        [Test]
        public void TheWords_CountSeatsAndGuests_AndNameTheLongWaitCalmly()
        {
            var t = TuningConfig.Default;
            Assert.AreEqual("Worker here", BuildingWindowText.Worker(true));
            Assert.AreEqual("No Worker", BuildingWindowText.Worker(false));
            Assert.AreEqual("2 of 3 seats in use", BuildingWindowText.Seats(2, 3));
            Assert.AreEqual("Nobody waiting", BuildingWindowText.Waiting(0));
            Assert.AreEqual("1 guest waiting", BuildingWindowText.Waiting(1));
            Assert.AreEqual("7 guests waiting", BuildingWindowText.Waiting(7));
            Assert.IsNull(BuildingWindowText.LongWait(t.PatienceGraceSeconds, t), "within the grace nobody minds yet");
            Assert.AreEqual("Guests are waiting a while", BuildingWindowText.LongWait(t.PatienceGraceSeconds + 0.1f, t));
            Assert.AreEqual("Serves Drinks", BuildingWindowText.Serves(NeedId.Drinks));
            Assert.AreEqual("Serves Ocean View · premium", BuildingWindowText.Serves(NeedId.OceanView));
        }

        [Test]
        public void TheWindow_ShowsHowTheBuildingIsDoing_WhileTheWaveRuns()
        {
            var game = Wave2();
            var window = new BuildingWindowUi(_canvas.transform, game);
            RunUntil(game, () => game.ActiveWave.LongestWait(NeedId.Drinks) > game.Tuning.PatienceGraceSeconds);

            window.Open(BuildingId.BeachBar);
            Assert.IsTrue(window.IsOpen);
            var sim = game.ActiveWave;
            Assert.AreEqual("Beach Bar", Text("Title"));
            Assert.AreEqual("Serves Drinks", Text("Serves"));
            Assert.AreEqual("No Worker", Text("Worker"));
            Assert.AreEqual(sim.SeatedCount(NeedId.Drinks) + " of 3 seats in use", Text("Seats"));
            Assert.AreEqual(BuildingWindowText.Waiting(sim.QueueLength(NeedId.Drinks)), Text("Waiting"));
            Assert.AreEqual(UiFactory.StatusWord(sim.StatusOf(NeedId.Drinks)), Text("Status"));
            Assert.AreEqual("Guests are waiting a while", Text("LongWait"));

            window.Open(BuildingId.Reception);
            Assert.AreEqual("Worker here", Text("Worker"), "the same window shows the building tapped last");
        }

        [Test]
        public void TheWindow_NeverShowsASatisfactionNumber_OrHappyAndUnhappyCounts()
        {
            var game = Wave2();
            var window = new BuildingWindowUi(_canvas.transform, game);
            foreach (BuildingId b in new[] { BuildingId.Reception, BuildingId.Restaurant, BuildingId.BeachBar })
            {
                window.Open(b);
                for (int i = 0; i < 600; i++)
                {
                    game.Tick(Dt * 4f);
                    window.Refresh();
                    foreach (var text in _canvas.GetComponentsInChildren<Text>(true).Select(x => x.text.ToLowerInvariant()))
                    {
                        StringAssert.DoesNotContain("%", text);
                        StringAssert.DoesNotContain("satisfaction", text);
                        StringAssert.DoesNotContain("happy", text);
                        StringAssert.DoesNotContain("star", text);
                    }
                }
            }
        }

        // CAM-139
        Button Visible(string name) =>
            _canvas.GetComponentsInChildren<Button>(false).SingleOrDefault(b => b.name == name);

        WorkerSheetUi Sheet(GameController game) =>
            new WorkerSheetUi(_canvas.transform, game, new ToastUi(_canvas.transform));

        [Test]
        public void AtABuildingWithNobodyThere_MoveBringsAWorkerHere()
        {
            var game = Wave2();
            var sheet = Sheet(game);
            var window = new BuildingWindowUi(_canvas.transform, game, sheet);
            window.Open(BuildingId.BeachBar);
            var move = Visible("MoveWorker");
            Assert.AreEqual("Move a Worker here", move.GetComponentInChildren<Text>().text);

            move.onClick.Invoke();
            Assert.IsFalse(window.IsOpen, "the window makes room for the sheet");
            Assert.IsTrue(sheet.IsOpen);
            Assert.AreEqual("Send worker to Beach Bar?", _canvas.transform.Find("WorkerSheet/Title").GetComponent<Text>().text);
        }

        [Test]
        public void AtABuildingWithAWorker_MoveOffersItToTheBuildingThatStandsEmpty()
        {
            var game = Wave2();
            var sheet = Sheet(game);
            var window = new BuildingWindowUi(_canvas.transform, game, sheet);
            window.Open(BuildingId.Reception);
            var move = Visible("MoveWorker");
            Assert.AreEqual("Move this Worker", move.GetComponentInChildren<Text>().text);

            move.onClick.Invoke();
            Assert.IsTrue(sheet.IsOpen);
            Assert.AreEqual("Send worker to Beach Bar?", _canvas.transform.Find("WorkerSheet/Title").GetComponent<Text>().text);
            Assert.IsNotNull(Visible("FromReception"), "and this building is one to take it from");
        }

        [Test]
        public void SpeedUp_IsOfferedWhereTheLineGrows_AndShowsAsAWordWhileItRuns()
        {
            var game = Wave2();
            var window = new BuildingWindowUi(_canvas.transform, game, Sheet(game));
            window.Open(BuildingId.Reception);
            Assert.IsNull(Visible("SpeedUp"), "a calm building is offered nothing");

            RunUntil(game, () => game.ActiveWave.StatusOf(NeedId.Drinks) == NeedStatus.Bottleneck);
            window.Open(BuildingId.BeachBar);
            var speedUp = Visible("SpeedUp");
            Assert.IsNotNull(speedUp, "the Drinks line grows: Speed Up is offered");
            Assert.AreEqual("Speed Up " + game.Tuning.EnergyBoostCost, speedUp.GetComponentInChildren<Text>().text);
            int energy = game.Resort.Energy;

            speedUp.onClick.Invoke();
            Assert.Greater(game.ActiveWave.BoostRemaining(BuildingId.BeachBar), 0f);
            Assert.AreEqual(energy - game.Tuning.EnergyBoostCost, game.Resort.Energy);
            speedUp = Visible("SpeedUp");
            Assert.AreEqual("Speeding up", speedUp.GetComponentInChildren<Text>().text);
            Assert.IsFalse(speedUp.interactable, "a running boost is a word, not a button");
        }

        [Test]
        public void TheWindow_ClosesWhenTheWaveIsOver()
        {
            var game = Wave2();
            var window = new BuildingWindowUi(_canvas.transform, game);
            window.Open(BuildingId.Restaurant);
            RunUntil(game, () => game.CurrentPhase == WavePhase.WaveComplete);
            window.Refresh();
            Assert.IsFalse(window.IsOpen);
        }
    }
}
