using ResortEmpire.Sim;
using UnityEngine;
using UnityEngine.UI;

namespace ResortEmpire.Game.Ui
{
    // S1 between-waves screen: forecast card and the one START WAVE CTA.
    public sealed class HomeUi
    {
        sealed class ForecastRow
        {
            public NeedId Need;
            public RectTransform Rect;
            public Text Count;
        }

        readonly GameController _game;
        readonly GameObject _root;
        readonly Button _start;
        readonly Text _startLabel;
        readonly RectTransform _forecastRect;
        readonly Text _forecastTitle;
        readonly ForecastRow[] _rows;
        readonly Text _complete;

        public HomeUi(Transform canvas, GameController game)
        {
            _game = game;
            _root = UiFactory.Go(canvas, "Home");
            UiFactory.Place(_root, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);

            _start = UiFactory.TextButton(_root.transform, "StartWave", "START WAVE", 40, UiFactory.Cta, UiFactory.Cream,
                () => _game.StartNextWave());
            UiFactory.PlaceFixed(_start.gameObject, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0f, 36f), new Vector2(460f, 110f));
            _startLabel = UiFactory.ButtonLabel(_start);

            var forecast = UiFactory.PanelImage(_root.transform, "Forecast", UiFactory.Panel);
            _forecastRect = UiFactory.PlaceFixed(forecast.gameObject, new Vector2(0f, 0.5f), new Vector2(0f, 0.5f), new Vector2(20f, 40f), new Vector2(380f, 300f));
            _forecastTitle = UiFactory.Label(forecast.transform, "Title", "Next wave", 28, UiFactory.Cream, TextAnchor.MiddleLeft, FontStyle.Bold);
            UiFactory.Place(_forecastTitle.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(24f, -56f), new Vector2(-24f, -14f));
            var subtitle = UiFactory.Label(forecast.transform, "Subtitle", "guests expected", 20, UiFactory.CreamDim);
            UiFactory.Place(subtitle.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(24f, -88f), new Vector2(-24f, -58f));

            var needs = (NeedId[])System.Enum.GetValues(typeof(NeedId));
            _rows = new ForecastRow[needs.Length];
            for (int i = 0; i < needs.Length; i++)
            {
                var row = UiFactory.Go(forecast.transform, "Row" + needs[i]);
                var rect = UiFactory.PlaceFixed(row, new Vector2(0f, 1f), new Vector2(0f, 1f), new Vector2(0f, -100f), new Vector2(380f, 40f));
                UiFactory.PlaceFixed(UiFactory.Dot(row.transform, "Dot", UiFactory.NeedColor(needs[i])).gameObject,
                    new Vector2(0f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(34f, 0f), new Vector2(16f, 16f));
                var name = UiFactory.Label(row.transform, "Name", UiFactory.NeedName(needs[i]), 24, UiFactory.Cream);
                UiFactory.Place(name.gameObject, Vector2.zero, Vector2.one, new Vector2(56f, 0f), new Vector2(-120f, 0f));
                var count = UiFactory.Label(row.transform, "Count", "", 24, UiFactory.Cream, TextAnchor.MiddleRight, FontStyle.Bold);
                UiFactory.PlaceFixed(count.gameObject, new Vector2(1f, 0.5f), new Vector2(1f, 0.5f), new Vector2(-24f, 0f), new Vector2(90f, 36f));
                _rows[i] = new ForecastRow { Need = needs[i], Rect = rect, Count = count };
            }

            _complete = UiFactory.Label(_root.transform, "PrototypeComplete", "Prototype complete — thanks for playing!", 32, UiFactory.Cream, TextAnchor.MiddleCenter, FontStyle.Bold);
            UiFactory.PlaceFixed(_complete.gameObject, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0f, 200f), new Vector2(1000f, 44f));
            var outline = _complete.gameObject.AddComponent<Outline>();
            outline.effectColor = new Color(0f, 0f, 0f, 0.45f);
        }

        public void SetVisible(bool visible)
        {
            if (_root.activeSelf != visible) _root.SetActive(visible);
        }

        public void Refresh()
        {
            var wave = _game.NextWaveDef;
            _start.gameObject.SetActive(wave != null);
            if (wave != null) _startLabel.text = "START WAVE " + wave.Index;
            _complete.gameObject.SetActive(wave == null);
            RefreshForecast(wave);
        }

        // The forecast shows the scripted demand only; a Sudden rush is never announced.
        void RefreshForecast(WaveDef wave)
        {
            _forecastRect.gameObject.SetActive(wave != null);
            if (wave == null) return;
            _forecastTitle.text = "Next wave " + wave.Index;
            int shown = 0;
            foreach (var row in _rows)
            {
                bool active = wave.Demand.TryGetValue(row.Need, out int demand) && demand > 0
                    && _game.Resort.IsUnlocked(UiFactory.BuildingFor(row.Need)); // locked needs stay hidden
                row.Rect.gameObject.SetActive(active);
                if (!active) continue;
                row.Rect.anchoredPosition = new Vector2(0f, -100f - shown * 44f);
                row.Count.text = demand.ToString();
                shown++;
            }
            _forecastRect.sizeDelta = new Vector2(380f, 112f + shown * 44f);
        }
    }
}
