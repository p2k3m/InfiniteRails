import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';

const repoRoot = path.resolve(__dirname, '..');
const indexHtmlPath = path.join(repoRoot, 'index.html');
const workflowPath = path.join(repoRoot, '.github', 'workflows', 'deploy.yml');
const manifestPath = path.join(repoRoot, 'asset-manifest.json');
const templatePath = path.join(repoRoot, 'serverless', 'template.yaml');

const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
const workflowContents = fs.readFileSync(workflowPath, 'utf8');
const assetsDir = path.join(repoRoot, 'assets');
const templateContents = fs.readFileSync(templatePath, 'utf8');
const sanitizedTemplateContents = templateContents
  .replace(/!Ref\s+/g, '')
  .replace(/!GetAtt\s+/g, '')
  .replace(/!Sub\s+/g, '');
const templateDocument = parseYaml(sanitizedTemplateContents);

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

  return manifest.assets
    .map((asset) => normalisePath(asset))
    .filter((asset) => typeof asset === 'string' && asset.length > 0);
}

const manifestAssets = loadManifestAssets();
const manifestAssetSet = new Set(manifestAssets);

describe('deployment workflow asset coverage', () => {
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

  it('CloudFormation bucket policy grants only the CloudFront OAI read access to asset prefixes', () => {
    const bucketPolicy =
      templateDocument?.Resources?.AssetsBucketPolicy?.Properties?.PolicyDocument || null;

    expect(bucketPolicy).toBeTruthy();

    const statements = toArray(bucketPolicy.Statement);
    const readStatement = statements.find(
      (statement) => statement && statement.Sid === 'AllowCloudFrontOriginAccessIdentityRead',
    );

    expect(readStatement).toBeTruthy();
    expect(readStatement.Effect).toBe('Allow');

    const principal = readStatement.Principal || {};
    expect(typeof principal.CanonicalUser).toBe('string');
    expect(principal.CanonicalUser).toContain('AssetsCloudFrontOAI');

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
});
