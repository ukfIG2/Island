using ResortEmpire.Sim;
using UnityEngine;
using UnityEngine.UI;

namespace ResortEmpire.Game.Ui
{
    // S5 Upgrade Suggestion: after the result, one optional investment linked to what the wave showed, with the seats
    // before and after, the Coin cost and the Resort Value gain. "Later" skips it. It runs between waves, so the
    // upgrade is allowed (WR6). Never a gate: the next wave starts either way.
    public sealed class UpgradeSuggestionUi
    {
        readonly GameController _game;
        readonly GameObject _root;
        readonly Text _why;
        readonly Text _cause;
        readonly Text _title;
        readonly Text _subtitle;
        readonly Text _details;
        readonly Text _cost;
        readonly Button _upgrade;
        readonly GameObject _missingChip;
        readonly Text _missing;
        UpgradeAdvice _advice;

        public GameObject Root => _root;
        public bool Visible => _root.activeSelf;

        public UpgradeSuggestionUi(Transform canvas, GameController game)
        {
            _game = game;
            var dim = UiFactory.Go(canvas, "UpgradeSuggestion").AddComponent<Image>();
            dim.color = new Color(0f, 0f, 0f, 0.45f); // plain square dim; blocks taps behind it
            _root = dim.gameObject;
            UiFactory.Place(_root, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);

            // Card 900 x 640, top down: header 26-60, why 66-110, cause 114-144, offer 164-494, Later from 540 (640 - 32 - 68).
            var card = UiFactory.PanelImage(_root.transform, "Card", UiFactory.Panel).transform;
            UiFactory.PlaceFixed(card.gameObject, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0f, -20f), new Vector2(900f, 640f));

            var header = UiFactory.Label(card, "Header", "Invest in your resort", 26, UiFactory.Premium, TextAnchor.MiddleCenter, FontStyle.Bold);
            UiFactory.Place(header.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(30f, -60f), new Vector2(-30f, -26f));
            _why = UiFactory.Label(card, "Why", "", 34, UiFactory.Cream, TextAnchor.MiddleCenter, FontStyle.Bold);
            UiFactory.Place(_why.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(30f, -110f), new Vector2(-30f, -66f));
            _cause = UiFactory.Label(card, "Cause", "", 22, UiFactory.CreamDim, TextAnchor.MiddleCenter);
            UiFactory.Place(_cause.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(30f, -144f), new Vector2(-30f, -114f));

            // The offer, 520 x 330, top-anchored: icon 20-84, title 92-132, subtitle 136-166, details 178-250, cost 262-302, the button or the "missing Coins" chip 24 above the bottom edge.
            var offer = UiFactory.PanelImage(card, "Offer", UiFactory.PanelShade);
            offer.raycastTarget = false;
            UiFactory.PlaceFixed(offer.gameObject, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0f, -164f), new Vector2(520f, 330f));
            var o = offer.transform;

            var arrow = UiFactory.Icon(o, "Icon", UiFactory.Arrow, UiFactory.Premium);
            UiFactory.PlaceFixed(arrow.gameObject, new Vector2(0.5f, 1f), new Vector2(0.5f, 0.5f), new Vector2(0f, -52f), new Vector2(64f, 64f));
            arrow.rectTransform.localEulerAngles = new Vector3(0f, 0f, 90f);

            _title = UiFactory.Label(o, "Title", "", 30, UiFactory.Cream, TextAnchor.MiddleCenter, FontStyle.Bold);
            UiFactory.Place(_title.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(16f, -132f), new Vector2(-16f, -92f));
            _subtitle = UiFactory.Label(o, "Subtitle", "", 22, UiFactory.CreamDim, TextAnchor.MiddleCenter);
            UiFactory.Place(_subtitle.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(16f, -166f), new Vector2(-16f, -136f));
            _details = UiFactory.Label(o, "Details", "", 22, UiFactory.Cream, TextAnchor.UpperCenter);
            UiFactory.Place(_details.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(20f, -250f), new Vector2(-20f, -178f));
            _details.horizontalOverflow = HorizontalWrapMode.Wrap;

            var cost = UiFactory.Go(o, "Cost");
            UiFactory.PlaceFixed(cost, new Vector2(0.5f, 1f), new Vector2(0.5f, 0.5f), new Vector2(0f, -282f), new Vector2(220f, 40f));
            UiFactory.PlaceFixed(UiFactory.Icon(cost.transform, "Coin", UiFactory.Circle, UiFactory.Premium).gameObject,
                new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), Vector2.zero, new Vector2(28f, 28f));
            _cost = UiFactory.Label(cost.transform, "Coins", "", 26, UiFactory.Cream, TextAnchor.MiddleLeft, FontStyle.Bold);
            UiFactory.Place(_cost.gameObject, Vector2.zero, Vector2.one, new Vector2(38f, 0f), Vector2.zero);

            _upgrade = UiFactory.TextButton(o, "Upgrade", "UPGRADE", 30, UiFactory.Cta, UiFactory.Cream, OnUpgrade);
            UiFactory.PlaceFixed(_upgrade.gameObject, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0f, 24f), new Vector2(392f, 76f));

            var chip = UiFactory.PanelImage(o, "MissingChip", UiFactory.PanelLight);
            chip.raycastTarget = false;
            _missingChip = chip.gameObject;
            UiFactory.PlaceFixed(_missingChip, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0f, 24f), new Vector2(392f, 76f));
            _missing = UiFactory.Label(chip.transform, "Text", "", 24, UiFactory.Cream, TextAnchor.MiddleCenter);
            UiFactory.Place(_missing.gameObject, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);

            var later = UiFactory.TextButton(card, "Later", "Later", 26, UiFactory.PanelLight, UiFactory.Cream, Close);
            UiFactory.PlaceFixed(later.gameObject, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0f, 32f), new Vector2(240f, 68f));

            _root.SetActive(false);
        }

        // False when the wave left nothing to improve: the flow then goes straight back to the island.
        public bool TryShow(WaveResult result)
        {
            var advice = UpgradeAdvice.For(_game.Resort, _game.Tuning, result);
            if (advice == null) return false;
            _advice = advice;
            _root.SetActive(true);
            Refresh();
            return true;
        }

        public void Refresh()
        {
            if (!Visible || _advice == null) return;
            var a = _advice;
            string building = GameController.DisplayName(a.Building);
            _why.text = a.FromWorst ? "Guests waited longest at the " + building : "Guests had to wait at the " + building;
            _cause.text = a.Cause == BottleneckCause.Capacity ? "Too few seats for the crowd"
                : a.Cause == BottleneckCause.Staffing ? "A Worker here helps too"
                : "";

            _title.text = "Upgrade " + building;
            _subtitle.text = "Lv " + a.FromLevel + " to Lv " + a.ToLevel;
            _details.text = "+" + (a.SeatsAfter - a.SeatsBefore) + " seats (" + a.SeatsAfter + " in all)\n+" + a.ValueGain + " Resort Value";
            _cost.text = a.Cost.ToString();

            int missing = a.Cost - _game.Resort.Coins;
            bool affordable = missing <= 0;
            _upgrade.gameObject.SetActive(affordable);
            _missingChip.SetActive(!affordable);
            if (!affordable) _missing.text = "Missing " + missing + " Coins";
        }

        void OnUpgrade()
        {
            if (_advice != null && _game.Upgrade(_advice.Building)) Close();
        }

        void Close() => _root.SetActive(false);
    }
}
