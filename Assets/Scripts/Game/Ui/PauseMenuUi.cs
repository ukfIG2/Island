using UnityEngine;
using UnityEngine.Events;
using UnityEngine.UI;

namespace ResortEmpire.Game.Ui
{
    // The in-game menu behind the Menu button. A running wave waits while it is open (the shell sets that).
    public sealed class PauseMenuUi
    {
        readonly GameObject _root;
        readonly Text _title;

        public GameObject Root => _root;
        public bool Visible => _root.activeSelf;

        public PauseMenuUi(Transform canvas, UnityAction onResume, UnityAction onSettings, UnityAction onMainMenu = null)
        {
            _root = UiFactory.Overlay(canvas, "PauseMenu", new Color(0f, 0f, 0f, 0.45f)).gameObject;
            bool hasMainMenu = onMainMenu != null;
            var card = UiFactory.PanelImage(_root.transform, "Card", UiFactory.Panel).transform;
            UiFactory.PlaceFixed(card.gameObject, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero,
                new Vector2(540f, hasMainMenu ? 460f : 370f));

            _title = UiFactory.Label(card, "Title", "", 44, UiFactory.Cream, TextAnchor.MiddleCenter, FontStyle.Bold);
            UiFactory.Place(_title.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(20f, -92f), new Vector2(-20f, -30f));

            var resume = UiFactory.TextButton(card, "Resume", "Resume", 36, UiFactory.Cta, UiFactory.Cream, onResume);
            UiFactory.PlaceFixed(resume.gameObject, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0f, -120f), new Vector2(400f, 96f));
            var settings = UiFactory.TextButton(card, "Settings", "Settings", 30, UiFactory.PanelLight, UiFactory.Cream, onSettings);
            UiFactory.PlaceFixed(settings.gameObject, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0f, -242f), new Vector2(400f, 76f));
            if (hasMainMenu)
            {
                var main = UiFactory.TextButton(card, "MainMenu", "Main Menu", 30, UiFactory.PanelLight, UiFactory.Cream, onMainMenu);
                UiFactory.PlaceFixed(main.gameObject, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0f, -336f), new Vector2(400f, 76f));
            }

            _root.SetActive(false);
        }

        public void Show(bool waveRunning)
        {
            _title.text = waveRunning ? "Paused" : "Menu";
            _root.SetActive(true);
        }

        public void Hide() => _root.SetActive(false);
    }
}
