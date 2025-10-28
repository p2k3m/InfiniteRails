# Production CloudFront Status

The production build for Infinite Rails is currently served from the CloudFront distribution recorded in the deployment manifest. Use the values below when validating the live site or preparing a new release.

- **Distribution URL:** https://d3gj6x3ityfh5o.cloudfront.net/
- **Last successful deploy:** 2024-07-01 (build tag `61e4a3d4804d` from `deployment/known-good-manifest.json`).
- **Last CloudFront verification:** 2024-07-01 (asset manifest verified against the distribution URL).

To reproduce the verification, fetch a sampling of assets listed in the manifest via HTTPS and confirm CloudFront returns `200 OK` responses:

```
curl -I https://d3gj6x3ityfh5o.cloudfront.net/index.html
curl -I https://d3gj6x3ityfh5o.cloudfront.net/assets/steve.gltf
curl -I https://d3gj6x3ityfh5o.cloudfront.net/vendor/three.min.js
```

If any request fails, redeploy the `61e4a3d4804d` bundle or regenerate a fresh manifest before invalidating the distribution cache.
