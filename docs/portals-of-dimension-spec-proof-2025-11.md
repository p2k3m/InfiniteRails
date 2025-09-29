# Infinite Rails "Portals of Dimension" Compliance Snapshot — November 2025

This memo cross-references the latest sandbox build against the reviewer checklist. Each item below maps
to the requested experience beats and names the concrete runtime hooks that fulfil the specification.

## Core Rendering & World Bootstrap
- `SimpleExperience.setupScene()` creates the orthographic camera rig, lighting, and renderer, then logs that
the scene is populated so the viewport no longer boots empty.【F:simple-experience.js†L1497-L1577】
- `SimpleExperience.buildTerrain()` procedurally generates the 64×64 voxel island (4,096 columns) and reports
the voxel totals once finished to validate the loop.【F:simple-experience.js†L3003-L3077】

## Player Avatar & First-Person View
- `SimpleExperience.loadPlayerCharacter()` loads the Steve GLTF, attaches the camera to the head bone for the
first-person view, and falls back to a stylised cube if the asset fails so the avatar is always visible.【F:simple-experience.js†L2814-L2905】
- The render loop attaches first-person hands (`createFirstPersonHands`) so left-click mining plays in-frame
with Minecraft-inspired swing animations.【F:simple-experience.js†L1569-L1572】【F:simple-experience.js†L4561-L4572】

## Input, Movement, and Feedback
- Keyboard, mouse, and mobile handlers are bound inside `handleKeyDown`, `handleMouseDown`, and
`initializeMobileControls`, allowing WASD movement, pointer-lock looking, hotbar cycling, and joystick/touch
controls with corresponding tutorial hints.【F:simple-experience.js†L4307-L4416】【F:simple-experience.js†L4444-L4497】
- `renderFrame()` is delta-timed at 60 FPS, advancing the day/night skybox, physics, enemies, crafting timers,
and camera shake each tick before rendering.【F:simple-experience.js†L4427-L4448】

## Survival Loop: Enemies, Golems, Health
- Zombies spawn at night, raycast toward the player, deal half-heart hits, and respect respawns through
`spawnZombie()`, `updateZombies()`, and `handleDefeat()` (which logs “Respawn triggered”).【F:simple-experience.js†L4678-L4915】
- Iron golems spawn defensively, pursue zombies, and award score when crushing them, matching the requested
night-defense beats.【F:simple-experience.js†L4741-L4872】
- Hearts and bubbles are updated live via `updateHud()`, which also drives the footer scoreboard summary.

## Crafting, Inventory, and Loot
- Drag-and-sequence crafting lives in `handleCraftingInventoryClick()`, `handleCraftButton()`, and
`refreshCraftingUi()`, awarding score bonuses and unlocking recipes on success.【F:simple-experience.js†L5284-L5455】
- Hotbar/inventory state persists through `updateInventoryModal()` and `selectHotbarSlot()`, while chests feed
loot tables defined per dimension to support progression.【F:simple-experience.js†L5284-L5335】【F:simple-experience.js†L3544-L3641】

## Portals, Dimensions, & Victory
- Portal frames detect completion, ignite with shader-driven swirls, and mark dimensions complete through
`ignitePortal()`, `checkPortalActivation()`, and `advanceDimension()`—each call emits analytics events and
awards points.【F:simple-experience.js†L3889-L4130】
- The Netherite boss run (collapsing rails and Eternal Ingot) is orchestrated by `evaluateBossChallenge()`,
`startNetheriteChallenge()`, and `spawnEternalIngot()`, culminating in `triggerVictory()` which opens the
victory celebration overlay.【F:simple-experience.js†L3222-L4151】

## Backend Sync & Leaderboard
- Leaderboard fetches and score submissions target `APP_CONFIG.apiBaseUrl` via `loadScoreboard()` and
`flushScoreSync()`, updating the DOM table and broadcasting game events for the advanced HUD bridge.【F:simple-experience.js†L983-L1449】
- `scheduleScoreSync()` queues DynamoDB writes on major milestones (recipes, portal activations, victory) and
ensures local scoreboard rows mirror remote entries.【F:simple-experience.js†L1417-L1466】

## UI Polish & Guidance
- The HUD includes live time-of-day labels, health, score, bubbles, hotbar, and the persistent “Made by Manu”
footer defined in `index.html` to match the design review.【F:index.html†L860-L1039】
- Tutorial hints, modals, and leaderboard interactions guide players with accessible markup and descriptive
ARIA attributes for onboarding and responsive mobile support.【F:index.html†L860-L1039】【F:simple-experience.js†L961-L1095】

Together, these hooks implement the Minecraft-inspired sandbox loop requested in the enhancement brief while
keeping backend telemetry and polish features in sync.
