using System;
using ResortEmpire.Sim;
using UnityEngine;

namespace ResortEmpire.Game
{
    // Between-waves snapshots only. A wave in progress is never saved — in-memory pause covers
    // backgrounding, and killing the app mid-wave restores the pre-wave state by design.
    public static class SaveSystem
    {
        [Serializable]
        class SaveData
        {
            public int version = 1;
            public int coins;
            public int energy;
            public int resortValue;
            public int wavesCompleted;
            public int nextWaveIndex;
            public int workers;
            public int[] ids;        // parallel building arrays
            public int[] levels;
            public bool[] hasWorker;
        }

        public static string SavePath => Application.persistentDataPath + "/resort_save.json";

        // Removes the save and its backup, so a reset cannot bring the old game back.
        public static bool Delete() => SafeFile.Delete(SavePath);

        public static void Save(GameController game)
        {
            if (game == null || game.Resort.InWave) return;
            var resort = game.Resort;
            int n = resort.Buildings.Count;
            var data = new SaveData
            {
                coins = resort.Coins,
                energy = resort.Energy,
                resortValue = resort.ResortValue,
                wavesCompleted = resort.WavesCompleted,
                nextWaveIndex = game.NextWaveIndex,
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

        // The save, or its backup if the save was cut short, or a fresh game: never an exception.
        public static (ResortState resort, int nextWaveIndex) LoadOrNew(TuningConfig tuning)
        {
            try
            {
                string text = SafeFile.ReadBest(SavePath, t => TryRestore(t, tuning, out _, out _));
                if (text != null && TryRestore(text, tuning, out var resort, out int next)) return (resort, next);
            }
            catch (Exception e)
            {
                Debug.LogWarning("Resort load failed, starting a new game: " + e.Message);
            }
            return (ResortState.NewGame(tuning), 1);
        }

        // False for any unreadable or inconsistent text.
        static bool TryRestore(string text, TuningConfig tuning, out ResortState resort, out int nextWaveIndex)
        {
            resort = null;
            nextWaveIndex = 1;
            try
            {
                var data = JsonUtility.FromJson<SaveData>(text);
                if (data == null || data.ids == null || data.levels == null || data.hasWorker == null
                    || data.ids.Length == 0
                    || data.ids.Length != data.levels.Length
                    || data.ids.Length != data.hasWorker.Length)
                    return false;

                var ids = new BuildingId[data.ids.Length];
                for (int i = 0; i < ids.Length; i++)
                {
                    if (!Enum.IsDefined(typeof(BuildingId), data.ids[i])
                        || data.levels[i] < 1 || data.levels[i] > tuning.CapacityPerLevel.Length)
                        return false;
                    ids[i] = (BuildingId)data.ids[i];
                }

                resort = ResortState.Restore(tuning, data.coins, data.energy, data.resortValue,
                    data.wavesCompleted, data.workers, ids, data.levels, data.hasWorker);
                nextWaveIndex = Mathf.Clamp(data.nextWaveIndex, 1, 8);
                return true;
            }
            catch (Exception)
            {
                return false;
            }
        }
    }
}
