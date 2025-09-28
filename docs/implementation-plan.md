# Infinite Rails: Portals of Dimension — Modernisation Plan

The sandbox renderer that ships in `simple-experience.js` now satisfies the
feature brief that originally lived in this backlog. It boots a fully interactive
voxel island with immersive lighting, entities, crafting, portals, and backend
sync so reviewers can play the intended Minecraft-inspired loop today.【F:simple-experience.js†L1417-L1496】【F:simple-experience.js†L2911-L2985】【F:simple-experience.js†L4339-L4359】【F:simple-experience.js†L4500-L4595】【F:simple-experience.js†L5250-L5334】

Because the sandbox has reached parity with the specification, this plan now
tracks the remaining work required to bring the experimental “advanced” renderer
up to the same standard while hardening long-term tooling.

## Status snapshot

- **Rendering & world simulation** – The sandbox initialises its own Three.js
  pipeline, builds a 64×64 floating island with voxel materials, and keeps a
  600-second day/night orbit in sync with the HUD.【F:simple-experience.js†L1417-L1496】【F:simple-experience.js†L2911-L2985】【F:simple-experience.js†L4531-L4555】
- **Player, entities, and combat** – First-person controls, zombies, iron
  golems, and health management are live, including respawns after five hits and
  nightly defence behaviour.【F:simple-experience.js†L4195-L4315】【F:simple-experience.js†L4565-L4758】
- **Crafting, progression, and portals** – Drag-to-sequence crafting, recipe
  unlocks, portal ignition, and dimension advancement reward score and persist
  progress between sessions.【F:simple-experience.js†L5250-L5334】【F:simple-experience.js†L3795-L3821】
- **Backend integration & HUD** – Score sync, leaderboard polling, Google
  identity state, and responsive HUD updates are wired into the live experience
  with retries and offline fallbacks.【F:simple-experience.js†L914-L1004】【F:simple-experience.js†L1322-L1404】【F:simple-experience.js†L5529-L5553】

## Remaining advanced renderer backlog

### 1. Rendering & world simulation

- [ ] Port the sandbox scene bootstrap (camera, lighting, fog, renderer
      configuration) into the advanced renderer path so players see the voxel
      island regardless of mode.【F:simple-experience.js†L1417-L1496】
- [ ] Mirror the voxel terrain generator (including rail placement and chunk
      culling) so the advanced scene surfaces the same 64×64 island layout with
      frustum-aware performance safeguards.【F:simple-experience.js†L2911-L2985】【F:simple-experience.js†L4500-L4522】
- [ ] Recreate the ten-minute day/night cycle in the advanced loop and hook it to
      the existing HUD daylight meter.【F:simple-experience.js†L4531-L4555】

### 2. Character & entity systems

- [ ] Integrate the sandbox’s player rig and animation mixer so the advanced
      renderer keeps the same first-person Steve arms and idle loop.【F:simple-experience.js†L1438-L1493】
- [ ] Bring across zombie and golem actors, including their spawn cadence,
      pursuit/defence heuristics, and collision damage plumbing.【F:simple-experience.js†L4565-L4758】
- [ ] Share the respawn flow (inventory snapshot + heart restoration) so defeats
      behave consistently across both renderers.

### 3. Player controls & interaction

- [ ] Adopt the pointer-lock WASD implementation from the sandbox, including
      joystick/touch fallbacks, to eliminate the “no input response” reports in
      advanced mode.【F:simple-experience.js†L4195-L4339】
- [ ] Wire block mining/placement, rail snapping, and chest interaction so the
      advanced renderer honours the same raycasting affordances.
- [ ] Ensure tutorial overlays, pointer hints, and pause behaviour respond to the
      same events regardless of renderer.

### 4. Crafting, inventory, & progression

- [ ] Reuse the drag-to-sequence crafting UI and recipe validation pipeline so
      advanced-mode players earn the same score bonuses and unlock persistence.【F:simple-experience.js†L5250-L5334】
- [ ] Synchronise hotbar/inventory mutations between renderers to keep inventory
      counts accurate after mining or crafting.
- [ ] Implement the Netherite realm collapse and Eternal Ingot victory flow
      inside the advanced renderer so both modes share the endgame beats.

### 5. Portals & dimension transfer

- [ ] Lift the portal frame detection and ignition logic (including shader-driven
      swirl material) into the advanced renderer to unblock dimension hopping.【F:simple-experience.js†L3795-L3821】
- [ ] Apply dimension-specific physics (gravity multipliers, loot tables) to the
      advanced mode just as the sandbox currently does when `advanceDimension()`
      is triggered.

### 6. Backend & persistence

- [ ] Share the scoreboard sync scheduler and Google identity plumbing between
      renderers so score posts, leaderboard refreshes, and location capture work
      no matter which mode initialises first.【F:simple-experience.js†L914-L1004】【F:simple-experience.js†L1322-L1404】
- [ ] Extract the localStorage persistence helpers (identity snapshots, recipe
      unlocks) into reusable modules consumed by both renderers.

### 7. Audio & polish

- [ ] Wire Howler-backed ambience and SFX playback into the advanced renderer so
      mining, zombie, and portal cues remain audible.【F:simple-experience.js†L2130-L2200】
- [ ] Sync HUD animation hooks (score ticker, heart pulses, portal progress bar)
      and ensure reduced-motion preferences are respected in both modes.【F:simple-experience.js†L5529-L5553】
- [ ] Double-check responsive breakpoints and joystick overlays render in the
      advanced mode for mobile players.【F:simple-experience.js†L4339-L4359】

### 8. Validation & tooling

- [ ] Extend the Playwright smoke tests so they exercise both sandbox and
      advanced renderers, covering pointer lock, crafting, portals, and victory
      flow transitions.
- [ ] Update CI workflows to run a shared lint/test suite for the renderer logic
      and capture FPS/bundle size telemetry as part of regression testing.
- [ ] Document parity checkpoints (e.g., screenshot diffs, console logs) required
      before flipping the default mode back to the advanced renderer.
