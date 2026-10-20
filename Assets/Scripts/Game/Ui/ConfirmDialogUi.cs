using System;
using UnityEngine;
using UnityEngine.UI;

namespace ResortEmpire.Game.Ui
{
    // Small yes/no card for irreversible choices (only "start over" today).
    public sealed class ConfirmDialogUi
    {
        readonly GameObject _root;
        readonly Text _message;
        readonly Text _confirmLabel;
        Action _onConfirm;
        Action _onCancel;

        public GameObject Root => _root;
        public bool Visible => _root.activeSelf;

        public ConfirmDialogUi(Transform canvas)
        {
            _root = UiFactory.Overlay(canvas, "ConfirmDialog", new Color(0f, 0f, 0f, 0.55f)).gameObject;
            var card = UiFactory.PanelImage(_root.transform, "Card", UiFactory.Panel).transform;
            UiFactory.PlaceFixed(card.gameObject, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(720f, 330f));

            _message = UiFactory.Label(card, "Message", "", 30, UiFactory.Cream, TextAnchor.MiddleCenter);
            UiFactory.Place(_message.gameObject, new Vector2(0f, 1f), Vector2.one, new Vector2(50f, -180f), new Vector2(-50f, -36f));
            _message.horizontalOverflow = HorizontalWrapMode.Wrap;

            var cancel = UiFactory.TextButton(card, "Cancel", "Cancel", 28, UiFactory.PanelLight, UiFactory.Cream, OnCancel);
            UiFactory.PlaceFixed(cancel.gameObject, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(-150f, 36f), new Vector2(270f, 84f));
            var confirm = UiFactory.TextButton(card, "Confirm", "", 28, UiFactory.Cta, UiFactory.Cream, OnConfirm);
            UiFactory.PlaceFixed(confirm.gameObject, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(150f, 36f), new Vector2(270f, 84f));
            _confirmLabel = UiFactory.ButtonLabel(confirm);

            _root.SetActive(false);
        }

        public void Show(string message, string confirmLabel, Action onConfirm, Action onCancel)
        {
            _message.text = message;
            _confirmLabel.text = confirmLabel;
            _onConfirm = onConfirm;
            _onCancel = onCancel;
            _root.SetActive(true);
        }

        public void Hide() => _root.SetActive(false);

        // Stays up on confirm: the confirmed action (a scene reload) decides what comes next.
        void OnConfirm() => _onConfirm?.Invoke();

        void OnCancel()
        {
            Hide();
            _onCancel?.Invoke();
        }
    }
}
