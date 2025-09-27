# Infinite Rails Enhancement Roadmap

This document captures the comprehensive feature and polish requests that
accompanied the "Comprehensive Analysis and Enhancement Specifications for
Infinite Rails: Portals of Dimension" brief. The checklist is grouped by the
major systems discussed in the brief so that each improvement can be tracked and
implemented iteratively without losing sight of the overall vision. For teams
using automated coding assistants, the verbatim task prompts from the brief are
archived in [`coding-agent-prompts.md`](./coding-agent-prompts.md) so they can be
shared directly with your tooling when a checklist item needs to be revisited.

> **Reality check (April 2024)** – The prior version of this roadmap erroneously
> marked every item as shipped even though the project still renders an empty
> scene. All sections below now reflect the true status of the codebase. Use the
> [portals-of-dimension plan](./portals-of-dimension-plan.md) for the detailed
> engineering breakdown behind each unchecked box.

## Rendering & World Simulation

- [ ] Initialise a Three.js-powered render loop using the bundled r161 build
      and ensure it survives CDN failure. No render loop currently runs.
- [ ] Populate a 64×64 voxel island with lighting, skybox, and day/night cycle.
      The world group is empty and nothing is drawn to the canvas.
- [ ] Deliver a delta-time driven loop that can sustain 60 FPS on mid-tier
      devices. Frame pacing is absent and there is no performance telemetry.

## Player Experience

- [ ] Load and display the Steve GLTF model in first-person view (arms/hands
      visible). No avatar is currently rendered.
- [ ] Bind WASD + mouse look + mobile virtual joystick for locomotion. Event
      listeners exist but do not manipulate the scene.
- [ ] Implement mining, block placement, and inventory updates using
      raycasting. Mining and placement buttons are non-functional.

## Entities & Combat

- [ ] Spawn zombies during the night cycle and implement chase AI. There are no
      hostile entities at present.
- [ ] Spawn allied iron golems that defend the player. Friendly AI has not been
      created.
- [ ] Deduct hearts on zombie contact and trigger respawn after five hits. The
      HUD never updates because damage is not tracked.

## Crafting & Progression

- [ ] Implement hotbar inventory and 3×3 crafting modal with recipe validation.
      The UI renders but cannot be interacted with.
- [ ] Award score for successful recipes and dimension unlocks. Scores stay at
      zero because nothing modifies them.
- [ ] Build portal frames that open new dimensions with custom rules and
      transition shaders. Portal logic is unimplemented.

## Backend, UI, and Polish

- [ ] Sync scores to the AWS backend and refresh the leaderboard modal. No
      runtime calls are made yet.
- [ ] Wire Google Sign-In to attribute runs and persist unlocks. UI buttons
      exist but the flow is stubbed.
- [ ] Add responsive HUD feedback, tooltips, and ambient audio cues. HUD values
      stay static and no audio is played.

## QA & Deployment

- [ ] Document automated validation steps and smoke tests for the browser
      build. The validation matrix needs to be refreshed once features land.
- [ ] Ensure the deploy pipeline verifies assets and reports FPS health checks.
      No automated performance reporting exists yet.

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
