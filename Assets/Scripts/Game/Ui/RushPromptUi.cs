using ResortEmpire.Sim;
using UnityEngine;
using UnityEngine.UI;

namespace ResortEmpire.Game.Ui
{
    // CAM-48, the Sudden-rush prompt (UI handoff section D): a small decision over the lower part of the wave panel.
    // The wave never pauses for it; moving a Worker is the primary answer, Energy only an optional extra.
    // It is not forecast: it appears the moment the rush lands and leaves by itself.
    public sealed class RushPromptUi
    {
        const float LifeSeconds = 15f;            // pause-frozen, like the wave
        const float PanelTop = 96f;               // the wave panel's top edge below the screen top
        const float Height = 226f;

        readonly GameController _game;
        readonly WorkerSheetUi _sheet;
        readonly RectTransform _rect;
        readonly GameObject _root;
        readonly Text _title;
        readonly Button _boost;
        readonly Text _boostLabel;
        readonly RectTransform _ignore;
        BuildingId _building;
        float _age;

        public GameObject Root => _root;
        public bool Visible => _root.activeSelf;

        public RushPromptUi(Transform canvas, GameController game, WorkerSheetUi sheet)
        {
            _game = game;
            _sheet = sheet;
            var frame = UiFactory.PanelImage(canvas, "RushPrompt", UiFactory.Recovering);
            _root = frame.gameObject;
            _rect = UiFactory.PlaceFixed(_root, Vector2.one, Vector2.one, new Vector2(-20f, -(PanelTop + 340f)), new Vector2(504f, Height));
            var inner = UiFactory.PanelImage(frame.transform, "Inner", UiFactory.PanelShade).transform;
            UiFactory.Place(inner.gameObject, Vector2.zero, Vector2.one, new Vector2(3f, 3f), new Vector2(-3f, -3f));

            UiFactory.PlaceFixed(UiFactory.Icon(inner, "Alert", UiFactory.Alert, UiFactory.Recovering).gameObject,
                new Vector2(0f, 1f), new Vector2(0f, 0.5f), new Vector2(16f, -30f), new Vector2(28f, 28f));
            _title = UiFactory.Label(inner, "Title", "", 25, UiFactory.Cream, TextAnchor.MiddleLeft, FontStyle.Bold);
            UiFactory.Place(_title.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(54f, -48f), new Vector2(-12f, -12f));
            var sub = UiFactory.Label(inner, "Subline", "More guests are heading there right now.", 20, UiFactory.CreamDim);
            UiFactory.Place(sub.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(16f, -80f), new Vector2(-12f, -52f));

            var move = UiFactory.TextButton(inner, "MoveWorker", "Move Worker here", 24, UiFactory.Cta, UiFactory.Cream,
                () => _sheet.Open(_building));
            UiFactory.Place(move.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(12f, -148f), new Vector2(-12f, -92f));

            _boost = UiFactory.TextButton(inner, "SpeedUp", "", 22, UiFactory.Recovering, UiFactory.Panel, OnBoost);
            UiFactory.Place(_boost.gameObject, new Vector2(0f, 1f), new Vector2(0.5f, 1f), new Vector2(12f, -208f), new Vector2(-6f, -158f));
            UiFactory.PlaceFixed(UiFactory.Icon(_boost.transform, "Bolt", UiFactory.Bolt, UiFactory.Panel).gameObject,
                new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), new Vector2(14f, 0f), new Vector2(24f, 24f));
            _boostLabel = UiFactory.ButtonLabel(_boost);
            UiFactory.Place(_boostLabel.gameObject, Vector2.zero, Vector2.one, new Vector2(30f, 0f), Vector2.zero);

            var ignore = UiFactory.TextButton(inner, "Ignore", "Ignore", 22, UiFactory.PanelLight, UiFactory.Cream, Hide);
            _ignore = (RectTransform)ignore.transform;

            _root.SetActive(false);
        }

        // rowsBottom: how far down the wave panel its need rows reach, so the prompt sits below them.
        public void Show(BuildingId building, float rowsBottom)
        {
            _building = building;
            _age = 0f;
            _title.text = "Sudden rush at " + GameController.DisplayName(building);
            _rect.anchoredPosition = new Vector2(-20f, -(PanelTop + rowsBottom + 12f));
            _root.SetActive(true);
            Refresh();
        }

        public void Hide() => _root.SetActive(false);

        // Resolves itself once the building is staffed; otherwise it fades from relevance after a while.
        public void Tick(float dt)
        {
            if (!Visible) return;
            var sim = _game.ActiveWave;
            var state = _game.Resort.Get(_building);
            if (sim == null || sim.Phase == WavePhase.WaveComplete || state == null || state.HasWorker)
            {
                Hide();
                return;
            }
            if (!sim.IsPaused) _age += dt;
            if (_age >= LifeSeconds) Hide();
        }

        public void Refresh()
        {
            if (!Visible) return;
            var sim = _game.ActiveWave;
            bool canBoost = sim != null && sim.CanBoost(_building);
            // Energy short: the same spot offers the test rewarded video (CAM-74); it never blocks the wave.
            bool offerAd = !canBoost && _game.CanOfferTestAd(_building);
            bool showButton = canBoost || offerAd;
            _boost.gameObject.SetActive(showButton);
            if (canBoost)
            {
                _boostLabel.fontSize = 22;
                _boostLabel.text = "Speed Up " + _game.Tuning.EnergyBoostCost;
            }
            else if (offerAd)
            {
                _boostLabel.fontSize = 19;
                _boostLabel.text = NeedsPanelUi.TestAdLabel(_game);
            }
            _ignore.anchorMin = new Vector2(showButton ? 0.5f : 0f, 1f);
            _ignore.anchorMax = Vector2.one;
            _ignore.offsetMin = new Vector2(showButton ? 6f : 12f, -208f);
            _ignore.offsetMax = new Vector2(-12f, -158f);
        }

        void OnBoost()
        {
            if (_game.CanOfferTestAd(_building)) // only when Energy is short, so Speed Up was not possible
            {
                _game.WatchTestAd();             // the prompt stays: Speed Up is now affordable right here
                Refresh();
                return;
            }
            if (_game.Boost(_building)) Hide();
            else Refresh();
        }
    }
}
