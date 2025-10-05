import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const scriptSource = fs.readFileSync(path.join(repoRoot, 'script.js'), 'utf8');

const ensureSimpleModeStart = scriptSource.indexOf('function ensureSimpleModeQueryParam(');
const ensureSimpleModeEnd = scriptSource.indexOf('function applyRendererReadyState', ensureSimpleModeStart);
if (ensureSimpleModeStart === -1 || ensureSimpleModeEnd === -1 || ensureSimpleModeEnd <= ensureSimpleModeStart) {
  throw new Error('Failed to locate ensureSimpleModeQueryParam definition in script.js');
}
const ensureSimpleModeSource = scriptSource.slice(ensureSimpleModeStart, ensureSimpleModeEnd);

const fallbackStart = scriptSource.indexOf('const DEFAULT_RENDERER_START_TIMEOUT_MS =');
const fallbackEnd = scriptSource.indexOf('function createScoreboardUtilsFallback', fallbackStart);
if (fallbackStart === -1 || fallbackEnd === -1 || fallbackEnd <= fallbackStart) {
  throw new Error('Failed to locate simple fallback bootstrap helpers in script.js');
}
const fallbackSource = scriptSource.slice(fallbackStart, fallbackEnd);

function instantiateFallback(scope) {
  const factory = new Function(
    'scope',
    "'use strict';" +
      'const bootstrap = scope.bootstrap;' +
      'const globalScope = scope;' +
      'const documentRef = scope.documentRef ?? scope.document ?? null;' +
      'const bootstrapOverlay = scope.bootstrapOverlay ?? { showLoading: () => {}, showError: () => {}, setDiagnostic: () => {}, setRecoveryAction: () => {} };' +
      'const isDebugModeEnabled = scope.isDebugModeEnabled ?? (() => false);' +
      'function setRendererModeIndicator(mode) {' +
      '  const doc = documentRef ?? null;' +
      '  if (doc?.documentElement?.setAttribute) {' +
      "    doc.documentElement.setAttribute('data-renderer-mode', mode);" +
      '  }' +
      '  if (doc?.body?.setAttribute) {' +
      "    doc.body.setAttribute('data-renderer-mode', mode);" +
      '  }' +
      '  scope.__INFINITE_RAILS_RENDERER_MODE__ = mode;' +
      '  scope.InfiniteRails = scope.InfiniteRails || {};' +
      '  scope.InfiniteRails.rendererMode = mode;' +
      '}' +
      ensureSimpleModeSource +
      fallbackSource +
      '\nreturn { tryStartSimpleFallback, offerMissionBriefingFallback, activateMissionBriefingFallback };'
  );
  return factory(scope);
}

function createClassList() {
  return {
    add: vi.fn(),
    remove: vi.fn(),
    contains: vi.fn(() => false),
  };
}

function appendChildImpl(node, child) {
  if (!child || child === node) {
    return child;
  }
  if (!node.children) {
    node.children = [];
  }
  if (child.parentNode && child.parentNode !== node && typeof child.parentNode.removeChild === 'function') {
    child.parentNode.removeChild(child);
  }
  node.children.push(child);
  child.parentNode = node;
  if (!child.ownerDocument && node.ownerDocument) {
    child.ownerDocument = node.ownerDocument;
  }
  return child;
}

function insertBeforeImpl(node, child, reference) {
  if (!child) {
    return child;
  }
  if (!node.children) {
    node.children = [];
  }
  const index = reference ? node.children.indexOf(reference) : -1;
  if (index >= 0) {
    node.children.splice(index, 0, child);
  } else {
    node.children.push(child);
  }
  child.parentNode = node;
  if (!child.ownerDocument && node.ownerDocument) {
    child.ownerDocument = node.ownerDocument;
  }
  return child;
}

function removeChildImpl(node, child) {
  if (!node.children) {
    return child;
  }
  const index = node.children.indexOf(child);
  if (index !== -1) {
    node.children.splice(index, 1);
    child.parentNode = null;
  }
  return child;
}

function defineChildAccessors(element) {
  Object.defineProperty(element, 'firstChild', {
    configurable: true,
    enumerable: false,
    get() {
      return Array.isArray(this.children) && this.children.length ? this.children[0] : null;
    },
  });
  Object.defineProperty(element, 'lastChild', {
    configurable: true,
    enumerable: false,
    get() {
      return Array.isArray(this.children) && this.children.length ? this.children[this.children.length - 1] : null;
    },
  });
}

function createElement(tagName, doc) {
  const element = {
    tagName: String(tagName || '').toUpperCase(),
    ownerDocument: doc ?? null,
    parentNode: null,
    children: [],
    attributes: {},
    dataset: {},
    classList: createClassList(),
    style: {},
    hidden: false,
    textContent: '',
    appendChild(child) {
      return appendChildImpl(this, child);
    },
    insertBefore(child, reference) {
      return insertBeforeImpl(this, child, reference);
    },
    removeChild(child) {
      return removeChildImpl(this, child);
    },
    remove() {
      if (this.parentNode?.removeChild) {
        this.parentNode.removeChild(this);
      }
    },
    setAttribute(name, value) {
      const key = String(name);
      this.attributes[key] = String(value);
      if (key === 'id' && this.ownerDocument?.__elementsById) {
        this.ownerDocument.__elementsById.set(String(value), this);
      }
    },
    getAttribute(name) {
      const key = String(name);
      return Object.prototype.hasOwnProperty.call(this.attributes, key) ? this.attributes[key] : null;
    },
    removeAttribute(name) {
      const key = String(name);
      if (Object.prototype.hasOwnProperty.call(this.attributes, key)) {
        const existingValue = this.attributes[key];
        delete this.attributes[key];
        if (key === 'id' && this.ownerDocument?.__elementsById && typeof existingValue !== 'undefined') {
          this.ownerDocument.__elementsById.delete(existingValue);
        }
      }
    },
    querySelector: vi.fn(() => null),
  };
  Object.defineProperty(element, 'id', {
    configurable: true,
    enumerable: true,
    get() {
      return this.attributes.id ?? '';
    },
    set(value) {
      const stringValue = String(value);
      if (this.ownerDocument?.__elementsById) {
        if (typeof this.attributes.id !== 'undefined') {
          this.ownerDocument.__elementsById.delete(this.attributes.id);
        }
        if (stringValue) {
          this.ownerDocument.__elementsById.set(stringValue, this);
        }
      }
      if (stringValue) {
        this.attributes.id = stringValue;
      } else if (typeof this.attributes.id !== 'undefined') {
        delete this.attributes.id;
      }
    },
  });
  defineChildAccessors(element);
  return element;
}

function createDocumentStub() {
  const elementsById = new Map();
  const documentStub = {
    __elementsById: elementsById,
    createElement(tag) {
      const element = createElement(tag, documentStub);
      return element;
    },
    getElementById(id) {
      return elementsById.get(String(id)) ?? null;
    },
  };

  const documentElement = createElement('html', documentStub);
  documentElement.classList = createClassList();
  documentElement.setAttribute = function setAttribute(name, value) {
    this.attributes[String(name)] = String(value);
    if (String(name) === 'id') {
      elementsById.set(String(value), this);
    }
  };
  documentStub.documentElement = documentElement;

  const body = createElement('body', documentStub);
  body.classList = createClassList();
  body.setAttribute = function setAttribute(name, value) {
    this.attributes[String(name)] = String(value);
    if (String(name) === 'id') {
      elementsById.set(String(value), this);
    }
  };
  body.appendChild = function appendChild(child) {
    return appendChildImpl(this, child);
  };
  documentStub.body = body;

  const briefing = createElement('div', documentStub);
  briefing.setAttribute('id', 'gameBriefing');
  briefing.hidden = true;

  const briefingContent = createElement('div', documentStub);
  briefingContent.classList = createClassList();
  briefing.appendChild(briefingContent);

  const eyebrow = createElement('p', documentStub);
  eyebrow.classList = createClassList();
  eyebrow.textContent = 'Mission Briefing';
  briefingContent.appendChild(eyebrow);

  const title = createElement('h2', documentStub);
  title.classList = createClassList();
  title.textContent = 'Secure the Origin Rail';
  briefingContent.appendChild(title);

  const steps = createElement('ol', documentStub);
  steps.setAttribute('id', 'gameBriefingSteps');
  briefingContent.appendChild(steps);

  briefing.querySelector = (selector) => {
    if (selector === '.game-briefing__content') {
      return briefingContent;
    }
    if (selector === '.game-briefing__eyebrow') {
      return eyebrow;
    }
    if (selector === '.game-briefing__title') {
      return title;
    }
    return null;
  };

  const dismissButton = createElement('button', documentStub);
  dismissButton.setAttribute('id', 'dismissBriefing');
  dismissButton.textContent = 'Begin the run';
  dismissButton.addEventListener = vi.fn();
  dismissButton.removeEventListener = vi.fn();

  const startButton = createElement('button', documentStub);
  startButton.setAttribute('id', 'startButton');
  startButton.textContent = 'Start Expedition';
  startButton.disabled = false;
  startButton.setAttribute('data-preloading', 'false');

  const canvas = createElement('canvas', documentStub);
  canvas.setAttribute('id', 'gameCanvas');

  elementsById.set('gameBriefing', briefing);
  elementsById.set('gameBriefingSteps', steps);
  elementsById.set('dismissBriefing', dismissButton);
  elementsById.set('startButton', startButton);
  elementsById.set('gameCanvas', canvas);

  body.appendChild(briefing);
  body.appendChild(dismissButton);
  body.appendChild(startButton);
  body.appendChild(canvas);

  documentStub.body = body;
  documentStub.documentElement = documentElement;

  return documentStub;
}

describe('mission briefing fallback', () => {
  it('activates mission briefing mode when no recovery action is available', () => {
    const documentStub = createDocumentStub();
    const overlay = {
      showLoading: vi.fn(),
      showError: vi.fn(),
      setDiagnostic: vi.fn(),
      state: { mode: 'error' },
    };
    const scope = {
      APP_CONFIG: {},
      documentRef: documentStub,
      document: documentStub,
      bootstrapOverlay: overlay,
      console: { warn: () => {}, error: () => {}, debug: () => {} },
      location: { reload: vi.fn() },
    };
    const { tryStartSimpleFallback } = instantiateFallback(scope);
    const result = tryStartSimpleFallback(new Error('missing-simple'), { reason: 'no-simple' });
    expect(result).toBe(false);
    expect(documentStub.body.attributes['data-renderer-mode']).toBe('briefing');
    expect(documentStub.documentElement.attributes['data-renderer-mode']).toBe('briefing');
    const briefing = documentStub.getElementById('gameBriefing');
    expect(briefing.hidden).toBe(false);
    expect(briefing.classList.add).toHaveBeenCalledWith('is-visible');
    const fallbackNotice = documentStub.getElementById('gameBriefingFallbackNotice');
    expect(fallbackNotice).toBeTruthy();
    expect(fallbackNotice.textContent).toContain('Renderer systems are offline');
    const startButton = documentStub.getElementById('startButton');
    expect(startButton.disabled).toBe(true);
    expect(startButton.dataset.fallbackMode).toBe('briefing');
    const canvas = documentStub.getElementById('gameCanvas');
    expect(canvas.style.display).toBe('none');
    const dismissButton = documentStub.getElementById('dismissBriefing');
    expect(dismissButton.addEventListener).toHaveBeenCalledWith('click', expect.any(Function));
    expect(dismissButton.dataset.lowFidelityBound).toBe('true');
    expect(scope.__MISSION_BRIEFING_FALLBACK_AVAILABLE__).toBe(true);
    expect(scope.__MISSION_BRIEFING_FALLBACK_ACTIVE__).toBe(true);
  });

  it('registers a recovery action that triggers the mission briefing fallback', () => {
    const documentStub = createDocumentStub();
    const overlay = {
      showLoading: vi.fn(),
      showError: vi.fn(),
      setDiagnostic: vi.fn(),
      setRecoveryAction: vi.fn(),
      hide: vi.fn(),
      state: { mode: 'error' },
    };
    const scope = {
      APP_CONFIG: {},
      documentRef: documentStub,
      document: documentStub,
      bootstrapOverlay: overlay,
      console: { warn: () => {}, error: () => {}, debug: () => {} },
      location: { reload: vi.fn() },
    };
    const { offerMissionBriefingFallback } = instantiateFallback(scope);
    const offered = offerMissionBriefingFallback({ reason: 'test-offer', context: { foo: 'bar' } });
    expect(offered).toBe(true);
    expect(scope.__MISSION_BRIEFING_FALLBACK_AVAILABLE__).toBe(true);
    expect(overlay.setRecoveryAction).toHaveBeenCalledTimes(1);
    const recoveryConfig = overlay.setRecoveryAction.mock.calls[0][0];
    expect(recoveryConfig.action).toBe('open-mission-briefing');
    expect(typeof recoveryConfig.onSelect).toBe('function');
    const briefingBefore = documentStub.getElementById('gameBriefing');
    expect(briefingBefore.hidden).toBe(true);
    recoveryConfig.onSelect();
    const briefing = documentStub.getElementById('gameBriefing');
    expect(briefing.hidden).toBe(false);
    expect(scope.__MISSION_BRIEFING_FALLBACK_ACTIVE__).toBe(true);
    expect(overlay.hide).toHaveBeenCalledWith({ force: true });
  });
});
