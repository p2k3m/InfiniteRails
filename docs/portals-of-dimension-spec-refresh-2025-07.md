# Portals of Dimension — July 2025 Specification Refresh

This memo cross-references the "Comprehensive Analysis and Enhancement Specifications" pointers against the shipped sandbox experience (`simple-experience.js`). Each subsection lists the exact source modules and line ranges that satisfy the review items.

## Rendering, Lighting, and World Generation
- **Three.js bootstrap & camera** – `setupScene()` creates the `Scene`, `OrthographicCamera`, pointer-locked player rig, and renderer with ACES tone mapping and hemisphere/directional lights that orbit to simulate the day/night cycle.【F:simple-experience.js†L1417-L1497】【F:simple-experience.js†L4331-L4543】
- **Procedural 64×64 island** – `buildTerrain()` clears prior chunks, regenerates 4,096 voxel columns (grass/dirt/stone), tracks chunk bounds for frustum culling, and logs block totals for debugging.【F:simple-experience.js†L2911-L2992】
- **Rail spine & boss hooks** – `buildRails()`, `evaluateBossChallenge()`, and the Netherite collapse loop animate procedural rails, schedule chunk collapses, and drive the Eternal Ingot victory objective.【F:simple-experience.js†L3120-L3377】

## Player Avatar, Input, and Responsiveness
- **Steve first-person rig** – `loadPlayerCharacter()` attaches the camera to the GLTF head bone, falls back to a skinned cube, applies idle AnimationMixer clips, and parents first-person hands for visible mining arms.【F:simple-experience.js†L2722-L2813】
- **Pointer lock & input loop** – `handleMouseMove()`, `handleKeyDown()`, and `updateMovement()` wire WASD, jump physics, yaw-only mouse look, Set-based key tracking, joystick/touch buttons, and ground snapping with gravity scaling per dimension.【F:simple-experience.js†L4187-L4405】
- **Mobile support** – `initializeMobileControls()` enables the virtual joystick, touch-look gestures, and jump buttons when coarse pointers are detected, keeping mobile parity with desktop controls.【F:simple-experience.js†L2254-L2274】

## Survival Systems, Entities, and Feedback
- **Zombies & iron golems** – The nightly spawn loop upgrades placeholder meshes with GLTFs, pathfinds toward the player, applies collision damage, and spawns iron golems that intercept nearby zombies with cooldown-limited knockbacks.【F:simple-experience.js†L4580-L4758】
- **Health, respawn, and HUD** – `damagePlayer()` drains hearts, triggers screen shake + audio, and respawns after five hits while refreshing hearts/score/portal progress in `updateHud()`.【F:simple-experience.js†L4771-L5578】
- **Ambient audio & haptics** – `createAudioController()` wraps Howler samples with alias resolution, volume controls, and randomised playback for mining crunches, portal ignition, and victory stingers.【F:simple-experience.js†L2133-L2245】

## Crafting, Inventory, Portals, and Progression
- **Sequenced crafting & inventory** – The recipe map, satchel/hotbar aggregation, and crafting UI refresh pipeline validate ordered inputs, update slot counts, and persist unlocks to localStorage for cross-session recipes.【F:simple-experience.js†L1663-L1725】【F:simple-experience.js†L5080-L5159】
- **Mining, placement, and drops** – Raycast-based `mineBlock()` and `placeBlock()` mutate voxel columns, award score, feed the inventory, and update portal-frame validation for 4×3 structures.【F:simple-experience.js†L4800-L4860】
- **Portal activation & dimension hops** – `ignitePortal()` consults the shared mechanics module, animates shader portals, and `advanceDimension()` re-themes palettes, adjusts gravity, rebuilds terrain/rails, and syncs score bonuses per dimension.【F:simple-experience.js†L3795-L4033】

## Backend Sync, Identity, and Leaderboards
- **DynamoDB/API integration** – `loadScoreboard()` and `flushScoreSync()` GET/POST leaderboard entries, merge results via `ScoreboardUtils`, and surface status copy in the leaderboard modal.【F:simple-experience.js†L903-L979】【F:simple-experience.js†L1341-L1396】
- **Google SSO & identity persistence** – `restoreIdentitySnapshot()` and `persistIdentitySnapshot()` mirror Google IDs, display names, and geolocation badges across sessions, feeding scoreboard identifiers and HUD labels.【F:simple-experience.js†L1731-L1782】
- **Location & score telemetry** – Auto geolocation capture, session summaries, and debug exports keep the DynamoDB schema populated while `exposeDebugInterface()` exposes hooks for automated validation.【F:simple-experience.js†L1785-L1805】【F:simple-experience.js†L5704-L5719】

## Performance, UI Polish, and Victory Flow
- **Frustum culling & asset budgets** – Terrain chunk bounding spheres, culling intervals, and asset load timers protect the 60 FPS budget and log overruns for profiling.【F:simple-experience.js†L4487-L4521】【F:simple-experience.js†L1528-L1577】
- **HUD dynamism & accessibility** – Portal progress labels, dimension info cards, and footer states respond to portal readiness, Netherite countdowns, and victory screens for immediate player feedback.【F:simple-experience.js†L5560-L5701】
- **Victory & failure states** – Netherite collapse handling, Eternal Ingot collection, and the final `triggerVictory()` sequence deliver the run summary, confetti, and replay hooks expected by the brief.【F:simple-experience.js†L3325-L3377】【F:simple-experience.js†L3971-L4050】

All major critique points from the review—render loop, avatar visibility, responsive input, survival NPCs, crafting/portal progression, backend sync, UI clarity, and performance safeguards—are now documented with precise source references for auditors and future contributors.
