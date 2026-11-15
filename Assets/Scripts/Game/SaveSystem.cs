using System;
using ResortEmpire.Sim;
using UnityEngine;

namespace ResortEmpire.Game
{
    // The save file: the resort, which wave comes next, and (CAM-53) the wave in progress, so the game can be left at
    // any moment. The time of the last save is kept for the comeback gift.
    public static class SaveSystem
    {
        [Serializable]
        class SaveData
        {
            public int version = 2;      // 1: between waves only; 2: adds the time of the save and a wave in progress
            public int coins;
            public int energy;
            public int resortValue;
            public int wavesCompleted;
            public int nextWaveIndex;
            public int workers;
            public int[] ids;        // parallel building arrays
            public int[] levels;
            public bool[] hasWorker;
            public int starsEarned;      // stars of all finished waves, for the finale summary
            public long savedAtUnix;     // real time of the last save
            public bool hasWave;         // a wave was running; its snapshot is in 'wave'
            public WaveSnapshot wave;
        }

        // Tests point this at a temporary file so they never touch the player's real save.
        public static string PathOverride { get; set; }

        public static string SavePath => PathOverride ?? Application.persistentDataPath + "/resort_save.json";

        // Removes the save and its backup, so a reset cannot bring the old game back.
        public static bool Delete() => SafeFile.Delete(SavePath);

        public static void Save(GameController game)
        {
            if (game == null) return;
            var resort = game.Resort;

            // A running wave is saved as it is. Once it has completed the rewards are already in the resort, so the
            // save continues with the next wave and nothing is paid twice.
            int nextWave = game.NextWaveIndex;
            WaveSnapshot wave = null;
            if (game.ActiveWave != null)
            {
                wave = game.ActiveWave.ToSnapshot();   // null once the wave is complete
                if (game.ActiveWave.Phase == WavePhase.WaveComplete) nextWave++;
            }
            int n = resort.Buildings.Count;
            var data = new SaveData
            {
                coins = resort.Coins,
                energy = resort.Energy,
                resortValue = resort.ResortValue,
                wavesCompleted = resort.WavesCompleted,
                starsEarned = resort.StarsEarned,
                nextWaveIndex = nextWave,
                savedAtUnix = DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
                hasWave = wave != null,
                wave = wave,
                workers = resort.Workers,
                ids = new int[n],
                levels = new int[n],
                hasWorker = new bool[n]
            };
            for (int i = 0; i < n; i++)
            {
                data.ids[i] = (int)resort.Buildings[i].Id;
                data.levels[i] = resort.Buildings[i].Level;
                data.hasWorker[i] = resort.Buildings[i].HasWorker;
            }
            try { SafeFile.Write(SavePath, JsonUtility.ToJson(data)); }
            catch (Exception e) { Debug.LogWarning("Resort save failed: " + e.Message); }
        }

        // What a save gives back: the resort, which wave comes next, and the wave that was running (or null).
        public sealed class LoadedGame
        {
            public ResortState Resort;
            public int NextWaveIndex;
            public WaveSnapshot Wave;       // the wave that was running when the game was saved, otherwise null
            public long SavedAtUnix;        // real time of that save; 0 for a new game or a version-1 save
        }

        // The save, or its backup if the save was cut short, or a fresh game: never an exception.
        public static LoadedGame LoadOrNew(TuningConfig tuning)
        {
            try
            {
                string text = SafeFile.ReadBest(SavePath, t => TryRestore(t, tuning) != null);
                var loaded = text != null ? TryRestore(text, tuning) : null;
                if (loaded != null) return loaded;
            }
            catch (Exception e)
            {
                Debug.LogWarning("Resort load failed, starting a new game: " + e.Message);
            }
            return new LoadedGame { Resort = ResortState.NewGame(tuning), NextWaveIndex = 1 };
        }

        // Null for any unreadable or inconsistent text.
        static LoadedGame TryRestore(string text, TuningConfig tuning)
        {
            try
            {
                var data = JsonUtility.FromJson<SaveData>(text);
                if (data == null || data.ids == null || data.levels == null || data.hasWorker == null
                    || data.ids.Length == 0
                    || data.ids.Length != data.levels.Length
                    || data.ids.Length != data.hasWorker.Length)
                    return null;

                var ids = new BuildingId[data.ids.Length];
                for (int i = 0; i < ids.Length; i++)
                {
                    if (!Enum.IsDefined(typeof(BuildingId), data.ids[i])
                        || data.levels[i] < 1 || data.levels[i] > tuning.CapacityPerLevel.Length)
                        return null;
                    ids[i] = (BuildingId)data.ids[i];
                }

                var resort = ResortState.Restore(tuning, data.coins, data.energy, data.resortValue,
                    data.wavesCompleted, data.workers, ids, data.levels, data.hasWorker, data.starsEarned);
                return new LoadedGame
                {
                    Resort = resort,
                    NextWaveIndex = Mathf.Max(data.nextWaveIndex, 1),   // the waves go on past wave 8
                    Wave = data.hasWave ? data.wave : null,   // GameController checks that it fits before using it
                    SavedAtUnix = data.savedAtUnix
                };
            }
            catch (Exception)
            {
                return null;
            }
        }
    }
}
