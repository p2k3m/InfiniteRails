# Infinite Rails Enhancement Plan

## Overview
This document enumerates the functional and technical gaps identified in the current Infinite Rails prototype and specifies the corrective actions required to transform it into an interactive Minecraft-inspired experience. It reconciles the "Thought for 22s" audit, the repository walkthrough, and the README expectations with concrete engineering tasks. Every requirement listed in the audit has an associated remediation item below, with additional clarifications where behaviour was ambiguous or underspecified.

## Experience Goals
- **Immersive 3D sandbox**: Full-screen Three.js canvas, persistent render loop, and procedurally generated 64×64 voxel islands that evolve with the day/night cycle.
- **Playable survival loop**: First-person locomotion, mining and building, crafting progression, combat with zombies, and portal-based dimension traversal culminating in a Netherite boss encounter.
- **Connected ecosystem**: Google SSO, DynamoDB-backed score synchronisation, audio feedback, and deployable CloudFront bundle targeting 60 FPS across desktop and mobile clients.

## Gap Assessment and Remediation Tasks
The table below maps each audit pointer to explicit implementation work. If the source material implied functionality without technical detail, the missing specification is supplied here.

| Area | Current Gap | Required Enhancements |
| --- | --- | --- |
| **Rendering & World Generation** | Empty scene; no voxels or lighting. | Instantiate Three.js scene during `bootstrap()` with persistent game loop; generate 64×64 island via `BoxGeometry` meshes, grouped under `worldGroup`. Add hemisphere & directional light with 600 s orbit to drive the sky. Console verification: `World generated: 4096 voxels`. |
| **Player Visibility** | No visible avatar; first-person camera detached. | Implement `loadPlayerModel()` with `GLTFLoader` (fallback cube). Attach camera to Steve model head, ensure idle animation via `AnimationMixer`, and confirm hands visible in first-person. |
| **Input & Responsiveness** | Keyboard/mouse handlers missing; pointer lock absent. | Finish `initEventListeners()` adding WASD movement, yaw-only mouse look, click mining/placing with raycasts, pointer lock acquisition, and virtual joystick for mobile. Maintain `pressedKeys` set and delta-based velocity. |
| **Entities & Combat** | No zombies or golems; health static. | Provide `createZombie()` and `createGolem()` factories that add GLTF entities at runtime, apply chase/defend AI, deduct hearts on collision, trigger respawn after five hits, and coordinate audio cues via Howler.js. |
| **Crafting & Inventory** | Hotbar inert, crafting modal absent. | Store inventory as ten-slot structure, support dragging resources into 3×3 crafting modal and linear sequence UI. Validate recipes (e.g., sticks + stone → pickaxe), update HUD, and animate feedback. |
| **Portals & Dimensions** | Portal frames never activate; worlds static. | Detect 4×3 frames, enable shader-driven swirl when lit, transition `worldGroup` contents between Grassland → Rock → Stone → Tar → Marble → Netherite. Apply dimension modifiers (gravity, loot) and score rewards. Implement Netherite boss with collapsing rails and Eternal Ingot reward. |
| **Progression & Victory** | No dimension tracking or win state. | Maintain `currentDimension` index, persist unlocks in `localStorage`/DynamoDB, and present victory modal with leaderboard rank and replay option after Netherite success. |
| **UI & Feedback** | HUD elements static, no guidance. | Update hearts, score, dimension bar, hotbar, and bubble UI every frame; add tooltips, tutorial overlay, leaderboard modal, guide modal, and footer credit "Made by Manu". |
| **Audio & Polish** | Lacks ambient cues and mining sounds. | Load ambient loops and action SFX via Howler.js, with toggles in settings modal. Synchronise with events (mining, zombie hits, portal activation). |
| **Backend Integration** | Lambda endpoints unused; SSO idle. | On score changes or dimension unlocks, POST to `/scores`; fetch leaderboard on modal open. Implement Google SSO sign-in, location capture, and `/users` POST. Handle errors with retries/backoff. |
| **Performance** | No delta time, asset preloading, or culling. | Use `THREE.Clock` delta, limit render to 60 FPS target, apply frustum culling/LOD, lazy-load dimension assets, and compress GLTF/texture assets (AVIF/DRACO). |
| **Testing & Deployment** | No automated validation; missing asset sync. | Add Puppeteer-based smoke tests, document manual QA matrix, and extend GitHub Actions workflow with asset sync and performance budget checks. |

## Implementation Sequencing
1. **Engine bring-up**: Rendering, player model, input loop.
2. **Core loop**: Mining, inventory, crafting, HUD updates.
3. **Enemies & survival**: Zombie AI, health, golems, audio feedback.
4. **Dimensions & portals**: Frame detection, shader transitions, progression tracking.
5. **Backend wiring**: Score sync, SSO, leaderboard modal, persistence.
6. **Polish & QA**: Tutorials, accessibility, automated tests, deployment fixes.

Each stage should deliver shippable increments with instrumentation (console metrics, in-game overlays) to confirm behaviour before advancing.

## Coding Agent Prompt Suite
The following refined prompts correspond one-to-one with the implementation stages and incorporate validation hooks, error handling expectations, and fallbacks. They expand the audit instructions for direct use with coding copilots.

1. **Rendering and World Generation**
   - Extend `bootstrap()` to load Three.js (preferring local vendor bundle), create `scene`, `camera`, `renderer`, `clock`, and `worldGroup`.
   - Generate 64×64 voxel terrain using seeded noise for height variance and apply textures from `assets/textures/{grass,dirt,stone}.png`.
   - Configure ambient (`HemisphereLight`) and key (`DirectionalLight`) lighting with orbital animation and update the sky shader uniform for day/night.
   - Begin `gameLoop(delta)` via `requestAnimationFrame`, logging `World generated: 4096 voxels` on completion and guarding against multiple initialisations.

2. **Player Model and Perspective**
   - Implement `loadPlayerModel()` using `GLTFLoader` with DRACO support; attach camera to the head bone, ensure first-person arms via layered rig, and start idle animation.
   - Provide fallback prism mesh if model load fails, logging `Model load failed, using fallback cube` and ensuring game remains playable.

3. **Input Controls and Responsiveness**
   - Finalise `initEventListeners()` hooking keyboard, mouse, pointer lock, and mobile joystick events, with movement speeds scaled by delta time.
   - Raycast from camera to manage mining (left click) and block placement (right click), snapping positions to voxel grid.
   - Add tutorial overlay that fades after five seconds, reminding users of WASD/mouse controls.

4. **Entities and Combat Loop**
   - Create `spawnZombie()` and `spawnGolem()` utilities with pooled GLTF assets, scheduling spawns based on day/night ratio.
   - Update game loop to drive AI pursuit/defence, collision damage, heartbeat UI updates, respawn logic, and Howler.js audio cues.

5. **Crafting, Inventory, and UI Dynamics**
   - Implement hotbar, inventory management, and crafting modal logic (drag-and-drop, recipe validation, score updates, animations).
   - Sync UI components each frame using requestAnimationFrame and apply CSS transitions for selection and damage flashes.

6. **Portals, Dimensions, and Progression**
   - Detect completed portal frames, activate shader effects, transition to new dimensions with environment modifiers, and award score bonuses.
   - Implement Netherite dimension boss puzzle with collapsing rails, Eternal Ingot reward, and victory modal that summarises stats and leaderboard rank.

7. **Backend Sync, Audio, and Deployment**
   - Integrate Google SSO via gapi, fetch/post scoreboard data, log successes, and handle failures with retries.
   - Load ambient/sfx audio assets through Howler.js with mute toggles.
   - Update deployment workflow to include asset sync, smoke tests, and FPS/performance budget reporting.

## Testing Strategy
- **Automated**: Puppeteer scripts covering onboarding, movement, mining, crafting, combat, portal activation, and leaderboard sync.
- **Manual**: Cross-browser matrix (Chrome, Firefox, Edge, Safari), mobile touch verification, latency checks (<3 s asset load).
- **Performance**: FPS counter overlay with threshold alerts (<50 FPS triggers warning in console). Monitor asset bundle sizes (max 15 MB compressed).

## Additional Recommendations
- Introduce feature flags for experimental mechanics (e.g., boss AI tweaks) to support A/B testing.
- Maintain telemetry hooks (custom events) feeding DynamoDB to analyse player progression and drop-offs.
- Document controls and accessibility options within the guide modal, ensuring color contrast and keyboard navigation compliance.

---
Prepared to guide implementation sprints and align contributor efforts with the "Thought for 22s" enhancement objectives.
