using System.Collections.Generic;
using ResortEmpire.Sim;
using UnityEngine;
using UnityEngine.UI;

namespace ResortEmpire.Game.Ui
{
    // S3 bottom sheet: pick which staffed building gives up its worker — the cost stays visible.
    // The island stays visible above the sheet.
    public sealed class WorkerSheetUi
    {
        readonly GameController _game;
        readonly ToastUi _toasts;
        readonly GameObject _root;
        readonly Text _title;
        readonly Text _hint;
        readonly List<GameObject> _options = new List<GameObject>();
        BuildingId? _target;

        public GameObject Root => _root;
        public bool IsOpen => _root.activeSelf;

        public WorkerSheetUi(Transform canvas, GameController game, ToastUi toasts)
        {
            _game = game;
            _toasts = toasts;
            var panel = UiFactory.PanelImage(canvas, "WorkerSheet", UiFactory.Panel);
            _root = panel.gameObject;
            // Fills the screen left of the wave panel, so the panel's Pause button stays reachable.
            UiFactory.PlaceFixed(_root, Vector2.zero, Vector2.zero, new Vector2(20f, 0f), new Vector2(1340f, 280f));

            _title = UiFactory.Label(panel.transform, "Title", "Move a worker", 30, UiFactory.Cream, TextAnchor.MiddleCenter, FontStyle.Bold);
            UiFactory.Place(_title.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(30f, -56f), new Vector2(-80f, -12f));
            _hint = UiFactory.Label(panel.transform, "Hint", "", 22, UiFactory.CreamDim, TextAnchor.MiddleCenter);
            UiFactory.Place(_hint.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(30f, -92f), new Vector2(-80f, -58f));

            var close = UiFactory.TextButton(panel.transform, "Close", "X", 24, UiFactory.PanelLight, UiFactory.Cream, Close);
            UiFactory.PlaceFixed(close.gameObject, Vector2.one, Vector2.one, new Vector2(-12f, -12f), new Vector2(48f, 48f));

            _root.SetActive(false);
        }

        public void Open(BuildingId target)
        {
            _target = target;
            _root.SetActive(true);
            Rebuild();
        }

        public void Close()
        {
            _target = null;
            _root.SetActive(false);
        }

        // Worker layout can change under an open sheet (a move elsewhere, a wave ending) — rebuild then.
        public void OnStateChanged()
        {
            if (IsOpen) Rebuild();
        }

        void Rebuild()
        {
            foreach (var option in _options) Object.Destroy(option);
            _options.Clear();
            if (_target == null) return;
            var target = _game.Resort.Get(_target.Value);
            if (target == null)
            {
                Close();
                return;
            }

            // With one slot per building (prototype, Lv1-3) every text below reads exactly as before;
            // the extra wording only appears once a building has room for a second or third worker.
            string targetName = GameController.DisplayName(_target.Value);
            int slots = _game.Resort.SlotsOf(_target.Value);
            if (target.WorkerCount >= slots)
            {
                _title.text = slots == 1 ? "A worker is already at " + targetName : "Every shift at " + targetName + " is filled";
                _hint.text = "";
                return;
            }

            _title.text = target.WorkerCount == 0
                ? "Send worker to " + targetName + "?"
                : "Send another worker to " + targetName + "?";
            var sources = new List<BuildingState>();
            bool anyLeftStaffed = false;
            foreach (var b in _game.Resort.Buildings)
            {
                if (b.Id == _target.Value || !BuildingNeeds.IsWaveBuilding(b.Id) || b.WorkerCount < 1) continue;
                sources.Add(b);
                if (b.WorkerCount > 1) anyLeftStaffed = true;
            }
            if (sources.Count == 0)
            {
                _hint.text = "No worker is free to move right now.";
                return;
            }
            _hint.text = anyLeftStaffed
                ? "Moving is free — each choice shows who stays behind."
                : "Taking a worker leaves their building empty.";

            const float step = 296f;
            float x0 = -(sources.Count - 1) * step * 0.5f; // centered in the sheet; up to 4 sources fit
            for (int i = 0; i < sources.Count; i++)
            {
                var source = sources[i].Id;
                string sourceName = GameController.DisplayName(source);
                int leaves = sources[i].WorkerCount - 1;
                string cost = leaves == 0
                    ? "leaves " + sourceName + " empty"
                    : "leaves " + leaves + (leaves == 1 ? " worker" : " workers") + " there";
                var button = UiFactory.TextButton(_root.transform, "From" + source,
                    "Take from " + sourceName + "\n<size=18><color=#FAF6EEAA>" + cost + "</color></size>",
                    24, UiFactory.PanelLight, UiFactory.Cream, () => OnPick(source));
                UiFactory.PlaceFixed(button.gameObject, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f),
                    new Vector2(x0 + i * step, 24f), new Vector2(280f, 128f));
                _options.Add(button.gameObject);
            }
        }

        void OnPick(BuildingId source)
        {
            if (_target == null) return;
            if (_game.MoveWorker(source, _target.Value)) Close();
            else _toasts.Push("That move isn't possible right now");
        }
    }
}
