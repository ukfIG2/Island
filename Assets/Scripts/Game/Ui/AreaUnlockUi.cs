using System;
using System.Collections.Generic;
using ResortEmpire.Sim;
using UnityEngine;
using UnityEngine.UI;

namespace ResortEmpire.Game.Ui
{
    // S9 Area Unlock: a full-screen celebration, one template with two occupants (Pool after wave 3,
    // Bungalows after wave 6). The second visit gets its own scene and accent so it reads as a new
    // celebration, not a recycled dialog (UI handoff S9).
    public sealed class AreaUnlockUi
    {
        enum Drift { Bob, Rise, Twinkle }

        sealed class Decor
        {
            public RectTransform Rect;
            public Image Image;
            public Vector2 Base;
            public float Phase;
            public float BaseAlpha;
            public Drift Drift;
        }

        sealed class Theme
        {
            public Color Backdrop;
            public Color Accent;
            public string Headline;
            public string Title;
            public string Adds;
            public GameObject Scene;
            public readonly List<Decor> Decor = new List<Decor>();
        }

        const float PopSeconds = 0.5f;

        readonly GameController _game;
        readonly Action _onClosed;
        readonly GameObject _root;
        readonly Image _backdrop;
        readonly RectTransform _content;
        readonly Text _headline;
        readonly Text _title;
        readonly Image _ribbon;
        readonly Text _adds;
        readonly Text _cost;
        readonly Button _unlock;
        readonly Text _missing;
        readonly Theme _pool;
        readonly Theme _bungalows;
        Theme _theme;
        BuildingId _area;
        float _age;

        public GameObject Root => _root;
        public bool Visible => _root.activeSelf;

        public AreaUnlockUi(Transform canvas, GameController game, Action onClosed)
        {
            _game = game;
            _onClosed = onClosed;
            _backdrop = UiFactory.Overlay(canvas, "AreaUnlock", Color.black);
            _root = _backdrop.gameObject;

            _pool = new Theme
            {
                Backdrop = UiFactory.Hex(0x0B4F5C, 0.95f),
                Accent = UiFactory.Hex(0x7FE3DA),
                Headline = "New area available!",
                Title = "The Pool",
                Adds = "Adds: Relax demand"
            };
            _bungalows = new Theme
            {
                Backdrop = UiFactory.Hex(0x3A2147, 0.95f),
                Accent = UiFactory.Hex(0xFFB36B),
                Headline = "Your resort is growing again!",
                Title = "The Bungalows",
                Adds = "Adds: Ocean View demand — a premium need that counts extra"
            };
            BuildPoolScene(_pool);
            BuildSunsetScene(_bungalows);

            _content = UiFactory.Place(UiFactory.Go(_root.transform, "Content"), Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
            var c = _content.transform;

            _headline = Centered(c, "Headline", 36, FontStyle.Bold, 330f, 50f);
            _title = Centered(c, "Title", 92, FontStyle.Bold, 248f, 110f);
            var outline = _title.gameObject.AddComponent<Outline>();
            outline.effectColor = new Color(0f, 0f, 0f, 0.35f);
            outline.effectDistance = new Vector2(2f, -3f);
            _ribbon = UiFactory.PanelImage(c, "Ribbon", Color.white);
            _ribbon.raycastTarget = false;
            UiFactory.PlaceFixed(_ribbon.gameObject, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0f, 180f), new Vector2(420f, 8f));

            var glass = UiFactory.PanelImage(c, "Details", new Color(0f, 0f, 0f, 0.22f));
            glass.raycastTarget = false;
            UiFactory.PlaceFixed(glass.gameObject, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0f, 30f), new Vector2(1160f, 260f));

            _adds = Centered(c, "Adds", 32, FontStyle.Normal, 112f, 44f);
            // The new building brings its own worker; saying so stops the player waiting for a second purchase.
            var includes = UiFactory.Row(c, "Includes", 12f);
            UiFactory.PlaceFixed(includes.gameObject, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0f, 58f), new Vector2(1100f, 44f));
            UiFactory.RowIcon(includes, "Worker", UiFactory.Circle, UiFactory.Cta, 24f);
            UiFactory.Label(includes, "Text", "Includes: 1 Worker", 32, UiFactory.Cream, TextAnchor.MiddleLeft, FontStyle.Bold);
            var potential = Centered(c, "Potential", 28, FontStyle.Normal, 6f, 40f);
            potential.text = "Higher satisfaction potential";
            potential.color = UiFactory.CreamDim;

            var cost = UiFactory.Row(c, "Cost", 12f);
            UiFactory.PlaceFixed(cost.gameObject, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0f, -58f), new Vector2(1100f, 56f));
            UiFactory.RowIcon(cost, "Coin", UiFactory.Circle, UiFactory.Gold, 38f);
            _cost = UiFactory.Label(cost, "Text", "", 38, UiFactory.Cream, TextAnchor.MiddleLeft, FontStyle.Bold);

            _unlock = UiFactory.TextButton(c, "Unlock", "UNLOCK & EXPAND", 38, UiFactory.Cta, UiFactory.Cream, OnUnlock);
            UiFactory.PlaceFixed(_unlock.gameObject, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0f, -196f), new Vector2(560f, 112f));
            _missing = UiFactory.Badge(c, "Missing", 30, new Color(0f, 0f, 0f, 0.3f), UiFactory.Cream);
            UiFactory.PlaceFixed(_missing.transform.parent.gameObject, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0f, -196f), new Vector2(560f, 112f));

            var later = UiFactory.TextButton(c, "Later", "Later", 28, new Color(1f, 1f, 1f, 0.16f), UiFactory.Cream, Close);
            UiFactory.PlaceFixed(later.gameObject, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0f, -318f), new Vector2(260f, 72f));

            _root.SetActive(false);
        }

        static Text Centered(Transform parent, string name, int size, FontStyle style, float y, float height)
        {
            var t = UiFactory.Label(parent, name, "", size, UiFactory.Cream, TextAnchor.MiddleCenter, style);
            UiFactory.PlaceFixed(t.gameObject, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0f, y), new Vector2(1400f, height));
            return t;
        }

        // Pool: rising bubbles over a turquoise waterline.
        void BuildPoolScene(Theme theme)
        {
            theme.Scene = SceneRoot("PoolScene");
            var s = theme.Scene.transform;
            Band(s, "Water", 0f, 210f, UiFactory.Hex(0x2BB3B1, 0.32f));
            Band(s, "Waterline", 210f, 12f, UiFactory.Hex(0x7FE3DA, 0.35f));
            var bubbles = new[]
            {
                new Vector3(-760f, 300f, 220f), new Vector3(-620f, -250f, 140f), new Vector3(-850f, -60f, 90f),
                new Vector3(700f, 320f, 160f), new Vector3(820f, -40f, 250f), new Vector3(600f, -300f, 110f),
                new Vector3(-430f, 420f, 70f), new Vector3(440f, 440f, 90f)
            };
            for (int i = 0; i < bubbles.Length; i++)
                AddDecor(theme, s, UiFactory.Circle, UiFactory.Hex(0x4FD1C5, 0.22f), bubbles[i], i * 1.7f, Drift.Bob);
        }

        // Bungalows: a dusk sky with a setting sun on the right and a few early stars.
        void BuildSunsetScene(Theme theme)
        {
            theme.Scene = SceneRoot("SunsetScene");
            var s = theme.Scene.transform;
            AddDecor(theme, s, UiFactory.Circle, UiFactory.Hex(0xF59E4C, 0.9f), new Vector3(640f, -170f, 520f), 0f, Drift.Rise);
            foreach (var y in new[] { -230f, -280f, -322f })
            {
                var stripe = UiFactory.Go(s, "SunStripe").AddComponent<Image>();
                stripe.color = UiFactory.Hex(0x3A2147, 0.85f);
                stripe.raycastTarget = false;
                UiFactory.PlaceFixed(stripe.gameObject, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(640f, y), new Vector2(560f, 10f));
            }
            Band(s, "Sea", 0f, 200f, UiFactory.Hex(0x5B3A6B));
            Band(s, "Glow", 200f, 10f, UiFactory.Hex(0xFFB36B, 0.55f));
            var stars = new[]
            {
                new Vector3(-820f, 380f, 30f), new Vector3(-640f, 300f, 22f), new Vector3(-900f, 200f, 18f),
                new Vector3(-520f, 440f, 20f), new Vector3(-760f, 120f, 26f), new Vector3(380f, 430f, 18f)
            };
            for (int i = 0; i < stars.Length; i++)
                AddDecor(theme, s, UiFactory.Star, UiFactory.Hex(0xFFE7B8, 0.8f), stars[i], i * 1.3f, Drift.Twinkle);
        }

        GameObject SceneRoot(string name)
        {
            var go = UiFactory.Go(_root.transform, name);
            UiFactory.Place(go, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
            go.SetActive(false);
            return go;
        }

        static void Band(Transform parent, string name, float bottom, float height, Color color)
        {
            var band = UiFactory.Go(parent, name).AddComponent<Image>();
            band.color = color;
            band.raycastTarget = false;
            UiFactory.Place(band.gameObject, Vector2.zero, new Vector2(1f, 0f), new Vector2(0f, bottom), new Vector2(0f, bottom + height));
        }

        // spec: x, y offset from the screen center and z = size.
        static void AddDecor(Theme theme, Transform parent, Sprite sprite, Color color, Vector3 spec, float phase, Drift drift)
        {
            var img = UiFactory.Icon(parent, drift.ToString(), sprite, color);
            var rect = UiFactory.PlaceFixed(img.gameObject, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f),
                new Vector2(spec.x, spec.y), new Vector2(spec.z, spec.z));
            theme.Decor.Add(new Decor
            {
                Rect = rect, Image = img, Base = new Vector2(spec.x, spec.y),
                Phase = phase, BaseAlpha = color.a, Drift = drift
            });
        }

        // The eligibility gate this wave just opened, if any.
        public static BuildingId? AreaOpenedBy(TuningConfig t, int waveIndex)
        {
            if (waveIndex == t.PoolEligibleAfterWave) return BuildingId.Pool;
            if (waveIndex == t.BungalowsEligibleAfterWave) return BuildingId.Bungalows;
            return null;
        }

        public void Show(BuildingId area)
        {
            _area = area;
            _theme = area == BuildingId.Bungalows ? _bungalows : _pool;
            _pool.Scene.SetActive(_theme == _pool);
            _bungalows.Scene.SetActive(_theme == _bungalows);
            _backdrop.color = _theme.Backdrop;
            _headline.text = _theme.Headline;
            _headline.color = _theme.Accent;
            _ribbon.color = _theme.Accent;
            _title.text = _theme.Title;
            _adds.text = _theme.Adds;
            _age = 0f;
            _root.SetActive(true);
            Tick(0f);
            Refresh();
        }

        public void Refresh()
        {
            if (!Visible) return;
            var r = _game.Resort;
            int cost = r.UnlockCost(_area);
            if (cost < 0 || !r.IsEligible(_area))
            {
                Close();
                return;
            }
            _cost.text = UiFactory.Num(cost) + " Coins";
            bool affordable = r.Coins >= cost;
            _unlock.gameObject.SetActive(affordable);
            _missing.transform.parent.gameObject.SetActive(!affordable);
            if (!affordable) _missing.text = "Missing: " + UiFactory.Num(cost - r.Coins) + " Coins";
        }

        public void Tick(float dt)
        {
            if (!Visible) return;
            _age += dt;
            float pop = EaseOutBack(Mathf.Clamp01(_age / PopSeconds));
            _content.localScale = Vector3.one * Mathf.LerpUnclamped(0.82f, 1f, pop);

            foreach (var d in _theme.Decor)
            {
                switch (d.Drift)
                {
                    case Drift.Bob:
                        d.Rect.anchoredPosition = d.Base + new Vector2(0f, Mathf.Sin(_age * 0.8f + d.Phase) * 14f);
                        break;
                    case Drift.Rise:
                        float k = 1f - Mathf.Pow(1f - Mathf.Clamp01(_age / 1.6f), 3f);
                        d.Rect.anchoredPosition = d.Base + new Vector2(0f, (k - 1f) * 90f);
                        break;
                    default:
                        var color = d.Image.color;
                        color.a = d.BaseAlpha * (0.55f + 0.45f * Mathf.Sin(_age * 2.2f + d.Phase));
                        d.Image.color = color;
                        break;
                }
            }
        }

        static float EaseOutBack(float x)
        {
            const float c1 = 1.70158f;
            const float c3 = c1 + 1f;
            return 1f + c3 * Mathf.Pow(x - 1f, 3f) + c1 * Mathf.Pow(x - 1f, 2f);
        }

        void OnUnlock()
        {
            if (_game.Unlock(_area)) Close();
            else Refresh();
        }

        void Close()
        {
            if (!Visible) return;
            _root.SetActive(false);
            _onClosed?.Invoke();
        }
    }
}
