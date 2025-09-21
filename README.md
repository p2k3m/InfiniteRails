# Infinite Rails: Portals of Dimension

Infinite Rails is a browser-based voxel survival-puzzle prototype built entirely with vanilla HTML, CSS, and JavaScript. Gather resources, craft ordered recipes, stabilise portals, and brave bespoke rulesets in every dimension as you race to recover the Eternal Ingot.

## Game Highlights

- **Living dimensions** – every portal material reshapes the world with new physics, hazards, and ambience.
- **Order-based crafting** – drag items into a sequence to unlock equipment, igniters, and keys.
- **Tactical survival** – manage hearts, oxygen, and day/night zombie assaults while guarding your rails.
- **Dynamic UI** – responsive codex, animated progress indicators, and adaptive theming that reflects the active realm.
- **Built-in guide** – open the in-game "Game Guide" for the full design document and survival walkthrough.
- **Victory chase** – capture the Eternal Ingot in the collapsing Netherite dimension and return to the origin island.

## Controls

| Platform | Input |
| --- | --- |
| Desktop | `WASD` / arrow keys to move, `Space` to interact, `Q` to place blocks, `E` inventory, `R` build portals, `F` interact, `Shift` to sprint |
| Mobile | Swipe to move between rails, tap/hold to mine or place, tap the action buttons for crafting and portals |

## Gameplay Loop

1. Spawn on the Grassland Threshold with an empty belt.
2. Harvest trees and stone to unlock early recipes.
3. Assemble 4×3 portal frames with matching materials and ignite them.
4. Master each dimension’s puzzle physics to gather rare loot.
5. Build onward portals until you reach the collapsing Netherite realm.
6. Escape with the Eternal Ingot and return home for victory.

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

> The workflow fails fast when any secret is missing and writes detailed remediation steps (including the exact secret
> name) to the job summary and log output.

### Deployment flow

1. Workflow validates that all required AWS secrets exist. Missing secrets trigger an actionable failure with setup steps.
2. AWS credentials are configured via `aws-actions/configure-aws-credentials`.
3. Repository contents (excluding version control and workflow files) are synchronised to the target S3 bucket.
4. The workflow automatically discovers the CloudFront distribution attached to the S3 origin, invalidates its cache,
   and exposes both the distribution ID and URL as job outputs. The URL is also written to the run summary for quick access.

If no CloudFront distribution matches the S3 bucket, the workflow fails with instructions to create or tag one before
redeploying.
