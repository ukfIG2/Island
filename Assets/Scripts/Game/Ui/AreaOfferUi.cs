using ResortEmpire.Sim;
using UnityEngine;
using UnityEngine.UI;

namespace ResortEmpire.Game.Ui
{
    // S9 Area Unlock: a new area offered as a moment of growth, not a utility dialog. It shows what the area adds,
    // the Worker that comes with it and the price, in one of four states: locked, available, not affordable, unlocked.
    // It opens once on its own after the wave that makes the area available; skipped, it reopens from the
    // area's construction site on the island.
    public sealed class AreaOfferUi
    {
        readonly GameController _game;
        readonly GameObject _root;
        readonly Text _title;
        readonly Text _adds;
        readonly Text _body;
        readonly Text _cost;
        readonly GameObject _costRow;
        readonly Button _build;
        readonly GameObject _chip;
        readonly Text _chipText;
        BuildingId _building;

        public GameObject Root => _root;
        public bool Visible => _root.activeSelf;

        public AreaOfferUi(Transform canvas, GameController game)
        {
            _game = game;
            var dim = UiFactory.Go(canvas, "AreaOffer").AddComponent<Image>();
            dim.color = new Color(0f, 0f, 0f, 0.55f); // plain square dim; blocks taps behind it
            _root = dim.gameObject;
            UiFactory.Place(_root, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);

            // Card 960 x 620, top down: header 28-62, title 72-140, adds 146-186, body 200-310, price 322-366;
            // from the bottom edge: Later 24-92, the BUILD button or the state chip 120-210.
            var card = UiFactory.PanelImage(_root.transform, "Card", UiFactory.Panel).transform;
            UiFactory.PlaceFixed(card.gameObject, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0f, -10f), new Vector2(960f, 620f));

            var header = UiFactory.Label(card, "Header", "A new area is ready", 26, UiFactory.Premium, TextAnchor.MiddleCenter, FontStyle.Bold);
            UiFactory.Place(header.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(30f, -62f), new Vector2(-30f, -28f));
            _title = UiFactory.Label(card, "Title", "", 56, UiFactory.Cream, TextAnchor.MiddleCenter, FontStyle.Bold);
            UiFactory.Place(_title.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(30f, -140f), new Vector2(-30f, -72f));
            _adds = UiFactory.Label(card, "Adds", "", 28, UiFactory.Recovering, TextAnchor.MiddleCenter, FontStyle.Bold);
            UiFactory.Place(_adds.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(30f, -186f), new Vector2(-30f, -146f));
            _body = UiFactory.Label(card, "Body", "", 26, UiFactory.Cream, TextAnchor.UpperCenter);
            UiFactory.Place(_body.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(70f, -310f), new Vector2(-70f, -200f));
            _body.horizontalOverflow = HorizontalWrapMode.Wrap;

            _costRow = UiFactory.Go(card, "Price");
            UiFactory.PlaceFixed(_costRow, new Vector2(0.5f, 1f), new Vector2(0.5f, 0.5f), new Vector2(0f, -344f), new Vector2(150f, 44f));
            UiFactory.PlaceFixed(UiFactory.Icon(_costRow.transform, "Coin", UiFactory.Circle, UiFactory.Premium).gameObject,
                new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), Vector2.zero, new Vector2(32f, 32f));
            _cost = UiFactory.Label(_costRow.transform, "Coins", "", 32, UiFactory.Cream, TextAnchor.MiddleLeft, FontStyle.Bold);
            UiFactory.Place(_cost.gameObject, Vector2.zero, Vector2.one, new Vector2(42f, 0f), Vector2.zero);

            _build = UiFactory.TextButton(card, "Build", "BUILD", 34, UiFactory.Cta, UiFactory.Cream, OnBuild);
            UiFactory.PlaceFixed(_build.gameObject, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0f, 120f), new Vector2(420f, 90f));

            var chip = UiFactory.PanelImage(card, "StateChip", UiFactory.PanelLight);
            chip.raycastTarget = false;
            _chip = chip.gameObject;
            UiFactory.PlaceFixed(_chip, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0f, 120f), new Vector2(420f, 90f));
            _chipText = UiFactory.Label(chip.transform, "Text", "", 26, UiFactory.Cream, TextAnchor.MiddleCenter);
            UiFactory.Place(_chipText.gameObject, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);

            var later = UiFactory.TextButton(card, "Later", "Later", 26, UiFactory.PanelLight, UiFactory.Cream, Close);
            UiFactory.PlaceFixed(later.gameObject, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0f, 24f), new Vector2(240f, 68f));

            _root.SetActive(false);
        }

        public void Show(BuildingId building)
        {
            if (!AreaOffer.IsArea(building)) return;
            _building = building;
            _root.SetActive(true);
            Sound.Sfx.Play(Sound.SoundCue.AreaOffer);
            Refresh();
        }

        public void Refresh()
        {
            if (!Visible) return;
            var offer = AreaOffer.For(_game.Resort, _game.Tuning, _game.Waves, _building);
            if (offer == null)
            {
                Close();
                return;
            }
            string name = GameController.DisplayName(_building);
            string need = ResultText.NeedName(offer.Need);
            _title.text = name;
            _adds.text = "Adds the " + need + " need";
            _body.text = (offer.DebutWave > 0 ? need + " guests start to arrive in wave " + offer.DebutWave + ". " : "")
                + "One Worker comes with the " + name + ", so no other building is left empty.";
            _cost.text = offer.Cost.ToString();

            _costRow.SetActive(offer.State != AreaState.Unlocked);
            _build.gameObject.SetActive(offer.State == AreaState.Available);
            _chip.SetActive(offer.State != AreaState.Available);
            switch (offer.State)
            {
                case AreaState.NotAffordable: _chipText.text = "Missing " + offer.Missing + " Coins"; break;
                case AreaState.Locked: _chipText.text = "Complete wave " + offer.EligibleAfterWave + " first"; break;
                case AreaState.Unlocked: _chipText.text = "Built"; break;
            }
        }

        void OnBuild()
        {
            if (_game.Unlock(_building)) Close();
        }

        void Close() => _root.SetActive(false);
    }
}
