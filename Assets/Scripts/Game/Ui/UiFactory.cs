using ResortEmpire.Sim;
using UnityEngine;
using UnityEngine.UI;

namespace ResortEmpire.Game.Ui
{
    // Shared widget helpers — the whole interface is assembled from these at runtime, no prefabs.
    public static class UiFactory
    {
        // Calm island palette from the UI handoff.
        public static readonly Color Panel = Hex(0x114E5A);
        public static readonly Color PanelShade = Hex(0x0C3A44);
        public static readonly Color PanelLight = Hex(0x1A6478);
        public static readonly Color Cream = Hex(0xFAF6EE);
        public static readonly Color CreamDim = new Color(0.98f, 0.965f, 0.933f, 0.62f);
        public static readonly Color Cta = Hex(0xE8743B);
        public static readonly Color Warning = Hex(0xC0392B);
        public static readonly Color Recovering = Hex(0xE3B23C);
        public static readonly Color Positive = Hex(0x3E8E5A);
        public static readonly Color Neutral = Hex(0x7FB2BF);
        public static readonly Color Premium = new Color(0.94f, 0.78f, 0.37f);

        static Font _font;
        static Sprite _rounded;
        static Sprite _circle;

        public static Font Font
        {
            get
            {
                if (_font == null) _font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
                return _font;
            }
        }

        // 9-sliced sprite with soft corners — gives flat panels a rounded feel without textures.
        public static Sprite Rounded
        {
            get
            {
                if (_rounded == null) _rounded = MakeSprite(32, 12, new Vector4(14f, 14f, 14f, 14f));
                return _rounded;
            }
        }

        public static Sprite Circle
        {
            get
            {
                if (_circle == null) _circle = MakeSprite(32, 15, Vector4.zero);
                return _circle;
            }
        }

        // The built-in runtime font has no ★ ⚡ ⚠ glyphs, so those symbols are drawn as sprites.
        static Sprite _star;
        static Sprite _bolt;
        static Sprite _alert;

        static readonly Vector2[] BoltShape =
        {
            new Vector2(0.60f, 0.98f), new Vector2(0.20f, 0.44f), new Vector2(0.46f, 0.44f),
            new Vector2(0.36f, 0.02f), new Vector2(0.80f, 0.58f), new Vector2(0.54f, 0.58f),
            new Vector2(0.68f, 0.98f)
        };

        static readonly Vector2[] AlertShape =
            { new Vector2(0.5f, 0.96f), new Vector2(0.03f, 0.07f), new Vector2(0.97f, 0.07f) };

        public static Sprite Star => _star != null ? _star : _star = MakeIcon(InStar);
        public static Sprite Bolt => _bolt != null ? _bolt : _bolt = MakeIcon((x, y) => InPolygon(BoltShape, x, y));

        // Triangle with the exclamation mark cut out of it.
        public static Sprite Alert => _alert != null ? _alert : _alert = MakeIcon((x, y) =>
            InPolygon(AlertShape, x, y)
            && !(x > 0.45f && x < 0.55f && ((y > 0.36f && y < 0.74f) || (y > 0.17f && y < 0.28f))));

        public static Image Icon(Transform parent, string name, Sprite sprite, Color color)
        {
            var img = Go(parent, name).AddComponent<Image>();
            img.sprite = sprite;
            img.color = color;
            img.preserveAspect = true;
            img.raycastTarget = false;
            return img;
        }

        static bool InStar(float x, float y)
        {
            var points = new Vector2[10];
            for (int i = 0; i < 10; i++)
            {
                float angle = Mathf.PI * 0.5f + i * Mathf.PI / 5f;
                float radius = i % 2 == 0 ? 0.49f : 0.2f;
                points[i] = new Vector2(0.5f + Mathf.Cos(angle) * radius, 0.47f + Mathf.Sin(angle) * radius);
            }
            return InPolygon(points, x, y);
        }

        static bool InPolygon(Vector2[] poly, float x, float y)
        {
            bool inside = false;
            for (int i = 0, j = poly.Length - 1; i < poly.Length; j = i++)
                if ((poly[i].y > y) != (poly[j].y > y)
                    && x < (poly[j].x - poly[i].x) * (y - poly[i].y) / (poly[j].y - poly[i].y) + poly[i].x)
                    inside = !inside;
            return inside;
        }

        // Rasterizes a 0..1 shape test into a white sprite, 4x4 supersampled for soft edges.
        static Sprite MakeIcon(System.Func<float, float, bool> inside)
        {
            const int size = 64;
            var tex = new Texture2D(size, size, TextureFormat.ARGB32, false)
            {
                hideFlags = HideFlags.HideAndDontSave,
                wrapMode = TextureWrapMode.Clamp
            };
            for (int y = 0; y < size; y++)
                for (int x = 0; x < size; x++)
                {
                    int hits = 0;
                    for (int sy = 0; sy < 4; sy++)
                        for (int sx = 0; sx < 4; sx++)
                            if (inside((x + (sx + 0.5f) / 4f) / size, (y + (sy + 0.5f) / 4f) / size)) hits++;
                    tex.SetPixel(x, y, new Color(1f, 1f, 1f, hits / 16f));
                }
            tex.Apply();
            return Sprite.Create(tex, new Rect(0f, 0f, size, size), new Vector2(0.5f, 0.5f), 100f);
        }

        static Sprite MakeSprite(int size, int radius, Vector4 border)
        {
            var tex = new Texture2D(size, size, TextureFormat.ARGB32, false)
            {
                hideFlags = HideFlags.HideAndDontSave,
                wrapMode = TextureWrapMode.Clamp
            };
            for (int y = 0; y < size; y++)
                for (int x = 0; x < size; x++)
                {
                    float cx = Mathf.Max(radius - x, x - (size - 1 - radius), 0f);
                    float cy = Mathf.Max(radius - y, y - (size - 1 - radius), 0f);
                    float a = Mathf.Clamp01(radius + 0.5f - Mathf.Sqrt(cx * cx + cy * cy));
                    tex.SetPixel(x, y, new Color(1f, 1f, 1f, a));
                }
            tex.Apply();
            return Sprite.Create(tex, new Rect(0f, 0f, size, size), new Vector2(0.5f, 0.5f), 100f, 0,
                SpriteMeshType.FullRect, border);
        }

        public static GameObject Go(Transform parent, string name)
        {
            var go = new GameObject(name, typeof(RectTransform));
            go.transform.SetParent(parent, false);
            return go;
        }

        public static RectTransform Place(GameObject go, Vector2 aMin, Vector2 aMax, Vector2 oMin, Vector2 oMax)
        {
            var rt = (RectTransform)go.transform;
            rt.anchorMin = aMin;
            rt.anchorMax = aMax;
            rt.offsetMin = oMin;
            rt.offsetMax = oMax;
            return rt;
        }

        public static RectTransform PlaceFixed(GameObject go, Vector2 anchor, Vector2 pivot, Vector2 pos, Vector2 size)
        {
            var rt = (RectTransform)go.transform;
            rt.anchorMin = anchor;
            rt.anchorMax = anchor;
            rt.pivot = pivot;
            rt.anchoredPosition = pos;
            rt.sizeDelta = size;
            return rt;
        }

        public static Image PanelImage(Transform parent, string name, Color color)
        {
            var img = Go(parent, name).AddComponent<Image>();
            img.sprite = Rounded;
            img.type = Image.Type.Sliced;
            img.color = color;
            return img;
        }

        public static Image Dot(Transform parent, string name, Color color)
        {
            var img = Go(parent, name).AddComponent<Image>();
            img.sprite = Circle;
            img.color = color;
            img.raycastTarget = false;
            return img;
        }

        public static Text Label(Transform parent, string name, string value, int size, Color color,
            TextAnchor align = TextAnchor.MiddleLeft, FontStyle style = FontStyle.Normal)
        {
            var t = Go(parent, name).AddComponent<Text>();
            t.font = Font;
            t.text = value;
            t.fontSize = size;
            t.color = color;
            t.alignment = align;
            t.fontStyle = style;
            t.horizontalOverflow = HorizontalWrapMode.Overflow;
            t.verticalOverflow = VerticalWrapMode.Overflow;
            t.raycastTarget = false;
            return t;
        }

        public static Button TextButton(Transform parent, string name, string label, int fontSize,
            Color bg, Color fg, UnityEngine.Events.UnityAction onClick)
        {
            var img = PanelImage(parent, name, bg);
            var b = img.gameObject.AddComponent<Button>();
            b.targetGraphic = img;
            var t = Label(img.transform, "Label", label, fontSize, fg, TextAnchor.MiddleCenter, FontStyle.Bold);
            Place(t.gameObject, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
            if (onClick != null) b.onClick.AddListener(onClick);
            return b;
        }

        public static Text ButtonLabel(Button b) => b.GetComponentInChildren<Text>();

        // --- display names and status styling --------------------------------

        public static string NeedName(NeedId n) => n == NeedId.OceanView ? "Ocean View" : n.ToString();

        // Ocean View is the premium stay: its waits weigh more in satisfaction (TuningConfig), so the
        // player sees it marked wherever needs are listed.
        public static bool IsPremium(NeedId n) => n == NeedId.OceanView;

        public static Image PremiumTag(Transform parent)
        {
            var chip = PanelImage(parent, "PremiumTag", Premium);
            chip.raycastTarget = false;
            var text = Label(chip.transform, "Text", "Premium", 16, Panel, TextAnchor.MiddleCenter, FontStyle.Bold);
            Place(text.gameObject, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
            return chip;
        }

        public static Color NeedColor(NeedId n)
        {
            switch (n)
            {
                case NeedId.Rooms: return Hex(0x5B8FD4);
                case NeedId.Drinks: return Hex(0xD45FA0);
                case NeedId.Food: return Hex(0xE8975A);
                case NeedId.Relax: return Hex(0x58C1B2);
                default: return Hex(0x8E6FC9);
            }
        }

        public static BuildingId BuildingFor(NeedId n)
        {
            foreach (BuildingId b in System.Enum.GetValues(typeof(BuildingId)))
                if (BuildingNeeds.Serves(b) == n) return b;
            return BuildingId.Reception;
        }

        public static Color StatusColor(NeedStatus s)
        {
            switch (s)
            {
                case NeedStatus.Bottleneck: return Warning;
                case NeedStatus.Recovering: return Recovering;
                case NeedStatus.Satisfied: return Positive;
                case NeedStatus.Locked: return CreamDim;
                default: return Neutral;
            }
        }

        public static string StatusWord(NeedStatus s)
        {
            switch (s)
            {
                case NeedStatus.Bottleneck: return "Queue growing";
                case NeedStatus.Recovering: return "Catching up";
                case NeedStatus.Satisfied: return "Satisfied";
                case NeedStatus.Locked: return "Locked";
                default: return "Steady";
            }
        }

        static Color Hex(int rgb)
            => new Color(((rgb >> 16) & 0xFF) / 255f, ((rgb >> 8) & 0xFF) / 255f, (rgb & 0xFF) / 255f);
    }

    // Horizontal meter: rounded background with a left-anchored fill.
    public sealed class BarWidget
    {
        public readonly GameObject Root;
        readonly Image _fill;
        readonly RectTransform _fillRect;

        public BarWidget(Transform parent, string name, Color background)
        {
            var back = UiFactory.PanelImage(parent, name, background);
            back.raycastTarget = false;
            Root = back.gameObject;
            _fill = UiFactory.PanelImage(back.transform, "Fill", UiFactory.Cream);
            _fill.raycastTarget = false;
            _fillRect = UiFactory.Place(_fill.gameObject, Vector2.zero, new Vector2(0f, 1f),
                new Vector2(2f, 2f), new Vector2(-2f, -2f));
            SetFill(0f, UiFactory.Cream);
        }

        public void SetFill(float fraction, Color color)
        {
            fraction = Mathf.Clamp01(fraction);
            _fill.enabled = fraction > 0.03f;
            _fill.color = color;
            _fillRect.anchorMax = new Vector2(fraction, 1f);
        }
    }
}
