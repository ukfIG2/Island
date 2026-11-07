using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

namespace ResortEmpire.Game.Ui
{
    // Bottom-left stack of short-lived notes; capped so the corner never piles up.
    public sealed class ToastUi
    {
        sealed class Toast
        {
            public GameObject Root;
            public CanvasGroup Group;
            public float Age;
        }

        const int MaxVisible = 3;
        const float LifeSeconds = 2.5f;
        const float FadeFromSeconds = 1.8f;

        readonly GameObject _container;
        readonly List<Toast> _live = new List<Toast>();

        public GameObject Root => _container;

        public ToastUi(Transform canvas)
        {
            _container = UiFactory.Go(canvas, "Toasts");
            UiFactory.Place(_container, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
        }

        public void Push(string message)
        {
            if (_live.Count >= MaxVisible)
            {
                Object.Destroy(_live[0].Root);
                _live.RemoveAt(0);
            }
            var shade = UiFactory.PanelShade;
            var panel = UiFactory.PanelImage(_container.transform, "Toast", new Color(shade.r, shade.g, shade.b, 0.92f));
            panel.raycastTarget = false;
            UiFactory.PlaceFixed(panel.gameObject, Vector2.zero, Vector2.zero, new Vector2(20f, 20f), new Vector2(460f, 54f));
            var text = UiFactory.Label(panel.transform, "Text", message, 22, UiFactory.Cream);
            UiFactory.Place(text.gameObject, Vector2.zero, Vector2.one, new Vector2(18f, 0f), new Vector2(-12f, 0f));
            var group = panel.gameObject.AddComponent<CanvasGroup>();
            group.blocksRaycasts = false;
            group.interactable = false;
            _live.Add(new Toast { Root = panel.gameObject, Group = group });
            Layout();
        }

        public void Tick(float dt)
        {
            bool changed = false;
            for (int i = _live.Count - 1; i >= 0; i--)
            {
                var toast = _live[i];
                toast.Age += dt;
                if (toast.Age >= LifeSeconds)
                {
                    Object.Destroy(toast.Root);
                    _live.RemoveAt(i);
                    changed = true;
                    continue;
                }
                toast.Group.alpha = toast.Age < FadeFromSeconds
                    ? 1f
                    : 1f - (toast.Age - FadeFromSeconds) / (LifeSeconds - FadeFromSeconds);
            }
            if (changed) Layout();
        }

        void Layout()
        {
            for (int i = 0; i < _live.Count; i++)
            {
                int fromBottom = _live.Count - 1 - i; // newest sits closest to the corner
                ((RectTransform)_live[i].Root.transform).anchoredPosition = new Vector2(20f, 20f + fromBottom * 62f);
            }
        }
    }
}
