using UnityEngine;
using UnityEngine.Events;
using UnityEngine.UI;

namespace ResortEmpire.Game.Ui
{
    // In-game menu behind the top bar's Menu button. During a wave the shell pauses the wave while it is open.
    public sealed class PauseMenuUi
    {
        readonly GameObject _root;
        readonly Text _title;

        public GameObject Root => _root;
        public bool Visible => _root.activeSelf;

        public PauseMenuUi(Transform canvas, UnityAction onResume, UnityAction onSettings, UnityAction onMainMenu,
            UnityAction onShop = null)
        {
            _root = UiFactory.Overlay(canvas, "PauseMenu", new Color(0f, 0f, 0f, 0.45f)).gameObject;
            var card = UiFactory.PanelImage(_root.transform, "Card", UiFactory.Panel).transform;
            UiFactory.PlaceFixed(card.gameObject, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(520f, 528f));

            _title = UiFactory.Label(card, "Title", "", 42, UiFactory.Cream, TextAnchor.MiddleCenter, FontStyle.Bold);
            UiFactory.Place(_title.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(20f, -88f), new Vector2(-20f, -28f));

            var resume = UiFactory.TextButton(card, "Resume", "Resume", 34, UiFactory.Cta, UiFactory.Cream, onResume);
            UiFactory.PlaceFixed(resume.gameObject, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0f, -110f), new Vector2(380f, 92f));
            var settings = UiFactory.TextButton(card, "Settings", "Settings", 28, UiFactory.PanelLight, UiFactory.Cream, onSettings);
            UiFactory.PlaceFixed(settings.gameObject, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0f, -226f), new Vector2(380f, 72f));
            var mainMenu = UiFactory.TextButton(card, "MainMenu", "Main Menu", 28, UiFactory.PanelLight, UiFactory.Cream, onMainMenu);
            UiFactory.PlaceFixed(mainMenu.gameObject, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0f, -314f), new Vector2(380f, 72f));
            var shop = UiFactory.TextButton(card, "Shop", "Shop", 28, UiFactory.PanelLight, UiFactory.Cream, onShop);
            UiFactory.PlaceFixed(shop.gameObject, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0f, -402f), new Vector2(380f, 72f));

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
