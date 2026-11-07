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

        static Font _font;
        static Sprite _rounded;

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

        static Color Hex(int rgb)
            => new Color(((rgb >> 16) & 0xFF) / 255f, ((rgb >> 8) & 0xFF) / 255f, (rgb & 0xFF) / 255f);
    }
}
