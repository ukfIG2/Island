using UnityEngine;
using UnityEngine.UI;

namespace ResortEmpire.Game.Ui
{
    // S1 between-waves screen: the one START WAVE CTA.
    public sealed class HomeUi
    {
        readonly GameController _game;
        readonly GameObject _root;
        readonly Button _start;
        readonly Text _startLabel;
        readonly Text _complete;

        public HomeUi(Transform canvas, GameController game)
        {
            _game = game;
            _root = UiFactory.Go(canvas, "Home");
            UiFactory.Place(_root, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);

            _start = UiFactory.TextButton(_root.transform, "StartWave", "START WAVE", 40, UiFactory.Cta, UiFactory.Cream,
                () => _game.StartNextWave());
            UiFactory.PlaceFixed(_start.gameObject, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0f, 36f), new Vector2(460f, 110f));
            _startLabel = UiFactory.ButtonLabel(_start);

            _complete = UiFactory.Label(_root.transform, "PrototypeComplete", "Prototype complete — thanks for playing!", 32, UiFactory.Cream, TextAnchor.MiddleCenter, FontStyle.Bold);
            UiFactory.PlaceFixed(_complete.gameObject, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0f, 200f), new Vector2(1000f, 44f));
            var outline = _complete.gameObject.AddComponent<Outline>();
            outline.effectColor = new Color(0f, 0f, 0f, 0.45f);
        }

        public void SetVisible(bool visible)
        {
            if (_root.activeSelf != visible) _root.SetActive(visible);
        }

        public void Refresh()
        {
            var wave = _game.NextWaveDef;
            _start.gameObject.SetActive(wave != null);
            if (wave != null) _startLabel.text = "START WAVE " + wave.Index;
            _complete.gameObject.SetActive(wave == null);
        }
    }
}
