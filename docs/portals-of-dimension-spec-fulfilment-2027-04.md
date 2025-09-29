# Portals of Dimension – April 2027 Compliance Summary

This briefing cross-checks the "Portals of Dimension" baseline against the latest gameplay requirements. Each section links the expectation to the exact implementation in the codebase so future audits can confirm nothing regressed.

## Initialization and Onboarding
- `SimpleExperience.start()` hides the intro modal, builds the renderer, seeds the tutorial overlay, and immediately kicks off the frame loop for a live sandbox as soon as the page loads.【F:simple-experience.js†L775-L817】
- The renderer bootstrap uses an orthographic Three.js camera, hemisphere + directional lighting, fog, and dedicated world groups so the scene is populated before the first frame renders.【F:simple-experience.js†L1532-L1613】

## Core Gameplay Loop
- Terrain generation fills the 64×64 grid (4,096 columns) with layered voxels, logs the population counts, and aligns the portal anchor inside the island.【F:simple-experience.js†L3132-L3208】
- The render loop advances with delta timing, day/night progression, entity updates, culling, and the final render call every frame to sustain 60 FPS targets.【F:simple-experience.js†L4611-L4635】
- First-person presentation loads the Steve GLTF (with a fallback cube), binds the camera to the head rig, and logs visibility checkpoints for debugging.【F:simple-experience.js†L2943-L3034】
- Movement, jumping, and look controls merge keyboard, pointer lock, and mobile inputs, keeping velocity damped with Minecraft-style inertia.【F:simple-experience.js†L4438-L4488】【F:simple-experience.js†L4761-L4827】

## Survival, Entities, and Combat
- Loot chests spawn per dimension with pulsing highlights, loot tables, and interaction hints so exploration feeds the inventory and score loops.【F:simple-experience.js†L3673-L3770】
- Zombies spawn at night, chase the player, and trigger half-heart damage with console telemetry for automated tests.【F:simple-experience.js†L4953-L5024】【F:simple-experience.js†L5026-L5049】
- Iron golems join the defense, track nearby zombies, and award combat points when intercepting enemies.【F:simple-experience.js†L5114-L5178】
- Respawns restore health, clear threats, and log the "Respawn triggered" marker after five zombie hits.【F:simple-experience.js†L5207-L5225】

## Crafting, Inventory, and Interaction
- Mining/placement raycasts mutate the voxel grid, update portal frame progress, shake the camera, and feed the hotbar inventory with drops.【F:simple-experience.js†L5227-L5325】
- The crafting modal supports drag sequencing, validation, recipe unlocks, scoring, and audio feedback, while the inventory modal offers sorting and accessibility states.【F:simple-experience.js†L5682-L5755】【F:simple-experience.js†L5821-L5859】
- HUD updates redraw hearts, score breakdowns, portal progress, and the "Made by Manu" footer summary every frame.【F:simple-experience.js†L6034-L6139】

## Portals, Dimensions, and Victory
- Portal detection checks 4×3 frames, verifies interiors, calls into the shared mechanics, and activates shader-driven planes with logging.【F:simple-experience.js†L3986-L4148】
- Advancing dimensions reapplies themed settings, rebuilds terrain/rails, awards progression points, and broadcasts events until the Netherite victory banner appears.【F:simple-experience.js†L4197-L4279】

## Backend, Identity, and Leaderboards
- Scoreboard rendering, identity awareness, and remote sync leverage the shared utilities so the HUD and leaderboard modal stay in sync.【F:simple-experience.js†L1180-L1409】
- API integration fetches leaderboard data, posts run summaries, and persists progress through Google identity and geolocation capture hooks.【F:script.js†L19059-L19132】【F:script.js†L19241-L19291】

## Performance, Atmosphere, and Audio
- Day/night calculations animate the sun/sky, adjust fog, and surface daylight percentages in the HUD.【F:simple-experience.js†L4953-L4976】
- Chunk-level frustum culling trims terrain rendering cost, while zombies/golems update only when present.【F:simple-experience.js†L4920-L4999】【F:simple-experience.js†L5114-L5178】
- The render loop also drives portal shaders, camera shake, hand bob, and scheduled score syncs to maintain the requested polish.【F:simple-experience.js†L4611-L4634】【F:simple-experience.js†L4987-L5000】【F:simple-experience.js†L4871-L4879】

These anchors show the production build already satisfies the April 2027 gameplay checklist—future diffs should preserve these touchpoints or update this file with new references.
