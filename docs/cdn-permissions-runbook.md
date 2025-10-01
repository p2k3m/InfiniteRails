# CloudFront 403 Troubleshooting Runbook

When every request to `d3gj6x3ityfh5o.cloudfront.net/*.js` (or other static asset paths) returns **HTTP 403**, CloudFront is unable to fetch the files from the origin bucket. This runbook documents the validation steps and fixes for the typical root causes: restrictive S3 bucket policies, object ACLs, and an incorrectly configured Origin Access Identity (OAI) or Origin Access Control (OAC).

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
     "Sid": "AllowCloudFrontServicePrincipalReadOnly",
     "Effect": "Allow",
     "Principal": {
       "AWS": "arn:aws:iam::cloudfront:user/CloudFront Origin Access Identity E3ABCDEFG1234"
     },
     "Action": [
       "s3:GetObject",
       "s3:ListBucket"
     ],
     "Resource": [
       "arn:aws:s3:::infinite-rails-prod-assets",
       "arn:aws:s3:::infinite-rails-prod-assets/*"
     ]
   }
   ```
3. If the distribution uses an Origin Access Control, the principal should be the service principal `cloudfront.amazonaws.com` with the appropriate signing condition block. Update the policy accordingly and redeploy.

### 2.3 Validate S3 Block Public Access

- Run:
  ```bash
  aws s3api get-public-access-block --bucket infinite-rails-prod-assets
  ```
- All four properties (`BlockPublicAcls`, `IgnorePublicAcls`, `BlockPublicPolicy`, `RestrictPublicBuckets`) should be `true`. If any are `false`, enable them to avoid relying on public ACLs.

### 2.4 Audit object ACLs

- Confirm the objects do **not** rely on public ACLs:
  ```bash
  aws s3api get-object-acl --bucket infinite-rails-prod-assets --key script.js
  ```
- Only the bucket owner (and optional replication services) should appear. Remove `AllUsers` or `AuthenticatedUsers` grants—they conflict with public access blocks.

### 2.5 Verify static asset readability

- Choose a few asset types (for example `script.js`, `assets/steve.gltf`, and `assets/audio-samples.json`).
- If the bucket relies on an OAI/OAC, fetch the files through CloudFront: `curl -I https://d3gj6x3ityfh5o.cloudfront.net/assets/steve.gltf`.
- If the bucket is intentionally public, fetch directly from S3 with anonymous credentials: `curl -I https://infinite-rails-prod-assets.s3.${AWS_REGION}.amazonaws.com/assets/steve.gltf`.
- All requests must return `200` responses. A `403` or `404` indicates the bucket policy is missing a wildcard grant (`arn:aws:s3:::<bucket>/*`) or that the object ACL blocked access. Update the policy or re-upload the object until every asset path responds successfully.

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

## 4. Test direct S3 access

- Temporarily (or in a non-production bucket), disable the OAI restriction by granting yourself access via IAM and fetch the object directly:
  ```bash
  aws s3 cp s3://infinite-rails-prod-assets/script.js -
  ```
- If this succeeds, the files exist and the problem is strictly IAM-related.

## 5. Redeploy and invalidate

1. After updating policies, wait for CloudFront to propagate the changes (or trigger a distribution update).
2. Invalidate cached errors:
   ```bash
   aws cloudfront create-invalidation --distribution-id E1234567890 --paths "/*"
   ```
3. Re-run the initial curl test to confirm the assets now return `200`.

## 6. Automation checklist

To prevent future regressions:

- Store the bucket policy and CloudFront distribution configuration in infrastructure-as-code (SAM/CloudFormation/Terraform).
- Add CI checks that run `aws cloudfront get-distribution` and `aws s3api get-bucket-policy` to detect drifts.
- Enable CloudFront real-time logs or Lambda@Edge alarms for spikes in `403` errors.
- Document the OAI/OAC ID in deployment notes to speed up cross-team debugging.

Following this runbook ensures CloudFront has permission to fetch your JavaScript, CSS, and other static assets from S3 so the site loads correctly.
