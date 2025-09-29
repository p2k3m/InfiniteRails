# Portals of Dimension — August 2025 Compliance Map

This document ties the "Comprehensive Analysis and Enhancement Specifications"
requirements to the current codebase. Use it when you need to point auditors or
coding agents to the exact functions that deliver each gameplay loop.

## Initialization & onboarding

- `SimpleExperience.start()` boots the sandbox renderer, hides the modal, shows
  the mission briefing, and kicks off score syncing and the render loop as soon
  as the canvas is ready.【F:simple-experience.js†L764-L800】
- `setupScene()` creates the full Three.js pipeline (orthographic camera,
  player rig, lighting, and world groups) while logging readiness for debugging
  in the console.【F:simple-experience.js†L1497-L1576】
- `buildTerrain()` procedurally generates the 64×64 floating island, records the
  initial height map, and recomputes chunk bounds for culling.【F:simple-experience.js†L3003-L3077】

## Core controls & feedback

- Pointer hints, briefing overlays, and HUD bootstrapping are handled inside
  `showDesktopPointerTutorialHint()`, `showBriefingOverlay()`, and
  `updateHud()` so players immediately see controls, vitals, and mission
  context.【F:simple-experience.js†L961-L1000】【F:simple-experience.js†L821-L867】【F:simple-experience.js†L5724-L5790】
- `bindEvents()` wires pointer lock, WASD, touch joystick, crafting dialogs, and
  hotbar interactions so desktop and mobile inputs behave like Minecraft out of
  the box.【F:simple-experience.js†L4174-L4216】
- `updateMovement()` mixes keyboard, joystick, gravity, and jump physics while
  `renderFrame()` advances the day/night cycle, frustum culling, AI, and camera
  shake before rendering.【F:simple-experience.js†L4451-L4516】【F:simple-experience.js†L4427-L4448】
- `mineBlock()` and `placeBlock()` handle raycast mining/placement, loot drops,
  inventory updates, score adjustments, and camera feedback to keep actions
  responsive.【F:simple-experience.js†L4917-L5016】

## Survival, entities, and combat

- `updateZombies()` spawns and drives zombie AI during night cycles, including
  collision damage routed through `damagePlayer()` and the respawn flow logged
  in `handleDefeat()`.【F:simple-experience.js†L4677-L4715】【F:simple-experience.js†L4884-L4915】
- `spawnGolem()` and `updateGolems()` automatically field iron golems that seek
  out nearby zombies, intercept them, and reset cooldowns after attacks.【F:simple-experience.js†L4804-L4859】
- Health hearts, bubble meters, and penalties are refreshed through the HUD so
  survival states stay visible while penalties sync to the scoreboard.【F:simple-experience.js†L5724-L5790】

## Crafting, inventory, and progression

- Inventory slots, drag/drop crafting queues, and recipe validation live in the
  `handleCraftingInventoryClick()`, `handleCraftButton()`, and
  `refreshCraftingUi()` chain, awarding score and unlocking recipes on success.【F:simple-experience.js†L5372-L5442】
- Portal progress and tutorials update via `updatePortalProgress()` and
  `checkPortalActivation()`, while `ignitePortal()` rewards portal completion
  and feeds portal mechanics events back into the HUD.【F:simple-experience.js†L5755-L5789】【F:simple-experience.js†L4040-L4065】【F:simple-experience.js†L3889-L3916】
- `advanceDimension()` swaps terrain, applies gravity modifiers, spawns loot
  chests, clears mobs, and emits dimension events; `triggerVictory()` finalises
  the Netherite encounter and launches the celebration UI.【F:simple-experience.js†L4068-L4150】

## Backend sync & identity

- Score fetching, polling, and local fallbacks live in `loadScoreboard()` and
  `updateScoreboardPolling()`, while `flushScoreSync()` posts run summaries to
  `${apiBaseUrl}/scores` and merges responses.【F:simple-experience.js†L983-L1089】【F:simple-experience.js†L1426-L1477】
- Google Sign-In, optional local profiles, and `/users` metadata sync are
  orchestrated inside `script.js` via `handleLocalProfileSignIn()`,
  `finalizeSignIn()`, and `syncUserMetadata()` so leaderboard identities stay in
  sync with DynamoDB-backed endpoints.【F:script.js†L18575-L18593】【F:script.js†L18595-L18736】【F:script.js†L18757-L18840】

## Performance & polish

- The renderer enforces chunk frustum culling, animation deltas, and
  anisotropic textures through `updateTerrainCulling()`, `renderFrame()`, and
  `applyTextureAnisotropy()` to hold 60 FPS on modest hardware.【F:simple-experience.js†L4553-L4632】【F:simple-experience.js†L4427-L4448】【F:simple-experience.js†L1526-L1534】
- `updateFooterSummary()` and `updateDimensionInfoPanel()` keep the "Made by
  Manu" footer, dimension briefing, and leaderboard rank refreshed in real
  time, matching the polish points from the enhancement brief.【F:simple-experience.js†L5793-L5829】【F:simple-experience.js†L5837-L5877】

## Testing & validation

- Run `npm test` for the Vitest utility suites and `npm run test:e2e` for the
  Playwright smoke harness. See [`docs/validation-matrix.md`](./validation-matrix.md)
  for the broader manual regression checklist.【F:package.json†L8-L15】【F:docs/validation-matrix.md†L1-L80】

Keep this file updated whenever new systems land so reviewers can confirm the
sandbox still satisfies the full enhancement specification.
