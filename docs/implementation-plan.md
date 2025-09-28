# Infinite Rails: Portals of Dimension — Modernisation Plan

This document captures the comprehensive feature backlog required to deliver the
experience described in the "Portals of Dimension" specification.  It bridges
the current repository state (static HUD with limited interactivity) and the
expected Minecraft-inspired prototype (fully interactive voxel world running at
60 FPS).

The list is grouped by delivery streams.  Each stream has actionable tasks that
can be picked up individually while still converging on the overall goal.

---

## 1. Rendering & World Simulation

* [ ] Wire a dedicated Three.js bootstrap that guarantees renderer creation,
      camera initialisation, and continuous `requestAnimationFrame` updates even
      before the user interacts with the UI.
* [ ] Generate a 64×64 voxel island with height noise, textured grass/dirt
      blocks, and procedurally laid rails.
* [ ] Implement day/night lighting by orbiting a directional light and
      adjusting a skybox gradient over a ten-minute cycle.
* [ ] Introduce first-person camera constraints (no roll, clamped pitch) with
      adjustable field-of-view for desktop/mobile.

## 2. Character & Entity Systems

* [ ] Load Steve, zombie, golem, and arm meshes via `GLTFLoader`, including
      animation mixers for idle/walk cycles and graceful fallbacks when assets
      fail to load.
* [ ] Implement a lightweight entity manager that updates AI actors (zombies
      chasing, golems defending) and cleans up disposed meshes.
* [ ] Add collision volumes so hostile entities deduct half a heart per
      contact, trigger respawns after five hits, and animate knockback.

## 3. Player Controls & Interaction

* [ ] Bind WASD + mouse-look controls using Pointer Lock, with joystick support
      on mobile breakpoints.
* [ ] Create block mining/placement through raycasting, inventory updates, and
      subtle camera feedback.
* [ ] Implement sprinting, jumping, and gravity adjustments per dimension.

## 4. Crafting, Inventory, & Progression

* [ ] Replace static crafting modal with drag-to-slot sequencing, validating
      recipes such as `stick + stick + stone → pickaxe` and updating score.
* [ ] Persist recipe unlocks via `localStorage` and surface them inside the
      crafting UI.
* [ ] Track dimension progression (Grassland → Netherite), unlocking new
      islands, loot chests, and portal physics per realm.
* [ ] Implement Netherite boss rails collapse sequence culminating in the
      Eternal Ingot victory condition.

## 5. Portals & Dimension Transfer

* [ ] Detect 4×3 block frames, animate shader-driven portal surfaces, and fade
      scenes during transitions to new dimensions.
* [ ] Integrate custom gravity multipliers, block palettes, and spawn tables per
      dimension.

## 6. Backend & Persistence

* [ ] Connect Google SSO (gapi) to obtain player identity, sync session
      metadata, and gracefully degrade when offline.
* [ ] POST score snapshots to the existing AWS Lambda API whenever dimensions
      unlock or major recipes are crafted; poll the leaderboard every 45
      seconds.
* [ ] Store recipe unlocks and identity hints in DynamoDB via the provided API.

## 7. Audio & Polish

* [ ] Load looping ambience plus on-demand Howler.js sound effects for mining,
      zombie groans, portal activation, and UI confirmations.
* [ ] Animate HUD updates (hearts, score ticker, dimension panel) with CSS
      transitions and aria-live messaging for accessibility.
* [ ] Add responsive layout tweaks, including a virtual joystick and touch
      prompts on mobile.
* [ ] Document an asset optimisation pipeline (texture compression, GLTF Draco)
      to keep the first meaningful paint under three seconds.

## 8. Validation & Tooling

* [ ] Extend `docs/validation-matrix.md` with headless browser scenarios that
      cover controls, crafting, portals, and victory flow.
* [ ] Update CI workflows to lint game scripts, run smoke tests, and upload
      compressed assets during deployments.

---

### Execution Guidance for Coding Assistants

Each stream can be tackled by preparing targeted prompts for automation tools
like GitHub Copilot or ChatGPT Code Interpreter.  When delegating to a coding
agent, include:

1. **Context extract:** Short summary of relevant source files (e.g. sections of
   `script.js`, `simple-experience.js`).
2. **Specific acceptance criteria:** FPS targets, console log checkpoints, API
   endpoints that must be hit.
3. **Validation plan:** Commands to run locally (`npm run lint`, `npm test`),
   manual steps ("press W and confirm `Moving forward` log"), or telemetry
   expectation ("POST /scores with 200 response").

Maintaining this structure ensures reproducibility and accelerates review
cycles, while keeping parity with the ambitious specification supplied by the
product brief.
