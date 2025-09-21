import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.module.js';

const canvas = document.getElementById('gameCanvas');
const startButton = document.getElementById('startButton');
const introModal = document.getElementById('introModal');
const guideModal = document.getElementById('guideModal');
const mobileControls = document.getElementById('mobileControls');
const heartsEl = document.getElementById('hearts');
const bubblesEl = document.getElementById('bubbles');
const timeEl = document.getElementById('timeOfDay');
const dimensionInfoEl = document.getElementById('dimensionInfo');
const portalProgressEl = document.getElementById('portalProgress');
const victoryBannerEl = document.getElementById('victoryBanner');
const hotbarEl = document.getElementById('hotbar');
const extendedInventoryEl = document.getElementById('extendedInventory');
const toggleExtendedBtn = document.getElementById('toggleExtended');
const craftQueueEl = document.getElementById('craftQueue');
const craftTargetEl = document.getElementById('craftTarget');
const craftButton = document.getElementById('craftButton');
const clearCraftButton = document.getElementById('clearCraft');
const recipeListEl = document.getElementById('recipeList');
const recipeSearchEl = document.getElementById('recipeSearch');
const eventLogEl = document.getElementById('eventLog');
const codexListEl = document.getElementById('dimensionCodex');
const openGuideButton = document.getElementById('openGuide');
const portalProgressLabel = portalProgressEl.querySelector('.label');
const portalProgressBar = portalProgressEl.querySelector('.bar');
const headerUserNameEl = document.getElementById('headerUserName');
const headerUserLocationEl = document.getElementById('headerUserLocation');
const userNameDisplayEl = document.getElementById('userNameDisplay');
const userLocationDisplayEl = document.getElementById('userLocationDisplay');
const userDeviceDisplayEl = document.getElementById('userDeviceDisplay');
const googleButtonContainer = document.getElementById('googleButtonContainer');
const googleFallbackSignIn = document.getElementById('googleFallbackSignIn');
const googleSignOutButton = document.getElementById('googleSignOut');
const scoreboardSection = document.getElementById('scoreboardSection');
const scoreboardListEl = document.getElementById('scoreboardList');
const scoreboardStatusEl = document.getElementById('scoreboardStatus');
const refreshScoresButton = document.getElementById('refreshScores');
const playerHintEl = document.getElementById('playerHint');
const mainLayoutEl = document.querySelector('.main-layout');
const primaryPanelEl = document.querySelector('.primary-panel');
const topBarEl = document.querySelector('.top-bar');
const footerEl = document.querySelector('.footer');
const toggleSidebarButton = document.getElementById('toggleSidebar');
const sidePanelEl = document.getElementById('sidePanel');
const sidePanelScrim = document.getElementById('sidePanelScrim');
const rootElement = document.documentElement;
const computedVars = getComputedStyle(rootElement);
const readVar = (name, fallback) => {
  const value = computedVars.getPropertyValue(name);
  return value ? value.trim() : fallback;
};
const BASE_THEME = {
  accent: readVar('--accent', '#49f2ff'),
  accentStrong: readVar('--accent-strong', '#f7b733'),
  accentSoft: readVar('--accent-soft', 'rgba(73, 242, 255, 0.3)'),
  bgPrimary: readVar('--bg-primary', '#050912'),
  bgSecondary: readVar('--bg-secondary', '#0d182f'),
  bgTertiary: readVar('--bg-tertiary', 'rgba(21, 40, 72, 0.85)'),
  pageBackground:
    readVar(
      '--page-background',
      'radial-gradient(circle at 20% 20%, rgba(73, 242, 255, 0.2), transparent 45%), radial-gradient(circle at 80% 10%, rgba(247, 183, 51, 0.2), transparent 55%), linear-gradient(160deg, #050912, #0b1230 60%, #05131f 100%)'
    ),
  dimensionGlow: readVar('--dimension-glow', 'rgba(73, 242, 255, 0.45)'),
};

const appConfig = {
  apiBaseUrl: window.APP_CONFIG?.apiBaseUrl ?? null,
  googleClientId: window.APP_CONFIG?.googleClientId ?? null,
};

const TILE_UNIT = 1;
const BASE_GEOMETRY = new THREE.BoxGeometry(TILE_UNIT, TILE_UNIT, TILE_UNIT);
const PLANE_GEOMETRY = new THREE.PlaneGeometry(TILE_UNIT, TILE_UNIT);
const PORTAL_PLANE_GEOMETRY = new THREE.PlaneGeometry(TILE_UNIT * 0.92, TILE_UNIT * 1.5);
const CRYSTAL_GEOMETRY = new THREE.OctahedronGeometry(TILE_UNIT * 0.22);

let renderer;
let scene;
let camera;
let worldGroup;
let entityGroup;
let playerMesh;
let playerMeshParts;
let tileRenderState = [];
const zombieMeshes = [];
const ironGolemMeshes = [];
let playerLocator;
let playerHintTimer = null;
let lastDimensionHintKey = null;

playerHintEl?.addEventListener('click', hidePlayerHint);
playerHintEl?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    hidePlayerHint();
  }
});

const orbitState = {
  azimuth: -Math.PI / 4,
  polar: Math.PI / 3,
  radius: 18,
  target: new THREE.Vector3(),
};

const baseMaterialCache = new Map();
const accentMaterialCache = new Map();

const identityState = {
  googleProfile: null,
  displayName: null,
  location: null,
  device: null,
  scoreboard: [],
  scoreboardSource: 'remote',
  loadingScores: false,
  googleInitialized: false,
};

const SCOREBOARD_STORAGE_KEY = 'infinite-dimension-scoreboard';
const PROFILE_STORAGE_KEY = 'infinite-dimension-profile';
const LOCAL_PROFILE_ID_KEY = 'infinite-dimension-local-id';

function getBaseMaterial(color) {
  if (!baseMaterialCache.has(color)) {
    baseMaterialCache.set(
      color,
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(color),
        roughness: 0.85,
        metalness: 0.05,
      })
    );
  }
  return baseMaterialCache.get(color);
}

function getAccentMaterial(color, opacity = 0.75) {
  const key = `${color}-${opacity}`;
  if (!accentMaterialCache.has(key)) {
    accentMaterialCache.set(
      key,
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(color),
        roughness: 0.6,
        metalness: 0.15,
        transparent: true,
        opacity,
        emissive: new THREE.Color(color).multiplyScalar(0.2),
        emissiveIntensity: 0.3,
        side: THREE.DoubleSide,
      })
    );
  }
  return accentMaterialCache.get(key);
}

function worldToScene(x, y) {
  return {
    x: (x - state.width / 2) * TILE_UNIT + TILE_UNIT / 2,
    z: (y - state.height / 2) * TILE_UNIT + TILE_UNIT / 2,
  };
}

function updateLayoutMetrics() {
  if (!primaryPanelEl || !mainLayoutEl) return;
  const mainStyles = getComputedStyle(mainLayoutEl);
  const paddingTop = parseFloat(mainStyles.paddingTop) || 0;
  const paddingBottom = parseFloat(mainStyles.paddingBottom) || 0;
  const headerHeight = topBarEl?.offsetHeight ?? 0;
  const footerHeight = footerEl?.offsetHeight ?? 0;
  const availableHeight = window.innerHeight - headerHeight - footerHeight - paddingTop - paddingBottom;
  if (availableHeight > 320) {
    primaryPanelEl.style.setProperty('--primary-panel-min-height', `${availableHeight}px`);
  } else {
    primaryPanelEl.style.removeProperty('--primary-panel-min-height');
  }
}

function syncSidebarForViewport() {
  if (!sidePanelEl) return;
  const isMobile = window.innerWidth <= 860;
  if (!isMobile) {
    sidePanelEl.classList.remove('open');
    sidePanelEl.removeAttribute('aria-hidden');
    document.body.classList.remove('sidebar-open');
    toggleSidebarButton?.setAttribute('aria-expanded', 'false');
    if (sidePanelScrim) sidePanelScrim.hidden = true;
    return;
  }
  if (sidePanelEl.classList.contains('open')) {
    sidePanelEl.setAttribute('aria-hidden', 'false');
    if (sidePanelScrim) sidePanelScrim.hidden = false;
  } else {
    sidePanelEl.setAttribute('aria-hidden', 'true');
    if (sidePanelScrim) sidePanelScrim.hidden = true;
  }
}

function openSidebar() {
  if (!sidePanelEl) return;
  sidePanelEl.classList.add('open');
  sidePanelEl.setAttribute('aria-hidden', 'false');
  document.body.classList.add('sidebar-open');
  toggleSidebarButton?.setAttribute('aria-expanded', 'true');
  if (sidePanelScrim) sidePanelScrim.hidden = false;
  if (typeof sidePanelEl.focus === 'function') {
    sidePanelEl.focus();
  }
}

function closeSidebar(shouldFocusToggle = false) {
  if (!sidePanelEl) return;
  sidePanelEl.classList.remove('open');
  if (window.innerWidth <= 860) {
    sidePanelEl.setAttribute('aria-hidden', 'true');
  } else {
    sidePanelEl.removeAttribute('aria-hidden');
  }
  document.body.classList.remove('sidebar-open');
  toggleSidebarButton?.setAttribute('aria-expanded', 'false');
  if (sidePanelScrim) sidePanelScrim.hidden = true;
  if (shouldFocusToggle) toggleSidebarButton?.focus();
}

function toggleSidebar() {
  if (!sidePanelEl) return;
  if (sidePanelEl.classList.contains('open')) {
    closeSidebar(true);
  } else {
    openSidebar();
  }
}

function hidePlayerHint() {
  if (!playerHintEl) return;
  if (playerHintTimer) {
    clearTimeout(playerHintTimer);
    playerHintTimer = null;
  }
  playerHintEl.classList.remove('visible');
}

function showPlayerHint(message, options = {}) {
  if (!playerHintEl || !message) return;
  if (playerHintTimer) {
    clearTimeout(playerHintTimer);
    playerHintTimer = null;
  }
  playerHintEl.textContent = message;
  playerHintEl.classList.add('visible');
  const duration = Number.isFinite(options.duration) ? Number(options.duration) : 5600;
  if (!options.persist) {
    playerHintTimer = window.setTimeout(() => {
      hidePlayerHint();
    }, Math.max(1000, duration));
  }
}

function handleResize() {
  updateLayoutMetrics();
  syncSidebarForViewport();
  if (!renderer || !camera) return;
  const width = canvas.clientWidth || canvas.width || 1;
  const height = canvas.clientHeight || canvas.height || 1;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  updateCameraOrbit();
}

function updateCameraOrbit() {
  const { azimuth, polar, radius, target } = orbitState;
  const sinPolar = Math.sin(polar);
  camera.position.x = target.x + radius * sinPolar * Math.cos(azimuth);
  camera.position.y = target.y + radius * Math.cos(polar);
  camera.position.z = target.z + radius * sinPolar * Math.sin(azimuth);
  camera.lookAt(target);
}

function initPointerControls() {
  const pointer = { active: false, id: null, lastX: 0, lastY: 0 };
  canvas.style.cursor = 'grab';

  canvas.addEventListener('pointerdown', (event) => {
    pointer.active = true;
    pointer.id = event.pointerId;
    pointer.lastX = event.clientX;
    pointer.lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
    canvas.style.cursor = 'grabbing';
  });

  canvas.addEventListener('pointermove', (event) => {
    if (!pointer.active) return;
    const dx = event.clientX - pointer.lastX;
    const dy = event.clientY - pointer.lastY;
    pointer.lastX = event.clientX;
    pointer.lastY = event.clientY;
    orbitState.azimuth -= dx * 0.005;
    orbitState.polar = clamp(orbitState.polar - dy * 0.005, 0.35, Math.PI / 2.05);
    updateCameraOrbit();
  });

  const stopPointer = (event) => {
    if (pointer.id !== null) {
      canvas.releasePointerCapture(pointer.id);
    }
    pointer.active = false;
    pointer.id = null;
    canvas.style.cursor = 'grab';
  };

  canvas.addEventListener('pointerup', stopPointer);
  canvas.addEventListener('pointerleave', stopPointer);

  canvas.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      orbitState.radius = clamp(orbitState.radius + event.deltaY * 0.01, 6, 45);
      updateCameraOrbit();
    },
    { passive: false }
  );
}

function initRenderer() {
  if (renderer) return;
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio ?? 1);
  handleResize();

  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2('#0b1324', 0.055);

  camera = new THREE.PerspectiveCamera(55, (canvas.clientWidth || canvas.width) / (canvas.clientHeight || canvas.height), 0.1, 1000);

  worldGroup = new THREE.Group();
  entityGroup = new THREE.Group();
  scene.add(worldGroup);
  scene.add(entityGroup);

  const hemiLight = new THREE.HemisphereLight(0xbcd7ff, 0x0b1324, 1.05);
  scene.add(hemiLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
  dirLight.position.set(6, 14, 10);
  scene.add(dirLight);

  initPointerControls();
  window.addEventListener('resize', handleResize);
  updateWorldTarget();
  createPlayerMesh();
  createPlayerLocator();
}

function updateWorldTarget() {
  const offsetX = ((state.width - 1) * TILE_UNIT) / 2;
  const offsetZ = ((state.height - 1) * TILE_UNIT) / 2;
  const surface = tileSurfaceHeight(state.player.x, state.player.y) || 0;
  orbitState.target.set(offsetX, surface + 0.75, offsetZ);

  const diagonal = Math.max(1, Math.hypot(state.width, state.height));
  const minRadius = Math.max(6.5, diagonal * 0.6);
  const maxRadius = Math.max(minRadius, diagonal * 1.05);
  const idealRadius = clamp(diagonal * 0.72, minRadius, maxRadius);
  orbitState.radius = idealRadius;
  orbitState.polar = clamp(orbitState.polar ?? Math.PI / 3, 0.9, 1.2);
  updateCameraOrbit();
}

function resetWorldMeshes() {
  tileRenderState = [];
  if (!worldGroup) return;
  while (worldGroup.children.length) {
    worldGroup.remove(worldGroup.children[0]);
  }
}

function ensureTileGroups() {
  if (!worldGroup) return;
  if (tileRenderState.length === state.height && tileRenderState[0]?.length === state.width) return;
  resetWorldMeshes();
  for (let y = 0; y < state.height; y++) {
    tileRenderState[y] = [];
    for (let x = 0; x < state.width; x++) {
      const group = new THREE.Group();
      const { x: sx, z: sz } = worldToScene(x, y);
      group.position.set(sx, 0, sz);
      worldGroup.add(group);
      tileRenderState[y][x] = {
        group,
        signature: null,
        animations: {},
      };
    }
  }
}

function addBlock(group, options) {
  const {
    color = '#ffffff',
    height = 1,
    width = 1,
    depth = 1,
    y = height / 2,
    geometry = BASE_GEOMETRY,
    material = null,
    transparent = false,
    opacity = 1,
    emissive,
    emissiveIntensity = 0,
    roughness = 0.85,
    metalness = 0.05,
    doubleSide = false,
  } = options;
  const mat =
    material ??
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      roughness,
      metalness,
      transparent,
      opacity,
      side: doubleSide ? THREE.DoubleSide : THREE.FrontSide,
      emissive: emissive ? new THREE.Color(emissive) : undefined,
      emissiveIntensity,
    });
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.scale.set(width, height, depth);
  mesh.position.y = y;
  group.add(mesh);
  return mesh;
}

function addTopPlate(group, color, height, opacity = 0.72) {
  const plate = new THREE.Mesh(PLANE_GEOMETRY, getAccentMaterial(color, opacity));
  plate.rotation.x = -Math.PI / 2;
  plate.position.y = height + 0.01;
  group.add(plate);
  return plate;
}

function getTileSignature(tile) {
  if (!tile) return 'void';
  const entries = tile.data
    ? Object.entries(tile.data)
        .map(([key, value]) => `${key}:${typeof value === 'object' ? JSON.stringify(value) : value}`)
        .sort()
        .join('|')
    : '';
  return `${tile.type}|${tile.resource ?? ''}|${tile.hazard ? 1 : 0}|${entries}`;
}

function getTileHeight(tile) {
  switch (tile?.type) {
    case 'void':
      return 0;
    case 'water':
    case 'lava':
      return 0.28;
    case 'tar':
      return 0.55;
    case 'rail':
      return 0.35;
    case 'railVoid':
      return 0.12;
    case 'portal':
    case 'portalDormant':
      return 0.2;
    default:
      return 1;
  }
}

function rebuildTileGroup(renderInfo, tile) {
  const { group } = renderInfo;
  while (group.children.length) {
    group.remove(group.children[0]);
  }
  renderInfo.animations = {};

  if (!tile || tile.type === 'void') {
    group.visible = false;
    return;
  }

  group.visible = true;
  const def = TILE_TYPES[tile.type] ?? TILE_TYPES.grass;
  const baseColor = def.base ?? '#1c1f2d';
  const accentColor = def.accent ?? '#49f2ff';
  const height = getTileHeight(tile);

  switch (tile.type) {
    case 'water': {
      addBlock(group, {
        color: new THREE.Color(baseColor).lerp(new THREE.Color(accentColor), 0.5),
        height,
        transparent: true,
        opacity: 0.82,
        emissive: accentColor,
        emissiveIntensity: 0.08,
      });
      addTopPlate(group, accentColor, height, 0.35);
      break;
    }
    case 'lava': {
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(baseColor).lerp(new THREE.Color(accentColor), 0.35),
        roughness: 0.35,
        metalness: 0.25,
        emissive: new THREE.Color(accentColor),
        emissiveIntensity: 1.1,
        transparent: true,
        opacity: 0.88,
      });
      addBlock(group, { height, material: mat });
      break;
    }
    case 'tar': {
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(baseColor),
        roughness: 0.2,
        metalness: 0.5,
        emissive: new THREE.Color(accentColor).multiplyScalar(0.15),
        emissiveIntensity: 0.2,
      });
      addBlock(group, { height, material: mat });
      addTopPlate(group, accentColor, height, 0.45);
      break;
    }
    case 'rail': {
      const base = addBlock(group, {
        height,
        material: getBaseMaterial(baseColor),
      });
      base.receiveShadow = true;
      const railMaterial = new THREE.MeshStandardMaterial({
        color: new THREE.Color(accentColor),
        emissive: new THREE.Color(accentColor),
        emissiveIntensity: 0.12,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide,
      });
      const railPlate = new THREE.Mesh(PLANE_GEOMETRY, railMaterial);
      railPlate.rotation.x = -Math.PI / 2;
      railPlate.position.y = height + 0.02;
      group.add(railPlate);
      renderInfo.animations.railGlow = railMaterial;
      break;
    }
    case 'railVoid': {
      addBlock(group, {
        height,
        material: getBaseMaterial('#050912'),
      });
      break;
    }
    case 'tree': {
      addBlock(group, { material: getBaseMaterial(TILE_TYPES.grass.base), height: 0.9 });
      addTopPlate(group, TILE_TYPES.grass.accent, 0.9, 0.5);
      addBlock(group, {
        color: '#4f3418',
        width: 0.28,
        depth: 0.28,
        height: 1.4,
        y: 0.9 + 0.7,
      });
      addBlock(group, {
        color: accentColor,
        width: 1.1,
        depth: 1.1,
        height: 1.1,
        y: 0.9 + 1.4,
      });
      break;
    }
    case 'chest': {
      addBlock(group, { material: getBaseMaterial(baseColor), height: 0.8 });
      const lid = addBlock(group, {
        color: new THREE.Color(accentColor).lerp(new THREE.Color(baseColor), 0.4),
        height: 0.3,
        y: 0.8 + 0.15,
      });
      lid.material.metalness = 0.35;
      break;
    }
    case 'portalFrame': {
      const column = addBlock(group, {
        color: baseColor,
        height: 1.4,
        width: 0.9,
        depth: 0.9,
        y: 0.7,
        roughness: 0.4,
        metalness: 0.4,
      });
      column.material.emissive = new THREE.Color(accentColor);
      column.material.emissiveIntensity = 0.3;
      addTopPlate(group, accentColor, 1.4, 0.4);
      break;
    }
    case 'portal':
    case 'portalDormant': {
      addBlock(group, {
        color: new THREE.Color(baseColor).lerp(new THREE.Color('#1a1f39'), 0.4),
        height,
        roughness: 0.45,
        metalness: 0.35,
      });
      const intensity = tile.type === 'portal' ? 0.9 : 0.35;
      const opacity = tile.type === 'portal' ? 0.8 : 0.5;
      const planeMaterial = new THREE.MeshStandardMaterial({
        color: new THREE.Color(accentColor),
        emissive: new THREE.Color(accentColor),
        emissiveIntensity: intensity,
        transparent: true,
        opacity,
        side: THREE.DoubleSide,
      });
      const plane = new THREE.Mesh(PORTAL_PLANE_GEOMETRY, planeMaterial);
      plane.position.y = height + 0.85;
      group.add(plane);
      const planeB = new THREE.Mesh(PORTAL_PLANE_GEOMETRY, planeMaterial.clone());
      planeB.position.y = height + 0.85;
      planeB.rotation.y = Math.PI / 2;
      group.add(planeB);
      renderInfo.animations.portalMaterials = [plane.material, planeB.material];
      break;
    }
    case 'crystal': {
      addBlock(group, { color: baseColor, height: 0.9 });
      addTopPlate(group, accentColor, 0.9, 0.35);
      const crystal = addBlock(group, {
        geometry: CRYSTAL_GEOMETRY,
        color: accentColor,
        height: 1,
        width: 1,
        depth: 1,
        y: 1.2,
        emissive: accentColor,
        emissiveIntensity: 0.4,
        roughness: 0.3,
        metalness: 0.6,
      });
      crystal.rotation.y = Math.PI / 4;
      break;
    }
    default: {
      const baseBlock = addBlock(group, { height, material: getBaseMaterial(baseColor) });
      baseBlock.receiveShadow = true;
      if (tile.type !== 'marbleEcho' && tile.type !== 'marble') {
        addTopPlate(group, accentColor, height);
      } else {
        addTopPlate(group, accentColor, height, tile.type === 'marble' ? 0.6 : 0.45);
      }
      break;
    }
  }

  if (tile.resource && tile.type !== 'tree') {
    const resourceGem = addBlock(group, {
      geometry: CRYSTAL_GEOMETRY,
      color: accentColor,
      height: 1,
      width: 1,
      depth: 1,
      y: getTileHeight(tile) + 0.75,
      emissive: accentColor,
      emissiveIntensity: 0.4,
      roughness: 0.25,
      metalness: 0.5,
    });
    resourceGem.rotation.y = Math.PI / 4;
    renderInfo.animations.resourceGem = resourceGem;
  }
}

function updateTileVisual(tile, renderInfo) {
  if (!tile || tile.type === 'void') return;
  if (renderInfo.animations.portalMaterials) {
    renderInfo.animations.portalMaterials.forEach((material) => {
      material.emissiveIntensity = tile.type === 'portal' ? 0.9 + 0.25 * Math.sin(state.elapsed * 3) : 0.35 + 0.2 * Math.sin(state.elapsed * 2);
      material.opacity = tile.type === 'portal' ? 0.75 : 0.5;
    });
  }
  if (renderInfo.animations.railGlow) {
    const active = state.railPhase === (tile.data?.phase ?? 0);
    renderInfo.animations.railGlow.emissiveIntensity = active ? 0.65 : 0.1;
    renderInfo.animations.railGlow.opacity = active ? 0.68 : 0.25;
  }
  if (renderInfo.animations.resourceGem) {
    renderInfo.animations.resourceGem.rotation.y += 0.01;
  }
}

function updateWorldMeshes() {
  ensureTileGroups();
  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      const tile = state.world?.[y]?.[x];
      const renderInfo = tileRenderState?.[y]?.[x];
      if (!renderInfo) continue;
      const signature = getTileSignature(tile);
      if (renderInfo.signature !== signature) {
        rebuildTileGroup(renderInfo, tile);
        renderInfo.signature = signature;
      }
      if (tile) {
        updateTileVisual(tile, renderInfo);
      }
    }
  }
}

function createPlayerMesh() {
  if (!entityGroup) return;
  if (playerMesh) {
    entityGroup.remove(playerMesh);
  }
  playerMeshParts = null;
  const colors = {
    skin: '#c58e64',
    shirt: '#3aa7c9',
    shirtHighlight: '#6fd4e0',
    pants: '#2b3b90',
    boots: '#1a243c',
    hair: '#3a2a1b',
    eye: '#1f3554',
    eyeHighlight: '#cdeaff',
    beard: '#8f5f3a',
  };
  const group = new THREE.Group();
  group.name = 'player-avatar';

  const legHeight = 0.58;
  const torsoHeight = 0.72;
  const headHeight = 0.5;
  const faceZ = 0.26;

  const hipsY = legHeight;
  const shoulderY = legHeight + torsoHeight;

  const buildLeg = (offsetX) => {
    const leg = new THREE.Group();
    leg.position.set(offsetX, hipsY, 0);
    addBlock(leg, {
      color: colors.pants,
      width: 0.26,
      depth: 0.34,
      height: legHeight,
      y: -legHeight / 2,
    });
    const boot = addBlock(leg, {
      color: colors.boots,
      width: 0.26,
      depth: 0.34,
      height: 0.16,
      y: -legHeight + 0.08,
    });
    boot.material.roughness = 0.5;
    return leg;
  };

  const leftLeg = buildLeg(-0.18);
  const rightLeg = buildLeg(0.18);
  group.add(leftLeg);
  group.add(rightLeg);

  const torso = addBlock(group, {
    color: colors.shirt,
    width: 0.7,
    depth: 0.38,
    height: torsoHeight,
    y: hipsY + torsoHeight / 2,
  });
  torso.material.roughness = 0.5;

  const shirtHighlight = addBlock(group, {
    color: colors.shirtHighlight,
    width: 0.32,
    depth: 0.04,
    height: 0.24,
    y: shoulderY - 0.14,
  });
  shirtHighlight.position.z = 0.2;

  const belt = addBlock(group, {
    color: '#1f273a',
    width: 0.72,
    depth: 0.39,
    height: 0.12,
    y: hipsY + 0.06,
  });
  belt.material.metalness = 0.1;

  const buildArm = (offsetX) => {
    const arm = new THREE.Group();
    arm.position.set(offsetX, shoulderY, 0);
    addBlock(arm, {
      color: colors.shirt,
      width: 0.22,
      depth: 0.28,
      height: 0.52,
      y: -0.26,
    });
    addBlock(arm, {
      color: colors.skin,
      width: 0.22,
      depth: 0.28,
      height: 0.22,
      y: -0.62,
    });
    return arm;
  };

  const leftArm = buildArm(-0.46);
  const rightArm = buildArm(0.46);
  group.add(leftArm);
  group.add(rightArm);

  addBlock(group, {
    color: colors.skin,
    width: 0.24,
    depth: 0.28,
    height: 0.14,
    y: shoulderY + 0.07,
  });

  const headGroup = new THREE.Group();
  headGroup.position.set(0, shoulderY + 0.14, 0);
  const head = addBlock(headGroup, {
    color: colors.skin,
    width: 0.52,
    depth: 0.5,
    height: headHeight,
    y: headHeight / 2,
  });
  head.material.roughness = 0.6;

  const hair = addBlock(headGroup, {
    color: colors.hair,
    width: 0.54,
    depth: 0.52,
    height: 0.2,
    y: headHeight + 0.1,
  });
  hair.position.z = -0.02;

  const fringe = addBlock(headGroup, {
    color: colors.hair,
    width: 0.5,
    depth: 0.08,
    height: 0.22,
    y: headHeight * 0.92,
  });
  fringe.position.z = faceZ - 0.18;

  const eyeMaterial = new THREE.MeshBasicMaterial({ color: colors.eye });
  const eyeGeometry = new THREE.PlaneGeometry(0.09, 0.12);
  const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
  leftEye.position.set(-0.12, headHeight * 0.65, faceZ);
  headGroup.add(leftEye);

  const rightEye = leftEye.clone();
  rightEye.position.x = 0.12;
  headGroup.add(rightEye);

  const eyeShineMaterial = new THREE.MeshBasicMaterial({ color: colors.eyeHighlight });
  const eyeShineGeometry = new THREE.PlaneGeometry(0.04, 0.05);
  const leftShine = new THREE.Mesh(eyeShineGeometry, eyeShineMaterial);
  leftShine.position.set(-0.14, headHeight * 0.72, faceZ + 0.002);
  headGroup.add(leftShine);
  const rightShine = leftShine.clone();
  rightShine.position.x = 0.1;
  headGroup.add(rightShine);

  const nose = addBlock(headGroup, {
    color: colors.skin,
    width: 0.12,
    depth: 0.12,
    height: 0.16,
    y: headHeight * 0.55,
  });
  nose.position.z = faceZ + 0.04;

  const beard = addBlock(headGroup, {
    color: colors.beard,
    width: 0.44,
    depth: 0.06,
    height: 0.2,
    y: headHeight * 0.38,
  });
  beard.position.z = faceZ - 0.02;

  group.add(headGroup);

  entityGroup.add(group);
  playerMesh = group;
  playerMeshParts = {
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    head: headGroup,
  };
}

function createPlayerLocator() {
  if (!entityGroup) return;
  if (playerLocator) {
    entityGroup.remove(playerLocator);
    playerLocator.geometry?.dispose?.();
    playerLocator.material?.dispose?.();
  }
  const geometry = new THREE.RingGeometry(0.55, 0.82, 48);
  const material = new THREE.MeshBasicMaterial({
    color: new THREE.Color(BASE_THEME.accent),
    transparent: true,
    opacity: 0.6,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  playerLocator = new THREE.Mesh(geometry, material);
  playerLocator.rotation.x = -Math.PI / 2;
  playerLocator.renderOrder = 2;
  entityGroup.add(playerLocator);
}

function ensureZombieMeshCount(count) {
  while (zombieMeshes.length < count) {
    const zombie = new THREE.Group();
    zombie.name = 'minecraft-zombie';
    const colors = {
      skin: '#6cc26e',
      shirt: '#2f70af',
      pants: '#2f3b6a',
      eye: '#d34848',
    };

    const legHeight = 0.55;
    const torsoHeight = 0.7;
    const headHeight = 0.45;
    const hipsY = legHeight;
    const shoulderY = legHeight + torsoHeight;

    const buildLeg = (offsetX) => {
      const leg = new THREE.Group();
      leg.position.set(offsetX, hipsY, 0);
      addBlock(leg, {
        color: colors.pants,
        width: 0.28,
        depth: 0.34,
        height: legHeight,
        y: -legHeight / 2,
      });
      return leg;
    };

    zombie.add(buildLeg(-0.18));
    zombie.add(buildLeg(0.18));

    addBlock(zombie, {
      color: colors.shirt,
      width: 0.68,
      depth: 0.36,
      height: torsoHeight,
      y: hipsY + torsoHeight / 2,
    });

    const buildArm = (offsetX) => {
      const arm = new THREE.Group();
      arm.position.set(offsetX, shoulderY, 0);
      addBlock(arm, {
        color: colors.shirt,
        width: 0.2,
        depth: 0.3,
        height: 0.52,
        y: -0.26,
      });
      addBlock(arm, {
        color: colors.skin,
        width: 0.2,
        depth: 0.3,
        height: 0.2,
        y: -0.62,
      });
      return arm;
    };

    zombie.add(buildArm(-0.46));
    zombie.add(buildArm(0.46));

    const headGroup = new THREE.Group();
    headGroup.position.set(0, shoulderY + 0.05, 0);
    const head = addBlock(headGroup, {
      color: colors.skin,
      width: 0.5,
      depth: 0.48,
      height: headHeight,
      y: headHeight / 2,
    });
    head.material.roughness = 0.5;

    const eyeMaterial = new THREE.MeshBasicMaterial({ color: colors.eye });
    const eyeGeometry = new THREE.PlaneGeometry(0.08, 0.1);
    const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    leftEye.position.set(-0.12, headHeight * 0.65, 0.22);
    headGroup.add(leftEye);
    const rightEye = leftEye.clone();
    rightEye.position.x = 0.12;
    headGroup.add(rightEye);

    const brow = addBlock(headGroup, {
      color: '#3c8b45',
      width: 0.52,
      depth: 0.08,
      height: 0.12,
      y: headHeight * 0.78,
    });
    brow.position.z = 0.2;

    zombie.add(headGroup);
    entityGroup.add(zombie);
    zombieMeshes.push(zombie);
  }
  while (zombieMeshes.length > count) {
    const zombie = zombieMeshes.pop();
    entityGroup.remove(zombie);
  }
}

function ensureIronGolemMeshCount(count) {
  while (ironGolemMeshes.length < count) {
    const golem = new THREE.Group();
    golem.name = 'iron-golem';
    const colors = {
      body: '#d8d2c8',
      accent: '#b49a8a',
      vines: '#6a9b54',
      eye: '#d75757',
    };

    const legHeight = 0.7;
    const torsoHeight = 0.9;
    const headHeight = 0.36;
    const hipsY = legHeight;
    const shoulderY = legHeight + torsoHeight;

    const buildLeg = (offsetX) => {
      const leg = new THREE.Group();
      leg.position.set(offsetX, hipsY, 0);
      addBlock(leg, {
        color: colors.body,
        width: 0.34,
        depth: 0.42,
        height: legHeight,
        y: -legHeight / 2,
      });
      addBlock(leg, {
        color: colors.accent,
        width: 0.36,
        depth: 0.46,
        height: 0.18,
        y: -legHeight + 0.09,
      });
      return leg;
    };

    golem.add(buildLeg(-0.26));
    golem.add(buildLeg(0.26));

    const torso = addBlock(golem, {
      color: colors.body,
      width: 0.98,
      depth: 0.6,
      height: torsoHeight,
      y: hipsY + torsoHeight / 2,
    });
    torso.material.roughness = 0.7;

    const chestPlate = addBlock(golem, {
      color: colors.accent,
      width: 0.9,
      depth: 0.16,
      height: 0.32,
      y: hipsY + torsoHeight * 0.75,
    });
    chestPlate.position.z = 0.3;

    const buildArm = (offsetX) => {
      const arm = new THREE.Group();
      arm.position.set(offsetX, shoulderY, 0);
      addBlock(arm, {
        color: colors.body,
        width: 0.26,
        depth: 0.36,
        height: 0.7,
        y: -0.35,
      });
      addBlock(arm, {
        color: colors.accent,
        width: 0.28,
        depth: 0.38,
        height: 0.24,
        y: -0.82,
      });
      return arm;
    };

    golem.add(buildArm(-0.78));
    golem.add(buildArm(0.78));

    const vineWrap = addBlock(golem, {
      color: colors.vines,
      width: 0.2,
      depth: 0.64,
      height: 0.5,
      y: hipsY + torsoHeight * 0.4,
    });
    vineWrap.position.x = -0.35;

    const headGroup = new THREE.Group();
    headGroup.position.set(0, shoulderY + 0.12, 0);
    const head = addBlock(headGroup, {
      color: colors.body,
      width: 0.58,
      depth: 0.5,
      height: headHeight,
      y: headHeight / 2,
    });
    head.material.roughness = 0.65;

    const brow = addBlock(headGroup, {
      color: colors.accent,
      width: 0.6,
      depth: 0.12,
      height: 0.1,
      y: headHeight * 0.74,
    });
    brow.position.z = 0.2;

    const eyeMaterial = new THREE.MeshBasicMaterial({ color: colors.eye });
    const eyeGeometry = new THREE.PlaneGeometry(0.1, 0.1);
    const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    leftEye.position.set(-0.12, headHeight * 0.58, 0.24);
    headGroup.add(leftEye);
    const rightEye = leftEye.clone();
    rightEye.position.x = 0.12;
    headGroup.add(rightEye);

    golem.add(headGroup);
    entityGroup.add(golem);
    ironGolemMeshes.push(golem);
  }
  while (ironGolemMeshes.length > count) {
    const golem = ironGolemMeshes.pop();
    entityGroup.remove(golem);
  }
}

function tileSurfaceHeight(x, y) {
  const tile = getTile(x, y);
  if (!tile) return 0;
  return getTileHeight(tile) + 0.01;
}

function updateEntities() {
  const now = performance.now();
  if (playerMesh) {
    const { x, z } = worldToScene(state.player.x, state.player.y);
    const height = tileSurfaceHeight(state.player.x, state.player.y);
    const facing = state.player?.facing ?? { x: 0, y: 1 };
    playerMesh.rotation.y = Math.atan2(facing.x, facing.y);

    const movementDelta = now - (state.lastMoveAt || 0);
    const pressedStrength = state.pressedKeys?.size ? 0.75 : 0;
    const recentMoveStrength = THREE.MathUtils.clamp(1 - movementDelta / 360, 0, 1);
    const movementStrength = Math.min(1, Math.max(pressedStrength, recentMoveStrength));
    const walkCycle = now / 240;
    const idleBob = Math.sin(now / 1200) * 0.02;
    const bob = Math.sin(walkCycle) * 0.08 * movementStrength;
    playerMesh.position.set(x, height + idleBob + bob, z);

    if (playerMeshParts) {
      const swing = Math.sin(walkCycle) * 0.35 * movementStrength;
      const stride = Math.sin(walkCycle) * 0.4 * movementStrength;
      if (playerMeshParts.leftArm) {
        playerMeshParts.leftArm.rotation.x = swing;
      }
      if (playerMeshParts.rightArm) {
        playerMeshParts.rightArm.rotation.x = -swing;
      }
      if (playerMeshParts.leftLeg) {
        playerMeshParts.leftLeg.rotation.x = -stride;
      }
      if (playerMeshParts.rightLeg) {
        playerMeshParts.rightLeg.rotation.x = stride;
      }
      if (playerMeshParts.head) {
        const idleYaw = Math.sin(now / 1800) * 0.03;
        const idlePitch = Math.cos(now / 1700) * 0.02;
        playerMeshParts.head.rotation.y = idleYaw + Math.sin(walkCycle * 0.7) * 0.08 * movementStrength;
        playerMeshParts.head.rotation.x = idlePitch + Math.cos(walkCycle * 0.5) * 0.04 * movementStrength;
      }
    }
  }
  if (playerLocator) {
    const { x, z } = worldToScene(state.player.x, state.player.y);
    const height = tileSurfaceHeight(state.player.x, state.player.y) + 0.02;
    playerLocator.position.set(x, height, z);
    const cycle = (now % 2400) / 2400;
    const pulse = 1 + Math.sin(cycle * Math.PI * 2) * 0.12;
    playerLocator.scale.set(pulse, pulse, 1);
    if (playerLocator.material) {
      const opacity = 0.35 + Math.sin(cycle * Math.PI * 2) * 0.25;
      playerLocator.material.opacity = THREE.MathUtils.clamp(opacity, 0.2, 0.85);
    }
  }
  ensureZombieMeshCount(state.zombies.length);
  ensureIronGolemMeshCount(state.ironGolems?.length ?? 0);
  state.zombies.forEach((zombie, index) => {
    const mesh = zombieMeshes[index];
    if (!mesh) return;
    const { x, z } = worldToScene(zombie.x, zombie.y);
    const h = tileSurfaceHeight(zombie.x, zombie.y);
    mesh.position.set(x, h, z);
  });
  state.ironGolems?.forEach((golem, index) => {
    const mesh = ironGolemMeshes[index];
    if (!mesh) return;
    const { x, z } = worldToScene(golem.x, golem.y);
    const h = tileSurfaceHeight(golem.x, golem.y);
    mesh.position.set(x, h, z);
  });
}

function renderScene() {
  updateWorldMeshes();
  updateEntities();
  if (renderer && scene && camera) {
    renderer.render(scene, camera);
  }
}

const TILE_TYPES = {
  grass: { base: '#1d934d', accent: '#91ffb7', walkable: true },
  water: { base: '#113060', accent: '#49f2ff', walkable: false },
  sand: { base: '#d3a65c', accent: '#f5d9a8', walkable: true },
  tree: { base: '#20633a', accent: '#49f25f', walkable: false, resource: 'wood' },
  stone: { base: '#6f7e8f', accent: '#d4ecff', walkable: true, resource: 'stone' },
  rock: { base: '#3f4c52', accent: '#cbd6de', walkable: true, resource: 'rock' },
  ore: { base: '#4c5b68', accent: '#49f2ff', walkable: true, resource: 'spark-crystal' },
  rail: { base: '#1c2435', accent: '#49f2ff', walkable: true },
  railVoid: { base: '#05080f', accent: '#151c2a', walkable: false },
  portalFrame: { base: '#3b4b7a', accent: '#9dc7ff', walkable: true },
  portalDormant: { base: '#1a1f39', accent: '#7b6bff', walkable: true },
  portal: { base: '#2e315b', accent: '#7b6bff', walkable: true },
  tar: { base: '#251c23', accent: '#5f374d', walkable: true, resource: 'tar' },
  marble: { base: '#f6f2ed', accent: '#f7b733', walkable: true, resource: 'marble' },
  marbleEcho: { base: '#d8d4ff', accent: '#f7b733', walkable: true },
  netherite: { base: '#402020', accent: '#ff8249', walkable: true, resource: 'netherite' },
  lava: { base: '#6f2211', accent: '#ff8249', walkable: false },
  canyon: { base: '#483c30', accent: '#b08d64', walkable: true, resource: 'rock' },
  crystal: { base: '#1d2e5c', accent: '#49f2ff', walkable: true, resource: 'pattern-crystal' },
  void: { base: '#010308', accent: '#0a101f', walkable: false },
  village: { base: '#275b6d', accent: '#79f2ff', walkable: true },
  chest: { base: '#3d2a14', accent: '#f7b733', walkable: false, resource: 'chest' },
};

const ITEM_DEFS = {
  wood: { name: 'Wood', stack: 99, description: 'Harvested from trees; fuels basic tools.' },
  stone: { name: 'Stone Chunk', stack: 99, description: 'Solid stone for early crafting.' },
  rock: { name: 'Heavy Rock', stack: 99, description: 'Dense rock for Rock portals.' },
  'spark-crystal': { name: 'Spark Crystal', stack: 99, description: 'Charges igniters and rails.' },
  tar: { name: 'Tar Sac', stack: 99, description: 'Sticky tar used for slowing traps.' },
  marble: { name: 'Marble Inlay', stack: 99, description: 'Refined marble for elegant tech.' },
  netherite: { name: 'Netherite Shard', stack: 99, description: 'Volatile shard from collapsing rails.' },
  stick: { name: 'Stick', stack: 99, description: 'Basic shaft for tools.' },
  torch: { name: 'Torch', stack: 20, description: 'Lights portals and wards zombies.' },
  'stone-pickaxe': { name: 'Stone Pickaxe', stack: 1, description: 'Required to mine dense nodes.' },
  'tar-blade': { name: 'Tar Blade', stack: 1, description: 'Slows enemies on hit.' },
  'marble-echo': { name: 'Echo Core', stack: 1, description: 'Stores reverberating actions.' },
  'portal-igniter': { name: 'Portal Igniter', stack: 1, description: 'Activates portal frames.' },
  'rail-key': { name: 'Rail Key', stack: 1, description: 'Unlocks sealed chests on rails.' },
  'heavy-plating': { name: 'Heavy Plating', stack: 10, description: 'Armor plating from rock golems.' },
  'pattern-crystal': { name: 'Pattern Crystal', stack: 99, description: 'Used to sync stone rails.' },
  'eternal-ingot': { name: 'Eternal Ingot', stack: 1, description: 'Victory relic from the Netherite dimension.' },
};

const RECIPES = [
  {
    id: 'stick',
    name: 'Stick',
    sequence: ['wood'],
    output: { item: 'stick', quantity: 2 },
    unlock: 'origin',
  },
  {
    id: 'stone-pickaxe',
    name: 'Stone Pickaxe',
    sequence: ['stick', 'stick', 'stone'],
    output: { item: 'stone-pickaxe', quantity: 1 },
    unlock: 'origin',
  },
  {
    id: 'torch',
    name: 'Torch',
    sequence: ['stick', 'tar'],
    output: { item: 'torch', quantity: 2 },
    unlock: 'rock',
  },
  {
    id: 'portal-igniter',
    name: 'Portal Igniter',
    sequence: ['tar', 'spark-crystal', 'stick'],
    output: { item: 'portal-igniter', quantity: 1 },
    unlock: 'stone',
  },
  {
    id: 'rail-key',
    name: 'Rail Key',
    sequence: ['pattern-crystal', 'stick', 'pattern-crystal'],
    output: { item: 'rail-key', quantity: 1 },
    unlock: 'stone',
  },
  {
    id: 'tar-blade',
    name: 'Tar Blade',
    sequence: ['tar', 'stone', 'tar'],
    output: { item: 'tar-blade', quantity: 1 },
    unlock: 'tar',
  },
  {
    id: 'marble-echo',
    name: 'Echo Core',
    sequence: ['marble', 'spark-crystal', 'marble'],
    output: { item: 'marble-echo', quantity: 1 },
    unlock: 'marble',
  },
  {
    id: 'heavy-plating',
    name: 'Heavy Plating',
    sequence: ['rock', 'stone', 'rock'],
    output: { item: 'heavy-plating', quantity: 1 },
    unlock: 'rock',
  },
];

const DIMENSION_SEQUENCE = ['origin', 'rock', 'stone', 'tar', 'marble', 'netherite'];

const DIMENSIONS = {
  origin: {
    id: 'origin',
    name: 'Grassland Threshold',
    description:
      'A peaceful island afloat in void. Gather wood and stone, craft tools, and prepare the first portal.',
    palette: ['#1d934d', '#49f2ff'],
    theme: {
      accent: '#49f2ff',
      accentStrong: '#f7b733',
      accentSoft: 'rgba(73, 242, 255, 0.3)',
      bgPrimary: '#050912',
      bgSecondary: '#0d182f',
      bgTertiary: 'rgba(21, 40, 72, 0.85)',
      pageBackground: `radial-gradient(circle at 20% 20%, rgba(73, 242, 255, 0.2), transparent 45%), radial-gradient(circle at 80% 10%, rgba(247, 183, 51, 0.2), transparent 55%), linear-gradient(160deg, #050912, #0b1230 60%, #05131f 100%)`,
      dimensionGlow: 'rgba(73, 242, 255, 0.45)',
    },
    rules: {
      moveDelay: 0.15,
    },
    generator: (state) => generateOriginIsland(state),
  },
  rock: {
    id: 'rock',
    name: 'Rock Dimension',
    description:
      'Gravity tugs harder. Slippery slopes will slide you downward. Mine heavy ore guarded by golems.',
    palette: ['#483c30', '#b08d64'],
    theme: {
      accent: '#f2b266',
      accentStrong: '#ff7b3d',
      accentSoft: 'rgba(242, 178, 102, 0.25)',
      bgPrimary: '#160f13',
      bgSecondary: '#22191b',
      bgTertiary: 'rgba(53, 38, 34, 0.78)',
      pageBackground: `radial-gradient(circle at 18% 22%, rgba(242, 178, 102, 0.18), transparent 45%), radial-gradient(circle at 80% 14%, rgba(79, 103, 132, 0.2), transparent 55%), linear-gradient(160deg, #141014, #27190f 55%, #180f1b 100%)`,
      dimensionGlow: 'rgba(242, 178, 102, 0.35)',
    },
    rules: {
      moveDelay: 0.18,
      onMove: (state, from, to, dir) => {
        if (to?.data?.slope && !state.player.isSliding) {
          state.player.isSliding = true;
          const slideDir = to.data.slope;
          setTimeout(() => {
            attemptMove(slideDir.dx, slideDir.dy, true);
            state.player.isSliding = false;
          }, 120);
        }
      },
    },
    generator: (state) => generateRockCanyon(state),
    rewards: [{ item: 'rock', quantity: 1 }, { item: 'heavy-plating', quantity: 0 }],
  },
  stone: {
    id: 'stone',
    name: 'Stone Dimension',
    description:
      'Rails materialize in rhythm. Time your crossings to harvest pattern crystals from glowing seams.',
    palette: ['#1c2435', '#49f2ff'],
    theme: {
      accent: '#7ad0ff',
      accentStrong: '#a998ff',
      accentSoft: 'rgba(122, 208, 255, 0.28)',
      bgPrimary: '#091224',
      bgSecondary: '#131b33',
      bgTertiary: 'rgba(24, 36, 66, 0.82)',
      pageBackground: `radial-gradient(circle at 18% 20%, rgba(122, 208, 255, 0.18), transparent 50%), radial-gradient(circle at 75% 18%, rgba(148, 135, 255, 0.18), transparent 60%), linear-gradient(160deg, #0a1324, #141b33 55%, #090d18 100%)`,
      dimensionGlow: 'rgba(122, 208, 255, 0.45)',
    },
    rules: {
      moveDelay: 0.16,
      update: (state, delta) => {
        state.railTimer += delta;
        if (state.railTimer >= 1.4) {
          state.railTimer = 0;
          state.railPhase = (state.railPhase + 1) % 2;
        }
      },
      isWalkable: (tile, state) => {
        if (tile?.type === 'rail') {
          return state.railPhase === tile.data.phase;
        }
        return undefined;
      },
    },
    generator: (state) => generateStonePattern(state),
  },
  tar: {
    id: 'tar',
    name: 'Tar Dimension',
    description:
      'Everything is heavy. Movement slows and tar slugs trail you. Harvest tar sacs carefully.',
    palette: ['#251c23', '#5f374d'],
    theme: {
      accent: '#bb86ff',
      accentStrong: '#ff6f91',
      accentSoft: 'rgba(187, 134, 255, 0.28)',
      bgPrimary: '#150b16',
      bgSecondary: '#1f1024',
      bgTertiary: 'rgba(53, 24, 55, 0.78)',
      pageBackground: `radial-gradient(circle at 16% 24%, rgba(187, 134, 255, 0.18), transparent 45%), radial-gradient(circle at 82% 18%, rgba(255, 111, 145, 0.16), transparent 60%), linear-gradient(160deg, #120918, #231126 55%, #16081f 100%)`,
      dimensionGlow: 'rgba(187, 134, 255, 0.42)',
    },
    rules: {
      moveDelay: 0.28,
      onMove: (state) => {
        state.player.tarStacks = Math.min((state.player.tarStacks || 0) + 1, 4);
        state.player.tarSlowTimer = 2.4;
      },
    },
    generator: (state) => generateTarBog(state),
  },
  marble: {
    id: 'marble',
    name: 'Marble Dimension',
    description:
      'Every action echoes. Five seconds later, your past self repeats it. Build portals with mirrored discipline.',
    palette: ['#f6f2ed', '#f7b733'],
    theme: {
      accent: '#f3d688',
      accentStrong: '#ffffff',
      accentSoft: 'rgba(243, 214, 136, 0.28)',
      bgPrimary: '#11131f',
      bgSecondary: '#1b1e30',
      bgTertiary: 'rgba(32, 36, 58, 0.82)',
      pageBackground: `radial-gradient(circle at 20% 25%, rgba(243, 214, 136, 0.2), transparent 45%), radial-gradient(circle at 80% 20%, rgba(154, 163, 255, 0.18), transparent 60%), linear-gradient(160deg, #101320, #1c1f30 55%, #0f111b 100%)`,
      dimensionGlow: 'rgba(243, 214, 136, 0.4)',
    },
    rules: {
      moveDelay: 0.18,
      onAction: (state, action) => {
        state.echoQueue.push({ at: state.elapsed + 5, action });
      },
      update: (state) => {
        if (!state.echoQueue.length) return;
        const now = state.elapsed;
        while (state.echoQueue.length && state.echoQueue[0].at <= now) {
          const echo = state.echoQueue.shift();
          echo.action(true);
          logEvent('Echo repeats your action.');
        }
      },
    },
    generator: (state) => generateMarbleGarden(state),
  },
  netherite: {
    id: 'netherite',
    name: 'Netherite Dimension',
    description:
      'Rails crumble behind you. Sprint ahead, align collapsing tracks, and claim the Eternal Ingot.',
    palette: ['#402020', '#ff8249'],
    theme: {
      accent: '#ff7646',
      accentStrong: '#ffd05f',
      accentSoft: 'rgba(255, 118, 70, 0.28)',
      bgPrimary: '#1b0d0d',
      bgSecondary: '#261011',
      bgTertiary: 'rgba(63, 22, 18, 0.82)',
      pageBackground: `radial-gradient(circle at 18% 22%, rgba(255, 118, 70, 0.18), transparent 45%), radial-gradient(circle at 80% 15%, rgba(255, 208, 95, 0.16), transparent 60%), linear-gradient(160deg, #180909, #2c1110 55%, #12070e 100%)`,
      dimensionGlow: 'rgba(255, 118, 70, 0.4)',
    },
    rules: {
      moveDelay: 0.14,
      onMove: (state, from, to) => {
        if (!from) return;
        const tile = getTile(from.x, from.y);
        if (tile && tile.type !== 'void') {
          setTimeout(() => {
            const checkTile = getTile(from.x, from.y);
            if (checkTile && checkTile.type !== 'portal' && checkTile.type !== 'portalFrame') {
              checkTile.type = 'railVoid';
            }
          }, 400);
        }
      },
    },
    generator: (state) => generateNetheriteCollapse(state),
  },
};

function applyDimensionTheme(dimension) {
  if (!dimension) return;
  const theme = { ...BASE_THEME, ...(dimension.theme ?? {}) };
  const style = rootElement.style;
  style.setProperty('--accent', theme.accent);
  style.setProperty('--accent-strong', theme.accentStrong);
  style.setProperty('--accent-soft', theme.accentSoft);
  style.setProperty('--bg-primary', theme.bgPrimary);
  style.setProperty('--bg-secondary', theme.bgSecondary);
  style.setProperty('--bg-tertiary', theme.bgTertiary);
  style.setProperty('--page-background', theme.pageBackground);
  style.setProperty('--dimension-glow', theme.dimensionGlow);
  document.body.dataset.dimension = dimension.id;
}

const state = {
  width: 16,
  height: 12,
  tileWidth: canvas.width / 16,
  tileHeight: canvas.height / 12,
  world: [],
  dimension: DIMENSIONS.origin,
  dimensionHistory: ['origin'],
  elapsed: 0,
  dayLength: 180,
  railPhase: 0,
  railTimer: 0,
  portals: [],
  zombies: [],
  ironGolems: [],
  lootables: [],
  chests: [],
  lastMoveAt: 0,
  moveDelay: 0.15,
  baseMoveDelay: 0.15,
  hooks: {
    onMove: [],
    onAction: [],
    update: [],
    isWalkable: [],
  },
  echoQueue: [],
  craftSequence: [],
  knownRecipes: new Set(['stick', 'stone-pickaxe']),
  unlockedDimensions: new Set(['origin']),
  player: {
    x: 8,
    y: 6,
    facing: { x: 0, y: 1 },
    hearts: 10,
    maxHearts: 10,
    air: 10,
    maxAir: 10,
    selectedSlot: 0,
    inventory: Array.from({ length: 10 }, () => null),
    satchel: [],
    effects: {},
    hasIgniter: false,
    tarStacks: 0,
    tarSlowTimer: 0,
    zombieHits: 0,
  },
  pressedKeys: new Set(),
  isRunning: false,
  victory: false,
  scoreSubmitted: false,
};

initRenderer();

function generateOriginIsland(state) {
  const grid = [];
  for (let y = 0; y < state.height; y++) {
    const row = [];
    for (let x = 0; x < state.width; x++) {
      const dist = Math.hypot(x - state.width / 2, y - state.height / 2);
      if (dist > state.width / 2.1) {
        row.push({ type: 'void', data: {} });
        continue;
      }
      if (Math.random() < 0.08) {
        row.push({ type: 'water', data: {} });
        continue;
      }
      const tile = { type: 'grass', data: {} };
      if (Math.random() < 0.12) {
        tile.type = 'tree';
        tile.resource = 'wood';
        tile.data = { yield: 3 };
      } else if (Math.random() < 0.06) {
        tile.type = 'stone';
        tile.resource = 'stone';
        tile.data = { yield: 2 };
      } else if (Math.random() < 0.04) {
        tile.type = 'rock';
        tile.resource = 'rock';
        tile.data = { yield: 1 };
      }
      row.push(tile);
    }
    grid.push(row);
  }
  placeStructure(grid, createRailLoop(state));
  return grid;
}

function generateRockCanyon(state) {
  const grid = [];
  for (let y = 0; y < state.height; y++) {
    const row = [];
    for (let x = 0; x < state.width; x++) {
      const tile = { type: 'canyon', data: {} };
      if (Math.random() < 0.14) {
        tile.type = 'stone';
        tile.resource = 'rock';
        tile.data = { yield: 2 };
      }
      if (Math.random() < 0.08) {
        tile.data.slope = choose([
          { dx: 1, dy: 0 },
          { dx: -1, dy: 0 },
          { dx: 0, dy: 1 },
        ]);
      }
      row.push(tile);
    }
    grid.push(row);
  }
  placeStructure(grid, createResourceCluster('ore', 3));
  return grid;
}

function generateStonePattern(state) {
  const grid = [];
  for (let y = 0; y < state.height; y++) {
    const row = [];
    for (let x = 0; x < state.width; x++) {
      const tile = { type: 'rail', data: { phase: (x + y) % 2 } };
      if (Math.random() < 0.1) {
        tile.type = 'crystal';
        tile.resource = 'pattern-crystal';
        tile.walkable = true;
      }
      row.push(tile);
    }
    grid.push(row);
  }
  return grid;
}

function generateTarBog(state) {
  const grid = [];
  for (let y = 0; y < state.height; y++) {
    const row = [];
    for (let x = 0; x < state.width; x++) {
      const tile = { type: 'tar', data: {} };
      if (Math.random() < 0.1) {
        tile.type = 'lava';
        tile.hazard = true;
      }
      if (Math.random() < 0.05) {
        tile.type = 'tar';
        tile.resource = 'tar';
        tile.data = { yield: 2 };
      }
      row.push(tile);
    }
    grid.push(row);
  }
  return grid;
}

function generateMarbleGarden(state) {
  const grid = [];
  for (let y = 0; y < state.height; y++) {
    const row = [];
    for (let x = 0; x < state.width; x++) {
      const tile = { type: 'marble', data: {} };
      if ((x + y) % 3 === 0) {
        tile.type = 'marbleEcho';
      }
      if (Math.random() < 0.08) {
        tile.resource = 'marble';
        tile.data = { yield: 1 };
      }
      row.push(tile);
    }
    grid.push(row);
  }
  return grid;
}

function generateNetheriteCollapse(state) {
  const grid = [];
  for (let y = 0; y < state.height; y++) {
    const row = [];
    for (let x = 0; x < state.width; x++) {
      const tile = { type: 'rail', data: { phase: 0 } };
      if (Math.random() < 0.12) {
        tile.type = 'netherite';
        tile.resource = 'netherite';
        tile.data = { yield: 1 };
      }
      if (Math.random() < 0.08) {
        tile.type = 'lava';
        tile.hazard = true;
      }
      row.push(tile);
    }
    grid.push(row);
  }
  const chestY = Math.floor(state.height / 2);
  const chestX = state.width - 3;
  if (grid[chestY]) {
    grid[chestY][chestX] = { type: 'chest', resource: 'chest', data: { loot: 'eternal-ingot', locked: false } };
    if (grid[chestY][chestX - 1]) grid[chestY][chestX - 1] = { type: 'rail', data: { phase: 0 } };
    if (grid[chestY][chestX - 2]) grid[chestY][chestX - 2] = { type: 'rail', data: { phase: 1 } };
  }
  return grid;
}

function placeStructure(grid, structure) {
  if (!structure) return;
  const { tiles, width, height } = structure;
  const maxX = grid[0].length - width - 1;
  const maxY = grid.length - height - 1;
  const startX = Math.floor(Math.random() * Math.max(maxX, 1));
  const startY = Math.floor(Math.random() * Math.max(maxY, 1));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const tile = tiles[y][x];
      if (!tile) continue;
      grid[startY + y][startX + x] = tile;
    }
  }
}

function createRailLoop(state) {
  const width = 6;
  const height = 4;
  const tiles = Array.from({ length: height }, () => Array(width).fill(null));
  for (let x = 0; x < width; x++) {
    tiles[0][x] = { type: 'rail', data: { phase: x % 2 } };
    tiles[height - 1][x] = { type: 'rail', data: { phase: (x + 1) % 2 } };
  }
  for (let y = 0; y < height; y++) {
    tiles[y][0] = { type: 'rail', data: { phase: y % 2 } };
    tiles[y][width - 1] = { type: 'rail', data: { phase: (y + 1) % 2 } };
  }
  tiles[1][2] = { type: 'chest', resource: 'chest', data: { locked: true, required: 'rail-key' } };
  return { tiles, width, height };
}

function createResourceCluster(type, size = 4) {
  const tiles = [];
  const width = size + 2;
  const height = size + 2;
  for (let y = 0; y < height; y++) {
    const row = [];
    for (let x = 0; x < width; x++) {
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
        row.push({ type: 'canyon', data: {} });
      } else {
        row.push({ type, resource: 'spark-crystal', data: { yield: 1 } });
      }
    }
    tiles.push(row);
  }
  return { tiles, width, height };
}

function choose(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function addItemToInventory(itemId, quantity = 1) {
  const def = ITEM_DEFS[itemId];
  if (!def) return false;
  for (let i = 0; i < state.player.inventory.length; i++) {
    const slot = state.player.inventory[i];
    if (slot && slot.item === itemId) {
      const addable = Math.min(quantity, def.stack - slot.quantity);
      if (addable > 0) {
        slot.quantity += addable;
        quantity -= addable;
      }
    }
    if (quantity === 0) break;
  }
  for (let i = 0; i < state.player.inventory.length && quantity > 0; i++) {
    if (!state.player.inventory[i]) {
      const addable = Math.min(quantity, def.stack);
      state.player.inventory[i] = { item: itemId, quantity: addable };
      quantity -= addable;
    }
  }
  if (quantity > 0) {
    state.player.satchel.push({ item: itemId, quantity });
  }
  updateInventoryUI();
  return true;
}

function removeItem(itemId, quantity = 1) {
  for (let i = 0; i < state.player.inventory.length; i++) {
    const slot = state.player.inventory[i];
    if (!slot || slot.item !== itemId) continue;
    const removable = Math.min(quantity, slot.quantity);
    slot.quantity -= removable;
    quantity -= removable;
    if (slot.quantity <= 0) {
      state.player.inventory[i] = null;
    }
    if (quantity === 0) break;
  }
  if (quantity === 0) {
    updateInventoryUI();
    return true;
  }
  for (let i = 0; i < state.player.satchel.length && quantity > 0; i++) {
    const bundle = state.player.satchel[i];
    if (bundle.item !== itemId) continue;
    const removable = Math.min(quantity, bundle.quantity);
    bundle.quantity -= removable;
    quantity -= removable;
    if (bundle.quantity <= 0) {
      state.player.satchel.splice(i, 1);
      i--;
    }
  }
  updateInventoryUI();
  return quantity === 0;
}

function hasItem(itemId, quantity = 1) {
  let total = 0;
  for (const slot of state.player.inventory) {
    if (slot?.item === itemId) total += slot.quantity;
  }
  for (const bundle of state.player.satchel) {
    if (bundle.item === itemId) total += bundle.quantity;
  }
  return total >= quantity;
}

function updateInventoryUI() {
  hotbarEl.innerHTML = '';
  state.player.inventory.forEach((slot, index) => {
    const el = document.createElement('div');
    el.className = 'inventory-slot';
    if (index === state.player.selectedSlot) el.classList.add('active');
    if (slot) {
      el.innerHTML = `<span>${ITEM_DEFS[slot.item]?.name ?? slot.item}</span><span class="quantity">${slot.quantity}</span>`;
    } else {
      el.innerHTML = '<span>—</span>';
    }
    el.addEventListener('click', () => {
      state.player.selectedSlot = index;
      updateInventoryUI();
    });
    hotbarEl.appendChild(el);
  });

  extendedInventoryEl.innerHTML = '';
  const combined = mergeInventory();
  combined.forEach((bundle) => {
    const el = document.createElement('div');
    el.className = 'inventory-slot';
    el.innerHTML = `<span>${ITEM_DEFS[bundle.item]?.name ?? bundle.item}</span><span class="quantity">${bundle.quantity}</span>`;
    el.addEventListener('click', () => addToCraftSequence(bundle.item));
    extendedInventoryEl.appendChild(el);
  });
}

function mergeInventory() {
  const map = new Map();
  [...state.player.inventory, ...state.player.satchel].forEach((entry) => {
    if (!entry) return;
    map.set(entry.item, (map.get(entry.item) ?? 0) + entry.quantity);
  });
  return Array.from(map.entries()).map(([item, quantity]) => ({ item, quantity }));
}

function updateStatusBars() {
  heartsEl.innerHTML = '';
  const hearts = document.createElement('div');
  hearts.className = 'meter';
  for (let i = 0; i < state.player.maxHearts; i++) {
    const el = document.createElement('span');
    el.className = 'heart';
    if (i >= state.player.hearts) {
      el.classList.add('empty');
    }
    hearts.appendChild(el);
  }
  heartsEl.appendChild(hearts);

  bubblesEl.innerHTML = '';
  const bubbles = document.createElement('div');
  bubbles.className = 'meter';
  for (let i = 0; i < state.player.maxAir; i++) {
    const el = document.createElement('span');
    el.className = 'bubble';
    if (i >= state.player.air) {
      el.classList.add('empty');
    }
    bubbles.appendChild(el);
  }
  bubblesEl.appendChild(bubbles);

  const ratio = (state.elapsed % state.dayLength) / state.dayLength;
  rootElement.style.setProperty('--time-phase', ratio.toFixed(3));
  const track = document.createElement('div');
  track.className = 'time-track';
  const label = document.createElement('span');
  const percent = Math.round(ratio * 100);
  label.textContent = ratio < 0.5 ? `Daylight ${percent}%` : `Nightfall ${percent}%`;
  const bar = document.createElement('div');
  bar.className = 'bar';
  bar.style.setProperty('--progress', ratio.toFixed(2));
  track.append(label, bar);
  timeEl.innerHTML = '';
  timeEl.appendChild(track);
}

function updateDimensionOverlay() {
  const info = state.dimension;
  if (!info || !dimensionInfoEl) return null;
  const tasks = [];
  if (!state.unlockedDimensions.has('rock')) {
    tasks.push('Craft a Stone Pickaxe and harvest dense rock.');
  } else if (!state.unlockedDimensions.has('stone')) {
    tasks.push('Assemble a Rock portal frame and ignite it.');
  }
  switch (info.id) {
    case 'stone':
      tasks.push('Move with the rhythm – only lit rails are safe.');
      break;
    case 'tar':
      tasks.push('Shake off tar stacks by pausing between strides.');
      break;
    case 'marble':
      tasks.push('Plan ahead. Every action echoes back in five seconds.');
      break;
    case 'netherite':
      tasks.push('Plot a path before rails collapse into the void.');
      break;
    default:
      break;
  }
  if (info.id === 'netherite' && !state.victory) {
    tasks.push('Keep moving! Rails collapse moments after contact.');
  }
  if (state.player.effects.hasEternalIngot) {
    tasks.push('Find your way back to the Grassland Threshold to seal your run.');
  }
  dimensionInfoEl.innerHTML = `
    <strong>${info.name}</strong>
    <span>${info.description}</span>
    ${tasks.length ? `<span>Objectives:</span><ul>${tasks.map((t) => `<li>${t}</li>`).join('')}</ul>` : ''}
  `;
  dimensionInfoEl.classList.add('visible');
  dimensionInfoEl.classList.remove('pop');
  void dimensionInfoEl.offsetWidth;
  dimensionInfoEl.classList.add('pop');
  dimensionInfoEl.addEventListener(
    'animationend',
    () => {
      dimensionInfoEl.classList.remove('pop');
    },
    { once: true }
  );
  const hintKey = `${info.id}:${tasks.join('|')}`;
  if (hintKey !== lastDimensionHintKey) {
    const summary = tasks[0] ?? info.description;
    showPlayerHint(`Now entering ${info.name}. ${summary}`);
    lastDimensionHintKey = hintKey;
  }
  return { info, tasks };
}

function getCodexStatus(dimId) {
  if (!state.unlockedDimensions.has(dimId)) return 'Locked';
  if (dimId === 'origin' && state.victory) return 'Return';
  if (dimId === 'netherite' && state.player.effects.hasEternalIngot && !state.victory) return 'Ingot';
  if (state.dimension.id === dimId) return 'Active';
  if (state.dimensionHistory.includes(dimId)) return 'Cleared';
  return 'Ready';
}

function updateDimensionCodex() {
  if (!codexListEl) return;
  codexListEl.innerHTML = '';
  DIMENSION_SEQUENCE.forEach((dimId) => {
    const dim = DIMENSIONS[dimId];
    const item = document.createElement('li');
    item.className = 'codex-item';
    if (dimId === 'netherite') item.classList.add('final');
    if (!state.unlockedDimensions.has(dimId)) item.classList.add('locked');
    if (state.dimensionHistory.includes(dimId) && dimId !== state.dimension.id) item.classList.add('complete');
    if (state.dimension.id === dimId) item.classList.add('active');
    const label = document.createElement('strong');
    label.textContent = dim?.name ?? dimId;
    const status = document.createElement('span');
    status.textContent = getCodexStatus(dimId).toUpperCase();
    item.title = dim?.description ?? dimId;
    item.append(label, status);
    codexListEl.appendChild(item);
  });
}

function renderVictoryBanner() {
  if (!victoryBannerEl) return;
  if (state.victory) {
    victoryBannerEl.innerHTML = `
      <h3>Victory Achieved</h3>
      <p>Return to the Grassland Threshold to archive your run.</p>
    `;
    victoryBannerEl.classList.add('visible');
    return;
  }
  if (state.player.effects.hasEternalIngot) {
    victoryBannerEl.innerHTML = `
      <h3>Eternal Ingot Secured</h3>
      <p>Stabilise a return portal and step back to origin.</p>
    `;
    victoryBannerEl.classList.add('visible');
    return;
  }
  victoryBannerEl.classList.remove('visible');
  victoryBannerEl.innerHTML = '';
}

function logEvent(message) {
  const li = document.createElement('li');
  li.textContent = message;
  eventLogEl.prepend(li);
  while (eventLogEl.children.length > 12) {
    eventLogEl.removeChild(eventLogEl.lastChild);
  }
}

function startGame() {
  introModal.style.display = 'none';
  updateLayoutMetrics();
  state.isRunning = true;
  state.player.effects = {};
  state.victory = false;
  state.scoreSubmitted = false;
  state.dimensionHistory = ['origin'];
  state.unlockedDimensions = new Set(['origin']);
  state.knownRecipes = new Set(['stick', 'stone-pickaxe']);
  state.player.inventory = Array.from({ length: 10 }, () => null);
  state.player.satchel = [];
  state.player.selectedSlot = 0;
  state.craftSequence = [];
  renderVictoryBanner();
  loadDimension('origin');
  updateInventoryUI();
  updateRecipesList();
  updateCraftQueue();
  updateStatusBars();
  updateDimensionOverlay();
  requestAnimationFrame(loop);
  logEvent('You awaken on a floating island.');
  addItemToInventory('wood', 2);
  addItemToInventory('stone', 1);
  updateInventoryUI();
  updateDimensionOverlay();
  window.setTimeout(() => {
    if (state.isRunning) {
      showPlayerHint(
        'You are the luminous explorer at the heart of the island. Drag or swipe to look around and gather nearby resources.',
        { duration: 7200 }
      );
    }
  }, 900);
}

function loadDimension(id, fromId = null) {
  const dim = DIMENSIONS[id];
  if (!dim) return;
  state.dimension = dim;
  state.unlockedDimensions.add(id);
  if (!state.dimensionHistory.includes(id)) {
    state.dimensionHistory.push(id);
  }
  applyDimensionTheme(dim);
  document.title = `Infinite Dimension · ${dim.name}`;
  state.world = dim.generator(state);
  resetWorldMeshes();
  updateWorldTarget();
  state.player.x = Math.floor(state.width / 2);
  state.player.y = Math.floor(state.height / 2);
  state.player.facing = { x: 0, y: 1 };
  state.portals = [];
  state.zombies = [];
  state.ironGolems = [];
  state.baseMoveDelay = dim.rules.moveDelay ?? 0.18;
  state.moveDelay = state.baseMoveDelay;
  state.hooks.onMove = [];
  state.hooks.update = [];
  state.hooks.onAction = [];
  state.hooks.isWalkable = [];
  if (dim.rules.onMove) state.hooks.onMove.push(dim.rules.onMove);
  if (dim.rules.update) state.hooks.update.push(dim.rules.update);
  if (dim.rules.onAction) state.hooks.onAction.push(dim.rules.onAction);
  if (dim.rules.isWalkable) state.hooks.isWalkable.push(dim.rules.isWalkable);
  if (id === 'stone') {
    state.railPhase = 0;
    state.railTimer = 0;
  }
  if (id === 'marble') {
    state.echoQueue = [];
  }
  state.player.tarStacks = 0;
  state.player.tarSlowTimer = 0;
  state.player.isSliding = false;
  state.player.zombieHits = 0;
  if (fromId && id !== 'origin' && id !== 'netherite') {
    spawnReturnPortal(fromId, id);
  }
  if (id === 'origin' && fromId && hasItem('eternal-ingot')) {
    state.victory = true;
    logEvent('Victory! You returned with the Eternal Ingot.');
    handleVictoryAchieved();
  }
  lastDimensionHintKey = null;
  updateDimensionOverlay();
  updateDimensionCodex();
  renderVictoryBanner();
  updateRecipesList();
  updatePortalProgress();
  deployIronGolems();
  logEvent(`Entered ${dim.name}.`);
}

function loop(timestamp) {
  if (!state.prevTimestamp) state.prevTimestamp = timestamp;
  const delta = (timestamp - state.prevTimestamp) / 1000;
  state.prevTimestamp = timestamp;
  if (state.isRunning) {
    update(delta);
    draw();
  }
  requestAnimationFrame(loop);
}

function update(delta) {
  state.elapsed += delta;
  for (const hook of state.hooks.update) {
    hook(state, delta);
  }
  if (state.player.tarStacks > 0) {
    state.player.tarSlowTimer = Math.max((state.player.tarSlowTimer ?? 0) - delta, 0);
    if (state.player.tarSlowTimer === 0) {
      state.player.tarStacks = Math.max(0, state.player.tarStacks - 1);
      if (state.player.tarStacks > 0) {
        state.player.tarSlowTimer = 1.1;
      }
    }
  }
  const dayProgress = (state.elapsed % state.dayLength) / state.dayLength;
  const isNight = dayProgress > 0.5;
  if (isNight && state.zombies.length < 4) {
    spawnZombie();
  }
  updateIronGolems(delta);
  updateZombies(delta);
  handleAir(delta);
  processEchoQueue();
  updateStatusBars();
  updatePortalProgress();
}

function processEchoQueue() {
  if (!state.echoQueue.length) return;
  if (state.dimension.id !== 'marble') {
    state.echoQueue.length = 0;
    return;
  }
  // queue handled in marble update hook
}

function handleAir(delta) {
  const tile = getTile(state.player.x, state.player.y);
  if (tile?.type === 'water') {
    state.player.air = Math.max(0, state.player.air - delta * 2);
    if (state.player.air === 0) {
      applyDamage(0.5 * delta * 5);
    }
  } else {
    state.player.air = clamp(state.player.air + delta * 3, 0, state.player.maxAir);
  }
}

function deployIronGolems() {
  if (!state.ironGolems) state.ironGolems = [];
  state.ironGolems.length = 0;
  const desiredCount = 2;
  const origin = { x: state.player.x, y: state.player.y };
  const preferredOffsets = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
    { x: 2, y: 0 },
    { x: -2, y: 0 },
    { x: 0, y: 2 },
    { x: 0, y: -2 },
    { x: 1, y: 1 },
    { x: -1, y: 1 },
    { x: 1, y: -1 },
    { x: -1, y: -1 },
  ];

  const placeGolemAt = (x, y) => {
    if (state.ironGolems.length >= desiredCount) return true;
    if (!isWalkable(x, y)) return false;
    if (x === origin.x && y === origin.y) return false;
    if (state.ironGolems.some((g) => g.x === x && g.y === y)) return false;
    state.ironGolems.push({ x, y, cooldown: 0 });
    return true;
  };

  for (const offset of preferredOffsets) {
    if (placeGolemAt(origin.x + offset.x, origin.y + offset.y)) continue;
    if (state.ironGolems.length >= desiredCount) break;
  }

  if (state.ironGolems.length < desiredCount) {
    const candidates = [];
    for (let y = 0; y < state.height; y++) {
      for (let x = 0; x < state.width; x++) {
        if (!isWalkable(x, y)) continue;
        if (x === origin.x && y === origin.y) continue;
        candidates.push({ x, y, dist: Math.abs(x - origin.x) + Math.abs(y - origin.y) });
      }
    }
    candidates.sort((a, b) => a.dist - b.dist);
    for (const candidate of candidates) {
      if (placeGolemAt(candidate.x, candidate.y)) {
        if (state.ironGolems.length >= desiredCount) break;
      }
    }
  }

  if (state.ironGolems.length === 0) {
    state.ironGolems.push({ x: origin.x, y: origin.y, cooldown: 0 });
  }
}

function findNearestZombie(origin) {
  if (!state.zombies.length) return null;
  let best = null;
  let bestDist = Infinity;
  state.zombies.forEach((zombie) => {
    const dist = Math.abs(zombie.x - origin.x) + Math.abs(zombie.y - origin.y);
    if (dist < bestDist) {
      best = zombie;
      bestDist = dist;
    }
  });
  return best;
}

function updateIronGolems(delta) {
  if (!state.ironGolems?.length) return;
  state.ironGolems.forEach((golem) => {
    golem.cooldown = (golem.cooldown ?? 0) - delta;
    if (golem.cooldown > 0) return;
    const target = findNearestZombie(golem);
    if (!target) {
      golem.cooldown = 0.45;
      return;
    }
    const dx = Math.sign(target.x - golem.x);
    const dy = Math.sign(target.y - golem.y);
    let moved = false;
    if (Math.abs(dx) >= Math.abs(dy)) {
      if (dx !== 0 && isWalkable(golem.x + dx, golem.y)) {
        golem.x += dx;
        moved = true;
      } else if (dy !== 0 && isWalkable(golem.x, golem.y + dy)) {
        golem.y += dy;
        moved = true;
      }
    } else {
      if (dy !== 0 && isWalkable(golem.x, golem.y + dy)) {
        golem.y += dy;
        moved = true;
      } else if (dx !== 0 && isWalkable(golem.x + dx, golem.y)) {
        golem.x += dx;
        moved = true;
      }
    }
    golem.cooldown = moved ? 0.28 : 0.35;
  });

  const defeatedIndices = new Set();
  state.ironGolems.forEach((golem) => {
    state.zombies.forEach((zombie, index) => {
      const distance = Math.abs(zombie.x - golem.x) + Math.abs(zombie.y - golem.y);
      if (distance <= 1) {
        defeatedIndices.add(index);
      }
    });
  });

  if (defeatedIndices.size) {
    const defeatedZombies = [];
    state.zombies = state.zombies.filter((zombie, index) => {
      if (defeatedIndices.has(index)) {
        defeatedZombies.push(zombie);
        return false;
      }
      return true;
    });
    defeatedZombies.forEach(() => logEvent('An iron golem smashes a Minecraft zombie to protect you.'));
  }
}

function spawnZombie() {
  const spawnEdges = [
    { x: Math.floor(Math.random() * state.width), y: 0 },
    { x: Math.floor(Math.random() * state.width), y: state.height - 1 },
    { x: 0, y: Math.floor(Math.random() * state.height) },
    { x: state.width - 1, y: Math.floor(Math.random() * state.height) },
  ];
  const spawn = choose(spawnEdges);
  state.zombies.push({ x: spawn.x, y: spawn.y, speed: 0.8, cooldown: 0 });
  logEvent('A Minecraft zombie claws onto the rails.');
}

function updateZombies(delta) {
  state.zombies.forEach((zombie) => {
    zombie.cooldown -= delta;
    if (zombie.cooldown > 0) return;
    const dx = Math.sign(state.player.x - zombie.x);
    const dy = Math.sign(state.player.y - zombie.y);
    if (Math.abs(dx) > Math.abs(dy)) {
      if (isWalkable(zombie.x + dx, zombie.y)) zombie.x += dx;
      else if (isWalkable(zombie.x, zombie.y + dy)) zombie.y += dy;
    } else {
      if (isWalkable(zombie.x, zombie.y + dy)) zombie.y += dy;
      else if (isWalkable(zombie.x + dx, zombie.y)) zombie.x += dx;
    }
    zombie.cooldown = 0.5;
    if (zombie.x === state.player.x && zombie.y === state.player.y) {
      handleZombieHit();
    }
  });
  state.zombies = state.zombies.filter((z) => {
    const tile = getTile(z.x, z.y);
    return tile && tile.type !== 'void' && tile.type !== 'railVoid';
  });
}

function handleZombieHit() {
  state.player.zombieHits = (state.player.zombieHits ?? 0) + 1;
  const hits = state.player.zombieHits;
  const heartsPerHit = state.player.maxHearts / 5;
  const remainingHearts = state.player.maxHearts - heartsPerHit * hits;
  state.player.hearts = clamp(remainingHearts, 0, state.player.maxHearts);
  if (hits >= 5) {
    state.player.hearts = 0;
    updateStatusBars();
    handlePlayerDefeat('The Minecraft zombies overwhelm Steve. You respawn among the rails.');
    return;
  }
  const remainingHits = 5 - hits;
  logEvent(
    `Minecraft zombie strike! ${remainingHits} more hit${remainingHits === 1 ? '' : 's'} before defeat.`
  );
  updateStatusBars();
}

function handlePlayerDefeat(message) {
  if (state.victory) return;
  logEvent(message);
  loadDimension('origin');
  state.player.hearts = state.player.maxHearts;
  state.player.air = state.player.maxAir;
  state.player.zombieHits = 0;
  updateStatusBars();
}

function applyDamage(amount) {
  state.player.hearts = clamp(state.player.hearts - amount, 0, state.player.maxHearts);
  if (state.player.hearts <= 0 && !state.victory) {
    handlePlayerDefeat('You collapse. Echoes rebuild the realm...');
  }
}

function getTile(x, y) {
  if (x < 0 || y < 0 || x >= state.width || y >= state.height) return null;
  return state.world[y][x];
}

function isWalkable(x, y) {
  const tile = getTile(x, y);
  if (!tile) return false;
  for (const hook of state.hooks.isWalkable) {
    const result = hook(tile, state);
    if (typeof result === 'boolean') return result;
  }
  const def = TILE_TYPES[tile.type];
  if (tile.type === 'tree' || tile.type === 'chest') return false;
  if (tile.type === 'water' || tile.type === 'lava' || tile.type === 'void' || tile.type === 'railVoid') return false;
  if (tile.type === 'portalFrame') return true;
  if (tile.type === 'portal') return true;
  if (def?.walkable !== undefined) return def.walkable;
  return true;
}

function attemptMove(dx, dy, ignoreCooldown = false) {
  const now = performance.now();
  const delay = (state.baseMoveDelay ?? 0.18) + (state.player.tarStacks || 0) * 0.04;
  if (!ignoreCooldown && now - state.lastMoveAt < delay * 1000) return;
  const nx = state.player.x + dx;
  const ny = state.player.y + dy;
  if (!isWalkable(nx, ny)) {
    state.player.facing = { x: dx, y: dy };
    return;
  }
  const from = { x: state.player.x, y: state.player.y };
  state.player.x = nx;
  state.player.y = ny;
  state.player.facing = { x: dx, y: dy };
  state.lastMoveAt = now;
  const tile = getTile(nx, ny);
  if (tile?.hazard) {
    applyDamage(0.5);
    logEvent('Hazard burns you!');
  }
  for (const hook of state.hooks.onMove) {
    hook(state, from, { x: nx, y: ny }, { dx, dy });
  }
}

function interact(useAlt = false, echoed = false) {
  const facingX = state.player.x + state.player.facing.x;
  const facingY = state.player.y + state.player.facing.y;
  const frontTile = getTile(facingX, facingY);
  const currentTile = getTile(state.player.x, state.player.y);
  const tile = frontTile ?? currentTile;
  const tx = frontTile ? facingX : state.player.x;
  const ty = frontTile ? facingY : state.player.y;
  if (!tile) return;
  if (tile.type === 'portalDormant') {
    logEvent('The frame is inert. Ignite it to stabilise.');
    return;
  }
  if (tile.type === 'portal' && !state.victory) {
    enterPortalAt(tx, ty);
    return;
  }
  if (tile.type === 'portalFrame') {
    ignitePortal(tx, ty);
    return;
  }
  if (tile.type === 'chest') {
    openChest(tile);
    return;
  }
  if (tile.resource) {
    harvestResource(tile, tx, ty, echoed);
    return;
  }
  if (!echoed) {
    for (const hook of state.hooks.onAction) {
      hook(state, (fromEcho) => interact(useAlt, true));
    }
  }
}

function harvestResource(tile, x, y, echoed) {
  if (tile.data?.yield === undefined) tile.data.yield = 1;
  if (tile.data.yield <= 0) {
    logEvent('Resource depleted.');
    return;
  }
  const itemId = tile.resource;
  if (itemId === 'chest') {
    openChest(tile);
    return;
  }
  if (itemId === 'stone' && !hasItem('stone-pickaxe')) {
    logEvent('You need a Stone Pickaxe.');
    return;
  }
  tile.data.yield -= 1;
  addItemToInventory(itemId, 1);
  logEvent(`Gathered ${ITEM_DEFS[itemId]?.name ?? itemId}.`);
  if (tile.data.yield <= 0 && tile.type !== 'tar') {
    tile.type = 'grass';
    tile.resource = null;
  }
  if (!echoed) {
    for (const hook of state.hooks.onAction) {
      hook(state, (fromEcho) => harvestResource(tile, x, y, true));
    }
  }
}

function enterPortalAt(x, y) {
  const portal = state.portals.find((p) =>
    p.tiles.some((t) => t.x === x && t.y === y)
  );
  if (!portal) {
    logEvent('Portal hums but is not linked.');
    return;
  }
  if (!portal.active) {
    logEvent('Portal is dormant. Ignite it first.');
    return;
  }
  if (portal.destination === 'netherite' && state.dimension.id === 'netherite') {
    state.victory = true;
    addItemToInventory('eternal-ingot', 1);
    logEvent('You seize the Eternal Ingot! Return home victorious.');
    renderVictoryBanner();
    updateDimensionCodex();
    return;
  }
  if (state.dimension.id === portal.origin && portal.destination) {
    loadDimension(portal.destination, portal.origin);
    return;
  }
  if (state.dimension.id === portal.destination && portal.origin) {
    loadDimension(portal.origin, portal.destination);
    return;
  }
}

function ignitePortal(x, y) {
  if (!hasItem('portal-igniter') && !hasItem('torch')) {
    logEvent('You need a Portal Igniter or Torch.');
    return;
  }
  const frame = state.portals.find((portal) => portal.frame.some((f) => f.x === x && f.y === y));
  if (!frame) {
    logEvent('Frame incomplete.');
    return;
  }
  if (frame.active) {
    logEvent('Portal already active.');
    return;
  }
  frame.active = true;
  if (hasItem('portal-igniter')) removeItem('portal-igniter', 1);
  else removeItem('torch', 1);
  frame.tiles.forEach(({ x: tx, y: ty }) => {
    const tile = getTile(tx, ty);
    if (tile) tile.type = 'portal';
  });
  logEvent(`${frame.label} shimmers to life.`);
  updatePortalProgress();
}

function buildPortal(material) {
  const itemId = material;
  const requirement = 12;
  if (!hasItem(itemId, requirement)) {
    logEvent(`Need ${requirement} ${ITEM_DEFS[itemId]?.name ?? itemId}.`);
    return;
  }
  const framePositions = computePortalFrame(state.player.x, state.player.y, state.player.facing);
  if (!framePositions) {
    logEvent('Not enough space for portal frame.');
    return;
  }
  removeItem(itemId, requirement);
  const portal = {
    material,
    frame: framePositions.frame,
    tiles: framePositions.portal,
    active: false,
    label: `${DIMENSIONS[material]?.name ?? material} Portal`,
    origin: state.dimension.id,
    destination: material,
  };
  portal.frame.forEach(({ x, y }) => {
    const tile = getTile(x, y);
    if (tile) tile.type = 'portalFrame';
  });
  portal.tiles.forEach(({ x, y }) => {
    const tile = getTile(x, y);
    if (tile) tile.type = 'portalDormant';
  });
  state.portals.push(portal);
  state.unlockedDimensions.add(material);
  updateDimensionCodex();
  updatePortalProgress();
  logEvent(`Constructed ${portal.label}. Ignite to travel.`);
}

function spawnReturnPortal(targetDimension, currentDimension) {
  const cx = clamp(Math.floor(state.width / 2), 3, state.width - 4);
  const cy = clamp(Math.floor(state.height / 2), 2, state.height - 4);
  const frame = [];
  const tiles = [];
  for (let dy = -1; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (!isWithinBounds(x, y)) continue;
      if (dx === -2 || dx === 2 || dy === -1 || dy === 2) {
        frame.push({ x, y });
      } else if (!(dx === 0 && (dy === 0 || dy === 1))) {
        tiles.push({ x, y });
      }
    }
  }
  frame.forEach(({ x, y }) => {
    const tile = getTile(x, y);
    if (tile) tile.type = 'portalFrame';
  });
  tiles.forEach(({ x, y }) => {
    const tile = getTile(x, y);
    if (tile) tile.type = 'portal';
  });
  state.portals.push({
    material: targetDimension,
    frame,
    tiles,
    active: true,
    origin: currentDimension,
    destination: targetDimension,
    label: `Return to ${DIMENSIONS[targetDimension]?.name ?? targetDimension}`,
  });
  logEvent('A stabilised return gate anchors nearby.');
}

function computePortalFrame(px, py, facing) {
  const orientation = Math.abs(facing.x) > Math.abs(facing.y) ? 'vertical' : 'horizontal';
  const frame = [];
  const portal = [];
  if (orientation === 'vertical') {
    for (let dy = -1; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const x = px + dx;
        const y = py + dy;
        if (!isWithinBounds(x, y)) return null;
        if (dx === -2 || dx === 2 || dy === -1 || dy === 2) {
          frame.push({ x, y });
        } else if (!(dx === 0 && (dy === 0 || dy === 1))) {
          portal.push({ x, y });
        }
      }
    }
  } else {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -1; dx <= 2; dx++) {
        const x = px + dx;
        const y = py + dy;
        if (!isWithinBounds(x, y)) return null;
        if (dy === -2 || dy === 2 || dx === -1 || dx === 2) {
          frame.push({ x, y });
        } else if (!(dy === 0 && (dx === 0 || dx === 1))) {
          portal.push({ x, y });
        }
      }
    }
  }
  return { frame, portal };
}

function isWithinBounds(x, y) {
  return x >= 1 && y >= 1 && x < state.width - 1 && y < state.height - 1;
}

function updatePortalProgress() {
  if (!state.dimension) return;
  const currentIndex = DIMENSION_SEQUENCE.indexOf(state.dimension.id);
  const total = DIMENSION_SEQUENCE.length - 1;
  const ratio = clamp(currentIndex / total, 0, 1);
  portalProgressEl.classList.add('visible');
  portalProgressBar.style.setProperty('--progress', ratio.toFixed(3));
  const stage = currentIndex + 1;
  const totalStages = DIMENSION_SEQUENCE.length;
  const nextDim = DIMENSION_SEQUENCE[currentIndex + 1];
  const nextName = nextDim ? DIMENSIONS[nextDim]?.name ?? nextDim : 'Final Gate';
  portalProgressLabel.textContent = `${stage}/${totalStages} · ${state.dimension.name.toUpperCase()}`;
  portalProgressEl.setAttribute('aria-valuenow', Math.round(ratio * 100).toString());
  portalProgressEl.setAttribute('aria-valuetext', `${Math.round(ratio * 100)}% progress toward ${nextName}.`);
  portalProgressEl.title = `Next: ${nextName}`;
}

function addToCraftSequence(itemId) {
  state.craftSequence.push(itemId);
  updateCraftQueue();
}

function updateCraftQueue() {
  craftTargetEl.innerHTML = '';
  if (!state.craftSequence.length) {
    craftTargetEl.classList.add('empty');
  } else {
    craftTargetEl.classList.remove('empty');
  }
  state.craftSequence.forEach((item) => {
    const el = document.createElement('span');
    el.className = 'queue-item';
    el.textContent = ITEM_DEFS[item]?.name ?? item;
    craftTargetEl.appendChild(el);
  });
}

function attemptCraft() {
  if (!state.craftSequence.length) return;
  const recipe = RECIPES.find((r) =>
    r.sequence.length === state.craftSequence.length &&
    r.sequence.every((item, idx) => item === state.craftSequence[idx]) &&
    state.unlockedDimensions.has(r.unlock)
  );
  if (!recipe) {
    logEvent('Sequence fizzles. No recipe matched.');
    state.craftSequence = [];
    updateCraftQueue();
    return;
  }
  const canCraft = recipe.sequence.every((itemId) => hasItem(itemId));
  if (!canCraft) {
    logEvent('Missing ingredients for this recipe.');
    return;
  }
  recipe.sequence.forEach((itemId) => removeItem(itemId, 1));
  addItemToInventory(recipe.output.item, recipe.output.quantity);
  state.knownRecipes.add(recipe.id);
  logEvent(`${recipe.name} crafted.`);
  if (recipe.output.item === 'portal-igniter') {
    state.player.hasIgniter = true;
  }
  state.craftSequence = [];
  updateCraftQueue();
}

function updateRecipesList() {
  recipeListEl.innerHTML = '';
  const query = recipeSearchEl.value?.toLowerCase() ?? '';
  RECIPES.forEach((recipe) => {
    if (!state.unlockedDimensions.has(recipe.unlock)) return;
    if (query && !recipe.name.toLowerCase().includes(query)) return;
    const card = document.createElement('div');
    card.className = 'recipe-card';
    card.innerHTML = `
      <strong>${recipe.name}</strong>
      <span>${recipe.sequence.map((item) => ITEM_DEFS[item]?.name ?? item).join(' → ')}</span>
      <span>Creates ${ITEM_DEFS[recipe.output.item]?.name ?? recipe.output.item} ×${recipe.output.quantity}</span>
    `;
    card.addEventListener('click', () => {
      state.craftSequence = [...recipe.sequence];
      updateCraftQueue();
    });
    recipeListEl.appendChild(card);
  });
}

function openChest(tile) {
  if (tile.data?.locked && !hasItem(tile.data.required)) {
    logEvent('Chest locked. Requires Rail Key.');
    return;
  }
  tile.type = 'grass';
  tile.resource = null;
  const lootTable = [
    { item: 'stick', qty: 2 },
    { item: 'spark-crystal', qty: 1 },
    { item: 'tar', qty: 1 },
    { item: 'pattern-crystal', qty: 1 },
    { item: 'rock', qty: 2 },
  ];
  const loot = tile.data?.loot
    ? { item: tile.data.loot, qty: tile.data.quantity ?? 1 }
    : choose(lootTable);
  addItemToInventory(loot.item, loot.qty);
  if (loot.item === 'eternal-ingot') {
    state.player.effects.hasEternalIngot = true;
    logEvent('The Eternal Ingot pulses with limitless energy! Return home.');
    renderVictoryBanner();
    updateDimensionCodex();
  } else {
    logEvent(`Chest yields ${ITEM_DEFS[loot.item]?.name ?? loot.item} ×${loot.qty}.`);
  }
  updateDimensionOverlay();
}

function draw() {
  renderScene();
}

function handleKeyDown(event) {
  if (event.repeat) return;
  switch (event.key.toLowerCase()) {
    case 'w':
    case 'arrowup':
      attemptMove(0, -1);
      break;
    case 'a':
    case 'arrowleft':
      attemptMove(-1, 0);
      break;
    case 's':
    case 'arrowdown':
      attemptMove(0, 1);
      break;
    case 'd':
    case 'arrowright':
      attemptMove(1, 0);
      break;
    case ' ':
      interact();
      break;
    case 'q':
      placeBlock();
      break;
    case 'r':
      promptPortalBuild();
      break;
    case 'e':
      toggleExtended();
      break;
    case 'f':
      interact();
      break;
    case '1':
    case '2':
    case '3':
    case '4':
    case '5':
    case '6':
    case '7':
    case '8':
    case '9':
    case '0': {
      const index = (parseInt(event.key, 10) + 9) % 10;
      state.player.selectedSlot = index;
      updateInventoryUI();
      break;
    }
    default:
      break;
  }
}

function placeBlock() {
  const slot = state.player.inventory[state.player.selectedSlot];
  if (!slot) {
    logEvent('Select a block to place.');
    return;
  }
  const blockItems = ['wood', 'stone', 'rock', 'tar', 'marble', 'netherite'];
  if (!blockItems.includes(slot.item)) {
    logEvent('Cannot place this item.');
    return;
  }
  const tx = state.player.x + state.player.facing.x;
  const ty = state.player.y + state.player.facing.y;
  if (!isWithinBounds(tx, ty)) return;
  const tile = getTile(tx, ty);
  if (!tile || tile.type !== 'grass') {
    logEvent('Need an empty tile to place.');
    return;
  }
  tile.type = blockItems.includes(slot.item) ? slot.item : 'grass';
  removeItem(slot.item, 1);
  logEvent(`${ITEM_DEFS[slot.item].name} placed.`);
}

function promptPortalBuild() {
  const available = ['rock', 'stone', 'tar', 'marble', 'netherite'].filter((material) =>
    hasItem(material, 12) && DIMENSIONS[material]
  );
  if (!available.length) {
    logEvent('Collect more block resources to build a portal.');
    return;
  }
  const material = available[0];
  buildPortal(material);
}

function toggleExtended() {
  extendedInventoryEl.classList.toggle('open');
  toggleExtendedBtn.textContent = extendedInventoryEl.classList.contains('open') ? 'Close Satchel' : 'Open Satchel';
}

function updateFromMobile(action) {
  switch (action) {
    case 'up':
      attemptMove(0, -1);
      break;
    case 'down':
      attemptMove(0, 1);
      break;
    case 'left':
      attemptMove(-1, 0);
      break;
    case 'right':
      attemptMove(1, 0);
      break;
    case 'action':
      interact();
      break;
    case 'portal':
      promptPortalBuild();
      break;
    default:
      break;
  }
}

function updateDimensionUnlocks() {
  state.unlockedDimensions.forEach((dim) => {
    const dimensionIndex = DIMENSION_SEQUENCE.indexOf(dim);
    const nextDim = DIMENSION_SEQUENCE[dimensionIndex + 1];
    if (nextDim) {
      state.unlockedDimensions.add(nextDim);
    }
  });
}

function handleVictory() {
  if (!state.victory) return;
  logEvent('Return through your portals to complete the run!');
}

function initEventListeners() {
  document.addEventListener('keydown', handleKeyDown);
  craftButton.addEventListener('click', attemptCraft);
  clearCraftButton.addEventListener('click', () => {
    state.craftSequence = [];
    updateCraftQueue();
  });
  recipeSearchEl.addEventListener('input', updateRecipesList);
  toggleExtendedBtn.addEventListener('click', toggleExtended);
  mobileControls.querySelectorAll('button').forEach((button) => {
    button.addEventListener('click', () => updateFromMobile(button.dataset.action));
  });
  openGuideButton?.addEventListener('click', openGuideModal);
  toggleSidebarButton?.addEventListener('click', toggleSidebar);
  sidePanelScrim?.addEventListener('click', () => closeSidebar(true));
  document.querySelectorAll('[data-close-sidebar]').forEach((button) => {
    button.addEventListener('click', () => closeSidebar(true));
  });
  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (sidePanelEl?.classList.contains('open')) {
      closeSidebar(true);
      event.preventDefault();
      return;
    }
    if (playerHintEl?.classList.contains('visible')) {
      hidePlayerHint();
    }
  });
}

function collectDeviceSnapshot() {
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    language: navigator.language,
    screen: {
      width: window.screen?.width ?? null,
      height: window.screen?.height ?? null,
      pixelRatio: window.devicePixelRatio ?? 1,
    },
  };
}

function formatDeviceSnapshot(device) {
  if (!device) return 'Device details pending';
  const platform = device.platform || 'Unknown device';
  const width = device.screen?.width;
  const height = device.screen?.height;
  const ratio = device.screen?.pixelRatio;
  const size = width && height ? `${width}×${height}` : 'unknown size';
  const ratioText = ratio ? ` @${Number(ratio).toFixed(1)}x` : '';
  return `${platform} · ${size}${ratioText}`;
}

function formatLocationBadge(location) {
  if (!location) return 'Location unavailable';
  if (location.error) return `Location: ${location.error}`;
  if (typeof location.latitude === 'number' && typeof location.longitude === 'number') {
    return `Lat ${location.latitude.toFixed(2)}, Lon ${location.longitude.toFixed(2)}`;
  }
  if (location.label) return location.label;
  return 'Location hidden';
}

function formatLocationDetail(location) {
  if (!location) return 'Location unavailable';
  if (location.error) return `Location: ${location.error}`;
  if (typeof location.latitude === 'number' && typeof location.longitude === 'number') {
    const accuracy = location.accuracy ? ` · ±${Math.round(location.accuracy)}m` : '';
    return `Latitude ${location.latitude.toFixed(3)}, Longitude ${location.longitude.toFixed(3)}${accuracy}`;
  }
  if (location.label) return location.label;
  return 'Location hidden';
}

function formatScoreNumber(score) {
  return Math.round(score ?? 0).toLocaleString();
}

function formatRunTime(seconds) {
  if (!seconds) return '—';
  const totalSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remMinutes = minutes % 60;
    return `${hours}h ${remMinutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
}

function formatLocationLabel(entry) {
  if (entry.locationLabel) return entry.locationLabel;
  const location = entry.location;
  if (!location) return 'Location hidden';
  if (location.error) return location.error;
  if (location.latitude !== undefined && location.longitude !== undefined) {
    return `Lat ${Number(location.latitude).toFixed(1)}, Lon ${Number(location.longitude).toFixed(1)}`;
  }
  return 'Location hidden';
}

function updateIdentityUI() {
  if (headerUserNameEl) headerUserNameEl.textContent = identityState.displayName ?? 'Guest Explorer';
  if (userNameDisplayEl) userNameDisplayEl.textContent = identityState.displayName ?? 'Guest Explorer';
  if (headerUserLocationEl) headerUserLocationEl.textContent = formatLocationBadge(identityState.location);
  if (userLocationDisplayEl) userLocationDisplayEl.textContent = formatLocationDetail(identityState.location);
  if (userDeviceDisplayEl) userDeviceDisplayEl.textContent = formatDeviceSnapshot(identityState.device);

  const signedIn = Boolean(identityState.googleProfile);
  if (googleSignOutButton) googleSignOutButton.hidden = !signedIn;
  if (scoreboardSection) scoreboardSection.hidden = !signedIn;
  if (googleButtonContainer) {
    const shouldHideGoogleButton =
      signedIn || !identityState.googleInitialized || !appConfig.googleClientId;
    googleButtonContainer.hidden = shouldHideGoogleButton;
  }
  if (googleFallbackSignIn) {
    const showFallback = !signedIn;
    googleFallbackSignIn.hidden = !showFallback;
    if (appConfig.googleClientId) {
      const ready = identityState.googleInitialized;
      googleFallbackSignIn.disabled = !ready;
      googleFallbackSignIn.textContent = ready ? 'Sign in with Google' : 'Preparing Google Sign-In…';
      googleFallbackSignIn.title = ready
        ? 'Open the Google Sign-In prompt.'
        : 'Google services are still initialising. This will become clickable momentarily.';
    } else {
      googleFallbackSignIn.disabled = false;
      googleFallbackSignIn.textContent = 'Create local explorer profile';
      googleFallbackSignIn.title = 'Skip Google Sign-In and save your progress locally on this device.';
    }
  }

  if (scoreboardStatusEl) {
    let statusText = '';
    if (!signedIn) {
      statusText = 'Sign in with Google to view the multiverse scorecard.';
    } else if (identityState.loadingScores) {
      statusText = 'Loading score data...';
    } else if (!identityState.scoreboard.length) {
      statusText = 'No scores recorded yet.';
    } else if (identityState.scoreboardSource === 'sample') {
      statusText = 'Showing sample data. Connect the API to DynamoDB for live scores.';
    } else if (identityState.scoreboardSource === 'local') {
      statusText = 'Scores are saved locally on this device.';
    }
    scoreboardStatusEl.textContent = statusText;
    scoreboardStatusEl.hidden = statusText === '';
  }

  renderScoreboard(identityState.scoreboard);
}

function renderScoreboard(entries) {
  if (!scoreboardListEl) return;
  scoreboardListEl.innerHTML = '';
  if (!entries?.length) return;
  entries
    .slice()
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .forEach((entry, index) => {
      const item = document.createElement('li');
      item.className = 'score-entry';

      const rank = document.createElement('span');
      rank.className = 'rank';
      rank.textContent = (index + 1).toString();

      const body = document.createElement('div');
      body.className = 'score-entry__body';
      const name = document.createElement('strong');
      name.textContent = entry.name ?? 'Explorer';
      const details = document.createElement('span');
      const dimensionCount = entry.dimensionCount ?? 0;
      const inventoryCount = entry.inventoryCount ?? 0;
      details.textContent = `${formatScoreNumber(entry.score)} pts · ${dimensionCount} realms · ${formatRunTime(
        entry.runTimeSeconds
      )} · ${inventoryCount} items`;
      body.append(name, details);

      const meta = document.createElement('div');
      meta.className = 'score-entry__meta';
      const location = document.createElement('span');
      location.textContent = formatLocationLabel(entry);
      meta.appendChild(location);
      if (entry.updatedAt) {
        const updated = document.createElement('span');
        try {
          updated.textContent = `Updated ${new Date(entry.updatedAt).toLocaleString()}`;
        } catch (error) {
          updated.textContent = `Updated ${entry.updatedAt}`;
        }
        meta.appendChild(updated);
      }

      item.append(rank, body, meta);
      scoreboardListEl.appendChild(item);
    });
}

function decodeJwt(token) {
  if (!token) return null;
  const payload = token.split('.')[1];
  if (!payload) return null;
  const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
  try {
    const decoded = atob(normalized);
    const json = decodeURIComponent(
      Array.prototype.map
        .call(decoded, (char) => `%${`00${char.charCodeAt(0).toString(16)}`.slice(-2)}`)
        .join('')
    );
    return JSON.parse(json);
  } catch (error) {
    console.warn('Failed to decode Google credential.', error);
    return null;
  }
}

function ensureLocalProfileId() {
  let identifier = null;
  try {
    identifier = localStorage.getItem(LOCAL_PROFILE_ID_KEY);
  } catch (error) {
    console.warn('Unable to read cached local profile identifier.', error);
  }
  if (!identifier) {
    const randomId =
      (window.crypto?.randomUUID?.() && `local-${window.crypto.randomUUID()}`) ||
      `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    identifier = randomId;
    try {
      localStorage.setItem(LOCAL_PROFILE_ID_KEY, identifier);
    } catch (error) {
      console.warn('Unable to persist local profile identifier.', error);
    }
  }
  return identifier;
}

function promptDisplayName(defaultName) {
  const base = defaultName ?? 'Explorer';
  const response = window.prompt("What's your name?", base);
  const trimmed = response?.trim();
  return trimmed || base;
}

async function handleGoogleCredentialResponse({ credential }) {
  const decoded = decodeJwt(credential);
  if (!decoded) {
    console.warn('Received invalid Google credential payload.');
    return;
  }
  const defaultName = decoded.name ?? decoded.given_name ?? (decoded.email ? decoded.email.split('@')[0] : 'Explorer');
  const preferredName = promptDisplayName(defaultName);
  await finalizeSignIn({ ...decoded, credential }, preferredName);
}

async function handleLocalProfileSignIn() {
  const preferredName = promptDisplayName(identityState.displayName ?? 'Explorer');
  const localId = ensureLocalProfileId();
  identityState.googleProfile = {
    sub: localId,
    email: null,
    picture: null,
    local: true,
  };
  identityState.displayName = preferredName;
  identityState.device = collectDeviceSnapshot();
  updateIdentityUI();
  if (!identityState.location) {
    identityState.location = await captureLocation();
    updateIdentityUI();
  }
  await syncUserMetadata();
  await loadScoreboard();
}

async function finalizeSignIn(profile, preferredName) {
  const googleId =
    profile.sub ?? profile.user_id ?? profile.id ?? (profile.email ? `email:${profile.email}` : `guest:${Date.now()}`);
  identityState.googleProfile = {
    sub: googleId,
    email: profile.email ?? null,
    picture: profile.picture ?? null,
  };
  identityState.displayName = preferredName ?? profile.name ?? 'Explorer';
  identityState.device = collectDeviceSnapshot();
  updateIdentityUI();

  identityState.location = await captureLocation();
  updateIdentityUI();

  await syncUserMetadata();
  await loadScoreboard();
}

function attemptGoogleInit(retries = 12) {
  if (!appConfig.googleClientId) {
    identityState.googleInitialized = false;
    updateIdentityUI();
    return;
  }
  if (window.google?.accounts?.id) {
    google.accounts.id.initialize({
      client_id: appConfig.googleClientId,
      callback: handleGoogleCredentialResponse,
      ux_mode: 'popup',
      auto_select: false,
    });
    if (googleButtonContainer) {
      google.accounts.id.renderButton(googleButtonContainer, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: 'signin_with',
        shape: 'pill',
        width: 260,
      });
      googleButtonContainer.hidden = false;
    }
    identityState.googleInitialized = true;
    updateIdentityUI();
    return;
  }
  if (retries > 0) {
    setTimeout(() => attemptGoogleInit(retries - 1), 400);
  } else {
    identityState.googleInitialized = false;
    updateIdentityUI();
  }
}

function attemptGoogleSignInFlow() {
  if (!appConfig.googleClientId) {
    console.warn('Google client ID missing.');
    return;
  }
  if (!identityState.googleInitialized) {
    attemptGoogleInit();
  }
  if (window.google?.accounts?.id && identityState.googleInitialized) {
    google.accounts.id.prompt((notification) => {
      if (notification.isNotDisplayed?.()) {
        console.warn('Google Sign-In prompt was not displayed.', notification.getNotDisplayedReason?.());
      }
      if (notification.isSkippedMoment?.()) {
        console.warn('Google Sign-In prompt was skipped.', notification.getSkippedReason?.());
      }
    });
  } else {
    alert('Google Sign-In is still initialising. Please try again in a moment.');
  }
}

async function handleGoogleSignOut() {
  identityState.googleProfile = null;
  identityState.displayName = null;
  identityState.location = null;
  identityState.scoreboard = [];
  identityState.scoreboardSource = 'remote';
  identityState.loadingScores = false;
  state.scoreSubmitted = false;
  if (window.google?.accounts?.id) {
    google.accounts.id.disableAutoSelect();
  }
  updateIdentityUI();
  identityState.location = await captureLocation();
  updateIdentityUI();
}

async function syncUserMetadata() {
  if (!identityState.googleProfile) return;
  const payload = {
    googleId: identityState.googleProfile.sub,
    name: identityState.displayName,
    email: identityState.googleProfile.email,
    location: identityState.location,
    device: identityState.device,
    lastSeenAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(
      PROFILE_STORAGE_KEY,
      JSON.stringify({ name: payload.name, location: payload.location, lastSeenAt: payload.lastSeenAt })
    );
  } catch (error) {
    console.warn('Unable to persist profile preferences locally.', error);
  }
  if (!appConfig.apiBaseUrl) return;
  try {
    await fetch(`${appConfig.apiBaseUrl.replace(/\/$/, '')}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.warn('Failed to sync user metadata with API.', error);
  }
}

function loadLocalScores() {
  let storedEntries = null;
  try {
    const stored = localStorage.getItem(SCOREBOARD_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length) {
        storedEntries = parsed;
      }
    }
  } catch (error) {
    console.warn('Unable to load cached scores.', error);
  }
  if (storedEntries) {
    return { entries: storedEntries, source: 'local' };
  }
  return {
    entries: [
    {
      id: 'sample-aurora',
      name: 'Aurora',
      score: 2450,
      dimensionCount: 4,
      runTimeSeconds: 1420,
      inventoryCount: 36,
      locationLabel: 'Northern Citadel',
      updatedAt: new Date(Date.now() - 86400000).toISOString(),
    },
    {
      id: 'sample-zenith',
      name: 'Zenith',
      score: 1980,
      dimensionCount: 3,
      runTimeSeconds: 1185,
      inventoryCount: 28,
      locationLabel: 'Lunar Outpost',
      updatedAt: new Date(Date.now() - 172800000).toISOString(),
    },
    {
      id: 'sample-orbit',
      name: 'Orbit',
      score: 1675,
      dimensionCount: 3,
      runTimeSeconds: 960,
      inventoryCount: 24,
      locationLabel: 'Synthwave Reef',
      updatedAt: new Date(Date.now() - 259200000).toISOString(),
    },
    ],
    source: 'sample',
  };
}

function saveLocalScores(entries) {
  try {
    localStorage.setItem(SCOREBOARD_STORAGE_KEY, JSON.stringify(entries));
  } catch (error) {
    console.warn('Unable to cache scores locally.', error);
  }
}

function normalizeScoreEntries(entries = []) {
  return entries
    .map((entry) => ({
      id: entry.id ?? entry.googleId ?? entry.playerId ?? `guest-${Math.random().toString(36).slice(2)}`,
      name: entry.name ?? entry.displayName ?? 'Explorer',
      score: Number(entry.score ?? entry.points ?? 0),
      dimensionCount: Number(entry.dimensionCount ?? entry.dimensions ?? entry.realms ?? 0),
      runTimeSeconds: Number(entry.runTimeSeconds ?? entry.runtimeSeconds ?? entry.runtime ?? 0),
      inventoryCount: Number(entry.inventoryCount ?? entry.resources ?? entry.items ?? 0),
      location: entry.location ??
        (entry.latitude !== undefined && entry.longitude !== undefined
          ? { latitude: entry.latitude, longitude: entry.longitude }
          : null),
      locationLabel: entry.locationLabel ?? entry.location?.label ?? entry.locationName ?? null,
      updatedAt: entry.updatedAt ?? entry.lastUpdated ?? entry.updated_at ?? null,
    }))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}

function upsertScoreEntry(entries, entry) {
  const next = entries.slice();
  const index = next.findIndex((item) => item.id === entry.id);
  if (index >= 0) {
    if ((entry.score ?? 0) >= (next[index].score ?? 0)) {
      next[index] = { ...next[index], ...entry };
    } else {
      next[index] = { ...entry, score: next[index].score };
    }
  } else {
    next.push(entry);
  }
  return normalizeScoreEntries(next);
}

async function loadScoreboard() {
  if (!identityState.googleProfile) {
    identityState.scoreboard = [];
    identityState.scoreboardSource = 'remote';
    identityState.loadingScores = false;
    updateIdentityUI();
    return;
  }
  identityState.loadingScores = true;
  updateIdentityUI();
  let entries = [];
  if (appConfig.apiBaseUrl) {
    try {
      const response = await fetch(`${appConfig.apiBaseUrl.replace(/\/$/, '')}/scores`);
      if (response.ok) {
        const payload = await response.json();
        entries = Array.isArray(payload) ? payload : payload?.items ?? [];
        identityState.scoreboardSource = 'remote';
      }
    } catch (error) {
      console.warn('Unable to load remote scoreboard.', error);
    }
  }
  if (!entries.length) {
    const localResult = loadLocalScores();
    entries = localResult.entries;
    identityState.scoreboardSource = localResult.source;
  }
  identityState.scoreboard = normalizeScoreEntries(entries);
  identityState.loadingScores = false;
  updateIdentityUI();
}

async function recordScore(snapshot) {
  if (!identityState.googleProfile) return;
  const entry = {
    id: identityState.googleProfile.sub,
    name: identityState.displayName ?? 'Explorer',
    score: snapshot.score,
    dimensionCount: snapshot.dimensionCount,
    runTimeSeconds: snapshot.runTimeSeconds,
    inventoryCount: snapshot.inventoryCount,
    location: identityState.location && !identityState.location.error ? identityState.location : null,
    locationLabel: identityState.location?.label ?? null,
    updatedAt: new Date().toISOString(),
  };
  identityState.scoreboard = upsertScoreEntry(identityState.scoreboard, entry);
  if (!appConfig.apiBaseUrl) {
    identityState.scoreboardSource = 'local';
  }
  saveLocalScores(identityState.scoreboard);
  updateIdentityUI();
  if (appConfig.apiBaseUrl) {
    try {
      await fetch(`${appConfig.apiBaseUrl.replace(/\/$/, '')}/scores`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...entry,
          googleId: identityState.googleProfile.sub,
          email: identityState.googleProfile.email,
        }),
      });
    } catch (error) {
      console.warn('Failed to sync score with API.', error);
    }
  }
  await syncUserMetadata();
}

function computeScoreSnapshot() {
  const uniqueDimensions = new Set(state.dimensionHistory ?? []).size;
  const inventoryBundles = mergeInventory();
  const satchelCount = state.player.satchel?.reduce((sum, bundle) => sum + (bundle?.quantity ?? 0), 0) ?? 0;
  const inventoryCount = inventoryBundles.reduce((sum, bundle) => sum + bundle.quantity, 0) + satchelCount;
  const heartsScore = (state.player.hearts ?? 0) * 40;
  const baseScore = uniqueDimensions * 500 + inventoryCount * 25 + heartsScore;
  return {
    score: Math.round(baseScore),
    dimensionCount: uniqueDimensions,
    runTimeSeconds: Math.round(state.elapsed ?? 0),
    inventoryCount,
  };
}

function handleVictoryAchieved() {
  if (state.scoreSubmitted) return;
  state.scoreSubmitted = true;
  if (!identityState.googleProfile) {
    logEvent('Sign in with Google to publish your victory on the multiverse scoreboard.');
    return;
  }
  const snapshot = computeScoreSnapshot();
  recordScore(snapshot);
}

async function captureLocation() {
  if (!('geolocation' in navigator)) {
    return { error: 'Geolocation unavailable' };
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp,
        });
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          resolve({ error: 'Permission denied' });
        } else {
          resolve({ error: error.message || 'Location unavailable' });
        }
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
    );
  });
}

async function initializeIdentityLayer() {
  identityState.device = collectDeviceSnapshot();
  try {
    const cachedProfile = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (cachedProfile) {
      const parsed = JSON.parse(cachedProfile);
      if (parsed?.name && !identityState.displayName) {
        identityState.displayName = parsed.name;
      }
      if (parsed?.location && !identityState.location) {
        identityState.location = parsed.location;
      }
    }
  } catch (error) {
    console.warn('Unable to hydrate cached profile.', error);
  }
  updateIdentityUI();
  attemptGoogleInit();
  googleFallbackSignIn?.addEventListener('click', () => {
    if (appConfig.googleClientId) {
      attemptGoogleSignInFlow();
    } else {
      handleLocalProfileSignIn();
    }
  });
  googleSignOutButton?.addEventListener('click', handleGoogleSignOut);
  refreshScoresButton?.addEventListener('click', () => {
    if (!identityState.googleProfile) {
      updateIdentityUI();
      return;
    }
    loadScoreboard();
  });
  if (!identityState.location) {
    identityState.location = await captureLocation();
    updateIdentityUI();
  }
}

startButton.addEventListener('click', startGame);
initEventListeners();

setupGuideModal();
initializeIdentityLayer();
updateLayoutMetrics();
syncSidebarForViewport();

function openGuideModal() {
  if (!guideModal) return;
  guideModal.hidden = false;
  guideModal.setAttribute('data-open', 'true');
  guideModal.setAttribute('aria-hidden', 'false');
  const scrollHost = guideModal.querySelector('[data-guide-scroll]');
  if (scrollHost) {
    scrollHost.scrollTop = 0;
  }
  const closeButton = guideModal.querySelector('[data-close-guide]');
  closeButton?.focus();
}

function closeGuideModal() {
  if (!guideModal) return;
  guideModal.hidden = true;
  guideModal.setAttribute('data-open', 'false');
  guideModal.setAttribute('aria-hidden', 'true');
}

function setupGuideModal() {
  if (!guideModal) return;
  guideModal.setAttribute('data-open', 'false');
  guideModal.setAttribute('aria-hidden', 'true');
  guideModal.addEventListener('click', (event) => {
    if (event.target === guideModal) {
      closeGuideModal();
    }
  });
  guideModal.querySelectorAll('[data-close-guide]').forEach((button) => {
    button.addEventListener('click', closeGuideModal);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !guideModal.hidden) {
      closeGuideModal();
    }
  });
}

