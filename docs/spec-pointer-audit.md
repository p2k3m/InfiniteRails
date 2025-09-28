# Spec Pointer Audit

This audit traces each pointer from the "Comprehensive Analysis and Enhancement Specifications" brief to the
current sandbox implementation. Every bullet links to concrete code or tests that exercise the requested
behaviour.

## Initialization and onboarding
- The renderer seeds the day/night cycle at 50% daylight, fades out the briefing overlay, and focuses the canvas
  once play begins.【F:simple-experience.js†L480-L520】【F:simple-experience.js†L680-L739】
- `buildTerrain()` generates the 64×64 voxel island, stores height data, and logs the 4,096-column world check at
  startup.【F:simple-experience.js†L2200-L2266】

## Core rendering and movement
- Curved guide rails are procedurally rebuilt for every realm, and the Netherite collapse routine drives the
  timed platforming sequence.【F:simple-experience.js†L2371-L2478】
- Frustum-aware chunk visibility combined with the animated day/night lighting keeps the sandbox performant while
  updating HUD daylight labels in real time.【F:simple-experience.js†L3700-L3752】

## Player presentation and controls
- The Steve rig (with fallback cube) is parented to the player rig, attaches the camera to the head bone, and
  enables idle animation playback when assets load successfully.【F:simple-experience.js†L1997-L2088】
- Input bindings cover pointer lock, WASD, crafting toggles, and mobile gestures so both desktop and touch
  players can control the avatar.【F:simple-experience.js†L3333-L3399】

## Mining, placement, and inventory
- Mining and placement raycasts mutate terrain, award resources, trigger score updates, and play contextual
  audio while maintaining portal frame state.【F:simple-experience.js†L3997-L4090】
- Hotbar/satchel inventory logic stacks items up to 99 and keeps UI slots in sync, ensuring crafting always
  references up-to-date counts.【F:simple-experience.js†L4192-L4240】

## Crafting and recipe progression
- Ordered crafting sequences validate inventory, grant score, unlock recipes, and refresh the HUD/sequence UI on
  success.【F:simple-experience.js†L4444-L4516】
- Recipe search, suggestions, and quick-slot handling populate the crafting modal so explorers can recall
  discovered blueprints instantly.【F:simple-experience.js†L4518-L4734】

## Entities, combat, and survival
- Night-only zombie waves spawn around the island, swap to GLTF models when available, and chase the player until
  defeated.【F:simple-experience.js†L3728-L3833】
- Iron golems, damage handling, and respawn logic drain hearts, trigger audio cues, and reset the world after five
  hits while logging respawns.【F:simple-experience.js†L3835-L3995】

## Portals, dimensions, and victory
- Portal activation swaps in shader planes, tallies frame progress, and pushes portal state changes to the HUD and
  backend sync queue.【F:simple-experience.js†L3090-L3235】
- Dimension advancement applies gravity modifiers, rebuilds terrain, spawns loot chests, and orchestrates the
  Netherite collapse/victory sequence with Eternal Ingot collection.【F:simple-experience.js†L3237-L3315】
- Netherite collapse timers and the Eternal Ingot reward keep the boss encounter aligned with the progression arc.
  【F:simple-experience.js†L2599-L2656】
- Victory adds score, clears threats, fires celebratory audio, and syncs the run summary so the leaderboard can
  refresh immediately.【F:simple-experience.js†L3296-L3310】

## Loot, score, and backend sync
- Realm-specific chests animate, award themed loot, and feed the score system before scheduling leaderboard
  updates.【F:simple-experience.js†L2726-L2815】
- Scoreboard polling, merge logic, and POST submissions keep remote leaderboards up to date while preserving
  offline play when no API is configured.【F:simple-experience.js†L752-L835】【F:simple-experience.js†L995-L1059】

## UI, audio, and feedback
- HUD panels expose vitals, portal progress, score breakdowns, and celebration overlays that react to live
  gameplay.【F:index.html†L182-L360】
- Embedded Howler-powered samples provide mining crunches, portal swells, and victory cues with per-effect volume
  control.【F:simple-experience.js†L1476-L1533】【F:simple-experience.js†L3288-L3993】

## Identity, portals, and backend integration
- Google Identity Services helpers initialise sign-in buttons, persist player identity, and push updates into the
  sandbox renderer once profiles resolve.【F:script.js†L720-L960】
- `portal-mechanics.js` standardises frame footprints, collision checks, activation events, and cross-dimension
  physics summaries for both gameplay and documentation consumers.【F:portal-mechanics.js†L1-L146】

## Validation and regression coverage
- The Playwright smoke test boots the sandbox, verifies world/state snapshots, and asserts that HUD and leaderboard
  panels populate without console regressions.【F:tests/e2e-check.js†L1-L118】

These references demonstrate that every item in the specification brief has a shipped implementation or automated
validation inside the current sandbox renderer.
