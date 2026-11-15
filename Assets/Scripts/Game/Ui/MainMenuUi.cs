using UnityEngine;
using UnityEngine.Events;
using UnityEngine.UI;

namespace ResortEmpire.Game.Ui
{
    // CAM-50: what the app opens with — Play (or Continue), New Game and Settings over the live island, which stays
    // visible behind a light dim.
    public sealed class MainMenuUi
    {
        static readonly Color Gold = new Color(0.94f, 0.78f, 0.37f);

        readonly GameObject _root;
        readonly Text _playLabel;

        public GameObject Root => _root;
        public bool Visible => _root.activeSelf;

        public MainMenuUi(Transform canvas, UnityAction onPlay, UnityAction onNewGame, UnityAction onSettings)
        {
            _root = UiFactory.Overlay(canvas, "MainMenu", new Color(0f, 0f, 0f, 0.28f)).gameObject;
            var shade = UiFactory.Panel;
            var card = UiFactory.PanelImage(_root.transform, "Card", new Color(shade.r, shade.g, shade.b, 0.94f)).transform;
            UiFactory.PlaceFixed(card.gameObject, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(660f, 580f));

            var title = UiFactory.Label(card, "Title", "Island", 76, UiFactory.Cream, TextAnchor.MiddleCenter, FontStyle.Bold);
            UiFactory.Place(title.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(20f, -130f), new Vector2(-20f, -36f));
            var subtitle = UiFactory.Label(card, "Subtitle", "Resort Empire: Paradise Tycoon", 28, Gold, TextAnchor.MiddleCenter);
            UiFactory.Place(subtitle.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(20f, -176f), new Vector2(-20f, -130f));

            var play = UiFactory.TextButton(card, "Play", "PLAY", 40, UiFactory.Cta, UiFactory.Cream, onPlay);
            UiFactory.PlaceFixed(play.gameObject, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0f, -218f), new Vector2(440f, 104f));
            _playLabel = UiFactory.ButtonLabel(play);

            var newGame = UiFactory.TextButton(card, "NewGame", "New Game", 30, UiFactory.PanelLight, UiFactory.Cream, onNewGame);
            UiFactory.PlaceFixed(newGame.gameObject, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0f, -346f), new Vector2(440f, 80f));
            var settings = UiFactory.TextButton(card, "Settings", "Settings", 30, UiFactory.PanelLight, UiFactory.Cream, onSettings);
            UiFactory.PlaceFixed(settings.gameObject, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0f, -442f), new Vector2(440f, 80f));

            _root.SetActive(false);
        }

        // hasProgress: a resort already under way says CONTINUE, a new one says PLAY.
        public void Show(bool hasProgress)
        {
            _playLabel.text = hasProgress ? "CONTINUE" : "PLAY";
            _root.SetActive(true);
        }

        public void Hide() => _root.SetActive(false);
    }
}
