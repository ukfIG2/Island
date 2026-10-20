# Resort Empire — Project Status

Last updated: **2026-10-20** — prototype (Sprints 1–3) and MVP (Sprints 4–5) feature sets are built; next step is playtesting and the designer's review. MVP decisions — what the spec decided, what we chose provisionally, what is still open — are in [MVP_DECISIONS.md](MVP_DECISIONS.md).

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

### Sprint 3 — closing the prototype loop (this session)

- **S4 Wave Complete:** stars, satisfaction % (the only place the number appears), needs served, rewards with icons, *What went well* / *Needs improvement*, and a soft line about guests who left. The "needs improvement" line now answers the prototype's main question — **empty or too small?** — e.g. "Beach Bar was without a worker while its line grew" vs "had too few seats for the crowd" (new sim result `WorstNeedCause`).
- **Leaving guests:** after the wave, 0–8 guest figures (by stars) walk from the plaza to the dock — a picture of the result, no mechanical effect.
- **S5 Upgrade Suggestion** after S4: recommends the building behind the worst queue, shows seats before → after, +20 Resort Value, cost; "Missing: N Coins" when unaffordable; Later.
- **S9 Area Unlock** as a full-screen celebration: Pool after wave 3 (turquoise), Bungalows after wave 6 (sunset, "Your resort is growing again!"), each stating "Includes: 1 Worker". If skipped, tapping the construction site reopens it.
- **Sudden rush prompt** in the wave panel: "Sudden rush at Beach Bar!" with Move Worker here / Speed Up / Ignore; the wave never pauses.
- **App shell** (kept per decision): main menu over the live island (Play / Continue, New Game, Settings), settings (Sound, Music, Reset progress with confirmation), in-game Menu button with a pause menu (Resume, Settings, Main Menu).
- **Resort Value** now also grows with upgrades (+20) and unlocks (+50) and never decreases.
- **Tests: 29, all green** (8 new: bottleneck cause, rush observability incl. pause, Resort Value gains and monotonicity, upgrade/unlock prices and eligibility).
- **Full play-through verified in play mode**, waves 1 → 8: S4/S5/S9 flow, both unlocks, rush prompt, pause menu, settings, prototype-complete screen, and "Start over" reloading into a fresh game. No errors or warnings in the console during the whole run.

### MVP Sprint 4 — economy, staff, levels, endless waves (committed `6e4f439`)

- **Two configurations:** `TuningConfig.Default` is the MVP; `TuningConfig.Prototype` keeps the prototype rules, and the prototype rule tests (WR1–WR9) run against it.
- **New currencies:** Reputation (threshold unlocks, never decreases), Materials (Lv4–5 upgrades, VIP Fix), Gems (premium, shown but unused) — all in the top bar with their own icons.
- **Building levels 4–5:** more worker slots and a quality tier, paid with Coins + Materials.
- **Staff:** hire Managers (one per building, ×1.2 service), Specialists (Butler, Captain — for VIPs) and extra Workers (80 % slot cap, diminishing returns). New Staff screen; the building card hires too; the post-wave suggestion is now the spec's three-way choice (upgrade / hire Manager / hire Worker).
- **Unlocks** by Reputation (Pool 10, Bungalows 30, Spa 45) instead of wave numbers.
- **Endless waves** after wave 8 (generated, +6 % per wave, a rush every 3rd wave).
- **Welcome-back gift** after 12 h away, **first-session tutorial** (5 hints, skippable), **test "Watch ad" button** for Energy.
- **Save format v2** (old prototype saves are migrated).
- **Simulation for the VIP layer** is complete and tested (12 tests); its screens are Sprint 5.
- **Tests: 59, all green.** Verified in play mode: top bar, tutorial, building card, Staff screen, three-way suggestion with a real hire, Lv5 visuals.

### MVP Sprint 5 — VIP layer, Spa, decor, shop (this session)

- **VIP flow:** an offer arrives after waves 4, 7, 10, … and waits on the home screen as a small chip (never forced). **S6 preview card**: guest, difficulty, every request with Good / Risky — roster gaps such as "No Chef yet: max 3 stars" are visible *before* accepting — reward ranges, Open Requests / Maybe later / Decline.
- **S7 request board** (right panel, island stays visible): satisfaction bar with the star thresholds, request cards with Fix (spends Materials), Quality boost (Energy Mode B), Speed Up, the optional bonus, rewards preview, SERVE ALL. During a wave a "VIP" tab switches the right panel between the wave and the VIP — the wave keeps running.
- **VIP services run on real time**, also while the app is closed (saved and caught up on load, max 6 h).
- **S8 VIP result** on the S4 template in VIP colors, Reputation first in the rewards.
- **Spa** (VIP building, no seats/workers) with its own unlock screen; **decor** rewards appear on the island; **Shop** placeholder with the three spec packs as "Coming soon".
- **Verified in play mode:** first VIP (Maya, Travel Blogger) offered after wave 4, accepted, two items fixed with Materials, served, completed — 5★ at 90 %, +30 Reputation (enough to open the Bungalows gate).

---

## 2. Planned

### Prototype playtest (now — before starting the MVP)

The prototype exists to answer one question: *is the wave loop fun?* (build doc §4.1, exit criteria §4.12). Before building MVP features:

- Playtest with real people on a desktop build and watch for the exit criteria: does the player move a worker to a bottleneck **without being told**; can they tell "building is empty" from "building is too small"; does the unlock create the wish to continue?
- Touch check on a phone (Android build) — tapping buildings through the UI on touchscreens is untested.
- Instrument the metrics the build doc lists (wave_complete_rate, worker moves before/during waves, drain duration, rating distribution, upgrade take rate, session length) if the team wants numbers rather than observation.

### After the MVP build

- Playtest prototype and MVP with real players; the build doc's exit criteria (§4.12 and §5.9) are the checklist.
- Designer and economist review [MVP_DECISIONS.md](MVP_DECISIONS.md): confirm or overrule the provisional choices, decide the open points.
- Android build and a touch check on a phone.
- Small UI polish found in testing: VIP buttons show costs as words ("· 2 Materials") rather than icons.

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
- A full passive run (default placement, one Beach Bar upgrade, both unlocks, no worker moves) scored W1 Perfect, W2 3★, W3 4★, W4 5★, W5 4★, W6 4★, W7 4★, W8 3★ — close to the build doc's "no intervention" column (Perfect, 4★, 4★, Perfect, 4★, 4★, 5★, 3★). Wave 2 is the one clearly below the design intent.
- The spec's status machine shows "catching up" whenever a queue shrinks — including at an *unstaffed* building after its peak. In wave 2 the player can see "Beach Bar is catching up" without having done anything. Spec-correct, but may confuse playtesters; designer to decide.

**Technical debt / not done yet**

- `Assets/Documentation/` should move out of `Assets/` (Unity imports PDFs/ODS as assets needlessly).
- No CI, no Android build yet (target platform still desktop; switch and device test planned before end of Sprint 3).
- Building taps use `EventSystem.IsPointerOverGameObject()` to ignore taps on UI; on touchscreens this may need the touch-id overload — verify on a device.
- The OnGUI `DebugWaveRunner` from Sprint 1 is superseded by the real screens; keep it as a dev tool or delete it.
- Sound and Music settings are stored (PlayerPrefs) but there is no audio in the game yet.
- Speed Up at 0 Energy is simply hidden; the spec's "watch an ad for Energy" offer belongs to the MVP monetization hooks.
- Economy values are all `TUNING` defaults — the two most sensitive (`service_time` 12 s, `utilization_empty` 0.33) must be re-verified by simulation after any change (build doc hard rule).
- Open tuning questions Q-03…Q-11 from the Product Backlog remain with the economist/designer.

---

## 4. Current build status

*(updated at end of each session, newest first)*

- **2026-10-20 13:00 — MVP Sprint 5 GREEN.** VIP code compiled clean on first try, 59/59 tests, full VIP visit verified in play mode. Save and tutorial flags reset. Committed on `dev-beta`. The MVP feature set is built; numbers are provisional (see MVP_DECISIONS.md).
- **2026-10-20 — MVP Sprint 4 GREEN.** 59/59 tests, compiled clean, play-mode checks done; committed as `6e4f439`.
- **2026-10-20 — Sprint 3 GREEN.** Zero compile errors, **29/29 tests pass**, full 8-wave play-through verified with screenshots, no console warnings. Save reset. Committed on `dev-beta`.
- **2026-10-20 — Sprint 2 GREEN.** Zero compile errors. **21/21 EditMode tests pass.** Game scene generated and played: S1 home, wave panel, worker sheet and result card all verified with screenshots, including the full bottleneck → worker move → "catching up" sequence in wave 2. Save file reset so the next Play starts a new game. Committed on `dev-beta`.
- **2026-10-15 — Sprint 1 GREEN.** Sim assembly and first 10 tests (WR1, WR3, WR5, WR7, WR8, WR9, AC2, pause, rush, rewards) passing; committed as `a30047f`.
