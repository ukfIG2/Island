namespace ResortEmpire.Game
{
    // Where a setting is kept. The game uses the device's PlayerPrefs; tests use a plain dictionary.
    public interface ISettingsStore
    {
        int GetInt(string key, int fallback);
        void SetInt(string key, int value);
        void Save();
    }

    // CAM-51: the player's Sound and Music choices. They belong to the device, not to the resort, so "Reset progress"
    // leaves them alone. Both start On. No audio plays yet; whatever plays sound later reads these two switches.
    public sealed class AppSettings
    {
        public const string SoundKey = "island.sound";
        public const string MusicKey = "island.music";

        readonly ISettingsStore _store;

        public AppSettings(ISettingsStore store) => _store = store;

        public bool SoundOn => _store.GetInt(SoundKey, 1) != 0;
        public bool MusicOn => _store.GetInt(MusicKey, 1) != 0;

        public void SetSound(bool on) => Write(SoundKey, on);
        public void SetMusic(bool on) => Write(MusicKey, on);

        public bool ToggleSound() { SetSound(!SoundOn); return SoundOn; }
        public bool ToggleMusic() { SetMusic(!MusicOn); return MusicOn; }

        void Write(string key, bool on)
        {
            _store.SetInt(key, on ? 1 : 0);
            _store.Save();
        }
    }
}
