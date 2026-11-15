using ResortEmpire.Sim;
using UnityEngine;
using UnityEngine.UI;

namespace ResortEmpire.Game.Ui
{
    // The Resort summary after the eighth wave: a milestone, not a score screen. It shows the waves cleared, the stars
    // earned, the Resort Value and the resort as it stands, and it never frames anything as a failure. The waves go
    // on after it (CAM-28), so its one button is Keep playing.
    public sealed class FinaleUi
    {
        readonly GameController _game;
        readonly GameObject _root;
        readonly Text _title;
        readonly Text _stars;
        readonly Text _value;
        readonly Text _buildings;
        readonly System.Action _closed;

        public GameObject Root => _root;
        public bool Visible => _root.activeSelf;

        public FinaleUi(Transform canvas, GameController game, System.Action closed)
        {
            _game = game;
            _closed = closed;
            var dim = UiFactory.Go(canvas, "Finale").AddComponent<Image>();
            dim.color = new Color(0f, 0f, 0f, 0.55f); // plain square dim; blocks taps behind it
            _root = dim.gameObject;
            UiFactory.Place(_root, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);

            // Card 900 x 640, top down: header 28-62, title 72-132, stars 150-200, value 206-256, buildings 270-430,
            // closing line 446-490, button from 510 (640 - 34 - 96).
            var card = UiFactory.PanelImage(_root.transform, "Card", UiFactory.Panel).transform;
            UiFactory.PlaceFixed(card.gameObject, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0f, -10f), new Vector2(900f, 640f));

            var header = UiFactory.Label(card, "Header", "Resort summary", 26, UiFactory.Premium, TextAnchor.MiddleCenter, FontStyle.Bold);
            UiFactory.Place(header.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(30f, -62f), new Vector2(-30f, -28f));
            _title = UiFactory.Label(card, "Title", "", 46, UiFactory.Cream, TextAnchor.MiddleCenter, FontStyle.Bold);
            UiFactory.Place(_title.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(30f, -132f), new Vector2(-30f, -72f));

            _stars = Line(card, "Stars", UiFactory.Star, UiFactory.Premium, -175f);
            _value = Line(card, "Value", UiFactory.Circle, UiFactory.Recovering, -231f);

            _buildings = UiFactory.Label(card, "Buildings", "", 24, UiFactory.Cream, TextAnchor.UpperCenter);
            UiFactory.Place(_buildings.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(60f, -430f), new Vector2(-60f, -270f));
            _buildings.horizontalOverflow = HorizontalWrapMode.Wrap;

            var thanks = UiFactory.Label(card, "Thanks", "Your resort is complete. The waves go on.", 28, UiFactory.Cream, TextAnchor.MiddleCenter, FontStyle.Bold);
            UiFactory.Place(thanks.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(40f, -490f), new Vector2(-40f, -446f));

            var back = UiFactory.TextButton(card, "KeepPlaying", "KEEP PLAYING", 34, UiFactory.Cta, UiFactory.Cream, Close);
            UiFactory.PlaceFixed(back.gameObject, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0f, 34f), new Vector2(420f, 96f));

            _root.SetActive(false);
        }

        // An icon followed by a line of text, centred at the given height.
        static Text Line(Transform card, string name, Sprite icon, Color iconColor, float y)
        {
            var group = UiFactory.Go(card, name + "Group");
            UiFactory.PlaceFixed(group, new Vector2(0.5f, 1f), new Vector2(0.5f, 0.5f), new Vector2(0f, y), new Vector2(520f, 46f));
            UiFactory.PlaceFixed(UiFactory.Icon(group.transform, "Icon", icon, iconColor).gameObject,
                new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), Vector2.zero, new Vector2(34f, 34f));
            var label = UiFactory.Label(group.transform, "Text", "", 30, UiFactory.Cream, TextAnchor.MiddleLeft, FontStyle.Bold);
            UiFactory.Place(label.gameObject, Vector2.zero, Vector2.one, new Vector2(46f, 0f), Vector2.zero);
            return label;
        }

        public void Show()
        {
            var s = FinaleSummary.For(_game.Resort, _game.Waves);
            _title.text = s.WavesCleared + "/" + s.TotalWaves + " waves cleared";
            _stars.text = s.Stars + " of " + s.MaxStars + " stars earned";
            _value.text = "Resort Value " + s.ResortValue;
            _buildings.text = string.Join("\n", s.Buildings);   // one building per line: a long line broke between a name and its level
            _root.SetActive(true);
        }

        void Close()
        {
            _root.SetActive(false);
            _closed?.Invoke();
        }
    }
}
