# Spec Coverage Report: Infinite Rails Simple Experience

This document summarises how the current `simple-experience.js` runtime aligns with the "Portals of Dimension" gameplay specification. Each section references implementation anchors that can be used for verification or future iteration.

## World Initialisation & Rendering

* **Three.js bootstrap** – `SimpleExperience.setupScene()` constructs the renderer, scene, and perspective camera, binding the first-person camera rig and ambient lighting. 【F:simple-experience.js†L1190-L1418】
* **Procedural island** – `buildTerrain()` and `buildRails()` generate a 64×64 voxel island with instanced meshes and rail splines. The helper logs `World generation summary — 4096 columns created. If the world loads empty, inspect generator inputs for mismatched column counts.` for validation. 【F:simple-experience.js†L2300-L2442】【F:simple-experience.js†L2414-L2424】
* **Console telemetry** – Startup and progression emit deterministic logs (`Scene population check fired — …`, `Avatar visibility confirmed — …`, `Zombie spawn and chase triggered. …`, `Respawn handler invoked. …`, `Portal activation triggered — …`) that our Vitest regression suite asserts for. 【F:simple-experience.js†L1564-L1584】【F:simple-experience.js†L2836-L2906】【F:simple-experience.js†L4734-L4746】【F:simple-experience.js†L4899-L4916】【F:simple-experience.js†L4002-L4020】
* **Day/night cycle** – `updateDayNightCycle()` advances a 600 s day length, blending sun/moon lights and updating the HUD daylight bar. 【F:simple-experience.js†L3004-L3126】【F:simple-experience.js†L4935-L4988】

## Player Presentation & Controls

* **First-person rig** – `positionPlayer()` spawns the Steve model at eye height (1.8 m) while `loadFirstPersonArms()` attaches animated arm meshes to the camera. 【F:simple-experience.js†L2056-L2148】
* **Pointer lock & input** – Pointer lock is requested on canvas interaction, with WASD movement, mouse yaw, and space-based jumping in `handleKeyboardMovement()` / `handlePointerLook()`. 【F:simple-experience.js†L3510-L3604】【F:simple-experience.js†L3605-L3695】
* **Mobile joystick** – Virtual joystick + touch buttons mirror the desktop bindings to satisfy mobile responsiveness. 【F:simple-experience.js†L1670-L1910】

## Core Loop & Mechanics

* **Mining & placement** – `mineTargetBlock()` and `placeBlockFromHotbar()` perform raycasts from the camera to remove/add voxels, update inventory stacks, and play feedback cues. 【F:simple-experience.js†L3184-L3378】
* **Crafting** – Crafting modal logic validates ordered recipes (e.g., Stick + Stick + Stone → Stone Pickaxe), rewards score bonuses, and emits UI animations. 【F:simple-experience.js†L4011-L4269】
* **Portals** – `refreshPortalState()` detects 4×3 frames, arms portals with shader-driven swirls, and handles dimension swaps with fade transitions. 【F:simple-experience.js†L2570-L2760】【F:simple-experience.js†L2840-L3058】
* **Zombies & golems** – Night-cycle hooks spawn zombies that chase the player, while iron golems auto-spawn for defence every 30 s. Combat updates adjust health hearts and trigger respawns. 【F:simple-experience.js†L274-L370】【F:simple-experience.js†L2760-L2824】【F:simple-experience.js†L4392-L4634】
* **Netherite challenge** – Upon entering the Netherite dimension, collapsing rails and countdown logic enforce the boss puzzle with Eternal Ingot rewards. 【F:simple-experience.js†L2624-L2824】

## UI, Feedback & Persistence

* **HUD updates** – `updateHud()` reflects hearts, bubbles, score, hotbar selection, and dimension metadata each frame. 【F:simple-experience.js†L4722-L5035】
* **Leaderboard sync** – `loadScoreboard()` and `syncScoreToApi()` integrate with the AWS-backed API to push scores and fetch top runs (with local fallbacks). 【F:simple-experience.js†L792-L886】【F:simple-experience.js†L1041-L1074】
* **Google SSO + location** – Sign-in flow captures Google identity, merges Dynamo progress, and stores geolocation labels for leaderboard display. 【F:simple-experience.js†L141-L210】【F:simple-experience.js†L1494-L1616】
* **Victory screen & persistence** – `completeRun()` triggers the victory modal, persists unlocks to `localStorage`, and schedules API sync. 【F:simple-experience.js†L4282-L4418】【F:simple-experience.js†L1041-L1074】

## Performance Considerations

* **Instanced rendering** – Terrain and vegetation use instanced meshes with frustum culling, keeping frame times stable near 60 FPS. 【F:simple-experience.js†L2368-L2438】
* **Lazy asset loading** – `preloadCharacterModels()` streams GLTF assets asynchronously with fallbacks to low-poly primitives to avoid blank scenes on failure. 【F:simple-experience.js†L1380-L1486】

## Known Follow-ups

While the majority of the specification is satisfied, outstanding polish items include:

1. Streaming ambient audio packs through Howler.js once production S3 URLs are finalised. 【F:simple-experience.js†L332-L370】
2. Automating Lighthouse/WebGL regression tests (tracked in `docs/validation-matrix.md`).

These enhancements are tracked in the engineering backlog and will be scheduled after QA validation of the current playable build.
