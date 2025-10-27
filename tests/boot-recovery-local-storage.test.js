import { describe, expect, it, vi } from 'vitest';
import { createBootstrapSandbox, evaluateBootRecoveryScript } from './helpers/bootstrap-test-utils.js';

function setupOverlay(documentStub) {
  const overlay = documentStub.createElement('div');
  overlay.setAttribute('id', 'globalOverlay');
  overlay.hidden = false;
  overlay.setAttribute('data-mode', 'loading');
  documentStub.body.appendChild(overlay);

  const overlayActions = documentStub.createElement('div');
  overlayActions.setAttribute('id', 'globalOverlayActions');
  overlayActions.hidden = true;
  overlay.appendChild(overlayActions);

  const overlayButton = documentStub.createElement('button');
  overlayButton.setAttribute('id', 'globalOverlayRecoveryButton');
  overlayButton.hidden = true;
  overlayButton.addEventListener = vi.fn();
  overlayActions.appendChild(overlayButton);

  const overlayStorageButton = documentStub.createElement('button');
  overlayStorageButton.setAttribute('id', 'globalOverlayClearStorageButton');
  overlayStorageButton.hidden = true;
  overlayStorageButton.addEventListener = vi.fn((eventName, handler) => {
    if (eventName === 'click') {
      overlayStorageButton.__clickHandler = handler;
    }
  });
  overlayActions.appendChild(overlayStorageButton);

  return { overlay, overlayActions, overlayStorageButton };
}

function setupStatusElements(documentStub, previousQuerySelectorImpl) {
  const bootstrapStatusUi = documentStub.createElement('span');
  bootstrapStatusUi.setAttribute('id', 'bootstrapStatusUi');
  bootstrapStatusUi.textContent = 'Preparing interface…';
  documentStub.body.appendChild(bootstrapStatusUi);

  const uiStatusItem = documentStub.createElement('li');
  uiStatusItem.setAttribute('data-phase', 'ui');
  uiStatusItem.setAttribute('data-status', 'pending');
  documentStub.body.appendChild(uiStatusItem);

  documentStub.querySelector.mockImplementation((selector) => {
    if (selector === '[data-phase="ui"]') {
      return uiStatusItem;
    }
    if (typeof previousQuerySelectorImpl === 'function') {
      return previousQuerySelectorImpl(selector);
    }
    return null;
  });

  return { bootstrapStatusUi, uiStatusItem };
}

function createLocalStorageStub() {
  const storageData = new Map();
  return {
    get length() {
      return storageData.size;
    },
    key: vi.fn((index) => Array.from(storageData.keys())[index] ?? null),
    getItem: vi.fn((key) => (storageData.has(key) ? storageData.get(key) : null)),
    setItem: vi.fn((key, value) => {
      storageData.set(String(key), String(value));
    }),
    removeItem: vi.fn((key) => {
      storageData.delete(String(key));
    }),
    clear: vi.fn(() => {
      storageData.clear();
    }),
    __data: storageData,
  };
}

function getRecoveryApi(windowStub, sandbox) {
  return windowStub.__INFINITE_RAILS_BOOT_RECOVERY__ ?? sandbox.__INFINITE_RAILS_BOOT_RECOVERY__;
}

describe('boot recovery local storage purge', () => {
  it('offers to purge local data after repeated boot failures', () => {
    const { sandbox, windowStub, documentStub } = createBootstrapSandbox();
    const previousQuerySelector = documentStub.querySelector.getMockImplementation?.();
    const { overlayActions, overlayStorageButton } = setupOverlay(documentStub);
    const { bootstrapStatusUi, uiStatusItem } = setupStatusElements(documentStub, previousQuerySelector);

    const storage = createLocalStorageStub();
    windowStub.localStorage = storage;
    sandbox.localStorage = storage;
    windowStub.globalThis.localStorage = storage;

    const MutationObserverStub = vi.fn((callback) => ({
      observe: vi.fn(),
      disconnect: vi.fn(),
      trigger: () => callback([], { }),
    }));
    windowStub.MutationObserver = MutationObserverStub;
    sandbox.MutationObserver = MutationObserverStub;

    windowStub.location.reload = vi.fn();
    windowStub.bootstrapOverlay = { showLoading: vi.fn() };
    windowStub.InfiniteRails = { renderers: { reloadActive: vi.fn() } };
    windowStub.confirm = vi.fn(() => true);
    sandbox.confirm = windowStub.confirm;
    sandbox.InfiniteRails = windowStub.InfiniteRails;
    sandbox.location = windowStub.location;

    evaluateBootRecoveryScript(sandbox);

    const recoveryApi = getRecoveryApi(windowStub, sandbox);
    expect(recoveryApi).toBeDefined();
    expect(overlayStorageButton.hidden).toBe(true);

    const storageKey = 'infinite-rails-boot-failure-count';
    const readStoredCount = () => {
      const raw = storage.__data.get(storageKey) ?? null;
      if (!raw) {
        return 0;
      }
      try {
        const parsed = JSON.parse(raw);
        return Number(parsed?.count ?? 0) || 0;
      } catch (error) {
        return 0;
      }
    };

    const triggerFailure = () => {
      bootstrapStatusUi.textContent = 'Renderer failed to initialise.';
      uiStatusItem.setAttribute('data-status', 'error');
      recoveryApi.evaluateOverlayRecoveryVisibility();
    };

    const clearFailureIndicators = () => {
      bootstrapStatusUi.textContent = 'Preparing interface…';
      uiStatusItem.setAttribute('data-status', 'pending');
      recoveryApi.evaluateOverlayRecoveryVisibility();
    };

    triggerFailure();
    expect(readStoredCount()).toBe(1);
    expect(overlayStorageButton.hidden).toBe(true);

    clearFailureIndicators();
    expect(readStoredCount()).toBe(1);

    triggerFailure();
    expect(readStoredCount()).toBe(2);
    expect(overlayStorageButton.hidden).toBe(false);
    expect(overlayActions.hidden).toBe(false);

    const preventDefault = vi.fn();
    overlayStorageButton.__clickHandler?.({ preventDefault });
    expect(preventDefault).toHaveBeenCalled();
    expect(windowStub.confirm).toHaveBeenCalledTimes(1);
    expect(storage.clear).toHaveBeenCalledTimes(1);
    expect(readStoredCount()).toBe(0);
    expect(windowStub.InfiniteRails.renderers.reloadActive).toHaveBeenCalledWith({ reason: 'local-storage-purge' });
    expect(windowStub.location.reload).not.toHaveBeenCalled();
    expect(overlayStorageButton.hidden).toBe(true);
  });

  it('suppresses the purge offer when localStorage is unavailable', () => {
    const { sandbox, windowStub, documentStub } = createBootstrapSandbox();
    const previousQuerySelector = documentStub.querySelector.getMockImplementation?.();
    const { overlayStorageButton } = setupOverlay(documentStub);
    const { bootstrapStatusUi, uiStatusItem } = setupStatusElements(documentStub, previousQuerySelector);

    Object.defineProperty(windowStub, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('storage-blocked');
      },
    });
    sandbox.localStorage = undefined;

    const MutationObserverStub = vi.fn((callback) => ({
      observe: vi.fn(),
      disconnect: vi.fn(),
      trigger: () => callback([], { }),
    }));
    windowStub.MutationObserver = MutationObserverStub;
    sandbox.MutationObserver = MutationObserverStub;

    windowStub.location.reload = vi.fn();
    windowStub.bootstrapOverlay = { showLoading: vi.fn() };
    windowStub.InfiniteRails = { renderers: { reloadActive: vi.fn() } };
    windowStub.confirm = vi.fn(() => true);
    sandbox.confirm = windowStub.confirm;
    sandbox.InfiniteRails = windowStub.InfiniteRails;
    sandbox.location = windowStub.location;

    evaluateBootRecoveryScript(sandbox);

    const recoveryApi = getRecoveryApi(windowStub, sandbox);
    expect(recoveryApi).toBeDefined();

    bootstrapStatusUi.textContent = 'Renderer failed to initialise.';
    uiStatusItem.setAttribute('data-status', 'error');
    recoveryApi.evaluateOverlayRecoveryVisibility();

    expect(overlayStorageButton.hidden).toBe(true);
  });
});
