import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const scriptSource = fs.readFileSync(path.join(repoRoot, 'script.js'), 'utf8');

const controlMapStart = scriptSource.indexOf('function normaliseKeyBindingValue');
const controlMapEnd = scriptSource.indexOf('function queueBootstrapFallbackNotice', controlMapStart);
if (controlMapStart === -1 || controlMapEnd === -1 || controlMapEnd <= controlMapStart) {
  throw new Error('Failed to locate fallback shortcut helpers in script.js');
}
const fallbackShortcutSource = scriptSource.slice(controlMapStart, controlMapEnd);

function instantiateFallbackShortcuts(scope) {
  const factory = new Function(
    'scope',
    "'use strict';" +
      'const globalScope = scope;' +
      'const documentRef = scope.document ?? null;' +
      'const document = scope.document ?? undefined;' +
      'const activateMissionBriefingFallback = scope.activateMissionBriefingFallback;' +
      'const tryStartSimpleFallback = scope.tryStartSimpleFallback;' +
      'const invokeWithErrorBoundary = scope.invokeWithErrorBoundary ?? ((fn) => fn());' +
      'const recordLiveDiagnostic = scope.recordLiveDiagnostic ?? (() => {});' +
      fallbackShortcutSource +
      '\nreturn { initialiseFallbackShortcutControls, cloneFallbackShortcutState };',
  );
  return factory(scope);
}

function createControlsApi(map) {
  let current = { ...map };
  const listeners = new Set();
  return {
    get: () => ({ ...current }),
    subscribe(listener) {
      listeners.add(listener);
      listener({ ...current });
      return () => listeners.delete(listener);
    },
    update(next) {
      current = { ...next };
      listeners.forEach((listener) => {
        listener({ ...current });
      });
    },
  };
}

function createWindowStub({ controlMap }) {
  const listeners = new Map();
  const windowStub = {
    console: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    document: {
      body: { dataset: {} },
      documentElement: { dataset: {} },
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => ({
        setAttribute: () => {},
        classList: { add: () => {} },
        appendChild: () => {},
        insertBefore: () => {},
        removeAttribute: () => {},
      }),
    },
    addEventListener(type, listener) {
      const entry = listeners.get(type) ?? [];
      entry.push(listener);
      listeners.set(type, entry);
    },
    removeEventListener(type, listener) {
      const entry = listeners.get(type);
      if (!entry) {
        return;
      }
      const next = entry.filter((candidate) => candidate !== listener);
      if (next.length) {
        listeners.set(type, next);
      } else {
        listeners.delete(type);
      }
    },
    dispatchEvent(event) {
      const entry = listeners.get(event.type);
      if (!entry) {
        return;
      }
      entry.slice().forEach((listener) => {
        listener.call(windowStub, event);
      });
    },
    recordLiveDiagnostic: vi.fn(),
    activateMissionBriefingFallback: vi.fn(() => true),
    tryStartSimpleFallback: vi.fn(() => true),
    invokeWithErrorBoundary: (fn) => fn(),
    __INFINITE_RAILS_ACTIVE_EXPERIENCE__: {
      showFirstRunTutorial: vi.fn(() => true),
    },
  };
  windowStub.InfiniteRailsControls = createControlsApi(controlMap);
  return windowStub;
}

function createKeyboardEvent(code, target = null) {
  return {
    type: 'keydown',
    code,
    target,
    repeat: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  };
}

describe('fallback shortcut bindings', () => {
  const defaultControlMap = {
    activateBriefingFallback: ['F9'],
    startSimpleFallbackRenderer: ['F10'],
    triggerTutorialRescue: ['F7'],
  };

  it('initialises bindings from the control map API', () => {
    const windowStub = createWindowStub({ controlMap: defaultControlMap });
    const api = instantiateFallbackShortcuts(windowStub);
    api.initialiseFallbackShortcutControls(windowStub, windowStub.document);
    const snapshot = api.cloneFallbackShortcutState();
    expect(snapshot.active).toBe(true);
    expect(snapshot.bindings.F9).toBe('activateBriefingFallback');
    expect(snapshot.bindings.F10).toBe('startSimpleFallbackRenderer');
    expect(snapshot.bindings.F7).toBe('triggerTutorialRescue');
  });

  it('activates classic “safe” mode via the F9 shortcut', () => {
    const windowStub = createWindowStub({ controlMap: defaultControlMap });
    const api = instantiateFallbackShortcuts(windowStub);
    api.initialiseFallbackShortcutControls(windowStub, windowStub.document);
    const event = createKeyboardEvent('F9', { tagName: 'CANVAS', isContentEditable: false });
    windowStub.dispatchEvent(event);
    expect(windowStub.activateMissionBriefingFallback).toHaveBeenCalledTimes(1);
    const [options] = windowStub.activateMissionBriefingFallback.mock.calls[0];
    expect(options?.reason).toBe('user-shortcut');
    expect(options?.context?.key).toBe('F9');
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
  });

  it('requests the simple legacy graphics mode when F10 is pressed', () => {
    const windowStub = createWindowStub({ controlMap: defaultControlMap });
    const api = instantiateFallbackShortcuts(windowStub);
    api.initialiseFallbackShortcutControls(windowStub, windowStub.document);
    const event = createKeyboardEvent('F10', { tagName: 'BODY', isContentEditable: false });
    windowStub.dispatchEvent(event);
    expect(windowStub.tryStartSimpleFallback).toHaveBeenCalledTimes(1);
    const [, context] = windowStub.tryStartSimpleFallback.mock.calls[0];
    expect(context?.reason).toBe('user-shortcut');
    expect(context?.key).toBe('F10');
  });

  it('launches the full tutorial/mid-run flow when F7 is pressed', () => {
    const windowStub = createWindowStub({ controlMap: defaultControlMap });
    const api = instantiateFallbackShortcuts(windowStub);
    api.initialiseFallbackShortcutControls(windowStub, windowStub.document);
    const event = createKeyboardEvent('F7', { tagName: 'DIV', isContentEditable: false });
    windowStub.dispatchEvent(event);
    expect(windowStub.__INFINITE_RAILS_ACTIVE_EXPERIENCE__.showFirstRunTutorial).toHaveBeenCalledTimes(1);
    const [options] =
      windowStub.__INFINITE_RAILS_ACTIVE_EXPERIENCE__.showFirstRunTutorial.mock.calls[0];
    expect(options?.force).toBe(true);
    expect(windowStub.recordLiveDiagnostic).toHaveBeenCalled();
  });
});
