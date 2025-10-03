# Portals of Dimension Recovery Plan

This document unifies the design brief (“Comprehensive Analysis and Enhancement Specifications for Infinite Rails: Portals of Dimension”) with the current state of the repository. The sandbox renderer already satisfies the brief’s core gameplay requirements; the notes below focus on lifting the advanced renderer to the same standard and cataloguing stretch goals beyond the sandbox baseline. The prompts originally prepared for coding agents remain available in [`docs/coding-agent-prompts.md`](./coding-agent-prompts.md) for focused automation work.

## 1. Initialization and Onboarding

**Spec intent**: Load into a full-screen Three.js scene with a 64×64 grass island, day/night cycle, Steve spawn, and a five-second controls overlay.

**Current state**: Sandbox mode (`simple-experience.js`) instantiates the renderer, generates the terrain, animates lighting, and shows the onboarding overlay. Advanced mode still uses placeholder logic in `script.js` and needs to adopt the sandbox bootstrap.

**Action plan**:

1. Implement `bootstrap()` so it creates the renderer, camera, world group, lighting, and animation loop immediately after Three.js loads.
2. Procedurally generate the island by iterating a 64×64 grid and instancing `BoxGeometry` tiles with grass textures.
3. Add hemisphere + directional lights and animate the directional light to orbit on a 600-second cycle.
4. Render the first frame before removing the loading screen; log a message confirming voxel count for debugging.
5. Overlay a transient tutorial component in `index.html` that fades after five seconds or when the player moves.

## 2. Core Gameplay Loop

**Spec intent**: Support WASD movement, pointer lock mouse look, mining and placing voxels via raycast, crafting sequences, and responsive HUD updates.

**Current state**: The sandbox experience ships full movement, mining, crafting, and HUD feedback loops. Advanced mode still relies on stubbed event handlers and must integrate the sandbox modules.

**Action plan**:

1. Add pointer lock handling and track a `pressedKeys` set for continuous movement.
2. Move the camera/character based on delta time, including gravity and jumping.
3. Use a `THREE.Raycaster` from the camera to determine targeted blocks. Left click removes a voxel and adds it to inventory; right click places from the selected hotbar slot.
4. Build a 10-slot inventory model and synchronise it with DOM hotbar elements.
5. Implement the crafting modal: drag items into recipe slots, validate sequences, consume ingredients, and emit tools/score.
6. Ensure HUD elements (hearts, daylight bar, dimension label, score) update every frame.

## 3. Characters and Entities

**Spec intent**: Display Steve in first-person, spawn zombies at night, spawn iron golems for defence, apply damage on contact, and respawn after five hits.

**Current state**: Sandbox mode loads GLTF rigs for Steve, zombies, and golems, driving combat and respawn logic. Advanced mode lacks these runtime systems and should import the sandbox entity manager.

**Action plan**:

1. Load `steve.gltf` with `GLTFLoader`, attach arms to the camera, and loop the idle animation using `THREE.AnimationMixer`. Provide a cube fallback with console warnings.
2. Create an entity manager that stores zombies and golems with positions, health, and behaviour state.
3. Spawn 2–4 zombies along island edges when daylight drops below 50%. Use simple steering towards the player plus basic obstacle avoidance.
4. Spawn a golem near the player every 30 seconds at night. Target the nearest zombie and apply knockback/damage on collision.
5. Track player hearts. When a zombie contacts the player (distance < 1 unit), deduct 0.5 heart and trigger a brief screen shake. Respawn after five hits while preserving inventory.

## 4. Portals, Dimensions, and Progression

**Spec intent**: Allow players to build 4×3 portal frames, activate them with a torch interaction, transition between six dimensions with unique physics, and complete a Netherite boss encounter.

**Current state**: Sandbox portals, shaders, dimension transitions, and the Netherite finale are implemented. Advanced mode needs to reuse those mechanics and extend them with bespoke set pieces.

**Action plan**:

1. Detect when the player places blocks that form a 4×3 frame (using the helper library) and mark it as a candidate portal.
2. On interact (`F`), replace the frame interior with an animated shader plane. Animate `uTime` for the swirl effect.
3. When the player collides with the portal, fade out the screen, destroy the current island, and generate the next dimension’s terrain. Apply per-dimension modifiers (e.g., Rock = 1.5× gravity).
4. Track unlocked dimensions and award +5 points on arrival. Persist unlocks to localStorage/DynamoDB.
5. Implement the Netherite boss: collapsing rails via timed destruction, collect the Eternal Ingot, trigger the victory screen and scoreboard sync.

## 5. Crafting, Inventory, and Score Systems

**Spec intent**: Manage a 10-slot hotbar, stack items to 99, support ordered recipe crafting, award points, and show score updates.

**Current state**: Sandbox inventory, crafting, and scoring work end to end with backend sync hooks. Advanced mode should consume the same modules and plan additional late-game recipes.

**Action plan**:

1. Store hotbar entries as `{ itemId, count }` objects; enforce stacking limits.
2. Present crafting recipes in a draggable interface. Validate sequences (e.g., stick + stick + stone) and produce tools.
3. Update the score HUD when recipes succeed and when dimensions unlock. Post updates to the backend API (see section 7).
4. Persist unlocked recipes in `localStorage` and merge with server state on login.

## 6. UI, Audio, and Feedback

**Spec intent**: Keep the HUD minimal but dynamic (hearts, hotbar, score), add tooltips, provide a guide modal, surface a leaderboard modal, and play ambient/sfx audio.

**Current state**: Sandbox HUD, tooltips, modals, and audio cues are live through Howler.js integrations. Advanced mode needs to inherit those patterns and explore additional cinematic polish.

**Action plan**:

1. Bind buttons to modal toggles with ARIA attributes and keyboard navigation.
2. Add tooltips describing controls and gameplay hints.
3. Integrate Howler.js for ambient loops, mining sounds, zombie groans, and portal activation audio. Provide fallbacks when audio fails to load.
4. Animate HUD transitions with CSS for health loss, crafting success, and dimension changes.
5. Add a persistent “Made by Manu” footer per the brief.

## 7. Backend Integration and Persistence

**Spec intent**: Sync scores and user metadata with AWS Lambda/DynamoDB, support Google SSO, and fall back to offline storage when APIs are unreachable.

**Current state**: Sandbox mode posts runs to the configured API, hydrates the leaderboard, and completes Google SSO with GIS/gapi fallbacks. Advanced mode should reuse these integrations and expand persistence metadata.

**Action plan**:

1. Configure API helpers in `script.js` that POST score updates and user metadata after significant events (recipe success, dimension unlock, victory).
2. Handle optimistic updates in the UI and gracefully degrade to localStorage when the network fails.
3. Complete the Google Identity Services flow: render the button, handle the credential callback, exchange for profile info, and sync to `/users`.
4. Display the top 10 leaderboard entries in a modal pulled from `/scores`.
5. Persist unlocked recipes and dimensions server-side so returning players keep their progress.

## 8. Performance and Testing

**Spec intent**: Target 60 FPS with frustum culling and lazy asset loading. Document validation steps and automate smoke tests.

**Current state**: Sandbox mode uses delta-timed loops, chunk culling, and documents manual/automated validation. Advanced mode should inherit the same instrumentation and add CI regression traces.

**Action plan**:

1. Use `THREE.Clock` to drive the update loop and clamp frame times to avoid runaway deltas.
2. Implement frustum culling or chunk-level visibility checks for voxels and entities.
3. Lazy load GLTF models and textures with progress indicators. Cache assets to avoid repeated fetches.
4. Extend `docs/validation-matrix.md` with manual and automated test cases covering desktop and mobile interactions.
5. Add CI tasks (e.g., Playwright/Puppeteer) that run movement/mining/crafting smoke tests. Ensure GitHub Actions report FPS metrics after deploy.

## 9. Deployment Readiness

**Spec intent**: Provide a seamless CloudFront deployment with verified secrets, asset compression, and portal shader fallbacks.

**Current state**: The GitHub Actions workflow validates AWS secrets, provisions buckets/distributions, and publishes the build. Runtime health checks and FPS telemetry still need to be layered on.

**Action plan**:

1. Enhance `.github/workflows/deploy.yml` to validate that textures/GLTF assets exist before syncing.
2. Add a post-deploy health check that pings the live site, measures frame time via automated browser tooling, and records results in the run summary.
3. Document troubleshooting steps for missing AWS secrets and CDN cache invalidation failures.
4. Purge the CloudFront cache after every deploy so new models, textures, and scripts propagate immediately instead of lingering behind stale CDN entries.

---

### Delivery sequencing

A practical implementation order is:

1. Core rendering and player controls (Sections 1–2).
2. Entity systems and survival loop (Section 3).
3. Portals, crafting, and scoring (Sections 4–5).
4. UI polish, audio, and onboarding (Section 6).
5. Backend integration and persistence (Section 7).
6. Performance instrumentation and automated testing (Section 8).
7. Deployment automation and reporting (Section 9).

Each milestone should include updated documentation, gifs/screenshots, and validation notes so the roadmap and compliance table remain accurate.
