# Infinite Rails – Enhancement Roadmap

This document summarises the comprehensive changes that are required to transform the current Infinite Rails prototype into the Minecraft-inspired experience described in the latest design brief. Each section corresponds to the categories outlined in the specification and expands the work into concrete engineering tasks, dependencies, and validation steps. The goal is to provide an actionable backlog that a feature team (or coding agent) can execute iteratively.

> **Status disclaimer:** The present codebase does not yet implement the mechanics that follow. This roadmap captures the agreed direction so that the missing capabilities can be delivered in a structured sequence without regressing existing UI integrations (scoreboard, identity, deployment).

## 1. Rendering and World Generation

- [ ] Introduce a dedicated `RenderingPipeline` module that encapsulates Three.js initialisation, renderer configuration, and resize handling.
- [ ] Procedurally generate a 64×64 voxel island (BoxGeometry-based instancing) with adjustable seed per dimension.
- [ ] Implement a day/night lighting system using a Hemisphere light for ambient fill and an orbiting Directional light.
- [ ] Target a consistent 60 FPS render loop (`THREE.Clock` + `requestAnimationFrame`) with delta-based updates feeding physics, AI, and UI refresh.

## 2. Player Presence and Animation

- [ ] Load the Steve-inspired GLTF rig and attach the camera to the head bone for first-person rendering.
- [ ] Provide a fallback blocky avatar when the asset fails to load (offline safety).
- [ ] Wire an `AnimationMixer` for idle/walk cycles, blending based on movement speed, with on-demand emotes for crafting success.

## 3. Input and Mobility

- [ ] Desktop controls: pointer-lock mouse look (yaw only), WASD/Space movement with gravity-aware jumps, left/right click mining and block placement.
- [ ] Mobile controls: virtual joystick + tap gestures for look and mining, respecting accessibility settings.
- [ ] Physics: axis-aligned collision checks against voxel grid, crouch auto-engage on ledge approach, configurable speed multipliers per dimension.

## 4. Entities and Combat Loop

- [ ] Spawn zombies at night using the combat utilities grid pathfinder; update their AI to chase the player while avoiding void tiles.
- [ ] Add iron golems that patrol the spawn radius and prioritise nearby zombies with cooldown-limited strikes.
- [ ] Health model: hearts UI decrements in half-heart increments, respawn at origin after five hits, inventory persists via snapshot.

## 5. Crafting and Inventory Systems

- [ ] Represent the hotbar and satchel as data structures synchronised with the HUD; provide drag-and-drop in the crafting modal.
- [ ] Validate crafting sequences against recipe definitions (`crafting.js`), award score increments, and animate success confetti.
- [ ] Persist known recipes to `localStorage` and DynamoDB so unlocks survive reloads.

## 6. Portals, Dimensions, and Progression

- [ ] Detect valid 4×3 portal frames, trigger shader-based portal surfaces, and transition scenes while preserving player orientation.
- [ ] Generate unique biome parameters per dimension (gravity, rail curvature, loot tables) and track progression order.
- [ ] Implement the Netherite dimension boss encounter with collapsing rails, Eternal Ingot pickup, and victory modal activation.

## 7. Backend Integration

- [ ] Connect game events to the AWS API layer: POST score updates, GET leaderboard, sync identity after Google SSO.
- [ ] Handle offline mode gracefully with queued updates and exponential backoff retries.
- [ ] Extend the Serverless deployment workflow to verify asset availability (textures, GLTF, SFX) prior to publishing.

## 8. Audio, UI Polish, and Accessibility

- [ ] Integrate Howler.js-backed SFX (mining, footsteps, zombie groans) with mute toggle in settings.
- [ ] Provide tooltips and tutorial overlays that fade after onboarding, plus responsive layout adaptations for mobile.
- [ ] Add a footer crediting "Made by Manu" and ensure all controls have ARIA labels/tooltips.

## 9. Validation and Tooling

- [ ] Expand `docs/validation-matrix.md` with automated browser-based smoke tests (movement, crafting, portal activation).
- [ ] Profile the render loop using Chrome Tracing to ensure frame time stays under 16 ms on mid-tier hardware.
- [ ] Update GitHub Actions to run linting, bundle verification, and asset compression checks before deployment.

---

### Suggested Execution Order

1. Rendering pipeline + player controls (Sections 1–3)
2. Core gameplay loop (Sections 4–6)
3. Backend, audio, and polish (Sections 7–8)
4. Testing and deployment automation (Section 9)

Each milestone should be validated in-browser and accompanied by telemetry hooks so that gameplay metrics can be surfaced in DynamoDB-backed leaderboards.

### Tracking

Use GitHub Projects (or Linear) to convert each checkbox into tasks with acceptance criteria, linking back to this roadmap for traceability.
