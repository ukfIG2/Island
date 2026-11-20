using ResortEmpire.Sim;
using UnityEngine;
using UnityEngine.UI;

namespace ResortEmpire.Game.Ui
{
    // A paused wave (the player left the app, or tapped Pause) waits behind one calm card with one button. The veil
    // lets taps and camera drags through, so the island can still be looked at while the wave waits.
    public sealed class ResumeOverlayUi
    {
        readonly GameController _game;
        readonly GameObject _root;

        public GameObject Root => _root;

        public ResumeOverlayUi(Transform canvas, GameController game)
        {
            _game = game;
            var veil = UiFactory.Go(canvas, "ResumeOverlay").AddComponent<Image>();
            veil.color = new Color(0f, 0f, 0f, 0.35f);
            veil.raycastTarget = false;
            _root = veil.gameObject;
            UiFactory.Place(_root, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);

            var card = UiFactory.PanelImage(_root.transform, "Card", UiFactory.Panel);
            UiFactory.PlaceFixed(card.gameObject, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(620f, 330f));

            var title = UiFactory.Label(card.transform, "Title", "Wave paused", 44, UiFactory.Cream, TextAnchor.MiddleCenter, FontStyle.Bold);
            UiFactory.Place(title.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(30f, -96f), new Vector2(-30f, -30f));

            var hint = UiFactory.Label(card.transform, "Hint", "Everything waits exactly where you left it.", 26, UiFactory.CreamDim, TextAnchor.UpperCenter);
            UiFactory.Place(hint.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(40f, -170f), new Vector2(-40f, -106f));
            hint.horizontalOverflow = HorizontalWrapMode.Wrap;

            var resume = UiFactory.TextButton(card.transform, "Resume", "RESUME", 34, UiFactory.Cta, UiFactory.Cream, OnResume);
            UiFactory.PlaceFixed(resume.gameObject, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0f, 36f), new Vector2(340f, 96f));

            _root.SetActive(false);
        }

        // hidden: a menu is open over the island, which has its own Resume; this card waits behind it.
        public void Refresh(bool hidden = false)
        {
            bool waiting = !hidden && _game.IsPaused && _game.CurrentPhase != WavePhase.WaveComplete;
            if (_root.activeSelf != waiting) _root.SetActive(waiting);
        }

        void OnResume() => _game.SetPaused(false);
    }
}
