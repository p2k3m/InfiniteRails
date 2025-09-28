# Infinite Rails Enhancement Plan

This checklist began as a roadmap for closing the gaps between the early
Infinite Rails prototype and the "Comprehensive Analysis and Enhancement
Specifications" brief. Every item below is now complete and the document serves
as an auditable record that the shipped sandbox meets the intended Minecraft-
style experience. The sections remain organised by system area so future work
can reference the finished implementation when planning refinements.

## 1. Rendering and World Generation
- [x] Replace the existing bootstrap routine with a Three.js r161 renderer that
      constructs a 64×64 voxel island on load.
- [x] Create a reusable `WorldBuilder` utility that instantiates the
      `THREE.Scene`, `OrthographicCamera`, lights, and a `worldGroup` container.
- [x] Generate 4,096 voxels (BoxGeometry) using streamed textures hosted on S3.
- [x] Add a `THREE.Clock`-driven game loop that renders at 60 FPS and exposes a
      `delta` value to downstream systems.
- [x] Implement a skybox with a 600 second day/night cycle controlling
      directional light intensity and color.

## 2. Player Model and First-Person Camera
- [x] Introduce a `loadPlayerModel` helper that loads `steve.gltf` via
      `THREE.GLTFLoader`, with a low-poly fallback if the asset fails to load.
- [x] Attach the camera to the player head bone to ensure a first-person view
      while keeping arms visible for interactions.
- [x] Configure an `AnimationMixer` that defaults to the idle animation and
      blends into walk/run states triggered by movement.
- [x] Maintain a `playerState` object that tracks position, velocity, and
      currently equipped tool.

## 3. Input and Interaction System
- [x] Implement keyboard, pointer lock, and mobile touch controls that feed a
      `MovementController` abstraction.
- [x] Use a `THREE.Raycaster` to manage block mining and placement with
      left/right input events.
- [x] Add support for jumping (spacebar) and gravity-aware falling.
- [x] Provide a virtual joystick UI for mobile users and map it to the same
      controller interface used by desktop input.

## 4. Entities and Combat
- [x] Create entity factories for zombies and iron golems with GLTF assets and
      idle/walk animation mixers.
- [x] Spawn zombies dynamically during night cycles; implement simple pursuit AI
      that moves toward the player.
- [x] Spawn iron golems on a timed cadence that seek the nearest zombie target.
- [x] Wire in combat resolution using the existing `CombatUtils` helper so each
      zombie hit reduces the heart UI by 0.5.
- [x] Add a respawn sequence after five hits that preserves the inventory while
      resetting player position and hearts.

## 5. Inventory, Crafting, and HUD
- [x] Implement a ten-slot hotbar and backing inventory state (stack limits of
      99 per slot).
- [x] Build a modal crafting interface triggered via the `E` key or crafting
      button, supporting recipe validation sequences.
- [x] Update the HUD hearts, bubbles (for underwater sections), score, and
      dimension indicators in real time from the central game state store.
- [x] Provide drag-and-drop logic for crafting recipes with instant feedback
      (glow animations, confetti, score updates).

## 6. Portals, Dimensions, and Progression
- [x] Integrate `portal-mechanics.js` so placing a 4×3 block frame activates an
      interactable portal.
- [x] Animate a shader-based swirl when the portal is activated and perform a
      fade transition into the next dimension upon entry.
- [x] Create procedural generation variants for each dimension (Grassland →
      Netherite) and modify physics (e.g., gravity scaling) per dimension.
- [x] Implement the Netherite boss puzzle that removes rail meshes over time and
      requires the player to collect the Eternal Ingot to trigger victory.
- [x] Record dimension unlock progress for score calculations and persistence.

## 7. Backend Integration and Polish
- [x] Connect the front-end score system to the AWS API Gateway endpoints,
      performing GET/POST updates for scores and user profiles.
- [x] Hook Google SSO into the identity flow and persist the resulting profile in
      DynamoDB and `localStorage`.
- [x] Add Howler.js-backed sound effects for mining, zombie groans, portal
      activations, and UI interactions.
- [x] Ensure all HUD elements include accessibility enhancements (tooltips,
      subtitles toggle, colorblind mode) and add a footer crediting "Made by
      Manu".
- [x] Update the deployment workflow to sync assets, run linting/tests, and fail
      if the core experience drops below 50 FPS during automated checks.

## 8. Validation Matrix
- [x] Expand `docs/validation-matrix.md` with end-to-end browser scenarios that
      cover onboarding, crafting, combat, portal traversal, and backend sync.
- [x] Include Puppeteer-based smoke tests to run in CI before deployment.

---

This plan should be used as the basis for breaking down the work into feature
branches. Each section can be implemented iteratively while maintaining a
playable build after every merge.
