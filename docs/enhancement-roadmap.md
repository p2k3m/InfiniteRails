# Infinite Rails Enhancement Roadmap

This document captures the comprehensive feature and polish requests that
accompanied the "Comprehensive Analysis and Enhancement Specifications for
Infinite Rails: Portals of Dimension" brief. The checklist is grouped by the
major systems discussed in the brief so that each improvement can be tracked and
implemented iteratively without losing sight of the overall vision. For teams
using automated coding assistants, the verbatim task prompts from the brief are
archived in [`coding-agent-prompts.md`](./coding-agent-prompts.md) so they can be
shared directly with your tooling when a checklist item needs to be revisited.

> **Status update (April 2024)** – The sandbox renderer now satisfies the
> "Comprehensive Analysis and Enhancement Specifications" brief. The checklist
> below tracks parity work for the advanced renderer and highlights polish tasks
> that extend beyond the sandbox implementation.

## Rendering & World Simulation

- [x] Initialise a Three.js-powered render loop using the bundled r161 build
      and ensure it survives CDN failure (`simple-experience.js`).【F:simple-experience.js†L1984-L2057】
- [x] Populate a 64×64 voxel island with lighting, skybox, and day/night cycle
      via sandbox terrain generation and light animation.【F:simple-experience.js†L1984-L2057】【F:simple-experience.js†L2656-L2799】
- [x] Deliver a delta-time driven loop that can sustain 60 FPS on mid-tier
      devices by pacing updates with clock deltas and frustum culling.【F:simple-experience.js†L2656-L2799】
- [ ] Port these systems into the advanced renderer path so both modes share the
      same world simulation.

## Player Experience

- [x] Load and display the Steve GLTF model in first-person view with animated
      arms and fallback assets.【F:simple-experience.js†L1740-L1876】
- [x] Bind WASD + mouse look + mobile virtual joystick for locomotion and
      pointer lock interactions.【F:simple-experience.js†L2641-L2760】
- [x] Implement mining, block placement, and inventory updates using
      raycasting.【F:simple-experience.js†L3300-L3392】【F:simple-experience.js†L3494-L3520】
- [ ] Align the advanced renderer controls with the sandbox implementation and
      add cinematic camera beats for boss encounters.

## Entities & Combat

- [x] Spawn zombies during the night cycle with chase AI and collision damage.【F:simple-experience.js†L3080-L3135】
- [x] Spawn allied iron golems that defend the player and intercept zombies.【F:simple-experience.js†L3191-L3257】
- [x] Deduct hearts on zombie contact and trigger respawn after five hits while
      updating the HUD.【F:simple-experience.js†L3270-L3297】【F:simple-experience.js†L3897-L3970】
- [ ] Extend advanced-mode enemy compositions (e.g., ranged mobs) and add
      difficulty scaling hooks.

## Crafting & Progression

- [x] Implement hotbar inventory and the crafting modal with ordered recipe
      validation.【F:simple-experience.js†L3271-L3655】
- [x] Award score for successful recipes and dimension unlocks with HUD updates
      and backend sync.【F:simple-experience.js†L3330-L3392】【F:simple-experience.js†L3753-L3964】
- [x] Build portal frames that open new dimensions with shader transitions and
      realm-specific physics.【F:simple-experience.js†L2108-L2462】
- [ ] Design additional late-game recipes and cosmetic unlock systems that sync
      via DynamoDB.

## Backend, UI, and Polish

- [x] Sync scores to the AWS backend and refresh the leaderboard modal when an
      API base URL is provided.【F:simple-experience.js†L593-L710】
- [x] Wire Google Sign-In to attribute runs, persist identity, and merge saved
      progress.【F:script.js†L720-L938】
- [x] Add responsive HUD feedback, tooltips, audio cues, and accessibility
      toggles.【F:index.html†L66-L204】【F:simple-experience.js†L3972-L4140】
- [ ] Build telemetry dashboards (FPS, latency) in the deployment workflow and
      expose in-game diagnostics for QA.

## QA & Deployment

- [x] Document automated validation steps and smoke tests for the browser build
      (see validation matrix and feature verification docs).【F:docs/validation-matrix.md†L1-L63】【F:docs/feature-verification.md†L1-L24】
- [x] Ensure the deploy pipeline verifies assets, provisions infra, and reports
      status in the summary.【F:.github/workflows/deploy.yml†L1-L160】【F:.github/workflows/deploy.yml†L161-L240】
- [ ] Capture automated FPS traces in CI and add regression alerts for
      performance cliffs.

---

### Additional follow-ups

- [ ] Continue iterating on the renderer until it matches the specifications in
      the design brief.
- [ ] Add automated regression for mobile virtual joystick gestures once the
      controls exist.
- [ ] Expand shader recovery tests around the portal material after portals are
      implemented.

---

> **Note**
> This roadmap is intentionally granular so that individual improvements can be
> implemented and reviewed across multiple pull requests. Each checkbox should
> be checked off once the corresponding feature is working in the playable
> prototype.
