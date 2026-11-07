using UnityEngine;
using UnityEngine.UI;

namespace ResortEmpire.Game.Ui
{
    // S2 wave panel on the right: queues, statuses and warnings — never a live satisfaction number.
    public sealed class NeedsPanelUi
    {
        readonly GameController _game;
        readonly GameObject _root;
        readonly Text _title;
        readonly Text _pauseLabel;
        readonly Text _speedLabel;

        public NeedsPanelUi(Transform canvas, GameController game)
        {
            _game = game;
            var panel = UiFactory.PanelImage(canvas, "NeedsPanel", UiFactory.Panel);
            _root = panel.gameObject;
            UiFactory.PlaceFixed(_root, Vector2.one, Vector2.one, new Vector2(-12f, -96f), new Vector2(520f, 700f));

            _title = UiFactory.Label(panel.transform, "Title", "", 26, UiFactory.Cream, TextAnchor.MiddleLeft, FontStyle.Bold);
            UiFactory.Place(_title.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(20f, -46f), new Vector2(-20f, -10f));

            var pause = UiFactory.TextButton(panel.transform, "Pause", "Pause", 22, UiFactory.PanelLight, UiFactory.Cream, OnPause);
            UiFactory.PlaceFixed(pause.gameObject, new Vector2(1f, 0f), new Vector2(1f, 0f), new Vector2(-136f, 14f), new Vector2(120f, 44f));
            _pauseLabel = UiFactory.ButtonLabel(pause);

            var speed = UiFactory.TextButton(panel.transform, "Speed", "1x", 22, UiFactory.PanelLight, UiFactory.Cream, OnSpeed);
            UiFactory.PlaceFixed(speed.gameObject, new Vector2(1f, 0f), new Vector2(1f, 0f), new Vector2(-16f, 14f), new Vector2(104f, 44f));
            _speedLabel = UiFactory.ButtonLabel(speed);

            _root.SetActive(false);
        }

        void OnPause() => _game.SetPaused(!_game.IsPaused);

        // Dev convenience only; the sim steps in fixed slices either way.
        void OnSpeed()
        {
            _game.SimSpeed = _game.SimSpeed < 2f ? 4f : 1f;
            _speedLabel.text = _game.SimSpeed < 2f ? "1x" : "4x";
        }

        public void SetVisible(bool visible)
        {
            if (_root.activeSelf != visible) _root.SetActive(visible);
        }

        public void Refresh()
        {
            if (_game.ActiveWave == null) return;
            _title.text = "Wave " + _game.NextWaveIndex;
            _pauseLabel.text = _game.IsPaused ? "Resume" : "Pause";
            _speedLabel.text = _game.SimSpeed < 2f ? "1x" : "4x";
        }
    }
}
