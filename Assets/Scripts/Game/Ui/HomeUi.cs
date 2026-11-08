using ResortEmpire.Sim;
using UnityEngine;
using UnityEngine.UI;

namespace ResortEmpire.Game.Ui
{
    // S1 between-waves screen: forecast card, the one START WAVE CTA, unlock banner, building action card.
    public sealed class HomeUi
    {
        sealed class ForecastRow
        {
            public NeedId Need;
            public RectTransform Rect;
            public Text Count;
        }

        readonly GameController _game;
        readonly WorkerSheetUi _sheet;
        readonly GameObject _root;
        readonly Button _start;
        readonly Text _startLabel;
        readonly RectTransform _forecastRect;
        readonly Text _forecastTitle;
        readonly ForecastRow[] _rows;
        readonly GameObject _banner;
        readonly Text _complete;

        readonly GameObject _card;
        readonly Text _cardTitle;
        readonly Text _cardInfo;
        readonly Button _upgrade;
        readonly Text _upgradeLabel;
        readonly Button _unlock;
        readonly Text _unlockLabel;
        readonly Text _cardNote;
        readonly Button _worker;
        readonly Text _workerLabel;
        BuildingId? _cardBuilding;

        public HomeUi(Transform canvas, GameController game, WorkerSheetUi sheet)
        {
            _game = game;
            _sheet = sheet;
            _root = UiFactory.Go(canvas, "Home");
            UiFactory.Place(_root, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);

            _start = UiFactory.TextButton(_root.transform, "StartWave", "START WAVE", 40, UiFactory.Cta, UiFactory.Cream,
                () => _game.StartNextWave());
            UiFactory.PlaceFixed(_start.gameObject, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0f, 36f), new Vector2(460f, 110f));
            _startLabel = UiFactory.ButtonLabel(_start);

            var forecast = UiFactory.PanelImage(_root.transform, "Forecast", UiFactory.Panel);
            _forecastRect = UiFactory.PlaceFixed(forecast.gameObject, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), new Vector2(20f, 40f), new Vector2(380f, 300f));
            _forecastTitle = UiFactory.Label(forecast.transform, "Title", "Next wave", 28, UiFactory.Cream, TextAnchor.MiddleLeft, FontStyle.Bold);
            UiFactory.Place(_forecastTitle.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(24f, -56f), new Vector2(-24f, -14f));
            var subtitle = UiFactory.Label(forecast.transform, "Subtitle", "guests expected", 20, UiFactory.CreamDim);
            UiFactory.Place(subtitle.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(24f, -88f), new Vector2(-24f, -58f));

            var needs = (NeedId[])System.Enum.GetValues(typeof(NeedId));
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

            _complete = UiFactory.Label(_root.transform, "PrototypeComplete", "Prototype complete — thanks for playing!", 32, UiFactory.Cream, TextAnchor.MiddleCenter, FontStyle.Bold);
            UiFactory.PlaceFixed(_complete.gameObject, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0f, 200f), new Vector2(1000f, 44f));
            var outline = _complete.gameObject.AddComponent<Outline>();
            outline.effectColor = new Color(0f, 0f, 0f, 0.45f);

            // Building action card: one at a time, bottom right, X to close.
            var cardImg = UiFactory.PanelImage(_root.transform, "ActionCard", UiFactory.Panel);
            _card = cardImg.gameObject;
            UiFactory.PlaceFixed(_card, new Vector2(1f, 0f), new Vector2(1f, 0f), new Vector2(-20f, 24f), new Vector2(440f, 304f));

            _cardTitle = UiFactory.Label(_card.transform, "Title", "", 30, UiFactory.Cream, TextAnchor.MiddleLeft, FontStyle.Bold);
            UiFactory.Place(_cardTitle.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(24f, -58f), new Vector2(-70f, -14f));

            var close = UiFactory.TextButton(_card.transform, "Close", "X", 24, UiFactory.PanelLight, UiFactory.Cream, CloseCard);
            UiFactory.PlaceFixed(close.gameObject, Vector2.one, Vector2.one, new Vector2(-12f, -12f), new Vector2(44f, 44f));

            _cardInfo = UiFactory.Label(_card.transform, "Info", "", 24, UiFactory.CreamDim);
            UiFactory.Place(_cardInfo.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(24f, -96f), new Vector2(-24f, -62f));

            _upgrade = UiFactory.TextButton(_card.transform, "Upgrade", "", 26, UiFactory.Positive, UiFactory.Cream, OnUpgrade);
            UiFactory.Place(_upgrade.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(24f, -164f), new Vector2(-24f, -106f));
            _upgradeLabel = UiFactory.ButtonLabel(_upgrade);

            _unlock = UiFactory.TextButton(_card.transform, "Unlock", "", 26, UiFactory.Positive, UiFactory.Cream, OnUnlock);
            UiFactory.Place(_unlock.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(24f, -164f), new Vector2(-24f, -106f));
            _unlockLabel = UiFactory.ButtonLabel(_unlock);

            _cardNote = UiFactory.Label(_card.transform, "Note", "", 22, UiFactory.CreamDim);
            UiFactory.Place(_cardNote.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(24f, -204f), new Vector2(-24f, -170f));

            _worker = UiFactory.TextButton(_card.transform, "Worker", "", 26, UiFactory.PanelLight, UiFactory.Cream, OnWorker);
            UiFactory.Place(_worker.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(24f, -272f), new Vector2(-24f, -214f));
            _workerLabel = UiFactory.ButtonLabel(_worker);

            _card.SetActive(false);
        }

        void OnUpgrade()
        {
            if (_cardBuilding != null) _game.Upgrade(_cardBuilding.Value);
        }

        void OnUnlock()
        {
            if (_cardBuilding != null) _game.Unlock(_cardBuilding.Value);
        }

        void OnWorker()
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
            _start.gameObject.SetActive(wave != null);
            if (wave != null) _startLabel.text = "START WAVE " + wave.Index;
            _complete.gameObject.SetActive(wave == null);
            RefreshForecast(wave);
            _banner.SetActive(UnlockWaiting());
            RefreshCard();
        }

        // The forecast shows the scripted demand only; a Sudden rush is never announced.
        void RefreshForecast(WaveDef wave)
        {
            _forecastRect.gameObject.SetActive(wave != null);
            if (wave == null) return;
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

        bool UnlockWaiting()
        {
            var r = _game.Resort;
            var t = _game.Tuning;
            if (!r.IsUnlocked(BuildingId.Pool) && r.WavesCompleted >= t.PoolEligibleAfterWave) return true;
            return !r.IsUnlocked(BuildingId.Bungalows) && r.WavesCompleted >= t.BungalowsEligibleAfterWave;
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
            var t = _game.Tuning;
            _card.SetActive(true);
            _cardTitle.text = GameController.DisplayName(b);

            var state = r.Get(b);
            if (state == null)
            {
                _upgrade.gameObject.SetActive(false);
                _worker.gameObject.SetActive(false);
                _cardInfo.text = "Locked area";
                int afterWave = b == BuildingId.Pool ? t.PoolEligibleAfterWave : t.BungalowsEligibleAfterWave;
                int cost = b == BuildingId.Pool ? t.PoolUnlockCostCoins : t.BungalowsUnlockCostCoins;
                bool can = r.CanUnlock(b, out _);
                _unlock.gameObject.SetActive(can);
                _unlockLabel.text = "Unlock – " + cost + " Coins";
                _cardNote.text = can ? ""
                    : r.WavesCompleted < afterWave
                        ? "Finish wave " + afterWave + " to unlock"
                        : "Unlock costs " + cost + " Coins — the next waves will cover it";
                return;
            }

            _unlock.gameObject.SetActive(false);
            _cardInfo.text = "Lv " + state.Level + " · " + t.CapacityPerLevel[state.Level - 1] + " seats";
            bool maxed = state.Level >= t.CapacityPerLevel.Length;
            int upCost = maxed ? 0 : t.UpgradeCostCoins[state.Level - 1];
            bool canUpgrade = !maxed && _game.ActiveWave == null && r.Coins >= upCost; // never offered during a wave
            _upgrade.gameObject.SetActive(canUpgrade);
            if (canUpgrade) _upgradeLabel.text = "Upgrade – " + upCost + " Coins";
            _cardNote.text = maxed ? "Max level" : canUpgrade ? "" : "Upgrade costs " + upCost + " Coins";
            _worker.gameObject.SetActive(true);
            _worker.interactable = !state.HasWorker;
            _workerLabel.text = state.HasWorker ? "Worker is here" : "Move worker here";
        }
    }
}
