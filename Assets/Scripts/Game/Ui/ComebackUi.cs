using System;
using ResortEmpire.Sim;
using UnityEngine;
using UnityEngine.UI;

namespace ResortEmpire.Game.Ui
{
    // Comeback reward card (Jira FR-57, P14): a small, warm "welcome back" with a fixed gift. The resort
    // never degrades while the player is away, so the card only ever brings good news. One button.
    public sealed class ComebackUi
    {
        readonly GameController _game;
        readonly Action _onClosed;
        readonly GameObject _root;
        readonly GameObject _coinsIcon;
        readonly Text _coins;
        readonly GameObject _gap;
        readonly GameObject _energyIcon;
        readonly Text _energy;
        ComebackResult _gift;

        public GameObject Root => _root;
        public bool Visible => _root.activeSelf;

        public ComebackUi(Transform canvas, GameController game, Action onClosed)
        {
            _game = game;
            _onClosed = onClosed;
            _root = UiFactory.Overlay(canvas, "Comeback", new Color(0f, 0f, 0f, 0.45f)).gameObject;

            // Card 640 x 420: title 30-90, line 98-132, gift row 160-212, Collect from 300 (420 - 30 - 90).
            var card = UiFactory.PanelImage(_root.transform, "Card", UiFactory.Panel).transform;
            UiFactory.PlaceFixed(card.gameObject, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(640f, 420f));

            var title = UiFactory.Label(card, "Title", "Welcome back!", 48, UiFactory.Cream, TextAnchor.MiddleCenter, FontStyle.Bold);
            UiFactory.Place(title.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(30f, -90f), new Vector2(-30f, -30f));
            var line = UiFactory.Label(card, "Line", "Your resort is just as you left it.", 26, UiFactory.CreamDim, TextAnchor.MiddleCenter);
            UiFactory.Place(line.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(30f, -132f), new Vector2(-30f, -98f));

            var gift = UiFactory.Row(card, "Gift", 8f);
            UiFactory.Place(gift.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(30f, -212f), new Vector2(-30f, -160f));
            _coinsIcon = UiFactory.RowIcon(gift, "CoinsIcon", UiFactory.Circle, UiFactory.Gold, 34f).gameObject;
            _coins = UiFactory.Label(gift, "Coins", "", 30, UiFactory.Cream, TextAnchor.MiddleLeft, FontStyle.Bold);
            _gap = UiFactory.Go(gift, "Gap");
            var element = _gap.AddComponent<LayoutElement>();
            element.minWidth = 28f;
            element.preferredWidth = 28f;
            _energyIcon = UiFactory.RowIcon(gift, "EnergyIcon", UiFactory.Bolt, UiFactory.Recovering, 34f).gameObject;
            _energy = UiFactory.Label(gift, "Energy", "", 30, UiFactory.Cream, TextAnchor.MiddleLeft, FontStyle.Bold);

            var collect = UiFactory.TextButton(card, "Collect", "Collect", 34, UiFactory.Cta, UiFactory.Cream, OnCollect);
            UiFactory.PlaceFixed(collect.gameObject, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0f, 30f), new Vector2(360f, 90f));

            _root.SetActive(false);
        }

        public void Show(ComebackResult gift)
        {
            _gift = gift;
            bool coins = gift.Coins > 0;
            bool energy = gift.Energy > 0;
            _coinsIcon.SetActive(coins);
            _coins.gameObject.SetActive(coins);
            _coins.text = "+" + UiFactory.Num(gift.Coins) + " Coins";
            _gap.SetActive(coins && energy);
            _energyIcon.SetActive(energy);
            _energy.gameObject.SetActive(energy);
            _energy.text = "+" + UiFactory.Num(gift.Energy) + " Energy";
            _root.SetActive(true);
        }

        void OnCollect()
        {
            _root.SetActive(false);
            _game.CollectComebackGift(_gift);
            _gift = default;
            _onClosed?.Invoke();
        }
    }
}
