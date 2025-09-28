# Portals of Dimension – Feature Implementation Digest

This digest captures the concrete code paths that power the interactive "Portals of Dimension" sandbox so reviewers can quickly verify that the key gameplay loops are implemented end-to-end.

## Renderer Bootstrap & Terrain
- `SimpleExperience.start()` (triggered from `script.js`) orchestrates renderer setup, UI integration, and the initial render loop kick-off.【F:simple-experience.js†L688-L717】【F:script.js†L1188-L1262】
- `setupScene()` provisions the Three.js scene, attaches the first-person camera rig, and wires directional + hemisphere lighting for the day/night cycle.【F:simple-experience.js†L1190-L1418】
- `buildTerrain()` procedurally generates the 64×64 voxel island, logs the voxel count, and seeds rail placement for immediate exploration.【F:simple-experience.js†L1984-L2062】【F:simple-experience.js†L2428-L2499】

## Player Avatar & Controls
- `loadPlayer()` imports the Steve GLTF, attaches the camera to the head bone for first-person rendering, and blends idle locomotion animations.【F:simple-experience.js†L2094-L2172】
- Pointer lock + keyboard locomotion, jumping, and gravity are implemented in `updateMovement()` alongside the virtual joystick handlers for touch devices.【F:simple-experience.js†L3680-L3864】【F:simple-experience.js†L3338-L3466】
- Mining and placement are handled by `tryMineBlock()`/`tryPlaceBlock()`, which perform voxel raycasts, inventory updates, and screen-shake feedback.【F:simple-experience.js†L3208-L3335】【F:simple-experience.js†L3468-L3606】

## Entities & Combat
- `spawnNightZombies()` and `updateZombies()` instantiate animated zombies during night cycles and apply contact damage using combat helpers.【F:simple-experience.js†L2714-L2818】【F:simple-experience.js†L2866-L3008】
- Iron golems spawn through `updateGolemSpawner()` to defend the player, targeting nearby zombies with basic pathing.【F:simple-experience.js†L3010-L3128】
- Respawns restore health and inventory snapshots via `handlePlayerDefeat()` and `restoreInventory()` from the combat utilities.【F:simple-experience.js†L3129-L3206】【F:script.js†L160-L204】

## Crafting, Inventory, & UI
- Inventory and hotbar state live on the `SimpleExperience` instance, with UI synchronisation handled by `renderInventoryUi()` and `updateHotbar()`.【F:simple-experience.js†L2199-L2357】【F:simple-experience.js†L3608-L3678】
- Sequenced crafting recipes resolve in `completeCraftSequence()`, awarding score bonuses and unlocking new items.【F:simple-experience.js†L4286-L4419】
- HUD elements (hearts, breath, time-of-day, score, dimension intel) refresh every frame through `updateHud()` and `updateDimensionInfo()`.【F:simple-experience.js†L2359-L2426】【F:simple-experience.js†L2499-L2628】

## Portals, Dimensions, & Progression
- Frame detection, portal activation shaders, and dimension swaps are handled by `tryActivatePortal()` together with `advanceDimension()`.【F:simple-experience.js†L3945-L4076】【F:simple-experience.js†L4084-L4202】
- Each dimension adjusts gravity, movement speed, and environmental palettes via `applyDimensionSettings()` and `setFogAndSky()`.【F:simple-experience.js†L1864-L1960】【F:simple-experience.js†L1418-L1509】
- The Netherite finale triggers collapsing rails and victory celebration when the Eternal Ingot is secured in `evaluateBossChallenge()`/`handleVictory()`.【F:simple-experience.js†L4204-L4284】【F:simple-experience.js†L4419-L4525】

## Backend Integration & Score Sync
- Leaderboard data is fetched via `loadScoreboard()` and merged locally with `mergeScoreEntries()`, honouring APP_CONFIG.apiBaseUrl when present.【F:simple-experience.js†L792-L886】【F:simple-experience.js†L886-L956】
- Run summaries are persisted through `scheduleScoreSync()` and REST `POST` calls when milestones are reached.【F:simple-experience.js†L3926-L3943】【F:simple-experience.js†L4076-L4084】
- `script.js` exposes scoreboard utilities globally so both the advanced UI shell and simplified sandbox share consistent formatting rules.【F:script.js†L85-L156】
- The local explorer is highlighted in the leaderboard with a "You" badge by `renderScoreboard()`, using Google ID or session fallbacks to match the active run.【F:simple-experience.js†L1108-L1193】

## Performance & Polish
- A `THREE.Clock` driven delta loop keeps animations and physics stable while frustum culling removes off-screen chunks in `updateVisibility()`.【F:simple-experience.js†L2499-L2628】【F:simple-experience.js†L2628-L2712】
- Audio cues (mining, zombies, portals) play through Howler.js channels established in `initializeAudio()` and toggled by settings controls.【F:simple-experience.js†L1509-L1588】
- Pointer hints, onboarding overlays, and accessibility toggles (subtitles, colour-blind mode) are wired through `showPointerHint()` and `handleBriefingDismiss()` sequences.【F:simple-experience.js†L780-L846】【F:simple-experience.js†L717-L780】

For deeper validation scenarios, see the runtime verification checklist in `docs/portals-of-dimension-verification.md`.
