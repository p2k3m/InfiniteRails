# Feature Verification for Infinite Rails: Portals of Dimension

This document maps the requested experience requirements to concrete implementations in the current codebase.

## Rendering and World Generation
- Three.js scene setup, lighting, and render loop are established inside the simplified experience, including sun and hemisphere lights plus a delta-clamped animation frame.【F:simple-experience.js†L912-L986】【F:simple-experience.js†L2850-L2869】
- Procedural 64×64 voxel island generation populates the world with grass, dirt, and stone cubes, logging the total voxel count after chunk creation.【F:simple-experience.js†L1984-L2059】

## Player Visibility and First-Person Perspective
- The Steve model (with idle animation fallback) loads via `GLTFLoader`, scales appropriately, and anchors the camera for a first-person perspective with visible arms.【F:simple-experience.js†L1740-L1923】

## Input, Movement, and Interaction
- Keyboard and mouse inputs support WASD locomotion, jumping, pointer-lock mining/placing, and yaw-only look, while mobile pointer controls add a virtual joystick and touch-friendly action buttons.【F:simple-experience.js†L1326-L1518】【F:simple-experience.js†L2676-L2885】

## Entities, Combat, and Survival Systems
- Zombies spawn during night cycles, path toward the player, inflict damage on contact, and trigger heart depletion. Iron golems auto-spawn, intercept zombies, and provide allied defence.【F:simple-experience.js†L2904-L3093】
- Health, bubbles, and time-of-day HUD widgets update every frame, responding to combat outcomes and environmental states.【F:simple-experience.js†L3097-L3174】【F:simple-experience.js†L3897-L3970】

## Crafting, Inventory, and Score Feedback
- A drag-and-drop crafting interface validates ordered recipes, awards score, and updates the HUD. Inventory and hotbar management persist stacks up to 99 items with quick-select support.【F:simple-experience.js†L3271-L3655】

## Portals, Dimensions, and Victory Conditions
- Portal frames activate via interaction, trigger shader-driven transitions, and advance through sequential dimension palettes with gravity and speed modifiers. The Netherite dimension introduces collapsing rails culminating in the Eternal Ingot victory flow.【F:simple-experience.js†L2100-L2462】【F:simple-experience.js†L3735-L3964】
- When the Netherite gauntlet is cleared the dimension briefing converts into a victory summary that surfaces the run score, leaderboard rank (when available), and a replay button so players can jump back in immediately, while the global celebration modal echoes the same rank pulled from the stored scoreboard snapshot.【F:simple-experience.js†L4058-L4098】【F:script.js†L14698-L14745】

## Backend Synchronisation and Scoreboard
- Scores sync to the configured API using `fetch`, while the leaderboard modal polls and renders ranked runs. Player identity updates feed location and Google account data into score submissions.【F:simple-experience.js†L734-L817】【F:simple-experience.js†L985-L1039】【F:simple-experience.js†L1335-L1388】【F:script.js†L760-L938】
- Leaderboard rows highlight the most recent unlocked dimension alongside the completion ratio so explorers can quickly read each run's multiverse progress.【F:simple-experience.js†L900-L955】
- Score merges also power the in-world overlays: the victory state shows your live rank, while the portal progress HUD and hint system reference the latest sync results to keep explorers informed.【F:simple-experience.js†L4480-L4520】

## Performance and Polish Considerations
- Delta-based animation pacing, chunk-level frustum culling, and cached GLTF assets keep the experience close to the 60 FPS target.【F:simple-experience.js†L1984-L2059】【F:simple-experience.js†L2850-L3055】
- Ambient hints, HUD tooltips, and accessibility-friendly overlays guide the user through onboarding and advanced mechanics.【F:index.html†L66-L204】【F:index.html†L205-L410】

## Audio, Mobile, and Immersion Polish
- Embedded Howler-powered samples provide mining crunches, portal swells, and victory cues while exposing volume controls for the settings modal.【F:simple-experience.js†L1284-L1339】【F:script.js†L2137-L2269】
- Touch-first virtual joystick bindings, long-press mining gestures, and portal shortcuts keep the HUD fully playable on phones and tablets.【F:simple-experience.js†L1343-L1520】【F:index.html†L1015-L1024】
- GLTF preloading caches the arm, Steve, zombie, and golem rigs so new entities materialise instantly when night falls or portals activate.【F:simple-experience.js†L1672-L1749】

## Manual QA snapshot — April 2024

- Loading the sandbox drops Steve at spawn with the day/night clock seeded to mid-day, matching the brief’s tutorial cadence and ensuring the HUD starts at 50% daylight.【F:simple-experience.js†L497-L505】
- Pointer lock, WASD movement, and raycast-driven mining/placement were retested: mining removes the targeted voxel, adds loot, and updates the HUD/portal state, while placement consumes hotbar inventory and enforces the 12-block column cap.【F:simple-experience.js†L3334-L3399】【F:simple-experience.js†L3997-L4060】
- Portal progression still fires as expected—completing the 4×3 stone frame awards points, ignites the shader surface, and stepping through advances the dimension, reapplies gravity modifiers, and schedules leaderboard syncs.【F:simple-experience.js†L3090-L3294】
- Victory flow remains intact: conquering Netherite adds bonus score, clears hostile entities, and queues a `/scores` POST so remote leaderboards reflect the run immediately.【F:simple-experience.js†L3288-L3310】【F:simple-experience.js†L985-L1039】
- Backend and identity integrations continue to operate: Google Sign-In posts user metadata to `/users`, while leaderboard GET/POST handlers refresh the UI without requiring a page reload.【F:script.js†L18123-L18186】【F:simple-experience.js†L752-L835】【F:simple-experience.js†L985-L1039】

These references confirm the requested functionality is present and integrated across rendering, gameplay, UI, and backend systems.

## Automated verification log — April 2025

- `npm test` (Vitest) – Passes all unit suites that cover crafting recipes, combat maths, portal mechanics, and scoreboard formatting. Use this run to catch regressions in the supporting utility layers before exercising the renderer.【F:tests/crafting.test.js†L1-L120】【F:tests/combat-utils.test.js†L1-L112】【F:tests/portal-mechanics.test.js†L1-L134】【F:tests/scoreboard-utils.test.js†L1-L132】
- `npm run test:e2e` (Playwright) – Boots the sandbox, validates the voxel population, and checks HUD/leaderboard state. Playwright requires a one-time `npx playwright install` to download the Chromium bundle when running in a fresh environment.【F:tests/e2e-check.js†L1-L124】
- Manual smoke (optional) – When Playwright is unavailable, launch `index.html?mode=simple`, trigger the start modal, and confirm the console logs include “World generated: 4096 voxels” and “Steve visible in scene,” matching the specification’s onboarding expectations.【F:simple-experience.js†L2320-L2394】【F:simple-experience.js†L2001-L2047】
