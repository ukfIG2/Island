using System;
using System.Collections.Generic;

namespace ResortEmpire.Sim
{
    // Build §5.2: the four VIP guest types, in the order they rotate (P11).
    public enum VipType
    {
        TravelBlogger,
        WeddingCouple,
        Investor,
        Influencer
    }

    // Build §5.4 (S4): MISSING -> (Fix) -> READY -> IN_PROGRESS (Speed Up) -> COMPLETED.
    public enum RequestState
    {
        Missing,
        Ready,
        InProgress,
        Completed
    }

    // UI S6: Good = fully prepared; Risky = a roster item is missing, so the quality cap is lower.
    // Risky never means "cannot be done" (P4).
    public enum Readiness
    {
        Good,
        Risky
    }

    // One request on the VIP Request Board (S7). Content comes from VipCatalog; state changes only
    // through VipVisit.
    public sealed class VipRequest
    {
        internal VipRequest(int index, VipRequestDef def)
        {
            Index = index;
            Title = def.Title;
            Flavor = def.Flavor;
            MaterialsNeeded = Math.Max(0, def.MaterialsNeeded);
            MaterialsLabel = MaterialsNeeded > 0 ? def.MaterialsLabel ?? (MaterialsNeeded + "x Materials") : "";
            RequiredBuilding = def.Building;
            RequiredManager = def.Manager;
            RequiredSpecialist = def.Specialist;
            IsBonus = def.IsBonus;
            DurationSeconds = def.DurationSeconds;
            RosterLabel = BuildRosterLabel(def.Building, def.Manager, def.Specialist);
            RosterGap = "";
            State = MaterialsNeeded > 0 ? RequestState.Missing : RequestState.Ready;
            QualityCap = 1f;
            Readiness = Readiness.Good;
        }

        public int Index { get; }                         // position on the board (bonus last)
        public string Title { get; }                      // "Signature Mai Tai"
        public string Flavor { get; }                     // one line of guest flavour text
        public int MaterialsNeeded { get; }               // consumable layer: > 0 -> starts MISSING, Fix spends it
        public string MaterialsLabel { get; }             // themed wrapper, e.g. "2x Mangoes"; "" without Materials
        public BuildingId? RequiredBuilding { get; }      // roster: this building must be unlocked (e.g. the Spa)
        public BuildingId? RequiredManager { get; }       // roster: this building's Manager must be hired
        public SpecialistId? RequiredSpecialist { get; }  // roster: this Specialist must be hired
        public bool IsBonus { get; }
        public float DurationSeconds { get; }             // real time once served (P12: 60-180 s)
        public string RosterLabel { get; }                // what the roster needs, e.g. "Spa", "Bartender"; "" without

        public RequestState State { get; internal set; }
        public float Remaining { get; internal set; }     // real seconds left while IN_PROGRESS
        public float QualityCap { get; internal set; }    // 1.0, or VipRosterGapCap with a roster gap (+ Mode B)
        public Readiness Readiness { get; internal set; }
        public string RosterGap { get; internal set; }    // the missing roster items, e.g. "Butler"; "" when Good
        public bool QualityBoosted { get; internal set; } // Mode B used (once)
        public bool SpedUp { get; internal set; }         // Speed Up used (once)
        public bool ServedMissing { get; internal set; }  // served while still MISSING -> counts VipMissingServedQuality
        public float ServedQuality { get; internal set; } // quality locked in when served

        public bool HasRosterRequirement =>
            RequiredBuilding.HasValue || RequiredManager.HasValue || RequiredSpecialist.HasValue;

        public bool IsServed => State == RequestState.InProgress || State == RequestState.Completed;

        static string BuildRosterLabel(BuildingId? building, BuildingId? manager, SpecialistId? specialist)
        {
            var parts = new List<string>();
            if (building.HasValue) parts.Add(BuildingNeeds.DisplayName(building.Value));
            if (manager.HasValue) parts.Add(BuildingNeeds.ManagerTitle(manager.Value));
            if (specialist.HasValue) parts.Add(specialist.Value.ToString());
            return string.Join(" + ", parts);
        }
    }

    // Catalog content of one request (fixed English text, see VipCatalog).
    internal sealed class VipRequestDef
    {
        public string Title;
        public string Flavor;
        public int MaterialsNeeded;
        public string MaterialsLabel;
        public BuildingId? Building;
        public BuildingId? Manager;
        public SpecialistId? Specialist;
        public bool IsBonus;
        public float DurationSeconds;
    }

    // S8 VIP Complete. Computed once when the last served request completes; rewards are already
    // applied to ResortState by then.
    public sealed class VipResult
    {
        public VipType Type;
        public float Satisfaction;      // P13: average of the 3 main requests, + bonus, within WaveFloor..1
        public int Stars;               // 1..5, same scale as waves (P2)
        public bool Perfect;
        public int ReputationEarned;    // shown first (UI S8)
        public int CoinsEarned;
        public int EnergyEarned;
        public int MaterialsEarned;
        public int ResortValueGain;     // stars x VipResortValuePerStar, plus the decor's value when one was won
        public string DecorUnlocked;    // decor id won by this visit (Perfect, first time for the type); null otherwise
        public int RequestsCompleted;   // main and bonus
        public bool BonusCompleted;
    }

    // S6 reward preview: Min = the projected rating as prepared right now (no Energy), Max = a Perfect stay.
    public struct VipRewardRange
    {
        public int MinCoins;
        public int MaxCoins;
        public int MinReputation;
        public int MaxReputation;
        public int MinMaterials;
        public int MaxMaterials;
        public int MinEnergy;
        public int MaxEnergy;
    }

    // Save data for a VipVisit (public fields only, JsonUtility-friendly). Per-request arrays follow
    // VipVisit.Requests order; the request content itself comes back from VipCatalog.
    [Serializable]
    public sealed class VipVisitSnapshot
    {
        public const int CurrentVersion = 1;

        public int version = CurrentVersion;
        public int type;                 // (int)VipType
        public int visitNumber;
        public bool accepted;
        public bool served;

        public int[] states;             // (int)RequestState
        public float[] remaining;
        public float[] qualityCaps;
        public int[] readiness;          // (int)Readiness
        public string[] rosterGaps;
        public bool[] qualityBoosted;
        public bool[] spedUp;
        public bool[] servedMissing;
        public float[] servedQuality;

        public bool finished;            // the result exists and its rewards were applied
        public float resultSatisfaction;
        public int resultStars;
        public bool resultPerfect;
        public int resultReputation;
        public int resultCoins;
        public int resultEnergy;
        public int resultMaterials;
        public int resultResortValue;
        public string resultDecor;       // "" when none
        public int resultRequestsCompleted;
        public bool resultBonusCompleted;
    }
}
