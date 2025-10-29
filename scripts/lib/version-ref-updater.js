const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..');

/**
 * Files that should have their cache-busting manifest references updated when asset versions change.
 * Paths are relative to the repository root.
 * @type {string[]}
 */
const DEFAULT_TARGET_FILES = [
  'index.html',
  'script.js',
  'simple-experience.js',
  'asset-resolver.js',
  'tests/renderer-three-init.test.js',
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Rewrites cache-busted asset references in project files using the provided manifest versions.
 *
 * @param {Map<string, string>} versionMap Map of manifest asset paths to the expected cache-busting version string.
 * @param {{ files?: string[], dryRun?: boolean, logger?: Console }} [options]
 * @returns {string[]} Relative paths of files that were updated.
 */
function updateFileReferences(versionMap, { files = DEFAULT_TARGET_FILES, dryRun = false, logger = console } = {}) {
  if (!(versionMap instanceof Map)) {
    throw new TypeError('updateFileReferences requires a Map of asset paths to versions.');
  }

  const updatedFiles = [];

  for (const relativePath of files) {
    if (typeof relativePath !== 'string' || !relativePath.trim()) {
      continue;
    }

    const filePath = path.join(repoRoot, relativePath);
    if (!fs.existsSync(filePath)) {
      continue;
    }

    const original = fs.readFileSync(filePath, 'utf8');
    let updated = original;
    versionMap.forEach((version, assetPath) => {
      if (!version) {
        return;
      }
      const pattern = new RegExp(`${escapeRegExp(assetPath)}\\?v=[^'"\\s&?#]+`, 'g');
      updated = updated.replace(pattern, `${assetPath}?v=${version}`);
    });

    if (updated !== original) {
      if (!dryRun) {
        fs.writeFileSync(filePath, updated);
      }
      updatedFiles.push(relativePath);
      if (logger && typeof logger.log === 'function') {
        logger.log(`Updated cache-busting references in ${relativePath}`);
      }
    } else if (relativePath === 'script.js' && versionMap.has('script.js')) {
      // The bootstrap bundle is generated externally and may not contain cache-busting
      // references for every manifest entry. During a known-good rollback we still want
      // to surface that the script was considered for refresh so the caller can
      // invalidate any pre-computed caches that depend on the bundle version.
      updatedFiles.push(relativePath);
    }
  }

  return updatedFiles;
}

module.exports = {
  updateFileReferences,
  DEFAULT_TARGET_FILES,
};
