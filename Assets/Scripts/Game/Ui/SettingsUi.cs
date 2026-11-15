using UnityEngine;
using UnityEngine.Events;
using UnityEngine.UI;

namespace ResortEmpire.Game.Ui
{
    // CAM-51: Sound, Music and Reset progress. Reset asks first (the shell shows the confirm card).
    public sealed class SettingsUi
    {
        readonly AppSettings _settings;
        readonly GameObject _root;
        readonly Button _sound;
        readonly Button _music;

        public GameObject Root => _root;
        public bool Visible => _root.activeSelf;

        public SettingsUi(Transform canvas, AppSettings settings, UnityAction onBack, UnityAction onReset)
        {
            _settings = settings;
            _root = UiFactory.Overlay(canvas, "Settings", new Color(0f, 0f, 0f, 0.45f)).gameObject;
            var card = UiFactory.PanelImage(_root.transform, "Card", UiFactory.Panel).transform;
            UiFactory.PlaceFixed(card.gameObject, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(640f, 560f));

            var title = UiFactory.Label(card, "Title", "Settings", 44, UiFactory.Cream, TextAnchor.MiddleCenter, FontStyle.Bold);
            UiFactory.Place(title.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(20f, -92f), new Vector2(-20f, -30f));

            _sound = ToggleRow(card, "Sound", -140f, () => _settings.ToggleSound());
            _music = ToggleRow(card, "Music", -226f, () => _settings.ToggleMusic());

            var reset = UiFactory.TextButton(card, "ResetProgress", "Reset progress", 28, UiFactory.PanelLight, UiFactory.Cream, onReset);
            UiFactory.PlaceFixed(reset.gameObject, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0f, -334f), new Vector2(440f, 76f));

            var back = UiFactory.TextButton(card, "Back", "Back", 32, UiFactory.Cta, UiFactory.Cream, onBack);
            UiFactory.PlaceFixed(back.gameObject, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0f, 34f), new Vector2(320f, 88f));

            _root.SetActive(false);
        }

        Button ToggleRow(Transform card, string name, float y, System.Action toggle)
        {
            var label = UiFactory.Label(card, name + "Label", name, 32, UiFactory.Cream);
            UiFactory.Place(label.gameObject, new Vector2(0f, 1f), new Vector2(1f, 1f), new Vector2(80f, y - 66f), new Vector2(-280f, y));
            Button button = null;
            button = UiFactory.TextButton(card, name + "Toggle", "", 28, UiFactory.Positive, UiFactory.Cream, () =>
            {
                toggle();
                Paint();
            });
            UiFactory.PlaceFixed(button.gameObject, new Vector2(1f, 1f), new Vector2(1f, 1f), new Vector2(-80f, y), new Vector2(180f, 66f));
            return button;
        }

        void Paint()
        {
            Paint(_sound, _settings.SoundOn);
            Paint(_music, _settings.MusicOn);
        }

        static void Paint(Button toggle, bool on)
        {
            UiFactory.ButtonLabel(toggle).text = on ? "On" : "Off";
            ((Image)toggle.targetGraphic).color = on ? UiFactory.Positive : UiFactory.PanelShade;
        }

        public void Show()
        {
            Paint();
            _root.SetActive(true);
        }

        public void Hide() => _root.SetActive(false);
    }
}
