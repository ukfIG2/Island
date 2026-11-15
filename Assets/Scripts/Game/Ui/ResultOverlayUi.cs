using ResortEmpire.Sim;
using UnityEngine;
using UnityEngine.UI;

namespace ResortEmpire.Game.Ui
{
    // S4 Wave Complete: rating, rewards and the reasons behind them. The only place a numeric satisfaction ever
    // appears. The tone stays "it went well, I can improve it": never a loss screen. Claim Rewards leads on (UI handoff).
    public sealed class ResultOverlayUi
    {
        static readonly Color StarEmpty = new Color(0.23f, 0.37f, 0.42f);
        static readonly Color WentWellColor = new Color(0.62f, 0.86f, 0.66f);

        readonly GameController _game;
        readonly GameObject _root;
        readonly Text _title;
        readonly Image[] _stars = new Image[5];
        readonly Text _satisfaction;
        readonly Text _served;
        readonly Text _coins;
        readonly Text _energy;
        readonly Text _value;
        readonly Text _wentWell;
        readonly Text _improve;
        readonly Text _leaving;
        readonly Button _claim;

        public GameObject Root => _root;
        public bool Visible => _root.activeSelf;

        public ResultOverlayUi(Transform canvas, GameController game)
        {
            _game = game;
            var dim = UiFactory.Go(canvas, "ResultOverlay").AddComponent<Image>();
            dim.color = new Color(0f, 0f, 0f, 0.55f); // plain square dim; blocks taps behind it
            _root = dim.gameObject;
            UiFactory.Place(_root, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);

            // Card layout, top down: title 28-92, stars 115-185, satisfaction 200-240, served 244-278, rewards 297-347,
            // divider 364, columns 386-546, closing line 556-590, button from 630 (760 - 34 - 96): no overlaps.
            var card = UiFactory.PanelImage(_root.transform, "Card", UiFactory.Panel).transform;
            UiFactory.PlaceFixed(card.gameObject, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0f, -10f), new Vector2(940f, 760f));

            _title = UiFactory.Label(card, "Title", "", 46, UiFactory.Cream, TextAnchor.MiddleCenter, FontStyle.Bold);
            UiFactory.Place(_title.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(30f, -92f), new Vector2(-30f, -28f));

            for (int i = 0; i < _stars.Length; i++)
            {
                _stars[i] = UiFactory.Icon(card, "Star" + i, UiFactory.Star, StarEmpty);
                UiFactory.PlaceFixed(_stars[i].gameObject, new Vector2(0.5f, 1f), new Vector2(0.5f, 0.5f),
                    new Vector2((i - 2) * 82f, -150f), new Vector2(70f, 70f));
            }

            _satisfaction = UiFactory.Label(card, "Satisfaction", "", 32, UiFactory.Cream, TextAnchor.MiddleCenter);
            UiFactory.Place(_satisfaction.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(30f, -240f), new Vector2(-30f, -200f));

            _served = UiFactory.Label(card, "Served", "", 24, UiFactory.CreamDim, TextAnchor.MiddleCenter);
            UiFactory.Place(_served.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(30f, -278f), new Vector2(-30f, -244f));

            _coins = Reward(card, "Coins", UiFactory.Circle, UiFactory.Premium, -300f);
            _energy = Reward(card, "Energy", UiFactory.Bolt, UiFactory.Recovering, 0f);
            _value = Reward(card, "ResortValue", UiFactory.Star, UiFactory.Premium, 300f);

            var divider = UiFactory.Go(card, "Divider").AddComponent<Image>();
            divider.color = UiFactory.PanelLight;
            divider.raycastTarget = false;
            UiFactory.Place(divider.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(50f, -366f), new Vector2(-50f, -364f));

            _wentWell = Column(card, "WentWell", "What went well", WentWellColor, 0f, 0.5f, 50f, -20f);
            _improve = Column(card, "NeedsImprovement", "Needs improvement", UiFactory.Recovering, 0.5f, 1f, 20f, -50f);

            _leaving = UiFactory.Label(card, "Leaving", "", 22, UiFactory.CreamDim, TextAnchor.MiddleCenter, FontStyle.Italic);
            UiFactory.Place(_leaving.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(40f, -590f), new Vector2(-40f, -556f));

            _claim = UiFactory.TextButton(card, "Claim", "CLAIM REWARDS", 34, UiFactory.Cta, UiFactory.Cream, OnClaim);
            UiFactory.PlaceFixed(_claim.gameObject, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0f, 34f), new Vector2(420f, 96f));

            _root.SetActive(false);
        }

        // An icon followed by its amount, as one block centred at x.
        static Text Reward(Transform card, string name, Sprite icon, Color iconColor, float x)
        {
            var group = UiFactory.Go(card, name + "Group");
            UiFactory.PlaceFixed(group, new Vector2(0.5f, 1f), new Vector2(0.5f, 0.5f), new Vector2(x, -322f), new Vector2(270f, 50f));
            UiFactory.PlaceFixed(UiFactory.Icon(group.transform, "Icon", icon, iconColor).gameObject,
                new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), Vector2.zero, new Vector2(34f, 34f));
            var label = UiFactory.Label(group.transform, "Text", "", 30, UiFactory.Cream, TextAnchor.MiddleLeft, FontStyle.Bold);
            UiFactory.Place(label.gameObject, Vector2.zero, Vector2.one, new Vector2(44f, 0f), Vector2.zero);
            return label;
        }

        static Text Column(Transform card, string name, string header, Color headerColor, float aMin, float aMax,
            float left, float right)
        {
            var head = UiFactory.Label(card, name + "Header", header, 24, headerColor, TextAnchor.MiddleLeft, FontStyle.Bold);
            UiFactory.Place(head.gameObject, new Vector2(aMin, 1f), new Vector2(aMax, 1f), new Vector2(left, -420f), new Vector2(right, -386f));
            var body = UiFactory.Label(card, name, "", 24, UiFactory.Cream, TextAnchor.UpperLeft);
            UiFactory.Place(body.gameObject, new Vector2(aMin, 1f), new Vector2(aMax, 1f), new Vector2(left, -546f), new Vector2(right, -426f));
            body.horizontalOverflow = HorizontalWrapMode.Wrap;
            return body;
        }

        public void Show(WaveResult result)
        {
            _root.SetActive(true);
            _title.text = "Wave " + result.WaveIndex + " complete";
            for (int i = 0; i < _stars.Length; i++)
                _stars[i].color = i < result.Stars ? UiFactory.Premium : StarEmpty;

            _satisfaction.text = "Guest satisfaction: " + ResultText.SatisfactionPercent(result.Satisfaction) + "%"
                + (result.Perfect ? " — Perfect!" : "");
            _served.text = "Needs served: " + result.TotalUnits + "/" + result.TotalUnits; // every guest is served before a wave ends (WR3)

            _coins.text = "+" + result.CoinsEarned + " Coins";
            _energy.text = "+" + result.EnergyEarned + " Energy";
            _value.text = "+" + result.ResortValueGain + " Resort Value";

            _wentWell.text = ResultText.WentWell(result, _game.Tuning.PatienceGraceSeconds);
            _improve.text = ResultText.NeedsImprovement(result);

            // The last wave still needs a way back, or the overlay would never close and the
            // prototype would never be marked complete.
            bool last = result.WaveIndex >= _game.Waves[_game.Waves.Count - 1].Index;
            _leaving.text = last ? "Prototype complete — thanks for playing!" : ResultText.LeavingLine(result.Stars);
            _leaving.fontSize = last ? 28 : 22;
            _leaving.fontStyle = last ? FontStyle.Bold : FontStyle.Italic;
            _leaving.color = last ? UiFactory.Cream : UiFactory.CreamDim;
            UiFactory.ButtonLabel(_claim).text = last ? "BACK TO ISLAND" : "CLAIM REWARDS";
        }

        void OnClaim()
        {
            _root.SetActive(false);
            _game.ContinueAfterResults();
        }
    }
}
