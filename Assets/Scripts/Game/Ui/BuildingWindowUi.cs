using ResortEmpire.Sim;
using UnityEngine;
using UnityEngine.UI;

namespace ResortEmpire.Game.Ui
{
    // CAM-133: a window for one building during a wave, so the player can look before deciding to move a Worker. It
    // sits on the left, clear of the wave panel, and the wave keeps running underneath. It shows the Worker, the seats
    // in use, the guests in line, the status word and a calm phrase when guests wait long; no satisfaction number.
    public sealed class BuildingWindowUi
    {
        const float Width = 440f;
        const float Height = 330f;

        readonly GameController _game;
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

        public BuildingWindowUi(Transform canvas, GameController game)
        {
            _game = game;
            var panel = UiFactory.PanelImage(canvas, "BuildingWindow", UiFactory.Panel);
            _root = panel.gameObject;
            UiFactory.PlaceFixed(_root, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), new Vector2(20f, 40f), new Vector2(Width, Height));
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
            _longWait = Line(card, "LongWait", 5, 22, UiFactory.Warning);

            _root.SetActive(false);
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
        }
    }
}
