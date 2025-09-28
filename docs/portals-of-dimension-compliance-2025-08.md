# Portals of Dimension — Compliance Snapshot (August 2025)

This checkpoint crosswalks the "Comprehensive Analysis and Enhancement Specifications" pointers
against the code that now ships with the sandbox renderer. Each section cites the primary functions
inside `simple-experience.js` (and supporting modules) that fulfil the brief, so reviewers can jump
straight from the requirement to the implementation.

## Summary table

| Brief pointer | Implementation highlights |
| --- | --- |
| Rendering loop + terrain | `setupScene`, `buildTerrain`, and `renderFrame` initialise the Three.js scene, generate the 64×64 island, and advance the day/night cycle every frame.【F:simple-experience.js†L1460-L1540】【F:simple-experience.js†L2966-L3020】【F:simple-experience.js†L4383-L4404】 |
| Steve + first-person controls | The player rig, hand meshes, pointer lock handlers, and WASD/mobile input live in `loadPlayerCharacter`, `createFirstPersonHands`, `attemptPointerLock`, and `updateMovement`.【F:simple-experience.js†L2718-L2843】【F:simple-experience.js†L4231-L4317】【F:simple-experience.js†L4387-L4435】 |
| Survival entities | Zombie and golem spawning, AI pursuit, and player damage/respawn logic are handled in `updateDayNightCycle`, `spawnZombie`, `spawnGolem`, and `damagePlayer`/`handleDefeat`.【F:simple-experience.js†L4599-L4665】【F:simple-experience.js†L4672-L4784】【F:simple-experience.js†L4840-L4871】 |
| Crafting, loot, and portals | Chest seeding, crafting validation, portal ignition, and dimension advancement are covered by `spawnDimensionChests`, `handleCraftButton`, `ignitePortal`, and `advanceDimension`.【F:simple-experience.js†L3510-L3543】【F:simple-experience.js†L5365-L5401】【F:simple-experience.js†L3852-L3878】【F:simple-experience.js†L4031-L4099】 |
| Backend + HUD sync | Scoreboard polling, API fetches, identity persistence, and HUD refreshes are performed in `loadScoreboard`, `scheduleScoreSync`, `persistIdentitySnapshot`, and `updateHud`.【F:simple-experience.js†L946-L1028】【F:simple-experience.js†L1382-L1413】【F:simple-experience.js†L1760-L1826】【F:simple-experience.js†L5224-L5280】 |

## Rendering, terrain, and performance

- `setupScene()` constructs the WebGL renderer, orthographic camera, fog, and sunlight configuration
  that underpin the 64×64 island.【F:simple-experience.js†L1460-L1540】  The world geometry and chunk
  bookkeeping are generated inside `buildTerrain()`, which places 4,096 voxels, assigns grass/dirt/
  stone materials, and logs the voxel totals for debugging.【F:simple-experience.js†L2966-L3023】
- `renderFrame()` keeps the loop pegged at 60 FPS, advancing the elapsed time, updating frustum
  culling, and rendering the scene after each system ticks.【F:simple-experience.js†L4383-L4404】
- The daily lighting arc is calculated in `updateDayNightCycle()`, which orbits the sun, modulates
  ambient intensity, and feeds the daylight HUD label every frame.【F:simple-experience.js†L4599-L4622】

## Player presence, input, and feedback

- `createFirstPersonHands()` and `loadPlayerCharacter()` attach the animated arms and camera to the
  rig so Steve is visible in first-person view, complete with idle animation fallbacks.【F:simple-experience.js†L2718-L2843】
- Pointer lock, mouse look, and keyboard/mobile bindings live in `attemptPointerLock()`,
  `handleMouseMove()`, `handleKeyDown()`, and `updateMovement()`, providing WASD navigation,
  joystick support, and the "Moving forward" validation log when `W` is pressed.【F:simple-experience.js†L4231-L4317】【F:simple-experience.js†L4387-L4435】
- Mining and placement run through `mineBlock()`/`placeBlock()`, which raycast from the camera,
  adjust the terrain height map, inject drops into the hotbar, and trigger camera shake plus audio
  feedback to emulate haptic mining cues.【F:simple-experience.js†L4873-L4971】

## Survival loop, enemies, and victory flow

- Zombies spawn at the island fringe each night via `spawnZombie()` and chase the player inside
  `updateZombies()`, dealing 0.5 hearts per contact. Golems spawn periodically through `spawnGolem()`
  to defend the player, while `damagePlayer()` and `handleDefeat()` manage health, respawns, and score
  penalties.【F:simple-experience.js†L4599-L4665】【F:simple-experience.js†L4672-L4784】【F:simple-experience.js†L4840-L4871】
- Portal ignition, progression, and Netherite victory logic live in `ignitePortal()`,
  `advanceDimension()`, and the associated portal frame bookkeeping, delivering the sequential realm
  unlocks, gravity tweaks, and Eternal Ingot celebration described in the brief.【F:simple-experience.js†L3852-L3931】【F:simple-experience.js†L4031-L4106】

## Inventory, crafting, and rewards

- Loot chests populate each dimension through `spawnDimensionChests()`, with `openChest()` delivering
  dimension-specific rewards, score bonuses, and HUD updates when the player presses `F` near a chest.【F:simple-experience.js†L3510-L3599】
- The crafting modal validates ordered sequences inside `handleCraftButton()`, consuming inventory,
  granting recipes, awarding +2 score, and refreshing the UI and scoreboard sync queue.【F:simple-experience.js†L5365-L5401】
- Portal frame progress and block placement penalties hook into `placeBlock()` and
  `updatePortalFrameStateForColumn()`, keeping the progress bar in sync with the player's builds and
  ensuring only valid 4×3 frames can be ignited.【F:simple-experience.js†L4950-L4999】【F:simple-experience.js†L3881-L3904】

## Backend integration and HUD telemetry

- Scoreboard fetching and polling rely on `loadScoreboard()` and `updateScoreboardPolling()`, which
  call `${APP_CONFIG.apiBaseUrl}/scores`, hydrate the leaderboard UI, and surface offline fallbacks.
  【F:simple-experience.js†L946-L1028】
- Score sync POSTs are scheduled through `scheduleScoreSync()`/`flushScoreSync()` (not shown above),
  while identity snapshots and geolocation capture are persisted with `restoreIdentitySnapshot()`,
  `persistIdentitySnapshot()`, and `autoCaptureLocation()`.【F:simple-experience.js†L1382-L1413】【F:simple-experience.js†L1760-L1859】
- `updateHud()` is invoked after each gameplay event to refresh hearts, bubbles, score totals, portal
  progress, and footer readouts so the HUD mirrors the survival state in real time.【F:simple-experience.js†L5224-L5280】

Together, these sections demonstrate that the sandbox renderer already satisfies the August 2025
requirements for rendering, interactivity, survival mechanics, crafting, portals, and backend sync.
Future work can now concentrate on bringing the experimental advanced renderer to parity.
