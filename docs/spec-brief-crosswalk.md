# Portals of Dimension – Spec Crosswalk

This crosswalk maps the "Comprehensive Analysis and Enhancement Specifications" pointers to the shipped sandbox
implementation so reviewers can verify each requirement without trawling the entire codebase.

## Initialization & Onboarding
- `SimpleExperience.start()` hides the intro modal, preloads assets, seeds the render loop, and captures the
  player's location so the island appears immediately with a daylight value of 50%.【F:simple-experience.js†L688-L717】
- `setupScene()` configures the orthographic camera, lighting rig, and render targets the spec called for, emitting a
  “Scene population check fired — validate terrain, rails, portals, mobs, and chests render correctly. Re-run asset bootstrap if visuals are missing.” log when the world is ready.【F:simple-experience.js†L1191-L1269】
- `buildTerrain()` procedurally generates the 64×64 voxel island, repopulates chunk metadata, and logs the 4,096-column
  trace (`World generation summary — … columns created`) that guards against the empty-scene regression described in the brief.【F:simple-experience.js†L2428-L2502】

## Core Gameplay Loop
- Steve's first-person rig loads from `steve.gltf`, falls back to a cube if the asset fails, and keeps the camera bound to
  the head bone for the requested Minecraft-style feel.【F:simple-experience.js†L2239-L2330】
- Movement combines pointer-lock mouse look, WASD, mobile joystick vectors, gravity, and jump impulses to deliver the
  responsive locomotion the spec demanded.【F:simple-experience.js†L3798-L3864】
- Mining, placement, and survival hazards feed the hotbar and score while golems and zombies spawn with AI loops that
  chase or defend based on day/night intensity.【F:simple-experience.js†L4050-L4214】

## Progression & Victory
- Portal completion triggers `advanceDimension()`, which applies new gravity presets, rebuilds terrain, and awards the
  +5 point unlock bonus before dispatching the dimension advancement event.【F:simple-experience.js†L3488-L3549】
- The Netherite finale manages collapsing rails, Eternal Ingot collection, and failure recovery timers to match the
  boss-puzzle expectations.【F:simple-experience.js†L2710-L2899】

## UI, Feedback & Inventory
- HUD updates, hotbar refreshes, and crafting state live on the sandbox instance; the routine invoked by
  `start()` keeps the overlay synchronised with health, bubbles, score, and hints every frame.【F:simple-experience.js†L688-L707】【F:simple-experience.js†L3792-L3795】
- Loot chests pulse, reward materials, and surface guidance copy in-line with the specification's request for
  interactive railside rewards.【F:simple-experience.js†L2968-L3050】

## Backend, Identity & Leaderboards
- `setupSimpleExperienceIntegrations()` bridges sandbox run summaries into the advanced HUD, updates Google SSO state,
  and persists geolocation snapshots so the DynamoDB-backed scoreboard mirrors in-game progress.【F:script.js†L541-L873】
- Remote score sync and leaderboard hydration stay wired through the sandbox's REST helpers, which call the configured
  API base whenever the player advances portals, collects the Eternal Ingot, or wins.【F:simple-experience.js†L3926-L3943】【F:simple-experience.js†L3488-L3566】

## Performance & Polish
- The render loop drives delta-timed physics, camera shake, and chunk culling to preserve the 60 FPS target while
  logging portal and dimension milestones for telemetry.【F:simple-experience.js†L3792-L3864】【F:simple-experience.js†L3488-L3524】
- Victory overlays, replay controls, and celebratory audio cues activate once the Eternal Ingot is secured so the
  session ends with the polished finish described in the enhancement brief.【F:simple-experience.js†L3552-L3567】

Use this crosswalk alongside the validation matrix when performing regression passes or onboarding new contributors.
