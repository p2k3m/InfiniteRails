#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const { parseManifestAsset } = require('./validate-asset-manifest.js');
const { updateFileReferences } = require('./lib/version-ref-updater.js');

const repoRoot = path.resolve(__dirname, '..');
const manifestPath = path.join(repoRoot, 'asset-manifest.json');
const defaultKnownGoodPath = path.join(repoRoot, 'deployment', 'known-good-manifest.json');

function loadJson(filePath) {
  const contents = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(contents);
}

function validateManifest(manifest, filePath) {
  if (!manifest || typeof manifest !== 'object') {
    throw new Error(`${filePath} must export a manifest object.`);
  }
  if (!Array.isArray(manifest.assets)) {
    throw new Error(`${filePath} must define an "assets" array.`);
  }
  if (typeof manifest.assetBaseUrl !== 'string' || !manifest.assetBaseUrl.trim()) {
    throw new Error(`${filePath} must define an "assetBaseUrl" string.`);
  }
  return manifest;
}

/**
 * Builds a mapping of manifest asset paths to their cache-busting version strings.
 *
 * @param {{ assets: string[] }} manifest Parsed manifest object.
 * @returns {Map<string, string>}
 */
function buildVersionMap(manifest) {
  const map = new Map();
  manifest.assets.forEach((asset, index) => {
    try {
      const entry = parseManifestAsset(asset, index);
      if (entry?.path && entry?.version) {
        map.set(entry.path, entry.version);
      }
    } catch (error) {
      throw new Error(`Unable to parse manifest asset at index ${index}: ${error.message}`);
    }
  });
  return map;
}

function resolveKnownGoodMetadata(manifest) {
  const metadata = manifest?.knownGoodManifest;
  if (metadata && typeof metadata === 'object') {
    const pathValue = metadata.path || metadata.file || metadata.location;
    const tag = metadata.tag || metadata.build || metadata.buildTag;
    const resolvedPath = pathValue ? path.join(repoRoot, pathValue) : defaultKnownGoodPath;
    return {
      path: resolvedPath,
      tag: typeof tag === 'string' && tag.trim() ? tag.trim() : null,
      metadata,
    };
  }
  return {
    path: defaultKnownGoodPath,
    tag: null,
    metadata: null,
  };
}

/**
 * Loads the configured known-good manifest snapshot from disk.
 *
 * @param {{ knownGoodManifest?: { path?: string } }} manifest The current manifest metadata.
 * @returns {{ snapshot: object, manifestFilePath: string }}
 */
function loadKnownGoodManifest(manifest) {
  const { path: manifestFilePath } = resolveKnownGoodMetadata(manifest);
  if (!fs.existsSync(manifestFilePath)) {
    throw new Error(
      `Known-good manifest not found at ${path.relative(repoRoot, manifestFilePath)}. Update asset-manifest.json knownGoodManifest.path to point at a valid snapshot.`,
    );
  }
  const snapshot = validateManifest(loadJson(manifestFilePath), manifestFilePath);
  return { snapshot, manifestFilePath };
}

function applyKnownGoodManifest(snapshot, { preserveMetadataFrom } = {}) {
  const manifestToWrite = { ...snapshot };
  if (preserveMetadataFrom?.knownGoodManifest && !manifestToWrite.knownGoodManifest) {
    manifestToWrite.knownGoodManifest = preserveMetadataFrom.knownGoodManifest;
  }
  return manifestToWrite;
}

/**
 * Restores asset-manifest.json and dependent cache-busted references from the known-good snapshot.
 *
 * @param {{ dryRun?: boolean, logger?: Console }} [options]
 * @returns {{ manifest: object, versionMap: Map<string, string>, updatedFiles: string[] }}
 */
function rollbackToKnownGood({ dryRun = false, logger = console } = {}) {
  if (!fs.existsSync(manifestPath)) {
    throw new Error('asset-manifest.json is missing from the repository root.');
  }

  const currentManifest = validateManifest(loadJson(manifestPath), manifestPath);
  const { manifestFilePath, snapshot } = loadKnownGoodManifest(currentManifest);
  const manifestToWrite = applyKnownGoodManifest(snapshot, { preserveMetadataFrom: currentManifest });
  const versionMap = buildVersionMap(manifestToWrite);

  if (!dryRun) {
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifestToWrite, null, 2)}\n`);
  }

  const updatedFiles = updateFileReferences(versionMap, { dryRun, logger });

  if (logger && typeof logger.log === 'function') {
    const tag = currentManifest?.knownGoodManifest?.tag || currentManifest?.knownGoodManifest?.build;
    const relativePath = path.relative(repoRoot, manifestFilePath);
    logger.log(
      `Restored asset-manifest.json from ${relativePath}${tag ? ` (tag ${tag})` : ''}. Updated ${updatedFiles.length} dependent file(s).`,
    );
  }

  return { manifest: manifestToWrite, versionMap, updatedFiles };
}

function parseArgs(argv) {
  const args = new Set(argv.slice(2));
  return {
    dryRun: args.has('--dry-run') || args.has('-n'),
  };
}

function main() {
  try {
    const options = parseArgs(process.argv);
    rollbackToKnownGood(options);
  } catch (error) {
    console.error(error.message || error);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  rollbackToKnownGood,
  buildVersionMap,
  loadKnownGoodManifest,
};
