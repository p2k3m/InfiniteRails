const fs = require('node:fs');
const path = require('node:path');

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

const REFERENCE_EXCLUDE_DIRS = new Set(['node_modules', '.git', 'coverage', 'dist', 'docs', 'tests']);

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
]);

function toPosixPath(value) {
  return value.split(path.sep).join('/');
}

function normaliseAlwaysReachable(input) {
  const values = Array.isArray(input) || input instanceof Set ? Array.from(input) : [];
  return new Set([...DEFAULT_ALWAYS_REACHABLE_ASSETS, ...values]);
}

function isTextReferenceFile(relativePath, options = {}) {
  const extensions = options.textExtensions || TEXT_REFERENCE_EXTENSIONS;
  const extension = path.extname(relativePath).toLowerCase();
  return extensions.has(extension);
}

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

