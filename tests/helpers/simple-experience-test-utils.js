import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';

const HTMLElementBase =
  typeof globalThis.HTMLElement === 'function' ? globalThis.HTMLElement : class HTMLElement {}
;

class HTMLElementStub extends HTMLElementBase {
  constructor(tagName = 'div') {
    super();
    this.tagName = typeof tagName === 'string' ? tagName.toUpperCase() : '';
    this.dataset = {};
    this.style = {};
    this.attributes = {};
    this.children = [];
    this.childNodes = this.children;
    this.parentElement = null;
    this.ownerDocument = null;
    this.textContent = '';
    this.classList = {
      add: () => {},
      remove: () => {},
      toggle: () => {},
      contains: () => false,
    };
  }

  appendChild(child) {
    if (!child) {
      return child;
    }
    this.children.push(child);
    child.parentElement = this;
    return child;
  }

  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index >= 0) {
      this.children.splice(index, 1);
      if (child) {
        child.parentElement = null;
      }
    }
    return child;
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
  }

  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name)
      ? this.attributes[name]
      : null;
  }

  hasAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name);
  }

  addEventListener() {}

  removeEventListener() {}

  querySelector() {
    return null;
  }

  querySelectorAll() {
    return [];
  }

  contains(target) {
    if (!target) {
      return false;
    }
    if (target === this) {
      return true;
    }
    return this.children.includes(target);
  }

  getBoundingClientRect() {
    const width = this.clientWidth ?? 0;
    const height = this.clientHeight ?? 0;
    return { top: 0, left: 0, right: width, bottom: height, width, height };
  }
}

class HTMLCanvasElementStub extends HTMLElementStub {
  constructor() {
    super('canvas');
    this.width = 512;
    this.height = 512;
    this.clientWidth = 512;
    this.clientHeight = 512;
    this.style = {};
    this.classList = {
      add: () => {},
      remove: () => {},
      toggle: () => {},
      contains: () => false,
    };
  }
}

const DefaultWebGL2RenderingContextStub = function WebGL2RenderingContextStub() {};

if (typeof globalThis.WebGL2RenderingContext !== 'function') {
  globalThis.WebGL2RenderingContext = DefaultWebGL2RenderingContextStub;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');

let simpleExperienceLoaded = false;
let documentStub = null;
let windowStub = null;

export function createCanvasStub(overrides = {}) {
  const loseContextStub = { loseContext: () => {} };
  const webglContextPrototype =
    typeof globalThis.WebGL2RenderingContext === 'function'
      ? globalThis.WebGL2RenderingContext.prototype
      : Object.prototype;
  const webglContext = Object.create(webglContextPrototype);
  webglContext.getExtension = () => loseContextStub;
  const context2d = {
    fillStyle: '#000000',
    fillRect: () => {},
    drawImage: () => {},
    clearRect: () => {},
    beginPath: () => {},
    arc: () => {},
    fill: () => {},
  };
  const canvas = new HTMLCanvasElementStub();
  canvas.addEventListener = () => {};
  canvas.removeEventListener = () => {};
  canvas.focus = () => {};
  canvas.requestPointerLock = () => ({ catch: () => {} });
  canvas.releasePointerCapture = () => {};
  canvas.setPointerCapture = () => {};
  canvas.toDataURL = () => 'data:image/png;base64,';
  canvas.contains = (target) => target === canvas || canvas.children.includes(target);
  canvas.getContext = (type) => {
    if (type === '2d') {
      return context2d;
    }
    if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') {
      return webglContext;
    }
    return null;
  };
  const ownerDocument = overrides.ownerDocument ?? documentStub;
  if (ownerDocument) {
    canvas.ownerDocument = ownerDocument;
  }
  return Object.assign(canvas, overrides);
}

function ensureTestEnvironment() {
  if (documentStub && windowStub) {
    return { documentStub, windowStub };
  }

  if (typeof globalThis.HTMLElement !== 'function') {
    globalThis.HTMLElement = HTMLElementStub;
  }
  if (typeof globalThis.Element !== 'function') {
    globalThis.Element = globalThis.HTMLElement;
  }
  if (typeof globalThis.Node !== 'function') {
    globalThis.Node = globalThis.Element;
  }
  if (typeof globalThis.HTMLCanvasElement !== 'function') {
    globalThis.HTMLCanvasElement = HTMLCanvasElementStub;
  }

  documentStub = {
    createElement: (tag) => {
      if (tag === 'canvas') {
        return createCanvasStub({ ownerDocument: documentStub });
      }
      const element = new HTMLElementStub(tag);
      element.ownerDocument = documentStub;
      return element;
    },
    createElementNS: () => {
      const element = new HTMLElementStub();
      element.ownerDocument = documentStub;
      return element;
    },
    createTextNode: (text = '') => ({ textContent: text }),
    createDocumentFragment: () => ({
      children: [],
      appendChild(child) {
        if (child) {
          this.children.push(child);
        }
        return child;
      },
    }),
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  documentStub.body = new HTMLElementStub('body');
  documentStub.body.ownerDocument = documentStub;
  documentStub.body.classList = {
    add: () => {},
    remove: () => {},
    contains: () => false,
    toggle: () => {},
  };

  documentStub.documentElement = new HTMLElementStub('html');
  documentStub.documentElement.ownerDocument = documentStub;
  documentStub.head = new HTMLElementStub('head');
  documentStub.head.ownerDocument = documentStub;

  windowStub = {
    APP_CONFIG: {},
    devicePixelRatio: 1,
    location: { search: '' },
    matchMedia: () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
    }),
    addEventListener: () => {},
    removeEventListener: () => {},
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {},
    document: documentStub,
    dispatchEvent: () => {},
    CustomEvent: class CustomEvent {
      constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail;
      }
    },
    getComputedStyle: () => ({
      zIndex: '0',
      pointerEvents: 'auto',
      display: 'block',
      visibility: 'visible',
      position: 'relative',
    }),
  };

  windowStub.Element = globalThis.Element;
  windowStub.HTMLElement = globalThis.HTMLElement;
  windowStub.HTMLCanvasElement = globalThis.HTMLCanvasElement;
  windowStub.Node = globalThis.Node;

  documentStub.defaultView = windowStub;

  Object.assign(windowStub, { THREE, THREE_GLOBAL: THREE });
  windowStub.WebGL2RenderingContext = globalThis.WebGL2RenderingContext;

  globalThis.THREE_GLOBAL = THREE;
  globalThis.THREE = THREE;

  globalThis.window = windowStub;
  globalThis.document = documentStub;
  globalThis.navigator = { geolocation: { getCurrentPosition: () => {} }, maxTouchPoints: 0 };
  globalThis.performance = { now: () => Date.now() };
  globalThis.requestAnimationFrame = windowStub.requestAnimationFrame;
  globalThis.cancelAnimationFrame = windowStub.cancelAnimationFrame;

  return { documentStub, windowStub };
}

export function ensureSimpleExperienceLoaded() {
  ensureTestEnvironment();
  if (simpleExperienceLoaded) {
    return { documentStub, windowStub };
  }

  const scriptSource = fs.readFileSync(path.join(repoRoot, 'simple-experience.js'), 'utf8');
  vm.runInThisContext(scriptSource);
  simpleExperienceLoaded = true;
  return { documentStub, windowStub };
}

export function createExperience(options = {}) {
  ensureSimpleExperienceLoaded();
  const canvas = createCanvasStub({ ownerDocument: documentStub });
  const experience = window.SimpleExperience.create({ canvas, ui: {}, ...options });
  experience.canvas = canvas;
  return { experience, canvas };
}

export function getDocumentStub() {
  ensureSimpleExperienceLoaded();
  return documentStub;
}

export function getWindowStub() {
  ensureSimpleExperienceLoaded();
  return windowStub;
}
