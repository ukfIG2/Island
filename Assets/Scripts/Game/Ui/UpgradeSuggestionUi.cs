using System;
using ResortEmpire.Sim;
using UnityEngine;
using UnityEngine.UI;

namespace ResortEmpire.Game.Ui
{
    // S5: after S4 the game proposes the one upgrade tied to the bottleneck just seen.
    // Runs between waves (the wave is already closed), so GameController.Upgrade is allowed.
    public sealed class UpgradeSuggestionUi
    {
        readonly GameController _game;
        readonly Action _onClosed;
        readonly GameObject _root;
        readonly Text _name;
        readonly Text _why;
        readonly Text _cause;
        readonly Text _seatsFrom;
        readonly Text _seatsTo;
        readonly Text _value;
        readonly Text _cost;
        readonly Button _upgrade;
        readonly Text _missing;
        BuildingId _building;
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
            UiFactory.PlaceFixed(card.gameObject, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0f, -20f), new Vector2(660f, 660f));

            var header = UiFactory.Label(card, "Header", "Upgrade available", 26, UiFactory.Gold, TextAnchor.MiddleCenter, FontStyle.Bold);
            UiFactory.Place(header.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(30f, -60f), new Vector2(-30f, -26f));
            _name = UiFactory.Label(card, "Building", "", 46, UiFactory.Cream, TextAnchor.MiddleCenter, FontStyle.Bold);
            UiFactory.Place(_name.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(30f, -120f), new Vector2(-30f, -64f));
            _why = UiFactory.Label(card, "Why", "", 26, UiFactory.Cream, TextAnchor.MiddleCenter);
            UiFactory.Place(_why.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(30f, -162f), new Vector2(-30f, -128f));
            _cause = UiFactory.Label(card, "Cause", "", 22, UiFactory.CreamDim, TextAnchor.MiddleCenter);
            UiFactory.Place(_cause.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(30f, -194f), new Vector2(-30f, -164f));

            // Before/after shows seats only: in the prototype an upgrade changes nothing else.
            var box = UiFactory.PanelImage(card, "Change", UiFactory.PanelShade).transform;
            UiFactory.Place(box.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(40f, -336f), new Vector2(-40f, -210f));
            var seats = UiFactory.Row(box, "Seats", 12f);
            UiFactory.Place(seats.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(0f, -60f), new Vector2(0f, -8f));
            _seatsFrom = UiFactory.Label(seats, "From", "", 32, UiFactory.Cream, TextAnchor.MiddleLeft, FontStyle.Bold);
            UiFactory.RowIcon(seats, "Arrow", UiFactory.Arrow, UiFactory.Cream, 30f);
            _seatsTo = UiFactory.Label(seats, "To", "", 32, UiFactory.Cream, TextAnchor.MiddleLeft, FontStyle.Bold);
            var value = UiFactory.Row(box, "Value", 10f);
            UiFactory.Place(value.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(0f, -116f), new Vector2(0f, -68f));
            UiFactory.RowIcon(value, "Star", UiFactory.Star, UiFactory.Gold, 28f);
            _value = UiFactory.Label(value, "Text", "", 26, UiFactory.Cream);

            var cost = UiFactory.Row(card, "Cost", 10f);
            UiFactory.Place(cost.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(30f, -404f), new Vector2(-30f, -352f));
            UiFactory.RowIcon(cost, "Coin", UiFactory.Circle, UiFactory.Gold, 32f);
            _cost = UiFactory.Label(cost, "Text", "", 32, UiFactory.Cream, TextAnchor.MiddleLeft, FontStyle.Bold);

            _upgrade = UiFactory.TextButton(card, "UpgradeNow", "UPGRADE NOW", 34, UiFactory.Cta, UiFactory.Cream, OnUpgrade);
            UiFactory.PlaceFixed(_upgrade.gameObject, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0f, 120f), new Vector2(420f, 96f));
            _missing = UiFactory.Badge(card, "Missing", 28, UiFactory.PanelShade, UiFactory.CreamDim);
            UiFactory.PlaceFixed(_missing.transform.parent.gameObject, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0f, 120f), new Vector2(420f, 96f));

            var later = UiFactory.TextButton(card, "Later", "Later", 26, UiFactory.PanelLight, UiFactory.Cream, Close);
            UiFactory.PlaceFixed(later.gameObject, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0f, 32f), new Vector2(240f, 68f));

            _root.SetActive(false);
        }

        // False when there is nothing worth suggesting — the flow then skips S5 entirely.
        public bool TryShow(WaveResult result)
        {
            var pick = Suggest(_game, result, out _fromWorst);
            if (!pick.HasValue) return false;
            _building = pick.Value;
            _reason = _fromWorst ? result.WorstNeedCause : BottleneckCause.None;
            _root.SetActive(true);
            Refresh();
            return true;
        }

        // The worst bottleneck's building first; failing that (none, or already at max level) the
        // upgradable building whose guests waited longest on average.
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

        public void Refresh()
        {
            if (!Visible) return;
            var r = _game.Resort;
            var t = _game.Tuning;
            var state = r.Get(_building);
            int cost = r.UpgradeCost(_building);
            if (state == null || cost < 0)
            {
                Close();
                return;
            }

            _name.text = GameController.DisplayName(_building);
            _why.text = _fromWorst ? "Guests waited longest here" : "Guests had to wait here";
            _cause.text = _reason == BottleneckCause.Capacity ? "Too few seats for the crowd"
                : _reason == BottleneckCause.Staffing ? "A worker here helps too"
                : "";
            _seatsFrom.text = "Seats " + t.CapacityPerLevel[state.Level - 1];
            _seatsTo.text = t.CapacityPerLevel[state.Level].ToString();
            _value.text = "+" + t.ResortValuePerUpgrade + " Resort Value";
            _cost.text = UiFactory.Num(cost) + " Coins";

            bool affordable = r.Coins >= cost;
            _upgrade.gameObject.SetActive(affordable);
            _missing.transform.parent.gameObject.SetActive(!affordable);
            if (!affordable) _missing.text = "Missing: " + UiFactory.Num(cost - r.Coins) + " Coins";
        }

        void OnUpgrade()
        {
            if (_game.Upgrade(_building)) Close();
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
