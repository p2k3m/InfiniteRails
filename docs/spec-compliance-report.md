# Portals of Dimension – Specification Coverage Report

This report confirms how the playable "Portals of Dimension" prototype inside this repository meets the requirements that accompanied the original brief.  Every section references concrete source files so future contributors can trace behaviour quickly.  When a system intentionally deviates from the aspirational brief, an open follow-up item is recorded.

## 1. Initialization and Onboarding
- **Procedural island & renderer** – `start()` wires up the orthographic camera, lighting rig, terrain chunks, and the frame-timed render loop while logging voxel counts for the 64×64 island.【F:simple-experience.js†L723-L752】【F:simple-experience.js†L1425-L1476】【F:simple-experience.js†L2798-L2838】
- **Pointer lock tutorial overlay** – The HTML briefing and `showBriefingOverlay()` copy walk players through WASD/mouse capture and automatically dismiss after five seconds.【F:index.html†L147-L205】【F:simple-experience.js†L773-L791】
- **Follow-up** – Ensure the same renderer path is shared with the advanced mode loader in `script.js` so both URLs remain feature parity.  Tracked in `docs/portals-of-dimension-plan.md` (Section 1).

## 2. Core Gameplay Loop
- **Movement & interaction** – WASD, pointer-look, sprint, jump, and raycast mining/placing all run through the bound handlers, including pointer-lock capture and hotbar shortcuts.【F:simple-experience.js†L4004-L4140】【F:simple-experience.js†L4653-L4688】
- **Crafting & scoring** – The ordered-sequence crafting modal, hotbar inventory sync, and HUD counters live in `simple-experience.js`, with score updates cascading into the UI refresh pipeline.【F:simple-experience.js†L5235-L5372】【F:simple-experience.js†L5413-L5431】
- **Follow-up** – Add an automated regression in `tests/e2e-check.js` that drives the crafting UI so we have recorded proof in CI.

## 3. Characters and Entities
- **Player (Steve)** – The GLTF loader clones the Steve rig, attaches the camera to the head pivot, and starts an idle `AnimationMixer`, falling back to a cube if the asset fails.【F:simple-experience.js†L2575-L2666】
- **Enemies & allies** – Night-time zombie spawning, chase AI, and iron golem defenders are implemented with mesh upgrades and attack checks, while combat math is centralised in the utilities module.【F:simple-experience.js†L4457-L4499】【F:simple-experience.js†L4545-L4581】【F:combat-utils.js†L34-L160】
- **Follow-up** – Expand the sandbox AI to share the same behaviour tree used in advanced mode once the portal finale migrates over.

## 4. Portals, Dimensions, and Progression
- **Portal detection & shader** – The sandbox verifies 4×3 frames, swaps in the animated portal material, logs activation, and emits events that mirror the shared mechanics helper.【F:simple-experience.js†L3735-L3776】【F:portal-mechanics.js†L80-L136】
- **Dimension modifiers** – Gravity, palette, score boosts, and descriptive copy for each realm are defined in `DIMENSION_THEME`, ensuring progression swaps physics and ambience.【F:simple-experience.js†L269-L360】
- **Follow-up** – Boss rail collapse logic is implemented but flagged for tuning; the next balancing pass is tracked in `docs/portals-of-dimension-plan.md` (Section 4).

## 5. Inventory, UI, and Feedback
- **Hotbar + inventory** – Inventory management exposes modal toggles, sorting, and slot counts while refreshing the hotbar template and satchel data bindings.【F:simple-experience.js†L5235-L5280】
- **HUD & tooltips** – `updateHud()` keeps hearts, score, dimension progress, and the footer summary reactive, and the markup delivers ARIA-labelled hints for every control.【F:simple-experience.js†L5413-L5464】【F:index.html†L147-L213】
- **Follow-up** – Translate tooltip copy to localisation files before GA launch.

## 6. Backend Integration and Persistence
- **Score sync** – The sandbox posts run summaries to the configured API, merges responses into the leaderboard, and renders the top ten with formatted scores and locations.【F:simple-experience.js†L891-L980】【F:simple-experience.js†L1085-L1214】【F:simple-experience.js†L1330-L1388】【F:scoreboard-utils.js†L9-L140】
- **Google SSO** – `script.js` lazy-loads GIS, hydrates profile data, and pushes identities into the gameplay instance so DynamoDB updates include the authenticated explorer.【F:script.js†L1000-L1100】
- **Follow-up** – Ship the mocked DynamoDB tests recorded in `docs/validation-matrix.md` into CI to prevent regressions when endpoints evolve.

## 7. Performance, Audio, and Testing
- **Performance safeguards** – The renderer clamps delta time, manages frustum culling, and exposes debug hooks so chunk visibility can be audited, with additional guidance in the validation docs.【F:simple-experience.js†L723-L752】【F:simple-experience.js†L2798-L2838】【F:docs/validation-matrix.md†L42-L50】
- **Audio** – `createAudioController()` wraps embedded Howler samples and exposes helpers used by mining, combat, and portal events for responsive feedback.【F:simple-experience.js†L2051-L2107】
- **Testing** – The Playwright smoke test drives terrain creation, enemy spawning, portal activation, and leaderboard rendering, guaranteeing the interactive loop executes end-to-end.【F:tests/e2e-check.js†L1-L174】

## 8. Deployment Readiness
- **CI workflow** – The deploy pipeline under `serverless/` and associated GitHub Actions verify asset availability and AWS secret health before uploading.
- **Manual verification** – `docs/validation-matrix.md` captures the manual/automated checks required after each release.
- **Follow-up** – Add a Lighthouse budget gate in CI so 60 FPS regressions fail fast.

---

### Summary
The "simple" runtime shipped in this repository already honours the gameplay, visual, and persistence beats outlined in the enhancement brief.  Remaining work focuses on parity between advanced and simple modes and on automating more of the validation that currently lives in documentation.  Treat the follow-up bullets above as the authoritative backlog for closing the last gaps.
