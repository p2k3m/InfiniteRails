import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const repoRoot = path.resolve(__dirname, '..');
const manifestRelativePath = 'asset-manifest.json';
const knownGoodRelativePath = path.join('deployment', 'known-good-manifest.json');
const targetFiles = [
  manifestRelativePath,
  'index.html',
  'script.js',
  'simple-experience.js',
  'asset-resolver.js',
  'tests/renderer-three-init.test.js',
];

const require = createRequire(import.meta.url);
const { rollbackToKnownGood } = require('../scripts/rollback-known-good.js');

function readFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function writeFile(relativePath, contents) {
  fs.writeFileSync(path.join(repoRoot, relativePath), contents);
}

describe('known-good rollback utility', () => {
  let originalContents;

  beforeEach(() => {
    originalContents = new Map();
    for (const relative of targetFiles) {
      originalContents.set(relative, readFile(relative));
    }
  });

  afterEach(() => {
    for (const [relative, contents] of originalContents.entries()) {
      writeFile(relative, contents);
    }
  });

  it('restores the manifest snapshot and refreshes cache-busting references', () => {
    const originalManifest = JSON.parse(originalContents.get(manifestRelativePath));
    const mutatedManifest = {
      ...originalManifest,
      assets: originalManifest.assets.map((entry) => entry.replace(/61e4a3d4804d-dirty/g, 'broken-build')),
    };
    writeFile(manifestRelativePath, `${JSON.stringify(mutatedManifest, null, 2)}\n`);

    const dirtyPattern = /61e4a3d4804d-dirty/g;
    const replacement = 'broken-build';
    for (const relative of targetFiles) {
      if (relative === manifestRelativePath) {
        continue;
      }
      const original = originalContents.get(relative);
      writeFile(relative, original.replace(dirtyPattern, replacement));
    }

    const { manifest, updatedFiles } = rollbackToKnownGood({ logger: null });

    const persistedManifest = JSON.parse(readFile(manifestRelativePath));
    const knownGoodManifest = JSON.parse(readFile(knownGoodRelativePath));

    expect(persistedManifest.assets).toEqual(knownGoodManifest.assets);
    expect(persistedManifest.assetBaseUrl).toBe(knownGoodManifest.assetBaseUrl);
    expect(persistedManifest.knownGoodManifest).toEqual(originalManifest.knownGoodManifest);
    expect(manifest.assets).toEqual(knownGoodManifest.assets);

    expect(updatedFiles).not.toContain(manifestRelativePath);
    for (const relative of ['index.html', 'script.js']) {
      expect(updatedFiles).toContain(relative);
    }

    for (const relative of targetFiles) {
      const contents = readFile(relative);
      expect(contents.includes(replacement)).toBe(false);
    }
  });
});
