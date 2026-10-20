using System;
using System.IO;
using ResortEmpire.Sim;
using UnityEngine;

namespace ResortEmpire.Game
{
    // Between-waves snapshots only. A wave in progress is never saved — in-memory pause covers
    // backgrounding, and killing the app mid-wave restores the pre-wave state by design.
    public static class SaveSystem
    {
        public const int CurrentVersion = 2;
        const int LegacyMaxLevel = 3; // version-1 saves come from the prototype: Lv1-3 only

        // Version 2: the sim's own snapshot plus the flow data the game layer owns.
        [Serializable]
        class SaveData
        {
            public int version = CurrentVersion;
            public int nextWaveIndex;
            public long lastSeenUnixSeconds;   // UTC; feeds the comeback reward (P14)
            public ResortSnapshot resort;

            // VIP layer (Sprint 5). Absent in older version-2 saves: the flags then read false.
            public long savedAtUnixSeconds;    // UTC wall clock when written; a running stay catches up from here
            public int vipVisitCount;          // offers made so far (drives the next visit number and type)
            public bool hasVipOffer;
            public bool vipOfferSeen;          // "Maybe later" was pressed
            public VipVisitSnapshot vipOffer;  // offered, not accepted
            public bool hasVipActive;
            public VipVisitSnapshot vipActive; // accepted stay, also finished but not yet claimed
        }

        // Version 1 (prototype): parallel building arrays, migrated through ResortState.Restore.
        [Serializable]
        class SaveDataV1
        {
            public int version;
            public int coins;
            public int energy;
            public int resortValue;
            public int wavesCompleted;
            public int nextWaveIndex;
            public int workers;
            public int[] ids;
            public int[] levels;
            public bool[] hasWorker;
        }

        [Serializable]
        class VersionProbe
        {
            public int version;
        }

        public sealed class Loaded
        {
            public ResortState Resort;
            public int NextWaveIndex = 1;
            public long LastSeenUnixSeconds; // 0 when there was no usable save
            public long SavedAtUnixSeconds;
            public int VipVisitCount;
            public bool VipOfferSeen;
            public VipVisitSnapshot VipOffer;   // null when none
            public VipVisitSnapshot VipActive;  // null when none
        }

        public static string SavePath => Application.persistentDataPath + "/resort_save.json";

        public static bool HasSave => File.Exists(SavePath);

        public static bool Delete()
        {
            if (!File.Exists(SavePath)) return false;
            File.Delete(SavePath);
            return true;
        }

        public static void Save(GameController game)
        {
            if (game == null || game.Resort.InWave) return;
            try
            {
                long now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
                var data = new SaveData
                {
                    nextWaveIndex = game.NextWaveIndex,
                    lastSeenUnixSeconds = game.LastSeenForSave(now),
                    resort = game.Resort.ToSnapshot(),
                    savedAtUnixSeconds = now,
                    vipVisitCount = game.VipVisitCount,
                    hasVipOffer = game.VipOffer != null,
                    vipOfferSeen = game.VipOfferSeen,
                    vipOffer = game.VipOffer?.ToSnapshot(),
                    hasVipActive = game.ActiveVip != null,
                    vipActive = game.ActiveVip?.ToSnapshot()
                };
                File.WriteAllText(SavePath, JsonUtility.ToJson(data));
            }
            catch (Exception e) { Debug.LogWarning("Resort save failed: " + e.Message); }
        }

        // Any unreadable or inconsistent file falls back to a fresh game rather than throwing.
        public static Loaded LoadOrNew(TuningConfig tuning)
        {
            try
            {
                if (!File.Exists(SavePath)) return Fresh(tuning);
                string json = File.ReadAllText(SavePath);
                var probe = JsonUtility.FromJson<VersionProbe>(json);
                if (probe == null) return Fresh(tuning);
                switch (probe.version)
                {
                    case CurrentVersion: return LoadV2(tuning, json);
                    case 1: return MigrateV1(tuning, json);
                    default: return Fresh(tuning);
                }
            }
            catch (Exception e)
            {
                Debug.LogWarning("Resort load failed, starting a new game: " + e.Message);
                return Fresh(tuning);
            }
        }

        static Loaded Fresh(TuningConfig tuning) => new Loaded { Resort = ResortState.NewGame(tuning) };

        static Loaded LoadV2(TuningConfig tuning, string json)
        {
            var data = JsonUtility.FromJson<SaveData>(json);
            if (data == null || data.resort == null) return Fresh(tuning);
            var resort = ResortState.FromSnapshot(tuning, data.resort);
            if (resort == null) return Fresh(tuning);
            return new Loaded
            {
                Resort = resort,
                NextWaveIndex = Math.Max(1, data.nextWaveIndex),
                LastSeenUnixSeconds = Math.Max(0L, data.lastSeenUnixSeconds),
                SavedAtUnixSeconds = data.savedAtUnixSeconds > 0 ? data.savedAtUnixSeconds : Math.Max(0L, data.lastSeenUnixSeconds),
                VipVisitCount = Math.Max(0, data.vipVisitCount),
                VipOfferSeen = data.vipOfferSeen,
                VipOffer = data.hasVipOffer ? data.vipOffer : null,
                VipActive = data.hasVipActive ? data.vipActive : null
            };
        }

        // A prototype save keeps its progress: rebuilt through the legacy constructor, then written back
        // as version 2 on the next save. It carries no timestamp, so it never triggers a comeback gift.
        static Loaded MigrateV1(TuningConfig tuning, string json)
        {
            var data = JsonUtility.FromJson<SaveDataV1>(json);
            if (data == null || data.ids == null || data.levels == null || data.hasWorker == null
                || data.ids.Length == 0
                || data.ids.Length != data.levels.Length
                || data.ids.Length != data.hasWorker.Length)
                return Fresh(tuning);

            var ids = new BuildingId[data.ids.Length];
            for (int i = 0; i < ids.Length; i++)
            {
                if (!Enum.IsDefined(typeof(BuildingId), data.ids[i])
                    || !BuildingNeeds.IsWaveBuilding((BuildingId)data.ids[i])
                    || data.levels[i] < 1 || data.levels[i] > LegacyMaxLevel)
                    return Fresh(tuning);
                ids[i] = (BuildingId)data.ids[i];
            }

            var resort = ResortState.Restore(tuning, data.coins, data.energy, data.resortValue,
                data.wavesCompleted, data.workers, ids, data.levels, data.hasWorker);
            Debug.Log("Resort save migrated from version 1 to version " + CurrentVersion + ".");
            // The prototype capped the stored index at 8; GameController moves it past WavesCompleted.
            return new Loaded { Resort = resort, NextWaveIndex = Math.Max(1, data.nextWaveIndex) };
        }
    }
}
