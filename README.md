# Resort Empire — Web Gameplay Prototyping Lab

This branch preserves the development history of the browser-based
Resort Empire prototyping laboratory.

The web prototype was used to develop and test gameplay mechanics,
simulation rules, progression, and spatial navigation before those
concepts were independently implemented in the team's Unity project.

This is a separate technical prototype, not the Unity application
or a production release.

## Implemented areas

- Game state, wave lifecycle, progression, economy and upgrades
- Workers, managers, specialists and VIP mechanics
- Gameplay interface and persistence
- Resort world visualization and spatial navigation
- PMO navigation graphs, transitions, bridges and lifts
- Guest pathfinding, pedestrian traffic and crowd simulation
- Automated gameplay, integration and simulation tests

## Technology

- TypeScript
- React
- Vite
- Three.js / React Three Fiber
- Vitest

## Local verification

At the November 7, 2026 development snapshot:

- Vitest: 153 test files passed; 549 tests passed
- TypeScript: `tsc --noEmit` completed successfully

These results validate the tested source-code snapshot.
They do not constitute a production release or visual acceptance
of the complete 3D environment.

## Development commands

Install dependencies:

    npm ci

Run tests:

    npm test

Check TypeScript:

    npx tsc --noEmit

Start the development server:

    npm run dev

## Asset and release limitations

The original island GLB model is not distributed in this branch.
Some 3D views depend on `/models/cascade-isle-v2.glb` and therefore
cannot be reproduced without an appropriately licensed asset.

SVG world illustrations with unverified redistribution rights
have also been excluded.

The Vite configuration intentionally blocks production builds
pending asset-rights clearance and release authorization.

This repository is provided as a development and testing record,
not a complete distributable game.

## Relationship to the Unity project

The web implementation and the Unity implementation have separate
source-code histories. The Unity project is not a direct wrapper
around this web application.

The purpose of this branch is to preserve the web prototyping
work and its actual Git development history.