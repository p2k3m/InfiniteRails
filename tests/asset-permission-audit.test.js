import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { createRequire } from 'node:module';

const repoRoot = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

const {
  loadManifest,
  listPermissionIssues,
  listAssetDirectoryPermissionIssues,
  loadTemplateDocument,
  describeBucketPolicyIssues,
} = require('../scripts/validate-asset-manifest.js');

describe('S3/CloudFront asset permission audit', () => {
  const manifest = loadManifest();
  const manifestAssetPaths = manifest.entries.map((entry) => entry.path);

  it('ensures manifest assets are world-readable without stray permissions', () => {
    expect(listPermissionIssues(manifestAssetPaths)).toEqual([]);
  });

  it('ensures all assets, textures, and audio directories are world-readable', () => {
    expect(listAssetDirectoryPermissionIssues()).toEqual([]);
  });

  it('ensures the CloudFormation bucket policy only grants s3:GetObject to the CloudFront OAI', () => {
    const templateDocument = loadTemplateDocument();
    expect(describeBucketPolicyIssues(templateDocument)).toEqual([]);
  });
});
