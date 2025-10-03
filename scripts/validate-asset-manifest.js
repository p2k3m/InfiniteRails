#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const manifestPath = path.join(repoRoot, 'asset-manifest.json');
const workflowPath = path.join(repoRoot, '.github', 'workflows', 'deploy.yml');

function normalisePath(value) {
  if (!value || typeof value !== 'string') {
    return '';
  }
  return value.replace(/^\.\//, '').split('?')[0];
}

function extractIncludePatterns(workflow) {
  const patterns = [];
  const includeRegex = /--include\s+"([^"]+)"/g;
  let match;
  while ((match = includeRegex.exec(workflow)) !== null) {
    patterns.push(match[1]);
  }
  return patterns;
}

function patternMatchesAsset(pattern, asset) {
  if (!pattern || !asset) {
    return false;
  }
  if (pattern.includes('*')) {
    const [prefix] = pattern.split('*', 1);
    return asset.startsWith(prefix);
  }
  return asset === pattern;
}

function loadManifest() {
  if (!fs.existsSync(manifestPath)) {
    throw new Error('asset-manifest.json is missing from the repository root.');
  }

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    throw new Error(`asset-manifest.json is not valid JSON: ${error.message}`);
  }

  if (!raw || typeof raw !== 'object') {
    throw new Error('asset-manifest.json must export an object.');
  }

  if (!Array.isArray(raw.assets)) {
    throw new Error('asset-manifest.json must define an "assets" array.');
  }

  const assets = raw.assets
    .map((asset) => normalisePath(asset))
    .filter((asset) => typeof asset === 'string' && asset.length > 0);

  if (assets.length === 0) {
    throw new Error('asset-manifest.json must list at least one asset.');
  }

  return assets;
}

function ensureUniqueAssets(assets) {
  const seen = new Set();
  const duplicates = new Set();
  assets.forEach((asset) => {
    if (seen.has(asset)) {
      duplicates.add(asset);
    }
    seen.add(asset);
  });
  return Array.from(duplicates);
}

function listMissingFiles(assets) {
  return assets.filter((asset) => {
    const fullPath = path.join(repoRoot, asset);
    try {
      const stats = fs.statSync(fullPath);
      return !stats.isFile();
    } catch (error) {
      return true;
    }
  });
}

function listUncoveredAssets(assets, patterns) {
  return assets.filter((asset) => !patterns.some((pattern) => patternMatchesAsset(pattern, asset)));
}

function main() {
  try {
    const assets = loadManifest();
    const duplicates = ensureUniqueAssets(assets);
    const missingFiles = listMissingFiles(assets);

    if (!fs.existsSync(workflowPath)) {
      throw new Error('Deployment workflow .github/workflows/deploy.yml is missing.');
    }
    const workflowContents = fs.readFileSync(workflowPath, 'utf8');
    const includePatterns = extractIncludePatterns(workflowContents);

    const uncoveredAssets = listUncoveredAssets(assets, includePatterns);

    const issues = [];
    if (duplicates.length > 0) {
      issues.push(`Duplicate manifest entries detected: ${duplicates.join(', ')}`);
    }
    if (missingFiles.length > 0) {
      issues.push(`Manifest references files that do not exist or are not files: ${missingFiles.join(', ')}`);
    }
    if (uncoveredAssets.length > 0) {
      issues.push(
        `Deployment workflow does not sync the following manifest assets: ${uncoveredAssets.join(', ')}`,
      );
    }

    if (issues.length > 0) {
      console.error('\nAsset manifest validation failed:');
      for (const issue of issues) {
        console.error(` • ${issue}`);
      }
      console.error('\nUpdate asset-manifest.json or the deploy workflow before publishing.');
      process.exitCode = 1;
      return;
    }

    console.log('✅ asset-manifest.json validated – all files exist and deploy workflow covers them.');
  } catch (error) {
    console.error(error.message || error);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  loadManifest,
  ensureUniqueAssets,
  listMissingFiles,
  extractIncludePatterns,
  patternMatchesAsset,
  listUncoveredAssets,
};
