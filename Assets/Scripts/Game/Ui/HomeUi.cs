using System;
using ResortEmpire.Sim;
using UnityEngine;
using UnityEngine.UI;

namespace ResortEmpire.Game.Ui
{
    // S1 between-waves screen: forecast card, the one START WAVE CTA, the Staff button, unlock banner and
    // the building action card. An eligible construction site opens S9 instead of this card (routed by
    // GameUiDriver). Nothing here is reachable during a wave: the whole root hides then (WR6).
    public sealed class HomeUi
    {
        sealed class ForecastRow
        {
            public NeedId Need;
            public RectTransform Rect;
            public Text Count;
        }

        // Action card, 520 wide, children anchored to its top edge (24 px side padding):
        //   title 14-58 · info 62-94 · upgrade 104-164 · manager 172-232 · workers 244-274 ·
        //   hire worker | move worker 280-340 · 16 px bottom padding.
        const float CardWidth = 520f;
        const float CardHeightBuilt = 356f;
        const float CardHeightSite = 180f;
        const int MaxSlotIcons = 3;

        readonly GameController _game;
        readonly WorkerSheetUi _sheet;
        readonly GameObject _root;
        readonly Text _startLabel;
        readonly RectTransform _forecastRect;
        readonly Text _forecastTitle;
        readonly ForecastRow[] _rows;
        readonly GameObject _banner;

        readonly GameObject _card;
        readonly RectTransform _cardRect;
        readonly Text _cardTitle;
        readonly Text _cardInfo;
        readonly GameObject[] _qualityStars = new GameObject[2];
        readonly ActionSlot _upgrade;
        readonly ActionSlot _manager;
        readonly GameObject _workersRow;
        readonly Text _workersLabel;
        readonly Image[] _slotIcons = new Image[MaxSlotIcons];
        readonly ActionSlot _hireWorker;
        readonly ActionSlot _move;
        BuildingId? _cardBuilding;

        public HomeUi(Transform canvas, GameController game, WorkerSheetUi sheet, Action openStaff)
        {
            _game = game;
            _sheet = sheet;
            _root = UiFactory.Go(canvas, "Home");
            UiFactory.Place(_root, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);

            var start = UiFactory.TextButton(_root.transform, "StartWave", "START WAVE", 40, UiFactory.Cta, UiFactory.Cream,
                () => _game.StartNextWave());
            UiFactory.PlaceFixed(start.gameObject, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0f, 36f), new Vector2(460f, 110f));
            _startLabel = UiFactory.ButtonLabel(start);

            // Secondary button left of START WAVE (730-1190): 510-710, vertically centered on it.
            var staff = UiFactory.TextButton(_root.transform, "Staff", "Staff", 28, UiFactory.PanelLight, UiFactory.Cream,
                () => openStaff?.Invoke());
            UiFactory.PlaceFixed(staff.gameObject, new Vector2(0.5f, 0f), new Vector2(1f, 0f), new Vector2(-250f, 57f), new Vector2(200f, 68f));
            UiFactory.PlaceFixed(UiFactory.Icon(staff.transform, "Icon", UiFactory.Person, UiFactory.Cream).gameObject,
                new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), new Vector2(22f, 0f), new Vector2(30f, 30f));
            UiFactory.Place(UiFactory.ButtonLabel(staff).gameObject, Vector2.zero, Vector2.one, new Vector2(30f, 0f), Vector2.zero);

            var forecast = UiFactory.PanelImage(_root.transform, "Forecast", UiFactory.Panel);
            _forecastRect = UiFactory.PlaceFixed(forecast.gameObject, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), new Vector2(20f, 40f), new Vector2(380f, 300f));
            _forecastTitle = UiFactory.Label(forecast.transform, "Title", "Next wave", 28, UiFactory.Cream, TextAnchor.MiddleLeft, FontStyle.Bold);
            UiFactory.Place(_forecastTitle.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(24f, -56f), new Vector2(-24f, -14f));
            var subtitle = UiFactory.Label(forecast.transform, "Subtitle", "guests expected", 20, UiFactory.CreamDim);
            UiFactory.Place(subtitle.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(24f, -88f), new Vector2(-24f, -58f));

            var needs = (NeedId[])Enum.GetValues(typeof(NeedId));
            _rows = new ForecastRow[needs.Length];
            for (int i = 0; i < needs.Length; i++)
            {
                var row = UiFactory.Go(forecast.transform, "Row" + needs[i]);
                var rect = UiFactory.PlaceFixed(row, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(0f, -100f), new Vector2(380f, 40f));
                UiFactory.PlaceFixed(UiFactory.Dot(row.transform, "Dot", UiFactory.NeedColor(needs[i])).gameObject,
                    new Vector2(0f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(34f, 0f), new Vector2(16f, 16f));
                var name = UiFactory.Label(row.transform, "Name", UiFactory.NeedName(needs[i]), 24, UiFactory.Cream);
                UiFactory.Place(name.gameObject, Vector2.zero, Vector2.one, new Vector2(56f, 0f), new Vector2(-120f, 0f));
                var count = UiFactory.Label(row.transform, "Count", "", 24, UiFactory.Cream, TextAnchor.MiddleRight, FontStyle.Bold);
                UiFactory.PlaceFixed(count.gameObject, new Vector2(1f, 0.5f), new Vector2(1f, 0.5f), new Vector2(-24f, 0f), new Vector2(90f, 36f));
                _rows[i] = new ForecastRow { Need = needs[i], Rect = rect, Count = count };
            }

            _banner = UiFactory.PanelImage(_root.transform, "UnlockBanner", UiFactory.Panel).gameObject;
            UiFactory.PlaceFixed(_banner, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0f, -132f), new Vector2(580f, 52f));
            var bannerText = UiFactory.Label(_banner.transform, "Text", "New area available — tap the site", 24, UiFactory.Cream, TextAnchor.MiddleCenter);
            UiFactory.Place(bannerText.gameObject, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);

            // Building action card: one at a time, bottom right, X to close.
            var cardImg = UiFactory.PanelImage(_root.transform, "ActionCard", UiFactory.Panel);
            _card = cardImg.gameObject;
            _cardRect = UiFactory.PlaceFixed(_card, new Vector2(1f, 0f), new Vector2(1f, 0f), new Vector2(-20f, 24f), new Vector2(CardWidth, CardHeightBuilt));
            var c = _card.transform;

            _cardTitle = UiFactory.Label(c, "Title", "", 30, UiFactory.Cream, TextAnchor.MiddleLeft, FontStyle.Bold);
            UiFactory.Place(_cardTitle.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(24f, -58f), new Vector2(-70f, -14f));

            var close = UiFactory.TextButton(c, "Close", "X", 24, UiFactory.PanelLight, UiFactory.Cream, CloseCard);
            UiFactory.PlaceFixed(close.gameObject, Vector2.one, Vector2.one, new Vector2(-12f, -12f), new Vector2(44f, 44f));

            // "Lv 4 · 7 seats · 2 worker slots · quality" followed by one star sprite per quality tier.
            var info = UiFactory.Row(c, "Info", 4f, TextAnchor.MiddleLeft);
            UiFactory.Place(info.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(24f, -94f), new Vector2(-24f, -62f));
            _cardInfo = UiFactory.Label(info, "Text", "", 22, UiFactory.CreamDim);
            for (int i = 0; i < _qualityStars.Length; i++)
                _qualityStars[i] = UiFactory.RowIcon(info, "Quality" + i, UiFactory.Star, UiFactory.Gold, 22f).gameObject;

            _upgrade = new ActionSlot(c, "Upgrade", 24, UiFactory.Positive, OnUpgrade);
            UiFactory.Place(_upgrade.Root.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(24f, -164f), new Vector2(-24f, -104f));

            _manager = new ActionSlot(c, "Manager", 22, UiFactory.PanelLight, OnHireManager);
            UiFactory.Place(_manager.Root.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(24f, -232f), new Vector2(-24f, -172f));

            var workers = UiFactory.Row(c, "Workers", 6f, TextAnchor.MiddleLeft);
            UiFactory.Place(workers.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(24f, -274f), new Vector2(-24f, -244f));
            _workersRow = workers.gameObject;
            _workersLabel = UiFactory.Label(workers, "Text", "", 22, UiFactory.Cream, TextAnchor.MiddleLeft, FontStyle.Bold);
            UiFactory.RowGap(workers, 6f);
            for (int i = 0; i < MaxSlotIcons; i++)
                _slotIcons[i] = UiFactory.RowIcon(workers, "Slot" + i, UiFactory.Person, UiFactory.Cta, 24f);

            _hireWorker = new ActionSlot(c, "HireWorker", 22, UiFactory.PanelLight, OnHireWorker);
            UiFactory.Place(_hireWorker.Root.gameObject, new Vector2(0f, 1f), new Vector2(0.5f, 1f), new Vector2(24f, -340f), new Vector2(-6f, -280f));
            _move = new ActionSlot(c, "MoveWorker", 22, UiFactory.PanelLight, OnMoveWorker);
            UiFactory.Place(_move.Root.gameObject, new Vector2(0.5f, 1f), Vector2.one, new Vector2(6f, -340f), new Vector2(-24f, -280f));

            _card.SetActive(false);
        }

        void OnUpgrade()
        {
            if (_cardBuilding != null) _game.Upgrade(_cardBuilding.Value);
        }

        void OnHireManager()
        {
            if (_cardBuilding != null) _game.HireManager(_cardBuilding.Value);
        }

        void OnHireWorker()
        {
            if (_cardBuilding != null) _game.HireWorker(_cardBuilding.Value);
        }

        void OnMoveWorker()
        {
            if (_cardBuilding == null) return;
            var b = _cardBuilding.Value;
            CloseCard();
            _sheet.Open(b);
        }

        public void OpenCard(BuildingId b)
        {
            _cardBuilding = b;
            RefreshCard();
        }

        public void CloseCard()
        {
            _cardBuilding = null;
            _card.SetActive(false);
        }

        public void SetVisible(bool visible)
        {
            if (_root.activeSelf == visible) return;
            _root.SetActive(visible);
            if (!visible) CloseCard();
        }

        public void Refresh()
        {
            var wave = _game.NextWaveDef;
            _startLabel.text = "START WAVE " + wave.Index;
            RefreshForecast(wave);
            var r = _game.Resort;
            _banner.SetActive(r.IsEligible(BuildingId.Pool) || r.IsEligible(BuildingId.Bungalows));
            RefreshCard();
        }

        void RefreshForecast(WaveDef wave)
        {
            _forecastTitle.text = "Next wave " + wave.Index;
            int shown = 0;
            foreach (var row in _rows)
            {
                bool active = wave.Demand.TryGetValue(row.Need, out int demand) && demand > 0
                    && _game.Resort.IsUnlocked(UiFactory.BuildingFor(row.Need)); // locked needs stay hidden
                row.Rect.gameObject.SetActive(active);
                if (!active) continue;
                row.Rect.anchoredPosition = new Vector2(0f, -100f - shown * 44f);
                row.Count.text = demand.ToString();
                shown++;
            }
            _forecastRect.sizeDelta = new Vector2(380f, 112f + shown * 44f);
        }

        void RefreshCard()
        {
            if (_cardBuilding == null || !_root.activeSelf)
            {
                _card.SetActive(false);
                return;
            }
            var b = _cardBuilding.Value;
            var r = _game.Resort;
            _card.SetActive(true);
            _cardTitle.text = GameController.DisplayName(b);

            var state = r.Get(b);
            if (state == null)
            {
                RefreshSite(b);
                return;
            }

            _cardRect.sizeDelta = new Vector2(CardWidth, CardHeightBuilt);
            int tier = Mathf.Max(0, r.QualityTier(b));
            _cardInfo.text = InfoLine(_game, b, state.Level);
            for (int i = 0; i < _qualityStars.Length; i++) _qualityStars[i].SetActive(i < tier);
            _workersRow.SetActive(true);

            RefreshUpgrade(b, state);
            RefreshManager(b);
            RefreshWorkers(b, state);
        }

        // "Lv 4 · 7 seats · 2 worker slots · quality" — the quality tier itself is drawn as star sprites.
        public static string InfoLine(GameController game, BuildingId b, int level)
        {
            var r = game.Resort;
            int slots = r.SlotsOf(b);
            string text = "Lv " + level + " · " + UiFactory.Seats(game.Tuning, level) + " seats · "
                          + slots + (slots == 1 ? " worker slot" : " worker slots");
            if (r.QualityTier(b) > 0) text += " · quality";
            return text;
        }

        // Only sites still behind their gate get here; eligible ones open S9.
        void RefreshSite(BuildingId b)
        {
            _cardRect.sizeDelta = new Vector2(CardWidth, CardHeightSite);
            _cardInfo.text = "Locked area";
            foreach (var star in _qualityStars) star.SetActive(false);
            _upgrade.ShowNote(AreaUnlockUi.GateText(_game, b));
            _manager.Hide();
            _workersRow.SetActive(false);
            _hireWorker.Hide();
            _move.Hide();
        }

        void RefreshUpgrade(BuildingId b, BuildingState state)
        {
            var r = _game.Resort;
            int coins = r.UpgradeCost(b);
            if (coins < 0)
            {
                _upgrade.ShowNote("Max level");
                return;
            }
            int materials = Mathf.Max(0, r.UpgradeMaterialsCost(b));
            int next = state.Level + 1;
            if (UiFactory.CanAfford(r, coins, materials))
                _upgrade.ShowButton("Upgrade to Lv " + next + "\n<size=19>" + UiFactory.CostText(coins, materials) + "</size>");
            else
                _upgrade.ShowChip("Lv " + next + ": " + UiFactory.CostText(coins, materials)
                                  + "\n<size=18>" + UiFactory.MissingText(r, coins, materials) + "</size>");
        }

        void RefreshManager(BuildingId b)
        {
            var r = _game.Resort;
            string title = UiFactory.ManagerTitle(b);
            if (r.HasManager(b))
            {
                _manager.ShowChip(title + " is here", UiFactory.PanelShade, UiFactory.Cream);
                return;
            }
            int cost = r.ManagerCost(b);
            if (cost < 0)
            {
                _manager.Hide();
                return;
            }
            string head = "Hire " + title + " — " + UiFactory.Num(cost) + " Coins";
            if (r.Coins >= cost)
                _manager.ShowButton(head + "\n<size=18>Manager · " + UiFactory.ManagerEffect(_game.Tuning) + "</size>");
            else
                _manager.ShowChip(head + "\n<size=18>" + UiFactory.MissingText(r, cost, 0) + "</size>");
        }

        void RefreshWorkers(BuildingId b, BuildingState state)
        {
            var r = _game.Resort;
            int slots = r.SlotsOf(b);
            int count = state.WorkerCount;
            _workersLabel.text = "Workers " + count + "/" + slots;
            for (int i = 0; i < _slotIcons.Length; i++)
            {
                _slotIcons[i].gameObject.SetActive(i < slots);
                _slotIcons[i].color = i < count ? UiFactory.Cta : new Color(1f, 1f, 1f, 0.22f);
            }

            bool full = count >= slots;
            int cost = r.HireWorkerCost();
            if (cost < 0) _hireWorker.ShowNote("<size=18>Upgrade buildings to\nopen more shifts</size>");
            else if (full) _hireWorker.ShowNote("<size=18>No free shift\nhere right now</size>");
            else if (r.Coins >= cost) _hireWorker.ShowButton("Hire Worker\n<size=18>" + UiFactory.Num(cost) + " Coins</size>");
            else _hireWorker.ShowChip("Hire Worker\n<size=17>" + UiFactory.MissingText(r, cost, 0) + "</size>");

            // Moving is always free (WR5); it needs a free slot here.
            if (full) _move.ShowChip(slots == 1 ? "Worker is here" : "All shifts filled");
            else _move.ShowButton("Move worker here");
        }
    }
}
