using ResortEmpire.Sim;
using UnityEngine;
using UnityEngine.Events;
using UnityEngine.UI;

namespace ResortEmpire.Game.Ui
{
    // S1 header, always visible (Jira FR-03): Menu and Resort Value on the left, the five currencies on
    // the right, the resort status centered in the space between them. The status lives inside the bar
    // so it never covers buildings at the back of the island.
    //
    // Fit check at the 1920-wide reference (bar = 1920 - 2 * 12 = 1896, x measured inside the bar):
    //   Menu            8 ..  118
    //   Resort Value  134 ..  464   ("Resort Value 999,999" at 28 bold ~ 280 + 40 icon = 320)
    //   Status        474 ..  943   (stretches; longest line "Ready for Guests" at 26 ~ 205)
    //   Coins         953 .. 1148   195  ("Coins 999,999"  at 24 ~ 155 + 38 icon = 193)
    //   Energy       1160 .. 1320   160  ("Energy 999"     at 24 ~ 123 + 38 = 161 — rarely 3 digits)
    //   Reputation   1332 .. 1532   200  ("Reputation 999" at 24 ~ 163 + 38 = 201)
    //   Materials    1544 .. 1724   180  ("Materials 999"  at 24 ~ 144 + 38 = 182)
    //   Gems         1736 .. 1886   150  ("Gems 999"       at 24 ~ 111 + 38 = 149)
    // 12 px between currency blocks, 10 px to the bar's right edge; nothing overlaps.
    public sealed class TopBarUi
    {
        const int CurrencyFont = 24;
        const float CurrencyGap = 12f;
        const float RightPadding = 10f;

        readonly GameController _game;
        readonly Text _resortValue;
        readonly Text _coins;
        readonly Text _energy;
        readonly Text _reputation;
        readonly Text _materials;
        readonly Text _gems;
        readonly Text _status;

        public TopBarUi(Transform canvas, GameController game, UnityAction onMenu, UnityAction onGems = null)
        {
            _game = game;
            var bar = UiFactory.PanelImage(canvas, "TopBar", UiFactory.Panel);
            UiFactory.Place(bar.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(12f, -72f), new Vector2(-12f, -8f));

            var menu = UiFactory.TextButton(bar.transform, "Menu", "Menu", 24, UiFactory.PanelLight, UiFactory.Cream, onMenu);
            UiFactory.PlaceFixed(menu.gameObject, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), new Vector2(8f, 0f), new Vector2(110f, 48f));

            _resortValue = Group(bar.transform, "ResortValue", UiFactory.Star, UiFactory.Gold, new Vector2(0f, 0.5f),
                134f, 330f, 32f, 28, FontStyle.Bold);

            // Right to left, so each block's width only pushes the ones further left.
            float right = -RightPadding;
            _gems = RightGroup(bar.transform, "Gems", UiFactory.Gem, UiFactory.GemColor, 150f, ref right);
            // Tapping Gems opens the Shop placeholder (P16); a transparent hit area over the block.
            var gemsGroup = _gems.transform.parent.gameObject;
            var hit = gemsGroup.AddComponent<Image>();
            hit.color = new Color(1f, 1f, 1f, 0f);
            var gemsButton = gemsGroup.AddComponent<Button>();
            gemsButton.targetGraphic = hit;
            if (onGems != null) gemsButton.onClick.AddListener(onGems);
            _materials = RightGroup(bar.transform, "Materials", UiFactory.Crate, UiFactory.MaterialsColor, 180f, ref right);
            _reputation = RightGroup(bar.transform, "Reputation", UiFactory.Medal, UiFactory.ReputationColor, 200f, ref right);
            _energy = RightGroup(bar.transform, "Energy", UiFactory.Bolt, UiFactory.Recovering, 160f, ref right);
            _coins = RightGroup(bar.transform, "Coins", UiFactory.Circle, UiFactory.Gold, 195f, ref right);

            // `right` is now one gap past the run's left edge (-955 + 12 = -943); the status fills the
            // space up to 10 px short of it.
            _status = UiFactory.Label(bar.transform, "ResortStatus", "", 26, UiFactory.Cream, TextAnchor.MiddleCenter);
            UiFactory.Place(_status.gameObject, Vector2.zero, Vector2.one, new Vector2(474f, 8f), new Vector2(right + CurrencyGap - 10f, -8f));
        }

        static Text RightGroup(Transform bar, string name, Sprite icon, Color iconColor, float width, ref float right)
        {
            var label = Group(bar, name, icon, iconColor, new Vector2(1f, 0.5f), right - width, width, 30f,
                CurrencyFont, FontStyle.Normal);
            right -= width + CurrencyGap;
            return label;
        }

        // An icon followed by left-aligned text, as one fixed-width block; x is the block's left edge
        // relative to the anchor.
        static Text Group(Transform bar, string name, Sprite icon, Color iconColor, Vector2 anchor, float x,
            float width, float iconSize, int fontSize, FontStyle style)
        {
            var group = UiFactory.Go(bar, name);
            UiFactory.PlaceFixed(group, anchor, new Vector2(0f, 0.5f), new Vector2(x, 0f), new Vector2(width, 48f));
            UiFactory.PlaceFixed(UiFactory.Icon(group.transform, "Icon", icon, iconColor).gameObject,
                new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), Vector2.zero, new Vector2(iconSize, iconSize));
            var label = UiFactory.Label(group.transform, "Text", "", fontSize, UiFactory.Cream, TextAnchor.MiddleLeft, style);
            UiFactory.Place(label.gameObject, Vector2.zero, Vector2.one, new Vector2(iconSize + 8f, 0f), Vector2.zero);
            return label;
        }

        public void Refresh()
        {
            var r = _game.Resort;
            _resortValue.text = "Resort Value " + UiFactory.Num(r.ResortValue);
            _coins.text = "Coins " + UiFactory.Num(r.Coins);
            _energy.text = "Energy " + UiFactory.Num(r.Energy);
            _reputation.text = "Reputation " + UiFactory.Num(r.Reputation);
            _materials.text = "Materials " + UiFactory.Num(r.Materials);
            _gems.text = "Gems " + UiFactory.Num(r.Gems);
            _status.text = StatusLine();
        }

        string StatusLine()
        {
            if (_game.ActiveWave == null) return "Ready for Guests";
            if (_game.IsPaused) return "Paused";
            switch (_game.CurrentPhase)
            {
                case WavePhase.WaveIncoming: return "Guests arriving…";
                case WavePhase.WaveComplete: return "Wave complete";
                default: return "Wave in progress";
            }
        }
    }
}
