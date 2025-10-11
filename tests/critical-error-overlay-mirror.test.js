import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const scriptSource = fs.readFileSync(path.join(repoRoot, 'script.js'), 'utf8');
const blockStart = scriptSource.indexOf('function shouldSendDiagnosticsToServer(');
const blockEnd = scriptSource.indexOf('function normaliseRequestInfo', blockStart);
if (blockStart === -1 || blockEnd === -1 || blockEnd <= blockStart) {
  throw new Error('Unable to locate diagnostics logging helpers in script.js');
}

const diagnosticsSource = scriptSource.slice(blockStart, blockEnd);

function instantiateDiagnosticsHarness() {
  const bootstrapOverlay = {
    logEvent: vi.fn(),
  };
  const scope = {
    console: { debug: vi.fn(), warn: vi.fn() },
    InfiniteRails: {},
    bootstrapOverlay,
    diagnosticsEndpoint: null,
  };
  const presentOverlay = vi.fn();
  const centralLogStore = { record: vi.fn() };

  const factory = new Function(
    'scope',
    'presentOverlay',
    'centralLogStoreArg',
    "'use strict';" +
      'const globalScope = scope;' +
      'const bootstrapOverlay = scope.bootstrapOverlay;' +
      'const diagnosticsEndpoint = scope.diagnosticsEndpoint ?? null;' +
      'const centralLogStore = centralLogStoreArg;' +
      'const presentCriticalErrorOverlay = presentOverlay;' +
      diagnosticsSource +
      '\nreturn { logDiagnosticsEvent, logThroughDiagnostics };',
  );

  const api = factory(scope, presentOverlay, centralLogStore);
  return { ...api, scope, bootstrapOverlay, presentOverlay, centralLogStore };
}

describe('diagnostics critical error mirroring', () => {
  it('mirrors error diagnostics into the critical overlay', () => {
    const { logDiagnosticsEvent, presentOverlay } = instantiateDiagnosticsHarness();
    logDiagnosticsEvent('script', 'Script failure detected', {
      level: 'error',
      detail: { stage: 'unit-test' },
      timestamp: 1234,
    });

    expect(presentOverlay).toHaveBeenCalledTimes(1);
    expect(presentOverlay).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Script failure detected',
        diagnosticScope: 'script',
        diagnosticStatus: 'error',
      }),
    );
  });

  it('skips overlay mirroring for non-critical diagnostics', () => {
    const { logDiagnosticsEvent, presentOverlay } = instantiateDiagnosticsHarness();
    logDiagnosticsEvent('runtime', 'Runtime ready', { level: 'info' });

    expect(presentOverlay).not.toHaveBeenCalled();
  });

  it('throttles repeated overlay presentations for identical diagnostics', () => {
    vi.useFakeTimers();
    try {
      const { logDiagnosticsEvent, presentOverlay } = instantiateDiagnosticsHarness();
      logDiagnosticsEvent('api', 'Network unavailable', { level: 'error' });
      logDiagnosticsEvent('api', 'Network unavailable', { level: 'error' });

      expect(presentOverlay).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(2500);
      logDiagnosticsEvent('api', 'Network unavailable', { level: 'error' });

      expect(presentOverlay).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

