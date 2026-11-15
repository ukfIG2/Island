using System;
using ResortEmpire.Sim;
using UnityEngine;

namespace ResortEmpire.Game.Ui
{
    // The app shell: pause menu, settings and the start-over confirmation, and which screen "Back" returns to.
    // Opening the menu during a wave pauses it; Resume lifts only a pause the shell itself set, so a wave the player
    // had already paused stays paused.
    public sealed class AppShellUi
    {
        const string StartOverTitle = "Start over?";
        const string StartOverMessage = "Your resort and every wave played so far will be erased. This cannot be undone.";

        readonly GameController _game;
        readonly Action _startOver;
        readonly PauseMenuUi _pause;
        readonly SettingsUi _settings;
        readonly ConfirmDialogUi _confirm;
        Action _settingsBack;
        bool _pausedWave;

        public bool IsOpen => _pause.Visible || _settings.Visible || _confirm.Visible;

        public AppShellUi(Transform canvas, GameController game, AppSettings settings, Action startOver)
        {
            _game = game;
            _startOver = startOver;
            _pause = new PauseMenuUi(canvas, CloseAll, () => OpenSettings(ShowPause));
            _settings = new SettingsUi(canvas, settings, () => _settingsBack?.Invoke(), () => AskStartOver(ShowSettings));
            _confirm = new ConfirmDialogUi(canvas);
        }

        // Above everything else on the canvas.
        public void BringToFront()
        {
            _pause.Root.transform.SetAsLastSibling();
            _settings.Root.transform.SetAsLastSibling();
            _confirm.Root.transform.SetAsLastSibling();
        }

        public void OpenPauseMenu()
        {
            if (IsOpen) return;
            if (WaveRunning && !_game.IsPaused)
            {
                _game.SetPaused(true);
                _pausedWave = true;
            }
            ShowPause();
        }

        bool WaveRunning => _game.ActiveWave != null && _game.CurrentPhase != WavePhase.WaveComplete;

        void ShowPause()
        {
            HideAll();
            _pause.Show(WaveRunning);
        }

        void ShowSettings()
        {
            HideAll();
            _settings.Show();
        }

        void OpenSettings(Action back)
        {
            _settingsBack = back;
            ShowSettings();
        }

        void AskStartOver(Action back)
        {
            HideAll();
            _confirm.Show(StartOverTitle, StartOverMessage, "Start over", _startOver, back);
        }

        void CloseAll()
        {
            HideAll();
            if (_pausedWave)
            {
                _pausedWave = false;
                _game.SetPaused(false);
            }
        }

        void HideAll()
        {
            _pause.Hide();
            _settings.Hide();
            _confirm.Hide();
        }
    }
}
