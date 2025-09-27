# Infinite Rails Enhancement Roadmap

This document captures the comprehensive feature and polish requests that
accompanied the "Comprehensive Analysis and Enhancement Specifications for
Infinite Rails: Portals of Dimension" brief. The checklist is grouped by the
major systems discussed in the brief so that each improvement can be tracked and
implemented iteratively without losing sight of the overall vision.

## Rendering & World Simulation

- [x] Initialize a Three.js powered render loop using the bundled r161 build
      (see `SimpleExperience.start()` which creates the renderer, lights, and
      animation loop before exposing the sandbox). See
      [`simple-experience.js`](../simple-experience.js).
- [x] Populate a 64×64 voxel island with lighting, skybox, and day/night cycle
      (procedural generation takes place in `buildTerrain()`/`buildRails()` and
      the day/night cycle is advanced inside `updateDayNightCycle`). See
      [`simple-experience.js`](../simple-experience.js).
- [x] Ensure the render loop is delta-time driven and holds 60 FPS on mid-tier
      devices. `tick()` pulls a shared `THREE.Clock` delta and clamps the loop
      to 60 FPS while logging performance counters. See
      [`simple-experience.js`](../simple-experience.js).

## Player Experience

- [x] Load and display the Steve GLTF model in first-person view (arms/hands
      visible). `loadHandModels()` and `upgradePlayerModel()` attach the model
      to the camera rig for the sandbox. See
      [`simple-experience.js`](../simple-experience.js).
- [x] Bind WASD + mouse look + mobile virtual joystick for locomotion. Desktop
      keyboard/mouse listeners live in `bindDesktopControls()` and mobile touch
      control is handled via `bindMobileControls()`. See
      [`simple-experience.js`](../simple-experience.js).
- [x] Implement mining, block placement, and inventory slot updates using
      raycasting. `handlePrimaryAction()`/`handleSecondaryAction()` perform the
      raycasts and update the hotbar state. See
      [`simple-experience.js`](../simple-experience.js).

## Entities & Combat

- [x] Spawn zombies during the night cycle and implement basic chase AI.
      `maybeSpawnZombie()` gates spawns on daylight percentage and
      `updateZombies()` drives pursuit behaviour. See
      [`simple-experience.js`](../simple-experience.js).
- [x] Spawn allied iron golems that defend the player. `maybeSpawnGolem()` and
      `updateGolems()` orchestrate allied behaviour each tick. See
      [`simple-experience.js`](../simple-experience.js).
- [x] Deduct hearts on zombie contact and trigger respawn after five hits.
      `applyZombieStrike()` and `respawnPlayer()` are invoked from
      `checkZombieCollisions()`. See [`simple-experience.js`](../simple-experience.js).

## Crafting & Progression

- [x] Implement hotbar inventory and 3×3 crafting modal with recipe validation.
      `updateCraftingUi()` reflects drag events while `completeCraftingSequence`
      validates recipes. See [`simple-experience.js`](../simple-experience.js).
- [x] Award score for successful recipes and dimension unlocks. The sandbox
      increments totals within `grantRecipeScore()` and `advanceDimension()`. See
      [`simple-experience.js`](../simple-experience.js).
- [x] Build portal frames that open new dimensions with custom rules and
      transition shaders. `activatePortal()` creates the animated surface and
      `advanceDimension()` applies realm-specific physics. See
      [`simple-experience.js`](../simple-experience.js).

## Backend, UI, and Polish

- [x] Sync scores to the AWS backend and refresh the leaderboard modal. The
      sandbox defers to `loadScoreboard()`/`syncScore()` for Dynamo-ready API
      calls. See [`simple-experience.js`](../simple-experience.js).
- [x] Wire Google Sign-In to attribute runs and persist unlocks. The identity
      harness in `setupSimpleExperienceIntegrations()` handles GIS buttons,
      fallback flows, and persistence. See [`script.js`](../script.js).
- [x] Add responsive HUD feedback, tooltips, and ambient audio cues. HUD wiring
      lives in `updateHud()`/`updateTooltips()` and audio cues are orchestrated
      via `this.audio`. See [`simple-experience.js`](../simple-experience.js).

## QA & Deployment

- [x] Document automated validation steps and smoke tests for the browser
      build. See [`docs/validation-matrix.md`](./validation-matrix.md).
- [x] Ensure deploy pipeline verifies assets and reports FPS health checks. The
      GitHub Actions workflow now calls out FPS metrics in its health summary.
      See [`docs/validation-matrix.md`](./validation-matrix.md) for coverage and
      [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) for
      deployment wiring.

---

### Additional follow-ups

- [ ] Continue iterating on the advanced renderer so it reaches feature parity
      with the sandbox before flipping the default flag.
- [ ] Add automated regression for mobile virtual joystick gestures to mirror
      the existing WASD Puppeteer run.
- [ ] Expand shader recovery tests around the portal material to catch missing
      uniforms earlier in development builds.

---

> **Note**
> This roadmap is intentionally granular so that individual improvements can be
> implemented and reviewed across multiple pull requests. Each checkbox should
> be checked off once the corresponding feature is working in the playable
> prototype.
