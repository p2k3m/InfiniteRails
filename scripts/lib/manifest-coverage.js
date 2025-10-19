const fs = require('node:fs');
const path = require('node:path');

/**
 * File extensions considered when scanning for asset references within text files.
 * @type {Set<string>}
 */
const TEXT_REFERENCE_EXTENSIONS = new Set([
  '.js',
  '.cjs',
  '.mjs',
  '.ts',
  '.tsx',
  '.jsx',
  '.json',
  '.html',
  '.css',
  '.yml',
  '.yaml',
  '.md',
  '.txt',
  '.svg',
]);

/**
 * Directories that should be ignored when scanning for asset references.
 * @type {Set<string>}
 */
const REFERENCE_EXCLUDE_DIRS = new Set(['node_modules', '.git', 'coverage', 'dist', 'docs', 'tests']);

/**
 * Manifest entries that are considered referenced regardless of textual matches.
 * @type {Set<string>}
 */
const DEFAULT_ALWAYS_REACHABLE_ASSETS = new Set([
  'index.html',
  'styles.css',
  'script.js',
  'test-driver.js',
  'simple-experience.js',
  'asset-resolver.js',
  'audio-aliases.js',
  'audio-captions.js',
  'combat-utils.js',
  'crafting.js',
  'portal-mechanics.js',
  'scoreboard-utils.js',
  'assets/audio-samples.json',
  'assets/offline-assets.js',
  'assets/arm.gltf',
  'assets/iron_golem.gltf',
  'assets/zombie.gltf',
  'vendor/howler-stub.js',
]);

/**
 * Converts a filesystem path to POSIX-style separators for consistent comparisons.
 *
 * @param {string} value
 * @returns {string}
 */
function toPosixPath(value) {
  return value.split(path.sep).join('/');
}

/**
 * Merges custom always-reachable assets with the default set of entries.
 *
 * @param {Iterable<string> | undefined | null} input
 * @returns {Set<string>}
 */
function normaliseAlwaysReachable(input) {
  const values = Array.isArray(input) || input instanceof Set ? Array.from(input) : [];
  return new Set([...DEFAULT_ALWAYS_REACHABLE_ASSETS, ...values]);
}

/**
 * Determines whether a file should be scanned for potential asset references.
 *
 * @param {string} relativePath
 * @param {{ textExtensions?: Set<string> }} [options]
 * @returns {boolean}
 */
function isTextReferenceFile(relativePath, options = {}) {
  const extensions = options.textExtensions || TEXT_REFERENCE_EXTENSIONS;
  const extension = path.extname(relativePath).toLowerCase();
  return extensions.has(extension);
}

/**
 * Recursively collects files that may reference assets via textual content.
 *
 * @param {string} baseDir
 * @param {{ excludeDirs?: Iterable<string> }} [options]
 * @param {string} [relativeDir]
 * @returns {{ relative: string, absolute: string }[]}
 */
function collectReferenceFiles(baseDir, options = {}, relativeDir = '') {
  const excludeDirs = options.excludeDirs ? new Set(options.excludeDirs) : REFERENCE_EXCLUDE_DIRS;
  const directoryPath = relativeDir ? path.join(baseDir, relativeDir) : baseDir;
  let entries;
  try {
    entries = fs.readdirSync(directoryPath, { withFileTypes: true });
  } catch (error) {
    return [];
  }

  const files = [];
  for (const entry of entries) {
    const nextRelative = relativeDir ? path.join(relativeDir, entry.name) : entry.name;
    const normalisedRelative = toPosixPath(nextRelative);
    if (entry.isDirectory()) {
      if (excludeDirs.has(entry.name) || excludeDirs.has(normalisedRelative)) {
        continue;
      }
      files.push(...collectReferenceFiles(baseDir, options, nextRelative));
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    if (normalisedRelative === 'asset-manifest.json') {
      continue;
    }
    if (!isTextReferenceFile(normalisedRelative, options)) {
      continue;
    }
    files.push({
      relative: normalisedRelative,
      absolute: path.join(baseDir, nextRelative),
    });
  }
  return files;
}

/**
 * Identifies manifest assets that have no textual references in the project.
 *
 * @param {string[]} assets
 * @param {{ baseDir?: string, alwaysReachable?: Iterable<string> }} [options]
 * @returns {{ unreachable: string[], references: Map<string, string[]> }}
 */
function listUnreachableManifestAssets(assets, options = {}) {
  if (!Array.isArray(assets) || assets.length === 0) {
    return { unreachable: [], references: new Map() };
  }
  const baseDir = options.baseDir || process.cwd();
  const alwaysReachable = normaliseAlwaysReachable(options.alwaysReachable);
  const references = new Map();
  assets.forEach((asset) => {
    references.set(asset, []);
  });

  const files = collectReferenceFiles(baseDir, options);
  for (const { relative, absolute } of files) {
    let contents;
    try {
      contents = fs.readFileSync(absolute, 'utf8');
    } catch (error) {
      continue;
    }
    for (const asset of assets) {
      if (!references.has(asset)) {
        continue;
      }
      if (alwaysReachable.has(asset)) {
        continue;
      }
      if (relative === asset) {
        continue;
      }
      if (contents.includes(asset)) {
        references.get(asset).push(relative);
      }
    }
  }

  const unreachable = [];
  for (const asset of assets) {
    if (alwaysReachable.has(asset)) {
      continue;
    }
    const referencingFiles = references.get(asset) || [];
    if (referencingFiles.length === 0) {
      unreachable.push(asset);
    }
  }

  return { unreachable, references };
}

module.exports = {
  TEXT_REFERENCE_EXTENSIONS,
  REFERENCE_EXCLUDE_DIRS,
  DEFAULT_ALWAYS_REACHABLE_ASSETS,
  isTextReferenceFile,
  collectReferenceFiles,
  listUnreachableManifestAssets,
};

