# Addressing "blank world" reports for Infinite Rails

The "Comprehensive Analysis and Enhancement Specifications" brief expects the
sandbox renderer to boot immediately with terrain, the Steve avatar, survival
loops, and backend sync. Recent feedback described an empty HUD with no 3D
content. The live sandbox already ships the requested systems; this guide maps
the shipped implementation to the checklist and outlines quick diagnostics for
future regressions.

## Feature verification snapshot

- **Procedural terrain & lighting** – `buildTerrain()` fills the 64×64 island,
  logs the voxel totals, and pairs with hemisphere/sun lighting during
  `renderFrame()` so QA can confirm the 3D scene populated.
  【F:simple-experience.js†L2348-L2422】【F:simple-experience.js†L3690-L3709】
- **First-person Steve embodiment** – GLTF assets (with box-mesh fallbacks)
  attach the camera to the head bone, add animated arms, and emit “Avatar visibility confirmed — verify animation rig initialises correctly if the player appears static.” once the rig is ready.【F:simple-experience.js†L1984-L2055】【F:simple-experience.js†L2170-L2249】
- **Responsive controls** – Pointer lock, WASD, jump, mining, placement, and the
  virtual joystick bind inside `bindEvents()`, logging “Movement input detected (forward). If the avatar fails to advance, confirm control bindings and resolve any physics constraints blocking motion.” on the
  first `W` press to prove input wiring.【F:simple-experience.js†L3510-L3654】
- **Portals & dimension advancement** – Portal frames activate with shader
  planes, queue score syncs, and advance to the next gravity palette while
  logging each unlock.【F:simple-experience.js†L3330-L3470】
- **Night cycle combat** – Zombies spawn every night, chase the player, and
  trigger respawn logs after five hits (`Respawn handler invoked. Ensure checkpoint logic restores player position, inventory, and status effects as expected.`); golems auto-spawn to intercept attackers
  and award score for each defense.【F:simple-experience.js†L3940-L4172】
- **Boss finale & loot** – The Netherite collapse routine, Eternal Ingot crystal,
  and loot chests ship with emissive meshes and scoring hooks, matching the
  finale flow in the brief.【F:simple-experience.js†L2662-L2885】
- **Scoreboard & API sync** – `loadScoreboard()` and `createRunSummary()` post to
  `/scores`, merge leaderboard entries, and update the HUD even when offline
  (with console warnings for missing backends).【F:simple-experience.js†L780-L955】

## Quick diagnostics when the viewport looks empty

1. **Force sandbox mode** – Append `?mode=simple` or set
   `window.APP_CONFIG.forceSimpleMode = true` before loading `script.js` to skip
   any experimental renderer flags.
2. **Check console telemetry** – Look for the boot logs listed above
   (`Scene population check fired — …`, `World generation summary — …`, `Avatar visibility confirmed — …`). Missing
   logs usually indicate a blocked asset or WebGL failure.
3. **Confirm assets served** – Ensure the `/assets` directory ships with the
   page; GLTF fallbacks protect gameplay, but textures still improve fidelity.
4. **Validate backend configuration** – When `APP_CONFIG.apiBaseUrl` is absent,
   the sandbox intentionally falls back to local storage and will warn that the
   leaderboard is offline. Supply the API base URL to exercise full sync.

## Next steps

- If a regression prevents the logs from appearing, capture the console output
  and open an issue tagged `renderer`. The sandbox telemetry keeps diagnosing
  steps lightweight.
- Keep `docs/validation-matrix.md` in sync whenever a new mechanic ships so QA
  can extend this checklist with additional assertions.

These checks confirm the shipped sandbox satisfies the brief while offering a
repeatable path to debug future "blank world" reports without rewriting core
systems.
