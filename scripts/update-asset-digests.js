#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const {
  loadManifest,
  computeAssetDigest,
} = require('./validate-asset-manifest.js');
const { resolveBuildSha } = require('./lib/build-sha.js');

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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function updateFileReferences(versionMap) {
  const targetFiles = [
    path.join(repoRoot, 'index.html'),
    path.join(repoRoot, 'script.js'),
    path.join(repoRoot, 'simple-experience.js'),
    path.join(repoRoot, 'asset-resolver.js'),
    path.join(repoRoot, 'tests', 'renderer-three-init.test.js'),
  ];

  targetFiles.forEach((filePath) => {
    if (!fs.existsSync(filePath)) {
      return;
    }
    const original = fs.readFileSync(filePath, 'utf8');
    let updated = original;
    versionMap.forEach((version, assetPath) => {
      const pattern = new RegExp(`${escapeRegExp(assetPath)}\\?v=[^'"\\s&?#]+`, 'g');
      updated = updated.replace(pattern, `${assetPath}?v=${version}`);
    });
    if (updated !== original) {
      fs.writeFileSync(filePath, updated);
      console.log(`Updated cache-busting references in ${path.relative(repoRoot, filePath)}`);
    }
  });
}

function ensureManifestDigests() {
  const buildSha = resolveBuildSha();
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

  if (updates.length === 0) {
    console.log('asset-manifest.json digests already match on-disk assets.');
    updateFileReferences(versionMap);
    return;
  }

  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  updateFileReferences(versionMap);

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
