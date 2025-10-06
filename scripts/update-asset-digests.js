#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const {
  loadManifest,
  computeAssetDigest,
} = require('./validate-asset-manifest.js');

const repoRoot = path.resolve(__dirname, '..');
const manifestPath = path.join(repoRoot, 'asset-manifest.json');

function rewriteAssetReference(entry, digest) {
  const params = new URLSearchParams(entry.query || '');
  params.delete('v');
  params.append('v', digest);
  const query = params.toString();
  return query ? `${entry.path}?${query}` : entry.path;
}

function ensureManifestDigests() {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const { entries } = loadManifest();

  const updates = [];
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
    if (entry.version === digest) {
      return;
    }

    const originalVersion = entry.version;
    manifest.assets[index] = rewriteAssetReference(entry, digest);
    updates.push({
      asset: entry.path,
      from: originalVersion,
      to: digest,
    });
  });

  if (updates.length === 0) {
    console.log('asset-manifest.json digests already match on-disk assets.');
    return;
  }

  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log('Updated asset-manifest.json digests:');
  for (const update of updates) {
    const fromValue = update.from ? `v=${update.from}` : 'missing digest';
    console.log(` • ${update.asset}: ${fromValue} → v=${update.to}`);
  }

  console.log('\nReview and commit asset-manifest.json before publishing.');
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
