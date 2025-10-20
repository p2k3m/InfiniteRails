#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const { loadManifest, computeAssetDigest } = require('./validate-asset-manifest.js');
const { resolveBuildSha } = require('./lib/build-sha.js');
const { updateFileReferences } = require('./lib/version-ref-updater.js');

const repoRoot = path.resolve(__dirname, '..');
const manifestPath = path.join(repoRoot, 'asset-manifest.json');

function formatAssetVersion(digest, buildSha) {
  if (!digest) {
    return buildSha || '';
  }
  if (!buildSha) {
    return digest;
  }
  return `${digest}.${buildSha}`;
}

function rewriteAssetReference(entry, digest, buildSha) {
  const params = new URLSearchParams(entry.query || '');
  params.delete('v');
  params.append('v', formatAssetVersion(digest, buildSha));
  const query = params.toString();
  return query ? `${entry.path}?${query}` : entry.path;
}

/**
 * Synchronises the asset manifest digests with the current on-disk files.
 * Recomputes checksums, updates manifest entries, and rewrites references in
 * dependent files until everything aligns with the local asset state.
 */
function ensureManifestDigests() {
  const buildSha = resolveBuildSha();
  const maxPasses = 10;
  let pass = 0;
  let hasLoggedUpdates = false;

  while (pass < maxPasses) {
    pass += 1;

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const { entries } = loadManifest();

    const updates = [];
    const versionMap = new Map();

    entries.forEach((entry, index) => {
      const fullPath = path.join(repoRoot, entry.path);
      let stats;
      try {
        stats = fs.statSync(fullPath);
      } catch (error) {
        return;
      }

      if (!stats.isFile()) {
        return;
      }

      const digest = computeAssetDigest(fullPath);
      const expectedVersion = formatAssetVersion(digest, buildSha);
      versionMap.set(entry.path, expectedVersion);
      if (entry.version === expectedVersion) {
        return;
      }

      const originalVersion = entry.version;
      manifest.assets[index] = rewriteAssetReference(entry, digest, buildSha);
      updates.push({
        asset: entry.path,
        from: originalVersion,
        to: expectedVersion,
      });
    });

    if (updates.length > 0) {
      fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

      console.log('Updated asset-manifest.json digests:');
      for (const update of updates) {
        const fromValue = update.from ? `v=${update.from}` : 'missing digest';
        console.log(` • ${update.asset}: ${fromValue} → v=${update.to}`);
      }
      console.log('\nReview and commit asset-manifest.json before publishing.');

      hasLoggedUpdates = true;
    }

    const updatedFiles = updateFileReferences(versionMap);

    if (updates.length === 0 && updatedFiles.length === 0) {
      if (!hasLoggedUpdates) {
        console.log('asset-manifest.json digests already match on-disk assets.');
      }
      return;
    }
  }

  throw new Error('Unable to synchronise asset digests after multiple passes.');
}

function main() {
  try {
    ensureManifestDigests();
  } catch (error) {
    console.error(error.message || error);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = { ensureManifestDigests };
