using System;
using ResortEmpire.Sim;
using UnityEngine;

namespace ResortEmpire.Game.Ui
{
    // App shell (Jira E09): main menu, pause menu, settings and the start-over confirm, plus the
    // bookkeeping of which screen "Back" returns to and whether the shell paused a running wave.
    public sealed class AppShellUi
    {
        const string StartOverMessage = "Start over? Your resort progress will be reset.";

        readonly GameController _game;
        readonly Action _startOver;
        readonly Action _onClosed;
        readonly Action _onSessionStarted;
        readonly MainMenuUi _main;
        readonly PauseMenuUi _pause;
        readonly SettingsUi _settings;
        readonly ConfirmDialogUi _confirm;
        Action _settingsBack;
        bool _pausedWave;
        bool _sessionStarted;

        public bool IsOpen => _main.Visible || _pause.Visible || _settings.Visible || _confirm.Visible;

        // onSessionStarted runs once, after the first PLAY / CONTINUE of this launch has closed the menu.
        public AppShellUi(Transform canvas, GameController game, Action startOver, Action onClosed, Action onSessionStarted)
        {
            _game = game;
            _startOver = startOver;
            _onClosed = onClosed;
            _onSessionStarted = onSessionStarted;
            _main = new MainMenuUi(canvas, Play, () => AskStartOver(ShowMain), () => OpenSettings(ShowMain));
            _pause = new PauseMenuUi(canvas, CloseAll, () => OpenSettings(ShowPause), ShowMain);
            _settings = new SettingsUi(canvas, () => _settingsBack?.Invoke(), () => AskStartOver(ShowSettings));
            _confirm = new ConfirmDialogUi(canvas);
        }

        public void BringToFront()
        {
            _main.Root.transform.SetAsLastSibling();
            _pause.Root.transform.SetAsLastSibling();
            _settings.Root.transform.SetAsLastSibling();
            _confirm.Root.transform.SetAsLastSibling();
        }

        public void OpenMainMenu() => ShowMain();

        // A running wave is paused while the menu is open; Resume only lifts a pause the menu itself set.
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

        void ShowMain()
        {
            HideAll();
            _main.Show(_sessionStarted || SaveSystem.HasSave);
        }

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
            _confirm.Show(StartOverMessage, "Start over", _startOver, back);
        }

        void Play()
        {
            bool first = !_sessionStarted;
            _sessionStarted = true;
            CloseAll();
            if (first) _onSessionStarted?.Invoke();
        }

        void CloseAll()
        {
            HideAll();
            if (_pausedWave)
            {
                _pausedWave = false;
                _game.SetPaused(false);
            }
            _onClosed?.Invoke();
        }

        void HideAll()
        {
            _main.Hide();
            _pause.Hide();
            _settings.Hide();
            _confirm.Hide();
        }
    }
}
