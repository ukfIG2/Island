using UnityEngine;
using UnityEngine.Events;
using UnityEngine.UI;

namespace ResortEmpire.Game.Ui
{
    // App-start menu (Jira E09) over the live island, which stays visible behind a light dim.
    public sealed class MainMenuUi
    {
        readonly GameObject _root;
        readonly Text _playLabel;

        public GameObject Root => _root;
        public bool Visible => _root.activeSelf;

        public MainMenuUi(Transform canvas, UnityAction onPlay, UnityAction onNewGame, UnityAction onSettings)
        {
            _root = UiFactory.Overlay(canvas, "MainMenu", new Color(0f, 0f, 0f, 0.28f)).gameObject;
            var shade = UiFactory.Panel;
            var card = UiFactory.PanelImage(_root.transform, "Card", new Color(shade.r, shade.g, shade.b, 0.94f)).transform;
            UiFactory.PlaceFixed(card.gameObject, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(640f, 540f));

            var title = UiFactory.Label(card, "Title", "Resort Empire", 64, UiFactory.Cream, TextAnchor.MiddleCenter, FontStyle.Bold);
            UiFactory.Place(title.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(20f, -116f), new Vector2(-20f, -36f));
            var subtitle = UiFactory.Label(card, "Subtitle", "Paradise Tycoon", 30, UiFactory.Gold, TextAnchor.MiddleCenter);
            UiFactory.Place(subtitle.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(20f, -156f), new Vector2(-20f, -116f));

            var play = UiFactory.TextButton(card, "Play", "PLAY", 38, UiFactory.Cta, UiFactory.Cream, onPlay);
            UiFactory.PlaceFixed(play.gameObject, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0f, -190f), new Vector2(420f, 100f));
            _playLabel = UiFactory.ButtonLabel(play);

            var newGame = UiFactory.TextButton(card, "NewGame", "New Game", 28, UiFactory.PanelLight, UiFactory.Cream, onNewGame);
            UiFactory.PlaceFixed(newGame.gameObject, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0f, -312f), new Vector2(420f, 76f));
            var settings = UiFactory.TextButton(card, "Settings", "Settings", 28, UiFactory.PanelLight, UiFactory.Cream, onSettings);
            UiFactory.PlaceFixed(settings.gameObject, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0f, -406f), new Vector2(420f, 76f));

            _root.SetActive(false);
        }

        public void Show(bool resume)
        {
            _playLabel.text = resume ? "CONTINUE" : "PLAY";
            _root.SetActive(true);
        }

        public void Hide() => _root.SetActive(false);
    }
}
