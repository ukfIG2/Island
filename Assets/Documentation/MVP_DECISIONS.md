# Resort Empire — MVP decisions

Last updated: **2026-10-20**. Release 2 (MVP) is built on top of the finished prototype. Its specification has gaps, so this document records, for every MVP topic, **who decided it**:

- **SPEC** — decided in the build document / GDD / UI handoff. We implement it as written.
- **PROVISIONAL** — the spec leaves it open, so we chose a value to be able to build (decided 2026-10-20 with Ivan's approval to proceed). The game designer and economist can overrule any of these; each one is a single setting or a small, isolated piece of code.
- **OPEN** — still undecided and *not* built; needs the designer.

All numbers below are starting values for tuning (they live in `TuningConfig`), never final balance.

---

## 1. Already decided by the spec (SPEC)

| # | Topic | Decision | Source |
|---|---|---|---|
| S1 | VIP layer | VIP guests are an optional layer on top of normal waves — never an interruption. Screens S6 VIP Preview, S7 Request Board, S8 VIP Complete. The Request Board is for VIPs only. | Build §5.4, UI §B |
| S2 | How VIPs are solved | By **preparedness**, not by assigning staff. Two layers: **consumable** gaps (Materials, decor) are `MISSING` and fixed on the spot with **Fix**; **roster** gaps (a missing Manager, Specialist or building such as the Spa) never block — they lower the request's **quality cap**. | Build §5.4 |
| S3 | VIP choice | Accept / Maybe later / Decline are always available; declining is never punished. Roster gaps must be visible on S6 *before* accepting. | Build §5.4, UI S6 |
| S4 | Request states | `MISSING → (Fix) → READY → IN_PROGRESS (Speed Up allowed) → COMPLETED`. The quality cap is an attribute of the request, not a state. VIP services are one-off tasks with an end and may finish in real time (also while the app is closed). | Build §5.4, §4.6 |
| S5 | Energy at VIPs | Mode A: Speed Up shortens a running service. Mode B: in `READY`, Energy buys back part of a lowered quality cap. A fully prepared resort reaches Perfect **without** Energy (hard rule HR2). | Build §5.4, §2 |
| S6 | Reputation | Unlock currency with a **threshold model**: cumulative, never decreases, never spent. Unlocks are two-step: a Reputation threshold makes content available, Coins buy it. VIPs are the main source. | GDD §7.6, Build §5.5 |
| S7 | Resort Value | Status only; only ever grows. | GDD §7.6 |
| S8 | Materials | Used for VIP **Fix** and for building levels **Lv4–Lv5** (together with Coins). Earned from VIPs and as a small drop from waves rated 4★ and better. | Build §5.6 |
| S9 | Gems | Only for permanent premium purchases (decor, bundles). Never converted to Energy, never used to speed anything up. | Build §5.6 |
| S10 | Staff, two layers | **Manager**: one named specialist per wave building (Receptionist, Chef, Bartender, Lifeguard, Bellhop), hired once for Coins, multiplies that building's service speed, also counts for VIP rosters. **Specialist**: Butler and Captain — hired for Coins, belong to no building, only matter for VIPs. | Build §5.3.2 |
| S11 | Workers | +1 Worker with every wave building (as in the prototype); more can be hired for Coins between waves; each new hire goes to a building with a free slot; total workers stay below total slots (cap **80 %** of slots). More workers on one building have diminishing returns. | Build §5.3.5 |
| S12 | Building levels | Lv1–3 unchanged from the prototype. **Lv4**: 2 worker slots + a quality tier, no extra seats (Coins + Materials). **Lv5**: 10 seats, 3 slots, + quality tier (Coins + Materials). | Build §5.3.6 |
| S13 | Upgrades only between waves | Unchanged. Hiring too. | Build §5.3.7 |
| S14 | Spa | VIP building: no wave need, no worker slot. At least two of the four VIP types have a request that depends on it (Wedding Couple — *Couples Spa*; Influencer — *Wellness Content Shoot*). Unlocked via the S9 screen with a Reputation gate. | Build §5.4 |
| S15 | VIP types | Travel Blogger, Wedding Couple, Investor, Influencer — 3 requests + 1 bonus request each. | Build §5.2 |
| S16 | VIP rewards | Reputation first, then Coins, Energy, Materials, Resort Value, occasionally a rare decor item. Must not make normal waves pointless. | Build §5.4, UI S8 |
| S17 | S5 in the MVP | Offers three different investments at once: upgrade a building, hire a Manager, hire a Worker. | UI S5 |
| S18 | Monetization | Only *places* for it, no tuning: rewarded video (Energy top-up and similar), Gem purchases as permanent investments. No pressure, no punishment for not paying. | Build §5.7 |
| S19 | Coming back | A fixed comeback reward (not a function of time away); the resort never degrades. | GDD §8 |

## 2. Chosen by us to be able to build (PROVISIONAL)

| # | Topic | Our choice | Why |
|---|---|---|---|
| P1 | Energy Mode B during **normal waves** (spec OPEN) | **Not built.** Energy in waves stays Mode A (Speed Up) only. | Keeps waves exactly as playtested; Mode B exists at VIPs where the spec defines it. |
| P2 | VIP star scale (spec OPEN) | **Same scale as waves:** 1★ 40 % · 2★ 55 % · 3★ 70 % · 4★ 80 % · 5★ 90 % · Perfect 100 %. | One scale is easier to read; the old VIP scale was left over from an earlier version. |
| P3 | Spa levels (spec OPEN) | **One level, no upgrades** in the MVP. Cost 3,000 Coins, Reputation gate 45. | The Spa has no seats or slots to improve; levels can be added once the designer defines what they change. |
| P4 | Can a VIP be impossible to accept? (Q-01) | **Every VIP can always be accepted.** Gaps only lower quality caps. | Matches the GDD ("the player can always accept"). |
| P5 | Reputation sources and thresholds (Q-07) | Each wave gives Reputation equal to its stars (1–5). A VIP gives 10 + 4 per star (+5 for Perfect). Gates: **Pool 10, Bungalows 30, Spa 45**. | Keeps the prototype rhythm: about 3 good waves open the Pool, about 6 waves plus a VIP open the Bungalows. |
| P6 | Materials amounts (Q-09) | Start with 3. Waves: 1 at 4★, 2 at 5★/Perfect. VIP: 1 + half the stars. Lv4 costs 2,500 Coins + 4 Materials, Lv5 5,000 Coins + 8 Materials. | Enough for the first VIP's Fix needs without grinding. |
| P7 | Manager / Specialist prices (Q-08) | Manager 800 Coins (×1.2 service speed). Specialist 1,000 Coins. | Spec examples. |
| P8 | Worker hiring (Q-05, Q-08) | 400 Coins, +200 for each worker already hired. Worker effect on one building: first worker +0.67 utilization (empty 0.33 → 1.0), second +0.30, third +0.15. | Diminishing returns as required; concentration is possible but spreading is usually better. |
| P9 | What "quality tier" does | Each tier (Lv4 = 1, Lv5 = 2) lets guests of that building's need wait **4 s longer per tier** before their satisfaction starts to drop. | Spec: "from Lv4 the building adds to satisfaction even when weakly staffed". |
| P10 | Waves after wave 8 (Jira FR-12) | Generated from wave 8: every need × 1.06 per extra wave, rounded; a Sudden rush every 3rd wave; no new needs. | Endless play without new design content; growth slow enough for Lv5 buildings to keep up. |
| P11 | When VIPs come | A VIP offer appears after waves 4, 7, 10, … (one at a time). Types rotate: Travel Blogger → Wedding Couple → Investor → Influencer. "Maybe later" keeps the offer waiting without expiry; "Decline" removes it until the next slot. | Spec: "after several successful waves" (US16). |
| P12 | VIP service times | Each request runs 60–180 s of real time once served (also while the app is closed). Speed Up halves the remaining time for 3 Energy. Mode B (Quality boost) costs 3 Energy and raises a lowered cap by 15 points, once per request. | Short enough for one session, long enough to feel like a stay. |
| P13 | VIP rating | A request missing a roster item is capped at 70 % (3★). VIP satisfaction = average achieved quality of the 3 main requests; a completed bonus request adds +10 (max 100 %). Requests still `MISSING` when the guest is served count as 40 %. | Spec example "max 3★ — no Spa"; never a zero result. |
| P14 | Comeback reward | After at least 12 h away: +3 Energy and +150 Coins, once per return. | Fixed and small; a "welcome back", not a timer. |
| P15 | Tutorial (Jira FR-54) | Five short coach hints in the first session (Start wave → wave panel → first bottleneck → move a worker → result), skippable, shown once. | The First Session User Story Walkthrough is missing; content to be replaced by it. |
| P16 | Gems and the shop | Start with 0 Gems, shown in the top bar. A Shop screen shows the three spec packs (Premium Staff Pack, Villa Upgrade Pack, Decoration Set) as **"Coming soon"** — no real purchases. Rewarded-video buttons ("Watch ad for Energy") are **test stubs** that grant the reward immediately and are labelled as test ads. | Places only, per spec; no store integration in this phase. |
| P17 | Decor | Perfect VIP visits unlock a decor item (one per VIP type) shown on the island; each adds 25 Resort Value. | Spec mentions "rare decor" rewards; a visible reward suits the "my resort grows" pillar. |
| P18 | Normal waves vs. VIP time | VIP services run on real time, normal waves on wave time; both can be active at once. | Spec: VIP is a layer on top, not a pause. |

### Further provisional details, chosen while building (2026-10-20)

| # | Topic | Our choice |
|---|---|---|
| P19 | VIP Coins / Energy / Resort Value | Coins = 1,500 × the wave Coins multiplier for the stars (Perfect = 1,950). Energy uses the same table as waves. Resort Value = 10 per star, +25 when decor is won. |
| P20 | Bonus request not prepared | A bonus request still `MISSING` when the guest is served is simply skipped (the 40 % rule applies only to the three main requests). |
| P21 | Roster check timing | A VIP's roster readiness (and so its quality caps) follows the resort live until the VIP is accepted, then freezes — a missing Butler cannot be hired mid-stay (spec). |
| P22 | Hiring raises Resort Value | +10 Resort Value per hired Manager, Specialist or Worker (spec: "staff" feeds Resort Value; amount is ours). |
| P23 | Free worker vs. hiring cap | The worker that comes with a newly unlocked building can push the total above the 80 % hiring cap; the cap then only blocks further hiring. Workers always stay below total slots. |
| P24 | Old prototype saves | Load fine, but start with 0 Reputation — a player past wave 3 who never bought the Pool must earn 10 Reputation for it. |
| P25 | Two unlocks in one wave | If two sites become available after the same wave, only the first opens its full-screen S9 automatically; the other is reached via the banner or by tapping its site. |
| P26 | VIP content | Guest names alternate per rotation (e.g. Maya, then Jonas). Bonus requests need only Materials. The first VIP (Travel Blogger) needs exactly the 3 starting Materials. Decor items: Golden Palm, Flower Arch, Marble Fountain, Neon Flamingo. |
| P27 | Test ads | "Watch ad (test)" grants one Speed Up's worth of Energy (3). |

## 3. Still open — not built (OPEN)

- **Final tuning of every number** above and in `TuningConfig` (Product Backlog Q-03, Q-05, Q-07–Q-11). Needs the economist with `wave_sim.py`-style simulation.
- **Energy cap and hoarding** in the MVP (Q-11) — Energy stays uncapped.
- **Energy Mode B during normal waves** (Q-04) — see P1; not built.
- **Long-term variety** — what keeps wave 20 interesting (Q-14–Q-18). Endless waves (P10) only grow in size.
- **Final art and Figma frames** (Q-12, Q-13) — everything is still blockout.
- **Real store / ads integration** — stubs only (P16).
- **Wave 2 tuning** — passive play lands at 3★ instead of the intended 4★ (see STATUS.md).

---

## 4. Technical contract (for developers)

The simulation (`Assets/Scripts/Sim/`, pure C#) owns all rules; the game layer only calls these members. Names are binding.

### Configuration
- `TuningConfig.Default` is the **MVP** configuration. `TuningConfig.Prototype` reproduces the prototype rules (wave-count gates, Lv1–3 only, no MVP systems) and is what the prototype rule tests (WR1–WR9) run against.
- `TuningConfig.UseReputationGates` (bool): true in Default, false in Prototype.

### Types (`SimTypes.cs` and new files)
- `BuildingId` gains `Spa` (last value). `BuildingNeeds.IsWaveBuilding(BuildingId)` — false only for Spa. `BuildingNeeds.Serves` is only meaningful for wave buildings; callers check `IsWaveBuilding` first.
- `enum SpecialistId { Butler, Captain }`.
- `enum VipType { TravelBlogger, WeddingCouple, Investor, Influencer }`.
- `enum RequestState { Missing, Ready, InProgress, Completed }`.

### ResortState additions
- Currencies: `int Reputation` (never decreases), `int Materials`, `int Gems`.
- `BuildingState.WorkerCount` (int); `BuildingState.HasWorker` stays as a read-only shortcut (`WorkerCount > 0`).
- Slots and hiring: `int SlotsOf(BuildingId)`, `int TotalSlots`, `int WorkerCap`, `int HireWorkerCost()` (−1 at the cap), `bool HireWorker(BuildingId placeOn)`; `MoveWorker(from, to)` moves one worker into a free slot.
- Managers and Specialists: `bool HasManager(BuildingId)`, `int ManagerCost(BuildingId)`, `bool HireManager(BuildingId)`, `bool HasSpecialist(SpecialistId)`, `int SpecialistCost(SpecialistId)`, `bool HireSpecialist(SpecialistId)`.
- Levels: `MaxLevel` (5 in Default, 3 in Prototype), `int UpgradeCost(BuildingId)` (Coins, −1 if impossible), `int UpgradeMaterialsCost(BuildingId)`, `int QualityTier(BuildingId)`.
- Gates: `IsEligible(BuildingId)` follows Reputation thresholds when `UseReputationGates`; `int ReputationGate(BuildingId)`.
- Decor: `IReadOnlyList<string> Decor`, `bool AddDecor(string id)`.
- Rewards from outside the sim (comeback gift, test ads): `void Grant(int coins, int energy, int materials = 0, int reputation = 0, int gems = 0)`.
- Save/restore: `ResortSnapshot ToSnapshot()` and `static ResortState FromSnapshot(TuningConfig, ResortSnapshot)` — a plain serializable data class holding everything above.

### Waves
- `WaveTable.WaveFor(int index)` — scripted waves 1–8, generated waves after that (P10). The 8-wave list stays available for the prototype tests.
- `WaveResult.ReputationEarned`, `WaveResult.MaterialsEarned`.

### VIP (`Vip*.cs`)
- `VipVisit` — created by `VipCatalog.Create(VipType type, ResortState resort, TuningConfig tuning, int visitNumber)`; members: `Type`, `GuestName`, `Requests` (list of `VipRequest`), `Accepted`, `Accept()`, `Fix(VipRequest)`, `ServeAll()`, `SpeedUp(VipRequest)`, `QualityBoost(VipRequest)`, `Tick(float realSeconds)`, `IsFinished`, `Result` (`VipResult`, rewards applied once), `ProjectedQuality`, `RewardRange`, plus snapshot/restore for saving.
- `VipRequest` — `Title`, `Flavor`, `MaterialsNeeded`, roster requirement (building / manager / specialist), `IsBonus`, `State`, `Remaining`, `QualityCap`, `Readiness` (Good / Risky).
- `VipSchedule.OfferDue(int wavesCompleted)` and `VipSchedule.NextType(int visitNumber)` (P11).
- `ComebackReward.Evaluate(long lastSeenUnixSeconds, long nowUnixSeconds, TuningConfig)` (P14) — pure; the game layer passes the times.
