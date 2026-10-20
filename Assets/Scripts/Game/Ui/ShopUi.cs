using UnityEngine;
using UnityEngine.Events;
using UnityEngine.UI;

namespace ResortEmpire.Game.Ui
{
    // Shop placeholder (P16): the three spec packs, each "Coming soon". Gems are only for permanent
    // items; nothing can be bought yet and nothing here ever pressures the player.
    public sealed class ShopUi
    {
        readonly GameObject _root;

        public GameObject Root => _root;
        public bool Visible => _root.activeSelf;

        public ShopUi(Transform canvas, UnityAction onBack)
        {
            _root = UiFactory.Overlay(canvas, "Shop", new Color(0f, 0f, 0f, 0.5f)).gameObject;
            var card = UiFactory.PanelImage(_root.transform, "Card", UiFactory.Panel).transform;
            UiFactory.PlaceFixed(card.gameObject, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0f, -20f), new Vector2(1240f, 700f));

            var title = UiFactory.Label(card, "Title", "Shop", 44, UiFactory.Cream, TextAnchor.MiddleCenter, FontStyle.Bold);
            UiFactory.Place(title.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(30f, -90f), new Vector2(-30f, -28f));
            var note = UiFactory.Row(card, "Note", 10f);
            UiFactory.Place(note.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(30f, -134f), new Vector2(-30f, -98f));
            UiFactory.RowIcon(note, "Gem", UiFactory.Gem, UiFactory.GemColor, 28f);
            UiFactory.Label(note, "Text", "Gems are only for permanent items — never for speeding anything up.", 22, UiFactory.CreamDim);

            Pack(card, -400f, "Premium Staff Pack", "Hire a Manager or Specialist\nwithout Coins", UiFactory.Person, UiFactory.Cream);
            Pack(card, 0f, "Villa Upgrade Pack", "A permanent upgrade\nfor your villas", UiFactory.Star, UiFactory.Gold);
            Pack(card, 400f, "Decoration Set", "Decor that stays\non your island", UiFactory.Circle, VipStyle.AccentLight);

            var back = UiFactory.TextButton(card, "Back", "Back", 30, UiFactory.Cta, UiFactory.Cream, onBack);
            UiFactory.PlaceFixed(back.gameObject, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0f, 32f), new Vector2(300f, 84f));

            _root.SetActive(false);
        }

        // Pack card 360 x 400 from 160 below the top: icon, name, what it gives, "Coming soon".
        static void Pack(Transform card, float x, string name, string detail, Sprite icon, Color iconColor)
        {
            var bg = UiFactory.PanelImage(card, name, UiFactory.PanelShade);
            bg.raycastTarget = false;
            UiFactory.PlaceFixed(bg.gameObject, new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(x, -160f), new Vector2(360f, 400f));
            var t = bg.transform;
            UiFactory.PlaceFixed(UiFactory.Icon(t, "Icon", icon, iconColor).gameObject, new Vector2(0.5f, 1f), new Vector2(0.5f, 0.5f),
                new Vector2(0f, -70f), new Vector2(80f, 80f));
            var title = UiFactory.Label(t, "Name", name, 28, UiFactory.Cream, TextAnchor.MiddleCenter, FontStyle.Bold);
            UiFactory.Place(title.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(12f, -164f), new Vector2(-12f, -124f));
            var body = UiFactory.Label(t, "Detail", detail, 22, UiFactory.CreamDim, TextAnchor.UpperCenter);
            UiFactory.Place(body.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(12f, -260f), new Vector2(-12f, -176f));
            var soon = UiFactory.Badge(t, "ComingSoon", 24, UiFactory.PanelLight, UiFactory.Cream);
            soon.text = "Coming soon";
            UiFactory.PlaceFixed(soon.transform.parent.gameObject, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0f, 28f), new Vector2(240f, 56f));
        }

        public void Show() => _root.SetActive(true);
        public void Hide() => _root.SetActive(false);
    }
}
