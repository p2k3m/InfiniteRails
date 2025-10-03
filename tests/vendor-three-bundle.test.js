import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const vendorThreePath = path.join(repoRoot, 'vendor', 'three.min.js');
const threeRoot = path.dirname(require.resolve('three'));
const threePackageJsonPath = path.join(threeRoot, '..', 'package.json');
const { version: threeVersion } = JSON.parse(fs.readFileSync(threePackageJsonPath, 'utf8'));

describe('vendor/three.min.js bundle', () => {
  const vendorSource = fs.readFileSync(vendorThreePath, 'utf8');

  it('includes the pinned Three.js version banner', () => {
    expect(vendorSource).toContain(`three@${threeVersion}`);
  });

  it('exposes and preserves the singleton global guard', () => {
    expect(vendorSource).toMatch(/globalThis\.THREE_GLOBAL/);
    expect(vendorSource).toMatch(/Multiple Three\.js bundles detected; preserving the existing singleton\./);
  });
});
