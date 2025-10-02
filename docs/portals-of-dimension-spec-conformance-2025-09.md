# Portals of Dimension – September 2025 Spec Conformance Digest

This digest traces each requirement from the "Comprehensive Analysis and Enhancement Specifications" back to the production code now living in the Infinite Rails sandbox. Use these callouts to confirm that the live prototype delivers the Minecraft-inspired loop that was requested.

## Initialization and Onboarding
- `SimpleExperience.start()` bootstraps the session: it seeds the scene, generates the island, spawns loot chests, and kicks off the render loop while hiding the landing modal for an immediate fullscreen reveal.【F:simple-experience.js†L761-L795】
- The briefing overlay, pointer hint, and pointer-lock onboarding state machine fade in for five seconds so players learn WASD/mouse/touch controls without losing immersion.【F:simple-experience.js†L817-L914】
- `setupScene()` provisions an orthographic first-person camera, hemisphere/directional lighting, ambient fill, and world groups, logging “Scene population check fired — validate terrain, rails, portals, mobs, and chests render correctly. Re-run asset bootstrap if visuals are missing.” when the render surface is ready.【F:simple-experience.js†L1460-L1540】

## Core Gameplay Loop
- `buildTerrain()` procedurally sculpts a 64×64 voxel island, caches column metadata, and reports both column and voxel counts (`World generation summary — … columns created`) so telemetry can validate the 4,096-block target.【F:simple-experience.js†L2966-L3043】
- Rails, loot chests, and Netherite challenge scaffolding are instantiated through `buildRails()`, `spawnDimensionChests()`, and the collapse handlers, ensuring traversal set-pieces appear immediately.【F:simple-experience.js†L3151-L3339】
- First-person locomotion, pointer-lock yaw, gravity, jump buffering, and mobile joystick routing are all performed in `updateMovement()` each frame, aligning with the requested WASD + touch parity.【F:simple-experience.js†L4407-L4473】
- Mining and placement rely on raycasts from the camera; `mineBlock()` and `placeBlock()` remove/add voxels, update inventory, apply score deltas, and trigger screen shake + audio cues.【F:simple-experience.js†L4873-L4972】

## Entities, Combat, and Survival Feedback
- Zombie and golem lifecycle management (spawning, chasing, defending) plus respawn handling integrate with the combat fallbacks, guaranteeing health deductions and five-hit defeat thresholds are honoured.【F:simple-experience.js†L2714-L3128】【F:simple-experience.js†L4860-L4871】【F:script.js†L159-L204】
- HUD refreshes rebuild the heart strip, bubble meter, and score breakdowns every frame, while the portal progress label swaps messaging based on activation, countdowns, or victory state.【F:simple-experience.js†L5680-L5786】

## Crafting, Inventory, and UI Responsiveness
- Inventory and hotbar synchronisation lives alongside the crafting modal workflow in the same class, keeping the 10-slot hotbar, drag-and-drop crafting lane, and recipe unlock scoring loop in sync with every frame update.【F:simple-experience.js†L2199-L2357】【F:simple-experience.js†L4286-L4419】
- Dimension overlays list objectives/tasks, with celebratory confetti fired when milestones are marked complete, satisfying the UX polish requirements from the spec.【F:script.js†L1600-L1669】

## Portals, Dimensions, and Progression
- Portal frame validation, interior clearing, shader ignition, and dimension advancement are handled by `ignitePortal()`, `activatePortal()`, and `advanceDimension()`, wiring in the sequential unlock order and Netherite boss collapse timers.【F:simple-experience.js†L3681-L3880】【F:simple-experience.js†L4031-L4094】
- The Netherite finale triggers collapsing rails, Eternal Ingot collection, and victory celebrations while preserving inventory snapshots for respawns.【F:simple-experience.js†L3330-L3427】

## Backend Sync, SSO, and Leaderboard
- Scoreboards fetch from `APP_CONFIG.apiBaseUrl + '/scores'`, merge remote entries, and refresh UI state; offline mode falls back to local entries while still surfacing status copy to players.【F:simple-experience.js†L946-L1052】
- Score updates, leaderboard hydration, and local snapshots are routed through `updateLocalScoreEntry()` to keep DynamoDB and local storage aligned.【F:simple-experience.js†L1054-L1079】
- `script.js` exposes shared scoreboard and combat helpers globally so the advanced shell and the simple sandbox stay in lockstep, ensuring score formatting and zombie strike math match the original brief.【F:script.js†L83-L204】
- Identity capture, Google SSO, and location labelling persist profile details and rehydrate them on load, giving the leaderboard proper attribution without blocking offline play.【F:script.js†L800-L918】【F:script.js†L1036-L1148】

## Performance, Audio, and Polish
- The audio controller wraps Howler.js samples (mining crunch, zombie groan, portal effects) with alias support so missing assets degrade gracefully while keeping playback under a single interface.【F:simple-experience.js†L2188-L2260】
- The render loop uses a `THREE.Clock` delta, applies frustum culling, updates scoreboard polling, and renders at the end of each frame, anchoring the 60 FPS target.【F:simple-experience.js†L3926-L4404】
- Victory sequences, leaderboard share buttons, and footer summaries keep the polish layer responsive, with automatic score sync scheduling whenever major milestones trigger.【F:simple-experience.js†L4204-L4525】【F:simple-experience.js†L3926-L4084】

Refer back to `docs/coding-agent-prompts.md` for the ready-made prompts that generated these systems whenever you need to extend the sandbox further.【F:docs/coding-agent-prompts.md†L1-L66】
