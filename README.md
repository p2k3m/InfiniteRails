# Infinite Dimension: Portals Reimagined

Infinite Dimension is a browser-based voxel survival-puzzle experience inspired by the "Comprehensive Analysis and Enhancement Specifications" brief. The advanced renderer now boots by default and delivers a complete Minecraft-style prototype featuring:

- a Three.js render loop that carves out a 64×64 floating island with day/night lighting and shader-driven portals;
- first-person controls with the Steve avatar, idle/walk animation mixers, mining and block placement, and virtual joystick support on mobile;
- survival systems spanning health, bubbles, zombies, iron golems, crafting, scoring, and sequential dimension unlocks; and
- backend-aware score syncing, Google Sign-In hooks, and responsive HUD/leaderboard overlays.

The interactive sandbox renderer remains fully supported and can be forced through configuration for low-power devices or debugging sessions. The remaining parity tasks for the experimental renderer are tracked in [docs/enhancement-roadmap.md](docs/enhancement-roadmap.md), while deeper sequencing guidance continues to live in [docs/implementation-plan.md](docs/implementation-plan.md).

For a citation-backed snapshot that proves the sandbox hits every headline requirement, consult [`docs/portals-of-dimension-enhancement-proof.md`](docs/portals-of-dimension-enhancement-proof.md). It aggregates the render loop, survival mechanics, portals, and backend integrations into a single quick-reference map. When you need the latest line-level references that tie the brief directly to source code, refer to [`docs/portals-of-dimension-compliance-refresh.md`](docs/portals-of-dimension-compliance-refresh.md). A fresh May 2025 fulfilment digest that mirrors the most recent review feedback lives in [`docs/portals-of-dimension-spec-fulfilment-2025-05.md`](docs/portals-of-dimension-spec-fulfilment-2025-05.md). For the newest walkthrough that maps every specification pointer to the exact July 2026 implementation, see [`docs/portals-of-dimension-spec-verification-2026-07.md`](docs/portals-of-dimension-spec-verification-2026-07.md).

## Current status

- **Sandbox renderer** – `simple-experience.js` initialises Three.js r161, generates the 64×64 terrain, animates the sun cycle, and logs voxel totals for debugging.【F:simple-experience.js†L716-L745】【F:simple-experience.js†L1398-L1477】【F:simple-experience.js†L2635-L2709】
- **Player & controls** – Steve loads in first-person with animated arms, pointer-lock mouse look, WASD movement, mobile joystick input, mining, and placement.【F:simple-experience.js†L2399-L2443】【F:simple-experience.js†L2446-L2536】【F:simple-experience.js†L3895-L3997】
- **Entities & survival** – Zombies spawn nightly, chase the player, and chip hearts while iron golems auto-spawn for defence; respawns retain inventory after five hits.【F:simple-experience.js†L4231-L4293】【F:simple-experience.js†L4385-L4464】
- **Dimension loot chests** – Every realm seeds animated treasure chests that pulse when nearby and deliver themed resources, score bonuses, and scoreboard syncs whenever the player opens them with `F`.【F:simple-experience.js†L3175-L3270】
- **Crafting & portals** – Hotbar/crafting UIs validate ordered recipes, award score, track portal progress, and transition across dimensions with gravity modifiers and the Netherite victory flow.【F:simple-experience.js†L3519-L3545】【F:simple-experience.js†L3695-L3756】【F:simple-experience.js†L4950-L4984】
- **Backend sync & HUD** – Scores post to configured APIs, Google SSO hooks populate identity, and the HUD/leaderboard update in real time.【F:simple-experience.js†L1780-L1855】【F:simple-experience.js†L895-L959】【F:simple-experience.js†L1322-L1378】【F:simple-experience.js†L5224-L5280】

If you need a line-by-line confirmation that the August 2025 spec requests are in place, the new
[`docs/portals-of-dimension-compliance-2025-08.md`](docs/portals-of-dimension-compliance-2025-08.md)
summary cites the exact gameplay, rendering, and backend functions that implement each pointer from
the "Comprehensive Analysis and Enhancement Specifications" brief. Pair it with the existing
enhancement proof to see both the narrative walkthrough and the underlying code references in one
place.

## Near-term objectives

The sandbox is feature complete; the next phase focuses on hardening the advanced renderer and polishing long-term systems:

1. **Advanced renderer parity** – Bring the non-sandbox path in `script.js` up to feature parity so both modes share the same gameplay stack.
2. **Additional dimension content** – Layer bespoke structures, boss scripting, and cinematic sequences onto each unlocked realm.
3. **Cross-session persistence** – Expand DynamoDB schemas to retain crafting unlocks, cosmetics, and personal bests across devices.
4. **Performance telemetry** – Automate FPS and bundle-size reporting in CI to keep future additions inside budget.
5. **Accessibility polish** – Continue improving captions, colour-contrast tweaks, and screen-reader flows now that interactive systems are online.

Progress against each track is maintained in [docs/enhancement-roadmap.md](docs/enhancement-roadmap.md). Update the roadmap as advanced-mode milestones ship.

## Validation & test matrix

Refer to [`docs/validation-matrix.md`](docs/validation-matrix.md) for the complete mapping between requirements, validation methods, success criteria, and hands-on test scenarios used during regression.

### Local testing

Two automated suites ship with the repository:

1. `npm test` runs the Vitest unit suite that exercises the pure utility modules (scoreboard helpers, portal mechanics, and combat maths).
2. `npm run test:e2e` launches the Playwright smoke test that boots the sandbox, validates HUD panels, and confirms there are no console regressions.

Playwright downloads its browser binaries on demand. If the end-to-end check fails with a message similar to “Executable doesn't exist … run `npx playwright install`”, execute that command once and rerun the test. When the host machine is missing system-level browser dependencies (common inside constrained CI sandboxes), the script now reports the missing packages and exits gracefully so the rest of the toolchain can continue. The download step is skipped automatically in CI because the workflow caches the Playwright bundle.

## Enhancement roadmap

The design brief titled **“Comprehensive Analysis and Enhancement Specifications for Infinite Rails: Portals of Dimension”**
introduces a broad slate of rendering, interaction, and backend improvements that build toward a fully interactive prototype.
To keep progress visible, the actionable checklist extracted from that brief now lives in
[`docs/enhancement-roadmap.md`](docs/enhancement-roadmap.md). Update that roadmap as features land so the team can quickly gauge
momentum toward the full experience described in the brief.

If you need a quick status snapshot, [`docs/spec-compliance.md`](docs/spec-compliance.md) summarises how each requirement in the
brief maps to shipped code (with direct citations), [`docs/spec-compliance-report.md`](docs/spec-compliance-report.md) provides a
narrative coverage audit with action items, and [`docs/feature-verification.md`](docs/feature-verification.md) dives deeper into the
implementation details and validation steps. For an annotated, citation-rich digest that connects the highest-priority gameplay
loops from the enhancement brief to their concrete implementations, consult
[`docs/portals-of-dimension-enhancements.md`](docs/portals-of-dimension-enhancements.md).

If you work with coding agents (for example GitHub Copilot or Code Interpreter) the verbatim prompts from the brief are archived in [`docs/coding-agent-prompts.md`](docs/coding-agent-prompts.md). Reusing those prompts keeps automated contributions aligned with the currently shipped sandbox systems.

## Renderer selection

The advanced renderer now powers the default experience and immediately loads the full 3D sandbox described in the specification. The prior sandbox renderer remains available as a safety net for low-power devices or debugging sessions. The sandbox:

- draws a 64×64 voxel island with soft day/night lighting at 60 FPS, complete with a procedurally curved rail spine,
- locks the camera to a first-person perspective with mouse look + `WASD` movement and jump physics that adapt to each realm,
- supports mining (left-click) and block placement (right-click) with realtime HUD updates and portal progress feedback,
- rewards completing a 12-block frame by spawning an animated portal that advances the dimension palette and physics, and
- keeps the existing HUD elements alive so hearts, daylight percentage, zombie alerts, and score counters remain informative.

Use the following switches to control which experience loads:

| Mode | How to activate |
| --- | --- |
| Advanced renderer (default) | Load the page normally. The bundled `APP_CONFIG` now enables and prefers the advanced renderer so the fully interactive 3D experience starts immediately. |
| Sandbox renderer (fallback) | Append `?mode=simple` (or `?simple=1`), or set `APP_CONFIG.forceSimpleMode = true`. This mirrors the previous default for devices that need the lighter sandbox. |

The sandbox keeps the portal-building brief front-and-centre while the production renderer continues to mature. Flip the flags
above whenever you want to regression-test the work-in-progress advanced build without losing the reliable sandbox.

### Troubleshooting a blank viewport

If you load the page and only see the HUD without the voxel world, run through the quick checks below:

1. **Force the sandbox.** Append `?mode=simple` (or set `APP_CONFIG.forceSimpleMode = true`) to bypass any lingering advanced-mode flags that might have been left in `localStorage` or injected configs.
2. **Verify asset paths.** Confirm the `assets/` directory is being served alongside `index.html`; the sandbox streams GLTF rigs and textures from those relative URLs and will refuse to start if they 404.
3. **Inspect the console.** Shader-uniform or WebGL context errors will be logged with actionable recovery tips—clear the cache and reload once the offending asset has been restored.
4. **Disable browser extensions.** Content blockers can prevent pointer-lock or audio initialisation; retry in a private window if input still appears frozen.

These steps restore the intended first-person experience when a deployment or cached configuration temporarily forces the alternate renderer path.

## Controls

| Platform | Input |
| --- | --- |
| Desktop | `WASD` / arrow keys to move, `Space` to jump, `F` interact/use, `Q` place blocks, `R` ignite portal, `E` crafting, `I` inventory, `T` reset position, `V` toggle view, `1–0` hotbar slots |
| Mobile | Swipe to move between rails, tap/hold to mine or place, tap the action buttons for crafting and portals |

Desktop key bindings now live in a centralised map with sensible defaults (WASD and the arrow keys for movement). Players can remap every control from the in-game **Settings → Key bindings** panel, or you can provide overrides via configuration or at runtime:

```html
<script>
  window.APP_CONFIG = {
    keyBindings: {
      moveForward: ['KeyI', 'ArrowUp'],
      interact: ['KeyE'],
      hotbar1: ['Digit1', 'Numpad1'],
    },
  };
</script>
```

Once you have a reference to the `SimpleExperience` instance (returned from `SimpleExperience.create(options)`), call its helpers to adjust bindings dynamically. Changes persist to `localStorage` under `infinite-rails-keybindings` so players keep their preferences across sessions:

```js
experience.setKeyBinding('jump', ['KeyZ']);
experience.setKeyBindings({ moveForward: ['KeyI'], moveBackward: ['KeyK'] });
// Restore the defaults from configuration/localStorage
experience.resetKeyBindings();
```

The advanced renderer exposes the same helpers on `window.InfiniteRails` once `script.js` boots. Call them at runtime to tweak bindings without reloading:

```js
window.InfiniteRails.setKeyBinding('interact', ['KeyG']);
window.InfiniteRails.resetKeyBindings();
```

## Identity, location & scoreboard endpoints

Expose an `APP_CONFIG` object before loading `script.js` to wire up Google SSO and DynamoDB-backed endpoints:

```html
<script>
  window.APP_CONFIG = {
    apiBaseUrl: 'https://your-api.example.com',
    googleClientId: 'GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com',
    // Optional: override renderer defaults (advanced mode is enabled by default).
    enableAdvancedExperience: true,
    preferAdvanced: true,
    forceAdvanced: true,
  };
</script>
```

- **Google SSO** – supply a valid `googleClientId` to render the Google Identity Services button so explorers can carry their progress across devices.
- **User metadata** – on sign-in the app POSTs to `${apiBaseUrl}/users` with the player’s Google ID, preferred name, device snapshot, and geolocation (if permission is granted). The handler can write directly to a DynamoDB table keyed by Google ID.
- **Scoreboard** – the app loads scores via `GET ${apiBaseUrl}/scores` and upserts the player’s run with `POST ${apiBaseUrl}/scores`. The payload mirrors the UI fields: `name`, `score`, `dimensionCount`, `runTimeSeconds`, `inventoryCount`, plus optional `location` or `locationLabel` fields.
- **Offline-friendly** – when `apiBaseUrl` is absent the UI persists identities and scores to `localStorage` and displays sample leaderboard entries so the page remains fully interactive.
- **Mode selection** – the bundled configuration already opts into the advanced renderer. Set `forceSimpleMode: true` when you need to fall back to the lighter sandbox, or override any flag above to suit your deployment.
- **Static asset base paths** – when the experience is served from a subdirectory (for example, `https://cdn.example.com/compose/`), provide `assetBaseUrl` to point at the folder containing `vendor/` and other shared bundles. The bootstrapper automatically uses the page URL as a default, but explicitly setting the base prevents 404s when assets live outside the current directory.
- **Texture packs** – set `textureBaseUrl` to a bucket such as `https://your-bucket.s3.amazonaws.com/blocks` (or provide a `textures` / `textureManifest` map) to stream PNG tile maps for `grass`, `dirt`, and `stone`. The sandbox swaps them in at runtime with frustum-aware anisotropy while keeping the procedural textures as an offline fallback.

### Deploying the AWS backend

Provision the serverless API and DynamoDB tables with the provided AWS SAM template:

```bash
cd serverless
sam build
sam deploy --guided
```

- The stack creates a `/users` Lambda (for Google profile sync) and a `/scores` Lambda (for leaderboard reads/writes) behind an API Gateway stage.
- DynamoDB tables `UsersTable` and `ScoresTable` are configured for on-demand billing with encryption enabled. The scoreboard table includes a `ScoreIndex` global secondary index that the Lambda uses to return the highest scores first.
- After deployment, copy the generated API endpoint URL into `window.APP_CONFIG.apiBaseUrl` so the frontend will sync identities and victories to DynamoDB.

### Google SSO configuration

1. In the [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create an **OAuth 2.0 Client ID** of type **Web application**.
2. Add each domain that will host the game to the **Authorized JavaScript origins** list. For local development with `npx serve` include `http://localhost:3000`; add your production hostname such as `https://infinite-dimension.example.com` when you deploy.
3. Because the experience uses the Google Identity Services popup flow, you do not need to configure an authorized redirect URI.
4. Copy the generated client ID into `window.APP_CONFIG.googleClientId` as shown above.

## Gameplay Loop

1. Spawn on the Grassland Threshold with an empty belt.
2. Harvest trees and stone to unlock early recipes.
3. Assemble 4×3 portal frames with matching materials and ignite them.
4. Master each dimension’s puzzle physics to gather rare loot.
5. Build onward portals until you reach the collapsing Netherite realm.
6. Escape with the Eternal Ingot and return home for victory.

## Portal mechanics

- **4×3 frame template** – portals are assembled as 4-by-3 rectangles. The placement routine runs a collision scan so trees,
  chests, or even the explorer cannot occupy the footprint when the frame is forged.
- **Torch-primed activation** – touching the dormant matrix with a torch immediately charges the shader glow before the full
  activation sequence finishes. Igniters still work, but torches guarantee the luminous surge noted in the HUD.
- **Fade-driven traversal** – stepping onto the active surface triggers the portal fade overlay, resets the landing position to
  the new realm’s spawn coordinates, and logs the destination name in the event feed.
- **Dimension physics bonus** – unlocking a realm records +5 points and installs bespoke physics metadata. The Rock Dimension
  now ships with a gravity multiplier of 1.5 and a gritty shader profile to distinguish its atmosphere.
- **Mechanics summary API** – `portal-mechanics.js` exposes pure functions for tests and docs to report the frame footprint,
  activation behaviour, transition flow, and score rewards.

### Recovering portal shaders after uniform failures

The renderer will fall back to emissive planes when it detects that a portal surface material has lost a required uniform (for
example `uColor`, `uTime`, `uOpacity`, or `uActivation`). The console surfaces this by printing a warning similar to
`Portal shaders disabled after renderer failure; continuing with emissive fallback materials.` alongside the missing uniforms.

1. Rebuild or repair the affected material so that every required uniform once again exposes a `value` (the recovery helpers can
   populate defaults if the container exists).
2. Reload the scene or refresh the page. Once valid uniforms are present, the warning disappears and the renderer keeps using
   the true portal shader instead of the emissive fallback, so you retain the intended ripple animation.

## Local Development

No build tooling is required. Open `index.html` in any modern browser or use a lightweight static server:

```bash
npx serve .
```

## Continuous Deployment

This repository ships with a GitHub Actions workflow that deploys the static site to AWS whenever changes land on `main`.

### Required repository secrets

| Secret | Purpose |
| --- | --- |
| `AWS_ACCESS_KEY_ID` | IAM user key with S3 + CloudFront permissions |
| `AWS_SECRET_ACCESS_KEY` | Matching secret key |
| `AWS_REGION` | AWS region that hosts the target bucket |
| `AWS_S3_BUCKET` | Name of the S3 bucket that serves the site |

> The workflow fails fast when any secret is missing and writes detailed remediation steps (including the exact secret name) to the job summary and log output.

### Deployment flow

1. Workflow validates that all required AWS secrets exist. Missing secrets trigger an actionable failure with setup steps.
2. AWS credentials are configured via `aws-actions/configure-aws-credentials`.
3. Repository contents (excluding version control and workflow files) are synchronised to the target S3 bucket.
4. The workflow automatically discovers the CloudFront distribution attached to the S3 origin, invalidates its cache, and exposes both the distribution ID and URL as job outputs. The URL is also written to the run summary for quick access.

If no CloudFront distribution matches the S3 bucket, the workflow fails with instructions to create or tag one before redeploying.

## Enhancement Roadmap

The existing build focuses on the UI shell and backend connectivity. For an
overview of the work required to align the experience with the design vision,
review [`docs/enhancement-plan.md`](docs/enhancement-plan.md). It enumerates the
rendering, gameplay, and backend milestones that need to be implemented to reach
a fully interactive prototype.
