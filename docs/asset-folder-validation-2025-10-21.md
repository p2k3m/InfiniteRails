# Asset Folder Validation – 2025-10-21

## Objective
Verify that the `/assets` directory (covering models, textures, and audio) is publicly readable from the production CDN at `https://d3gj6x3ityfh5o.cloudfront.net/` by directly requesting each URL recorded in `asset-manifest.json`.

## Method
Attempted to fetch every file within the local `assets/` directory via HTTPS against the manifest's `assetBaseUrl` using `curl` from the deployment environment.

## Result
All remote requests failed before establishing an HTTPS tunnel. The proxy returned `HTTP 403` during CONNECT negotiation, preventing validation of public readability for the asset bundle.

## Evidence
```
curl -I https://d3gj6x3ityfh5o.cloudfront.net/
# -> HTTP/1.1 403 Forbidden (CONNECT tunnel failed)
```

The failure indicates an environment-level restriction (likely network egress policy) rather than missing objects on the CDN. No asset accessibility guarantees could be confirmed during this run.

## Follow-up Recommendations
- Re-run the validation from a network location with outbound HTTPS access to the CloudFront distribution.
- Confirm CDN accessibility through infrastructure monitoring or logs to ensure public readability once network access is restored.
