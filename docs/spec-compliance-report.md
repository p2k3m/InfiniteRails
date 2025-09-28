# Portals of Dimension Specification Compliance

This repository implements the "Infinite Rails: Portals of Dimension" brief in the
production gameplay sandbox (`simple-experience.js`) and the surrounding UI
scaffolding (`script.js`, `index.html`). The checklist below maps each major
requirement from the specification to the concrete implementation so future
maintainers can audit coverage quickly.

## Rendering & World Setup
- **Orthographic first-person renderer:** `setupScene()` provisions an
  orthographic camera positioned at the player eye height, enables dynamic
  lighting, and builds the layered scene graph for terrain, rails, portals,
  entities, and challenge props.【F:simple-experience.js†L1405-L1478】
- **Procedural 64×64 island:** `buildTerrain()` rebuilds the voxel island on
  every dimension load, populating instanced chunks, tracking column metadata,
  and logging the canonical `World generated: 4096 voxels` trace for debugging
  and automated smoke tests.【F:simple-experience.js†L2826-L2907】

## Player Presentation & Controls
- **Steve avatar & idle animation:** `loadPlayerCharacter()` attaches the GLTF
  rig to the player rig, parents the camera to the head pivot for first-person
  viewing, and falls back to a voxel avatar if the model fails to stream.【F:simple-experience.js†L2665-L2727】
- **Input bindings & pointer lock:** The experience binds pointer lock, keyboard,
  and touch listeners during `bindEvents()`, enabling dual-mode locomotion,
  raycast mining/placement, hotbar cycling, and mobile joystick controls.【F:simple-experience.js†L3988-L4164】

## Survival Loop
- **Zombies & iron golems:** `spawnZombie()` and `updateZombies()` drive the
  night-cycle AI that chases the player, while `spawnGolem()` and
  `updateGolems()` spawn defensive allies that intercept threats and reward
  score bonuses.【F:simple-experience.js†L4490-L4674】
- **Crafting & inventory systems:** The crafting controller tracks ordered
  sequences, validates recipes, persists unlocks, and refreshes hotbar, satchel,
  and modal layouts with accessibility metadata.【F:simple-experience.js†L5201-L5385】

## Portals, Dimensions & Victory
- **Portal activation & transitions:** Portal construction validates the 4×3
  frame, instantiates animated shader planes, and advances to themed dimensions
  with custom gravity, scoring, and procedural rail networks. Victory triggers
  once the Netherite gauntlet is conquered.【F:simple-experience.js†L3800-L3965】
- **HUD, progression, and celebration:** `updateHud()` and its helpers maintain
  real-time score, recipe, and dimension telemetry, while the dimension info
  panel showcases gravity modifiers, leaderboard ranks, and replay actions when
  the run is complete.【F:simple-experience.js†L5480-L5616】

## Backend, Identity & Leaderboards
- **Dynamo-ready sync pipeline:** Scoreboard hydration, run summary
  normalisation, and POST synchronisation to `APP_CONFIG.apiBaseUrl` endpoints
  are handled in the scoreboard utilities, with graceful fallbacks for offline
  play and optional Google identity hand-off.【F:simple-experience.js†L902-L1380】

These references can be cross-checked with the automated smoke test
(`tests/e2e-check.js`) that asserts each log and HUD milestone before allowing
deployment.【F:tests/e2e-check.js†L1-L131】
