# Resort Empire — Project Status

Last updated: **2026-10-15, 11:00** (Sprint 1, Oct 5–18)

This document tracks three things: what is **done**, what is **planned**, and what the known **gaps** are. Update it at the end of every working session.

---

## 1. Done

### Project / infrastructure
- Unity 6 URP project (`Island`), git repository initialized.
- Unity MCP bridge working (Claude Code can drive the editor). Note: the `pts-web-project` Docker container steals port 8080 — stop it before working, or move the MCP port to 8090.
- Player settings: **landscape-only** orientation (spec: mobile, landscape).
- All 6 specification documents read and cross-checked (GDD, Build document Prototype→MVP, UI Screens Handoff S1–S9, MVP deck, Jira backlog, Product Backlog with 64 FR / 14 NFR).

### Decisions taken (2026-10-15)
- Prototype visuals = **3D blockout** (primitives, fixed angled camera) in the existing 3D URP project. Real art is not a prototype goal.
- **Main Menu / Settings / Tutorial stay in scope** (following the Jira backlog, epic E09) — note this contradicts the Product Backlog's "no silent invention" rule; flagged for team confirmation.
- Sim core is written as **pure C#** (`ResortEmpire.Sim` assembly, no UnityEngine dependency) so it can be unit-tested headless and reused by a `wave_sim.py`-style validator. This mirrors the build document's requirement that every tuning change is verified by simulation against rules WR7/WR8.

### Sprint 1 — core wave simulation (in progress today)
- `Assets/Scripts/Sim/` — simulation assembly:
  - `SimTypes.cs` — need/building/phase/status enums (state names per spec; the word "idle" is banned).
  - `TuningConfig.cs` — every tuning constant from build doc §4.8 in one place.
  - `WaveTable.cs` — the 8 scripted waves incl. debut flags and Sudden rush.
  - `ResortState.cs`, `WaveSimulation.cs`, `WaveResult.cs` — wave state machine (AwaitingWave → WaveIncoming → WaveActive → WaveResolving → WaveComplete), seat-based service model, deterministic arrivals, worker allocation, Energy boost Mode A, bottleneck status FSM, satisfaction-from-waiting with the two floors, rating + Coins/Energy/Resort Value rewards.
- `Assets/Scripts/Sim/Tests/` — EditMode NUnit suite covering the hard spec rules: WR1 (floors), WR3 (wave ends only on empty queues), WR5 (free instant move), WR7 (passive play must not reach 5★ from wave 3, debut waves exempt), WR8 (fully upgraded resort reaches 5★ everywhere without Energy), WR9 (locked needs don't spawn), pause freeze, Sudden rush, rewards applied once.
- `Assets/Scripts/Game/DebugWaveRunner.cs` — OnGUI debug harness to play the whole 8-wave loop today (move workers, boost, pause, upgrade, unlock, wave results). Menu: **Resort Empire → Add Debug Runner To Scene**.
- **Build/test status: see §4 below — updated at end of session.**

---

## 2. Planned

### Rest of Sprint 1 (→ Oct 18)
- All tests green in Unity Test Runner; fix anything the WR7/WR8 simulations expose.
- Short hands-on playtest of the debug runner (does a wave *feel* readable in text form?).

### Sprint 2 (Oct 19 – Nov 1) — the island comes alive (Jira: 15 items)
- 3D blockout island: ground plane, 3–5 placeholder buildings with visible level (size) + worker marker + queue dots (spec: seat count must be readable from the building).
- S1 Home/Island: top bar (Coins, Energy, Resort Value), resort status, next-wave forecast, Start Wave CTA.
- S2 Wave Needs Panel: side panel, per-need aggregate bars, bottleneck warnings, guest feedback toasts, two wave phases visible (arrival / drain).
- S3 Worker Allocation: bottom-sheet modal, one-tap move, immediate visible effect (the "catching up" moment).
- Guests as simple capsules walking ship → buildings, queues rendered at buildings (visual only, sim stays authoritative).

### Sprint 3 (Nov 2 – 15) — closing the prototype loop (Jira: 17 items)
- S4 Wave Complete, S5 Upgrade Suggestion, S9 Area Unlock (used twice: Pool after W3, Bungalows after W6).
- Energy Speed Up button on buildings, Sudden rush prompt in S2.
- App shell per decision: Main Menu, Settings, autosave + load, pause on background (WAVE_PAUSED), no degradation / no offline income checks (FR-64/65).
- Validation task FR-62: 5★ achievable without Energy (already automated by the WR8 test — keep it green).

### Release 2 — MVP (Sprints 4–5, Nov 16 – Dec 13) — summary
Lv4–5 buildings (+Materials), Reputation thresholds, Manager/Specialist/Worker hiring with 80% slot cap, VIP layer (S6–S8, 4 VIP types, Spa), infinite waves after W8, tutorial, comeback reward, monetization hooks (places only, no tuning).

---

## 3. Gaps / open questions

**Missing source documents** (referenced everywhere in the specs, not in the repo — ask the game designer):
- *First Session User Story Walkthrough* (US1–US21 — the UI handoff references these constantly)
- *Energy System Spec* (hard rules, cap, refund, Mode B)
- *Decision Log* (chronological decisions; several sections point to it)
- *Project rules* (pillars, non-goals, terminology §6)
- `wave_sim.py` (the economist's reference simulator; our NUnit WR7/WR8 tests re-implement its role for now)
- `RESORT_EMPIRE_REQUIREMENTS_FINAL(2).md` (the 64-FR baseline the Product Backlog is derived from)

**Known inconsistencies**
- Two FR numbering systems: Jira backlog FR-01…69 vs Product Backlog FR-001…064. They do not map 1:1 — never mix them in one ticket.
- Jira includes Main Menu/Settings/Tutorial in the prototype; the Product Backlog explicitly excludes them. We follow Jira (user decision 2026-10-15) — confirm with the team.
- Figma mockup economy numbers are stale (Product Backlog Q-13): rewards ~120 Coins vs 1,200 Coin prices. Build document §4.8 is the tuning source of truth.
- VIP rating thresholds (3★ 50 / 4★ 70 / 5★ 90) are still on the old scale vs normal waves (40/55/70/80/90) — open MVP decision (Decision Log OPEN).

**Technical debt / not done yet**
- `Assets/Documentation/` should move out of `Assets/` (Unity imports PDFs/ODS as assets needlessly).
- No real scenes yet beyond SampleScene (contains a leftover test Cube — delete it in Sprint 2).
- No CI, no Android build attempted yet (target platform still desktop; switch + device test planned before end of Sprint 3).
- Economy values are all `TUNING` defaults — the two most sensitive (`service_time` 12 s, `utilization_empty` 0.33) must be re-verified by simulation after any change (build doc hard rule).
- Open tuning questions Q-03…Q-11 from the Product Backlog remain with the economist/designer.

---

## 4. Current build status

*(updated at end of each session)*

- **2026-10-15 11:30 — GREEN.** Sim assembly, test suite and debug runner compile with zero errors; **all 10 EditMode tests pass on first run**, including the two heavy spec simulations:
  - `WR7_PassiveBestStaticPlacementNeverHitsFiveStars` — passive play cannot reach 5★ from wave 3 (debut waves 4/7 exempt), wave 1 is Perfect by placement alone.
  - `WR8_FullyUpgradedResortFiveStarsEverywhereWithoutEnergy` — Lv3 everywhere + 4 workers reaches 5★ in all 8 waves with no Energy.
  - Plus WR1 floors, WR3 wave-end rule, WR5 free move, WR9 locked needs, AC2 move effect, pause freeze, Sudden rush targeting, rewards-applied-once.
- Not yet done in this session: hands-on playtest of the debug runner (menu **Resort Empire → Add Debug Runner To Scene**, then Play), adversarial code review pass against the spec, Sprint 2 work. Engine notes worth a Decision Log entry: `DemandTotal()` of a *locked* need reports the scripted number (UI shows it next to the Locked badge) while spawning nothing — spec is silent on whether it should read 0.
