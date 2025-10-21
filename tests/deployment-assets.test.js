import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { parse as parseYaml } from 'yaml';

const repoRoot = path.resolve(__dirname, '..');
const indexHtmlPath = path.join(repoRoot, 'index.html');
const workflowPath = path.join(repoRoot, '.github', 'workflows', 'deploy.yml');
const manifestPath = path.join(repoRoot, 'asset-manifest.json');
const templatePath = path.join(repoRoot, 'serverless', 'template.yaml');
const scriptPath = path.join(repoRoot, 'script.js');

const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
const workflowContents = fs.readFileSync(workflowPath, 'utf8');
const assetsDir = path.join(repoRoot, 'assets');
const templateContents = fs.readFileSync(templatePath, 'utf8');
const sanitizedTemplateContents = templateContents
  .replace(/!Ref\s+/g, '')
  .replace(/!GetAtt\s+/g, '')
  .replace(/!Sub\s+/g, '');
const templateDocument = parseYaml(sanitizedTemplateContents);
const require = createRequire(import.meta.url);
const { listUnreachableManifestAssets } = require('../scripts/lib/manifest-coverage.js');

function isOaiPrincipal(principal) {
  if (!principal || typeof principal !== 'object') {
    return false;
  }
  const canonicalUser = principal.CanonicalUser;
  return typeof canonicalUser === 'string' && canonicalUser.includes('AssetsCloudFrontOAI');
}

function isPublicPrincipal(principal) {
  if (!principal) {
    return false;
  }
  if (principal === '*') {
    return true;
  }
  if (typeof principal !== 'object') {
    return false;
  }
  const aws = principal.AWS;
  if (typeof aws === 'string' && aws.trim() === '*') {
    return true;
  }
  if (Array.isArray(aws)) {
    return aws.some((value) => typeof value === 'string' && value.trim() === '*');
  }
  return false;
}

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

function loadManifestDocument() {
  if (!fs.existsSync(manifestPath)) {
    throw new Error('asset-manifest.json is missing from the repository root.');
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    throw new Error(`asset-manifest.json is not valid JSON: ${error.message}`);
  }

  if (!manifest || typeof manifest !== 'object') {
    throw new Error('asset-manifest.json must export an object.');
  }

  if (!Array.isArray(manifest.assets)) {
    throw new Error('asset-manifest.json must define an "assets" array.');
  }

  if (typeof manifest.assetBaseUrl !== 'string' || !manifest.assetBaseUrl.trim()) {
    throw new Error('asset-manifest.json must define an "assetBaseUrl" string.');
  }

  let assetBaseUrl;
  try {
    assetBaseUrl = ensureTrailingSlash(new URL(manifest.assetBaseUrl.trim()).toString());
  } catch (error) {
    throw new Error(
      `asset-manifest.json "assetBaseUrl" must be an absolute URL. Found: ${manifest.assetBaseUrl}`,
    );
  }

  return { ...manifest, assetBaseUrl };
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
  try {
    return ensureTrailingSlash(new URL(raw).toString());
  } catch (error) {
    throw new Error(`script.js PRODUCTION_ASSET_ROOT must be an absolute URL. Found: ${raw}`);
  }
}

const manifestDocument = loadManifestDocument();
const bootstrapAssetRoot = extractBootstrapProductionAssetRoot();
const manifestAssetBaseUrl = manifestDocument.assetBaseUrl;

function extractLocalScriptSources(html) {
  const results = new Set();
  const scriptRegex = /<script[^>]*\ssrc=["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = scriptRegex.exec(html)) !== null) {
    const src = match[1];
    if (!isExternalReference(src)) {
      results.add(normalisePath(src));
    }
  }
  return Array.from(results);
}

function extractLocalLinkHrefs(html) {
  const results = new Set();
  const linkRegex = /<link[^>]*\shref=["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const href = match[1];
    if (!isExternalReference(href)) {
      results.add(normalisePath(href));
    }
  }
  return Array.from(results);
}

function normalisePath(value) {
  if (!value) return value;
  return value.replace(/^\.\//, '').split('?')[0];
}

function isExternalReference(value) {
  if (!value) return false;
  return /^(?:https?:)?\/\//i.test(value) || value.startsWith('data:') || value.startsWith('mailto:');
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

function isWorldReadableFile(filePath) {
  let stats;
  try {
    stats = fs.statSync(filePath);
  } catch (error) {
    return false;
  }

  if (!stats.isFile()) {
    return false;
  }

  const mode = stats.mode & 0o777;
  const hasOwnerRead = (mode & 0o400) !== 0;
  const hasGroupRead = (mode & 0o040) !== 0;
  const hasOtherRead = (mode & 0o004) !== 0;
  const hasUnexpectedWrite = (mode & 0o022) !== 0;
  const hasExecute = (mode & 0o111) !== 0;

  return hasOwnerRead && hasGroupRead && hasOtherRead && !hasUnexpectedWrite && !hasExecute;
}

function isWorldReadableDirectory(directoryPath) {
  let stats;
  try {
    stats = fs.statSync(directoryPath);
  } catch (error) {
    return false;
  }

  if (!stats.isDirectory()) {
    return false;
  }

  const mode = stats.mode & 0o777;
  const hasOwnerRead = (mode & 0o400) !== 0;
  const hasOwnerExecute = (mode & 0o100) !== 0;
  const hasGroupRead = (mode & 0o040) !== 0;
  const hasGroupExecute = (mode & 0o010) !== 0;
  const hasOtherRead = (mode & 0o004) !== 0;
  const hasOtherExecute = (mode & 0o001) !== 0;
  const hasUnexpectedWrite = (mode & 0o022) !== 0;

  return (
    hasOwnerRead &&
    hasOwnerExecute &&
    hasGroupRead &&
    hasGroupExecute &&
    hasOtherRead &&
    hasOtherExecute &&
    !hasUnexpectedWrite
  );
}

function collectGltfAssets() {
  if (!fs.existsSync(assetsDir)) {
    return [];
  }
  const files = listFilesRecursive(assetsDir);
  return files
    .filter((file) => file.toLowerCase().endsWith('.gltf'))
    .map((file) => path.relative(repoRoot, file).split(path.sep).join('/'));
}

function loadManifestAssets() {
  return manifestDocument.assets
    .map((asset) => normalisePath(asset))
    .filter((asset) => typeof asset === 'string' && asset.length > 0);
}

const manifestAssets = loadManifestAssets();
const manifestAssetSet = new Set(manifestAssets);

describe('deployment workflow asset coverage', () => {
  it('aligns manifest assetBaseUrl with the bootstrap production asset root', () => {
    expect(manifestAssetBaseUrl).toBe(bootstrapAssetRoot);
  });

  it('lists every local asset referenced by index.html', () => {
    const localAssets = new Set([
      ...extractLocalScriptSources(indexHtml),
      ...extractLocalLinkHrefs(indexHtml),
    ]);

    const missing = Array.from(localAssets).filter(
      (asset) => asset && !manifestAssetSet.has(asset),
    );

    expect(missing).toEqual([]);
  });

  it('enumerates required runtime bundles and vendor shims', () => {
    const requiredAssets = [
      'index.html',
      'styles.css',
      'script.js',
      'simple-experience.js',
      'asset-resolver.js',
      'audio-aliases.js',
      'audio-captions.js',
      'combat-utils.js',
      'crafting.js',
      'portal-mechanics.js',
      'scoreboard-utils.js',
      'assets/offline-assets.js',
      'assets/audio-samples.json',
      'vendor/three.min.js',
      'vendor/GLTFLoader.js',
      'vendor/howler-stub.js',
    ];

    const missing = requiredAssets.filter((asset) => !manifestAssetSet.has(asset));

    expect(missing).toEqual([]);
  });

  it('includes every GLTF model referenced by the experience', () => {
    const gltfAssets = collectGltfAssets();
    const missing = gltfAssets.filter((asset) => !manifestAssetSet.has(asset));

    expect(gltfAssets.length).toBeGreaterThan(0);
    expect(missing).toEqual([]);
  });

  it('only references assets that exist on disk', () => {
    const missing = manifestAssets.filter((asset) => {
      const filePath = path.join(repoRoot, asset);
      try {
        return !fs.statSync(filePath).isFile();
      } catch (error) {
        return true;
      }
    });

    expect(missing).toEqual([]);
  });

  it('ensures manifest assets are world-readable without extra write or execute bits', () => {
    const invalid = manifestAssets.filter((asset) => {
      const filePath = path.join(repoRoot, asset);
      return !isWorldReadableFile(filePath);
    });

    expect(invalid).toEqual([]);
  });

  it('ensures asset prefixes do not contain files missing from the manifest', () => {
    const prefixes = ['assets', 'textures', 'audio', 'vendor'];
    const unexpected = [];

    for (const prefix of prefixes) {
      const directory = path.join(repoRoot, prefix);
      if (!fs.existsSync(directory)) {
        continue;
      }

      const files = listFilesRecursive(directory);
      for (const filePath of files) {
        const relative = path.relative(repoRoot, filePath).split(path.sep).join('/');
        if (!manifestAssetSet.has(relative)) {
          unexpected.push(relative);
        }
      }
    }

    expect(unexpected).toEqual([]);
  });

  it('ensures asset prefixes only contain world-readable files', () => {
    const prefixes = ['assets', 'textures', 'audio'];
    const invalid = [];

    for (const prefix of prefixes) {
      const directory = path.join(repoRoot, prefix);
      if (!fs.existsSync(directory)) {
        continue;
      }

      const files = listFilesRecursive(directory);
      for (const filePath of files) {
        if (!isWorldReadableFile(filePath)) {
          invalid.push(path.relative(repoRoot, filePath).split(path.sep).join('/'));
        }
      }
    }

    expect(invalid).toEqual([]);
  });

  it('ensures asset prefixes only contain world-readable directories', () => {
    const prefixes = ['assets', 'textures', 'audio'];
    const invalid = [];

    for (const prefix of prefixes) {
      const directory = path.join(repoRoot, prefix);
      if (!fs.existsSync(directory)) {
        continue;
      }

      const directories = listDirectoriesRecursive(directory, { includeSelf: true });
      for (const directoryPath of directories) {
        if (!isWorldReadableDirectory(directoryPath)) {
          invalid.push(path.relative(repoRoot, directoryPath).split(path.sep).join('/'));
        }
      }
    }

    expect(invalid).toEqual([]);
  });

  it('does not include duplicate entries', () => {
    expect(manifestAssets.length).toBe(manifestAssetSet.size);
  });

  it('deploy workflow syncs every manifest asset', () => {
    const includePatterns = extractIncludePatterns(workflowContents);
    const missing = manifestAssets.filter(
      (asset) => !includePatterns.some((pattern) => patternMatchesAsset(pattern, asset)),
    );

    expect(includePatterns.length).toBeGreaterThan(0);
    expect(missing).toEqual([]);
  });

  it('deploy workflow sync includes core static asset prefixes', () => {
    const includePatterns = extractIncludePatterns(workflowContents);
    const requiredPrefixes = ['assets/**', 'audio/**', 'textures/**'];
    const missing = requiredPrefixes.filter((prefix) => !includePatterns.includes(prefix));

    expect(missing).toEqual([]);
  });

  it('deploy workflow normalizes CDN MIME types for critical assets', () => {
    const expectedSnippets = [
      "ensure_content_type '.gltf' 'model/gltf+json'",
      "ensure_content_type '.png' 'image/png'",
      "ensure_content_type '.mp3' 'audio/mpeg'",
      "ensure_content_type '.js' 'application/javascript'",
    ];

    expectedSnippets.forEach((snippet) => {
      expect(workflowContents.includes(snippet)).toBe(true);
    });
  });

  it('CloudFront function enforces MIME type and CORS headers for CDN assets', () => {
    const functionResource = templateDocument?.Resources?.AssetsMimeTypeFunction || null;

    expect(functionResource).toBeTruthy();

    const properties = functionResource.Properties || {};
    expect(properties.FunctionConfig?.Runtime).toBe('cloudfront-js-1.0');

    const functionCode = properties.FunctionCode;
    expect(typeof functionCode).toBe('string');

    const expectedMimeMap = {
      ".gltf": 'model/gltf+json',
      ".png": 'image/png',
      ".mp3": 'audio/mpeg',
      ".js": 'application/javascript',
    };

    Object.entries(expectedMimeMap).forEach(([extension, contentType]) => {
      expect(functionCode.includes(`'${extension}': '${contentType}'`)).toBe(true);
    });

    expect(functionCode.includes("headers['access-control-allow-origin'] = { value: '*' };")).toBe(true);

    const distributionConfig =
      templateDocument?.Resources?.AssetsDistribution?.Properties?.DistributionConfig || null;

    expect(distributionConfig).toBeTruthy();

    const associations =
      distributionConfig?.DefaultCacheBehavior?.FunctionAssociations || [];

    expect(
      associations.some(
        (association) =>
          association &&
          association.EventType === 'viewer-response' &&
          association.FunctionARN === 'AssetsMimeTypeFunction.FunctionARN',
      ),
    ).toBe(true);
  });

  it('CloudFront function sets MIME and CORS headers for asset responses at runtime', () => {
    const functionResource = templateDocument?.Resources?.AssetsMimeTypeFunction || null;

    expect(functionResource).toBeTruthy();

    const functionCode = functionResource?.Properties?.FunctionCode;
    expect(typeof functionCode).toBe('string');

    // CloudFront functions wrap the handler in a script without exports. Evaluate the
    // function body so we can execute the handler with representative events.
    const handler = new Function(`${functionCode}; return handler;`)();

    const scenarios = [
      { uri: '/models/portal.gltf', expected: 'model/gltf+json' },
      { uri: '/textures/skybox.png', expected: 'image/png' },
      { uri: '/audio/theme.mp3', expected: 'audio/mpeg' },
      { uri: '/scripts/runtime.js', expected: 'application/javascript' },
    ];

    scenarios.forEach(({ uri, expected }) => {
      const result = handler({
        request: { uri },
        response: { headers: {} },
      });

      expect(result?.headers?.['content-type']?.value).toBe(expected);
      expect(result?.headers?.['access-control-allow-origin']?.value).toBe('*');
    });

    const preserved = handler({
      request: { uri: '/textures/banner.png' },
      response: {
        headers: {
          'content-type': { value: 'application/octet-stream' },
          'x-existing-header': { value: 'keep-me' },
        },
      },
    });

    expect(preserved.headers['content-type'].value).toBe('image/png');
    expect(preserved.headers['x-existing-header'].value).toBe('keep-me');
    expect(preserved.headers['access-control-allow-origin'].value).toBe('*');

    const passthrough = handler({
      request: { uri: '/docs/readme.txt' },
      response: { headers: {} },
    });

    expect(passthrough.headers['content-type']).toBeUndefined();
    expect(passthrough.headers['access-control-allow-origin'].value).toBe('*');
  });

  it('does not include unreachable manifest assets', () => {
    const { unreachable } = listUnreachableManifestAssets(manifestAssets, { baseDir: repoRoot });

    expect(unreachable).toEqual([]);
  });

  it('CloudFormation bucket policy grants read access to asset prefixes via the OAI or public policy', () => {
    const bucketPolicy =
      templateDocument?.Resources?.AssetsBucketPolicy?.Properties?.PolicyDocument || null;

    expect(bucketPolicy).toBeTruthy();

    const statements = toArray(bucketPolicy.Statement);
    const readStatement = statements.find(
      (statement) =>
        statement &&
        statement.Effect === 'Allow' &&
        toArray(statement.Action).includes('s3:GetObject'),
    );

    expect(readStatement).toBeTruthy();
    expect(readStatement.Effect).toBe('Allow');

    const principal = readStatement.Principal || {};
    const oaiPrincipal = isOaiPrincipal(principal);
    const publicPrincipal = isPublicPrincipal(principal);

    expect(oaiPrincipal || publicPrincipal).toBe(true);
    if (oaiPrincipal) {
      expect(principal.CanonicalUser).toContain('AssetsCloudFrontOAI');
    }

    const actions = toArray(readStatement.Action);
    expect(actions).toEqual(['s3:GetObject']);

    const resources = new Set(toArray(readStatement.Resource));
    const expectedResources = [
      '${AssetsBucket.Arn}/assets/*',
      '${AssetsBucket.Arn}/textures/*',
      '${AssetsBucket.Arn}/audio/*',
    ];

    expect(resources.size).toBe(expectedResources.length);
    expectedResources.forEach((resource) => {
      expect(resources.has(resource)).toBe(true);
    });
  });

  it('CloudFormation bucket policy does not allow s3:GetObject to any other principal', () => {
    const bucketPolicy =
      templateDocument?.Resources?.AssetsBucketPolicy?.Properties?.PolicyDocument || null;

    expect(bucketPolicy).toBeTruthy();

    const statements = toArray(bucketPolicy.Statement);
    const getObjectAllowStatements = statements.filter((statement) => {
      if (!statement || statement.Effect !== 'Allow') {
        return false;
      }
      return toArray(statement.Action).includes('s3:GetObject');
    });

    expect(getObjectAllowStatements).toHaveLength(1);
    const [statement] = getObjectAllowStatements;

    const allowedSids = new Set(['AllowCloudFrontOriginAccessIdentityRead', 'AllowPublicAssetRead']);
    if (statement.Sid) {
      expect(allowedSids.has(statement.Sid)).toBe(true);
    }

    const principal = statement.Principal || {};
    const oaiPrincipal = isOaiPrincipal(principal);
    const publicPrincipal = isPublicPrincipal(principal);

    expect(oaiPrincipal || publicPrincipal).toBe(true);
    if (oaiPrincipal) {
      expect(principal.CanonicalUser).toContain('AssetsCloudFrontOAI');
    }
  });

  it('CloudFront distribution applies a permissive CORS response headers policy for CDN assets', () => {
    const distributionConfig =
      templateDocument?.Resources?.AssetsDistribution?.Properties?.DistributionConfig || null;

    expect(distributionConfig).toBeTruthy();

    const cacheBehavior = distributionConfig?.DefaultCacheBehavior || null;
    expect(cacheBehavior).toBeTruthy();
    expect(cacheBehavior.ResponseHeadersPolicyId).toBe('AssetsResponseHeadersPolicy');

    const policyConfig =
      templateDocument?.Resources?.AssetsResponseHeadersPolicy?.Properties?.ResponseHeadersPolicyConfig || null;

    expect(policyConfig).toBeTruthy();

    const corsConfig = policyConfig.CorsConfig || {};
    expect(corsConfig.AccessControlAllowCredentials).toBe(false);
    expect(corsConfig.OriginOverride).toBe(true);

    const allowHeaders = new Set(toArray(corsConfig.AccessControlAllowHeaders?.Items));
    expect(allowHeaders.has('*')).toBe(true);
    expect(allowHeaders.size).toBe(1);

    const allowOrigins = new Set(toArray(corsConfig.AccessControlAllowOrigins?.Items));
    expect(allowOrigins.has('*')).toBe(true);
    expect(allowOrigins.size).toBe(1);

    const allowMethods = new Set(toArray(corsConfig.AccessControlAllowMethods?.Items));
    ['GET', 'HEAD', 'OPTIONS'].forEach((method) => {
      expect(allowMethods.has(method)).toBe(true);
    });
    expect(allowMethods.size).toBe(3);
  });
});
