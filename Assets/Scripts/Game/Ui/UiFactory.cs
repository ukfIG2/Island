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
        public static readonly Color Gold = new Color(0.94f, 0.78f, 0.37f);   // coins, stars, Resort Value
        public static readonly Color ReputationColor = Hex(0xC3B1F5);          // medal
        public static readonly Color MaterialsColor = Hex(0xD2A06A);           // crate
        public static readonly Color GemColor = Hex(0x74DDEA);                 // diamond

        // Every building that takes part in normal waves, in enum order. The Spa (VIP only) is left out
        // on purpose: no wave need, no worker slot, no island spot yet.
        public static readonly BuildingId[] WaveBuildings = CollectWaveBuildings();

        static BuildingId[] CollectWaveBuildings()
        {
            var list = new System.Collections.Generic.List<BuildingId>();
            foreach (BuildingId b in System.Enum.GetValues(typeof(BuildingId)))
                if (BuildingNeeds.IsWaveBuilding(b)) list.Add(b);
            return list.ToArray();
        }

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
                // High resolution because it is also drawn large (the sunset on the second S9 screen).
                if (_circle == null) _circle = MakeSprite(128, 63, Vector4.zero);
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

        static readonly Vector2[] ArrowShape =
        {
            new Vector2(0.06f, 0.40f), new Vector2(0.56f, 0.40f), new Vector2(0.56f, 0.18f),
            new Vector2(0.95f, 0.50f), new Vector2(0.56f, 0.82f), new Vector2(0.56f, 0.60f),
            new Vector2(0.06f, 0.60f)
        };

        static Sprite _arrow;

        // Diamond with a thin girdle line, so it reads as a cut gem rather than a kite.
        static readonly Vector2[] GemShape =
        {
            new Vector2(0.30f, 0.88f), new Vector2(0.70f, 0.88f), new Vector2(0.96f, 0.60f),
            new Vector2(0.50f, 0.05f), new Vector2(0.04f, 0.60f)
        };

        // The two ribbon tails hanging above the medal disc.
        static readonly Vector2[] RibbonLeft =
            { new Vector2(0.18f, 0.98f), new Vector2(0.42f, 0.98f), new Vector2(0.58f, 0.62f), new Vector2(0.36f, 0.62f) };
        static readonly Vector2[] RibbonRight =
            { new Vector2(0.58f, 0.98f), new Vector2(0.82f, 0.98f), new Vector2(0.64f, 0.62f), new Vector2(0.42f, 0.62f) };

        static Sprite _gem;
        static Sprite _crate;
        static Sprite _medal;
        static Sprite _person;

        public static Sprite Star => _star != null ? _star : _star = MakeIcon(InStar);

        // Gems: a cut diamond.
        public static Sprite Gem => _gem != null ? _gem : _gem = MakeIcon((x, y) =>
            InPolygon(GemShape, x, y) && !(y > 0.57f && y < 0.63f && x > 0.14f && x < 0.86f));

        // Materials: a wooden crate — frame plus a middle plank, two slots cut out.
        public static Sprite Crate => _crate != null ? _crate : _crate = MakeIcon((x, y) =>
            x > 0.08f && x < 0.92f && y > 0.10f && y < 0.90f
            && !(x > 0.21f && x < 0.79f && ((y > 0.23f && y < 0.44f) || (y > 0.56f && y < 0.77f))));

        // Reputation: a medal — ringed disc under two ribbon tails, with a small gap between them.
        public static Sprite Medal => _medal != null ? _medal : _medal = MakeIcon((x, y) =>
        {
            float dx = x - 0.5f, dy = y - 0.36f;
            float d = Mathf.Sqrt(dx * dx + dy * dy);
            if (d < 0.31f) return !(d > 0.18f && d < 0.225f);
            return d > 0.35f && (InPolygon(RibbonLeft, x, y) || InPolygon(RibbonRight, x, y));
        });

        // Staff: head and shoulders.
        public static Sprite Person => _person != null ? _person : _person = MakeIcon((x, y) =>
        {
            float hx = x - 0.5f, hy = y - 0.74f;
            if (hx * hx + hy * hy < 0.17f * 0.17f) return true;
            float bx = (x - 0.5f) / 0.36f, by = (y - 0.06f) / 0.44f;
            return y > 0.06f && y < 0.52f && bx * bx + by * by < 1f;
        });

        public static Sprite Bolt => _bolt != null ? _bolt : _bolt = MakeIcon((x, y) => InPolygon(BoltShape, x, y));
        public static Sprite Arrow => _arrow != null ? _arrow : _arrow = MakeIcon((x, y) => InPolygon(ArrowShape, x, y));

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

        // Full-screen tint that also swallows taps meant for whatever sits behind it.
        public static Image Overlay(Transform parent, string name, Color color)
        {
            var img = Go(parent, name).AddComponent<Image>();
            img.color = color;
            Place(img.gameObject, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
            return img;
        }

        // Non-interactive rounded chip with centered text, e.g. "Missing: 400 Coins" in place of a CTA.
        public static Text Badge(Transform parent, string name, int fontSize, Color bg, Color fg)
        {
            var img = PanelImage(parent, name, bg);
            img.raycastTarget = false;
            var t = Label(img.transform, "Label", "", fontSize, fg, TextAnchor.MiddleCenter, FontStyle.Bold);
            Place(t.gameObject, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
            return t;
        }

        // Horizontal run sized to its content (icon + text pieces), aligned inside its own rect.
        public static RectTransform Row(Transform parent, string name, float spacing, TextAnchor align = TextAnchor.MiddleCenter)
        {
            var go = Go(parent, name);
            var layout = go.AddComponent<HorizontalLayoutGroup>();
            layout.childAlignment = align;
            layout.spacing = spacing;
            layout.childControlWidth = true;
            layout.childControlHeight = true;
            layout.childForceExpandWidth = false;
            layout.childForceExpandHeight = true;
            return (RectTransform)go.transform;
        }

        public static Image RowIcon(Transform row, string name, Sprite sprite, Color color, float size)
        {
            var img = Icon(row, name, sprite, color);
            var element = img.gameObject.AddComponent<LayoutElement>();
            element.minWidth = size;
            element.preferredWidth = size;
            return img;
        }

        public static void RowGap(Transform row, float width)
        {
            var element = Go(row, "Gap").AddComponent<LayoutElement>();
            element.minWidth = width;
            element.preferredWidth = width;
        }

        public static string Num(int value) => value.ToString("N0", System.Globalization.CultureInfo.InvariantCulture);

        // --- display names and status styling --------------------------------

        public static string NeedName(NeedId n) => n == NeedId.OceanView ? "Ocean View" : n.ToString();

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
            foreach (var b in WaveBuildings) // Serves is only meaningful for wave buildings
                if (BuildingNeeds.Serves(b) == n) return b;
            return BuildingId.Reception;
        }

        // Seats at a level; clamped so a level beyond the configured table never throws.
        public static int Seats(TuningConfig t, int level)
            => t.CapacityPerLevel[Mathf.Clamp(level, 1, t.CapacityPerLevel.Length) - 1];

        // "2,500 Coins + 4 Materials", or just "500 Coins" when no Materials are needed.
        public static string CostText(int coins, int materials)
        {
            string text = Num(coins) + " Coins";
            if (materials > 0) text += " + " + Num(materials) + " Materials";
            return text;
        }

        public static bool CanAfford(ResortState r, int coins, int materials)
            => r.Coins >= coins && r.Materials >= Mathf.Max(0, materials);

        // "Missing: 300 Coins + 1 Materials" — only the parts that are actually short.
        public static string MissingText(ResortState r, int coins, int materials)
        {
            int coinGap = Mathf.Max(0, coins - r.Coins);
            int materialGap = Mathf.Max(0, materials - r.Materials);
            string text = "Missing: ";
            if (coinGap > 0) text += Num(coinGap) + " Coins";
            if (coinGap > 0 && materialGap > 0) text += " + ";
            if (materialGap > 0) text += Num(materialGap) + " Materials";
            return text;
        }

        public static string ManagerTitle(BuildingId b) => GameController.ManagerTitle(b);

        public static string SpecialistTitle(SpecialistId s) => GameController.SpecialistTitle(s);

        // The Manager service bonus as shown to the player, e.g. "×1.2 service" (P7), read from the tuning.
        public static string ManagerEffect(TuningConfig t)
            => "×" + t.ManagerMultiplier.ToString("0.##", System.Globalization.CultureInfo.InvariantCulture) + " service";

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

        public static Color Hex(int rgb, float alpha = 1f)
            => new Color(((rgb >> 16) & 0xFF) / 255f, ((rgb >> 8) & 0xFF) / 255f, (rgb & 0xFF) / 255f, alpha);
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

    // One spot on a card that shows exactly one of: an action button, a non-interactive chip
    // (e.g. "Missing: 300 Coins" or "Chef is here") or a plain note. Labels accept rich text, so a
    // second, smaller line can carry the cost.
    public sealed class ActionSlot
    {
        public readonly RectTransform Root;
        readonly Button _button;
        readonly Image _buttonImage;
        readonly Text _buttonLabel;
        readonly Image _chip;
        readonly Text _chipLabel;
        readonly Text _note;

        public ActionSlot(Transform parent, string name, int fontSize, Color buttonColor,
            UnityEngine.Events.UnityAction onClick)
        {
            Root = (RectTransform)UiFactory.Go(parent, name).transform;
            _button = UiFactory.TextButton(Root, "Button", "", fontSize, buttonColor, UiFactory.Cream, onClick);
            UiFactory.Place(_button.gameObject, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
            _buttonImage = (Image)_button.targetGraphic;
            _buttonLabel = UiFactory.ButtonLabel(_button);

            _chipLabel = UiFactory.Badge(Root, "Chip", fontSize, UiFactory.PanelShade, UiFactory.CreamDim);
            _chip = _chipLabel.transform.parent.GetComponent<Image>();
            UiFactory.Place(_chip.gameObject, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);

            _note = UiFactory.Label(Root, "Note", "", fontSize - 2, UiFactory.CreamDim, TextAnchor.MiddleCenter);
            UiFactory.Place(_note.gameObject, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
            Hide();
        }

        public void ShowButton(string text)
        {
            Root.gameObject.SetActive(true);
            _button.gameObject.SetActive(true);
            _chip.gameObject.SetActive(false);
            _note.gameObject.SetActive(false);
            _buttonLabel.text = text;
        }

        public void SetButtonColor(Color color) => _buttonImage.color = color;

        public void ShowChip(string text) => ShowChip(text, UiFactory.PanelShade, UiFactory.CreamDim);

        public void ShowChip(string text, Color background, Color textColor)
        {
            Root.gameObject.SetActive(true);
            _button.gameObject.SetActive(false);
            _chip.gameObject.SetActive(true);
            _note.gameObject.SetActive(false);
            _chip.color = background;
            _chipLabel.color = textColor;
            _chipLabel.text = text;
        }

        public void ShowNote(string text)
        {
            Root.gameObject.SetActive(true);
            _button.gameObject.SetActive(false);
            _chip.gameObject.SetActive(false);
            _note.gameObject.SetActive(true);
            _note.text = text;
        }

        public void Hide() => Root.gameObject.SetActive(false);
    }
}
