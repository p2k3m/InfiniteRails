# Infinite Rails – Enhancement Roadmap

This document summarises how the “Comprehensive Analysis and Enhancement Specifications” backlog maps onto the current codebase.
Every section now records both the delivered sandbox implementation and the remaining parity work required for the experimental
advanced renderer. Treat the checked items as shipped functionality within `simple-experience.js`; the unchecked follow-up tasks
focus on lifting the same behaviour into the advanced path or extending our automation.

> **Status update:** The sandbox renderer satisfies the entire gameplay brief today. Reference links below point to the live
> implementation so future contributors can cross-check behaviour before porting features into the advanced renderer.

## 1. Rendering and World Generation

- [x] Introduce a dedicated bootstrap that encapsulates Three.js initialisation, renderer configuration, and resize handling for
      the sandbox renderer.【F:simple-experience.js†L1417-L1496】
- [x] Procedurally generate a 64×64 voxel island (BoxGeometry terrain with chunk culling) seeded per dimension, logging
      `World generated: 4096 voxels` for verification.【F:simple-experience.js†L2911-L3050】
- [x] Implement a ten-minute day/night cycle with hemisphere fill and an orbiting directional light that syncs with the HUD.
      【F:simple-experience.js†L4517-L4555】
- [ ] Mirror the sandbox rendering pipeline inside the advanced renderer so both code paths expose the same voxel scene.

## 2. Player Presence and Animation

- [x] Load the Steve GLTF rig, attach the camera to the head bone for first-person rendering, and fall back to a blocky avatar
      when assets fail offline.【F:simple-experience.js†L2399-L2443】
- [x] Drive idle/walk animation mixers and procedural hand sway in response to movement speed.【F:simple-experience.js†L2446-L2536】
- [ ] Port the player rig and animation stack into the advanced renderer, maintaining identical perspective and animation cues.

## 3. Input and Mobility

- [x] Bind pointer-lock mouse look, WASD/Space controls, mining/placement raycasts, and joystick/touch fallbacks for mobile.
      【F:simple-experience.js†L3895-L4339】
- [x] Apply delta-scaled physics with voxel collisions, jump curves, and crouch assists per dimension.【F:simple-experience.js†L4339-L4384】
- [ ] Share the input system with the advanced renderer and expose a reusable controller module for future gameplay extensions.

## 4. Entities and Combat Loop

- [x] Spawn zombies nightly using grid-aware AI, deduct hearts on collision, and respawn the player after five hits while
      preserving inventory.【F:simple-experience.js†L4565-L4758】
- [x] Auto-summon iron golems that prioritise nearby zombies and coordinate defence behaviour.【F:simple-experience.js†L4759-L4864】
- [ ] Back-port entity AI, combat hooks, and respawn flow to the advanced renderer once its terrain is online.

## 5. Crafting and Inventory Systems

- [x] Represent the hotbar/satchel as synced data structures, enable drag-to-sequence crafting, and animate success confetti.
      【F:simple-experience.js†L5250-L5334】
- [x] Persist recipe unlocks and inventory state across sessions/localStorage and DynamoDB score submissions.【F:simple-experience.js†L5324-L5384】
- [ ] Extract shared inventory/crafting modules so the advanced renderer can reuse the sandbox pipelines without duplication.

## 6. Portals, Dimensions, and Progression

- [x] Detect 4×3 portal frames, energise shader-driven surfaces, and transition sequential dimensions with gravity/loot
      modifiers plus Netherite victory flow.【F:simple-experience.js†L3795-L3821】【F:simple-experience.js†L4985-L5076】
- [x] Award score, update HUD overlays, and record unlocked realms for leaderboard payloads.【F:simple-experience.js†L1322-L1378】
- [ ] Reuse the portal system inside the advanced renderer and add new biome variants once parity is achieved.

## 7. Backend Integration

- [x] POST score updates, GET leaderboard entries, and capture Google SSO identity/location with retry-aware fallbacks.
      【F:simple-experience.js†L895-L1004】【F:simple-experience.js†L1322-L1404】
- [x] Queue offline submissions and merge remote responses into the local leaderboard cache.【F:simple-experience.js†L1360-L1404】
- [ ] Extend the Serverless deployment workflow with asset validation and telemetry once advanced-mode parity lands.

## 8. Audio, UI Polish, and Accessibility

- [x] Integrate Howler-backed ambience/SFX with settings toggles and subtitle feed.【F:simple-experience.js†L2130-L2200】
- [x] Provide tutorial overlays, tooltips, responsive HUD, and a persistent “Made by Manu” footer matching the brief.
      【F:index.html†L196-L275】【F:styles.css†L1420-L1533】
- [ ] Expand reduced-motion and colour-contrast preferences during the advanced renderer uplift.

## 9. Validation and Tooling

- [x] Document the validation matrix and ship a Playwright smoke test that verifies rendering, zombies, portals, and leaderboard
      updates end-to-end.【F:docs/validation-matrix.md†L1-L120】【F:tests/e2e-check.js†L1-L200】
- [ ] Profile the advanced renderer’s frame time and wire bundle-size/FPS budgets into CI once parity work begins.
- [ ] Update GitHub Actions to include asset compression checks alongside the existing deployment workflow.

---

### Suggested Execution Order

1. Lift sandbox rendering + controls into the advanced path (Sections 1–3 outstanding items).
2. Port the core gameplay loop (Sections 4–6 outstanding items).
3. Align backend/audio polish between renderers (Sections 7–8 outstanding items).
4. Expand automation and deployment telemetry (Section 9 outstanding items).

Each milestone should be validated with the existing Playwright suite and the in-browser debug overlay (`window.__INFINITE_RAILS_DEBUG__`) before shipping to production.

### Tracking

Track the unchecked items in GitHub Projects (or Linear) and reference the citations above when creating parity tasks. This keeps
the roadmap anchored to proven sandbox behaviour while signalling exactly what still needs to be uplifted for the advanced renderer.
