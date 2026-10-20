using ResortEmpire.Sim;
using UnityEngine;
using UnityEngine.Events;
using UnityEngine.UI;

namespace ResortEmpire.Game.Ui
{
    // S1 header, always visible: Menu and Resort Value on the left, resort status in the middle, currencies right.
    // The status lives inside the bar so it never covers buildings at the back of the island.
    public sealed class TopBarUi
    {
        readonly GameController _game;
        readonly Text _resortValue;
        readonly Text _coins;
        readonly Text _energy;
        readonly Text _status;

        public TopBarUi(Transform canvas, GameController game, UnityAction onMenu)
        {
            _game = game;
            var bar = UiFactory.PanelImage(canvas, "TopBar", UiFactory.Panel);
            UiFactory.Place(bar.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(12f, -72f), new Vector2(-12f, -8f));

            var menu = UiFactory.TextButton(bar.transform, "Menu", "Menu", 24, UiFactory.PanelLight, UiFactory.Cream, onMenu);
            UiFactory.PlaceFixed(menu.gameObject, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), new Vector2(8f, 0f), new Vector2(110f, 48f));

            _resortValue = Group(bar.transform, "ResortValue", UiFactory.Star, UiFactory.Gold, new Vector2(0f, 0.5f), new Vector2(140f, 0f), 340f, 30, FontStyle.Bold);
            _coins = Group(bar.transform, "Coins", UiFactory.Circle, UiFactory.Gold, new Vector2(1f, 0.5f), new Vector2(-470f, 0f), 220f, 28, FontStyle.Normal);
            _energy = Group(bar.transform, "Energy", UiFactory.Bolt, UiFactory.Recovering, new Vector2(1f, 0.5f), new Vector2(-230f, 0f), 210f, 28, FontStyle.Normal);

            _status = UiFactory.Label(bar.transform, "ResortStatus", "", 26, UiFactory.Cream, TextAnchor.MiddleCenter);
            UiFactory.PlaceFixed(_status.gameObject, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(560f, 48f));
        }

        // An icon followed by left-aligned text, as one fixed-width block.
        static Text Group(Transform bar, string name, Sprite icon, Color iconColor, Vector2 anchor, Vector2 pos,
            float width, int fontSize, FontStyle style)
        {
            var group = UiFactory.Go(bar, name);
            UiFactory.PlaceFixed(group, anchor, new Vector2(0f, 0.5f), pos, new Vector2(width, 48f));
            UiFactory.PlaceFixed(UiFactory.Icon(group.transform, "Icon", icon, iconColor).gameObject,
                new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), Vector2.zero, new Vector2(32f, 32f));
            var label = UiFactory.Label(group.transform, "Text", "", fontSize, UiFactory.Cream, TextAnchor.MiddleLeft, style);
            UiFactory.Place(label.gameObject, Vector2.zero, Vector2.one, new Vector2(42f, 0f), Vector2.zero);
            return label;
        }

        public void Refresh()
        {
            var r = _game.Resort;
            _resortValue.text = "Resort Value " + UiFactory.Num(r.ResortValue);
            _coins.text = "Coins " + UiFactory.Num(r.Coins);
            _energy.text = "Energy " + r.Energy;
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
