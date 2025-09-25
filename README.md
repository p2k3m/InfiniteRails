# Infinite Dimension: Portals Reimagined

Infinite Dimension is a browser-based voxel survival-puzzle prototype built entirely with vanilla HTML, CSS, and JavaScript. Gather resources, craft ordered recipes, stabilise portals, and brave bespoke rulesets in every dimension as you race to recover the Eternal Ingot. This iteration introduces a responsive profile hub, optional Google SSO, geolocation capture, and a DynamoDB-ready scoreboard that showcases every explorer’s run.

## What’s new in this build

- **Rebranded universe** – refreshed logo, typography, and copy bring the Infinite Dimension identity to life.
- **Every-device layout** – headers, panels, and scorecards fluidly adapt from ultrawide monitors down to compact phones.
- **Player Hub** – view the signed-in player’s name, location badge, and device fingerprint alongside the existing HUD.
- **Google-powered sign-in** – authenticate with Google to unlock the shared scorecard and sync your metadata.
- **DynamoDB-ready APIs** – the frontend posts user/device/location telemetry to `/users` and reads/writes scores at `/scores`.
- **Live scoreboard** – explore top multiverse runs, complete with dimension counts, run time, inventory haul, and location tags.
- **Serverless backend** – deployable AWS Lambda handlers and DynamoDB tables now live in `serverless/` for `/users` and `/scores`.

## Game Highlights

- **Living dimensions** – every portal material reshapes the world with new physics, hazards, and ambience.
- **Order-based crafting** – drag items into a sequence to unlock equipment, igniters, and keys.
- **Tactical survival** – manage hearts, oxygen, and day/night zombie assaults while guarding your rails.
- **Dynamic UI** – responsive codex, animated progress indicators, and adaptive theming that reflects the active realm.
- **Built-in guide** – open the in-game "Game Guide" for the full design document and survival walkthrough.
- **Victory chase** – capture the Eternal Ingot in the collapsing Netherite dimension and return to the origin island.

## Validation & test matrix

Refer to [`docs/validation-matrix.md`](docs/validation-matrix.md) for the complete mapping between requirements, validation methods, success criteria, and hands-on test scenarios used during regression.

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
