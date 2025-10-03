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

function listPermissionIssues(assets) {
  const issues = [];
  assets.forEach((asset) => {
    const fullPath = path.join(repoRoot, asset);
    let stats;
    try {
      stats = fs.statSync(fullPath);
    } catch (error) {
      return;
    }
    if (!stats.isFile()) {
      return;
    }

    const mode = stats.mode & 0o777;
    const problems = [];
    if ((mode & 0o400) === 0) {
      problems.push('owner read bit is not set');
    }
    if ((mode & 0o040) === 0) {
      problems.push('group read bit is not set');
    }
    if ((mode & 0o004) === 0) {
      problems.push('world read bit is not set');
    }
    if ((mode & 0o022) !== 0) {
      problems.push('unexpected write permissions detected');
    }
    if ((mode & 0o111) !== 0) {
      problems.push('executable bit should not be set for static assets');
    }

    if (problems.length > 0) {
      issues.push({ asset, mode: mode.toString(8).padStart(4, '0'), problems });
    }
  });
  return issues;
}

function listUncoveredAssets(assets, patterns) {
  return assets.filter((asset) => !patterns.some((pattern) => patternMatchesAsset(pattern, asset)));
}

function resolveBaseUrl(argv = process.argv.slice(2), env = process.env) {
  const inline = argv.find((arg) => arg.startsWith('--base-url='));
  if (inline) {
    return inline.split('=').slice(1).join('=').trim();
  }
  const flagIndex = argv.indexOf('--base-url');
  if (flagIndex !== -1 && argv[flagIndex + 1]) {
    return argv[flagIndex + 1].trim();
  }

  const candidates = [
    env.ASSET_MANIFEST_BASE_URL,
    env.ASSET_VALIDATION_BASE_URL,
    env.DEPLOYMENT_ASSET_BASE_URL,
  ];
  return candidates.find((value) => typeof value === 'string' && value.trim().length > 0)?.trim() || '';
}

function ensureTrailingSlash(value) {
  if (!value.endsWith('/')) {
    return `${value}/`;
  }
  return value;
}

async function listFailedHeadRequests(assets, baseUrl, fetchImpl = globalThis.fetch) {
  if (!baseUrl) {
    return [];
  }
  if (typeof fetchImpl !== 'function') {
    throw new Error('Global fetch is unavailable – upgrade Node.js or provide a custom fetch implementation.');
  }

  let parsedBase;
  try {
    parsedBase = new URL(baseUrl);
  } catch (error) {
    throw new Error(`Invalid base URL provided for asset validation: ${baseUrl}`);
  }
  const normalisedBase = ensureTrailingSlash(parsedBase.toString());

  const failures = [];
  for (const asset of assets) {
    const targetUrl = new URL(asset, normalisedBase).toString();
    try {
      const response = await fetchImpl(targetUrl, { method: 'HEAD' });
      if (!response.ok) {
        failures.push({
          asset,
          url: targetUrl,
          status: response.status,
          statusText: response.statusText,
        });
      }
    } catch (error) {
      failures.push({ asset, url: targetUrl, error: error.message || String(error) });
    }
  }
  return failures;
}

async function main() {
  try {
    const assets = loadManifest();
    const duplicates = ensureUniqueAssets(assets);
    const missingFiles = listMissingFiles(assets);
    const permissionIssues = listPermissionIssues(assets);

    if (!fs.existsSync(workflowPath)) {
      throw new Error('Deployment workflow .github/workflows/deploy.yml is missing.');
    }
    const workflowContents = fs.readFileSync(workflowPath, 'utf8');
    const includePatterns = extractIncludePatterns(workflowContents);

    const uncoveredAssets = listUncoveredAssets(assets, includePatterns);

    const baseUrl = resolveBaseUrl();
    let headFailures = [];
    if (baseUrl) {
      headFailures = await listFailedHeadRequests(assets, baseUrl);
    }

    const issues = [];
    if (duplicates.length > 0) {
      issues.push(`Duplicate manifest entries detected: ${duplicates.join(', ')}`);
    }
    if (missingFiles.length > 0) {
      issues.push(`Manifest references files that do not exist or are not files: ${missingFiles.join(', ')}`);
    }
    if (permissionIssues.length > 0) {
      const formatted = permissionIssues
        .map((issue) => `${issue.asset} (mode ${issue.mode}: ${issue.problems.join(', ')})`)
        .join('; ');
      issues.push(`Manifest assets with incorrect permissions detected: ${formatted}`);
    }
    if (uncoveredAssets.length > 0) {
      issues.push(
        `Deployment workflow does not sync the following manifest assets: ${uncoveredAssets.join(', ')}`,
      );
    }
    if (baseUrl && headFailures.length > 0) {
      const formatted = headFailures
        .map((failure) => {
          if (failure.error) {
            return `${failure.asset} (${failure.url}) – ${failure.error}`;
          }
          return `${failure.asset} (${failure.url}) – HTTP ${failure.status} ${failure.statusText}`;
        })
        .join('; ');
      issues.push(`HEAD validation failed for: ${formatted}`);
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

    if (!baseUrl) {
      console.warn(
        'ℹ️  asset-manifest.json validated locally – provide --base-url or set ASSET_MANIFEST_BASE_URL to enable HEAD checks.',
      );
    } else {
      console.log('✅ asset-manifest.json validated – files exist, permissions are correct, and HEAD checks passed.');
    }
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
  listPermissionIssues,
  extractIncludePatterns,
  patternMatchesAsset,
  listUncoveredAssets,
  resolveBaseUrl,
  listFailedHeadRequests,
};
