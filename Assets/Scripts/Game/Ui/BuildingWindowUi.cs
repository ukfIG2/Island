using ResortEmpire.Sim;
using UnityEngine;
using UnityEngine.UI;

namespace ResortEmpire.Game.Ui
{
    // CAM-133: a window for one building during a wave, so the player can look before deciding to move a Worker. It
    // sits on the left, clear of the wave panel, and the wave keeps running underneath. It shows the Worker, the seats
    // in use, the guests in line, the status word and a calm phrase when guests wait long; no satisfaction number.
    // CAM-139: its buttons move a Worker (here, or from here to the building that stands empty) through the Worker
    // sheet, and offer Speed Up where the wave panel offers it.
    public sealed class BuildingWindowUi
    {
        const float Width = 440f;
        const float HeightWithSpeedUp = 446f;
        const float HeightWithoutSpeedUp = 378f;

        readonly GameController _game;
        readonly WorkerSheetUi _sheet;
        readonly RectTransform _rect;
        readonly Button _move;
        readonly Text _moveLabel;
        readonly Button _speedUp;
        readonly Text _speedUpLabel;
        readonly GameObject _root;
        readonly Text _title;
        readonly Text _serves;
        readonly Text _worker;
        readonly Text _seats;
        readonly Text _waiting;
        readonly Text _status;
        readonly Text _longWait;
        BuildingId? _building;

        public GameObject Root => _root;
        public bool IsOpen => _root.activeSelf;
        public BuildingId? Building => _building;

        // sheet: the Worker sheet the Move button opens; null leaves the button out (tests of the content alone).
        public BuildingWindowUi(Transform canvas, GameController game, WorkerSheetUi sheet = null)
        {
            _game = game;
            _sheet = sheet;
            var panel = UiFactory.PanelImage(canvas, "BuildingWindow", UiFactory.Panel);
            _root = panel.gameObject;
            // Hangs from its top edge, so the buttons stay put when Speed Up comes and goes.
            _rect = UiFactory.PlaceFixed(_root, new Vector2(0f, 0.5f), new Vector2(0f, 1f), new Vector2(20f, 260f),
                new Vector2(Width, HeightWithSpeedUp));
            var card = panel.transform;

            _title = UiFactory.Label(card, "Title", "", 30, UiFactory.Cream, TextAnchor.MiddleLeft, FontStyle.Bold);
            UiFactory.Place(_title.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(24f, -58f), new Vector2(-70f, -14f));
            var close = UiFactory.TextButton(card, "Close", "X", 24, UiFactory.PanelLight, UiFactory.Cream, Close);
            UiFactory.PlaceFixed(close.gameObject, Vector2.one, Vector2.one, new Vector2(-12f, -12f), new Vector2(44f, 44f));

            _serves = Line(card, "Serves", 0, 22, UiFactory.CreamDim);
            _worker = Line(card, "Worker", 1, 24, UiFactory.Cream);
            _seats = Line(card, "Seats", 2, 24, UiFactory.Cream);
            _waiting = Line(card, "Waiting", 3, 24, UiFactory.Cream);
            _status = Line(card, "Status", 4, 24, UiFactory.Neutral);
            _status.fontStyle = FontStyle.Bold;
            _longWait = Line(card, "LongWait", 5, 22, UiFactory.Recovering);   // calm amber, readable on the panel

            _move = UiFactory.TextButton(card, "MoveWorker", "", 26, UiFactory.PanelLight, UiFactory.Cream, OnMove);
            UiFactory.Place(_move.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(24f, -364f), new Vector2(-24f, -304f));
            _moveLabel = UiFactory.ButtonLabel(_move);
            _speedUp = UiFactory.TextButton(card, "SpeedUp", "", 26, UiFactory.Recovering, UiFactory.Panel, OnSpeedUp);
            UiFactory.Place(_speedUp.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(24f, -432f), new Vector2(-24f, -372f));
            UiFactory.PlaceFixed(UiFactory.Icon(_speedUp.transform, "Bolt", UiFactory.Bolt, UiFactory.Panel).gameObject,
                new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), new Vector2(14f, 0f), new Vector2(26f, 26f));
            _speedUpLabel = UiFactory.ButtonLabel(_speedUp);

            _root.SetActive(false);
        }

        // With nobody here, a Worker is brought here. With a Worker here, it is offered to the building that stands
        // empty: the sheet asks there and lists this building as one to take from. The move itself stays free and
        // instant (WR5); the window closes so the sheet has the screen.
        BuildingId? MoveTarget()
        {
            if (_building == null) return null;
            var state = _game.Resort.Get(_building.Value);
            if (state == null) return null;
            if (!state.HasWorker) return _building.Value;
            foreach (var b in _game.Resort.Buildings)
                if (!b.HasWorker) return b.Id;
            return null;
        }

        void OnMove()
        {
            var target = MoveTarget();
            if (target == null || _sheet == null) return;
            Close();
            _sheet.Open(target.Value);
        }

        void OnSpeedUp()
        {
            if (_building != null) SpeedUpOffer.Use(_game, _building.Value);
            Refresh();
        }

        // Text lines under the title, 38 px apart.
        static Text Line(Transform card, string name, int index, int size, Color color)
        {
            var text = UiFactory.Label(card, name, "", size, color);
            float top = -64f - index * 38f;
            UiFactory.Place(text.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(24f, top - 34f), new Vector2(-24f, top));
            return text;
        }

        public void Open(BuildingId building)
        {
            _building = building;
            _root.SetActive(true);
            Refresh();
        }

        public void Close()
        {
            _building = null;
            if (_root.activeSelf) _root.SetActive(false);
        }

        // A few times a second while open. Closes itself once the wave is over or the building is gone.
        public void Refresh()
        {
            if (_building == null) return;
            var sim = _game.ActiveWave;
            var b = _building.Value;
            var state = _game.Resort.Get(b);
            if (sim == null || sim.Phase == WavePhase.WaveComplete || state == null)
            {
                Close();
                return;
            }
            var need = BuildingNeeds.Serves(b);
            var t = _game.Tuning;

            _title.text = GameController.DisplayName(b);
            _serves.text = BuildingWindowText.Serves(need);
            _worker.text = BuildingWindowText.Worker(state.HasWorker);
            _worker.color = state.HasWorker ? UiFactory.WorkerHere : UiFactory.Cream;
            _worker.fontStyle = state.HasWorker ? FontStyle.Normal : FontStyle.Bold;
            int seats = t.CapacityPerLevel[Mathf.Clamp(state.Level, 1, t.CapacityPerLevel.Length) - 1];
            _seats.text = BuildingWindowText.Seats(sim.SeatedCount(need), seats);
            _waiting.text = BuildingWindowText.Waiting(sim.QueueLength(need));
            var status = sim.StatusOf(need);
            _status.text = UiFactory.StatusWord(status);
            _status.color = UiFactory.StatusColor(status);
            _longWait.text = BuildingWindowText.LongWait(sim.LongestWait(need), t) ?? "";

            var target = MoveTarget();
            bool canMove = _sheet != null && target != null;
            _move.gameObject.SetActive(canMove);
            if (canMove) _moveLabel.text = state.HasWorker ? "Move this Worker" : "Move a Worker here";

            string speedUp = SpeedUpOffer.Label(_game, b, out bool canPress);
            _speedUp.gameObject.SetActive(speedUp != null);
            if (speedUp != null)
            {
                _speedUp.interactable = canPress;
                _speedUpLabel.text = speedUp;
            }
            _rect.sizeDelta = new Vector2(Width, speedUp != null ? HeightWithSpeedUp : HeightWithoutSpeedUp);
        }
    }
}
