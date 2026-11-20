using UnityEngine;

namespace ResortEmpire.Game
{
    sealed class PlayerPrefsStore : ISettingsStore
    {
        public int GetInt(string key, int fallback) => PlayerPrefs.GetInt(key, fallback);
        public void SetInt(string key, int value) => PlayerPrefs.SetInt(key, value);
        public void Save() => PlayerPrefs.Save();
    }

    // The settings of this device, kept in PlayerPrefs.
    public static class DeviceSettings
    {
        public static readonly AppSettings Current = new AppSettings(new PlayerPrefsStore());
    }
}
