# Portals of Dimension – Feature Verification Audit

This checklist re-validates the "Portals of Dimension" gameplay brief against the
current codebase.  Each requirement from the follow-up specification is mapped to
the concrete implementation files so future contributors can locate the
behaviour quickly.

## 1. Initialization and Onboarding
- **Renderer bootstrap** – `SimpleExperience` builds a delta-timed render loop, hemisphere + directional lighting, and the 64×64 voxel island during `buildTerrain()` (`simple-experience.js`).【F:simple-experience.js†L688-L716】【F:simple-experience.js†L1191-L1271】【F:simple-experience.js†L2428-L2499】
- **Tutorial overlay** – The onboarding briefing/tips appear via the `#gameBriefing` modal declared in `index.html` and close after the intro handshake, matching the five-second fade requirement.【F:simple-experience.js†L738-L757】【F:index.html†L154-L180】

## 2. Core Gameplay Loop
- **First-person controls** – Pointer lock, WASD locomotion, jumping, gravity, and voxel interactions are implemented in `SimpleExperience` so input immediately affects the sandbox world.【F:simple-experience.js†L3680-L3864】
- **Crafting + scoring** – Crafting modal logic in `crafting.js` updates the inventory, awards score, and refreshes the HUD (`simple-experience.js` hotbar sync path).【F:crafting.js†L1-L219】【F:simple-experience.js†L4560-L4651】【F:simple-experience.js†L5017-L5071】

## 3. Characters and Entities
- **Player avatar** – The Steve GLTF is loaded, animated, and wired to the camera rig inside `SimpleExperience.loadPlayer()`.【F:simple-experience.js†L2094-L2172】
- **Zombies and golems** – `spawnZombie/updateZombies` and `spawnGolem/updateGolems` implement chasing AI, combat damage, and guardian behaviour, while `combat-utils.js` handles heart deduction + respawn logic.【F:simple-experience.js†L4063-L4217】【F:combat-utils.js†L148-L239】

## 4. Portals, Dimensions, and Progression
- **Portal detection/shader** – `portal-mechanics.js` validates a 4×3 frame and supplies animated shader uniforms. `simple-experience.js` consumes these in `ignitePortal()`/`activatePortal()` and the dimension transition flow.【F:portal-mechanics.js†L1-L145】【F:simple-experience.js†L3280-L3485】
- **Dimension modifiers** – Gravity, rail speed, and palette swaps for each realm are defined in the `DIMENSION_THEME` array and applied during `advanceDimension()` alongside the Netherite rail collapse challenge.【F:simple-experience.js†L251-L360】【F:simple-experience.js†L3488-L3567】【F:simple-experience.js†L2661-L2888】

## 5. Inventory, UI, and Feedback
- **Hotbar & extended inventory** – The nine-slot hotbar, inventory modal, and tooltip updates run through the inventory synchronisation helpers, keeping the HUD responsive on desktop + mobile (`index.html` and `styles.css`).【F:simple-experience.js†L4560-L4651】
- **Underwater bubbles + health** – HUD updates render heart glyphs, portal progress, and related vitals each frame, ensuring visual feedback for damage and status changes.【F:simple-experience.js†L374-L395】【F:simple-experience.js†L5017-L5071】

## 6. Backend Sync and Identity
- **Score synchronisation** – REST calls to the AWS API are triggered from `SimpleExperience.loadScoreboard()`/`scheduleScoreSync()` while `script.js` drives the cross-session leaderboard state (`loadScoreboard`).【F:simple-experience.js†L792-L886】【F:simple-experience.js†L3926-L3943】【F:script.js†L18581-L18648】
- **Google SSO + location** – `script.js` initialises Google Identity Services, stores the profile locally, and publishes location updates back to the gameplay runtime, which exposes identity hooks for the sandbox.【F:script.js†L767-L938】【F:simple-experience.js†L1470-L1597】

## 7. Audio, Performance, and Polish
- **Audio cues** – The Howler.js audio controller created in `createAudioController()` plays ambient loops, mining effects, and zombie moans tied to entity events.【F:simple-experience.js†L1715-L1772】【F:simple-experience.js†L4188-L4213】
- **Performance safeguards** – Frustum culling, chunk visibility, capped delta time, and instanced rails live inside the render loop and terrain management utilities.【F:simple-experience.js†L3783-L3795】【F:simple-experience.js†L3946-L3979】
- **UI polish** – Tooltips, the "Made by Manu" footer, and responsive HUD are in `index.html`/`styles.css`; victory modals + replay actions are wired in `simple-experience.js`.【F:index.html†L950-L1055】【F:styles.css†L1420-L1533】【F:simple-experience.js†L3488-L3567】

## 8. Testing and Validation
- **Automated coverage** – Combat, crafting, portal logic, and scoreboard utilities are unit tested via `tests/*.test.js`; smoke/E2E flows run through `tests/e2e-check.js` and the manual verification suite documented in `docs/validation-matrix.md`.【F:tests/crafting.test.js†L1-L120】【F:tests/combat-utils.test.js†L1-L120】【F:tests/portal-mechanics.test.js†L1-L66】【F:docs/validation-matrix.md†L1-L120】
- **Runtime debug controls** – `SimpleExperience.exposeDebugInterface()` publishes `forceNight`, `spawnZombieWave`, `completePortalFrame`, `ignitePortal`, and `advanceDimension` helpers so automated tests can validate night combat, portal ignition, and dimension travel deterministically.【F:simple-experience.js†L5118-L5155】

> All gaps noted in earlier audits remain tracked in
> `docs/portals-of-dimension-plan.md` for future roadmap work.
