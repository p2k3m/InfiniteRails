import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '..');
const scriptSource = fs.readFileSync(path.join(repoRoot, 'script.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');

describe('Manifest asset availability diagnostics', () => {
  it('performs HEAD requests when probing manifest assets', () => {
    const headProbePattern = /fetchWithTimeout\(asset\.url,\s*\{[^}]*method:\s*'HEAD'/;
    expect(headProbePattern.test(scriptSource)).toBe(true);
  });

  it('renders missing manifest assets in the boot diagnostics UI', () => {
    expect(scriptSource.includes('Manifest check missing')).toBe(true);
    expect(indexHtml.includes('bootDiagnosticsAssetsList')).toBe(true);
  });

  it('reloads when manifest integrity mismatches are detected', () => {
    expect(
      scriptSource.includes('Manifest integrity mismatch detected. Reloading to restore asset bundle.'),
    ).toBe(true);
  });
});
