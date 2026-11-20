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

        // CAM-130: the "Build Pool · 1,200" label that hangs over a construction site while its area can be built.
        sealed class SiteTag
        {
            public BuildingId Building;
            public RectTransform Rect;
            public Image Background;
            public Text Label;
            public bool Wanted;
        }

        const float SiteTagHeight = 50f;
        const float SiteTagPadding = 36f;

        readonly GameController _game;
        readonly WorkerSheetUi _sheet;
        readonly System.Action<BuildingId> _openArea;
        readonly System.Func<BuildingId, Vector3?> _sitePoint;
        readonly SiteTag[] _siteTags;
        readonly GameObject _root;
        readonly Button _start;
        readonly Text _startLabel;
        readonly RectTransform _forecastRect;
        readonly Text _forecastTitle;
        readonly ForecastRow[] _rows;
        readonly GameObject _banner;

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

        // openArea shows the area offer (S9) for an area that can be built; sitePoint gives where a construction site's
        // label hangs in the world (null in tests without an island).
        public HomeUi(Transform canvas, GameController game, WorkerSheetUi sheet, System.Action<BuildingId> openArea,
            System.Func<BuildingId, Vector3?> sitePoint = null)
        {
            _game = game;
            _sheet = sheet;
            _openArea = openArea;
            _sitePoint = sitePoint;
            _root = UiFactory.Go(canvas, "Home");
            UiFactory.Place(_root, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);

            // First on the screen, so the forecast, the banner and the building card all draw over the site labels.
            var areas = new[] { BuildingId.Pool, BuildingId.Bungalows };
            _siteTags = new SiteTag[areas.Length];
            for (int i = 0; i < areas.Length; i++)
            {
                var area = areas[i];
                var button = UiFactory.TextButton(_root.transform, "SiteLabel" + area, "", 24, UiFactory.Cta, UiFactory.Cream,
                    () => OpenAreaOf(area));
                var rect = UiFactory.PlaceFixed(button.gameObject, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0f),
                    Vector2.zero, new Vector2(240f, SiteTagHeight));
                _siteTags[i] = new SiteTag
                {
                    Building = area, Rect = rect, Background = (Image)button.targetGraphic,
                    Label = UiFactory.ButtonLabel(button)
                };
                button.gameObject.SetActive(false);
            }

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
                if (UiFactory.IsPremium(needs[i]))
                    UiFactory.PlaceFixed(UiFactory.PremiumTag(row.transform).gameObject,
                        new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), new Vector2(188f, 0f), new Vector2(74f, 24f));
                var count = UiFactory.Label(row.transform, "Count", "", 24, UiFactory.Cream, TextAnchor.MiddleRight, FontStyle.Bold);
                UiFactory.PlaceFixed(count.gameObject, new Vector2(1f, 0.5f), new Vector2(1f, 0.5f), new Vector2(-24f, 0f), new Vector2(90f, 36f));
                _rows[i] = new ForecastRow { Need = needs[i], Rect = rect, Count = count };
            }

            // CAM-129: the banner is a button too; it opens the offer of the area that waits. Same place, same text.
            var bannerImage = UiFactory.PanelImage(_root.transform, "UnlockBanner", UiFactory.Panel);
            _banner = bannerImage.gameObject;
            UiFactory.PlaceFixed(_banner, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0f, -132f), new Vector2(580f, 52f));
            var bannerText = UiFactory.Label(_banner.transform, "Text", "New area available — tap the site", 24, UiFactory.Cream, TextAnchor.MiddleCenter);
            UiFactory.Place(bannerText.gameObject, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
            var bannerButton = _banner.AddComponent<Button>();
            bannerButton.targetGraphic = bannerImage;
            bannerButton.onClick.AddListener(OnBanner);

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

        void OnBanner()
        {
            var area = AreaOffer.Waiting(_game.Resort, _game.Tuning);
            if (area == null) return;
            Sound.Sfx.Play(Sound.SoundCue.Click);
            OpenAreaOf(area.Value);
        }

        void OpenAreaOf(BuildingId area)
        {
            CloseCard();
            _openArea?.Invoke(area);
        }

        // The labels whose area can be built, kept over their sites. Called every frame, so they stay on the site
        // while the camera turns or zooms; a site behind the camera hides its label.
        public void TrackSites()
        {
            var cam = Camera.main;
            var rootRect = (RectTransform)_root.transform;
            foreach (var tag in _siteTags)
            {
                bool show = tag.Wanted && _root.activeInHierarchy;
                if (show && cam != null && _sitePoint != null)
                {
                    var world = _sitePoint(tag.Building);
                    if (world == null) show = false;
                    else
                    {
                        var screen = cam.WorldToScreenPoint(world.Value);
                        if (screen.z <= 0f) show = false;
                        else if (RectTransformUtility.ScreenPointToLocalPointInRectangle(rootRect, screen, null, out var local))
                            tag.Rect.anchoredPosition = local;
                    }
                }
                if (tag.Rect.gameObject.activeSelf != show) tag.Rect.gameObject.SetActive(show);
            }
        }

        public bool SiteLabelShown(BuildingId area, out string text)
        {
            foreach (var tag in _siteTags)
                if (tag.Building == area)
                {
                    text = tag.Label.text;
                    return tag.Rect.gameObject.activeSelf;
                }
            text = null;
            return false;
        }

        // Available reads in the call-to-action colour; with Coins still missing the label stays, in the calm panel colour.
        void RefreshSiteTags()
        {
            foreach (var tag in _siteTags)
            {
                var offer = AreaOffer.For(_game.Resort, _game.Tuning, _game.Waves, tag.Building);
                string text = offer?.SiteLabel;
                tag.Wanted = text != null;
                if (!tag.Wanted) continue;
                if (tag.Label.text != text)
                {
                    tag.Label.text = text;
                    tag.Rect.sizeDelta = new Vector2(tag.Label.preferredWidth + SiteTagPadding, SiteTagHeight);
                }
                tag.Background.color = offer.State == AreaState.Available ? UiFactory.Cta : UiFactory.Panel;
            }
            TrackSites();
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
            var wave = _game.NextWaveDef;               // the waves go on past wave 8, so there is always a next one
            _startLabel.text = "START WAVE " + wave.Index;
            RefreshForecast(wave);
            _banner.SetActive(AreaOffer.Waiting(_game.Resort, _game.Tuning) != null);
            RefreshSiteTags();
            RefreshCard();
        }

        // The forecast shows the demand of the wave only; a Sudden rush is never announced.
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
            var t = _game.Tuning;
            _card.SetActive(true);
            _cardTitle.text = GameController.DisplayName(b);

            var state = r.Get(b);
            if (state == null)
            {
                _upgrade.gameObject.SetActive(false);
                _worker.gameObject.SetActive(false);
                _cardInfo.text = UiFactory.IsPremium(BuildingNeeds.Serves(b)) ? "Locked · premium ocean view" : "Locked area";
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
            _cardInfo.text = "Lv " + state.Level + " · " + t.CapacityPerLevel[state.Level - 1] + " seats"
                + (UiFactory.IsPremium(BuildingNeeds.Serves(b)) ? " · premium" : "");
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
