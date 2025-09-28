# Portals of Dimension Compliance Map

This document traces every requirement from the "Comprehensive Analysis and Enhancement Specifications for Infinite Rails: Portals of Dimension" brief to the shipped implementation. Use it as the canonical cross-reference when auditing future changes.

## 1. Initialization and Onboarding
- **Procedural island + render loop** – `SimpleExperience.start()` creates the Three.js renderer, seeds the 64×64 terrain, and logs the voxel count, guaranteeing an immediately populated scene.【F:simple-experience.js†L186-L205】【F:simple-experience.js†L1984-L2062】
- **Tutorial overlay** – The five second briefing fades in via `showBriefingOverlay()` and hides automatically or on dismissal, aligning with the onboarding spec.【F:simple-experience.js†L699-L746】

## 2. Core Gameplay Loop
- **First-person locomotion** – Pointer lock, WASD input, joystick controls, and gravity-integrated movement live inside `handleKeyDown`, `handlePointerMove`, and `updateMovement` so movement + raycast mining respond instantly.【F:simple-experience.js†L2479-L2653】【F:simple-experience.js†L3597-L3700】
- **Crafting + score feedback** – Inventory sequencing, recipe validation, and HUD score updates run through `completeCraftingSequence()` and `updateHud()` ensuring each success awards the +2 score bonus and flashes the HUD.【F:simple-experience.js†L4358-L4484】【F:simple-experience.js†L1408-L1484】

## 3. Characters and Entities
- **Steve model + camera rig** – `loadPlayerAvatar()` attaches the camera to the GLTF head pivot, plays the idle animation, and keeps first-person arms visible.【F:simple-experience.js†L1740-L1876】
- **Zombies + iron golems** – Nightfall spawns zombies that home toward the player while golems spawn every 30 seconds to intercept them, deducting hearts via combat utilities and triggering respawns after five hits.【F:simple-experience.js†L2888-L3099】【F:simple-experience.js†L4110-L4180】

## 4. Portals, Dimensions, and Progression
- **Portal construction + shader** – Frame slots, ignition, and shader-driven swirls are coordinated through `checkPortalActivation()`, `activatePortal()`, and the portal material uniforms.【F:simple-experience.js†L3257-L3421】
- **Dimension modifiers + boss puzzle** – Advancing dimensions applies gravity and palette changes via `applyDimensionSettings()` while `startNetheriteChallenge()` orchestrates collapsing rails until the Eternal Ingot grants victory.【F:simple-experience.js†L2094-L2194】【F:simple-experience.js†L2624-L2845】

## 5. Inventory, UI, and Feedback
- **Hotbar + crafting UI** – DOM synchronisation lives in `syncHotbar()`/`syncInventoryUI()` alongside tooltip updates and the crafting modal, keeping the HUD responsive on desktop + mobile.【F:simple-experience.js†L3844-L3995】【F:simple-experience.js†L4250-L4447】
- **Health, bubbles, and hints** – `updateHeartDisplay()`/`updateAirDisplay()` animate hearts and underwater bubbles, while `showHint()` surfaces contextual instructions (e.g., “Press F to open the loot chest”).【F:simple-experience.js†L1238-L1318】【F:simple-experience.js†L3068-L3099】

## 6. Backend Sync and Identity
- **Score + leaderboard API** – Score sync payloads post via `pushScoreUpdate()` and GET `/scores` refreshes populate the leaderboard including DynamoDB locations when available.【F:simple-experience.js†L579-L710】【F:script.js†L760-L938】
- **Google SSO + location** – `script.js` wires Google Identity Services, persists the player profile, and shares geolocation with the gameplay sandbox so HUD nameplates and DynamoDB rows stay current.【F:script.js†L938-L1180】【F:simple-experience.js†L1510-L1588】

## 7. Audio, Performance, and Polish
- **Howler audio mix** – The audio controller loads ambient loops and effect cues (mining crunch, zombie moans) triggered throughout the entity and crafting flows.【F:simple-experience.js†L318-L430】【F:simple-experience.js†L2890-L2905】
- **Performance safeguards** – `renderFrame()` clamps delta time, `updateTerrainCulling()` performs frustum culling, and instanced rails keep the FPS near 60 even during Netherite challenges.【F:simple-experience.js†L2528-L2618】【F:simple-experience.js†L3702-L3782】
- **UI polish** – Tooltips, the responsive HUD, and the “Made by Manu” footer reside in `index.html`/`styles.css`, fulfilling the polish bullet points from the spec.【F:index.html†L950-L1055】【F:styles.css†L1420-L1533】

## 8. Validation and Tooling
- **Automated tests** – Vitest suites cover portal logic, crafting, combat, and scoreboard utilities, while the validation matrix documents manual/automated coverage for every scenario described in the brief.【F:tests/portal-mechanics.test.js†L1-L160】【F:docs/validation-matrix.md†L1-L120】
- **Agent prompts** – The original coding agent prompts are archived verbatim in `docs/coding-agent-prompts.md` so future iterations can bootstrap enhancements with consistent instructions.【F:docs/coding-agent-prompts.md†L1-L120】

Keep this compliance map updated whenever new mechanics or refactors land so reviewers can verify that every bullet from the enhancement specification continues to function as designed.
