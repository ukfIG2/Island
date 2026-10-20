using UnityEngine;
using UnityEngine.Events;
using UnityEngine.UI;

namespace ResortEmpire.Game.Ui
{
    // Settings panel (Jira E09). There is no audio yet; the toggles are stored now so it can read them later.
    public sealed class SettingsUi
    {
        public const string SoundKey = "resort.sound";
        public const string MusicKey = "resort.music";

        public static bool SoundOn => PlayerPrefs.GetInt(SoundKey, 1) != 0;
        public static bool MusicOn => PlayerPrefs.GetInt(MusicKey, 1) != 0;

        readonly GameObject _root;
        readonly Button _sound;
        readonly Button _music;

        public GameObject Root => _root;
        public bool Visible => _root.activeSelf;

        public SettingsUi(Transform canvas, UnityAction onBack, UnityAction onReset)
        {
            _root = UiFactory.Overlay(canvas, "Settings", new Color(0f, 0f, 0f, 0.45f)).gameObject;
            var card = UiFactory.PanelImage(_root.transform, "Card", UiFactory.Panel).transform;
            UiFactory.PlaceFixed(card.gameObject, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(600f, 520f));

            var title = UiFactory.Label(card, "Title", "Settings", 42, UiFactory.Cream, TextAnchor.MiddleCenter, FontStyle.Bold);
            UiFactory.Place(title.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(20f, -90f), new Vector2(-20f, -30f));

            _sound = ToggleRow(card, "Sound", -130f, SoundKey);
            _music = ToggleRow(card, "Music", -214f, MusicKey);

            var reset = UiFactory.TextButton(card, "ResetProgress", "Reset progress", 26, UiFactory.PanelLight, UiFactory.Cream, onReset);
            UiFactory.PlaceFixed(reset.gameObject, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0f, -300f), new Vector2(420f, 70f));

            var back = UiFactory.TextButton(card, "Back", "Back", 30, UiFactory.Cta, UiFactory.Cream, onBack);
            UiFactory.PlaceFixed(back.gameObject, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0f, 34f), new Vector2(300f, 84f));

            _root.SetActive(false);
        }

        Button ToggleRow(Transform card, string name, float y, string key)
        {
            var label = UiFactory.Label(card, name + "Label", name, 30, UiFactory.Cream);
            UiFactory.Place(label.gameObject, new Vector2(0f, 1f), new Vector2(1f, 1f), new Vector2(70f, y - 62f), new Vector2(-260f, y));
            Button toggle = null;
            toggle = UiFactory.TextButton(card, name + "Toggle", "", 26, UiFactory.Positive, UiFactory.Cream, () =>
            {
                PlayerPrefs.SetInt(key, PlayerPrefs.GetInt(key, 1) != 0 ? 0 : 1);
                PlayerPrefs.Save();
                Paint(toggle, key);
            });
            UiFactory.PlaceFixed(toggle.gameObject, new Vector2(1f, 1f), new Vector2(1f, 1f), new Vector2(-70f, y), new Vector2(170f, 62f));
            return toggle;
        }

        static void Paint(Button toggle, string key)
        {
            bool on = PlayerPrefs.GetInt(key, 1) != 0;
            UiFactory.ButtonLabel(toggle).text = on ? "On" : "Off";
            ((Image)toggle.targetGraphic).color = on ? UiFactory.Positive : UiFactory.PanelShade;
        }

        public void Show()
        {
            Paint(_sound, SoundKey);
            Paint(_music, MusicKey);
            _root.SetActive(true);
        }

        public void Hide() => _root.SetActive(false);
    }
}
