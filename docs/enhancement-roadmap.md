# Infinite Rails Enhancement Roadmap

This document captures the comprehensive feature and polish requests that
accompanied the "Comprehensive Analysis and Enhancement Specifications for
Infinite Rails: Portals of Dimension" brief. The checklist is grouped by the
major systems discussed in the brief so that each improvement can be tracked and
implemented iteratively without losing sight of the overall vision.

## Rendering & World Simulation

- [ ] Initialize a Three.js powered render loop using the bundled r161 build.
- [ ] Populate a 64×64 voxel island with lighting, skybox, and day/night cycle.
- [ ] Ensure the render loop is delta-time driven and holds 60 FPS on mid-tier
      devices.

## Player Experience

- [ ] Load and display the Steve GLTF model in first-person view (arms/hands
      visible).
- [ ] Bind WASD + mouse look + mobile virtual joystick for locomotion.
- [ ] Implement mining, block placement, and inventory slot updates using
      raycasting.

## Entities & Combat

- [ ] Spawn zombies during the night cycle and implement basic chase AI.
- [ ] Spawn allied iron golems that defend the player.
- [ ] Deduct hearts on zombie contact and trigger respawn after five hits.

## Crafting & Progression

- [ ] Implement hotbar inventory and 3×3 crafting modal with recipe validation.
- [ ] Award score for successful recipes and dimension unlocks.
- [ ] Build portal frames that open new dimensions with custom rules and
      transition shaders.

## Backend, UI, and Polish

- [ ] Sync scores to the AWS backend and refresh the leaderboard modal.
- [ ] Wire Google Sign-In to attribute runs and persist unlocks.
- [ ] Add responsive HUD feedback, tooltips, and ambient audio cues.

## QA & Deployment

- [ ] Document automated validation steps and smoke tests for the browser build.
- [ ] Ensure deploy pipeline verifies assets and reports FPS health checks.

---

> **Note**
> This roadmap is intentionally granular so that individual improvements can be
> implemented and reviewed across multiple pull requests. Each checkbox should
> be checked off once the corresponding feature is working in the playable
> prototype.
