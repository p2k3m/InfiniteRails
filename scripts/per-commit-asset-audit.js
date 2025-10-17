#!/usr/bin/env node

const { execSync } = require('node:child_process');

const ZERO_SHA = '0000000000000000000000000000000000000000';
const TRACKED_PREFIXES = ['assets/', 'audio/', 'textures/', 'vendor/'];

function runGit(command) {
  try {
    return execSync(command, { encoding: 'utf8' }).trim();
  } catch (error) {
    if (error?.stdout) {
      return String(error.stdout).trim();
    }
    return null;
  }
}

function normalisePath(value) {
  if (typeof value !== 'string') {
    return '';
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  const [pathAndQuery] = trimmed.split('#', 1);
  const [rawPath] = pathAndQuery.split('?', 1);
  return rawPath.replace(/^\.\//, '');
}

function loadManifestEntries(commit) {
  const raw = runGit(`git show ${commit}:asset-manifest.json`);
  if (!raw) {
    throw new Error(`asset-manifest.json is missing in commit ${commit}.`);
  }

  let document;
  try {
    document = JSON.parse(raw);
  } catch (error) {
    throw new Error(`asset-manifest.json is not valid JSON in commit ${commit}: ${error.message}`);
  }

  if (!document || typeof document !== 'object') {
    throw new Error(`asset-manifest.json must export an object in commit ${commit}.`);
  }

  if (!Array.isArray(document.assets)) {
    throw new Error(`asset-manifest.json must define an "assets" array in commit ${commit}.`);
  }

  const entries = document.assets.map((asset, index) => {
    if (typeof asset !== 'string') {
      throw new Error(`asset-manifest.json entry at index ${index} must be a string in commit ${commit}.`);
    }

    const normalised = normalisePath(asset);
    if (!normalised) {
      throw new Error(`asset-manifest.json entry at index ${index} is missing a valid path in commit ${commit}.`);
    }

    return { original: asset, path: normalised };
  });

  const seen = new Set();
  for (const entry of entries) {
    const key = entry.path;
    if (seen.has(key)) {
      throw new Error(`asset-manifest.json includes duplicate entry "${key}" in commit ${commit}.`);
    }
    seen.add(key);
  }

  return entries;
}

function listTrackedFiles(commit) {
  const output = runGit(`git ls-tree -r --name-only ${commit}`);
  if (!output) {
    return [];
  }
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function isTrackedAssetPath(filePath) {
  return TRACKED_PREFIXES.some((prefix) => filePath.startsWith(prefix));
}

function describeCommitRange() {
  const args = process.argv.slice(2);
  let base = null;
  let head = null;

  for (const arg of args) {
    if (arg.startsWith('--base=')) {
      base = arg.slice('--base='.length) || null;
      continue;
    }
    if (arg.startsWith('--head=')) {
      head = arg.slice('--head='.length) || null;
      continue;
    }
    if (arg.includes('..') && !base && !head) {
      const [rangeBase, rangeHead] = arg.split('..');
      base = rangeBase || null;
      head = rangeHead || null;
      continue;
    }
    if (!head) {
      head = arg;
    } else if (!base) {
      base = arg;
    }
  }

  const eventBefore = process.env.GITHUB_EVENT_BEFORE;
  if (!base || base === ZERO_SHA) {
    base = eventBefore && eventBefore !== ZERO_SHA ? eventBefore : null;
  }

  const eventSha = process.env.GITHUB_SHA;
  if (!head) {
    head = eventSha || 'HEAD';
  }

  if (!base) {
    const parent = runGit(`git rev-parse ${head}^`);
    base = parent && parent !== head ? parent : null;
  }

  const range = base ? `${base}..${head}` : head;
  return { base, head, range };
}

function listCommitsInRange(base, head) {
  const target = head || 'HEAD';
  const spec = base ? `${base}..${target}` : target;
  const output = runGit(`git rev-list ${spec}`);
  if (!output) {
    const resolved = runGit(`git rev-parse ${target}`);
    return resolved ? [resolved] : [];
  }

  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .reverse();
}

function auditCommit(commit) {
  const files = listTrackedFiles(commit);
  const fileSet = new Set(files);
  const manifestEntries = loadManifestEntries(commit);
  const manifestSet = new Set(manifestEntries.map((entry) => entry.path));

  const missing = manifestEntries
    .filter((entry) => !fileSet.has(entry.path))
    .map((entry) => entry.path);

  const unexpected = files.filter(
    (filePath) => isTrackedAssetPath(filePath) && !manifestSet.has(filePath),
  );

  return { commit, missing, unexpected };
}

function main() {
  try {
    const { base, head } = describeCommitRange();
    const commits = listCommitsInRange(base, head);

    if (!commits.length) {
      console.log('No commits to audit.');
      return;
    }

    const findings = commits.map(auditCommit);
    const failures = findings.filter((finding) => finding.missing.length || finding.unexpected.length);

    if (failures.length === 0) {
      console.log('✅ Asset manifest matches tracked assets for all commits in range.');
      return;
    }

    console.error('❌ Per-commit asset audit detected inconsistencies:');
    for (const finding of failures) {
      console.error(`\nCommit ${finding.commit}:`);
      if (finding.missing.length) {
        console.error('  • Manifest references files missing from the commit:');
        finding.missing.forEach((asset) => {
          console.error(`    - ${asset}`);
        });
      }
      if (finding.unexpected.length) {
        console.error('  • Asset files missing from asset-manifest.json:');
        finding.unexpected.forEach((asset) => {
          console.error(`    - ${asset}`);
        });
      }
    }

    process.exitCode = 1;
  } catch (error) {
    console.error(error?.message || error);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  describeCommitRange,
  listCommitsInRange,
  auditCommit,
  normalisePath,
};
