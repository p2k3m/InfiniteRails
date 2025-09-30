import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const scriptSource = fs.readFileSync(path.join(repoRoot, 'script.js'), 'utf8');

const start = scriptSource.indexOf('function shouldStartSimpleMode() {');
const end = scriptSource.indexOf('function setupSimpleExperienceIntegrations', start);
if (start === -1 || end === -1 || end <= start) {
  throw new Error('Failed to locate shouldStartSimpleMode definition in script.js');
}
const shouldStartSimpleModeSource = scriptSource.slice(start, end);

function instantiateShouldStartSimpleMode(windowStub) {
  const factory = new Function(
    'window',
    'URLSearchParams',
    "'use strict';" + shouldStartSimpleModeSource + '\nreturn shouldStartSimpleMode;'
  );
  return factory(windowStub, URLSearchParams);
}

describe('renderer mode selection', () => {
  it('prefers the advanced renderer when advanced mode is configured', () => {
    const windowStub = {
      location: { search: '' },
      APP_CONFIG: {
        enableAdvancedExperience: true,
        preferAdvanced: true,
        forceAdvanced: true,
      },
      SimpleExperience: { create: () => ({}) },
    };
    const shouldStartSimpleMode = instantiateShouldStartSimpleMode(windowStub);
    expect(shouldStartSimpleMode()).toBe(false);
  });

  it('allows overriding to the sandbox renderer via query params', () => {
    const windowStub = {
      location: { search: '?mode=simple' },
      APP_CONFIG: {
        enableAdvancedExperience: true,
        preferAdvanced: true,
        forceAdvanced: true,
      },
      SimpleExperience: { create: () => ({}) },
    };
    const shouldStartSimpleMode = instantiateShouldStartSimpleMode(windowStub);
    expect(shouldStartSimpleMode()).toBe(true);
  });

  it('honours APP_CONFIG.forceSimpleMode even when forceAdvanced is true', () => {
    const windowStub = {
      location: { search: '' },
      APP_CONFIG: {
        enableAdvancedExperience: true,
        forceAdvanced: true,
        forceSimpleMode: true,
      },
      SimpleExperience: { create: () => ({}) },
    };
    const shouldStartSimpleMode = instantiateShouldStartSimpleMode(windowStub);
    expect(shouldStartSimpleMode()).toBe(true);
  });
});
