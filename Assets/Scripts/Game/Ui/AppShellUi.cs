using System;
using ResortEmpire.Sim;
using UnityEngine;

namespace ResortEmpire.Game.Ui
{
    // The app shell: main menu, pause menu, settings and the start-over confirmation, and which screen "Back" returns to.
    // Opening the menu during a wave pauses it; Resume lifts only a pause the shell itself set, so a wave the player
    // had already paused stays paused.
    public sealed class AppShellUi
    {
        const string StartOverTitle = "Start over?";
        const string StartOverMessage = "Your resort and every wave played so far will be erased. This cannot be undone.";

        readonly GameController _game;
        readonly Action _startOver;
        readonly MainMenuUi _main;
        readonly PauseMenuUi _pause;
        readonly SettingsUi _settings;
        readonly ConfirmDialogUi _confirm;
        Action _settingsBack;
        bool _pausedWave;

        public bool IsOpen => _main.Visible || _pause.Visible || _settings.Visible || _confirm.Visible;

        public AppShellUi(Transform canvas, GameController game, AppSettings settings, Action startOver)
        {
            _game = game;
            _startOver = startOver;
            _main = new MainMenuUi(canvas, CloseAll, () => AskStartOver(ShowMain), () => OpenSettings(ShowMain));
            _pause = new PauseMenuUi(canvas, CloseAll, () => OpenSettings(ShowPause), ShowMain);
            _settings = new SettingsUi(canvas, settings, () => _settingsBack?.Invoke(), () => AskStartOver(ShowSettings));
            _confirm = new ConfirmDialogUi(canvas);
        }

        // Above everything else on the canvas.
        public void BringToFront()
        {
            _main.Root.transform.SetAsLastSibling();
            _pause.Root.transform.SetAsLastSibling();
            _settings.Root.transform.SetAsLastSibling();
            _confirm.Root.transform.SetAsLastSibling();
        }

        // The app opens on this; PLAY / CONTINUE just closes it, so a wave that came back from a save still waits on its own
        // Resume card underneath.
        public void OpenMainMenu() => ShowMain();

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
            _main.Show(_game.HasProgress);
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

        // CAM-132: the question is only asked when there is something to lose. A resort with no wave played yet has
        // nothing to erase, so it starts over at once.
        void AskStartOver(Action back)
        {
            HideAll();
            if (!_game.HasProgress)
            {
                _startOver();
                return;
            }
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
            _main.Hide();
            _pause.Hide();
            _settings.Hide();
            _confirm.Hide();
        }
    }
}
