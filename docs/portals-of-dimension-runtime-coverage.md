# Infinite Rails: Portals of Dimension — Runtime Coverage Notes

This document cross-references the requested gameplay beats with the current implementation so that reviewers can confirm where
in the codebase each experience beat is fulfilled.

## 1. Renderer bootstrap and terrain seeding
* `SimpleExperience.setupScene()` constructs an orthographic Three.js renderer, attaches the camera to the player rig, and wires
  hemisphere/directional lighting for the day/night cycle. 【F:simple-experience.js†L1191-L1247】
* `SimpleExperience.buildTerrain()` procedurally generates the 64×64 voxel island, caches the height map, and logs the 4,096
  column count once blocks are populated. 【F:simple-experience.js†L2428-L2506】

## 2. Player embodiment and controls
* `SimpleExperience.loadPlayerCharacter()` loads the Steve GLTF, falls back to a stylised cube if the asset fails, parents the
  camera to the head bone, and loops the idle animation so the avatar is always visible. 【F:simple-experience.js†L2240-L2330】
* Mouse/keyboard input is captured in `handleMouseMove`, `handleKeyDown`, and `updateMovement` to implement pointer-lock look,
  WASD locomotion, jumping, and joystick/touch fallbacks. 【F:simple-experience.js†L3680-L3864】

## 3. Survival loop, mobs, and combat
* Zombies spawn during the night cycle via `updateZombies`, path-find toward the player, and trigger health damage when within
  the configured contact range. 【F:simple-experience.js†L4024-L4055】
* Iron golems are spawned by `spawnGolem`/`updateGolems`, pursue zombies, and award score when a defense strike lands, matching
  the specified escort behaviour. 【F:simple-experience.js†L4151-L4217】
* `handleDefeat()` resets the run on five hits while preserving inventory, matching the respawn requirement. 【F:simple-experience.js†L4230-L4256】

## 4. Crafting, mining, and inventory feedback
* `mineBlock()` removes the top voxel at the raycasted column, increments the mining counter, and prepares inventory payloads
  so mined blocks appear in the hotbar. 【F:simple-experience.js†L4259-L4297】
* `SimpleExperience.refreshCraftingUi()` (invoked on start) hydrates the crafting modal, while drag/drop handlers process recipe
  sequences into score and item rewards. 【F:simple-experience.js†L4776-L4850】

## 5. Portals, dimensions, and progression
* Portal frame validation, ignition, and shader activation are handled by `ignitePortal`, `activatePortal`, and
  `recalculatePortalFrameProgress`, deferring to `PortalMechanics` when available. 【F:simple-experience.js†L3312-L3390】
* `advanceDimension()` swaps in the next biome, rebuilds terrain/rails, adjusts gravity, and triggers score submissions and
  hint updates. 【F:simple-experience.js†L3488-L3549】

## 6. Backend synchronisation and leaderboard UI
* Successful runs call `updateLocalScoreEntry()`/`scheduleScoreSync()`; remote persistence uses the API base URL configured in
  `APP_CONFIG` and fetches `/scores` when online. 【F:simple-experience.js†L867-L924】【F:simple-experience.js†L1099-L1126】
* `script.js` bridges the simple mode leaderboard into the advanced HUD via `setupSimpleExperienceIntegrations`, ensuring names
  and Google SSO state stay in sync. 【F:script.js†L602-L752】【F:script.js†L1245-L1316】

## 7. HUD, tutorials, and polish
* Intro dismissal, HUD activation, and the mission briefing overlay are all orchestrated when `SimpleExperience.start()` runs, so
  players see controls guidance before the timer hands off. 【F:simple-experience.js†L688-L736】
* Day/night progression, health hearts, and portal progress bars are refreshed every frame by `updateHud()` and supporting
  helpers, matching the expected responsive UI. 【F:simple-experience.js†L3004-L3104】

## 8. Ambient audio and fallbacks
* `SimpleExperience.createAudioController()` resolves gameplay cues such as `craftChime` and `zombieGroan` through the shared
  alias table, ensuring mining, crafting, and combat sounds are available even when bespoke samples are missing from the offline
  bundle. 【F:simple-experience.js†L2046-L2136】
* `audio-aliases.js` stores the alias configuration on the global scope and exports it for tests so the fallback coverage stays
  in sync with embedded samples. 【F:audio-aliases.js†L1-L20】

## 9. Remaining follow-ups
* Texture streaming currently expects assets to be present locally; CDN fallbacks should be audited before the next release.
* Automated smoke coverage for `SimpleExperience.start()` is still pending and will be tracked in `tests/e2e-check.js`.
