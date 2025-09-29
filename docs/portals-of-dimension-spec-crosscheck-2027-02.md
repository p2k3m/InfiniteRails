# Portals of Dimension – Spec Cross-check (February 2027)

## Rendering and World Simulation
- `SimpleExperience.setupScene()` stands up the Three.js scene with an orthographic camera mounted to the player rig, volumetric lighting, and fog tuned for the Minecraft-style presentation.【F:simple-experience.js†L1532-L1613】
- The procedural terrain generator iterates the 64×64 grid, builds voxel columns with grass, dirt, and stone materials, and reports the expected telemetry once 4,096 tiles are populated.【F:simple-experience.js†L2-L24】【F:simple-experience.js†L3160-L3206】
- The render loop advances a day/night cycle every frame, steering sun and hemisphere lights while refreshing HUD copy for the daylight meter.【F:simple-experience.js†L4611-L4635】【F:simple-experience.js†L4953-L4976】

## Player Presence and Controls
- `loadPlayerCharacter()` attaches the camera to the Steve model (or a fallback cube) and keeps the animated first-person arms parented to the camera for immersive mining feedback.【F:simple-experience.js†L2943-L3033】
- Keyboard and pointer-lock listeners log the “Moving forward” instrumentation, route WASD/crafting inputs, and guard pointer capture with the spec’s tutorial copy.【F:simple-experience.js†L4400-L4470】
- Mouse presses request pointer lock, mine or place voxels, and keep the hint system in sync with the active input mode.【F:simple-experience.js†L4561-L4601】

## Entities, Combat, and Survival
- Zombies spawn along the island rim after dusk, steer toward the player, apply contact damage, and emit the required “Zombie spawned, chasing” log.【F:simple-experience.js†L4987-L5049】
- Iron golems spawn on cadence, intercept nearby zombies, and surface status hints while sharing geometry upgrades with the GLTF loader.【F:simple-experience.js†L5114-L5159】
- Lethal damage routes through `handleDefeat()`, which clears hostile entities, syncs penalties, and advertises “Respawn triggered” before repositioning the player.【F:simple-experience.js†L5200-L5225】

## Crafting, Portals, and Progression
- Mining and placement update the hotbar, earn score, and feed the crafting/state machine that gates recipes such as the Stone Pickaxe and Portal Charge unlocks.【F:simple-experience.js†L5227-L5270】【F:simple-experience.js†L3034-L3069】
- Portal frame validation hides interior blocks until ignition, spins shader uniforms, logs “Portal active,” and emits dimension payloads for progression tracking.【F:simple-experience.js†L4080-L4147】
- Dimension transitions queue scoreboard syncs and maintain the sequential unlock log, matching the multi-realm storyline.【F:simple-experience.js†L1500-L1516】【F:simple-experience.js†L6576-L6590】

## Backend Sync, UI, and Audio Polish
- Scoreboard hydration targets `${APP_CONFIG.apiBaseUrl}/scores`, updates status copy, and merges results with locally tracked runs.【F:simple-experience.js†L1006-L1100】
- Run summaries fire through sendBeacon/fetch fallbacks on unload, keeping DynamoDB endpoints updated even when the tab closes.【F:simple-experience.js†L4520-L4558】
- The HUD/audio controller refreshes health, score, portal meters, and surfaces Howler-powered samples for mining, combat, and portal moments.【F:simple-experience.js†L2310-L2460】【F:simple-experience.js†L6034-L6140】

## Telemetry and Compliance Hooks
- Console breadcrumbs cover scene bootstrap, model visibility, zombie spawning, portal activation, and respawn recovery—aligning with the debugging checkpoints demanded in the spec audit.【F:simple-experience.js†L1610-L1613】【F:simple-experience.js†L2943-L3034】【F:simple-experience.js†L4987-L5049】【F:simple-experience.js†L4080-L4143】【F:simple-experience.js†L5200-L5225】
- The expanded Vitest coverage file now asserts the presence of the render loop, first-person rig, entity hooks, backend sync path, audio polish, and leaderboard scaffolding to guard against regressions.【F:tests/spec-coverage.spec.js†L12-L83】
