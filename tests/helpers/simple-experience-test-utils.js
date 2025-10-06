import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';

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
  const canvas = {
    width: 512,
    height: 512,
    clientWidth: 512,
    clientHeight: 512,
    style: {},
    classList: { add: () => {}, remove: () => {}, contains: () => false },
    addEventListener: () => {},
    removeEventListener: () => {},
    setAttribute: () => {},
    focus: () => {},
    requestPointerLock: () => ({ catch: () => {} }),
    releasePointerCapture: () => {},
    setPointerCapture: () => {},
    toDataURL: () => 'data:image/png;base64,',
    getContext: (type) => {
      if (type === '2d') {
        return context2d;
      }
      if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') {
        return webglContext;
      }
      return null;
    },
  };
  canvas.contains = (target) => target === canvas;
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

  documentStub = {
    createElement: (tag) => {
      if (tag === 'canvas') {
        return createCanvasStub({ ownerDocument: documentStub });
      }
      return { getContext: () => null };
    },
    body: { classList: { contains: () => false, add: () => {}, remove: () => {} } },
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
  };

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

  Object.assign(windowStub, { THREE, THREE_GLOBAL: THREE });
  windowStub.WebGL2RenderingContext = globalThis.WebGL2RenderingContext;

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
