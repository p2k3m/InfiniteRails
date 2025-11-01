# CloudFront 403 Troubleshooting Runbook

When every request to `d3gj6x3ityfh5o.cloudfront.net/*.js` (or other static asset paths) returns **HTTP 403**, CloudFront is unable to fetch the files from the origin bucket. The bootstrapper now logs `CloudFront returned HTTP 403 for asset-manifest.json — ensure the distribution can read from the origin bucket.` to direct on-call engineers to this document. This runbook documents the validation steps and fixes for the typical root causes: restrictive S3 bucket policies, object ACLs, and an incorrectly configured Origin Access Identity (OAI) or Origin Access Control (OAC).

## 1. Confirm the symptom

1. Use `curl` to reproduce the failure:
   ```bash
   curl -I https://d3gj6x3ityfh5o.cloudfront.net/script.js
   ```
2. Check CloudFront access logs (if enabled) for `403` responses with the `AccessDenied` error.
3. Open the AWS CloudWatch metrics for the distribution to verify the spike in `4xxErrorRate` aligns with the reported outage.

## 2. Inspect S3 bucket settings

### 2.1 Identify the origin bucket

- Open the CloudFront distribution, note the **Origin Domain Name**, and map it to the S3 bucket that stores the static site (for example, `infinite-rails-prod-assets`).

### 2.2 Check the bucket policy

1. The bucket must **deny public access** but **allow the CloudFront OAI/OAC** to read objects. Inspect the policy:
   ```bash
   aws s3api get-bucket-policy --bucket infinite-rails-prod-assets --query Policy --output text | jq .
   ```
2. Ensure it includes a statement similar to:
   ```json
   {
     "Sid": "AllowCloudFrontOAIReadOnly",
     "Effect": "Allow",
     "Principal": {
       "AWS": "arn:aws:iam::cloudfront:user/CloudFront Origin Access Identity E3ABCDEFG1234"
     },
     "Action": "s3:GetObject",
    "Resource": [
      "arn:aws:s3:::infinite-rails-prod-assets/*.html",
      "arn:aws:s3:::infinite-rails-prod-assets/*.js",
      "arn:aws:s3:::infinite-rails-prod-assets/*.css",
      "arn:aws:s3:::infinite-rails-prod-assets/*.json",
      "arn:aws:s3:::infinite-rails-prod-assets/assets/*",
      "arn:aws:s3:::infinite-rails-prod-assets/textures/*",
      "arn:aws:s3:::infinite-rails-prod-assets/audio/*",
      "arn:aws:s3:::infinite-rails-prod-assets/vendor/*",
      "arn:aws:s3:::infinite-rails-prod-assets/scripts/*"
    ]
  }
  ```
   If you temporarily need world-readable access (for example, to debug a sandbox bucket without CloudFront), swap the principal for `"*"` or `{"AWS": "*"}` but keep the resource list identical so only the expected prefixes remain public:

   ```json
   {
     "Sid": "AllowPublicAssetRead",
     "Effect": "Allow",
     "Principal": "*",
     "Action": "s3:GetObject",
    "Resource": [
      "arn:aws:s3:::infinite-rails-prod-assets/*.html",
      "arn:aws:s3:::infinite-rails-prod-assets/*.js",
      "arn:aws:s3:::infinite-rails-prod-assets/*.css",
      "arn:aws:s3:::infinite-rails-prod-assets/*.json",
      "arn:aws:s3:::infinite-rails-prod-assets/assets/*",
      "arn:aws:s3:::infinite-rails-prod-assets/textures/*",
      "arn:aws:s3:::infinite-rails-prod-assets/audio/*",
      "arn:aws:s3:::infinite-rails-prod-assets/vendor/*",
      "arn:aws:s3:::infinite-rails-prod-assets/scripts/*"
    ]
  }
  ```
   Remember to restore the OAI/OAC principal before leaving the bucket unattended in production.
3. If the distribution uses an Origin Access Control, the principal should be the service principal `cloudfront.amazonaws.com` with the appropriate signing condition block. Update the policy accordingly and redeploy.

### 2.3 Validate S3 Block Public Access

- Run:
  ```bash
  aws s3api get-public-access-block --bucket infinite-rails-prod-assets
  ```
- All four properties (`BlockPublicAcls`, `IgnorePublicAcls`, `BlockPublicPolicy`, `RestrictPublicBuckets`) should be `true`. If any are `false`, enable them to avoid relying on public ACLs. The deploy workflow enforces these settings before applying the bucket policy.

### 2.4 Audit object ACLs

- Confirm the objects do **not** rely on public ACLs:
  ```bash
  aws s3api get-object-acl --bucket infinite-rails-prod-assets --key script.js
  ```
- Only the bucket owner (and optional replication services) should appear. Remove `AllUsers` or `AuthenticatedUsers` grants—they conflict with public access blocks.

### 2.5 Verify static asset readability

- Choose a few asset types (for example `script.js`, `assets/steve.gltf`, `textures/grass.png`, and `assets/audio-samples.json`).
- If the bucket relies on an OAI/OAC, fetch the files through CloudFront: `curl -I https://d3gj6x3ityfh5o.cloudfront.net/assets/steve.gltf`.
- If you temporarily bypass the OAI requirement outside the automated workflow (for example, while testing a sandbox bucket), fetch directly from S3 with anonymous credentials: `curl -I https://infinite-rails-prod-assets.s3.${AWS_REGION}.amazonaws.com/assets/steve.gltf`.
- All requests must return `200` responses. A `403` or `404` indicates the OAI grant is missing a required prefix or that the object ACL blocked access. Update the policy or re-upload the object until every asset path responds successfully, then restore the OAI restrictions.
- Run a quick multi-asset sweep with `curl` so you cover models, textures, and audio in one pass:

  ```bash
  curl -I "https://d3gj6x3ityfh5o.cloudfront.net/assets/portal.gltf"
  curl -I "https://d3gj6x3ityfh5o.cloudfront.net/textures/grass.png"
  curl -I "https://d3gj6x3ityfh5o.cloudfront.net/audio/theme.mp3"
  ```

  Swap the filenames for items that exist in your manifest. Every request should succeed with `200 OK`.

## 3. Validate the CloudFront Origin Access Identity / Control

### 3.1 Origin Access Identity (legacy)

1. List OAIs:
   ```bash
   aws cloudfront list-cloud-front-origin-access-identities
   ```
2. Ensure the distribution references the expected `Id` (e.g. `E3ABCDEFG1234`).
3. If missing, create a new OAI and attach it to the S3 origin. Update the bucket policy with the OAI's canonical user ID.

### 3.2 Origin Access Control (recommended)

1. If the distribution uses OAC, verify the signing configuration:
   ```bash
   aws cloudfront get-origin-access-control --id K1ABCDEF123456
   ```
2. Confirm the origin configuration in the distribution attaches the OAC (`OriginAccessControlId`).
3. Regenerate a deployment if changes were made:
   ```bash
   aws cloudfront update-distribution --id E1234567890 --distribution-config file://dist-config.json --if-match E2SOMEE2TAG
   ```

## 4. Inspect CloudFront cache behaviors

1. In the CloudFront console open **Behaviors** and edit the path pattern that routes to the S3 origin (typically the default behaviour `/*`).
2. Verify **Restrict viewer access (Use Signed URLs or Signed Cookies)** is **Disabled**. Enabling it without distributing signed credentials causes every anonymous CDN request to fail with `403`.
3. Under **Cache key and origin requests** choose AWS managed policies that forward the required headers without forcing viewer credentials:
   - **Cache policy**: `Managed-CachingOptimized` (or an equivalent custom policy that does not require viewer cookies or query strings).
   - **Origin request policy**: `Managed-CORS-S3Origin` so CloudFront passes the `Origin`, `Access-Control-Request-*`, and `Host` headers S3 needs for CORS.
   - If you use a custom origin request policy, double-check it forwards the same headers and does not require signed cookies.
4. Save the behaviour. Once deployed CloudFront serves static assets anonymously and only the OAI/OAC credentials are used for the S3 fetch.

## 5. Test direct S3 access

- Temporarily (or in a non-production bucket), disable the OAI restriction by granting yourself access via IAM and fetch the object directly:
  ```bash
  aws s3 cp s3://infinite-rails-prod-assets/script.js -
  ```
- If this succeeds, the files exist and the problem is strictly IAM-related.

## 6. Redeploy and invalidate

1. After updating policies, wait for CloudFront to propagate the changes (or trigger a distribution update).
2. Invalidate cached errors and always purge the distribution after each deploy so the latest bundles, textures, and GLTFs reach players immediately. Neglecting the flush leaves CloudFront serving stale or partially uploaded bundles, which shows up as missing UI chrome or corrupted geometry/audio on the next load. Trigger a full-path invalidation right after every S3 sync:
   ```bash
   aws cloudfront create-invalidation --distribution-id E1234567890 --paths "/*"
   ```
3. Re-run the initial curl test to confirm the assets now return `200`.

## 7. Automation checklist

To prevent future regressions:

- Store the bucket policy and CloudFront distribution configuration in infrastructure-as-code (SAM/CloudFormation/Terraform).
- Add CI checks that run `aws cloudfront get-distribution` and `aws s3api get-bucket-policy` to detect drifts.
- Enable CloudFront real-time logs or Lambda@Edge alarms for spikes in `403` errors.
- Document the OAI/OAC ID in deployment notes to speed up cross-team debugging.

Following this runbook ensures CloudFront has permission to fetch your JavaScript, CSS, and other static assets from S3 so the site loads correctly.
