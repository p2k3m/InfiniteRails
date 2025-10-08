#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { parse: parseYaml } = require('yaml');
const { listUnreachableManifestAssets } = require('./lib/manifest-coverage.js');

const repoRoot = path.resolve(__dirname, '..');
const manifestPath = path.join(repoRoot, 'asset-manifest.json');
const workflowPath = path.join(repoRoot, '.github', 'workflows', 'deploy.yml');
const templatePath = path.join(repoRoot, 'serverless', 'template.yaml');
const scriptPath = path.join(repoRoot, 'script.js');
const ASSET_PERMISSION_PREFIXES = ['assets', 'textures', 'audio'];
const HASH_ALGORITHM = 'sha256';
const HASH_LENGTH = 12;

function ensureTrailingSlash(value) {
  if (!value || typeof value !== 'string') {
    return value;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

function extractBootstrapProductionAssetRoot() {
  if (!fs.existsSync(scriptPath)) {
    throw new Error('script.js is missing from the repository root.');
  }

  const scriptSource = fs.readFileSync(scriptPath, 'utf8');
  const match = scriptSource.match(
    /const\s+PRODUCTION_ASSET_ROOT\s*=\s*ensureTrailingSlash\(\s*['"]([^'"\s]+)['"]\s*(?:,\s*)?\)/,
  );

  if (!match || !match[1]) {
    throw new Error('Unable to locate PRODUCTION_ASSET_ROOT constant in script.js.');
  }

  const raw = match[1].trim();
  let parsed;
  try {
    parsed = new URL(raw);
  } catch (error) {
    throw new Error(`script.js PRODUCTION_ASSET_ROOT must be an absolute URL. Found: ${raw}`);
  }

  return ensureTrailingSlash(parsed.toString());
}

const bootstrapAssetRoot = extractBootstrapProductionAssetRoot();

function createSearchParamEntries(query) {
  if (!query) {
    return [];
  }

  const params = new URLSearchParams(query);
  const entries = [];
  params.forEach((value, key) => {
    entries.push({ key, value });
  });
  return entries;
}

function parseManifestAsset(asset, index) {
  if (typeof asset !== 'string') {
    throw new Error(`asset-manifest.json entry at index ${index} must be a string.`);
  }

  const trimmed = asset.trim();
  if (!trimmed) {
    throw new Error(`asset-manifest.json entry at index ${index} cannot be empty.`);
  }

  const [pathAndQuery] = trimmed.split('#', 1);
  const [rawPath, rawQuery = ''] = pathAndQuery.split('?', 2);
  const pathOnly = normalisePath(rawPath);
  if (!pathOnly) {
    throw new Error(`asset-manifest.json entry at index ${index} is missing a valid path.`);
  }

  const queryEntries = createSearchParamEntries(rawQuery);
  const versionValues = queryEntries.filter((entry) => entry.key === 'v').map((entry) => entry.value);
  const extraParams = Array.from(
    new Set(queryEntries.filter((entry) => entry.key !== 'v').map((entry) => entry.key)),
  );

  return {
    original: trimmed,
    path: pathOnly,
    versionedPath: rawQuery ? `${pathOnly}?${rawQuery}` : pathOnly,
    query: rawQuery,
    versionValues,
    version: versionValues.length ? versionValues[versionValues.length - 1] : null,
    extraParams,
  };
}

function computeAssetDigest(fullPath) {
  const contents = fs.readFileSync(fullPath);
  return crypto.createHash(HASH_ALGORITHM).update(contents).digest('hex').slice(0, HASH_LENGTH);
}

function listVersionedAssetIssues(entries) {
  const issues = [];
  if (!Array.isArray(entries) || entries.length === 0) {
    return issues;
  }

  for (const entry of entries) {
    if (!entry || typeof entry.path !== 'string' || !entry.path) {
      continue;
    }

    const fullPath = path.join(repoRoot, entry.path);
    let stats;
    try {
      stats = fs.statSync(fullPath);
    } catch (error) {
      continue;
    }

    if (!stats.isFile()) {
      continue;
    }

    const expected = computeAssetDigest(fullPath);
    if (!entry.versionValues || entry.versionValues.length === 0) {
      issues.push({
        asset: entry.path,
        expected,
        actual: null,
        reason: 'missing',
      });
      continue;
    }

    if (entry.versionValues.length > 1) {
      issues.push({
        asset: entry.versionedPath,
        expected,
        actual: entry.versionValues.join(', '),
        reason: 'duplicate',
      });
      continue;
    }

    if (entry.extraParams && entry.extraParams.length > 0) {
      issues.push({
        asset: entry.versionedPath,
        expected,
        actual: entry.extraParams.join(', '),
        reason: 'unexpected-params',
      });
      continue;
    }

    const actual = entry.versionValues[0];
    if (actual !== expected) {
      issues.push({
        asset: entry.versionedPath,
        expected,
        actual,
        reason: 'mismatch',
      });
    }
  }

  return issues;
}

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

  if (typeof raw.assetBaseUrl !== 'string' || !raw.assetBaseUrl.trim()) {
    throw new Error('asset-manifest.json must define an "assetBaseUrl" string.');
  }

  let manifestBaseUrl;
  try {
    manifestBaseUrl = ensureTrailingSlash(new URL(raw.assetBaseUrl.trim()).toString());
  } catch (error) {
    throw new Error(
      `asset-manifest.json "assetBaseUrl" must be an absolute URL. Found: ${raw.assetBaseUrl}`,
    );
  }

  if (bootstrapAssetRoot && manifestBaseUrl !== bootstrapAssetRoot) {
    throw new Error(
      `asset-manifest.json assetBaseUrl (${manifestBaseUrl}) must match script.js PRODUCTION_ASSET_ROOT (${bootstrapAssetRoot}).`,
    );
  }

  const entries = raw.assets.map((asset, index) => parseManifestAsset(asset, index));

  if (!entries.length) {
    throw new Error('asset-manifest.json must list at least one asset.');
  }

  return { entries, assetBaseUrl: manifestBaseUrl };
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

function describePermissionIssues(fullPath, { includeStatErrors = false } = {}) {
  let stats;
  try {
    stats = fs.statSync(fullPath);
  } catch (error) {
    if (includeStatErrors) {
      return {
        mode: '----',
        problems: [`unable to stat file: ${error.message || error}`],
      };
    }
    return null;
  }

  if (!stats.isFile()) {
    return null;
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

  if (problems.length === 0) {
    return null;
  }

  return {
    mode: mode.toString(8).padStart(4, '0'),
    problems,
  };
}

function listPermissionIssues(assets) {
  const issues = [];
  for (const asset of assets) {
    const fullPath = path.join(repoRoot, asset);
    const problem = describePermissionIssues(fullPath);
    if (problem) {
      issues.push({ asset, ...problem });
    }
  }
  return issues;
}

function listFilesRecursive(directory) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFilesRecursive(entryPath));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }
  return files;
}

function listDirectoriesRecursive(directory, { includeSelf = false } = {}) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const directories = includeSelf ? [directory] : [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const entryPath = path.join(directory, entry.name);
    directories.push(entryPath, ...listDirectoriesRecursive(entryPath));
  }
  return directories;
}

function toArray(value) {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function describeDirectoryPermissionIssues(fullPath, { includeStatErrors = false } = {}) {
  let stats;
  try {
    stats = fs.statSync(fullPath);
  } catch (error) {
    if (includeStatErrors) {
      return {
        mode: '----',
        problems: [`unable to stat directory: ${error.message || error}`],
      };
    }
    return null;
  }

  if (!stats.isDirectory()) {
    return null;
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
  if ((mode & 0o100) === 0) {
    problems.push('owner execute bit is not set');
  }
  if ((mode & 0o010) === 0) {
    problems.push('group execute bit is not set');
  }
  if ((mode & 0o001) === 0) {
    problems.push('world execute bit is not set');
  }
  if ((mode & 0o022) !== 0) {
    problems.push('unexpected write permissions detected');
  }

  if (problems.length === 0) {
    return null;
  }

  return {
    mode: mode.toString(8).padStart(4, '0'),
    problems,
  };
}

function listAssetDirectoryPermissionIssues(prefixes = ASSET_PERMISSION_PREFIXES) {
  const issues = [];
  for (const prefix of prefixes) {
    const directory = path.join(repoRoot, prefix);
    if (!fs.existsSync(directory)) {
      continue;
    }

    const directories = listDirectoriesRecursive(directory, { includeSelf: true });
    for (const directoryPath of directories) {
      const problem = describeDirectoryPermissionIssues(directoryPath, { includeStatErrors: true });
      if (problem) {
        issues.push({
          asset: path.relative(repoRoot, directoryPath).split(path.sep).join('/'),
          ...problem,
        });
      }
    }

    const files = listFilesRecursive(directory);
    for (const filePath of files) {
      const problem = describePermissionIssues(filePath, { includeStatErrors: true });
      if (problem) {
        issues.push({
          asset: path.relative(repoRoot, filePath).split(path.sep).join('/'),
          ...problem,
        });
      }
    }
  }
  return issues;
}

function listUncoveredAssets(assets, patterns) {
  return assets.filter((asset) => !patterns.some((pattern) => patternMatchesAsset(pattern, asset)));
}

function sanitizeCloudFormationYaml(contents) {
  return contents.replace(/!Ref\s+/g, '').replace(/!GetAtt\s+/g, '').replace(/!Sub\s+/g, '');
}

function loadTemplateDocument() {
  if (!fs.existsSync(templatePath)) {
    throw new Error('CloudFormation template serverless/template.yaml is missing.');
  }

  const raw = fs.readFileSync(templatePath, 'utf8');
  const sanitized = sanitizeCloudFormationYaml(raw);

  try {
    return parseYaml(sanitized);
  } catch (error) {
    throw new Error(`Unable to parse serverless/template.yaml: ${error.message || error}`);
  }
}

function describeBucketPolicyIssues(templateDocument) {
  const issues = [];
  const bucketPolicy =
    templateDocument?.Resources?.AssetsBucketPolicy?.Properties?.PolicyDocument || null;

  if (!bucketPolicy) {
    issues.push('AssetsBucketPolicy.PolicyDocument is missing.');
    return issues;
  }

  const statements = toArray(bucketPolicy.Statement);
  if (statements.length === 0) {
    issues.push('AssetsBucketPolicy has no statements.');
    return issues;
  }

  const readStatement = statements.find(
    (statement) => statement && statement.Sid === 'AllowCloudFrontOriginAccessIdentityRead',
  );

  if (!readStatement) {
    issues.push('Missing AllowCloudFrontOriginAccessIdentityRead statement.');
  } else {
    if (readStatement.Effect !== 'Allow') {
      issues.push('AllowCloudFrontOriginAccessIdentityRead statement must have Effect: Allow.');
    }

    const principal = readStatement.Principal || {};
    const canonicalUser = typeof principal.CanonicalUser === 'string' ? principal.CanonicalUser : '';
    if (!canonicalUser) {
      issues.push('CloudFront OAI canonical user must be defined for the read statement.');
    } else if (!canonicalUser.includes('AssetsCloudFrontOAI')) {
      issues.push('Read statement must reference AssetsCloudFrontOAI canonical user.');
    }

    const actions = new Set(toArray(readStatement.Action));
    if (actions.size !== 1 || !actions.has('s3:GetObject')) {
      issues.push('Read statement must grant only s3:GetObject.');
    }

    const resources = new Set(toArray(readStatement.Resource));
    const expectedResources = ASSET_PERMISSION_PREFIXES.map(
      (prefix) => '${AssetsBucket.Arn}/' + prefix + '/*',
    );

    for (const expectedResource of expectedResources) {
      if (!resources.has(expectedResource)) {
        issues.push(`Read statement must include ${expectedResource}.`);
      }
    }

    const unexpectedResources = Array.from(resources).filter(
      (resource) => !expectedResources.includes(resource),
    );
    if (unexpectedResources.length > 0) {
      issues.push(
        `Read statement must not include additional resources: ${unexpectedResources.join(', ')}`,
      );
    }
  }

  const otherGetObjectStatements = statements.filter((statement) => {
    if (!statement || statement === readStatement) {
      return false;
    }
    if (statement.Effect !== 'Allow') {
      return false;
    }
    return toArray(statement.Action).includes('s3:GetObject');
  });

  if (otherGetObjectStatements.length > 0) {
    issues.push('Only the CloudFront OAI read statement may allow s3:GetObject.');
  }

  return issues;
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

async function listFailedHeadRequests(entries, baseUrl, fetchImpl = globalThis.fetch) {
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
  for (const entry of entries) {
    const target = entry?.versionedPath || entry?.path || entry;
    if (typeof target !== 'string' || !target) {
      continue;
    }
    const targetUrl = new URL(target, normalisedBase).toString();
    try {
      const response = await fetchImpl(targetUrl, { method: 'HEAD' });
      if (!response.ok) {
        failures.push({
          asset: target,
          url: targetUrl,
          status: response.status,
          statusText: response.statusText,
        });
      }
    } catch (error) {
      failures.push({ asset: target, url: targetUrl, error: error.message || String(error) });
    }
  }
  return failures;
}

async function main() {
  try {
    const manifest = loadManifest();
    const manifestEntries = manifest.entries;
    const manifestBaseUrl = manifest.assetBaseUrl || '';
    const assets = manifestEntries.map((entry) => entry.path);
    const duplicates = ensureUniqueAssets(assets);
    const missingFiles = listMissingFiles(assets);
    const permissionIssues = listPermissionIssues(assets);
    const directoryPermissionIssues = listAssetDirectoryPermissionIssues();
    const templateDocument = loadTemplateDocument();
    const bucketPolicyIssues = describeBucketPolicyIssues(templateDocument);

    if (!fs.existsSync(workflowPath)) {
      throw new Error('Deployment workflow .github/workflows/deploy.yml is missing.');
    }
    const workflowContents = fs.readFileSync(workflowPath, 'utf8');
    const includePatterns = extractIncludePatterns(workflowContents);

    const uncoveredAssets = listUncoveredAssets(assets, includePatterns);
    const { unreachable: unreachableAssets } = listUnreachableManifestAssets(assets, {
      baseDir: repoRoot,
    });

    const providedBaseUrl = resolveBaseUrl();
    let headValidationBase = '';
    let headFailures = [];
    if (providedBaseUrl) {
      let normalisedBase;
      try {
        normalisedBase = ensureTrailingSlash(new URL(providedBaseUrl).toString());
      } catch (error) {
        throw new Error(`Invalid base URL provided for validation: ${providedBaseUrl}`);
      }

      if (manifestBaseUrl && normalisedBase !== manifestBaseUrl) {
        throw new Error(
          `Provided base URL (${normalisedBase}) does not match asset-manifest.json assetBaseUrl (${manifestBaseUrl}).`,
        );
      }

      headValidationBase = normalisedBase;
      headFailures = await listFailedHeadRequests(manifestEntries, headValidationBase);
    }

    const versionIssues = listVersionedAssetIssues(manifestEntries);

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
    if (unreachableAssets.length > 0) {
      issues.push(`Manifest lists assets with no runtime references: ${unreachableAssets.join(', ')}`);
    }
    if (directoryPermissionIssues.length > 0) {
      const formatted = directoryPermissionIssues
        .map((issue) => `${issue.asset} (mode ${issue.mode}: ${issue.problems.join(', ')})`)
        .join('; ');
      issues.push(`Paths under assets/, textures/, or audio/ have incorrect permissions: ${formatted}`);
    }
    if (bucketPolicyIssues.length > 0) {
      issues.push(
        `CloudFormation AssetsBucketPolicy must grant only the CloudFront OAI s3:GetObject access to assets/, textures/, and audio/: ${bucketPolicyIssues.join(
          '; ',
        )}`,
      );
    }
    if (versionIssues.length > 0) {
      const formatted = versionIssues
        .map((issue) => {
          switch (issue.reason) {
            case 'missing':
              return `${issue.asset} is missing a ?v=${issue.expected} digest.`;
            case 'duplicate':
              return `${issue.asset} defines multiple v parameters (${issue.actual}); expected ${issue.expected}.`;
            case 'unexpected-params':
              return `${issue.asset} includes unsupported query parameters (${issue.actual}); only ?v= is allowed.`;
            case 'mismatch':
              return `${issue.asset} has v=${issue.actual} but should be ${issue.expected}.`;
            default:
              return `${issue.asset} has an unknown version issue.`;
          }
        })
        .join('; ');
      issues.push(
        `Manifest asset hashes are outdated: ${formatted}. Run \`npm run sync:asset-digests\` to refresh the digests.`,
      );
    }
    if (headValidationBase && headFailures.length > 0) {
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

    if (!headValidationBase) {
      const hint = manifestBaseUrl ? ` The manifest currently points to ${manifestBaseUrl}.` : '';
      console.warn(
        `ℹ️  asset-manifest.json validated locally – provide --base-url or set ASSET_MANIFEST_BASE_URL to enable HEAD checks.${hint}`,
      );
    } else {
      console.log(
        '✅ asset-manifest.json validated – files exist, permissions are correct (including assets/, textures/, audio/), and HEAD checks passed.',
      );
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
  loadTemplateDocument,
  describeBucketPolicyIssues,
  ensureUniqueAssets,
  listMissingFiles,
  listPermissionIssues,
  listAssetDirectoryPermissionIssues,
  extractIncludePatterns,
  patternMatchesAsset,
  listUncoveredAssets,
  resolveBaseUrl,
  listFailedHeadRequests,
  computeAssetDigest,
  parseManifestAsset,
};
