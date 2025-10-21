import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBootstrapSandbox, evaluateBootstrapScript } from './helpers/bootstrap-test-utils.js';

function setupMatchMedia(windowStub, presetMatches = {}) {
  const entries = new Map();
  windowStub.matchMedia = vi.fn((query) => {
    if (entries.has(query)) {
      return entries.get(query);
    }
    const listeners = new Set();
    const initialMatch = Object.prototype.hasOwnProperty.call(presetMatches, query)
      ? Boolean(presetMatches[query])
      : false;
    const entry = {
      matches: initialMatch,
      addEventListener: vi.fn((eventName, handler) => {
        if (eventName === 'change' && typeof handler === 'function') {
          listeners.add(handler);
        }
      }),
      removeEventListener: vi.fn((eventName, handler) => {
        if (eventName === 'change') {
          listeners.delete(handler);
        }
      }),
      addListener: vi.fn((handler) => {
        if (typeof handler === 'function') {
          listeners.add(handler);
        }
      }),
      removeListener: vi.fn((handler) => {
        listeners.delete(handler);
      }),
      dispatch(value) {
        this.matches = Boolean(value);
        listeners.forEach((handler) => {
          try {
            handler({ matches: this.matches });
          } catch (error) {}
        });
      },
    };
    entries.set(query, entry);
    return entry;
  });
  return { entries };
}

function getLatestInputModeCall(documentStub) {
  const calls = documentStub.body.setAttribute.mock.calls.filter(([name]) => name === 'data-input-mode');
  return calls.length ? calls[calls.length - 1][1] : null;
}

function getToggleCall(documentStub, className) {
  const calls = documentStub.body.classList.toggle.mock.calls.filter(([name]) => name === className);
  return calls.length ? calls[calls.length - 1][1] : null;
}

function getOverlayScheme(documentStub) {
  const overlay = documentStub.getElementById('inputOverlay');
  if (!overlay) {
    return null;
  }
  return overlay.dataset?.scheme ?? null;
}

describe('bootstrap input mode detection', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('activates touch mode by default when coarse pointer signals are present', () => {
    const { sandbox, windowStub, documentStub } = createBootstrapSandbox();
    windowStub.navigator.maxTouchPoints = 5;
    setupMatchMedia(windowStub, {
      '(pointer: coarse)': true,
      '(any-pointer: coarse)': true,
      '(hover: none)': true,
      '(any-hover: none)': true,
    });

    evaluateBootstrapScript(sandbox);

    expect(getLatestInputModeCall(documentStub)).toBe('touch');
    expect(getToggleCall(documentStub, 'input-touch')).toBe(true);
    expect(getToggleCall(documentStub, 'input-pointer')).toBe(false);
    expect(getOverlayScheme(documentStub)).toBe('touch');
  });

  it('switches to pointer mode when mouse pointer events are observed', () => {
    const { sandbox, windowStub, documentStub } = createBootstrapSandbox();
    windowStub.navigator.maxTouchPoints = 5;
    setupMatchMedia(windowStub, {
      '(pointer: coarse)': true,
      '(any-pointer: coarse)': true,
      '(hover: none)': true,
      '(any-hover: none)': true,
    });

    evaluateBootstrapScript(sandbox);

    const pointerCall = documentStub.addEventListener.mock.calls.find(([type]) => type === 'pointerdown');
    expect(pointerCall).toBeDefined();
    const pointerHandler = pointerCall[1];
    pointerHandler({ pointerType: 'mouse' });

    expect(getLatestInputModeCall(documentStub)).toBe('pointer');
    expect(getToggleCall(documentStub, 'input-touch')).toBe(false);
    expect(getToggleCall(documentStub, 'input-pointer')).toBe(true);
    expect(getOverlayScheme(documentStub)).toBe('pointer');
  });

  it('keeps touch mode active when pen pointer events are observed on coarse devices', () => {
    const { sandbox, windowStub, documentStub } = createBootstrapSandbox();
    windowStub.navigator.maxTouchPoints = 1;
    setupMatchMedia(windowStub, {
      '(pointer: coarse)': true,
      '(any-pointer: coarse)': true,
      '(hover: none)': true,
      '(any-hover: none)': true,
    });

    evaluateBootstrapScript(sandbox);

    const pointerCall = documentStub.addEventListener.mock.calls.find(([type]) => type === 'pointerdown');
    expect(pointerCall).toBeDefined();
    const pointerHandler = pointerCall[1];
    pointerHandler({ pointerType: 'pen' });

    expect(getLatestInputModeCall(documentStub)).toBe('touch');
    expect(getToggleCall(documentStub, 'input-touch')).toBe(true);
    expect(getToggleCall(documentStub, 'input-pointer')).toBe(false);
    expect(getOverlayScheme(documentStub)).toBe('touch');
  });

  it('responds to coarse pointer media query changes', () => {
    const { sandbox, windowStub, documentStub } = createBootstrapSandbox();
    windowStub.navigator.maxTouchPoints = 0;
    const { entries } = setupMatchMedia(windowStub, {
      '(pointer: coarse)': true,
      '(hover: none)': true,
    });

    evaluateBootstrapScript(sandbox);

    expect(getLatestInputModeCall(documentStub)).toBe('touch');

    const query = ['(pointer: coarse)', '(any-pointer: coarse)', '(hover: none)', '(any-hover: none)'].find((key) =>
      entries.has(key),
    );
    expect(query).toBeDefined();
    const mediaEntry = entries.get(query);
    expect(mediaEntry).toBeDefined();

    mediaEntry.dispatch(false);

    expect(getLatestInputModeCall(documentStub)).toBe('pointer');
    expect(getToggleCall(documentStub, 'input-touch')).toBe(false);
    expect(getToggleCall(documentStub, 'input-pointer')).toBe(true);
    expect(getOverlayScheme(documentStub)).toBe('pointer');
  });
});
