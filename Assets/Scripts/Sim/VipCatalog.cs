using System;
using System.Collections.Generic;

namespace ResortEmpire.Sim
{
    // Fixed VIP content (Build §5.2, §5.4; MVP_DECISIONS P11-P13, P17): four guest types, each with
    // three main requests and one bonus request. Roster items are reused across types on purpose
    // (Build §5.4: a requirement must be worth preparing for, not a one-off shopping list):
    //   Spa: Wedding Couple, Influencer      Chef: Travel Blogger, Wedding Couple
    //   Captain: Travel Blogger, Investor    Butler: Investor
    //   Bellhop, Receptionist, Bartender, Lifeguard: one type each.
    // Request durations are content, like the wave table's demand; the rule numbers live in TuningConfig.
    public static class VipCatalog
    {
        static readonly int TypeCount = Enum.GetValues(typeof(VipType)).Length;

        public static VipVisit Create(VipType type, ResortState resort, TuningConfig tuning, int visitNumber)
        {
            if (resort == null) throw new ArgumentNullException(nameof(resort));
            if (tuning == null) throw new ArgumentNullException(nameof(tuning));
            var defs = RequestsFor(type);
            var requests = new List<VipRequest>(defs.Length);
            for (int i = 0; i < defs.Length; i++) requests.Add(new VipRequest(i, defs[i]));
            return new VipVisit(type, Math.Max(1, visitNumber), resort, tuning, requests);
        }

        public static string DisplayName(VipType type)
        {
            switch (type)
            {
                case VipType.TravelBlogger: return "Travel Blogger";
                case VipType.WeddingCouple: return "Wedding Couple";
                case VipType.Investor: return "Investor";
                default: return "Influencer";
            }
        }

        // Guest names alternate with each full rotation of the four types (visits 1-4, 5-8, ...).
        public static string GuestNameFor(VipType type, int visitNumber)
        {
            string[] names;
            switch (type)
            {
                case VipType.TravelBlogger: names = new[] { "Maya", "Jonas" }; break;
                case VipType.WeddingCouple: names = new[] { "Ana & Leo", "Sofia & Tom" }; break;
                case VipType.Investor: names = new[] { "Mr. Hale", "Ms. Okafor" }; break;
                default: names = new[] { "Chloe", "Kiki" }; break;
            }
            int round = (Math.Max(1, visitNumber) - 1) / TypeCount;
            return names[round % names.Length];
        }

        // P17: the decor item a Perfect visit of this type unlocks (once).
        public static string DecorFor(VipType type)
        {
            switch (type)
            {
                case VipType.TravelBlogger: return "golden_palm";
                case VipType.WeddingCouple: return "flower_arch";
                case VipType.Investor: return "marble_fountain";
                default: return "neon_flamingo";
            }
        }

        public static string DecorDisplayName(string decorId)
        {
            switch (decorId)
            {
                case "golden_palm": return "Golden Palm";
                case "flower_arch": return "Flower Arch";
                case "marble_fountain": return "Marble Fountain";
                case "neon_flamingo": return "Neon Flamingo";
                default: return decorId;
            }
        }

        internal static VipRequestDef[] RequestsFor(VipType type)
        {
            switch (type)
            {
                case VipType.TravelBlogger:
                    return new[]
                    {
                        Req("Island Food Tour", "A tasting walk through the kitchen, filmed for the blog.", 90f,
                            manager: BuildingId.Restaurant),
                        Req("Boat Trip Vlog", "A morning cruise around the island with a captain at the helm.", 150f,
                            specialist: SpecialistId.Captain),
                        Req("Beach Picnic", "A picnic basket on the sand at golden hour.", 60f,
                            materials: 2, materialsLabel: "2x Coconuts"),
                        Req("Fresh Juice Stand", "A pop-up juice stand for a live Q&A with the followers.", 60f,
                            materials: 1, materialsLabel: "1x Pineapple", bonus: true),
                    };
                case VipType.WeddingCouple:
                    return new[]
                    {
                        Req("Couples Spa", "A side-by-side treatment for the newlyweds.", 180f,
                            building: BuildingId.Spa),
                        Req("Candlelit Dinner", "A private table by the water, cooked by the Chef.", 120f,
                            manager: BuildingId.Restaurant, materials: 2, materialsLabel: "2x Lobsters"),
                        Req("Honeymoon Suite", "An ocean bungalow dressed with petals, bags already carried in.", 120f,
                            manager: BuildingId.Bungalows),
                        Req("Flower Arch Photos", "A flower arch on the beach for the wedding album.", 90f,
                            materials: 2, materialsLabel: "2x Orchids", bonus: true),
                    };
                case VipType.Investor:
                    return new[]
                    {
                        Req("Private Yacht Meeting", "A business meeting at sea, far from the phones.", 150f,
                            specialist: SpecialistId.Captain),
                        Req("Personal Butler", "Someone discreet to handle every detail of the stay.", 120f,
                            specialist: SpecialistId.Butler),
                        Req("VIP Check-in", "A swift, personal welcome at the front desk.", 60f,
                            manager: BuildingId.Reception),
                        Req("Vintage Wine Tasting", "A rare bottle to seal the deal.", 90f,
                            materials: 2, materialsLabel: "2x Vintage Wine", bonus: true),
                    };
                default: // Influencer
                    return new[]
                    {
                        Req("Wellness Content Shoot", "A calm spa session filmed for her wellness series.", 150f,
                            building: BuildingId.Spa),
                        Req("Signature Mai Tai", "A cocktail created for her followers, mixed by the Bartender.", 60f,
                            manager: BuildingId.BeachBar, materials: 2, materialsLabel: "2x Mangoes"),
                        Req("Poolside Live Stream", "A sunny live stream from the pool deck, safely watched over.", 120f,
                            manager: BuildingId.Pool),
                        Req("Floating Breakfast", "Breakfast served on a tray in the pool.", 90f,
                            materials: 2, materialsLabel: "2x Papayas", bonus: true),
                    };
            }
        }

        static VipRequestDef Req(string title, string flavor, float seconds,
            BuildingId? building = null, BuildingId? manager = null, SpecialistId? specialist = null,
            int materials = 0, string materialsLabel = null, bool bonus = false)
        {
            return new VipRequestDef
            {
                Title = title,
                Flavor = flavor,
                DurationSeconds = seconds,
                Building = building,
                Manager = manager,
                Specialist = specialist,
                MaterialsNeeded = materials,
                MaterialsLabel = materialsLabel,
                IsBonus = bonus,
            };
        }
    }
}
