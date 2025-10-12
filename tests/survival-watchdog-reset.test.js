import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

function createClassList() {
  return {
    add: vi.fn(),
    remove: vi.fn(),
    contains: vi.fn(() => false),
    toggle: vi.fn(),
  };
}

function appendChildImpl(node, child) {
  if (!child || child === node) {
    return child;
  }
  node.children.push(child);
  child.parentNode = node;
  child.ownerDocument = node.ownerDocument;
  return child;
}

function insertBeforeImpl(node, child, reference) {
  if (!child) {
    return child;
  }
  const index = reference ? node.children.indexOf(reference) : -1;
  if (index >= 0) {
    node.children.splice(index, 0, child);
  } else {
    node.children.push(child);
  }
  child.parentNode = node;
  child.ownerDocument = node.ownerDocument;
  return child;
}

function removeChildImpl(node, child) {
  const index = node.children.indexOf(child);
  if (index !== -1) {
    node.children.splice(index, 1);
    child.parentNode = null;
  }
  return child;
}

function createElement(tagName, { ownerDocument } = {}) {
  const element = {
    tagName: String(tagName).toUpperCase(),
    ownerDocument: ownerDocument ?? null,
    parentNode: null,
    children: [],
    style: {
      setProperty: vi.fn(),
      removeProperty: vi.fn(),
    },
    dataset: {},
    attributes: {},
    classList: createClassList(),
    disabled: false,
    hidden: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
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
      if (key === 'id' && this.ownerDocument) {
        this.ownerDocument.__elementsById.set(String(value), this);
      }
    },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null;
    },
    removeAttribute(name) {
      const key = String(name);
      if (Object.prototype.hasOwnProperty.call(this.attributes, key)) {
        delete this.attributes[key];
      }
    },
    querySelector: vi.fn(() => null),
    querySelectorAll: vi.fn(() => []),
  };
  return element;
}

function createDocumentStub() {
  const elementsById = new Map();
  const documentStub = {
    __elementsById: elementsById,
    documentElement: createElement('html'),
    body: createElement('body'),
    createElement(tag) {
      const node = createElement(tag, { ownerDocument: documentStub });
      return node;
    },
    createTextNode: (text) => ({ textContent: text }),
    createDocumentFragment: () => ({
      children: [],
      appendChild(child) {
        this.children.push(child);
        return child;
      },
    }),
    getElementById(id) {
      return elementsById.get(String(id)) ?? null;
    },
    querySelector: vi.fn(() => null),
    querySelectorAll: vi.fn(() => []),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    visibilityState: 'visible',
  };
  documentStub.documentElement.ownerDocument = documentStub;
  documentStub.body.ownerDocument = documentStub;
  return documentStub;
}

function createSandbox() {
  const documentStub = createDocumentStub();
  const consoleStub = {
    log: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
  const startButton = createElement('button', { ownerDocument: documentStub });
  startButton.id = 'startButton';
  documentStub.__elementsById.set('startButton', startButton);
  const canvas = createElement('canvas', { ownerDocument: documentStub });
  canvas.id = 'gameCanvas';
  documentStub.__elementsById.set('gameCanvas', canvas);
  const briefing = createElement('section', { ownerDocument: documentStub });
  briefing.id = 'gameBriefing';
  documentStub.__elementsById.set('gameBriefing', briefing);

  const windowStub = {
    APP_CONFIG: {},
    devicePixelRatio: 1,
    location: { search: '', reload: vi.fn(), protocol: 'https:' },
    matchMedia: () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    requestAnimationFrame: (cb) => setTimeout(() => cb(Date.now()), 16),
    cancelAnimationFrame: (id) => clearTimeout(id),
    document: documentStub,
    navigator: { geolocation: { getCurrentPosition: vi.fn() }, maxTouchPoints: 0 },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    console: consoleStub,
    URL,
    URLSearchParams,
  };

  documentStub.defaultView = windowStub;
  windowStub.window = windowStub;
  windowStub.globalThis = windowStub;

  const sandbox = {
    console: consoleStub,
    window: windowStub,
    document: documentStub,
    globalThis: windowStub,
    navigator: windowStub.navigator,
    performance: { now: () => Date.now() },
    requestAnimationFrame: windowStub.requestAnimationFrame,
    cancelAnimationFrame: windowStub.cancelAnimationFrame,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    URL,
    URLSearchParams,
    __INFINITE_RAILS_TEST_SKIP_BOOTSTRAP__: true,
  };

  return { sandbox, windowStub, consoleStub };
}

function evaluateBootstrapScript(sandbox) {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const scriptPath = path.resolve(__dirname, '..', 'script.js');
  const source = fs.readFileSync(scriptPath, 'utf8');
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
}

function primeLocalGameplayState(windowStub, values = {}) {
  const state = windowStub.__INFINITE_RAILS_LOCAL_STATE__;
  if (!state || typeof state !== 'object') {
    throw new Error('Local gameplay state container is not initialised.');
  }
  state.player = { ...values };
  return state;
}

function snapshotState(value) {
  return JSON.parse(JSON.stringify(value));
}

describe('survival watchdog recovery', () => {
  it('resets player vitals after a simulation crash is reported', () => {
    const { sandbox, windowStub, consoleStub } = createSandbox();

    evaluateBootstrapScript(sandbox);

    const hooks = windowStub.__INFINITE_RAILS_TEST_HOOKS__;
    expect(hooks).toBeTruthy();

    const updateHud = vi.fn();
    const publishStateSnapshot = vi.fn();
    const emitGameEvent = vi.fn();
    const experience = {
      maxHealth: 16,
      health: 3,
      maxHunger: 14,
      hunger: 2,
      hungerPercent: 20,
      playerBreathCapacity: 18,
      playerBreath: 0,
      playerBreathPercent: 0,
      updateHud,
      publishStateSnapshot,
      emitGameEvent,
    };

    hooks.setActiveExperienceInstance(experience);

    windowStub.__INFINITE_RAILS_STATE__ = {
      player: {
        maxHealth: 10,
        health: 4,
        maxBreath: 12,
        breath: 6,
        breathPercent: 50,
        maxHunger: 8,
        hunger: 1,
        hungerPercent: 10,
      },
      updatedAt: 0,
    };

    const initialGlobalState = snapshotState(windowStub.__INFINITE_RAILS_STATE__);
    primeLocalGameplayState(windowStub, {
      maxHealth: 10,
      health: 4,
      maxBreath: 12,
      breath: 6,
      breathPercent: 50,
      maxHunger: 8,
      hunger: 1,
      hungerPercent: 10,
    });

    const result = hooks.triggerSurvivalWatchdog({ stage: 'simulation', reason: 'physics-crash' });

    expect(result).toBe(true);
    expect(experience.health).toBe(16);
    expect(experience.hunger).toBe(14);
    expect(experience.playerBreath).toBe(18);
    expect(experience.playerBreathPercent).toBe(100);
    expect(experience.hungerPercent).toBe(100);
    expect(updateHud).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'survival-watchdog', stage: 'simulation' }),
    );
    expect(publishStateSnapshot).toHaveBeenCalledWith('survival-watchdog');
    expect(emitGameEvent).toHaveBeenCalledWith(
      'survival-watchdog-reset',
      expect.objectContaining({ stage: 'simulation', reason: 'physics-crash', experienceUpdated: true }),
    );

    const playerState = windowStub.__INFINITE_RAILS_LOCAL_STATE__.player;
    expect(playerState.health).toBe(16);
    expect(playerState.maxHealth).toBe(16);
    expect(playerState.breath).toBe(18);
    expect(playerState.maxBreath).toBe(18);
    expect(playerState.breathPercent).toBe(100);
    expect(playerState.hunger).toBe(14);
    expect(playerState.maxHunger).toBe(14);
    expect(playerState.hungerPercent).toBe(100);
    expect(windowStub.__INFINITE_RAILS_STATE__).toEqual(initialGlobalState);
    expect(consoleStub.warn).toHaveBeenCalledWith(
      'Survival watchdog reset player vitals after crash.',
      expect.objectContaining({ stage: 'simulation', reason: 'physics-crash' }),
    );
  });

  it('restores default survival vitals when game logic crashes without maxima metadata', () => {
    const { sandbox, windowStub, consoleStub } = createSandbox();

    evaluateBootstrapScript(sandbox);

    const hooks = windowStub.__INFINITE_RAILS_TEST_HOOKS__;
    expect(hooks).toBeTruthy();

    const updateHud = vi.fn();
    const publishStateSnapshot = vi.fn();
    const emitGameEvent = vi.fn();
    const experience = {
      health: 0,
      hunger: 0,
      hungerPercent: 0,
      playerBreath: 0,
      playerBreathPercent: 0,
      updateHud,
      publishStateSnapshot,
      emitGameEvent,
    };

    hooks.setActiveExperienceInstance(experience);

    windowStub.__INFINITE_RAILS_STATE__ = {
      player: {
        health: 0,
        hunger: 0,
        hungerPercent: 0,
        breath: 0,
        breathPercent: 0,
      },
      updatedAt: 0,
    };

    const initialGlobalState = snapshotState(windowStub.__INFINITE_RAILS_STATE__);
    primeLocalGameplayState(windowStub, {
      health: 0,
      hunger: 0,
      hungerPercent: 0,
      breath: 0,
      breathPercent: 0,
    });

    const result = hooks.triggerSurvivalWatchdog({ stage: 'game-logic', reason: 'engine-crash' });

    expect(result).toBe(true);
    expect(experience.health).toBe(20);
    expect(experience.hunger).toBe(20);
    expect(experience.hungerPercent).toBe(100);
    expect(experience.playerBreath).toBe(10);
    expect(experience.playerBreathPercent).toBe(100);
    expect(updateHud).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'survival-watchdog', stage: 'game-logic' }),
    );
    expect(publishStateSnapshot).toHaveBeenCalledWith('survival-watchdog');
    expect(emitGameEvent).toHaveBeenCalledWith(
      'survival-watchdog-reset',
      expect.objectContaining({ stage: 'game-logic', reason: 'engine-crash', experienceUpdated: true }),
    );

    const playerState = windowStub.__INFINITE_RAILS_LOCAL_STATE__.player;
    expect(playerState.health).toBe(20);
    expect(playerState.maxHealth).toBe(20);
    expect(playerState.hunger).toBe(20);
    expect(playerState.maxHunger).toBe(20);
    expect(playerState.hungerPercent).toBe(100);
    expect(playerState.breath).toBe(10);
    expect(playerState.maxBreath).toBe(10);
    expect(playerState.breathPercent).toBe(100);
    expect(windowStub.__INFINITE_RAILS_STATE__).toEqual(initialGlobalState);
    expect(consoleStub.warn).toHaveBeenCalledWith(
      'Survival watchdog reset player vitals after crash.',
      expect.objectContaining({ stage: 'game-logic', reason: 'engine-crash' }),
    );
  });

  it('resets survival vitals when crash diagnostics reference game logic failures', () => {
    const { sandbox, windowStub, consoleStub } = createSandbox();

    evaluateBootstrapScript(sandbox);

    const hooks = windowStub.__INFINITE_RAILS_TEST_HOOKS__;
    expect(hooks).toBeTruthy();

    const updateHud = vi.fn();
    const publishStateSnapshot = vi.fn();
    const emitGameEvent = vi.fn();
    const experience = {
      maxHealth: 24,
      health: 4,
      maxHunger: 18,
      hunger: 3,
      hungerPercent: 20,
      playerBreathCapacity: 14,
      playerBreath: 5,
      playerBreathPercent: 35,
      updateHud,
      publishStateSnapshot,
      emitGameEvent,
    };

    hooks.setActiveExperienceInstance(experience);

    windowStub.__INFINITE_RAILS_STATE__ = {
      player: {
        health: 6,
        maxHealth: 24,
        hunger: 7,
        maxHunger: 18,
        hungerPercent: 45,
        breath: 6,
        maxBreath: 14,
        breathPercent: 50,
      },
      updatedAt: 0,
    };

    const initialGlobalState = snapshotState(windowStub.__INFINITE_RAILS_STATE__);
    primeLocalGameplayState(windowStub, {
      health: 6,
      maxHealth: 24,
      hunger: 7,
      maxHunger: 18,
      hungerPercent: 45,
      breath: 6,
      maxBreath: 14,
      breathPercent: 50,
    });

    const result = hooks.triggerSurvivalWatchdog({
      stage: 'window.error',
      reason: 'global-error',
      message: 'Game logic crashed during the survival tick.',
    });

    expect(result).toBe(true);
    expect(experience.health).toBe(24);
    expect(experience.hunger).toBe(18);
    expect(experience.hungerPercent).toBe(100);
    expect(experience.playerBreath).toBe(14);
    expect(experience.playerBreathPercent).toBe(100);
    expect(updateHud).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'survival-watchdog', stage: 'window.error' }),
    );
    expect(publishStateSnapshot).toHaveBeenCalledWith('survival-watchdog');
    expect(emitGameEvent).toHaveBeenCalledWith(
      'survival-watchdog-reset',
      expect.objectContaining({ stage: 'window.error', reason: 'global-error', experienceUpdated: true }),
    );

    const playerState = windowStub.__INFINITE_RAILS_LOCAL_STATE__.player;
    expect(playerState.health).toBe(24);
    expect(playerState.maxHealth).toBe(24);
    expect(playerState.hunger).toBe(18);
    expect(playerState.maxHunger).toBe(18);
    expect(playerState.hungerPercent).toBe(100);
    expect(playerState.breath).toBe(14);
    expect(playerState.maxBreath).toBe(14);
    expect(playerState.breathPercent).toBe(100);
    expect(windowStub.__INFINITE_RAILS_STATE__).toEqual(initialGlobalState);
    expect(consoleStub.warn).toHaveBeenCalledWith(
      'Survival watchdog reset player vitals after crash.',
      expect.objectContaining({ stage: 'window.error', reason: 'global-error' }),
    );
  });

  it('recovers survival vitals when crash diagnostics highlight physics failures', () => {
    const { sandbox, windowStub, consoleStub } = createSandbox();

    evaluateBootstrapScript(sandbox);

    const hooks = windowStub.__INFINITE_RAILS_TEST_HOOKS__;
    expect(hooks).toBeTruthy();

    const updateHud = vi.fn();
    const publishStateSnapshot = vi.fn();
    const emitGameEvent = vi.fn();
    const experience = {
      maxHealth: 26,
      health: 5,
      maxHunger: 19,
      hunger: 4,
      hungerPercent: 35,
      playerBreathCapacity: 16,
      playerBreath: 6,
      playerBreathPercent: 40,
      updateHud,
      publishStateSnapshot,
      emitGameEvent,
    };

    hooks.setActiveExperienceInstance(experience);

    windowStub.__INFINITE_RAILS_STATE__ = {
      player: {
        health: 7,
        maxHealth: 26,
        hunger: 8,
        maxHunger: 19,
        hungerPercent: 55,
        breath: 7,
        maxBreath: 16,
        breathPercent: 60,
      },
      updatedAt: 0,
    };

    const initialGlobalState = snapshotState(windowStub.__INFINITE_RAILS_STATE__);
    primeLocalGameplayState(windowStub, {
      health: 7,
      maxHealth: 26,
      hunger: 8,
      maxHunger: 19,
      hungerPercent: 55,
      breath: 7,
      maxBreath: 16,
      breathPercent: 60,
    });

    const result = hooks.triggerSurvivalWatchdog({
      stage: 'window.error',
      reason: 'global-error',
      message: 'Physics engine panic detected during survival simulation.',
    });

    expect(result).toBe(true);
    expect(experience.health).toBe(26);
    expect(experience.hunger).toBe(19);
    expect(experience.hungerPercent).toBe(100);
    expect(experience.playerBreath).toBe(16);
    expect(experience.playerBreathPercent).toBe(100);
    expect(updateHud).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'survival-watchdog', stage: 'window.error' }),
    );
    expect(publishStateSnapshot).toHaveBeenCalledWith('survival-watchdog');
    expect(emitGameEvent).toHaveBeenCalledWith(
      'survival-watchdog-reset',
      expect.objectContaining({ stage: 'window.error', reason: 'global-error', experienceUpdated: true }),
    );

    const playerState = windowStub.__INFINITE_RAILS_LOCAL_STATE__.player;
    expect(playerState.health).toBe(26);
    expect(playerState.maxHealth).toBe(26);
    expect(playerState.hunger).toBe(19);
    expect(playerState.maxHunger).toBe(19);
    expect(playerState.hungerPercent).toBe(100);
    expect(playerState.breath).toBe(16);
    expect(playerState.maxBreath).toBe(16);
    expect(playerState.breathPercent).toBe(100);
    expect(windowStub.__INFINITE_RAILS_STATE__).toEqual(initialGlobalState);
    expect(consoleStub.warn).toHaveBeenCalledWith(
      'Survival watchdog reset player vitals after crash.',
      expect.objectContaining({ stage: 'window.error', reason: 'global-error' }),
    );
  });

  it('initialises global survival state when crashes occur before state bootstrap', () => {
    const { sandbox, windowStub, consoleStub } = createSandbox();

    evaluateBootstrapScript(sandbox);

    const hooks = windowStub.__INFINITE_RAILS_TEST_HOOKS__;
    expect(hooks).toBeTruthy();

    const updateHud = vi.fn();
    const publishStateSnapshot = vi.fn();
    const emitGameEvent = vi.fn();
    const experience = {
      maxHealth: 30,
      health: 2,
      maxHunger: 28,
      hunger: 1,
      hungerPercent: 5,
      playerBreathCapacity: 12,
      playerBreath: 3,
      playerBreathPercent: 25,
      updateHud,
      publishStateSnapshot,
      emitGameEvent,
    };

    hooks.setActiveExperienceInstance(experience);

    windowStub.__INFINITE_RAILS_STATE__ = undefined;

    primeLocalGameplayState(windowStub, {
      health: 2,
      maxHealth: 30,
      hunger: 1,
      maxHunger: 28,
      hungerPercent: 5,
      breath: 3,
      maxBreath: 12,
      breathPercent: 25,
    });

    const result = hooks.triggerSurvivalWatchdog({
      stage: 'window.error',
      reason: 'global-error',
      message: 'Physics crash prevented state hydration.',
    }, { sync: true });

    expect(result).toBe(true);
    expect(updateHud).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'survival-watchdog', stage: 'window.error' }),
    );
    expect(publishStateSnapshot).toHaveBeenCalledWith('survival-watchdog');
    expect(emitGameEvent).toHaveBeenCalledWith(
      'survival-watchdog-reset',
      expect.objectContaining({ stage: 'window.error', reason: 'global-error', experienceUpdated: true }),
    );

    const state = windowStub.__INFINITE_RAILS_STATE__;
    expect(state).toBeTruthy();
    const playerState = windowStub.__INFINITE_RAILS_LOCAL_STATE__.player;
    expect(playerState.health).toBe(30);
    expect(playerState.maxHealth).toBe(30);
    expect(playerState.hunger).toBe(28);
    expect(playerState.maxHunger).toBe(28);
    expect(playerState.hungerPercent).toBe(100);
    expect(playerState.breath).toBe(12);
    expect(playerState.maxBreath).toBe(12);
    expect(playerState.breathPercent).toBe(100);
    expect(state.player).toEqual(playerState);
    expect(consoleStub.warn).toHaveBeenCalledWith(
      'Survival watchdog reset player vitals after crash.',
      expect.objectContaining({ stage: 'window.error', reason: 'global-error' }),
    );
  });

  it('normalises crash descriptors before checking survival watchdog triggers', () => {
    const { sandbox, windowStub, consoleStub } = createSandbox();

    evaluateBootstrapScript(sandbox);

    const hooks = windowStub.__INFINITE_RAILS_TEST_HOOKS__;
    expect(hooks).toBeTruthy();

    const updateHud = vi.fn();
    const publishStateSnapshot = vi.fn();
    const emitGameEvent = vi.fn();
    const experience = {
      health: 3,
      maxHealth: 16,
      hunger: 4,
      maxHunger: 16,
      hungerPercent: 20,
      playerBreath: 2,
      playerBreathCapacity: 12,
      playerBreathPercent: 15,
      updateHud,
      publishStateSnapshot,
      emitGameEvent,
    };

    hooks.setActiveExperienceInstance(experience);

    windowStub.__INFINITE_RAILS_STATE__ = {
      player: {
        health: 3,
        maxHealth: 16,
        hunger: 4,
        maxHunger: 16,
        hungerPercent: 20,
        breath: 2,
        maxBreath: 12,
        breathPercent: 15,
      },
      updatedAt: 0,
    };

    const initialGlobalState = snapshotState(windowStub.__INFINITE_RAILS_STATE__);
    primeLocalGameplayState(windowStub, {
      health: 3,
      maxHealth: 16,
      hunger: 4,
      maxHunger: 16,
      hungerPercent: 20,
      breath: 2,
      maxBreath: 12,
      breathPercent: 15,
    });

    const result = hooks.triggerSurvivalWatchdog({ stage: '  Game Logic  ', reason: 'Physics Crash ' });

    expect(result).toBe(true);
    expect(experience.health).toBe(16);
    expect(experience.hunger).toBe(16);
    expect(experience.hungerPercent).toBe(100);
    expect(experience.playerBreath).toBe(12);
    expect(experience.playerBreathPercent).toBe(100);
    expect(updateHud).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'survival-watchdog', stage: 'Game Logic' }),
    );
    expect(publishStateSnapshot).toHaveBeenCalledWith('survival-watchdog');
    expect(emitGameEvent).toHaveBeenCalledWith(
      'survival-watchdog-reset',
      expect.objectContaining({ stage: 'Game Logic', reason: 'Physics Crash', experienceUpdated: true }),
    );

    const playerState = windowStub.__INFINITE_RAILS_LOCAL_STATE__.player;
    expect(playerState.health).toBe(16);
    expect(playerState.maxHealth).toBe(16);
    expect(playerState.hunger).toBe(16);
    expect(playerState.maxHunger).toBe(16);
    expect(playerState.hungerPercent).toBe(100);
    expect(playerState.breath).toBe(12);
    expect(playerState.maxBreath).toBe(12);
    expect(playerState.breathPercent).toBe(100);
    expect(windowStub.__INFINITE_RAILS_STATE__).toEqual(initialGlobalState);
    expect(consoleStub.warn).toHaveBeenCalledWith(
      'Survival watchdog reset player vitals after crash.',
      expect.objectContaining({ stage: 'Game Logic', reason: 'Physics Crash' }),
    );
  });

  it('resets survival vitals when the experience flags a simulation renderer failure', () => {
    const { sandbox, windowStub, consoleStub } = createSandbox();

    evaluateBootstrapScript(sandbox);

    const hooks = windowStub.__INFINITE_RAILS_TEST_HOOKS__;
    expect(hooks).toBeTruthy();

    hooks.resetSurvivalWatchdogState();

    const presentRendererFailure = vi.fn();
    const updateHud = vi.fn();
    const publishStateSnapshot = vi.fn();
    const emitGameEvent = vi.fn();

    const experience = {
      presentRendererFailure,
      updateHud,
      publishStateSnapshot,
      emitGameEvent,
      maxHealth: 18,
      health: 2,
      maxHunger: 16,
      hunger: 1,
      hungerPercent: 5,
      playerBreathCapacity: 12,
      playerBreath: 3,
      playerBreathPercent: 25,
    };

    windowStub.__INFINITE_RAILS_STATE__ = {
      player: {
        maxHealth: 18,
        health: 2,
        maxHunger: 16,
        hunger: 1,
        hungerPercent: 5,
        maxBreath: 12,
        breath: 3,
        breathPercent: 25,
      },
      updatedAt: 0,
    };

    const initialGlobalState = snapshotState(windowStub.__INFINITE_RAILS_STATE__);
    primeLocalGameplayState(windowStub, {
      maxHealth: 18,
      health: 2,
      maxHunger: 16,
      hunger: 1,
      hungerPercent: 5,
      maxBreath: 12,
      breath: 3,
      breathPercent: 25,
    });

    hooks.setActiveExperienceInstance(experience);

    const wrappedFailureHandler = experience.presentRendererFailure;
    expect(wrappedFailureHandler).not.toBe(presentRendererFailure);
    expect(wrappedFailureHandler.__survivalWatchdogOriginal).toBe(presentRendererFailure);

    wrappedFailureHandler('Simulation failure', { stage: 'simulation', reason: 'physics-crash' });

    expect(presentRendererFailure).toHaveBeenCalledWith(
      'Simulation failure',
      expect.objectContaining({ stage: 'simulation', reason: 'physics-crash' }),
    );
    expect(experience.health).toBe(18);
    expect(experience.hunger).toBe(16);
    expect(experience.hungerPercent).toBe(100);
    expect(experience.playerBreath).toBe(12);
    expect(experience.playerBreathPercent).toBe(100);
    expect(updateHud).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'survival-watchdog', stage: 'simulation' }),
    );
    expect(publishStateSnapshot).toHaveBeenCalledWith('survival-watchdog');
    expect(emitGameEvent).toHaveBeenCalledWith(
      'survival-watchdog-reset',
      expect.objectContaining({ stage: 'simulation', reason: 'physics-crash', experienceUpdated: true }),
    );

    const playerState = windowStub.__INFINITE_RAILS_LOCAL_STATE__.player;
    expect(playerState.health).toBe(18);
    expect(playerState.maxHealth).toBe(18);
    expect(playerState.hunger).toBe(16);
    expect(playerState.hungerPercent).toBe(100);
    expect(playerState.breath).toBe(12);
    expect(playerState.breathPercent).toBe(100);
    expect(windowStub.__INFINITE_RAILS_STATE__).toEqual(initialGlobalState);
    expect(consoleStub.warn).toHaveBeenCalledWith(
      'Survival watchdog reset player vitals after crash.',
      expect.objectContaining({ stage: 'simulation', reason: 'physics-crash' }),
    );
  });
});
