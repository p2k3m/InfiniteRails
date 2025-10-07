import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const scriptSource = fs.readFileSync(path.join(repoRoot, 'script.js'), 'utf8');

describe('bootstrap audio diagnostics', () => {
  it('displays a critical overlay when audio fallback activates during boot', () => {
    const pattern = /addEventListener\('infinite-rails:audio-boot-status'[\s\S]+?presentCriticalErrorOverlay\(\{[\s\S]+?title:\s*'Audio assets unavailable'/;
    expect(pattern.test(scriptSource)).toBe(true);
  });
});
