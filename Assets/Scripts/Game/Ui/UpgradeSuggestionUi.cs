using System;
using System.Collections.Generic;
using ResortEmpire.Sim;
using UnityEngine;
using UnityEngine.UI;

namespace ResortEmpire.Game.Ui
{
    // S5 in the MVP (spec S17): after S4 the game offers three different investments at once, all tied to
    // the queue just seen — upgrade the building, hire its Manager, or hire a Worker. Any one is optional;
    // "Later" skips. Runs between waves (the wave is already closed), so upgrades and hiring are allowed.
    public sealed class UpgradeSuggestionUi
    {
        sealed class Offer
        {
            public Text Title;
            public Text Subtitle;
            public Text Details;
            public GameObject CostRow;
            public Text Coins;
            public GameObject CrateIcon;
            public Text Materials;
            public ActionSlot Action;
        }

        // Card 1480 x 760: header 26-60, why 66-110, cause 114-144, offers 164-620, Later 660-728.
        const float OfferWidth = 448f;
        const float OfferGap = 24f;
        const float OfferTop = 164f;
        const float OfferHeight = 456f;

        readonly GameController _game;
        readonly Action _onClosed;
        readonly GameObject _root;
        readonly Text _why;
        readonly Text _cause;
        readonly Offer _upgradeOffer;
        readonly Offer _managerOffer;
        readonly Offer _workerOffer;

        BuildingId _focus;              // the building behind the queue
        BuildingId? _upgradeTarget;     // existing S5 selection; null when nothing there can grow
        BuildingId? _managerTarget;
        BuildingId? _workerTarget;
        BottleneckCause _reason;
        bool _fromWorst;

        public GameObject Root => _root;
        public bool Visible => _root.activeSelf;

        public UpgradeSuggestionUi(Transform canvas, GameController game, Action onClosed)
        {
            _game = game;
            _onClosed = onClosed;
            _root = UiFactory.Overlay(canvas, "UpgradeSuggestion", new Color(0f, 0f, 0f, 0.45f)).gameObject;

            var card = UiFactory.PanelImage(_root.transform, "Card", UiFactory.Panel).transform;
            UiFactory.PlaceFixed(card.gameObject, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0f, -20f), new Vector2(1480f, 760f));

            var header = UiFactory.Label(card, "Header", "Invest in your resort", 26, UiFactory.Gold, TextAnchor.MiddleCenter, FontStyle.Bold);
            UiFactory.Place(header.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(30f, -60f), new Vector2(-30f, -26f));
            _why = UiFactory.Label(card, "Why", "", 34, UiFactory.Cream, TextAnchor.MiddleCenter, FontStyle.Bold);
            UiFactory.Place(_why.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(30f, -110f), new Vector2(-30f, -66f));
            _cause = UiFactory.Label(card, "Cause", "", 22, UiFactory.CreamDim, TextAnchor.MiddleCenter);
            UiFactory.Place(_cause.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(30f, -144f), new Vector2(-30f, -114f));

            // The upgrade stays the recommended answer (CTA color); the two hires are equal alternatives.
            float x0 = -(OfferWidth + OfferGap);
            _upgradeOffer = BuildOffer(card, "UpgradeOffer", x0, UiFactory.Arrow, UiFactory.Gold, 90f, UiFactory.Cta, OnUpgrade);
            _managerOffer = BuildOffer(card, "ManagerOffer", 0f, UiFactory.Person, UiFactory.Cream, 0f, UiFactory.Positive, OnHireManager);
            _workerOffer = BuildOffer(card, "WorkerOffer", -x0, UiFactory.Person, UiFactory.Cta, 0f, UiFactory.Positive, OnHireWorker);

            var later = UiFactory.TextButton(card, "Later", "Later", 26, UiFactory.PanelLight, UiFactory.Cream, Close);
            UiFactory.PlaceFixed(later.gameObject, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0f, 32f), new Vector2(240f, 68f));

            _root.SetActive(false);
        }

        // Offer card 448 x 456, top-anchored: icon 20-84, title 92-132, subtitle 136-166, details 178-292,
        // cost 300-340, action 356-432 (24 from the bottom).
        static Offer BuildOffer(Transform card, string name, float centerX, Sprite icon, Color iconColor, float iconAngle,
            Color buttonColor, UnityEngine.Events.UnityAction onClick)
        {
            var bg = UiFactory.PanelImage(card, name, UiFactory.PanelShade);
            bg.raycastTarget = false;
            UiFactory.PlaceFixed(bg.gameObject, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(centerX, -OfferTop), new Vector2(OfferWidth, OfferHeight));
            var t = bg.transform;

            var img = UiFactory.Icon(t, "Icon", icon, iconColor);
            UiFactory.PlaceFixed(img.gameObject, new Vector2(0.5f, 1f), new Vector2(0.5f, 0.5f), new Vector2(0f, -52f), new Vector2(64f, 64f));
            img.rectTransform.localEulerAngles = new Vector3(0f, 0f, iconAngle);

            var offer = new Offer();
            offer.Title = UiFactory.Label(t, "Title", "", 30, UiFactory.Cream, TextAnchor.MiddleCenter, FontStyle.Bold);
            UiFactory.Place(offer.Title.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(16f, -132f), new Vector2(-16f, -92f));
            offer.Subtitle = UiFactory.Label(t, "Subtitle", "", 22, UiFactory.CreamDim, TextAnchor.MiddleCenter);
            UiFactory.Place(offer.Subtitle.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(16f, -166f), new Vector2(-16f, -136f));
            offer.Details = UiFactory.Label(t, "Details", "", 22, UiFactory.Cream, TextAnchor.UpperCenter);
            UiFactory.Place(offer.Details.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(20f, -292f), new Vector2(-20f, -178f));
            offer.Details.horizontalOverflow = HorizontalWrapMode.Wrap;

            var cost = UiFactory.Row(t, "Cost", 8f);
            UiFactory.Place(cost.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(16f, -340f), new Vector2(-16f, -300f));
            offer.CostRow = cost.gameObject;
            UiFactory.RowIcon(cost, "Coin", UiFactory.Circle, UiFactory.Gold, 28f);
            offer.Coins = UiFactory.Label(cost, "Coins", "", 26, UiFactory.Cream, TextAnchor.MiddleLeft, FontStyle.Bold);
            offer.CrateIcon = UiFactory.RowIcon(cost, "Crate", UiFactory.Crate, UiFactory.MaterialsColor, 28f).gameObject;
            offer.Materials = UiFactory.Label(cost, "Materials", "", 26, UiFactory.Cream, TextAnchor.MiddleLeft, FontStyle.Bold);

            offer.Action = new ActionSlot(t, "Action", 30, buttonColor, onClick);
            UiFactory.PlaceFixed(offer.Action.Root.gameObject, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0f, 24f), new Vector2(392f, 76f));
            return offer;
        }

        // False when the wave left nothing to improve — the flow then skips S5 entirely.
        public bool TryShow(WaveResult result)
        {
            var upgrade = Suggest(_game, result, out _fromWorst);
            var focus = upgrade ?? Fallback(_game, result);
            if (!focus.HasValue) return false;
            _focus = focus.Value;
            _upgradeTarget = upgrade;
            _reason = _fromWorst ? result.WorstNeedCause : BottleneckCause.None;
            var order = ByWait(_game, result, _focus);
            _managerTarget = PickManager(_game, order);
            _workerTarget = PickWorkerSlot(_game, order);
            bool canHireWorker = _workerTarget.HasValue && _game.Resort.HireWorkerCost() >= 0;
            if (!_upgradeTarget.HasValue && !_managerTarget.HasValue && !canHireWorker) return false; // nothing to offer
            _root.SetActive(true);
            Refresh();
            return true;
        }

        // Prototype selection, unchanged: the worst bottleneck's building first; failing that (none, or
        // already at max level) the upgradable building whose guests waited longest on average.
        static BuildingId? Suggest(GameController game, WaveResult r, out bool fromWorst)
        {
            fromWorst = false;
            var resort = game.Resort;
            if (r.WorstNeed.HasValue)
            {
                var worst = UiFactory.BuildingFor(r.WorstNeed.Value);
                if (resort.UpgradeCost(worst) >= 0)
                {
                    fromWorst = true;
                    return worst;
                }
            }
            if (r.AverageWaitByNeed == null) return null;

            // With a bottleneck on record any wait is worth widening; otherwise only waits past the grace.
            float bestWait = r.WorstNeed.HasValue ? 0f : game.Tuning.PatienceGraceSeconds;
            BuildingId? best = null;
            foreach (var pair in r.AverageWaitByNeed)
            {
                var b = UiFactory.BuildingFor(pair.Key);
                if (pair.Value > bestWait && resort.UpgradeCost(b) >= 0)
                {
                    best = b;
                    bestWait = pair.Value;
                }
            }
            return best;
        }

        // Same question without the "can still grow" filter: once a building is at Lv5 its queue can still
        // be answered with staff.
        static BuildingId? Fallback(GameController game, WaveResult r)
        {
            if (r.WorstNeed.HasValue) return UiFactory.BuildingFor(r.WorstNeed.Value);
            if (r.AverageWaitByNeed == null) return null;
            float bestWait = game.Tuning.PatienceGraceSeconds;
            BuildingId? best = null;
            foreach (var pair in r.AverageWaitByNeed)
                if (pair.Value > bestWait)
                {
                    best = UiFactory.BuildingFor(pair.Key);
                    bestWait = pair.Value;
                }
            return best;
        }

        // Unlocked wave buildings, the focus first, then the worst need, then by longest average wait.
        static List<BuildingId> ByWait(GameController game, WaveResult r, BuildingId focus)
        {
            var order = new List<BuildingId> { focus };
            if (r.WorstNeed.HasValue) Add(order, UiFactory.BuildingFor(r.WorstNeed.Value));
            if (r.AverageWaitByNeed != null)
            {
                var waits = new List<KeyValuePair<NeedId, float>>(r.AverageWaitByNeed);
                waits.Sort((a, b) => b.Value.CompareTo(a.Value));
                foreach (var pair in waits) Add(order, UiFactory.BuildingFor(pair.Key));
            }
            foreach (var b in UiFactory.WaveBuildings) Add(order, b);
            order.RemoveAll(b => !game.Resort.IsUnlocked(b));
            return order;
        }

        static void Add(List<BuildingId> list, BuildingId b)
        {
            if (!list.Contains(b)) list.Add(b);
        }

        // "Hire a Manager for the worst-queue building"; if it already has one, the next slowest without.
        static BuildingId? PickManager(GameController game, List<BuildingId> order)
        {
            foreach (var b in order)
                if (!game.Resort.HasManager(b) && game.Resort.ManagerCost(b) >= 0) return b;
            return null;
        }

        // A new hire goes to a building with a free slot, preferring the one guests waited at.
        static BuildingId? PickWorkerSlot(GameController game, List<BuildingId> order)
        {
            foreach (var b in order)
            {
                var state = game.Resort.Get(b);
                if (state != null && state.WorkerCount < game.Resort.SlotsOf(b)) return b;
            }
            return null;
        }

        public void Refresh()
        {
            if (!Visible) return;
            if (_game.Resort.Get(_focus) == null)
            {
                Close();
                return;
            }
            string focusName = GameController.DisplayName(_focus);
            _why.text = _fromWorst || _upgradeTarget == null
                ? "Guests waited longest at the " + focusName
                : "Guests had to wait at the " + focusName;
            _cause.text = _reason == BottleneckCause.Capacity ? "Too few seats for the crowd"
                : _reason == BottleneckCause.Staffing ? "A worker here helps too"
                : "";
            RefreshUpgrade();
            RefreshManager();
            RefreshWorker();
        }

        void RefreshUpgrade()
        {
            var o = _upgradeOffer;
            var r = _game.Resort;
            var target = _upgradeTarget ?? _focus;
            var state = r.Get(target);
            string name = GameController.DisplayName(target);
            int coins = _upgradeTarget.HasValue ? r.UpgradeCost(target) : -1;
            if (state == null || coins < 0)
            {
                o.Title.text = name;
                o.Subtitle.text = "Lv " + (state != null ? state.Level : 1);
                o.Details.text = "Every level is built here.";
                o.CostRow.SetActive(false);
                o.Action.ShowNote("Top level reached");
                return;
            }

            int materials = Mathf.Max(0, r.UpgradeMaterialsCost(target));
            o.Title.text = "Upgrade " + name;
            o.Subtitle.text = "Lv " + state.Level + " to Lv " + (state.Level + 1);
            o.Details.text = UpgradeDetails(target, state.Level);
            SetCost(o, coins, materials);
            if (UiFactory.CanAfford(r, coins, materials)) o.Action.ShowButton("UPGRADE");
            else o.Action.ShowChip("<size=22>" + UiFactory.MissingText(r, coins, materials) + "</size>");
        }

        // What the next level adds, read from a throw-away copy of the resort that gets the upgrade, so
        // the card stays right whatever the level table says (seats, worker slots, quality tier).
        string UpgradeDetails(BuildingId b, int level)
        {
            var r = _game.Resort;
            var t = _game.Tuning;
            var lines = new List<string>();
            int seatGain = UiFactory.Seats(t, level + 1) - UiFactory.Seats(t, level);
            if (seatGain > 0) lines.Add("+" + seatGain + " seats (" + UiFactory.Seats(t, level + 1) + " in all)");

            var preview = PreviewUpgrade(b);
            if (preview != null)
            {
                int slotGain = preview.SlotsOf(b) - r.SlotsOf(b);
                if (slotGain > 0)
                    lines.Add("+" + slotGain + (slotGain == 1 ? " worker slot" : " worker slots") + " (" + preview.SlotsOf(b) + " in all)");
                int tierGain = preview.QualityTier(b) - r.QualityTier(b);
                if (tierGain > 0) lines.Add("+" + tierGain + " quality: more patient guests");
            }
            lines.Add("+" + t.ResortValuePerUpgrade + " Resort Value");
            return string.Join("\n", lines);
        }

        ResortState PreviewUpgrade(BuildingId b)
        {
            try
            {
                var r = _game.Resort;
                var copy = ResortState.FromSnapshot(_game.Tuning, r.ToSnapshot());
                if (copy == null) return null;
                copy.Grant(Mathf.Max(0, r.UpgradeCost(b)), 0, Mathf.Max(0, r.UpgradeMaterialsCost(b)));
                return copy.Upgrade(b) ? copy : null;
            }
            catch (Exception)
            {
                return null; // a preview is a nicety; the offer still works without its extra lines
            }
        }

        void RefreshManager()
        {
            var o = _managerOffer;
            var r = _game.Resort;
            if (!_managerTarget.HasValue || r.HasManager(_managerTarget.Value))
            {
                o.Title.text = "Managers";
                o.Subtitle.text = "One per building";
                o.Details.text = "Every open building already has its Manager.";
                o.CostRow.SetActive(false);
                o.Action.ShowNote("All hired");
                return;
            }
            var b = _managerTarget.Value;
            string title = UiFactory.ManagerTitle(b);
            int cost = r.ManagerCost(b);
            o.Title.text = "Hire " + title;
            o.Subtitle.text = "Manager of the " + GameController.DisplayName(b);
            o.Details.text = UiFactory.ManagerEffect(_game.Tuning) + " speed, for good\nAlso counts for VIP guests";
            SetCost(o, cost, 0);
            if (r.Coins >= cost) o.Action.ShowButton("HIRE");
            else o.Action.ShowChip("<size=22>" + UiFactory.MissingText(r, cost, 0) + "</size>");
        }

        void RefreshWorker()
        {
            var o = _workerOffer;
            var r = _game.Resort;
            int cost = r.HireWorkerCost();
            o.Title.text = "Hire Worker";
            if (cost < 0 || !_workerTarget.HasValue)
            {
                // At the cap a building can still be empty — scarcity is the design (Build §5.3.5).
                o.Subtitle.text = "Worker limit reached";
                o.Details.text = "You can hire up to 80% of your\nbuildings' worker slots.";
                o.CostRow.SetActive(false);
                o.Action.ShowNote("<size=22>Upgrade buildings to\nopen more shifts</size>");
                return;
            }
            var b = _workerTarget.Value;
            var state = r.Get(b);
            int slots = r.SlotsOf(b);
            o.Subtitle.text = "Starts at the " + GameController.DisplayName(b);
            o.Details.text = "Workers there: " + state.WorkerCount + " of " + slots + " shifts\nMoving workers stays free";
            SetCost(o, cost, 0);
            if (r.Coins >= cost) o.Action.ShowButton("HIRE");
            else o.Action.ShowChip("<size=22>" + UiFactory.MissingText(r, cost, 0) + "</size>");
        }

        static void SetCost(Offer o, int coins, int materials)
        {
            o.CostRow.SetActive(true);
            o.Coins.text = UiFactory.Num(coins) + " Coins";
            bool needsMaterials = materials > 0;
            o.CrateIcon.SetActive(needsMaterials);
            o.Materials.gameObject.SetActive(needsMaterials);
            o.Materials.text = UiFactory.Num(materials) + " Materials";
        }

        void OnUpgrade()
        {
            if (_upgradeTarget.HasValue && _game.Upgrade(_upgradeTarget.Value)) Close();
            else Refresh();
        }

        void OnHireManager()
        {
            if (_managerTarget.HasValue && _game.HireManager(_managerTarget.Value)) Close();
            else Refresh();
        }

        void OnHireWorker()
        {
            if (_workerTarget.HasValue && _game.HireWorker(_workerTarget.Value)) Close();
            else Refresh();
        }

        void Close()
        {
            if (!Visible) return;
            _root.SetActive(false);
            _onClosed?.Invoke();
        }
    }
}
