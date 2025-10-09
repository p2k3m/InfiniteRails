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
3. `npm run test:pre-release` executes both suites sequentially and is wired into the release hooks so `npm version`/`npm publish` fail fast if either suite regresses.

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
| Advanced renderer (default) | Load the page normally. The bundled `APP_CONFIG` now enables and prefers the advanced renderer so the fully interactive 3D experience starts immediately on desktop devices. |
| Sandbox renderer (fallback) | Append `?mode=simple` (or `?simple=1`), or set `APP_CONFIG.forceSimpleMode = true`. This mirrors the previous default for devices that need the lighter sandbox. |

The active renderer mode is surfaced for quick verification: inspect `data-renderer-mode` on `<html>`/`<body>` or read `window.InfiniteRails.rendererMode`. These indicators flip immediately when query params or `APP_CONFIG` overrides change the active experience.

Touch-first devices automatically fall back to the sandbox renderer unless you explicitly opt in by setting `APP_CONFIG.supportsAdvancedMobile = true`. This keeps the onboarding flow stable on phones and tablets while the advanced build matures. When the flag remains `false`, `script.js` records the detected mobile environment on `APP_CONFIG.isMobileEnvironment` and emits a bootstrap notice explaining that the simplified renderer was selected for mobile safety.

The sandbox keeps the portal-building brief front-and-centre while the production renderer continues to mature. Flip the flags
above whenever you want to regression-test the work-in-progress advanced build without losing the reliable sandbox.

An automatic “safe mode” circuit breaker now guards the boot sequence: if the advanced renderer fails to emit its start signal within five seconds, the watchdog logs the timeout and relaunches the simplified sandbox. Overriding `APP_CONFIG.rendererStartTimeoutMs` still allows deployments to extend or reduce that window when necessary.

### Troubleshooting

#### White screen or blank viewport

If you load the page and only see the HUD without the voxel world, run through the quick checks below:

1. **Force the sandbox.** Append `?mode=simple` (or set `APP_CONFIG.forceSimpleMode = true`) to bypass any lingering advanced-mode flags that might have been left in `localStorage` or injected configs.
2. **Verify asset paths.** Confirm the `assets/` directory is being served alongside `index.html`; the sandbox streams GLTF rigs and textures from those relative URLs and will refuse to start if they 404.
3. **Inspect the console.** Shader-uniform or WebGL context errors will be logged with actionable recovery tips—clear the cache and reload once the offending asset has been restored.
4. **Disable browser extensions.** Content blockers can prevent pointer-lock or audio initialisation; retry in a private window if input still appears frozen.

These steps restore the intended first-person experience when a deployment or cached configuration temporarily forces the alternate renderer path.

#### Asset 403 errors

403 responses on textures, GLTFs, or audio files usually mean the CDN or hosting layer is blocking relative asset fetches:

1. **Check `assetBaseUrl`.** When hosting from a subdirectory or CDN, ensure `APP_CONFIG.assetBaseUrl` points at the folder that exposes `assets/` and `vendor/`. Mismatched prefixes produce signed URL or CORS failures.
2. **Bump `assetVersionTag`.** After refreshing your asset pack (textures, GLTFs, audio), increment `APP_CONFIG.assetVersionTag` so the client appends a fresh cache-busting query string. The bundled build seeds a default tag, but CDN deployments should advance it whenever files change.
3. **Validate headers.** Confirm the server is configured to serve static assets with the correct MIME types and CORS headers. Three.js will abort loads when GLTF files are returned as HTML error pages.
4. **Regenerate tokens.** If you rely on signed URLs, regenerate the token bundle and redeploy. Expired credentials manifest as 403s even when the path is correct.

Once the CDN returns `200 OK` with the expected content type, the renderer will resume streaming the missing resources without requiring code changes.

#### Renderer fails to boot

When the advanced renderer refuses to start (no player spawn, empty scene, or repeated retries in the console):

1. **Reset local overrides.** Clear `localStorage` keys beginning with `infinite-rails-` to remove conflicting feature flags, then reload to allow the default configuration to reapply.
2. **Confirm WebGL support.** Visit `chrome://gpu` (or the equivalent in your browser) and make sure WebGL2 is hardware accelerated. Outdated GPU drivers can trigger the fallback or leave the renderer stalled.
3. **Rebuild the bundle.** Run `npm install` followed by `npm run build` (or the deploy pipeline) to ensure the advanced build artifacts are present and up to date.
4. **Fallback to sandbox.** If the advanced build continues to fail, launch with `?mode=simple` so playtesting can continue while renderer-specific regressions are investigated.

Capturing console logs and the exact build SHA alongside these steps will accelerate triage when filing a regression report.

## Controls

| Platform | Input |
| --- | --- |
| Desktop | `WASD` / arrow keys to move, `Space` to jump, `F` interact/use, `Q` place blocks, `R` ignite portal, `E` crafting, `I` inventory, `T` reset position, `V` toggle view, `F1` How to Play, Game Guide via HUD, `F2` settings, `F3` leaderboard, `1–0` hotbar slots |
| Mobile | Swipe to move between rails, tap/hold to mine or place, tap the action buttons for crafting and portals |

Desktop key bindings now live in the declarative `assets/controls.config.js` file. Edit that config to change the defaults that ship with your build—every action is listed in one place with the same WASD/arrow conventions. Players can still remap controls from the in-game **Settings → Key bindings** panel, and you can override or update the map via configuration or at runtime:

```html
<script>
  window.APP_CONFIG = {
    controlMap: {
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

At runtime you can also swap the declarative map without reloading. The bootstrapper exposes a shared API on `window.InfiniteRailsControls` (mirrored on `window.SimpleExperience.controlMap`) so hotkey changes propagate immediately to both renderers:

```js
// Merge in an alternate map and refresh active experiences
window.InfiniteRailsControls.apply({
  moveForward: ['ArrowUp'],
  moveBackward: ['ArrowDown'],
});

// Reset to the defaults from assets/controls.config.js
window.InfiniteRailsControls.reset();
```

The advanced renderer exposes the existing instance helpers on `window.InfiniteRails` once `script.js` boots. Use either the per-instance methods or the global control-map API to tweak bindings without reloading:

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
    // When deploying from a subdirectory, point assetBaseUrl at the folder that hosts
    // vendor/ and the other shared bundles so relative asset fetches keep working.
    assetBaseUrl: 'https://cdn.example.com/compose/',
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
- **Static asset base paths** – when the experience is served from a subdirectory (for example, `https://cdn.example.com/compose/`), provide `assetBaseUrl` to point at the folder containing `vendor/` and other shared bundles. The bootstrapper automatically uses the page URL as a default, but explicitly setting the base prevents 404s when assets live outside the current directory. Confirming this value before running the build is the easiest way to avoid missing textures and GLTF models when you publish to nested folders.
- **Texture packs** – set `textureBaseUrl` to a bucket such as `https://your-bucket.s3.amazonaws.com/blocks` (or provide a `textures` / `textureManifest` map) to stream PNG tile maps for `grass`, `dirt`, `stone`, and `rails`. The bundled build now ships with embedded data-URI sprites for these blocks so the world renders instantly offline; add your own manifest or base URL when you want to override the defaults with higher fidelity art. Provide `textureAlternateBaseUrls` (an array of CDN prefixes) to register failover endpoints, and call `window.InfiniteRails.refreshTextures()` to hot-reload textures at runtime when a diagnostics prompt flags missing art.

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
| `AWS_CLOUDFRONT_DISTRIBUTION_ID` | CloudFront distribution that fronts the bucket |

> The workflow fails fast when any secret is missing and writes detailed remediation steps (including the exact secret name) to the job summary and log output.

### Deployment flow

1. Workflow validates that all required AWS secrets exist. Missing secrets trigger an actionable failure with setup steps.
2. AWS credentials are configured via `aws-actions/configure-aws-credentials`.
3. `asset-manifest.json` is validated to ensure every required bundle, vendor shim, and GLTF/audio asset exists locally and is covered by the deploy sync rules.
4. Repository contents (excluding version control and workflow files) are synchronised to the target S3 bucket.
5. The workflow automatically discovers the CloudFront distribution attached to the S3 origin, invalidates its cache, waits for the flush to finish, and exposes both the distribution ID and URL as job outputs. The URL is also written to the run summary for quick access.

The manifest lives at the repository root (`asset-manifest.json`) and serves as the canonical checklist of production assets. Update it whenever you add or retire a runtime bundle, vendor shim, or static asset that must ship with the experience. The deployment tests and workflow both fail fast if the manifest is missing entries or points at non-existent files.

When you update any bundled asset (for example `script.js` or `simple-experience.js`), run `npm run sync:asset-digests` to regenerate the cache-busting `?v=` values in the manifest. The pre-release gate (`npm run test:pre-release`) now runs this sync automatically before validating the manifest, so you can simply execute the gate and commit the refreshed manifest alongside your asset changes.

Run `node scripts/validate-asset-manifest.js` before publishing to ensure nothing falls through the cracks. Pass `--base-url https://<domain>/` (or set `ASSET_MANIFEST_BASE_URL`) so the validator can issue anonymous `HEAD` requests against every entry. The command now verifies four buckets:

1. Every manifest entry maps to a file on disk.
2. Static assets are world-readable without unexpected write or execute bits (required for CDN delivery).
3. The CloudFormation template grants the CloudFront Origin Access Identity (OAI) `s3:GetObject` access only to `assets/`, `textures/`, and `audio/` prefixes.
4. The target endpoint responds to `HEAD` requests with a 2xx status for each asset.

The script prints actionable errors when any check fails, including the offending permissions or HTTP status codes. Skip the `--base-url` flag when running locally to perform the on-disk and workflow checks only.

> **Always invalidate the CDN on every deploy.**
>
> Even when you ship manually (outside the GitHub Actions workflow), run a full CloudFront invalidation right after syncing the latest assets to S3 so browsers stop serving cached bundles. Skipping this step leaves stale JavaScript, CSS, or GLTF files in place, and often looks like missing HUD art, half-loaded geometry, or corrupted audio/textures because the browser pulled an outdated bundle from CloudFront. Always flush the distribution immediately after each sync to guarantee players download the refreshed build. Trigger the flush with:
>
> ```bash
> aws cloudfront create-invalidation \
>   --distribution-id "$AWS_CLOUDFRONT_DISTRIBUTION_ID" \
>   --paths "/*"
> ```
>
> Wait for the invalidation to complete before announcing the deploy so players and automated smoke tests pick up the refreshed build immediately.

If no CloudFront distribution matches the S3 bucket, the workflow fails with instructions to create or tag one before redeploying.

### Static asset permissions

Every file uploaded during the deploy—including JavaScript bundles, GLTF models, textures, ambient audio, and any future additions under `assets/`, `textures/`, `audio/`, or `vendor/`—must be readable by CloudFront. The deploy workflow now **requires** a CloudFront Origin Access Identity (OAI) or Origin Access Control (OAC) and configures the S3 bucket with an `s3:GetObject` grant that is scoped to the identity/control and the relevant prefixes. Public ACLs and anonymous bucket policies are no longer permitted; the job fails if the distribution does not expose an OAI or OAC.

To confirm nothing blocks the experience from loading:

1. Run `aws s3api get-bucket-policy --bucket <bucket>` and ensure the `Principal` is either the CloudFront OAI canonical user (for example `arn:aws:iam::cloudfront:user/CloudFront Origin Access Identity E3ABC123`) or the CloudFront service principal (`cloudfront.amazonaws.com`) with the expected `AWS:SourceArn` condition if you are using an OAC. The statement must only grant `s3:GetObject` to the explicit site bundles plus `assets/*`, `textures/*`, `audio/*`, and `vendor/*`.
2. Run `node scripts/validate-asset-manifest.js` locally. The validator fails if any file under `assets/`, `textures/`, or `audio/` lacks world-readable permissions or if the deploy workflow omits a prefix.
3. Pick a representative asset (for example `assets/steve.gltf` or `assets/audio-samples.json`) and fetch it anonymously through CloudFront: `curl -I https://<distribution-domain>/assets/steve.gltf`. A `200` response confirms CloudFront can reach the object.

If the curl test returns `403`, revisit the bucket policy or OAI bindings until the CDN can retrieve every static asset.

## Enhancement Roadmap

The existing build focuses on the UI shell and backend connectivity. For an
overview of the work required to align the experience with the design vision,
review [`docs/enhancement-plan.md`](docs/enhancement-plan.md). It enumerates the
rendering, gameplay, and backend milestones that need to be implemented to reach
a fully interactive prototype.
