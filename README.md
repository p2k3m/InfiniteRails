# Infinite Dimension: Portals Reimagined

Infinite Dimension is intended to be a browser-based voxel survival-puzzle experience. The current repository ships a static proof-of-concept UI with scoreboard panels and copy taken from the long-term design brief, but the interactive renderer, entities, and survival systems described in that brief have **not** been implemented yet. This README now documents the real status of the project and points to the consolidated action plan needed to reach the desired Minecraft-inspired prototype.

## Current status

- **Renderer** – A Three.js canvas is initialised, yet no voxel terrain, characters, or lighting are created. The page therefore appears empty apart from UI overlays.
- **Input** – Keyboard and mouse listeners are stubbed out and do not move a player avatar. Mining, block placement, and crafting actions are missing.
- **Entities** – No player, zombie, or golem models load. Combat, health depletion, and respawn logic are absent.
- **Portals & progression** – Portal placement, dimension swaps, score rewards, and boss encounters are placeholders only.
- **Backend sync** – AWS Lambda/DynamoDB infrastructure exists in `serverless/`, but the frontend never calls it because gameplay events that would trigger network activity do not occur.

The repository therefore represents an early staging ground rather than a working build. See [docs/portals-of-dimension-plan.md](docs/portals-of-dimension-plan.md) for the exhaustive implementation roadmap that reconciles the current code with the official "Comprehensive Analysis and Enhancement Specifications" brief.

## Near-term objectives

The most critical engineering work falls into five tracks:

1. **Core rendering & performance** – generate the 64×64 voxel island, set up day/night lighting, load character models, and hit 60 FPS with frustum culling.
2. **Player experience** – wire WASD + pointer lock, mobile joystick controls, mining/placement, and a functioning hotbar and crafting UI.
3. **Entities & survival** – spawn hostile zombies and allied golems, deduct hearts, track oxygen, and handle respawns.
4. **Portals & progression** – detect 4×3 frames, animate shader portals, deliver realm-specific physics, and build the Netherite boss encounter.
5. **Backend & polish** – sync scores, surface leaderboards, wire Google SSO, add tooltips/audio, and document validation coverage.

Progress against each track is maintained in [docs/enhancement-roadmap.md](docs/enhancement-roadmap.md). The roadmap reflects the real implementation state so reviewers can see which systems are still pending.

## Validation & test matrix

Refer to [`docs/validation-matrix.md`](docs/validation-matrix.md) for the complete mapping between requirements, validation methods, success criteria, and hands-on test scenarios used during regression.

## Enhancement roadmap

The design brief titled **“Comprehensive Analysis and Enhancement Specifications for Infinite Rails: Portals of Dimension”**
introduces a broad slate of rendering, interaction, and backend improvements that build toward a fully interactive prototype.
To keep progress visible, the actionable checklist extracted from that brief now lives in
[`docs/enhancement-roadmap.md`](docs/enhancement-roadmap.md). Update that roadmap as features land so the team can quickly gauge
momentum toward the full experience described in the brief.

If you need a quick status snapshot, [`docs/spec-compliance.md`](docs/spec-compliance.md) summarises how each requirement in the
brief maps to shipped code (with direct citations), while [`docs/feature-verification.md`](docs/feature-verification.md) dives
deeper into the implementation details and validation steps.

If you work with coding agents (for example GitHub Copilot or Code Interpreter) the verbatim prompts from the brief are archived in [`docs/coding-agent-prompts.md`](docs/coding-agent-prompts.md). Reusing those prompts keeps automated contributions aligned with the currently shipped sandbox systems.

## Simplified sandbox mode

The legacy renderer and gameplay stack are still under heavy construction. To ensure explorers always land in a responsive,
playable space, the page now boots into a lightweight **sandbox mode** by default. This mode:

- draws a 64×64 voxel island with soft day/night lighting at 60 FPS, complete with a procedurally curved rail spine,
- locks the camera to a first-person perspective with mouse look + `WASD` movement and jump physics that adapt to each realm,
- supports mining (left-click) and block placement (right-click) with realtime HUD updates and portal progress feedback,
- rewards completing a 12-block frame by spawning an animated portal that advances the dimension palette and physics, and
- keeps the existing HUD elements alive so hearts, daylight percentage, zombie alerts, and score counters remain informative.

Use the following switches to control which experience loads:

| Mode | How to activate |
| --- | --- |
| Sandbox (default) | Load the page normally. You can also force it with `?mode=simple` or by setting `APP_CONFIG.forceSimpleMode = true`. |
| Advanced preview | Append `?mode=advanced` (or `?advanced=1`) to the URL or set `APP_CONFIG.forceAdvanced = true`. |

The sandbox keeps the portal-building brief front-and-centre while the production renderer catches up. When advanced mode is
ready, flip the flags above to continue development without losing the reliable fallback.

## Controls

| Platform | Input |
| --- | --- |
| Desktop | `WASD` / arrow keys to move, `Space` to interact, `Q` to place blocks, `E` inventory, `R` build portals, `F` interact, `Shift` to sprint |
| Mobile | Swipe to move between rails, tap/hold to mine or place, tap the action buttons for crafting and portals |

## Identity, location & scoreboard endpoints

Expose an `APP_CONFIG` object before loading `script.js` to wire up Google SSO and DynamoDB-backed endpoints:

```html
<script>
  window.APP_CONFIG = {
    apiBaseUrl: 'https://your-api.example.com',
    googleClientId: 'GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com',
  };
</script>
```

- **Google SSO** – supply a valid `googleClientId` to render the Google Identity Services button so explorers can carry their progress across devices.
- **User metadata** – on sign-in the app POSTs to `${apiBaseUrl}/users` with the player’s Google ID, preferred name, device snapshot, and geolocation (if permission is granted). The handler can write directly to a DynamoDB table keyed by Google ID.
- **Scoreboard** – the app loads scores via `GET ${apiBaseUrl}/scores` and upserts the player’s run with `POST ${apiBaseUrl}/scores`. The payload mirrors the UI fields: `name`, `score`, `dimensionCount`, `runTimeSeconds`, `inventoryCount`, plus optional `location` or `locationLabel` fields.
- **Offline-friendly** – when `apiBaseUrl` is absent the UI persists identities and scores to `localStorage` and displays sample leaderboard entries so the page remains fully interactive.

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
