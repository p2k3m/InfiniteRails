# Portals of Dimension – Feature Verification Audit

This checklist re-validates the "Portals of Dimension" gameplay brief against the
current codebase.  Each requirement from the follow-up specification is mapped to
the concrete implementation files so future contributors can locate the
behaviour quickly.

## 1. Initialization and Onboarding
- **Renderer bootstrap** – `SimpleExperience` builds a delta-timed render loop,
  hemisphere + directional lighting, and the 64×64 voxel island during
  `buildTerrain()` (`simple-experience.js`).
- **Tutorial overlay** – The onboarding briefing/tips appear via the
  `#gameBriefing` modal declared in `index.html` and closed after the intro
  handshake, matching the five-second fade requirement.

## 2. Core Gameplay Loop
- **First-person controls** – Pointer lock, WASD locomotion, jumping, gravity,
  and voxel interactions are implemented in
  `SimpleExperience.handleKeyDown/handlePointerMove/interactWithWorld`.
- **Crafting + scoring** – Crafting modal logic in `crafting.js` updates the
  inventory, awards score, and refreshes the HUD (`simple-experience.js`
  hotbar sync path).

## 3. Characters and Entities
- **Player avatar** – The Steve GLTF is loaded, animated, and wired to the
  camera rig inside `SimpleExperience.loadPlayer()`.
- **Zombies and golems** – `spawnZombie/updateZombies` and
  `spawnGolem/updateGolems` implement chasing AI, combat damage, and guardian
  behaviour, while `combat-utils.js` handles heart deduction + respawn logic.

## 4. Portals, Dimensions, and Progression
- **Portal detection/shader** – `portal-mechanics.js` validates a 4×3 frame and
  supplies animated shader uniforms. `simple-experience.js` consumes these in
  `tryActivatePortal()` and `transitionToDimension()`.
- **Dimension modifiers** – Gravity, rail speed, and palette swaps for each
  realm are defined in the `DIMENSION_THEME` array and applied during
  `setDimensionTheme()`.

## 5. Inventory, UI, and Feedback
- **Hotbar & extended inventory** – The nine-slot hotbar, inventory modal, and
  tooltip updates run through `syncInventoryUI()` and DOM hooks declared in
  `index.html` and styled by `styles.css`.
- **Underwater bubbles + health** – HUD updates (`updateAirDisplay`,
  `updateHeartDisplay`) animate bubble depletion and heart shake on damage.

## 6. Backend Sync and Identity
- **Score synchronisation** – REST calls to the AWS API are triggered from
  `SimpleExperience.pushScoreUpdate()` and scoreboard refreshes in
  `script.js` (`loadScoreboardEntries`).
- **Google SSO + location** – `script.js` initialises Google Identity Services,
  stores the profile locally, and publishes location updates back to the
  gameplay runtime.

## 7. Audio, Performance, and Polish
- **Audio cues** – The Howler.js audio controller created in
  `createAudioController()` plays ambient loops, mining effects, and zombie
  moans tied to entity events.
- **Performance safeguards** – Frustum culling, chunk visibility, capped delta
  time, and instanced rails live inside `updateFrustumCulling()` and the render
  loop.
- **UI polish** – Tooltips, the "Made by Manu" footer, and responsive HUD are in
  `index.html`/`styles.css`; victory modals + replay actions are wired in
  `simple-experience.js`.

## 8. Testing and Validation
- **Automated coverage** – Combat, crafting, portal logic, and scoreboard
  utilities are unit tested via `tests/*.test.js`; smoke/E2E flows run through
  `tests/e2e-check.js` and the manual verification suite documented in
  `docs/validation-matrix.md`.

> All gaps noted in earlier audits remain tracked in
> `docs/portals-of-dimension-plan.md` for future roadmap work.
