using ResortEmpire.Sim;
using UnityEngine;
using UnityEngine.UI;

namespace ResortEmpire.Game.Ui
{
    // Temporary S4: wave result card over a dimmed screen, until the full screen lands (CAM-38).
    // The only place a numeric satisfaction ever appears.
    public sealed class ResultOverlayUi
    {
        readonly GameController _game;
        readonly GameObject _root;
        readonly Text _title;
        static readonly Color StarFilled = UiFactory.Cta;
        static readonly Color StarEmpty = new Color(0.23f, 0.37f, 0.42f);

        readonly Image[] _stars = new Image[5];
        readonly Text _satisfaction;
        readonly Text _rewards;
        readonly Text _hint;
        readonly Text _thanks;
        readonly Button _continue;

        public GameObject Root => _root;
        public bool Visible => _root.activeSelf;

        public ResultOverlayUi(Transform canvas, GameController game)
        {
            _game = game;
            var dim = UiFactory.Go(canvas, "ResultOverlay").AddComponent<Image>();
            dim.color = new Color(0f, 0f, 0f, 0.55f); // plain square dim; blocks taps behind it
            _root = dim.gameObject;
            UiFactory.Place(_root, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);

            var card = UiFactory.PanelImage(_root.transform, "Card", UiFactory.Panel);
            UiFactory.PlaceFixed(card.gameObject, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(780f, 560f));

            _title = UiFactory.Label(card.transform, "Title", "", 42, UiFactory.Cream, TextAnchor.MiddleCenter, FontStyle.Bold);
            UiFactory.Place(_title.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(30f, -86f), new Vector2(-30f, -26f));

            for (int i = 0; i < _stars.Length; i++)
            {
                _stars[i] = UiFactory.Icon(card.transform, "Star" + i, UiFactory.Star, StarEmpty);
                UiFactory.PlaceFixed(_stars[i].gameObject, new Vector2(0.5f, 1f), new Vector2(0.5f, 0.5f),
                    new Vector2((i - 2) * 76f, -130f), new Vector2(66f, 66f));
            }

            _satisfaction = UiFactory.Label(card.transform, "Satisfaction", "", 30, UiFactory.Cream, TextAnchor.MiddleCenter);
            UiFactory.Place(_satisfaction.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(30f, -216f), new Vector2(-30f, -176f));

            _rewards = UiFactory.Label(card.transform, "Rewards", "", 28, UiFactory.Recovering, TextAnchor.MiddleCenter, FontStyle.Bold);
            UiFactory.Place(_rewards.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(30f, -262f), new Vector2(-30f, -222f));

            _hint = UiFactory.Label(card.transform, "Hint", "", 24, UiFactory.CreamDim, TextAnchor.UpperCenter);
            UiFactory.Place(_hint.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(60f, -352f), new Vector2(-60f, -276f));
            _hint.horizontalOverflow = HorizontalWrapMode.Wrap;

            _thanks = UiFactory.Label(card.transform, "Thanks", "Prototype complete — thanks for playing!", 28, UiFactory.Cream, TextAnchor.MiddleCenter, FontStyle.Bold);
            UiFactory.Place(_thanks.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(30f, -412f), new Vector2(-30f, -366f));

            _continue = UiFactory.TextButton(card.transform, "Continue", "CONTINUE", 32, UiFactory.Cta, UiFactory.Cream, OnContinue);
            UiFactory.PlaceFixed(_continue.gameObject, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0f, 30f), new Vector2(340f, 92f));

            _root.SetActive(false);
        }

        public void Show(WaveResult result)
        {
            _root.SetActive(true);
            _title.text = "Wave " + result.WaveIndex + " complete";
            for (int i = 0; i < _stars.Length; i++)
                _stars[i].color = i < result.Stars ? StarFilled : StarEmpty;
            _satisfaction.text = "Guest satisfaction: " + Mathf.RoundToInt(result.Satisfaction * 100f) + "%"
                + (result.Perfect ? " — Perfect!" : "");
            _rewards.text = "+" + result.CoinsEarned + " Coins   +" + result.EnergyEarned + " Energy   +"
                + result.ResortValueGain + " Resort Value";
            _hint.text = result.WorstNeed.HasValue
                ? "Guests waited longest at the " + GameController.DisplayName(UiFactory.BuildingFor(result.WorstNeed.Value))
                    + ". A worker or an upgrade there could help next time."
                : "Every queue stayed short. Lovely work.";
            // The last wave still needs a way back, or the overlay would never close and the
            // prototype would never be marked complete.
            bool last = result.WaveIndex >= _game.Waves[_game.Waves.Count - 1].Index;
            _thanks.gameObject.SetActive(last);
            UiFactory.ButtonLabel(_continue).text = last ? "BACK TO ISLAND" : "CONTINUE";
        }

        void OnContinue()
        {
            _root.SetActive(false);
            _game.ContinueAfterResults();
        }
    }
}
