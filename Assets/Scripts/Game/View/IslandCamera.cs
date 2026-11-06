using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem;

namespace ResortEmpire.Game.View
{
    // The island camera, like the web's orbit view (IslandOrbitCamera.tsx): orthographic, circling the island's
    // centre without panning. One finger or the mouse drags to turn it, two fingers or the mouse wheel zoom, and
    // it never sinks to the horizon. A press that did not drag is a tap, so turning never selects a building.
    sealed class IslandCamera
    {
        // The web camera stands at (10.5, 12.5, 13.5), x mirrored here: 21.2 away, 36° up, 38° round.
        const float Distance = 21.2f;
        const float DefaultYaw = -37.9f;
        const float DefaultElevation = 36.1f;
        const float DefaultSize = 7.5f;
        const float MinElevation = 12f, MaxElevation = 80f;
        // Zoomed in, the resort plots near the beach must stay in view; zoomed out, the ocean must fill the screen.
        const float MinSize = 4f, MaxSize = 11f;
        const float DragThreshold = 12f;      // pixels a press may move and still be a tap
        const float TurnPerScreen = 240f;     // degrees for a drag across the whole screen width
        const float TiltPerScreen = 120f;     // degrees for a drag over the whole screen height

        readonly Camera _camera;
        float _yaw = DefaultYaw, _elevation = DefaultElevation, _size = DefaultSize;
        bool _pressed, _dragging, _startedOnUi;
        Vector2 _pressedAt, _last;
        float _pinch;

        public IslandCamera(Camera camera)
        {
            _camera = camera;
            _camera.orthographic = true;
            Apply();
        }

        public bool Moved => !Mathf.Approximately(_yaw, DefaultYaw) || !Mathf.Approximately(_elevation, DefaultElevation)
            || !Mathf.Approximately(_size, DefaultSize);

        public void ResetView()
        {
            _yaw = DefaultYaw;
            _elevation = DefaultElevation;
            _size = DefaultSize;
            Apply();
        }

        // True, with the screen point, when the player tapped: pressed and let go on the island without dragging.
        public bool Tick(out Vector2 tap)
        {
            tap = default;
            if (Pinch()) return false;

            var wheel = Mouse.current != null ? Mouse.current.scroll.ReadValue().y : 0f;
            if (wheel != 0f && !OverUi()) Zoom(wheel > 0f ? 0.9f : 1.1f);

            var pointer = Pointer.current;
            if (pointer == null) return false;
            var position = pointer.position.ReadValue();
            if (pointer.press.wasPressedThisFrame)
            {
                _pressed = true;
                _dragging = false;
                _startedOnUi = OverUi();
                _pressedAt = _last = position;
            }
            else if (_pressed && pointer.press.isPressed && !_startedOnUi)
            {
                if (!_dragging && (position - _pressedAt).magnitude > DragThreshold) _dragging = true;
                if (_dragging)
                {
                    // As if holding the island: dragging right turns it right, dragging up lowers the view.
                    var delta = position - _last;
                    _yaw += delta.x / Screen.width * TurnPerScreen;
                    _elevation = Mathf.Clamp(_elevation - delta.y / Screen.height * TiltPerScreen, MinElevation, MaxElevation);
                    Apply();
                }
                _last = position;
            }
            if (_pressed && pointer.press.wasReleasedThisFrame)
            {
                _pressed = false;
                if (!_dragging && !_startedOnUi)
                {
                    tap = position;
                    return true;
                }
            }
            return false;
        }

        // Two fingers zoom by their spread; the gesture never counts as a tap.
        bool Pinch()
        {
            var touchscreen = Touchscreen.current;
            if (touchscreen == null) return false;
            Vector2 a = default, b = default;
            int count = 0;
            foreach (var touch in touchscreen.touches)
            {
                if (!touch.press.isPressed) continue;
                if (count == 0) a = touch.position.ReadValue();
                else if (count == 1) b = touch.position.ReadValue();
                count++;
            }
            if (count < 2)
            {
                _pinch = 0f;
                return false;
            }
            float spread = Vector2.Distance(a, b);
            if (_pinch > 0f && spread > 0f) Zoom(_pinch / spread);
            _pinch = spread;
            _dragging = true;
            return true;
        }

        void Zoom(float factor)
        {
            _size = Mathf.Clamp(_size * factor, MinSize, MaxSize);
            Apply();
        }

        static bool OverUi() => EventSystem.current != null && EventSystem.current.IsPointerOverGameObject();

        void Apply()
        {
            float yaw = _yaw * Mathf.Deg2Rad, elevation = _elevation * Mathf.Deg2Rad;
            var direction = new Vector3(Mathf.Sin(yaw) * Mathf.Cos(elevation), Mathf.Sin(elevation),
                Mathf.Cos(yaw) * Mathf.Cos(elevation));
            _camera.transform.SetPositionAndRotation(direction * Distance, Quaternion.LookRotation(-direction));
            _camera.orthographicSize = _size;
        }
    }
}
