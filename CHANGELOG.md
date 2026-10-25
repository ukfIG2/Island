# Changelog

One entry per release; each sprint ends with a release tagged on `main`.

## v0.1.0 — Sprint 1 (5. 10. – 18. 10. 2026)

### Done

Sprint goal: *the wave simulation works and is tested, shown on a simple 3D island.*

| Jira | Item | What was delivered |
|---|---|---|
| CAM-69 | Project setup | Unity 6 URP project, Git Flow repo (`main`, `develop`, feature branches per Jira issue), landscape-only player settings, project rules; project documents kept out of git. |
| CAM-23 | Wave simulation | Pure C# simulation (`Assets/Scripts/Sim/`, no UnityEngine): phases AwaitingWave → WaveIncoming → WaveActive → WaveResolving → WaveComplete plus pause; gradual arrivals; seats and queues per need; Worker effect on service speed; Bottleneck / Recovering / Satisfied states; locked needs never spawn; the 8-wave table with the wave-2 Sudden rush. All numbers in `TuningConfig`. |
| CAM-37 | Satisfaction and rating | Satisfaction from waiting time with the unit and wave floors, 1★–5★ / Perfect, Coins, Energy and Resort Value rewards applied exactly once. The number is never shown during a wave. Debug runner (OnGUI panel) to play waves in the editor. |
| CAM-17 | Simple island | Blockout island built in code from primitives: Reception, Restaurant and Beach Bar; Pool and Bungalows as construction sites that turn into buildings when unlocked; buildings grow with their level; Worker markers; red / yellow rings for Bottleneck / Recovering during a wave. |
| CAM-70 | Simulation tests | 23 EditMode tests for the hard wave rules WR1–WR9 and the main flows (phases, arrivals, Workers, pause, Energy boost, upgrades and unlocks, rewards, the WR7 / WR8 balance checks). |

How to see it: open `Assets/Scenes/SampleScene` and press Play. How to test: Test Runner → EditMode → Run All.

### Next: Sprint 2 (19. 10. – 1. 11. 2026)

The island comes alive: Vadzim's 3D island model replaces the blockout ground (CAM-85); start the wave with
the boat, guests walking and queuing, the Wave Needs Panel (S2) with warnings that name the cause, the
Worker Allocation sheet (S3), top bar and forecast; the first playtest.

### Known gaps

- The debug runner is a developer tool; the real game screens start in Sprint 2.
- Missing source documents to ask the designer for: Decision Log, Energy System Spec, First Session User
  Story Walkthrough, Project rules, `wave_sim.py` (the WR7 / WR8 tests play its role for now).
- Scope the Jira plan and the Product Backlog disagree on (Main Menu, Settings, Tutorial, endless waves) —
  team decision planned in Sprint 2.
