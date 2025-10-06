import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const scriptSource = fs.readFileSync(path.join(repoRoot, 'script.js'), 'utf8');
const blockStart = scriptSource.indexOf('function includesTextureLanguage(');
const blockEnd = scriptSource.indexOf('function presentCriticalErrorOverlay', blockStart);
if (blockStart === -1 || blockEnd === -1 || blockEnd <= blockStart) {
  throw new Error('Unable to locate diagnostics reload helpers in script.js');
}
const reloadHelpersSource = scriptSource.slice(blockStart, blockEnd);

function instantiateReloadHelpers(scope, logDiagnosticsEvent, showHudAlert) {
  const factory = new Function(
    'scope',
    'logDiagnosticsEventFn',
    'showHudAlertFn',
    "'use strict';" +
      'const globalScope = scope;' +
      'const logDiagnosticsEvent = logDiagnosticsEventFn;' +
      'const showHudAlert = showHudAlertFn;' +
      reloadHelpersSource +
      '\nreturn { attemptAssetReloadFromDiagnostics, resolveAssetReloadActionLabel };',
  );
  return factory(scope, logDiagnosticsEvent, showHudAlert);
}

describe('diagnostics asset reload integration', () => {
  it('invokes runtime texture refresh when diagnostics requests a texture reload', async () => {
    const refreshTextures = vi.fn(() => Promise.resolve({ keys: ['grass'] }));
    const showHudAlert = vi.fn();
    const logDiagnosticsEvent = vi.fn();
    const scope = {
      InfiniteRails: { refreshTextures },
      console: { warn: vi.fn(), debug: vi.fn() },
      dispatchEvent: vi.fn(),
      CustomEvent:
        typeof CustomEvent === 'function'
          ? CustomEvent
          : class CustomEventMock {
              constructor(type, params = {}) {
                this.type = type;
                this.detail = params?.detail ?? null;
              }
            },
      location: { reload: vi.fn() },
    };

    const { attemptAssetReloadFromDiagnostics } = instantiateReloadHelpers(scope, logDiagnosticsEvent, showHudAlert);

    const control = { disabled: false };
    attemptAssetReloadFromDiagnostics({
      source: 'diagnostics-overlay',
      detail: {
        key: 'texture:grass',
        baseUrl: 'https://primary.example.com/textures',
        alternateBaseUrls: ['https://alt.example.com/cdn'],
      },
      control,
      logMessage: 'refresh',
    });

    expect(control.disabled).toBe(true);
    expect(scope.dispatchEvent).toHaveBeenCalled();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(refreshTextures).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'diagnostics-overlay',
        keys: ['grass'],
        baseUrl: 'https://primary.example.com/textures',
        alternateBaseUrls: ['https://alt.example.com/cdn'],
      }),
    );
    expect(control.disabled).toBe(false);
    expect(scope.location.reload).not.toHaveBeenCalled();
    expect(showHudAlert).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Refreshing textures' }),
    );
    expect(showHudAlert).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Textures refreshed' }),
    );
  });
});
