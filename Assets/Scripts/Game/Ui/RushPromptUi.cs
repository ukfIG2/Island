using ResortEmpire.Sim;
using UnityEngine;
using UnityEngine.UI;

namespace ResortEmpire.Game.Ui
{
    // S2 transient "Sudden rush" (UI handoff §D): a small decision over the lower part of the wave panel.
    // The wave never pauses for it; moving a Worker is the primary answer, Energy only an optional extra.
    public sealed class RushPromptUi
    {
        const float LifeSeconds = 15f;

        readonly GameController _game;
        readonly WorkerSheetUi _sheet;
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
            // Sits inside the wave panel's footprint, below the need rows and above Pause / Speed.
            UiFactory.PlaceFixed(_root, Vector2.one, Vector2.one, new Vector2(-20f, -470f), new Vector2(504f, 226f));
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

        public void Show(BuildingId building)
        {
            _building = building;
            _age = 0f;
            _title.text = "Sudden rush at " + GameController.DisplayName(building) + "!";
            _boostLabel.text = "Speed Up " + _game.Tuning.EnergyBoostCost;
            _root.SetActive(true);
            Refresh();
        }

        public void Hide() => _root.SetActive(false);

        // Resolves itself once the building is staffed; otherwise fades from relevance after a while.
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
            _boost.gameObject.SetActive(canBoost);
            _ignore.anchorMin = new Vector2(canBoost ? 0.5f : 0f, 1f);
            _ignore.anchorMax = Vector2.one;
            _ignore.offsetMin = new Vector2(canBoost ? 6f : 12f, -208f);
            _ignore.offsetMax = new Vector2(-12f, -158f);
        }

        void OnBoost()
        {
            if (_game.Boost(_building)) Hide();
            else Refresh();
        }
    }
}
