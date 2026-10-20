using System;
using ResortEmpire.Sim;
using UnityEngine;
using UnityEngine.UI;

namespace ResortEmpire.Game.Ui
{
    // Staff screen (Jira FR-47/48/49, build doc §5.3.2), between waves only: one Manager per open wave
    // building and the two Specialists for VIP guests, each hired once for Coins. Workers are hired from a
    // building's action card or S5, because each hire needs a building with a free slot.
    public sealed class StaffUi
    {
        sealed class Row
        {
            public RectTransform Rect;
            public Text Name;
            public Text Detail;
            public ActionSlot Action;
        }

        // Card 1040 wide; rows 960 x 68 every 76 px. Height follows the rows shown: at most
        // 130 + 42 + 5*76 + 10 + 42 + 2*76 + 6 + 40 + 116 = 918, centered 36 px low, so the card spans
        // 45..963 from the bottom and stays clear of the top bar (ends 1008 from the bottom).
        const float CardWidth = 1040f;
        const float RowWidth = 960f;
        const float RowHeight = 68f;
        const float RowStep = 76f;
        const float FirstSectionTop = 130f;

        static readonly SpecialistId[] Specialists = (SpecialistId[])Enum.GetValues(typeof(SpecialistId));

        readonly GameController _game;
        readonly Action _onClosed;
        readonly GameObject _root;
        readonly RectTransform _card;
        readonly RectTransform _managersHeader;
        readonly Row[] _managers;
        readonly RectTransform _specialistsHeader;
        readonly Row[] _specialists;
        readonly RectTransform _workersRow;
        readonly Text _workers;

        public GameObject Root => _root;
        public bool Visible => _root.activeSelf;

        public StaffUi(Transform canvas, GameController game, Action onClosed)
        {
            _game = game;
            _onClosed = onClosed;
            _root = UiFactory.Overlay(canvas, "Staff", new Color(0f, 0f, 0f, 0.45f)).gameObject;

            var cardImg = UiFactory.PanelImage(_root.transform, "Card", UiFactory.Panel);
            _card = UiFactory.PlaceFixed(cardImg.gameObject, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0f, -36f), new Vector2(CardWidth, 900f));
            var c = _card.transform;

            var title = UiFactory.Label(c, "Title", "Staff", 42, UiFactory.Cream, TextAnchor.MiddleCenter, FontStyle.Bold);
            UiFactory.Place(title.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(30f, -80f), new Vector2(-30f, -24f));
            var subtitle = UiFactory.Label(c, "Subtitle", "Hired once, they stay with your resort.", 22, UiFactory.CreamDim, TextAnchor.MiddleCenter);
            UiFactory.Place(subtitle.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(30f, -114f), new Vector2(-30f, -84f));

            string effect = UiFactory.ManagerEffect(game.Tuning);
            _managersHeader = Header(c, "ManagersHeader", "Managers", "One per building · " + effect);
            _managers = new Row[UiFactory.WaveBuildings.Length];
            for (int i = 0; i < _managers.Length; i++)
            {
                var b = UiFactory.WaveBuildings[i];
                _managers[i] = BuildRow(c, "Manager" + b, UiFactory.Cream, () => _game.HireManager(b));
                _managers[i].Name.text = UiFactory.ManagerTitle(b);
                _managers[i].Detail.text = GameController.DisplayName(b) + " · " + effect;
            }

            _specialistsHeader = Header(c, "SpecialistsHeader", "Specialists", "For VIP guests · no building needed");
            _specialists = new Row[Specialists.Length];
            for (int i = 0; i < _specialists.Length; i++)
            {
                var s = Specialists[i];
                _specialists[i] = BuildRow(c, "Specialist" + s, UiFactory.Gold, () => _game.HireSpecialist(s));
                _specialists[i].Name.text = UiFactory.SpecialistTitle(s);
                _specialists[i].Detail.text = "For VIP guests";
            }

            var workers = UiFactory.Row(c, "Workers", 10f);
            _workersRow = workers;
            UiFactory.PlaceFixed(workers.gameObject, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), Vector2.zero, new Vector2(RowWidth, 30f));
            UiFactory.RowIcon(workers, "Icon", UiFactory.Person, UiFactory.Cta, 26f);
            _workers = UiFactory.Label(workers, "Text", "", 22, UiFactory.CreamDim);

            var done = UiFactory.TextButton(c, "Done", "Done", 32, UiFactory.Cta, UiFactory.Cream, Close);
            UiFactory.PlaceFixed(done.gameObject, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0f, 24f), new Vector2(320f, 76f));

            _root.SetActive(false);
        }

        static RectTransform Header(Transform card, string name, string title, string note)
        {
            var go = UiFactory.Go(card, name);
            var rect = UiFactory.PlaceFixed(go, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), Vector2.zero, new Vector2(RowWidth, 34f));
            var head = UiFactory.Label(go.transform, "Title", title, 26, UiFactory.Gold, TextAnchor.MiddleLeft, FontStyle.Bold);
            UiFactory.Place(head.gameObject, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
            var sub = UiFactory.Label(go.transform, "Note", note, 20, UiFactory.CreamDim, TextAnchor.MiddleRight);
            UiFactory.Place(sub.gameObject, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
            return rect;
        }

        static Row BuildRow(Transform card, string name, Color iconColor, UnityEngine.Events.UnityAction onHire)
        {
            var bg = UiFactory.PanelImage(card, name, UiFactory.PanelShade);
            bg.raycastTarget = false;
            var row = new Row
            {
                Rect = UiFactory.PlaceFixed(bg.gameObject, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), Vector2.zero, new Vector2(RowWidth, RowHeight))
            };
            var t = bg.transform;
            UiFactory.PlaceFixed(UiFactory.Icon(t, "Icon", UiFactory.Person, iconColor).gameObject,
                new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), new Vector2(16f, 0f), new Vector2(40f, 40f));
            row.Name = UiFactory.Label(t, "Name", "", 28, UiFactory.Cream, TextAnchor.MiddleLeft, FontStyle.Bold);
            UiFactory.Place(row.Name.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(70f, -36f), new Vector2(-340f, -4f));
            row.Detail = UiFactory.Label(t, "Detail", "", 20, UiFactory.CreamDim);
            UiFactory.Place(row.Detail.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(70f, -64f), new Vector2(-340f, -38f));
            row.Action = new ActionSlot(t, "Hire", 24, UiFactory.Positive, onHire);
            UiFactory.PlaceFixed(row.Action.Root.gameObject, new Vector2(1f, 0.5f), new Vector2(1f, 0.5f), new Vector2(-10f, 0f), new Vector2(300f, 52f));
            return row;
        }

        public void Show()
        {
            if (_game.ActiveWave != null) return; // hiring happens between waves only
            _root.SetActive(true);
            Refresh();
        }

        public void Refresh()
        {
            if (!Visible) return;
            var r = _game.Resort;
            float y = FirstSectionTop;

            _managersHeader.anchoredPosition = new Vector2(0f, -y);
            y += 42f;
            for (int i = 0; i < _managers.Length; i++)
            {
                var b = UiFactory.WaveBuildings[i];
                var row = _managers[i];
                bool open = r.IsUnlocked(b); // Managers only for buildings the resort already has
                row.Rect.gameObject.SetActive(open);
                if (!open) continue;
                row.Rect.anchoredPosition = new Vector2(0f, -y);
                y += RowStep;
                SetAction(row.Action, r.HasManager(b), r.ManagerCost(b));
            }

            y += 10f;
            _specialistsHeader.anchoredPosition = new Vector2(0f, -y);
            y += 42f;
            for (int i = 0; i < _specialists.Length; i++)
            {
                var s = Specialists[i];
                _specialists[i].Rect.anchoredPosition = new Vector2(0f, -y);
                y += RowStep;
                SetAction(_specialists[i].Action, r.HasSpecialist(s), r.SpecialistCost(s));
            }

            y += 6f;
            _workersRow.anchoredPosition = new Vector2(0f, -y);
            y += 40f;
            int workers = 0;
            foreach (var b in UiFactory.WaveBuildings)
            {
                var state = r.Get(b);
                if (state != null) workers += state.WorkerCount;
            }
            _workers.text = "Workers " + workers + " of " + r.WorkerCap + " possible — hire more from a building's card";

            _card.sizeDelta = new Vector2(CardWidth, y + 24f + 76f + 16f); // + Done button and its margins
        }

        void SetAction(ActionSlot slot, bool hired, int cost)
        {
            var r = _game.Resort;
            if (hired) slot.ShowChip("Hired", UiFactory.Positive, UiFactory.Cream);
            else if (cost < 0) slot.ShowNote("Not available yet");
            else if (r.Coins >= cost) slot.ShowButton("Hire — " + UiFactory.Num(cost) + " Coins");
            else slot.ShowChip("<size=21>" + UiFactory.MissingText(r, cost, 0) + "</size>");
        }

        void Close()
        {
            if (!Visible) return;
            _root.SetActive(false);
            _onClosed?.Invoke();
        }
    }
}
