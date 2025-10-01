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

const fallbackStart = scriptSource.indexOf('let simpleFallbackAttempted = false;');
const fallbackEnd = scriptSource.indexOf('function createScoreboardUtilsFallback', fallbackStart);
if (fallbackStart === -1 || fallbackEnd === -1 || fallbackEnd <= fallbackStart) {
  throw new Error('Failed to locate simple fallback bootstrap helpers in script.js');
}

function instantiateSimpleFallback(scope) {
  const factory = new Function(
    'scope',
    "'use strict';" +
      'const bootstrap = scope.bootstrap;' +
      'const globalScope = scope;' +
      scriptSource.slice(fallbackStart, fallbackEnd) +
      '\nreturn { tryStartSimpleFallback, getAttempted: () => simpleFallbackAttempted };'
  );
  return factory(scope);
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

  describe('simple fallback bootstrap', () => {
    it('forces simple mode and reuses bootstrap when available', () => {
      const calls = [];
      const scope = {
        APP_CONFIG: { enableAdvancedExperience: true, preferAdvanced: true },
        SimpleExperience: { create: () => ({}) },
        console: { warn: () => {}, error: () => {} },
        bootstrap: () => {
          calls.push('boot');
        },
      };
      const { tryStartSimpleFallback, getAttempted } = instantiateSimpleFallback(scope);
      const result = tryStartSimpleFallback(new Error('loader failed'), { reason: 'unit-test' });
      expect(result).toBe(true);
      expect(scope.APP_CONFIG.forceSimpleMode).toBe(true);
      expect(scope.APP_CONFIG.enableAdvancedExperience).toBe(false);
      expect(scope.APP_CONFIG.preferAdvanced).toBe(false);
      expect(scope.APP_CONFIG.defaultMode).toBe('simple');
      expect(calls).toHaveLength(1);
      expect(getAttempted()).toBe(true);

      const secondResult = tryStartSimpleFallback(new Error('loader failed again'), {
        reason: 'unit-test-repeat',
      });
      expect(secondResult).toBe(false);
      expect(calls).toHaveLength(1);
    });

    it('returns false when the simple sandbox is unavailable', () => {
      const scope = {
        APP_CONFIG: {},
        console: { warn: () => {}, error: () => {} },
        bootstrap: () => {
          throw new Error('should not be called');
        },
      };
      const { tryStartSimpleFallback, getAttempted } = instantiateSimpleFallback(scope);
      expect(tryStartSimpleFallback(new Error('missing'), { reason: 'no-simple' })).toBe(false);
      expect(getAttempted()).toBe(false);
    });
  });
});
