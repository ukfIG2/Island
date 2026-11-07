using ResortEmpire.Sim;
using UnityEngine;
using UnityEngine.UI;

namespace ResortEmpire.Game.Ui
{
    // S2 wave panel on the right: queues, statuses and warnings — never a live satisfaction number.
    public sealed class NeedsPanelUi
    {
        sealed class Row
        {
            public NeedId Need;
            public RectTransform Rect;
            public Text Counter;
            public BarWidget Bar;
            public Text Status;
            public Button Boost;
            public Text BoostLabel;
        }

        const float QueueBarFullUnits = 12f;

        readonly GameController _game;
        readonly GameObject _root;
        readonly Text _title;
        readonly Row[] _rows;
        readonly Text[] _messages = new Text[3];
        readonly Image[] _messageIcons = new Image[3];
        readonly Text _pauseLabel;
        readonly Text _speedLabel;

        public NeedsPanelUi(Transform canvas, GameController game, WorkerSheetUi sheet)
        {
            _game = game;
            var panel = UiFactory.PanelImage(canvas, "NeedsPanel", UiFactory.Panel);
            _root = panel.gameObject;
            UiFactory.PlaceFixed(_root, Vector2.one, Vector2.one, new Vector2(-12f, -96f), new Vector2(520f, 700f));

            _title = UiFactory.Label(panel.transform, "Title", "", 26, UiFactory.Cream, TextAnchor.MiddleLeft, FontStyle.Bold);
            UiFactory.Place(_title.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(20f, -46f), new Vector2(-20f, -10f));

            var needs = (NeedId[])System.Enum.GetValues(typeof(NeedId));
            _rows = new Row[needs.Length];
            for (int i = 0; i < needs.Length; i++)
            {
                var need = needs[i];
                var bg = UiFactory.PanelImage(panel.transform, "Row" + need, UiFactory.PanelShade);
                var rect = UiFactory.PlaceFixed(bg.gameObject, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(16f, -52f), new Vector2(488f, 84f));
                var rowButton = bg.gameObject.AddComponent<Button>();
                rowButton.targetGraphic = bg;
                rowButton.onClick.AddListener(() => sheet.Open(UiFactory.BuildingFor(need)));

                UiFactory.PlaceFixed(UiFactory.Dot(bg.transform, "Dot", UiFactory.NeedColor(need)).gameObject,
                    new Vector2(0f, 1f), new Vector2(0.5f, 0.5f), new Vector2(24f, -24f), new Vector2(18f, 18f));
                var name = UiFactory.Label(bg.transform, "Name", UiFactory.NeedName(need), 25, UiFactory.Cream, TextAnchor.MiddleLeft, FontStyle.Bold);
                UiFactory.Place(name.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(44f, -44f), new Vector2(-250f, -6f));
                var counter = UiFactory.Label(bg.transform, "Counter", "", 23, UiFactory.CreamDim, TextAnchor.MiddleRight);
                UiFactory.PlaceFixed(counter.gameObject, Vector2.one, Vector2.one, new Vector2(-158f, -8f), new Vector2(100f, 32f));
                var boost = UiFactory.TextButton(bg.transform, "Boost", "", 18, UiFactory.Recovering, UiFactory.Panel, null);
                UiFactory.PlaceFixed(boost.gameObject, Vector2.one, Vector2.one, new Vector2(-8f, -8f), new Vector2(142f, 38f));
                UiFactory.PlaceFixed(UiFactory.Icon(boost.transform, "Bolt", UiFactory.Bolt, UiFactory.Panel).gameObject,
                    new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), new Vector2(8f, 0f), new Vector2(22f, 22f));
                UiFactory.Place(UiFactory.ButtonLabel(boost).gameObject, Vector2.zero, Vector2.one, new Vector2(24f, 0f), Vector2.zero);
                boost.onClick.AddListener(() => _game.Boost(UiFactory.BuildingFor(need)));
                var bar = new BarWidget(bg.transform, "QueueBar", new Color(0f, 0f, 0f, 0.35f));
                UiFactory.Place(bar.Root, Vector2.zero, new Vector2(1f, 0f), new Vector2(44f, 14f), new Vector2(-170f, 30f));
                var status = UiFactory.Label(bg.transform, "Status", "", 20, UiFactory.Neutral, TextAnchor.MiddleRight);
                UiFactory.PlaceFixed(status.gameObject, new Vector2(1f, 0f), new Vector2(1f, 0f), new Vector2(-8f, 8f), new Vector2(156f, 30f));

                _rows[i] = new Row
                {
                    Need = need, Rect = rect, Counter = counter, Bar = bar,
                    Status = status, Boost = boost, BoostLabel = UiFactory.ButtonLabel(boost)
                };
            }

            for (int i = 0; i < _messages.Length; i++)
            {
                _messageIcons[i] = UiFactory.Icon(panel.transform, "MessageIcon" + i, UiFactory.Alert, UiFactory.Warning);
                UiFactory.PlaceFixed(_messageIcons[i].gameObject, new Vector2(0f, 1f), new Vector2(0f, 0.5f),
                    new Vector2(22f, -534f - i * 32f), new Vector2(24f, 24f));
                _messages[i] = UiFactory.Label(panel.transform, "Message" + i, "", 22, UiFactory.Cream);
                UiFactory.Place(_messages[i].gameObject, new Vector2(0f, 1f), Vector2.one,
                    new Vector2(54f, -550f - i * 32f), new Vector2(-22f, -518f - i * 32f));
            }

            var pause = UiFactory.TextButton(panel.transform, "Pause", "Pause", 22, UiFactory.PanelLight, UiFactory.Cream, OnPause);
            UiFactory.PlaceFixed(pause.gameObject, new Vector2(1f, 0f), new Vector2(1f, 0f), new Vector2(-136f, 14f), new Vector2(120f, 44f));
            _pauseLabel = UiFactory.ButtonLabel(pause);

            var speed = UiFactory.TextButton(panel.transform, "Speed", "1x", 22, UiFactory.PanelLight, UiFactory.Cream, OnSpeed);
            UiFactory.PlaceFixed(speed.gameObject, new Vector2(1f, 0f), new Vector2(1f, 0f), new Vector2(-16f, 14f), new Vector2(104f, 44f));
            _speedLabel = UiFactory.ButtonLabel(speed);

            _root.SetActive(false);
        }

        void OnPause() => _game.SetPaused(!_game.IsPaused);

        // Dev convenience only; the sim steps in fixed slices either way.
        void OnSpeed()
        {
            _game.SimSpeed = _game.SimSpeed < 2f ? 4f : 1f;
            _speedLabel.text = _game.SimSpeed < 2f ? "1x" : "4x";
        }

        static string CauseMessage(BuildingId building, QueueCause cause)
        {
            string name = GameController.DisplayName(building);
            switch (cause)
            {
                case QueueCause.NoWorker: return name + " has no Worker";
                case QueueCause.TooFewSeats: return name + " needs more seats";
                default: return name + " queue growing";
            }
        }

        public void SetVisible(bool visible)
        {
            if (_root.activeSelf != visible) _root.SetActive(visible);
        }

        public void Refresh()
        {
            var sim = _game.ActiveWave;
            if (sim == null) return;
            _title.text = "Wave " + _game.NextWaveIndex;

            int shown = 0;
            int messageCount = 0;
            foreach (var row in _rows)
            {
                var building = UiFactory.BuildingFor(row.Need);
                bool active = _game.Resort.IsUnlocked(building) && sim.DemandTotal(row.Need) > 0;
                row.Rect.gameObject.SetActive(active);
                if (!active) continue; // locked needs stay hidden, never alarming
                row.Rect.anchoredPosition = new Vector2(16f, -52f - shown * 92f);
                shown++;

                var status = sim.StatusOf(row.Need);
                row.Counter.text = sim.ServedUnits(row.Need) + "/" + sim.DemandTotal(row.Need);
                row.Bar.SetFill(sim.QueueLength(row.Need) / QueueBarFullUnits, UiFactory.StatusColor(status));
                row.Status.text = UiFactory.StatusWord(status);
                row.Status.color = UiFactory.StatusColor(status);

                // Speed Up is offered only where a building is overloaded — an offer, never a gate (build doc §5.3.9).
                // A running boost shows as a word, not a countdown.
                bool boosting = sim.BoostRemaining(building) > 0f;
                bool overloaded = status == NeedStatus.Bottleneck || status == NeedStatus.Recovering;
                if (boosting)
                {
                    row.Boost.gameObject.SetActive(true);
                    row.Boost.interactable = false;
                    row.BoostLabel.text = "Speeding up";
                }
                else if (overloaded && sim.CanBoost(building))
                {
                    row.Boost.gameObject.SetActive(true);
                    row.Boost.interactable = true;
                    row.BoostLabel.text = "Speed Up " + _game.Tuning.EnergyBoostCost;
                }
                else row.Boost.gameObject.SetActive(false);

                // Warnings follow the queue and name what it needs (CAM-31): a Worker or more seats.
                // Recovering reads as the positive signal it is.
                string message = null;
                bool warning = false;
                if (status == NeedStatus.Bottleneck)
                {
                    message = CauseMessage(building, sim.CauseOf(row.Need));
                    warning = true;
                }
                else if (status == NeedStatus.Recovering)
                    message = GameController.DisplayName(building) + " is catching up";
                if (message != null && messageCount < _messages.Length)
                {
                    _messages[messageCount].text = message;
                    _messages[messageCount].color = warning ? UiFactory.Warning : UiFactory.Recovering;
                    _messageIcons[messageCount].enabled = warning;
                    messageCount++;
                }
            }
            for (int i = messageCount; i < _messages.Length; i++)
            {
                _messages[i].text = "";
                _messageIcons[i].enabled = false;
            }

            _pauseLabel.text = _game.IsPaused ? "Resume" : "Pause";
            _speedLabel.text = _game.SimSpeed < 2f ? "1x" : "4x";
        }
    }
}
