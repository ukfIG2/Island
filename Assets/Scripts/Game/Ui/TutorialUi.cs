using UnityEngine;
using UnityEngine.UI;

namespace ResortEmpire.Game.Ui
{
    // First-session coach hints (Jira FR-54, P15 — content to be replaced by the missing First Session
    // walkthrough). Five short hints, each shown once, in the order the moments happen: START WAVE, the
    // wave panel, the first bottleneck, the first worker move, the first result. Never a modal: the panel
    // only takes taps on its own buttons, the wave keeps running, and "Skip tutorial" ends it for good.
    public sealed class TutorialUi
    {
        public enum Hint { StartWave, WavePanel, Bottleneck, WorkerMoved, Result }

        public const string DoneKey = "resort.tutorialDone";
        const string SeenKey = "resort.tutorialSeen";   // bit mask of hints already shown
        const int AllHints = (1 << 5) - 1;

        enum Spot { AboveStart, LeftOfIsland, BesideResult }

        readonly GameObject _root;
        readonly RectTransform _rect;
        readonly Text _text;
        readonly RectTransform _arrow;
        bool _done;
        int _seen;
        Hint? _current;
        bool _suppressed;

        public GameObject Root => _root;
        public bool Active => !_done;
        public Hint? Current => _current;

        public TutorialUi(Transform canvas, GameController game)
        {
            _done = PlayerPrefs.GetInt(DoneKey, 0) != 0;
            _seen = PlayerPrefs.GetInt(SeenKey, 0);
            // A save with progress made before any hint was shown is not a first session.
            if (!_done && _seen == 0 && game.Resort.WavesCompleted > 0) Finish();

            // Gold frame around a panel; neither image takes raycasts, so taps on the island under the
            // panel still reach the buildings. Only the two buttons are interactive.
            var frame = UiFactory.PanelImage(canvas, "Tutorial", UiFactory.Gold);
            frame.raycastTarget = false;
            _root = frame.gameObject;
            _rect = (RectTransform)_root.transform;
            var inner = UiFactory.PanelImage(_root.transform, "Inner", UiFactory.Panel);
            inner.raycastTarget = false;
            UiFactory.Place(inner.gameObject, Vector2.zero, Vector2.one, new Vector2(3f, 3f), new Vector2(-3f, -3f));

            _text = UiFactory.Label(inner.transform, "Text", "", 24, UiFactory.Cream, TextAnchor.UpperLeft);
            UiFactory.Place(_text.gameObject, Vector2.zero, Vector2.one, new Vector2(20f, 70f), new Vector2(-20f, -16f));
            _text.horizontalOverflow = HorizontalWrapMode.Wrap;

            var gotIt = UiFactory.TextButton(inner.transform, "GotIt", "Got it", 24, UiFactory.Positive, UiFactory.Cream, OnGotIt);
            UiFactory.PlaceFixed(gotIt.gameObject, new Vector2(1f, 0f), new Vector2(1f, 0f), new Vector2(-14f, 12f), new Vector2(150f, 48f));
            var skip = UiFactory.TextButton(inner.transform, "Skip", "Skip tutorial", 20, UiFactory.PanelShade, UiFactory.CreamDim, OnSkip);
            UiFactory.PlaceFixed(skip.gameObject, new Vector2(0f, 0f), new Vector2(0f, 0f), new Vector2(14f, 12f), new Vector2(170f, 48f));

            _arrow = UiFactory.Icon(_root.transform, "Pointer", UiFactory.Arrow, UiFactory.Gold).rectTransform;
            _root.SetActive(false);
        }

        // The moment for a hint has come: show it, unless it was shown before (once per player).
        public void Trigger(Hint hint)
        {
            if (_done || Seen(hint)) return;
            _seen |= Bit(hint);
            PlayerPrefs.SetInt(SeenKey, _seen);
            PlayerPrefs.Save();
            _current = hint;
            Layout(hint);
            Apply();
        }

        // The moment has passed (the wave started, ended, the result was claimed): quietly retire it.
        public void Resolve(Hint hint)
        {
            if (_current != hint) return;
            Retire();
        }

        // Menus and other modal cards hide the coach without losing its place.
        public void SetSuppressed(bool suppressed)
        {
            if (_suppressed == suppressed) return;
            _suppressed = suppressed;
            Apply();
        }

        bool Seen(Hint hint) => (_seen & Bit(hint)) != 0;
        static int Bit(Hint hint) => 1 << (int)hint;

        void Apply()
        {
            bool show = !_done && _current.HasValue && !_suppressed;
            if (_root.activeSelf != show) _root.SetActive(show);
        }

        void OnGotIt() => Retire();

        void OnSkip() => Finish();

        void Retire()
        {
            _current = null;
            if ((_seen & AllHints) == AllHints) Finish();
            else Apply();
        }

        void Finish()
        {
            _done = true;
            _current = null;
            PlayerPrefs.SetInt(DoneKey, 1);
            PlayerPrefs.Save();
            if (_root != null) _root.SetActive(false);
        }

        void Layout(Hint hint)
        {
            switch (hint)
            {
                case Hint.StartWave:
                    _text.text = "Your first guests are waiting at the dock. Tap START WAVE when you're ready.";
                    Place(Spot.AboveStart);
                    break;
                case Hint.WavePanel:
                    _text.text = "The panel on the right shows every line. Short bars are fine; watch for “Queue growing”.";
                    Place(Spot.LeftOfIsland);
                    break;
                case Hint.Bottleneck:
                    _text.text = "A line is growing — tap the building or its row to send a worker.";
                    Place(Spot.LeftOfIsland);
                    break;
                case Hint.WorkerMoved:
                    _text.text = "Moving workers is free — the building you left slows down.";
                    Place(Spot.LeftOfIsland);
                    break;
                default:
                    _text.text = "Upgrade what was slow, then start the next wave.";
                    Place(Spot.BesideResult);
                    break;
            }
        }

        // Spots chosen from the camera framing (1920 x 1080 reference):
        //  - AboveStart: 710-1210 x 206-396 from the bottom, over the sand between plaza and dock; the
        //    arrow points down at START WAVE (730-1190 x 36-146). Clear of the Staff button (510-710).
        //  - LeftOfIsland: 20-420 x 110-350 from the top — open sea left of the island during a wave
        //    (the forecast card that lives there is hidden while a wave runs).
        //  - BesideResult: 1460-1900, vertically centered, right of the S4 card (490-1430); the arrow
        //    points left at it.
        void Place(Spot spot)
        {
            switch (spot)
            {
                case Spot.AboveStart:
                    SetRect(new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0f, 206f), new Vector2(500f, 190f));
                    SetArrow(true, new Vector2(0.5f, 0f), new Vector2(0f, -26f), -90f);
                    break;
                case Spot.LeftOfIsland:
                    SetRect(new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(20f, -110f), new Vector2(400f, 240f));
                    SetArrow(false, Vector2.zero, Vector2.zero, 0f);
                    break;
                default:
                    SetRect(new Vector2(1f, 0.5f), new Vector2(1f, 0.5f), new Vector2(-20f, 0f), new Vector2(440f, 200f));
                    SetArrow(true, new Vector2(0f, 0.5f), new Vector2(-30f, 0f), 180f);
                    break;
            }
        }

        void SetRect(Vector2 anchor, Vector2 pivot, Vector2 pos, Vector2 size)
        {
            _rect.anchorMin = anchor;
            _rect.anchorMax = anchor;
            _rect.pivot = pivot;
            _rect.anchoredPosition = pos;
            _rect.sizeDelta = size;
        }

        void SetArrow(bool visible, Vector2 anchor, Vector2 pos, float angle)
        {
            _arrow.gameObject.SetActive(visible);
            if (!visible) return;
            _arrow.anchorMin = anchor;
            _arrow.anchorMax = anchor;
            _arrow.pivot = new Vector2(0.5f, 0.5f);
            _arrow.anchoredPosition = pos;
            _arrow.sizeDelta = new Vector2(44f, 44f);
            _arrow.localEulerAngles = new Vector3(0f, 0f, angle);
        }
    }
}
