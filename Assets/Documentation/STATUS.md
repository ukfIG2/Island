# Resort Empire — Project Status

Last updated: **2026-10-20** (Sprint 2, Oct 19 – Nov 1)

This document tracks three things: what is **done**, what is **planned**, and what the known **gaps** are. Update it at the end of every working session.

---

## 1. Done

### Project / infrastructure

- Unity 6 URP project (`Island`), git repository. Work happens on branch **`dev-beta`**; GitHub remote `ukfIG2/Island` (private).
- Unity MCP bridge working (Claude Code can drive the editor). The official `unity-mcp-skill` is installed for Claude. If the bridge fails, check that the `pts-web-project` Docker container is not holding port 8080.
- Project skill for Claude at `.claude/skills/resort-empire/SKILL.md`: spec hard rules, architecture, Unity constraints, workflow and git conventions. Every Claude session in this repo follows it.
- Player settings: **landscape-only** orientation (spec: mobile, landscape).
- All 6 specification documents read and cross-checked (GDD, Build document Prototype→MVP, UI Screens Handoff S1–S9, MVP deck, Jira backlog, Product Backlog with 64 FR / 14 NFR).

### Decisions taken

- (2026-10-15) Prototype visuals = **3D blockout**: primitives built in code, fixed angled camera. Building visuals are kept swappable so real art can drop in later.
- (2026-10-15) **Main Menu / Settings / Tutorial stay in scope**, following the Jira backlog (epic E09). This contradicts the Product Backlog's "no silent invention" rule — flagged for team confirmation.
- (2026-10-15) Sim core is **pure C#** (`ResortEmpire.Sim`, no UnityEngine), so it is unit-tested headless and plays the role of the spec's `wave_sim.py` validator for rules WR7/WR8.
- (2026-10-20) **Recovering grace (AC2):** when a worker lands on, or Speed Up hits, a building whose need is in Bottleneck, the need switches to Recovering in the same interaction. For one service time (`RecoveringGraceSeconds` = 12 s) the warning cannot come back, even if the queue briefly dips and rises again. Reason: with the seat model the queue only shrinks when a seat frees, so without the grace the warning would flicker straight back. Worth a Decision Log entry.
- (2026-10-20) Speed Up is **offered only at overloaded buildings** (Bottleneck or Recovering), never everywhere — build doc §5.3.9 ("Energy is offered only when allocation is not enough").
- (2026-10-20) In the editor, clicking another window does not pause a wave; on devices, leaving the app does (spec: WAVE_PAUSED on background).

### Sprint 1 — core wave simulation (committed `a30047f`)

- `Assets/Scripts/Sim/` — wave state machine (AwaitingWave → WaveIncoming → WaveActive → WaveResolving → WaveComplete, plus pause), deterministic gradual arrivals, seat-based service, worker allocation, Energy boost Mode A, bottleneck status FSM, satisfaction from waiting with the two floors, rating and Coins / Energy / Resort Value rewards, Pool/Bungalows unlocks, the 8 scripted waves with the wave-2 Sudden rush. All numbers live in `TuningConfig`. The calm state is AwaitingWave — the "i-word" is banned project-wide.

### Sprint 2 — the island comes alive (this session)

- **Simulation review fixes:** Recovering appears immediately after help lands (AC2); buildings are read when the wave starts, not when the wave object is created; a wave cannot start while paused; the WaveResolving phase can no longer be skipped in one tick (real bug, found by a new test).
- **Test suite: 21 tests, all green** (10 original + 11 new): frame-step independence, Energy boost cost / speed / timer / one-per-building limit, exact phase order, WR6 upgrade and unlock refusals and costs, AC2 immediate Recovering, reward math pinned to the thresholds, Ocean View 1.5× weight, arrival schedule incl. the rush, moves allowed outside active waves and refused while paused, Satisfied at wave end and the "worst need" hint.
- **Game layer:** `GameController` (single owner of flow and player actions), `SaveSystem` (JSON autosave between waves only), `GameBootstrap` (builds everything in code).
- **3D blockout island** (`Assets/Scripts/Game/View/`): ocean, lagoon, sand, grass, plaza, dock, palms. Five distinct buildings; each shows its **seat count** (white pips, tinted while guests are seated), its **worker** (orange marker floating above the roof) and its **waiting line** (guest figures). A red pulsing ring marks a bottleneck, a yellow ring marks "catching up". Locked Pool and Bungalows show as construction sites whose marker turns orange once they can be bought. A boat brings each wave; guests walk from the dock to their building; some served guests stroll to the beach. Buildings are tappable.
- **Screens S1–S3** (`Assets/Scripts/Game/Ui/`): top bar (Resort Value, status, Coins, Energy), next-wave forecast, START WAVE, building action card between waves (level, seats, upgrade, unlock, move worker), wave needs panel (served/total, queue bar, status word, warnings, Speed Up, "All guests arrived", pause), worker bottom sheet that shows the cost of each move ("leaves Reception empty"), toasts, and a temporary result card (stars, satisfaction %, rewards, hint).
- **Symbols as images:** the built-in font has no ★ ⚡ ⚠, so stars, the energy bolt and the warning triangle are generated sprites.
- **Menus:** *Resort Empire → Create Game Scene* (rebuilds `Assets/Scenes/GameScene.unity`, first in Build Settings) and *Resort Empire → Reset Save (start a new game)*.
- **Verified in play mode** with screenshots: wave 1 ends Perfect with 458 Coins (matches the spec's numbers); in wave 2 the rush hits the empty Beach Bar, the line and red warning appear, the worker sheet moves the Restaurant worker, and the Beach Bar switches to "catching up" in the same moment.

---

## 2. Planned

### Rest of Sprint 2 (→ Nov 1)

- Hands-on playtest by the team on a desktop build: does the "empty building vs too-small building" difference read without explanation? (main prototype question, build doc §4.1)
- Touch check on a phone (tapping buildings through the UI on touchscreens is untested).

### Sprint 3 (Nov 2 – 15) — closing the prototype loop (Jira: 17 items)

- Real S4 Wave Complete (what went well / needs improvement, guests leaving as a picture of the result), S5 Upgrade Suggestion (before/after seats, cost, Later), S9 Area Unlock as a full-screen celebration (used twice).
- Sudden rush prompt in S2 (Move Worker here / Use Energy / Ignore).
- App shell per decision: Main Menu, Settings, load on start, no degradation / no offline income (FR-64/65).
- Validation FR-62 (5★ without Energy) is already automated by the WR8 test — keep it green.

### Release 2 — MVP (Sprints 4–5, Nov 16 – Dec 13) — summary

Lv4–5 buildings (+Materials), Reputation thresholds, Manager/Specialist/Worker hiring with 80% slot cap, VIP layer (S6–S8, 4 VIP types, Spa), infinite waves after W8, tutorial, comeback reward, monetization hooks (places only, no tuning).

---

## 3. Gaps / open questions

**Missing source documents** (referenced throughout the specs, not in the repo — ask the game designer):

- *First Session User Story Walkthrough* (US1–US21 — the UI handoff references these constantly)
- *Energy System Spec* (hard rules, cap, refund, Mode B)
- *Decision Log* (chronological decisions; several sections point to it)
- *Project rules* (pillars, non-goals, terminology §6)
- `wave_sim.py` (the economist's reference simulator; our NUnit WR7/WR8 tests play its role for now)
- `RESORT_EMPIRE_REQUIREMENTS_FINAL(2).md` (the 64-FR baseline the Product Backlog is derived from)

**Known inconsistencies**

- Two FR numbering systems: Jira backlog FR-01…69 vs Product Backlog FR-001…064. They do not map 1:1 — never mix them in one ticket.
- Jira includes Main Menu/Settings/Tutorial in the prototype; the Product Backlog explicitly excludes them. We follow Jira (user decision 2026-10-15) — confirm with the team.
- Figma mockup economy numbers are stale (Product Backlog Q-13): rewards ~120 Coins vs 1,200 Coin prices. Build document §4.8 is the tuning source of truth.
- VIP rating thresholds (3★ 50 / 4★ 70 / 5★ 90) are still on the old scale vs normal waves (40/55/70/80/90) — open MVP decision.

**Tuning observations for the economist** (from our simulation, not yet decided)

- Wave 2 with the default worker placement (Beach Bar empty) scores 70.3% — only 0.3 points above the 3★ line. The build doc's table expects about 4★ for passive play in wave 2. Worth re-checking `service_time` / `utilization_empty` against WR7.
- The bottleneck "growing for 3 s" clock counts time since the queue last shrank, so a queue bouncing between 4 and 5 can warn ~3 s after its last drop. The spec text allows either reading.
- Results differ by about 0.5 satisfaction points between 0.01 s and 0.1 s simulation steps (seats fill at step boundaries). Well inside the tolerance, but exact numbers shift slightly with the step size.
- `DemandTotal()` of a *locked* need reports the scripted number while spawning nothing; the UI hides locked needs, so players never see it. The spec is silent.

**Technical debt / not done yet**

- `Assets/Documentation/` should move out of `Assets/` (Unity imports PDFs/ODS as assets needlessly).
- No CI, no Android build yet (target platform still desktop; switch and device test planned before end of Sprint 3).
- Building taps use `EventSystem.IsPointerOverGameObject()` to ignore taps on UI; on touchscreens this may need the touch-id overload — verify on a device.
- The OnGUI `DebugWaveRunner` from Sprint 1 is now superseded by the real screens; keep it as a dev tool or delete it in Sprint 3.
- Economy values are all `TUNING` defaults — the two most sensitive (`service_time` 12 s, `utilization_empty` 0.33) must be re-verified by simulation after any change (build doc hard rule).
- Open tuning questions Q-03…Q-11 from the Product Backlog remain with the economist/designer.

---

## 4. Current build status

*(updated at end of each session, newest first)*

- **2026-10-20 — Sprint 2 GREEN.** Zero compile errors. **21/21 EditMode tests pass.** Game scene generated and played: S1 home, wave panel, worker sheet and result card all verified with screenshots, including the full bottleneck → worker move → "catching up" sequence in wave 2. Save file reset so the next Play starts a new game. Committed on `dev-beta`.
- **2026-10-15 — Sprint 1 GREEN.** Sim assembly and first 10 tests (WR1, WR3, WR5, WR7, WR8, WR9, AC2, pause, rush, rewards) passing; committed as `a30047f`.
