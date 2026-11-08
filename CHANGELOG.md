# Changelog

One entry per release; each sprint ends with a release tagged on `main`.

## v0.2.0 — Sprint 2 (26. 10. – 9. 11. 2026)

### Done

Sprint goal: *the island comes alive: the web version's look remade in full, the Wave Needs Panel (S2) and
moving Workers (S3); plus the building card, Speed Up and autosave pulled in from Sprint 3.*

The game now has its own scene and real screens instead of the Sprint 1 debug runner, on Vadzim's 3D island
from the web version.

#### Game screens

| Jira | Item | What was delivered |
|---|---|---|
| CAM-24 | Start the wave | Game scene (`Assets/Scenes/GameScene`) and a game controller that runs the simulation; one START WAVE button between waves; the wave panel opens beside the island. |
| CAM-18 | Top bar | Resort Value, resort status, Coins and Energy, with star, bolt and coin icons. |
| CAM-19 | Wave forecast | Each need of the next wave with its guest count; locked needs and the wave-2 rush stay hidden. |
| CAM-20 | Building status | Buildings grow with their level and show their seats filling while guests are served; a Worker marker above staffed buildings; the waiting line in front of each building. |
| CAM-29 | Wave Needs Panel (S2) | One row per open need: served / total, queue bar and status word. |
| CAM-30 | Bottleneck warning | Red warning line and ring when a line keeps growing, yellow once it catches up, none when all is well; a short guest-voice note. |
| CAM-31 | Queue cause | The simulation names why a line grows (no Worker or too few seats), and the warning says what the line needs. |
| CAM-26 | Guests walk | Arriving guests walk to their building's line; some served guests stroll to the beach. |
| CAM-34 | Worker sheet (S3) | Opens from a need row or by tapping a building: target, current Workers, close. |
| CAM-35 | Move a Worker | One tap moves the Worker, before or during a wave, instantly and for free (WR5). |
| CAM-36 | Move feedback | A note after every move; the sheet shows which building a move leaves empty; a refused move says so. |
| CAM-21 | Building card | Between waves: level, seats, upgrade, unlock and Move Worker, with a banner for a new area; upgrades and unlocks are refused during a wave (WR6). |
| CAM-47 | Speed Up | Speed Up for Energy on the panel row of an overloaded building. |
| CAM-25 | Wave end | The panel says when all guests have arrived and the wave runs on until every line is empty; a result card with stars, satisfaction and rewards; Continue opens the next wave. |
| CAM-33 | Workers keep their places | Test: Workers keep their places across a wave and through saving and loading. |
| CAM-52 | Autosave | A save after every change between waves and resume on launch; an unreadable save starts a new game; *Resort Empire > Reset Save* in the editor. |
| CAM-32 | Ocean View | The Bungalows read as the premium stay: Premium tag in the forecast and panel, note on the card. |

#### The web version's look (sub-tasks in brackets)

| Jira | Item | What was delivered |
|---|---|---|
| CAM-85 | Island model (CAM-91–93) | Vadzim's island model imported as it is with glTFast 6.14.1 and placed as in the web version; the blockout ground is gone. Buildings stand on his plots: Reception `building_1`, Restaurant `building_8`, Beach Bar `building_5`, Pool `building_6`, Bungalows `building_7`; `building_9` is kept for the Spa, plots 2–4 stay free. |
| CAM-86 | Buildings, bridges, stairs (CAM-95–97) | Stairs, bridges, landings and lifts from the web's own data; Restaurant and Beach Bar as the web's open huts; Reception, Pool and Bungalows as his props with his state ring, which turns red or yellow during a wave. |
| CAM-87 | Ocean and light (CAM-98–101) | The web's ocean: moving waves, deep-to-shallow colour, sun glint, foam and a soft coastline; sky, light and sea colours change with each wave; tropical rain in the rainy waves. |
| CAM-88 | Guests, Workers, boats (CAM-102–105) | Guests follow the web's routes over the paths and ride the lifts, bigger and in their need colours; Workers walk the paths when moved; each wave's guests arrive by its own vessel (shuttle, speedboats, ferry or seaplane). |
| CAM-90 | Island camera | Orbit view like the web: drag to turn, pinch or mouse wheel to zoom; a tap selects only when it did not drag; a Reset view button. |

Paths, routes, plots and the coastline come from Vadzim's own layout code, exported by
`Tools/WebExport/export-island-paths.mjs`; run it again if his map changes.

#### Phone build

| Jira | Item | What was delivered |
|---|---|---|
| CAM-106 | Bug: the phone build showed a bare island | The lit material now ships with the game, and `Assets/link.xml` keeps the parts the island is built from. |
| CAM-107 | Android build setup | Only GameScene goes into the build; Android batching; render pipeline upgrades; build folders ignored. |

How to see it: open `Assets/Scenes/GameScene` and press Play (the Sprint 1 debug runner stays in
`SampleScene`). How to test: Test Runner → EditMode → Run All (25 tests). App version 0.2.0, Android version
code 2.

### Still open from Sprint 2

- CAM-94 Phone check: build the APK from `main` and check the island runs smoothly. The model (668k triangles,
  three 2048 textures) is reduced only if the phone needs it.
- CAM-90: turning, zooming and tapping were checked only in the editor; they still need a real mouse and a
  finger on the phone.
- CAM-71 Playtest: does a new player find the bottleneck and tell Worker vs capacity apart.
- CAM-72 Team decision on the scope the two backlogs disagree on (Main Menu, Settings, Tutorial, endless waves).
- CAM-73 Collect the missing source documents.

### Next: Sprint 3

Close the prototype loop: result (S4), upgrade (S5), area unlock (S9), Energy sources and the Sudden rush, and
the app shell (main menu, settings, pausing when the app is left).

### Known gaps

- Speed Up says "Speeding up" instead of counting down seconds (the game shows no countdowns).
- Leaving the app during a wave does not pause it yet (CAM-53, Sprint 3).
- Phone performance of the full-detail island is unknown until CAM-94.

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
