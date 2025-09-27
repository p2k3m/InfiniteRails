(function () {
  const WORLD_SIZE = 64;
  const BLOCK_SIZE = 1;
  const PLAYER_EYE_HEIGHT = 1.7;
  const PLAYER_BASE_SPEED = 4.5;
  const PLAYER_INERTIA = 0.88;
  const DAY_LENGTH_SECONDS = 600;
  const POINTER_SENSITIVITY = 0.0022;
  const FALLBACK_HEALTH = 10;
  const PORTAL_BLOCK_REQUIREMENT = 10;
  const PORTAL_INTERACTION_RANGE = 4.5;
  const ZOMBIE_CONTACT_RANGE = 1.35;
  const ZOMBIE_SPAWN_INTERVAL = 8;
  const ZOMBIE_MAX_PER_DIMENSION = 4;
  const HOTBAR_SLOTS = 9;
  const MAX_STACK_SIZE = 99;
  const GOLEM_CONTACT_RANGE = 1.6;
  const GOLEM_SPAWN_INTERVAL = 26;
  const GOLEM_MAX_PER_DIMENSION = 2;

  const GLTF_LOADER_URLS = [
    'vendor/GLTFLoader.js',
    'https://unpkg.com/three@0.161.0/examples/js/loaders/GLTFLoader.js',
    'https://cdn.jsdelivr.net/npm/three@0.161.0/examples/js/loaders/GLTFLoader.js',
  ];

  const RECIPE_UNLOCK_STORAGE_KEY = 'infinite-rails-recipe-unlocks';

  const PORTAL_MECHANICS =
    (typeof window !== 'undefined' && window.PortalMechanics) ||
    (typeof globalThis !== 'undefined' && globalThis.PortalMechanics) ||
    null;

  const MODEL_URLS = {
    arm: 'assets/arm.gltf',
    steve: 'assets/steve.gltf',
    zombie: 'assets/zombie.gltf',
    golem: 'assets/iron_golem.gltf',
  };

  let cachedGltfLoaderPromise = null;

  function loadExternalScript(url) {
    return new Promise((resolve, reject) => {
      if (typeof document === 'undefined') {
        reject(new Error('Document is unavailable for script injection.'));
        return;
      }
      const existing = document.querySelector(`script[data-src="${url}"]`);
      if (existing) {
        if (existing.hasAttribute('data-loaded')) {
          resolve();
          return;
        }
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener(
          'error',
          () => reject(new Error(`Failed to load script: ${url}`)),
          { once: true },
        );
        return;
      }
      const script = document.createElement('script');
      script.src = url;
      script.async = false;
      script.dataset.src = url;
      script.addEventListener('load', () => {
        script.setAttribute('data-loaded', 'true');
        resolve();
      });
      script.addEventListener('error', () => {
        script.remove();
        reject(new Error(`Failed to load script: ${url}`));
      });
      document.head.appendChild(script);
    });
  }

  function tryLoadGltfLoader(index = 0) {
    if (index >= GLTF_LOADER_URLS.length) {
      return Promise.reject(new Error('Unable to load any GLTFLoader sources.'));
    }
    const url = GLTF_LOADER_URLS[index];
    return loadExternalScript(url).catch(() => tryLoadGltfLoader(index + 1));
  }

  function ensureGltfLoader(THREE) {
    if (!THREE) {
      return Promise.reject(new Error('Three.js is unavailable; cannot initialise GLTFLoader.'));
    }
    if (THREE.GLTFLoader) {
      return Promise.resolve(THREE.GLTFLoader);
    }
    if (!cachedGltfLoaderPromise) {
      const scope = typeof window !== 'undefined' ? window : globalThis;
      cachedGltfLoaderPromise = tryLoadGltfLoader()
        .then(() => {
          if (!THREE.GLTFLoader && scope?.GLTFLoaderModule?.GLTFLoader) {
            THREE.GLTFLoader = scope.GLTFLoaderModule.GLTFLoader;
          }
          if (!THREE.GLTFLoader) {
            throw new Error('GLTFLoader script loaded but did not register the loader.');
          }
          return THREE.GLTFLoader;
        })
        .catch((error) => {
          cachedGltfLoaderPromise = null;
          throw error;
        });
    }
    return cachedGltfLoaderPromise;
  }

  function disposeObject3D(object) {
    if (!object || typeof object.traverse !== 'function') return;
    object.traverse((child) => {
      if (child.isMesh) {
        if (Array.isArray(child.material)) {
          child.material.forEach((material) => material?.dispose?.());
        } else {
          child.material?.dispose?.();
        }
        child.geometry?.dispose?.();
      }
    });
  }

  const ITEM_DEFINITIONS = {
    'grass-block': { label: 'Grass Block', icon: '🟩', placeable: true },
    dirt: { label: 'Soil Chunk', icon: '🟫', placeable: true },
    stone: { label: 'Stone Brick', icon: '⬜', placeable: true },
    stick: { label: 'Stick', icon: '🪵', placeable: false },
    'stone-pickaxe': { label: 'Stone Pickaxe', icon: '⛏️', placeable: false, equipment: true },
    'portal-charge': { label: 'Portal Charge', icon: '🌀', placeable: false },
  };
  const DIMENSION_THEME = [
    {
      id: 'origin',
      name: 'Origin Grassland',
      palette: {
        grass: '#69c368',
        dirt: '#b07a42',
        stone: '#9d9d9d',
        rails: '#c9a14d',
      },
      fog: '#87ceeb',
      sky: '#87ceeb',
      sun: '#ffffff',
      hemi: '#bddcff',
      gravity: 1,
      speedMultiplier: 1,
      description:
        'Gentle plains with forgiving gravity. Harvest and craft to stabilise the portal frame.',
    },
    {
      id: 'rock',
      name: 'Rock Frontier',
      palette: {
        grass: '#7b858a',
        dirt: '#5d6468',
        stone: '#3b4248',
        rails: '#e0b072',
      },
      fog: '#65727c',
      sky: '#4d565f',
      sun: '#f6f1d9',
      hemi: '#5b748a',
      gravity: 1.35,
      speedMultiplier: 0.92,
      description:
        'Heavier steps and denser air. Keep momentum up and beware of zombies charging along the rails.',
    },
    {
      id: 'stone',
      name: 'Stone Bastion',
      palette: {
        grass: '#a0a8ad',
        dirt: '#6c7479',
        stone: '#525a60',
        rails: '#d7b16f',
      },
      fog: '#6f7b84',
      sky: '#5d6870',
      sun: '#f0e8d2',
      hemi: '#70808a',
      gravity: 1.18,
      speedMultiplier: 0.9,
      description:
        'Fortified cliffs that demand precise jumps. Blocks are dense but reward extra portal charge fragments.',
    },
    {
      id: 'tar',
      name: 'Tar Marsh',
      palette: {
        grass: '#3c3a45',
        dirt: '#2d2b33',
        stone: '#1f1e25',
        rails: '#ffb347',
      },
      fog: '#1f1a21',
      sky: '#261c2f',
      sun: '#ffb347',
      hemi: '#45364d',
      gravity: 0.85,
      speedMultiplier: 1.1,
      description:
        'Low gravity swamp. Use the extra lift to hop across gaps while night creatures emerge from the mist.',
    },
    {
      id: 'marble',
      name: 'Marble Heights',
      palette: {
        grass: '#f3f6fb',
        dirt: '#d7dce5',
        stone: '#c0c7d4',
        rails: '#ffd27f',
      },
      fog: '#cfd7e4',
      sky: '#e3e8f4',
      sun: '#ffffff',
      hemi: '#d5deef',
      gravity: 0.95,
      speedMultiplier: 1.18,
      description:
        'Floating terraces of marble that accelerate explorers. Keep your footing while rails twist in the breeze.',
    },
    {
      id: 'netherite',
      name: 'Netherite Terminus',
      palette: {
        grass: '#4c1f24',
        dirt: '#321016',
        stone: '#14070a',
        rails: '#ff7043',
      },
      fog: '#160607',
      sky: '#1a0304',
      sun: '#ff7043',
      hemi: '#471414',
      gravity: 1.15,
      speedMultiplier: 1,
      description:
        'Final gauntlet of collapsing rails. Activate the portal swiftly to claim the Eternal Ingot.',
    },
  ];

  function pseudoRandom(x, z) {
    const value = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
    return value - Math.floor(value);
  }

  function getItemDefinition(id) {
    if (!id) {
      return { label: 'Empty', icon: '·', placeable: false };
    }
    return ITEM_DEFINITIONS[id] || { label: id, icon: '⬜', placeable: false };
  }

  function formatInventoryLabel(item, quantity) {
    const def = getItemDefinition(item);
    const count = Number.isFinite(quantity) ? quantity : 0;
    return `${def.icon} ${def.label}${count > 1 ? ` ×${count}` : ''}`;
  }

  function createHeartMarkup(health) {
    const fullHearts = Math.floor(health / 2);
    const halfHeart = health % 2;
    const pieces = [];
    for (let i = 0; i < 5; i += 1) {
      const index = i * 2;
      let glyph = '♡';
      if (index + 1 <= fullHearts) {
        glyph = '❤';
      } else if (index < fullHearts + halfHeart) {
        glyph = '❥';
      }
      const span = `<span class="heart-icon" aria-hidden="true">${glyph}</span>`;
      pieces.push(span);
    }
    return `<span class="hud-hearts" role="img" aria-label="${health / 2} hearts remaining">${pieces.join('')}</span>`;
  }

  class SimpleExperience {
    constructor(options) {
      if (!options || !options.canvas) {
        throw new Error('SimpleExperience requires a target canvas element.');
      }
      const THREE = window.THREE_GLOBAL || window.THREE;
      if (!THREE) {
        throw new Error('Three.js is required for the simplified experience.');
      }
      this.THREE = THREE;
      this.canvas = options.canvas;
      this.ui = options.ui || {};
      this.apiBaseUrl = options.apiBaseUrl || null;
      this.playerDisplayName = (options.playerName || '').trim() || 'Explorer';
      this.defaultPlayerName = this.playerDisplayName;
      this.playerGoogleId = null;
      this.playerEmail = null;
      this.playerAvatarUrl = null;
      this.playerLocation = null;
      this.playerLocationLabel = 'Location hidden';
      this.deviceLabel = this.describeDevice();
      this.scene = null;
      this.camera = null;
      this.renderer = null;
      this.sunLight = null;
      this.hemiLight = null;
      this.terrainGroup = null;
      this.railsGroup = null;
      this.portalGroup = null;
      this.zombieGroup = null;
      this.portalMechanics = PORTAL_MECHANICS;
      this.playerRig = null;
      this.handGroup = null;
      this.handMaterials = [];
      this.handMaterialsDynamic = true;
      this.handModelLoaded = false;
      this.playerAvatar = null;
      this.playerMixer = null;
      this.playerIdleAction = null;
      this.handSwingStrength = 0;
      this.handSwingTimer = 0;
      this.modelPromises = new Map();
      this.loadedModels = new Map();
      this.scoreboardListEl = this.ui.scoreboardListEl || null;
      this.scoreboardStatusEl = this.ui.scoreboardStatusEl || null;
      this.refreshScoresButton = this.ui.refreshScoresButton || null;
      this.scoreboardContainer = this.scoreboardListEl?.closest('#leaderboardTable') || null;
      this.scoreboardEmptyEl =
        (typeof document !== 'undefined' && document.getElementById('leaderboardEmptyMessage')) || null;
      this.scoreboardPollIntervalSeconds = 45;
      this.scoreboardPollTimer = 0;
      this.lastScoreboardFetch = 0;
      this.hotbarEl = this.ui.hotbarEl || null;
      this.playerHintEl = this.ui.playerHintEl || null;
      this.craftingModal = this.ui.craftingModal || null;
      this.craftSequenceEl = this.ui.craftSequenceEl || null;
      this.craftingInventoryEl = this.ui.craftingInventoryEl || null;
      this.craftSuggestionsEl = this.ui.craftSuggestionsEl || null;
      this.craftButton = this.ui.craftButton || null;
      this.clearCraftButton = this.ui.clearCraftButton || null;
      this.craftLauncherButton = this.ui.craftLauncherButton || null;
      this.closeCraftingButton = this.ui.closeCraftingButton || null;
      this.craftingSearchPanel = this.ui.craftingSearchPanel || null;
      this.craftingSearchInput = this.ui.craftingSearchInput || null;
      this.craftingSearchResultsEl = this.ui.craftingSearchResultsEl || null;
      this.openCraftingSearchButton = this.ui.openCraftingSearchButton || null;
      this.closeCraftingSearchButton = this.ui.closeCraftingSearchButton || null;
      this.inventoryModal = this.ui.inventoryModal || null;
      this.inventoryGridEl = this.ui.inventoryGridEl || null;
      this.inventorySortButton = this.ui.inventorySortButton || null;
      this.inventoryOverflowEl = this.ui.inventoryOverflowEl || null;
      this.closeInventoryButton = this.ui.closeInventoryButton || null;
      const openInventorySource = this.ui.openInventoryButtons || [];
      this.openInventoryButtons = Array.isArray(openInventorySource)
        ? openInventorySource
        : Array.from(openInventorySource);
      this.columns = new Map();
      this.heightMap = Array.from({ length: WORLD_SIZE }, () => Array(WORLD_SIZE).fill(0));
      this.blockGeometry = new THREE.BoxGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
      this.railGeometry = new THREE.BoxGeometry(BLOCK_SIZE * 0.9, BLOCK_SIZE * 0.15, BLOCK_SIZE * 1.2);
      this.textureCache = new Map();
      this.materials = this.createMaterials();
      this.keys = new Set();
      this.velocity = new THREE.Vector3();
      this.tmpForward = new THREE.Vector3();
      this.tmpRight = new THREE.Vector3();
      this.tmpVector = new THREE.Vector3();
      this.tmpVector2 = new THREE.Vector3();
      this.tmpVector3 = new THREE.Vector3();
      this.tmpQuaternion = new THREE.Quaternion();
      this.cameraBaseOffset = new THREE.Vector3();
      this.cameraShakeOffset = new THREE.Vector3();
      this.cameraShakeRotation = new THREE.Euler();
      this.cameraShakeNoise = new THREE.Vector3();
      this.cameraShakeDuration = 0;
      this.cameraShakeTime = 0;
      this.cameraShakeIntensity = 0;
      this.pointerLocked = false;
      this.yaw = 0;
      this.pitch = 0;
      this.elapsed = 0;
      this.health = FALLBACK_HEALTH;
      this.score = 0;
      this.blocksMined = 0;
      this.blocksPlaced = 0;
      this.portalBlocksPlaced = 0;
      this.portalActivated = false;
      this.portalReady = false;
      this.portalMesh = null;
      this.portalActivations = 0;
      this.portalHintShown = false;
      this.portalState = null;
      this.portalIgnitionLog = [];
      this.victoryAchieved = false;
      this.currentDimensionIndex = 0;
      this.dimensionSettings = DIMENSION_THEME[0];
      this.currentSpeed = PLAYER_BASE_SPEED;
      this.gravityScale = this.dimensionSettings.gravity;
      this.verticalVelocity = 0;
      this.isGrounded = false;
      this.portalAnchor = new THREE.Vector3(0, 0, -WORLD_SIZE * 0.45);
      this.initialHeightMap = [];
      this.portalAnchorGrid = this.computePortalAnchorGrid();
      this.portalFrameLayout = this.createPortalFrameLayout();
      this.portalFrameSlots = new Map();
      this.portalFrameRequiredCount = PORTAL_BLOCK_REQUIREMENT;
      this.portalFrameInteriorValid = false;
      this.portalHiddenInterior = [];
      this.terrainChunkSize = 8;
      this.terrainChunkGroups = [];
      this.terrainChunkMap = new Map();
      this.dirtyTerrainChunks = new Set();
      this.chunkFrustum = new THREE.Frustum();
      this.chunkFrustumMatrix = new THREE.Matrix4();
      this.terrainCullingAccumulator = 0;
      this.terrainCullingInterval = 0.08;
      this.debugChunkCulling = this.detectChunkDebugFlag();
      this.lastCullingDebugLog = 0;
      this.zombies = [];
      this.lastZombieSpawn = 0;
      this.zombieIdCounter = 0;
      this.zombieGeometry = null;
      this.golems = [];
      this.golemGroup = null;
      this.lastGolemSpawn = 0;
      this.scoreboardUtils = window.ScoreboardUtils || null;
      this.scoreEntries = [];
      this.sessionId =
        (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
      this.scoreSyncInFlight = false;
      this.pendingScoreSyncReason = null;
      this.lastScoreSyncAt = 0;
      this.scoreSyncCooldownSeconds = 6;
      this.scoreboardHydrated = false;
      this.scoreSyncHeartbeat = 0;
      this.portalFrameGeometryVertical = null;
      this.portalFrameGeometryHorizontal = null;
      this.portalPlaneGeometry = null;
      this.daylightIntensity = 1;
      this.raycaster = new THREE.Raycaster();
      this.hotbar = Array.from({ length: HOTBAR_SLOTS }, () => ({ item: null, quantity: 0 }));
      this.selectedHotbarIndex = 0;
      this.satchel = new Map();
      this.craftingState = {
        sequence: [],
        unlocked: new Map(),
        searchTerm: '',
      };
      this.craftingRecipes = this.createCraftingRecipes();
      this.craftedRecipes = new Set();
      this.restorePersistentUnlocks();
      this.animationFrame = null;
      this.briefingAutoHideTimer = null;
      this.briefingFadeTimer = null;
      this.started = false;
      this.prevTime = null;
      this.mobileControlsRoot = this.ui.mobileControls || null;
      this.virtualJoystickEl = this.ui.virtualJoystick || null;
      this.virtualJoystickThumb = this.ui.virtualJoystickThumb || null;
      this.touchButtonStates = { up: false, down: false, left: false, right: false };
      this.joystickVector = new THREE.Vector2();
      this.joystickPointerId = null;
      this.touchLookPointerId = null;
      this.touchLookLast = null;
      this.touchActionStart = 0;
      this.touchActionPending = false;
      this.touchJumpRequested = false;
      this.mobileControlDisposers = [];
      this.isTouchPreferred = this.detectTouchPreferred();
      this.audio = this.createAudioController();
      this.onPointerLockChange = this.handlePointerLockChange.bind(this);
      this.onPointerLockError = this.handlePointerLockError.bind(this);
      this.onMouseMove = this.handleMouseMove.bind(this);
      this.onKeyDown = this.handleKeyDown.bind(this);
      this.onKeyUp = this.handleKeyUp.bind(this);
      this.onResize = this.handleResize.bind(this);
      this.onMouseDown = this.handleMouseDown.bind(this);
      this.preventContextMenu = (event) => event.preventDefault();
      this.onDismissBriefing = this.handleBriefingDismiss.bind(this);
      this.onJoystickPointerDown = this.handleJoystickPointerDown.bind(this);
      this.onJoystickPointerMove = this.handleJoystickPointerMove.bind(this);
      this.onJoystickPointerUp = this.handleJoystickPointerUp.bind(this);
      this.onTouchButtonPress = this.handleTouchButtonPress.bind(this);
      this.onTouchButtonRelease = this.handleTouchButtonRelease.bind(this);
      this.onPortalButton = this.handlePortalButton.bind(this);
      this.onTouchLookPointerDown = this.handleTouchLookPointerDown.bind(this);
      this.onTouchLookPointerMove = this.handleTouchLookPointerMove.bind(this);
      this.onTouchLookPointerUp = this.handleTouchLookPointerUp.bind(this);
      this.onHotbarClick = this.handleHotbarClick.bind(this);
      this.onCanvasWheel = this.handleCanvasWheel.bind(this);
      this.onCraftButton = this.handleCraftButton.bind(this);
      this.onClearCraft = this.handleClearCraft.bind(this);
      this.onOpenCrafting = this.handleOpenCrafting.bind(this);
      this.onCloseCrafting = this.handleCloseCrafting.bind(this);
      this.onCraftSequenceClick = this.handleCraftSequenceClick.bind(this);
      this.onCraftSuggestionClick = this.handleCraftSuggestionClick.bind(this);
      this.onCraftSearchInput = this.handleCraftSearchInput.bind(this);
      this.onInventorySort = this.handleInventorySort.bind(this);
      this.onInventoryToggle = this.handleInventoryToggle.bind(this);
      this.onCraftingInventoryClick = this.handleCraftingInventoryClick.bind(this);
      this.onVictoryReplay = this.handleVictoryReplay.bind(this);
      this.onCraftingModalBackdrop = (event) => {
        if (event?.target === this.craftingModal) {
          this.handleCloseCrafting(event);
        }
      };
    }

    start() {
      if (this.started) return;
      this.started = true;
      this.setupScene();
      this.preloadCharacterModels();
      this.loadFirstPersonArms();
      this.initializeScoreboardUi();
      this.applyDimensionSettings(this.currentDimensionIndex);
      this.buildTerrain();
      this.buildRails();
      this.refreshPortalState();
      this.positionPlayer();
      this.bindEvents();
      this.initializeMobileControls();
      this.updateHud();
      this.refreshCraftingUi();
      this.hideIntro();
      this.showBriefingOverlay();
      this.updateLocalScoreEntry('start');
      this.loadScoreboard();
      this.renderFrame(performance.now());
    }

    hideIntro() {
      const { introModal, startButton, hudRootEl } = this.ui;
      if (introModal) {
        introModal.hidden = true;
        introModal.style.display = 'none';
        introModal.setAttribute('aria-hidden', 'true');
      }
      if (startButton) {
        startButton.disabled = true;
        startButton.setAttribute('aria-hidden', 'true');
        startButton.setAttribute('tabindex', '-1');
        startButton.blur();
      }
      if (hudRootEl) {
        document.body.classList.add('game-active');
      }
      this.canvas.focus({ preventScroll: true });
    }

    showBriefingOverlay() {
      const briefing = this.ui?.gameBriefing;
      if (!briefing) return;
      const timerHost = typeof window !== 'undefined' ? window : globalThis;
      timerHost.clearTimeout(this.briefingAutoHideTimer);
      timerHost.clearTimeout(this.briefingFadeTimer);
      briefing.hidden = false;
      briefing.setAttribute('aria-hidden', 'false');
      requestAnimationFrame(() => {
        briefing.classList.add('is-visible');
      });
      const dismissButton = this.ui?.dismissBriefingButton;
      if (dismissButton) {
        dismissButton.disabled = false;
        dismissButton.addEventListener('click', this.onDismissBriefing, { once: true });
      }
      this.briefingAutoHideTimer = timerHost.setTimeout(() => {
        this.hideBriefingOverlay();
      }, 5000);
    }

    handleBriefingDismiss(event) {
      if (event?.preventDefault) {
        event.preventDefault();
      }
      this.hideBriefingOverlay(true);
    }

    hideBriefingOverlay(force = false) {
      const briefing = this.ui?.gameBriefing;
      if (!briefing) return;
      const timerHost = typeof window !== 'undefined' ? window : globalThis;
      timerHost.clearTimeout(this.briefingAutoHideTimer);
      if (!briefing.classList.contains('is-visible')) {
        briefing.hidden = true;
        briefing.setAttribute('aria-hidden', 'true');
        return;
      }
      briefing.classList.remove('is-visible');
      briefing.setAttribute('aria-hidden', 'true');
      const duration = force ? 120 : 280;
      this.briefingFadeTimer = timerHost.setTimeout(() => {
        briefing.hidden = true;
        this.canvas.focus({ preventScroll: true });
      }, duration);
    }

    initializeScoreboardUi() {
      if (this.refreshScoresButton) {
        this.refreshScoresButton.addEventListener('click', () => {
          this.loadScoreboard({ force: true });
        });
      }
      if (this.scoreboardStatusEl) {
        this.scoreboardStatusEl.textContent = 'Preparing leaderboard…';
      }
    }

    async loadScoreboard({ force = false } = {}) {
      if (!this.apiBaseUrl) {
        this.scoreboardPollTimer = 0;
        if (force && this.scoreboardStatusEl) {
          this.scoreboardStatusEl.textContent = 'Offline mode: connect an API to sync runs.';
        }
        if (!force && this.scoreboardStatusEl) {
          this.scoreboardStatusEl.textContent =
            'Local leaderboard active — set APP_CONFIG.apiBaseUrl to publish runs.';
        }
        if (!this.scoreboardHydrated) {
          this.renderScoreboard();
          this.scoreboardHydrated = true;
        }
        return;
      }
      if (this.scoreSyncInFlight && !force) {
        return;
      }
      const baseUrl = this.apiBaseUrl.replace(/\/$/, '');
      const url = `${baseUrl}/scores`;
      this.lastScoreboardFetch = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (this.scoreboardStatusEl) {
        this.scoreboardStatusEl.textContent = 'Syncing leaderboard…';
      }
      if (this.refreshScoresButton) {
        this.refreshScoresButton.dataset.loading = 'true';
        this.refreshScoresButton.disabled = true;
        this.refreshScoresButton.setAttribute('aria-busy', 'true');
      }
      try {
        this.scoreSyncInFlight = true;
        const response = await fetch(url, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          credentials: 'omit',
        });
        if (!response.ok) {
          throw new Error(`Leaderboard request failed with ${response.status}`);
        }
        let payload = null;
        try {
          payload = await response.json();
        } catch (parseError) {
          payload = null;
        }
        const incoming = Array.isArray(payload?.items)
          ? payload.items
          : Array.isArray(payload)
            ? payload
            : [];
        if (incoming.length) {
          this.mergeScoreEntries(incoming);
        } else {
          this.renderScoreboard();
        }
        if (this.scoreboardStatusEl) {
          if (incoming.length) {
            this.scoreboardStatusEl.textContent = 'Live multiverse rankings';
          } else {
            this.scoreboardStatusEl.textContent = 'No public runs yet — forge the first legend!';
          }
        }
        this.scoreboardHydrated = true;
        this.scoreboardPollTimer = 0;
      } catch (error) {
        console.warn('Failed to load scoreboard data', error);
        if (this.scoreboardStatusEl) {
          this.scoreboardStatusEl.textContent = 'Leaderboard offline — tracking locally.';
        }
        if (!this.scoreboardHydrated) {
          this.renderScoreboard();
          this.scoreboardHydrated = true;
        }
      } finally {
        this.scoreSyncInFlight = false;
        if (this.refreshScoresButton) {
          this.refreshScoresButton.dataset.loading = 'false';
          this.refreshScoresButton.disabled = false;
          this.refreshScoresButton.setAttribute('aria-busy', 'false');
        }
        this.scoreboardPollTimer = 0;
      }
    }

    updateScoreboardPolling(delta) {
      if (!this.apiBaseUrl) {
        return;
      }
      if (!this.scoreboardHydrated || this.scoreSyncInFlight) {
        return;
      }
      if (typeof document !== 'undefined' && document.hidden) {
        return;
      }
      this.scoreboardPollTimer += delta;
      if (this.scoreboardPollTimer < this.scoreboardPollIntervalSeconds) {
        return;
      }
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const elapsedSinceFetch = this.lastScoreboardFetch ? (now - this.lastScoreboardFetch) / 1000 : Infinity;
      this.scoreboardPollTimer = 0;
      if (elapsedSinceFetch < this.scoreboardPollIntervalSeconds * 0.5) {
        return;
      }
      this.loadScoreboard();
    }

    updateLocalScoreEntry(reason) {
      const entry = this.createRunSummary(reason);
      this.mergeScoreEntries([entry]);
    }

    createRunSummary(reason) {
      const entryId = this.playerGoogleId || this.sessionId;
      const locationLabel = this.playerLocationLabel || 'Location hidden';
      const locationPayload = this.playerLocation
        ? {
            latitude: this.playerLocation.latitude ?? null,
            longitude: this.playerLocation.longitude ?? null,
            accuracy: this.playerLocation.accuracy ?? null,
            label: this.playerLocation.label ?? locationLabel,
          }
        : null;
      return {
        id: entryId,
        googleId: this.playerGoogleId ?? null,
        playerId: entryId,
        name: this.playerDisplayName,
        score: Math.round(this.score),
        dimensionCount: Math.max(1, this.currentDimensionIndex + 1),
        runTimeSeconds: Math.round(this.elapsed),
        inventoryCount: Math.max(0, this.getTotalInventoryCount()),
        location: locationPayload,
        locationLabel,
        device: this.deviceLabel,
        updatedAt: new Date().toISOString(),
        reason,
      };
    }

    mergeScoreEntries(entries) {
      const utils = this.scoreboardUtils;
      if (utils?.upsertScoreEntry && utils?.normalizeScoreEntries) {
        let next = this.scoreEntries.slice();
        for (const entry of entries) {
          next = utils.upsertScoreEntry(next, entry);
        }
        this.scoreEntries = utils.normalizeScoreEntries(next);
      } else {
        const combined = [...this.scoreEntries, ...entries];
        combined.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
        this.scoreEntries = combined;
      }
      this.renderScoreboard();
    }

    renderScoreboard() {
      if (!this.scoreboardListEl) return;
      const entries = this.scoreEntries.slice(0, 10);
      const utils = this.scoreboardUtils;
      const formatScore = utils?.formatScoreNumber
        ? utils.formatScoreNumber
        : (value) => Math.round(value ?? 0).toLocaleString();
      const formatRunTime = utils?.formatRunTime
        ? utils.formatRunTime
        : (seconds) => `${Math.round(seconds ?? 0)}s`;
      const formatLocation = utils?.formatLocationLabel
        ? (entry) => utils.formatLocationLabel(entry)
        : (entry) => entry.locationLabel || '—';
      if (!entries.length) {
        this.scoreboardListEl.innerHTML = `
          <tr>
            <td colspan="8" class="leaderboard-empty-row">No runs tracked yet — start exploring!</td>
          </tr>
        `;
        if (this.scoreboardContainer) {
          this.scoreboardContainer.dataset.empty = 'true';
        }
        if (this.scoreboardEmptyEl) {
          this.scoreboardEmptyEl.hidden = false;
        }
        return;
      }
      const rows = entries
        .map((entry, index) => {
          const rank = index + 1;
          const updated = entry.updatedAt
            ? new Date(entry.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : '—';
          return `
            <tr>
              <th scope="row" class="leaderboard-col-rank">${rank}</th>
              <td>${entry.name ?? 'Explorer'}</td>
              <td>${formatScore(entry.score)}</td>
              <td>${formatRunTime(entry.runTimeSeconds)}</td>
              <td>${entry.dimensionCount ?? 0}</td>
              <td>${entry.inventoryCount ?? 0}</td>
              <td>${formatLocation(entry)}</td>
              <td>${updated}</td>
            </tr>
          `;
        })
        .join('');
      this.scoreboardListEl.innerHTML = rows;
      if (this.scoreboardContainer) {
        this.scoreboardContainer.dataset.empty = 'false';
      }
      if (this.scoreboardEmptyEl) {
        this.scoreboardEmptyEl.hidden = true;
      }
    }

    getPlayerLeaderboardRank() {
      const index = this.scoreEntries.findIndex((entry) => entry.id === this.sessionId);
      if (index < 0) {
        return null;
      }
      return index + 1;
    }

    scheduleScoreSync(reason) {
      this.updateLocalScoreEntry(reason);
      if (!this.apiBaseUrl) {
        return;
      }
      this.pendingScoreSyncReason = reason;
      this.flushScoreSync();
    }

    async flushScoreSync(force = false) {
      if (!this.apiBaseUrl || (!force && this.scoreSyncInFlight)) {
        return;
      }
      if (!this.pendingScoreSyncReason) {
        const now = performance.now();
        if (!force && now - this.lastScoreSyncAt < this.scoreSyncCooldownSeconds * 1000) {
          return;
        }
      }
      const reason = this.pendingScoreSyncReason ?? 'auto';
      this.pendingScoreSyncReason = null;
      const entry = this.createRunSummary(reason);
      const baseUrl = this.apiBaseUrl.replace(/\/$/, '');
      const url = `${baseUrl}/scores`;
      try {
        this.scoreSyncInFlight = true;
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(entry),
          credentials: 'omit',
        });
        if (!response.ok) {
          throw new Error(`Score sync failed with ${response.status}`);
        }
        let payload = null;
        try {
          payload = await response.json();
        } catch (parseError) {
          payload = null;
        }
        const entries = Array.isArray(payload?.items)
          ? payload.items
          : payload && typeof payload === 'object'
            ? [payload]
            : [entry];
        this.mergeScoreEntries(entries);
        this.lastScoreSyncAt = performance.now();
        this.scoreSyncHeartbeat = 0;
        if (this.scoreboardStatusEl) {
          this.scoreboardStatusEl.textContent = 'Leaderboard synced';
        }
        console.log('Score synced', { reason, score: entry.score });
      } catch (error) {
        console.warn('Unable to sync score to backend', error);
        if (this.scoreboardStatusEl) {
          this.scoreboardStatusEl.textContent = 'Sync failed — will retry shortly.';
        }
        this.pendingScoreSyncReason = reason;
      } finally {
        this.scoreSyncInFlight = false;
      }
    }

    stop() {
      if (this.animationFrame !== null) {
        cancelAnimationFrame(this.animationFrame);
        this.animationFrame = null;
      }
      this.unbindEvents();
    }

    setupScene() {
      const THREE = this.THREE;
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color('#87ceeb');
      this.scene.fog = new THREE.Fog(0x87ceeb, 40, 140);

      const width = this.canvas.clientWidth || this.canvas.width || 1;
      const height = this.canvas.clientHeight || this.canvas.height || 1;
      this.camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 250);
      this.camera.position.set(0, 0, 0);

      this.playerRig = new THREE.Group();
      this.playerRig.name = 'PlayerRig';
      this.playerRig.position.set(0, PLAYER_EYE_HEIGHT, 12);
      this.playerRig.add(this.camera);
      this.scene.add(this.playerRig);

      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.05;
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.renderer.setPixelRatio(window.devicePixelRatio ?? 1);
      this.renderer.setSize(width, height, false);
      this.applyTextureAnisotropy();

      this.hemiLight = new THREE.HemisphereLight(0xbddcff, 0x34502d, 0.9);
      this.scene.add(this.hemiLight);

      this.sunLight = new THREE.DirectionalLight(0xffffff, 1.1);
      this.sunLight.position.set(18, 32, 12);
      this.sunLight.castShadow = true;
      this.sunLight.shadow.mapSize.set(2048, 2048);
      this.sunLight.shadow.camera.near = 0.5;
      this.sunLight.shadow.camera.far = 160;
      this.sunLight.shadow.camera.left = -60;
      this.sunLight.shadow.camera.right = 60;
      this.sunLight.shadow.camera.top = 60;
      this.sunLight.shadow.camera.bottom = -60;
      this.scene.add(this.sunLight);
      this.scene.add(this.sunLight.target);

      const ambient = new THREE.AmbientLight(0xffffff, 0.18);
      this.scene.add(ambient);

      this.terrainGroup = new THREE.Group();
      this.railsGroup = new THREE.Group();
      this.portalGroup = new THREE.Group();
      this.zombieGroup = new THREE.Group();
      this.golemGroup = new THREE.Group();
      this.scene.add(this.terrainGroup);
      this.scene.add(this.railsGroup);
      this.scene.add(this.portalGroup);
      this.scene.add(this.zombieGroup);
      this.scene.add(this.golemGroup);
      this.createFirstPersonHands();
      this.loadPlayerCharacter().catch((error) => {
        console.warn('Player model failed to load; continuing with primitive hands.', error);
      });
      this.refreshCameraBaseOffset();
      if (typeof console !== 'undefined') {
        console.log('Scene populated');
      }
    }

    refreshCameraBaseOffset() {
      if (!this.camera || !this.cameraBaseOffset) {
        return;
      }
      this.cameraBaseOffset.copy(this.camera.position);
    }

    createMaterials() {
      const THREE = this.THREE;
      const grassTexture = this.createVoxelTexture('grass', {
        base: '#69c368',
        highlight: '#92dd83',
        shadow: '#3f8f3a',
        accent: '#7dcf6f',
      });
      const dirtTexture = this.createVoxelTexture('dirt', {
        base: '#a66a33',
        highlight: '#c28145',
        shadow: '#7b4a26',
        accent: '#b5773a',
      });
      const stoneTexture = this.createVoxelTexture('stone', {
        base: '#8f8f8f',
        highlight: '#b8babd',
        shadow: '#5b5f63',
        accent: '#a5a5a5',
      });
      return {
        grass: new THREE.MeshStandardMaterial({
          map: grassTexture,
          color: new THREE.Color('#ffffff'),
          roughness: 0.72,
          metalness: 0.04,
        }),
        dirt: new THREE.MeshStandardMaterial({
          map: dirtTexture,
          color: new THREE.Color('#ffffff'),
          roughness: 0.92,
          metalness: 0.03,
        }),
        stone: new THREE.MeshStandardMaterial({
          map: stoneTexture,
          color: new THREE.Color('#ffffff'),
          roughness: 0.82,
          metalness: 0.16,
        }),
        rails: new THREE.MeshStandardMaterial({
          color: new THREE.Color('#c9a14d'),
          roughness: 0.35,
          metalness: 0.65,
        }),
        zombie: new THREE.MeshStandardMaterial({
          color: new THREE.Color('#2e7d32'),
          roughness: 0.8,
          metalness: 0.1,
        }),
        portal: new THREE.ShaderMaterial({
          transparent: true,
          depthWrite: false,
          uniforms: {
            uTime: { value: 0 },
            uColorA: { value: new THREE.Color('#7f5af0') },
            uColorB: { value: new THREE.Color('#2cb67d') },
          },
          vertexShader: `
            varying vec2 vUv;
            void main() {
              vUv = uv;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `,
          fragmentShader: `
            uniform float uTime;
            uniform vec3 uColorA;
            uniform vec3 uColorB;
            varying vec2 vUv;
            void main() {
              float swirl = sin((vUv.x + vUv.y + uTime * 0.7) * 6.2831) * 0.5 + 0.5;
              float vignette = smoothstep(0.95, 0.35, distance(vUv, vec2(0.5)));
              vec3 color = mix(uColorA, uColorB, swirl) * vignette;
              gl_FragColor = vec4(color, vignette);
            }
          `,
        }),
      };
    }

    createCraftingRecipes() {
      return new Map([
        [
          'stick,stick,stone',
          {
            id: 'stone-pickaxe',
            label: 'Stone Pickaxe',
            score: 2,
            description: 'Unlocks tougher mining strikes and portal prep.',
          },
        ],
        [
          'stone,stone,grass-block',
          {
            id: 'portal-charge',
            label: 'Portal Charge',
            score: 4,
            description: 'Stabilises the next realm transition.',
          },
        ],
      ]);
    }

    restorePersistentUnlocks() {
      if (typeof localStorage === 'undefined') {
        return;
      }
      let payload = null;
      try {
        const raw = localStorage.getItem(RECIPE_UNLOCK_STORAGE_KEY);
        if (!raw) {
          return;
        }
        payload = JSON.parse(raw);
      } catch (error) {
        console.warn('Failed to parse stored recipe unlocks', error);
        return;
      }
      const sequences = Array.isArray(payload?.sequences) ? payload.sequences : [];
      const craftedIds = Array.isArray(payload?.craftedIds) ? payload.craftedIds : [];
      sequences.forEach((key) => {
        if (typeof key !== 'string' || !key) return;
        const recipe = this.craftingRecipes.get(key);
        if (recipe) {
          this.craftingState.unlocked.set(key, recipe);
        }
      });
      craftedIds.forEach((id) => {
        if (typeof id !== 'string' || !id) return;
        this.craftedRecipes.add(id);
      });
    }

    savePersistentUnlocks() {
      if (typeof localStorage === 'undefined') {
        return;
      }
      try {
        const data = {
          sequences: Array.from(this.craftingState.unlocked.keys()),
          craftedIds: Array.from(this.craftedRecipes.values()),
        };
        localStorage.setItem(RECIPE_UNLOCK_STORAGE_KEY, JSON.stringify(data));
      } catch (error) {
        console.warn('Failed to persist recipe unlocks', error);
      }
    }

    describeDevice() {
      if (typeof navigator === 'undefined') {
        return 'Device details pending';
      }
      const platform = navigator.userAgentData?.platform || navigator.platform || 'Unknown platform';
      const brand = Array.isArray(navigator.userAgentData?.brands)
        ? navigator.userAgentData.brands.map((entry) => entry.brand).join(' · ')
        : navigator.vendor || '';
      const userAgent = navigator.userAgent || '';
      const labelParts = [platform.trim(), brand.trim(), userAgent.trim()].filter(Boolean);
      return labelParts.length ? labelParts.join(' · ') : 'Device details pending';
    }

    getDeviceLabel() {
      return this.deviceLabel;
    }

    inferLocationLabel(coords) {
      if (!coords) {
        return 'Location unavailable';
      }
      if (coords.error) {
        return typeof coords.error === 'string' ? coords.error : 'Location unavailable';
      }
      const latitude = Number(coords.latitude);
      const longitude = Number(coords.longitude);
      if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
        const latLabel = latitude.toFixed(1);
        const lonLabel = longitude.toFixed(1);
        return `Lat ${latLabel}°, Lon ${lonLabel}°`;
      }
      return 'Location unavailable';
    }

    setPlayerLocation(location) {
      if (!location) {
        this.playerLocation = null;
        this.playerLocationLabel = 'Location hidden';
      } else if (location.error) {
        this.playerLocation = { error: location.error };
        this.playerLocationLabel = typeof location.error === 'string' ? location.error : 'Location hidden';
      } else {
        const latitude = Number(location.latitude);
        const longitude = Number(location.longitude);
        const accuracy = Number.isFinite(location.accuracy) ? Number(location.accuracy) : null;
        const normalized = {
          latitude: Number.isFinite(latitude) ? latitude : null,
          longitude: Number.isFinite(longitude) ? longitude : null,
          accuracy,
        };
        const label = location.label || this.inferLocationLabel(normalized);
        normalized.label = label;
        this.playerLocation = normalized;
        this.playerLocationLabel = label;
      }
      if (this.started) {
        this.updateHud();
      }
      this.updateLocalScoreEntry('location-update');
      this.scheduleScoreSync('location-update');
      this.renderScoreboard();
    }

    setIdentity(identity = {}) {
      const previousId = this.playerGoogleId;
      const name = typeof identity.name === 'string' ? identity.name.trim() : '';
      if (name) {
        this.playerDisplayName = name;
      }
      this.playerGoogleId = identity.googleId ?? null;
      this.playerEmail = identity.email ?? null;
      this.playerAvatarUrl = identity.avatar ?? null;
      if (identity.location || identity.locationLabel) {
        this.setPlayerLocation(identity.location || { label: identity.locationLabel });
      }
      if (identity.locationLabel && !identity.location) {
        this.playerLocationLabel = identity.locationLabel;
      }
      if (this.started) {
        this.updateHud();
      }
      this.updateLocalScoreEntry('identity-update');
      this.scheduleScoreSync('identity-update');
      if (previousId !== this.playerGoogleId && typeof this.loadScoreboard === 'function') {
        this.loadScoreboard({ force: true }).catch(() => {});
      } else {
        this.renderScoreboard();
      }
    }

    clearIdentity() {
      this.playerGoogleId = null;
      this.playerEmail = null;
      this.playerAvatarUrl = null;
      this.playerDisplayName = this.defaultPlayerName || 'Explorer';
      this.playerLocation = null;
      this.playerLocationLabel = 'Location hidden';
      if (this.started) {
        this.updateHud();
      }
      this.updateLocalScoreEntry('identity-cleared');
      this.scheduleScoreSync('identity-cleared');
      this.renderScoreboard();
    }

    createVoxelTexture(key, palette) {
      const cached = this.textureCache.get(key);
      if (cached) {
        return cached;
      }
      const THREE = this.THREE;
      const size = 32;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        const fallback = new THREE.Texture();
        this.textureCache.set(key, fallback);
        return fallback;
      }
      const colors = [palette.base, palette.highlight, palette.shadow, palette.accent].filter(Boolean);
      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          const noise = Math.sin(x * 12.3 + y * 7.1) * 43758.5453;
          const index = Math.floor(Math.abs(noise) * colors.length) % colors.length;
          ctx.fillStyle = colors[index] ?? palette.base;
          ctx.fillRect(x, y, 1, 1);
        }
      }
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 1;
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.NearestFilter;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.needsUpdate = true;
      this.textureCache.set(key, texture);
      return texture;
    }

    detectTouchPreferred() {
      if (typeof window === 'undefined') return false;
      if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) {
        return true;
      }
      const nav = typeof navigator !== 'undefined' ? navigator : null;
      if (nav?.maxTouchPoints && nav.maxTouchPoints > 0) {
        return true;
      }
      return 'ontouchstart' in window;
    }

    createAudioController() {
      const scope = typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null;
      const samples = scope?.INFINITE_RAILS_EMBEDDED_ASSETS?.audioSamples || null;
      const HowlCtor = scope?.Howl;
      if (!samples || typeof HowlCtor !== 'function') {
        return {
          has: () => false,
          play: () => {},
          playRandom: () => {},
          stopAll: () => {},
          setMasterVolume: () => {},
        };
      }
      const available = new Set(Object.keys(samples));
      const cache = new Map();
      const controller = {
        has(name) {
          return available.has(name);
        },
        play(name, options = {}) {
          if (!available.has(name)) return;
          let howl = cache.get(name);
          if (!howl) {
            howl = new HowlCtor({
              src: [`data:audio/wav;base64,${samples[name]}`],
              volume: options.volume ?? 1,
              preload: true,
            });
            cache.set(name, howl);
          }
          if (options.volume !== undefined && typeof howl.volume === 'function') {
            howl.volume(options.volume);
          }
          if (options.rate !== undefined && typeof howl.rate === 'function') {
            howl.rate(options.rate);
          }
          if (options.loop !== undefined && typeof howl.loop === 'function') {
            howl.loop(Boolean(options.loop));
          }
          howl.play();
        },
        playRandom(names = [], options = {}) {
          const pool = names.filter((name) => available.has(name));
          if (!pool.length) return;
          const choice = pool[Math.floor(Math.random() * pool.length)];
          controller.play(choice, options);
        },
        stopAll() {
          cache.forEach((howl) => howl.stop?.());
        },
        setMasterVolume(volume) {
          if (scope?.Howler?.volume) {
            scope.Howler.volume(volume);
          }
        },
      };
      return controller;
    }

    initializeMobileControls() {
      if (!this.mobileControlsRoot) {
        return;
      }
      const controls = this.mobileControlsRoot;
      this.teardownMobileControls();
      const active = Boolean(this.isTouchPreferred);
      controls.setAttribute('aria-hidden', active ? 'false' : 'true');
      controls.dataset.active = active ? 'true' : 'false';
      if (!active) {
        return;
      }
      const blockDefault = (event) => event.preventDefault();
      controls.addEventListener('contextmenu', blockDefault);
      this.mobileControlDisposers.push(() => controls.removeEventListener('contextmenu', blockDefault));

      const directionButtons = controls.querySelectorAll(
        'button[data-action="up"], button[data-action="down"], button[data-action="left"], button[data-action="right"]'
      );
      directionButtons.forEach((button) => {
        button.addEventListener('pointerdown', this.onTouchButtonPress, { passive: false });
        button.addEventListener('pointerup', this.onTouchButtonRelease);
        button.addEventListener('pointercancel', this.onTouchButtonRelease);
        button.addEventListener('lostpointercapture', this.onTouchButtonRelease);
        button.addEventListener('click', blockDefault);
        this.mobileControlDisposers.push(() => {
          button.removeEventListener('pointerdown', this.onTouchButtonPress);
          button.removeEventListener('pointerup', this.onTouchButtonRelease);
          button.removeEventListener('pointercancel', this.onTouchButtonRelease);
          button.removeEventListener('lostpointercapture', this.onTouchButtonRelease);
          button.removeEventListener('click', blockDefault);
        });
      });

      const actionButton = controls.querySelector('button[data-action="action"]');
      if (actionButton) {
        const handlePointerDown = (event) => {
          event.preventDefault();
          this.touchActionPending = true;
          this.touchActionStart = performance.now();
        };
        const handlePointerUp = (event) => {
          event.preventDefault();
          if (!this.touchActionPending) {
            return;
          }
          this.touchActionPending = false;
          const duration = performance.now() - this.touchActionStart;
          if (duration > 260) {
            this.touchJumpRequested = true;
          } else {
            this.mineBlock();
          }
        };
        const handlePointerCancel = () => {
          this.touchActionPending = false;
        };
        actionButton.addEventListener('pointerdown', handlePointerDown, { passive: false });
        actionButton.addEventListener('pointerup', handlePointerUp);
        actionButton.addEventListener('pointercancel', handlePointerCancel);
        actionButton.addEventListener('click', blockDefault);
        this.mobileControlDisposers.push(() => {
          actionButton.removeEventListener('pointerdown', handlePointerDown);
          actionButton.removeEventListener('pointerup', handlePointerUp);
          actionButton.removeEventListener('pointercancel', handlePointerCancel);
          actionButton.removeEventListener('click', blockDefault);
        });
      }

      const portalButton = controls.querySelector('button[data-action="portal"]');
      if (portalButton) {
        portalButton.addEventListener('click', this.onPortalButton);
        portalButton.addEventListener('pointerdown', blockDefault, { passive: false });
        this.mobileControlDisposers.push(() => {
          portalButton.removeEventListener('click', this.onPortalButton);
          portalButton.removeEventListener('pointerdown', blockDefault);
        });
      }

      if (this.virtualJoystickEl) {
        this.virtualJoystickEl.setAttribute('aria-hidden', 'false');
        this.virtualJoystickEl.addEventListener('pointerdown', this.onJoystickPointerDown, { passive: false });
        window.addEventListener('pointermove', this.onJoystickPointerMove, { passive: false });
        window.addEventListener('pointerup', this.onJoystickPointerUp);
        window.addEventListener('pointercancel', this.onJoystickPointerUp);
        this.mobileControlDisposers.push(() => {
          this.virtualJoystickEl.removeEventListener('pointerdown', this.onJoystickPointerDown);
          window.removeEventListener('pointermove', this.onJoystickPointerMove);
          window.removeEventListener('pointerup', this.onJoystickPointerUp);
          window.removeEventListener('pointercancel', this.onJoystickPointerUp);
        });
      }
    }

    teardownMobileControls() {
      if (this.mobileControlDisposers.length) {
        this.mobileControlDisposers.forEach((dispose) => {
          try {
            dispose();
          } catch (error) {
            console.warn('Failed to remove mobile control handler', error);
          }
        });
      }
      this.mobileControlDisposers = [];
      this.touchButtonStates.up = false;
      this.touchButtonStates.down = false;
      this.touchButtonStates.left = false;
      this.touchButtonStates.right = false;
      this.touchActionPending = false;
      this.touchJumpRequested = false;
      this.resetJoystick();
      if (this.mobileControlsRoot) {
        this.mobileControlsRoot.dataset.active = 'false';
        this.mobileControlsRoot.setAttribute('aria-hidden', 'true');
      }
      if (this.virtualJoystickEl) {
        this.virtualJoystickEl.setAttribute('aria-hidden', 'true');
      }
    }

    resetJoystick() {
      this.joystickPointerId = null;
      this.joystickVector.set(0, 0);
      if (this.virtualJoystickThumb) {
        this.virtualJoystickThumb.style.transform = 'translate(0px, 0px)';
      }
    }

    handleJoystickPointerDown(event) {
      if (event.pointerType && event.pointerType !== 'touch' && event.pointerType !== 'pen') {
        return;
      }
      event.preventDefault();
      this.joystickPointerId = event.pointerId ?? 'touch';
      this.updateJoystickFromPointer(event);
      this.virtualJoystickEl?.setPointerCapture?.(event.pointerId ?? 0);
    }

    handleJoystickPointerMove(event) {
      if (this.joystickPointerId === null) return;
      if (event.pointerId !== undefined && event.pointerId !== this.joystickPointerId) return;
      if (event.pointerType && event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
      event.preventDefault();
      this.updateJoystickFromPointer(event);
    }

    handleJoystickPointerUp(event) {
      if (this.joystickPointerId === null) return;
      if (event.pointerId !== undefined && event.pointerId !== this.joystickPointerId) return;
      event.preventDefault();
      this.virtualJoystickEl?.releasePointerCapture?.(event.pointerId ?? 0);
      this.resetJoystick();
    }

    updateJoystickFromPointer(event) {
      if (!this.virtualJoystickEl) return;
      const rect = this.virtualJoystickEl.getBoundingClientRect();
      const radius = rect.width / 2;
      if (radius <= 0) return;
      const centerX = rect.left + radius;
      const centerY = rect.top + radius;
      const dx = event.clientX - centerX;
      const dy = event.clientY - centerY;
      const distance = Math.min(Math.sqrt(dx * dx + dy * dy), radius);
      const angle = Math.atan2(dy, dx);
      const limitedX = Math.cos(angle) * distance;
      const limitedY = Math.sin(angle) * distance;
      const normalisedX = limitedX / radius;
      const normalisedY = limitedY / radius;
      this.joystickVector.set(normalisedX, normalisedY);
      if (this.virtualJoystickThumb) {
        const thumbRadius = radius * 0.65;
        const thumbX = normalisedX * thumbRadius;
        const thumbY = normalisedY * thumbRadius;
        this.virtualJoystickThumb.style.transform = `translate(${thumbX.toFixed(1)}px, ${thumbY.toFixed(1)}px)`;
      }
    }

    handleTouchButtonPress(event) {
      if (event.pointerType && event.pointerType !== 'touch' && event.pointerType !== 'pen') {
        return;
      }
      event.preventDefault();
      const button = event.currentTarget;
      if (!button) return;
      button.setPointerCapture?.(event.pointerId ?? 0);
      const action = button.dataset?.action;
      if (!action) return;
      if (action === 'up' || action === 'down' || action === 'left' || action === 'right') {
        this.touchButtonStates[action] = true;
      }
    }

    handleTouchButtonRelease(event) {
      const button = event.currentTarget;
      if (!button) return;
      const action = button.dataset?.action;
      if (!action) return;
      if (action === 'up' || action === 'down' || action === 'left' || action === 'right') {
        this.touchButtonStates[action] = false;
      }
    }

    handlePortalButton(event) {
      event.preventDefault();
      if (this.portalActivated && this.isPlayerNearPortal()) {
        this.advanceDimension();
        return;
      }
      if (this.portalReady && this.isPlayerNearPortalFrame()) {
        this.ignitePortal('torch');
        return;
      }
      this.placeBlock();
    }

    handleTouchLookPointerDown(event) {
      if (event.pointerType !== 'touch') {
        return;
      }
      if (this.mobileControlsRoot?.contains(event.target)) {
        return;
      }
      event.preventDefault();
      this.touchLookPointerId = event.pointerId;
      this.touchLookLast = { x: event.clientX, y: event.clientY };
    }

    handleTouchLookPointerMove(event) {
      if (event.pointerType !== 'touch') {
        return;
      }
      if (this.touchLookPointerId !== event.pointerId) {
        return;
      }
      event.preventDefault();
      if (!this.touchLookLast) {
        this.touchLookLast = { x: event.clientX, y: event.clientY };
        return;
      }
      const dx = event.clientX - this.touchLookLast.x;
      const dy = event.clientY - this.touchLookLast.y;
      this.touchLookLast = { x: event.clientX, y: event.clientY };
      this.yaw -= dx * POINTER_SENSITIVITY * 0.9;
      this.pitch -= dy * POINTER_SENSITIVITY * 0.9;
      const maxPitch = Math.PI / 2 - 0.01;
      this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch));
    }

    handleTouchLookPointerUp(event) {
      if (event.pointerType !== 'touch') {
        return;
      }
      if (this.touchLookPointerId !== event.pointerId) {
        return;
      }
      this.touchLookPointerId = null;
      this.touchLookLast = null;
    }

    applyTextureAnisotropy() {
      if (!this.renderer) return;
      const anisotropy = this.renderer.capabilities?.getMaxAnisotropy?.() ?? 1;
      Object.values(this.materials).forEach((material) => {
        if (material?.map) {
          material.map.anisotropy = anisotropy;
          material.map.needsUpdate = true;
        }
      });
    }

    createFirstPersonHands() {
      const THREE = this.THREE;
      if (!THREE || !this.camera) return;
      if (this.playerRig && this.camera.parent !== this.playerRig) {
        this.camera.parent?.remove(this.camera);
        this.playerRig.add(this.camera);
      }

      if (this.handGroup) {
        this.camera.remove(this.handGroup);
      }

      this.handGroup = new THREE.Group();
      this.handGroup.position.set(0.42, -0.46, -0.8);
      this.handGroup.rotation.set(-0.55, 0, 0);
      this.handMaterials = [];
      this.handMaterialsDynamic = true;
      this.handModelLoaded = false;

      const handGeometry = new THREE.BoxGeometry(0.24, 0.46, 0.24);
      const sleeveGeometry = new THREE.BoxGeometry(0.26, 0.22, 0.26);
      const baseMaterial = new THREE.MeshStandardMaterial({
        color: new THREE.Color('#82c7ff'),
        metalness: 0.1,
        roughness: 0.55,
      });
      const sleeveMaterial = new THREE.MeshStandardMaterial({
        color: new THREE.Color('#2563eb'),
        metalness: 0.05,
        roughness: 0.75,
      });

      const createHand = (side) => {
        const hand = new THREE.Group();
        const palm = new THREE.Mesh(handGeometry, baseMaterial.clone());
        palm.castShadow = true;
        palm.receiveShadow = true;
        palm.position.set(0, -0.1, 0);
        const sleeve = new THREE.Mesh(sleeveGeometry, sleeveMaterial.clone());
        sleeve.castShadow = false;
        sleeve.receiveShadow = true;
        sleeve.position.set(0, 0.2, 0);
        hand.add(sleeve);
        hand.add(palm);
        hand.position.set(side * 0.32, 0, 0);
        hand.rotation.z = side * -0.12;
        return { group: hand, palm, sleeve };
      };

      const left = createHand(-1);
      const right = createHand(1);
      this.handGroup.add(left.group);
      this.handGroup.add(right.group);
      this.camera.add(this.handGroup);
      this.handMaterials = [left.palm.material, right.palm.material, left.sleeve.material, right.sleeve.material];
    }

    preloadCharacterModels() {
      this.loadModel('arm').catch(() => {});
      this.loadModel('steve').catch(() => {});
      this.loadModel('zombie').catch(() => {});
      this.loadModel('golem').catch(() => {});
    }

    loadModel(key, overrideUrl) {
      const THREE = this.THREE;
      const url = overrideUrl || MODEL_URLS[key];
      if (!url) {
        return Promise.reject(new Error(`No model URL configured for key "${key}".`));
      }
      if (this.loadedModels.has(key)) {
        return Promise.resolve(this.loadedModels.get(key));
      }
      if (this.modelPromises.has(key)) {
        return this.modelPromises.get(key);
      }
      const promise = ensureGltfLoader(THREE)
        .then((LoaderClass) => {
          return new Promise((resolve, reject) => {
            try {
              const loader = new LoaderClass();
              loader.load(
                url,
                (gltf) => {
                  resolve({ scene: gltf.scene, animations: gltf.animations || [] });
                },
                undefined,
                (error) => reject(error || new Error(`Failed to load GLTF: ${url}`)),
              );
            } catch (error) {
              reject(error);
            }
          });
        })
        .then((payload) => {
          if (!payload?.scene) {
            throw new Error(`Model at ${url} is missing a scene graph.`);
          }
          payload.scene.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });
          this.loadedModels.set(key, payload);
          return payload;
        })
        .catch((error) => {
          console.warn(`Failed to load model "${key}" from ${url}`, error);
          this.modelPromises.delete(key);
          throw error;
        });
      this.modelPromises.set(key, promise);
      return promise;
    }

    async cloneModelScene(key, overrideUrl) {
      try {
        const payload = await this.loadModel(key, overrideUrl);
        if (!payload?.scene) {
          return null;
        }
        const clone = payload.scene.clone(true);
        clone.traverse((child) => {
          if (child.isMesh) {
            if (Array.isArray(child.material)) {
              child.material = child.material.map((material) => (material?.clone ? material.clone() : material));
            } else if (child.material?.clone) {
              child.material = child.material.clone();
            }
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        return { scene: clone, animations: payload.animations };
      } catch (error) {
        return null;
      }
    }

    async loadFirstPersonArms() {
      if (!this.handGroup) return;
      const asset = await this.cloneModelScene('arm');
      if (!asset?.scene) {
        return;
      }
      this.handGroup.clear();
      const leftArm = asset.scene;
      leftArm.position.set(-0.32, -0.1, -0.58);
      leftArm.rotation.set(-0.32, 0.32, 0.12);
      const rightAsset = await this.cloneModelScene('arm');
      if (!rightAsset?.scene) {
        this.handGroup.add(leftArm);
        this.handMaterials = [];
        leftArm.traverse((child) => {
          if (child.isMesh && child.material) {
            if (Array.isArray(child.material)) {
              this.handMaterials.push(...child.material.filter(Boolean));
            } else {
              this.handMaterials.push(child.material);
            }
          }
        });
        this.handMaterialsDynamic = false;
        this.handModelLoaded = true;
        return;
      }
      const rightArm = rightAsset.scene;
      rightArm.position.set(0.32, -0.1, -0.58);
      rightArm.rotation.set(-0.32, -0.32, -0.12);
      rightArm.rotation.y = Math.PI;
      this.handGroup.add(leftArm);
      this.handGroup.add(rightArm);
      this.handMaterials = [];
      this.handGroup.traverse((child) => {
        if (child.isMesh && child.material) {
          if (Array.isArray(child.material)) {
            this.handMaterials.push(...child.material.filter(Boolean));
          } else {
            this.handMaterials.push(child.material);
          }
        }
      });
      this.handMaterialsDynamic = false;
      this.handModelLoaded = true;
    }

    async loadPlayerCharacter() {
      if (!this.playerRig) return;
      const THREE = this.THREE;
      let asset = null;
      try {
        asset = await this.cloneModelScene('steve');
      } catch (error) {
        console.warn('Failed to load Steve model.', error);
        asset = null;
      }
      if (!asset?.scene) {
        console.warn('Model load failed, using fallback cube');
        const fallbackMaterial = new THREE.MeshStandardMaterial({ color: 0x3b82f6, metalness: 0.12, roughness: 0.58 });
        const fallbackGeometry = new THREE.BoxGeometry(0.6, 1.8, 0.4);
        const fallback = new THREE.Mesh(fallbackGeometry, fallbackMaterial);
        fallback.name = 'PlayerAvatarFallback';
        fallback.position.set(0, -PLAYER_EYE_HEIGHT, 0);
        fallback.castShadow = true;
        fallback.receiveShadow = true;
        this.playerRig.add(fallback);
        this.playerAvatar = fallback;
        if (this.camera.parent !== fallback) {
          fallback.add(this.camera);
          this.camera.position.set(0, 0.08, 0.08);
        }
        this.refreshCameraBaseOffset();
        console.log('Steve visible in scene (fallback)');
        return;
      }
      if (this.playerAvatar) {
        this.playerRig.remove(this.playerAvatar);
        disposeObject3D(this.playerAvatar);
        this.playerAvatar = null;
      }
      const model = asset.scene;
      model.name = 'PlayerAvatar';
      model.position.set(0, -PLAYER_EYE_HEIGHT, 0);
      model.scale.setScalar(0.98);
      model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      this.playerRig.add(model);
      this.playerAvatar = model;

      if (this.camera.parent !== model) {
        const head = model.getObjectByName('HeadPivot') || model.getObjectByName('Head');
        if (head && head.isObject3D) {
          head.add(this.camera);
          this.camera.position.set(0, 0.08, 0.04);
        } else {
          this.playerRig.add(this.camera);
          this.camera.position.set(0, 0, 0);
        }
      }
      if (this.handGroup && this.handGroup.parent !== this.camera) {
        this.camera.add(this.handGroup);
      }

      this.refreshCameraBaseOffset();

      if (this.playerMixer) {
        this.playerMixer.stopAllAction();
        this.playerMixer = null;
        this.playerIdleAction = null;
      }

      let clip = null;
      if (Array.isArray(asset.animations) && asset.animations.length) {
        clip = asset.animations.find((animation) => `${animation?.name ?? ''}`.toLowerCase().includes('idle')) || asset.animations[0];
      }
      this.playerMixer = new THREE.AnimationMixer(model);
      if (clip) {
        this.playerIdleAction = this.playerMixer.clipAction(clip);
      } else {
        const idleTrack = new THREE.NumberKeyframeTrack('.rotation[y]', [0, 1.5, 3], [0, 0.1, 0]);
        const bobTrack = new THREE.NumberKeyframeTrack(
          '.position[y]',
          [0, 1.5, 3],
          [-PLAYER_EYE_HEIGHT, -PLAYER_EYE_HEIGHT + 0.05, -PLAYER_EYE_HEIGHT],
        );
        const proceduralClip = new THREE.AnimationClip('ProceduralIdle', 3, [idleTrack, bobTrack]);
        this.playerIdleAction = this.playerMixer.clipAction(proceduralClip);
      }
      if (this.playerIdleAction) {
        this.playerIdleAction.loop = THREE.LoopRepeat;
        this.playerIdleAction.play();
      }
      console.log('Steve visible in scene');
    }

    upgradeZombie(zombie) {
      this.cloneModelScene('zombie')
        .then((asset) => {
          if (!asset?.scene || !this.zombieGroup) return;
          if (!this.zombies.includes(zombie)) return;
          const placeholder = zombie.mesh;
          const model = asset.scene;
          model.name = `ZombieModel-${zombie.id}`;
          model.position.copy(placeholder.position);
          model.rotation.copy(placeholder.rotation);
          model.scale.setScalar(0.95);
          this.zombieGroup.add(model);
          this.zombieGroup.remove(placeholder);
          disposeObject3D(placeholder);
          zombie.mesh = model;
          zombie.placeholder = false;
        })
        .catch((error) => {
          console.warn('Failed to upgrade zombie model', error);
        });
    }

    upgradeGolem(golem) {
      this.cloneModelScene('golem')
        .then((asset) => {
          if (!asset?.scene || !this.golemGroup) return;
          if (!this.golems.includes(golem)) return;
          const placeholder = golem.mesh;
          const model = asset.scene;
          model.name = `GolemModel-${golem.id ?? 'actor'}`;
          model.position.copy(placeholder.position);
          model.rotation.copy(placeholder.rotation);
          model.scale.setScalar(1.1);
          this.golemGroup.add(model);
          this.golemGroup.remove(placeholder);
          disposeObject3D(placeholder);
          golem.mesh = model;
          golem.placeholder = false;
        })
        .catch((error) => {
          console.warn('Failed to upgrade golem model', error);
        });
    }

    applyDimensionSettings(index) {
      const themeCount = DIMENSION_THEME.length;
      const safeIndex = ((index % themeCount) + themeCount) % themeCount;
      this.currentDimensionIndex = safeIndex;
      const theme = DIMENSION_THEME[safeIndex] ?? DIMENSION_THEME[0];
      this.dimensionSettings = theme;
      this.currentSpeed = PLAYER_BASE_SPEED * (theme.speedMultiplier ?? 1);
      this.gravityScale = theme.gravity ?? 1;

      const { palette } = theme;
      if (palette?.grass) this.materials.grass.color.set(palette.grass);
      if (palette?.dirt) this.materials.dirt.color.set(palette.dirt);
      if (palette?.stone) this.materials.stone.color.set(palette.stone);
      if (palette?.rails) this.materials.rails.color.set(palette.rails);
      if (palette?.rails) {
        this.materials.portal.uniforms.uColorA.value.set(palette.rails);
      }
      if (palette?.grass) {
        this.materials.portal.uniforms.uColorB.value.set(palette.grass);
      }
      if (this.handMaterialsDynamic && this.handMaterials.length) {
        const palmColor = palette?.grass || '#82c7ff';
        const sleeveColor = palette?.rails || '#2563eb';
        this.handMaterials.forEach((material, index) => {
          if (!material?.color) return;
          if (index <= 1) {
            material.color.set(palmColor);
          } else {
            material.color.set(sleeveColor);
          }
        });
      }
      if (this.scene?.background && theme.sky) {
        this.scene.background.set(theme.sky);
      }
      if (this.scene?.fog && theme.fog) {
        this.scene.fog.color.set(theme.fog);
      }
      if (this.hemiLight && theme.hemi) {
        this.hemiLight.color.set(theme.hemi);
      }
      if (this.sunLight && theme.sun) {
        this.sunLight.color.set(theme.sun);
      }
      this.updateDimensionInfoPanel();
      console.log(`Dimension online: ${theme.name}`);
    }

    buildTerrain() {
      const THREE = this.THREE;
      this.columns.clear();
      this.heightMap = Array.from({ length: WORLD_SIZE }, () => Array(WORLD_SIZE).fill(0));
      this.initialHeightMap = Array.from({ length: WORLD_SIZE }, () => Array(WORLD_SIZE).fill(0));
      const existingChunks = Array.from(this.terrainGroup.children);
      existingChunks.forEach((child) => {
        this.terrainGroup.remove(child);
        disposeObject3D(child);
      });
      this.terrainChunkGroups = [];
      this.terrainChunkMap.clear();
      this.dirtyTerrainChunks.clear();
      const half = WORLD_SIZE / 2;
      let voxelCount = 0;
      for (let gx = 0; gx < WORLD_SIZE; gx += 1) {
        for (let gz = 0; gz < WORLD_SIZE; gz += 1) {
          const offsetX = gx - half;
          const offsetZ = gz - half;
          const worldX = offsetX * BLOCK_SIZE;
          const worldZ = offsetZ * BLOCK_SIZE;
          const distance = Math.hypot(offsetX, offsetZ);
          const falloff = Math.max(0, 1 - distance / (WORLD_SIZE * 0.68));
          const heightNoise = pseudoRandom(gx * 0.35, gz * 0.35);
          const secondary = pseudoRandom(gz * 0.12, gx * 0.18);
          const maxHeight = Math.max(1, Math.round(1 + falloff * 2.6 + heightNoise * 2 + secondary * 0.9));
          this.heightMap[gx][gz] = maxHeight;
          this.initialHeightMap[gx][gz] = maxHeight;
          const columnKey = `${gx}|${gz}`;
          const column = [];
          for (let level = 0; level < maxHeight; level += 1) {
            const isSurface = level === maxHeight - 1;
            const blockType = isSurface
              ? 'grass-block'
              : level > maxHeight - 3
                ? 'dirt'
                : 'stone';
            const material =
              blockType === 'grass-block'
                ? this.materials.grass
                : blockType === 'dirt'
                  ? this.materials.dirt
                  : this.materials.stone;
            const mesh = new THREE.Mesh(this.blockGeometry, material);
            mesh.castShadow = isSurface;
            mesh.receiveShadow = true;
            mesh.position.set(worldX, level * BLOCK_SIZE + BLOCK_SIZE / 2, worldZ);
            mesh.userData = {
              columnKey,
              level,
              gx,
              gz,
              blockType,
              chunkKey: this.getTerrainChunkKey(gx, gz),
            };
            mesh.matrixAutoUpdate = false;
            mesh.updateMatrix();
            const chunk = this.ensureTerrainChunk(mesh.userData.chunkKey);
            chunk.add(mesh);
            column.push(mesh);
            voxelCount += 1;
          }
          this.columns.set(columnKey, column);
        }
      }
      this.terrainChunkGroups.forEach((chunk) => {
        this.recalculateTerrainChunkBounds(chunk);
      });
      this.terrainCullingAccumulator = this.terrainCullingInterval;
      if (typeof console !== 'undefined') {
        const columnCount = WORLD_SIZE * WORLD_SIZE;
        console.log(`World generated: ${columnCount} voxels`);
        console.log(`Terrain blocks placed: ${voxelCount}`);
      }
      this.portalAnchorGrid = this.computePortalAnchorGrid();
      const anchorWorldX = (this.portalAnchorGrid.x - WORLD_SIZE / 2) * BLOCK_SIZE;
      const anchorWorldZ = (this.portalAnchorGrid.z - WORLD_SIZE / 2) * BLOCK_SIZE;
      if (this.portalAnchor?.set) {
        this.portalAnchor.set(anchorWorldX, 0, anchorWorldZ);
      }
    }

    detectChunkDebugFlag() {
      if (typeof window === 'undefined') {
        return false;
      }
      try {
        const params = new URLSearchParams(window.location.search || '');
        return params.get('debugChunks') === '1';
      } catch (error) {
        console.debug('Unable to parse chunk debug flag.', error);
        return false;
      }
    }

    getTerrainChunkKey(gx, gz) {
      const size = this.terrainChunkSize;
      const chunkX = Math.floor(gx / size);
      const chunkZ = Math.floor(gz / size);
      return `${chunkX}|${chunkZ}`;
    }

    ensureTerrainChunk(chunkKey) {
      let chunk = this.terrainChunkMap.get(chunkKey);
      if (chunk) {
        return chunk;
      }
      const THREE = this.THREE;
      const [chunkXRaw, chunkZRaw] = chunkKey.split('|');
      const chunkX = Number.parseInt(chunkXRaw ?? '0', 10) || 0;
      const chunkZ = Number.parseInt(chunkZRaw ?? '0', 10) || 0;
      chunk = new THREE.Group();
      chunk.name = `TerrainChunk-${chunkX}-${chunkZ}`;
      chunk.userData = {
        chunkX,
        chunkZ,
        minY: 0,
        maxY: BLOCK_SIZE,
        boundingSphere: new THREE.Sphere(new THREE.Vector3(), BLOCK_SIZE),
      };
      this.terrainChunkMap.set(chunkKey, chunk);
      this.terrainChunkGroups.push(chunk);
      this.terrainGroup.add(chunk);
      return chunk;
    }

    recalculateTerrainChunkBounds(chunk) {
      if (!chunk) return;
      const data = chunk.userData || {};
      let minY = Infinity;
      let maxY = -Infinity;
      for (const child of chunk.children) {
        if (!child?.position) continue;
        const y = child.position.y;
        const childMin = y - BLOCK_SIZE / 2;
        const childMax = y + BLOCK_SIZE / 2;
        if (childMin < minY) minY = childMin;
        if (childMax > maxY) maxY = childMax;
      }
      if (!Number.isFinite(minY)) {
        minY = 0;
        maxY = BLOCK_SIZE;
        chunk.visible = false;
      } else {
        chunk.visible = true;
      }
      data.minY = minY;
      data.maxY = maxY;
      const size = this.terrainChunkSize;
      const halfWorld = WORLD_SIZE / 2;
      const startX = data.chunkX * size;
      const startZ = data.chunkZ * size;
      const centerOffsetX = startX - halfWorld + (size - 1) / 2;
      const centerOffsetZ = startZ - halfWorld + (size - 1) / 2;
      const centerX = centerOffsetX * BLOCK_SIZE;
      const centerZ = centerOffsetZ * BLOCK_SIZE;
      const centerY = (minY + maxY) / 2;
      const horizontalExtent = (size * BLOCK_SIZE) / 2;
      const verticalExtent = Math.max(BLOCK_SIZE * 0.5, (maxY - minY) / 2 + BLOCK_SIZE * 0.5);
      const radius = Math.sqrt(horizontalExtent * horizontalExtent * 2 + verticalExtent * verticalExtent);
      if (!data.boundingSphere) {
        data.boundingSphere = new this.THREE.Sphere(new this.THREE.Vector3(centerX, centerY, centerZ), radius);
      } else {
        data.boundingSphere.center.set(centerX, centerY, centerZ);
        data.boundingSphere.radius = radius;
      }
      chunk.userData = data;
    }

    markTerrainChunkDirty(chunkKey) {
      if (!chunkKey || !this.terrainChunkMap.has(chunkKey)) return;
      this.dirtyTerrainChunks.add(chunkKey);
    }

    refreshDirtyTerrainChunks() {
      if (!this.dirtyTerrainChunks.size) return;
      for (const key of this.dirtyTerrainChunks) {
        const chunk = this.terrainChunkMap.get(key);
        if (!chunk) continue;
        this.recalculateTerrainChunkBounds(chunk);
      }
      this.dirtyTerrainChunks.clear();
    }

    buildRails() {
      const THREE = this.THREE;
      this.railsGroup.clear();
      const segments = 22;
      const radius = WORLD_SIZE * 0.18;
      for (let i = 0; i < segments; i += 1) {
        const t = i / (segments - 1);
        const angle = (t - 0.5) * Math.PI * 0.45;
        const x = Math.sin(angle) * radius;
        const z = -t * WORLD_SIZE * 0.65;
        const ground = this.sampleGroundHeight(x, z);
        const mesh = new THREE.Mesh(this.railGeometry, this.materials.rails);
        mesh.castShadow = false;
        mesh.receiveShadow = true;
        mesh.position.set(x, ground + 0.1, z);
        mesh.rotation.y = angle * 0.6;
        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();
        this.railsGroup.add(mesh);
      }
    }

    computePortalAnchorGrid() {
      const half = WORLD_SIZE / 2;
      const clampIndex = (value) => Math.max(0, Math.min(WORLD_SIZE - 1, value));
      const xIndex = clampIndex(Math.round((this.portalAnchor?.x ?? 0) / BLOCK_SIZE + half));
      const zIndex = clampIndex(Math.round((this.portalAnchor?.z ?? 0) / BLOCK_SIZE + half));
      return { x: xIndex, z: zIndex };
    }

    createPortalFrameLayout() {
      const layout = [];
      for (let x = -1; x <= 1; x += 1) {
        for (let y = 0; y < 4; y += 1) {
          const required = Math.abs(x) === 1 || y === 0 || y === 3;
          layout.push({ xOffset: x, y, required });
        }
      }
      return layout;
    }

    getPortalSlotKey(gridX, gridZ, relY) {
      return `${gridX}|${gridZ}|${relY}`;
    }

    resetPortalFrameState() {
      this.portalFrameSlots.clear();
      this.restorePortalInteriorBlocks();
      this.portalHiddenInterior = [];
      this.portalReady = false;
      const anchor = this.portalAnchorGrid || this.computePortalAnchorGrid();
      const layout = this.portalFrameLayout || this.createPortalFrameLayout();
      const initial = this.initialHeightMap;
      let requiredCount = 0;
      layout.forEach(({ xOffset, y, required }) => {
        if (!required) return;
        const gridX = Math.max(0, Math.min(WORLD_SIZE - 1, anchor.x + xOffset));
        const gridZ = Math.max(0, Math.min(WORLD_SIZE - 1, anchor.z));
        const slotKey = this.getPortalSlotKey(gridX, gridZ, y);
        const baseHeight = initial?.[gridX]?.[gridZ] ?? 0;
        this.portalFrameSlots.set(slotKey, {
          gridX,
          gridZ,
          relY: y,
          baseHeight,
          filled: false,
        });
        requiredCount += 1;
      });
      this.portalFrameRequiredCount = requiredCount || PORTAL_BLOCK_REQUIREMENT;
      this.portalBlocksPlaced = 0;
      this.portalFrameInteriorValid = this.checkPortalInterior();
      this.updatePortalProgress();
    }

    updatePortalInteriorValidity() {
      const previous = this.portalFrameInteriorValid;
      this.portalFrameInteriorValid = this.checkPortalInterior();
      return previous !== this.portalFrameInteriorValid;
    }

    checkPortalInterior() {
      const anchor = this.portalAnchorGrid || this.computePortalAnchorGrid();
      if (!anchor) {
        return false;
      }
      const gridX = Math.max(0, Math.min(WORLD_SIZE - 1, anchor.x));
      const gridZ = Math.max(0, Math.min(WORLD_SIZE - 1, anchor.z));
      const baseHeight = this.initialHeightMap?.[gridX]?.[gridZ];
      if (baseHeight === undefined) {
        return true;
      }
      const columnKey = `${gridX}|${gridZ}`;
      const column = this.columns.get(columnKey) ?? [];
      for (let relY = 1; relY <= 2; relY += 1) {
        const index = baseHeight + relY;
        const mesh = column[index];
        if (mesh) {
          const blockType = mesh.userData?.blockType;
          if (blockType === 'stone' || mesh.userData?.hiddenForPortal) {
            continue;
          }
          return false;
        }
      }
      return true;
    }

    hidePortalInteriorBlocks() {
      this.restorePortalInteriorBlocks();
      this.portalHiddenInterior = [];
      const anchor = this.portalAnchorGrid || this.computePortalAnchorGrid();
      const gridX = Math.max(0, Math.min(WORLD_SIZE - 1, anchor.x));
      const gridZ = Math.max(0, Math.min(WORLD_SIZE - 1, anchor.z));
      const baseHeight = this.initialHeightMap?.[gridX]?.[gridZ] ?? 0;
      const columnKey = `${gridX}|${gridZ}`;
      const column = this.columns.get(columnKey) ?? [];
      for (let relY = 1; relY <= 2; relY += 1) {
        const index = baseHeight + relY;
        const mesh = column[index];
        if (mesh && mesh.visible !== false) {
          mesh.visible = false;
          if (mesh.userData) {
            mesh.userData.hiddenForPortal = true;
          }
          this.portalHiddenInterior.push(mesh);
        }
      }
    }

    restorePortalInteriorBlocks() {
      if (!Array.isArray(this.portalHiddenInterior) || !this.portalHiddenInterior.length) {
        this.portalHiddenInterior = [];
        return;
      }
      this.portalHiddenInterior.forEach((mesh) => {
        if (!mesh) return;
        mesh.visible = true;
        if (mesh.userData) {
          delete mesh.userData.hiddenForPortal;
        }
      });
      this.portalHiddenInterior = [];
    }

    getPortalAnchorWorldPosition(target = this.tmpVector3) {
      const THREE = this.THREE;
      const anchor = this.portalAnchorGrid || this.computePortalAnchorGrid();
      if (!anchor) {
        if (target?.set) {
          target.set(0, 0, 0);
        } else {
          target.x = 0;
          target.y = 0;
          target.z = 0;
        }
        return target;
      }
      const gridX = Math.max(0, Math.min(WORLD_SIZE - 1, anchor.x));
      const gridZ = Math.max(0, Math.min(WORLD_SIZE - 1, anchor.z));
      const baseHeight = this.initialHeightMap?.[gridX]?.[gridZ] ?? 0;
      const worldX = (gridX - WORLD_SIZE / 2) * BLOCK_SIZE;
      const worldZ = (gridZ - WORLD_SIZE / 2) * BLOCK_SIZE;
      const worldY = (baseHeight + 1.5) * BLOCK_SIZE;
      if (target?.set && THREE?.Vector3 && target instanceof THREE.Vector3) {
        target.set(worldX, worldY, worldZ);
      } else if (target) {
        target.x = worldX;
        target.y = worldY;
        target.z = worldZ;
      }
      return target;
    }

    isPlayerNearPortalFrame() {
      const anchorWorld = this.getPortalAnchorWorldPosition(this.tmpVector3);
      const cameraPosition = this.getCameraWorldPosition(this.tmpVector2);
      const distance = anchorWorld.distanceTo ? anchorWorld.distanceTo(cameraPosition) : null;
      if (distance === null || Number.isNaN(distance)) {
        return false;
      }
      return distance <= PORTAL_INTERACTION_RANGE;
    }

    getPortalFootprint() {
      const anchor = this.portalAnchorGrid || this.computePortalAnchorGrid();
      if (!anchor) {
        return null;
      }
      const gridX = Math.max(0, Math.min(WORLD_SIZE - 1, anchor.x));
      const gridZ = Math.max(0, Math.min(WORLD_SIZE - 1, anchor.z));
      const baseHeight = this.initialHeightMap?.[gridX]?.[gridZ] ?? 0;
      const frame = [];
      const interior = [];
      for (let xOffset = -1; xOffset <= 1; xOffset += 1) {
        for (let relY = 0; relY <= 3; relY += 1) {
          const entry = {
            x: gridX + xOffset,
            y: baseHeight + relY,
            z: gridZ,
          };
          if (Math.abs(xOffset) === 1 || relY === 0 || relY === 3) {
            frame.push(entry);
          } else if (relY > 0 && relY < 3) {
            interior.push(entry);
          }
        }
      }
      return {
        frame,
        interior,
        orientation: 'horizontal',
        bounds: { width: 3, height: 4 },
      };
    }

    ignitePortal(tool = 'torch') {
      if (!this.portalReady || this.portalActivated) {
        return;
      }
      const footprint = this.getPortalFootprint();
      let events = [];
      if (this.portalMechanics?.ignitePortalFrame && footprint) {
        try {
          const result = this.portalMechanics.ignitePortalFrame(footprint, { tool });
          if (Array.isArray(result?.events)) {
            events = result.events.slice();
            this.portalIgnitionLog = events.slice(0, 6);
          }
          if (result?.portal) {
            this.portalState = result.portal;
          }
        } catch (error) {
          console.warn('Portal ignition mechanics failed', error);
        }
      }
      this.portalReady = false;
      this.score += 5;
      this.activatePortal();
      const message = events.length ? events.join(' ') : 'Portal ignited — step through to travel.';
      this.showHint(message);
      this.scheduleScoreSync('portal-primed');
    }

    updatePortalFrameStateForColumn(gx, gz) {
      if (!this.portalFrameSlots.size) {
        return;
      }
      let changed = false;
      const columnKey = `${gx}|${gz}`;
      const column = this.columns.get(columnKey) ?? [];
      this.portalFrameSlots.forEach((slot) => {
        if (slot.gridX !== gx || slot.gridZ !== gz) {
          return;
        }
        const baseHeight = slot.baseHeight ?? this.initialHeightMap?.[slot.gridX]?.[slot.gridZ] ?? 0;
        const targetIndex = baseHeight + slot.relY;
        const mesh = column[targetIndex];
        const valid = Boolean(mesh?.userData?.blockType) && mesh.userData.blockType === 'stone';
        if (slot.filled !== valid) {
          slot.filled = valid;
          changed = true;
        }
      });
      const interiorChanged = this.updatePortalInteriorValidity();
      if (changed || interiorChanged) {
        this.recalculatePortalFrameProgress();
      }
    }

    recalculatePortalFrameProgress() {
      let filled = 0;
      this.portalFrameSlots.forEach((slot) => {
        if (slot.filled) {
          filled += 1;
        }
      });
      this.portalBlocksPlaced = filled;
      this.checkPortalActivation();
    }

    deactivatePortal() {
      if (this.portalMesh) {
        this.portalGroup.remove(this.portalMesh);
        disposeObject3D(this.portalMesh);
        this.portalMesh = null;
      }
      this.portalActivated = false;
      this.portalReady = false;
      this.portalState = null;
      this.portalIgnitionLog = [];
      this.restorePortalInteriorBlocks();
      this.updatePortalInteriorValidity();
      this.updatePortalProgress();
    }

    refreshPortalState() {
      this.deactivatePortal();
      this.portalGroup.clear();
      this.portalHintShown = false;
      this.resetPortalFrameState();
    }

    activatePortal() {
      const THREE = this.THREE;
      const anchor = this.portalAnchorGrid || this.computePortalAnchorGrid();
      const gridX = Math.max(0, Math.min(WORLD_SIZE - 1, anchor.x));
      const gridZ = Math.max(0, Math.min(WORLD_SIZE - 1, anchor.z));
      const baseHeight = this.initialHeightMap?.[gridX]?.[gridZ] ?? 0;
      const anchorWorld = this.getPortalAnchorWorldPosition(this.tmpVector3);
      const worldX = anchorWorld.x;
      const worldY = anchorWorld.y;
      const worldZ = anchorWorld.z;
      this.portalGroup.clear();
      this.portalActivated = true;
      if (!this.portalPlaneGeometry) {
        this.portalPlaneGeometry = new THREE.PlaneGeometry(2.4, 3.2);
      }
      const portalMaterial = this.materials.portal.clone();
      portalMaterial.uniforms = {
        uTime: { value: 0 },
        uColorA: { value: this.materials.portal.uniforms.uColorA.value.clone() },
        uColorB: { value: this.materials.portal.uniforms.uColorB.value.clone() },
      };
      const plane = new THREE.Mesh(this.portalPlaneGeometry, portalMaterial);
      plane.position.set(worldX, worldY, worldZ + 0.02);
      plane.rotation.y = Math.PI;
      plane.renderOrder = 2;
      plane.castShadow = false;
      plane.receiveShadow = false;
      this.portalGroup.add(plane);
      this.portalMesh = plane;
      this.hidePortalInteriorBlocks();
      this.updatePortalInteriorValidity();
      this.portalHintShown = true;
      this.updatePortalProgress();
      this.updateHud();
      this.scheduleScoreSync('portal-activated');
      console.log('Portal active');
      const activeDimension = this.dimensionSettings?.name || 'Unknown Dimension';
      console.log(`Portal active in ${activeDimension}`);
    }

    isPlayerNearPortal() {
      if (!this.portalMesh || !this.camera) return false;
      const cameraPosition = this.getCameraWorldPosition(this.tmpVector3);
      const distance = this.portalMesh.position.distanceTo(cameraPosition);
      return distance <= PORTAL_INTERACTION_RANGE;
    }

    checkPortalActivation() {
      const required = this.portalFrameRequiredCount || PORTAL_BLOCK_REQUIREMENT;
      const ready = required > 0 && this.portalFrameInteriorValid && this.portalBlocksPlaced >= required;
      if (this.portalActivated) {
        if (!ready) {
          this.deactivatePortal();
        } else {
          this.updatePortalProgress();
        }
        return;
      }
      if (!ready) {
        const progress = required > 0 ? this.portalBlocksPlaced / required : 0;
        if (!this.portalHintShown && progress >= 0.5) {
          this.portalHintShown = true;
          this.score += 1;
          this.updateHud();
        }
        this.portalReady = false;
        this.updatePortalProgress();
        return;
      }
      if (!this.portalReady) {
        this.portalReady = true;
        this.portalHintShown = true;
        this.portalIgnitionLog = [];
        this.score += 1;
        this.updateHud();
        this.showHint('Portal frame complete — press F to ignite your torch.');
      }
      this.updatePortalProgress();
    }

    advanceDimension() {
      if (!this.portalActivated || this.victoryAchieved) return;
      this.portalActivations += 1;
      if (this.currentDimensionIndex >= DIMENSION_THEME.length - 1) {
        this.triggerVictory();
        return;
      }
      const nextIndex = this.currentDimensionIndex + 1;
      const nextSettings = DIMENSION_THEME[nextIndex] || null;
      let pointsAwarded = 5;
      let portalLog = '';
      let transitionResult = null;
      if (this.portalMechanics?.enterPortal) {
        try {
          const result = this.portalMechanics.enterPortal(this.portalState || { active: true }, {
            name: nextSettings?.name || `Dimension ${nextIndex + 1}`,
            id: nextSettings?.id || `dimension-${nextIndex + 1}`,
            physics: { gravity: nextSettings?.gravity ?? this.gravityScale, shaderProfile: nextSettings?.id ?? 'default' },
            unlockPoints: 5,
          });
          transitionResult = result;
          if (result?.pointsAwarded !== undefined) {
            pointsAwarded = result.pointsAwarded;
          }
          if (result?.log) {
            portalLog = result.log;
          }
        } catch (error) {
          console.warn('Portal transition mechanics failed', error);
        }
      }
      this.applyDimensionSettings(nextIndex);
      if (transitionResult?.physics?.gravity !== undefined) {
        this.gravityScale = transitionResult.physics.gravity;
      }
      if (this.dimensionSettings) {
        console.log(`Dimension: ${this.dimensionSettings.name} unlocked`);
      }
      this.buildTerrain();
      this.buildRails();
      this.refreshPortalState();
      this.positionPlayer();
      this.clearZombies();
      this.clearGolems();
      this.lastGolemSpawn = this.elapsed;
      if (Number.isFinite(pointsAwarded)) {
        this.score += pointsAwarded;
      }
      this.updateHud();
      this.scheduleScoreSync('dimension-advanced');
      this.audio.play('bubble', { volume: 0.5 });
      if (portalLog) {
        this.showHint(portalLog);
      }
      this.portalState = null;
    }

    triggerVictory() {
      this.victoryAchieved = true;
      this.portalActivated = false;
      this.portalGroup.clear();
      this.portalMesh = null;
      this.score += 25;
      this.clearZombies();
      this.clearGolems();
      this.updatePortalProgress();
      this.updateHud();
      this.scheduleScoreSync('victory');
      this.audio.play('victoryCheer', { volume: 0.75 });
    }

    positionPlayer() {
      const spawnColumn = `${Math.floor(WORLD_SIZE / 2)}|${Math.floor(WORLD_SIZE / 2)}`;
      const column = this.columns.get(spawnColumn);
      if (column && column.length) {
        const top = column[column.length - 1];
        if (this.playerRig) {
          this.playerRig.position.set(top.position.x, top.position.y + PLAYER_EYE_HEIGHT, top.position.z + 2.5);
        } else if (this.camera) {
          this.camera.position.set(top.position.x, top.position.y + PLAYER_EYE_HEIGHT, top.position.z + 2.5);
        }
      } else {
        if (this.playerRig) {
          this.playerRig.position.set(0, PLAYER_EYE_HEIGHT + 1, 0);
        } else if (this.camera) {
          this.camera.position.set(0, PLAYER_EYE_HEIGHT + 1, 0);
        }
      }
    }

    bindEvents() {
      document.addEventListener('pointerlockchange', this.onPointerLockChange);
      document.addEventListener('pointerlockerror', this.onPointerLockError);
      document.addEventListener('keydown', this.onKeyDown);
      document.addEventListener('keyup', this.onKeyUp);
      document.addEventListener('mousemove', this.onMouseMove);
      document.addEventListener('mousedown', this.onMouseDown);
      window.addEventListener('resize', this.onResize);
      this.canvas.addEventListener('wheel', this.onCanvasWheel, { passive: false });
      this.canvas.addEventListener('pointerdown', this.onTouchLookPointerDown, { passive: false });
      window.addEventListener('pointermove', this.onTouchLookPointerMove, { passive: false });
      window.addEventListener('pointerup', this.onTouchLookPointerUp);
      window.addEventListener('pointercancel', this.onTouchLookPointerUp);
      this.canvas.addEventListener('click', () => {
        if (document.pointerLockElement !== this.canvas) {
          this.canvas.requestPointerLock({ unadjustedMovement: true }).catch(() => {});
        }
      });
      this.canvas.addEventListener('contextmenu', this.preventContextMenu);
      if (this.hotbarEl) {
        this.hotbarEl.addEventListener('click', this.onHotbarClick);
      }
      this.craftLauncherButton?.addEventListener('click', this.onOpenCrafting);
      this.closeCraftingButton?.addEventListener('click', this.onCloseCrafting);
      this.craftingModal?.addEventListener('click', this.onCraftingModalBackdrop);
      this.craftButton?.addEventListener('click', this.onCraftButton);
      this.clearCraftButton?.addEventListener('click', this.onClearCraft);
      this.craftSequenceEl?.addEventListener('click', this.onCraftSequenceClick);
      this.craftSuggestionsEl?.addEventListener('click', this.onCraftSuggestionClick);
      this.craftingSearchResultsEl?.addEventListener('click', this.onCraftSuggestionClick);
      this.craftingInventoryEl?.addEventListener('click', this.onCraftingInventoryClick);
      this.openCraftingSearchButton?.addEventListener('click', () => this.toggleCraftingSearch(true));
      this.closeCraftingSearchButton?.addEventListener('click', () => this.toggleCraftingSearch(false));
      this.craftingSearchInput?.addEventListener('input', this.onCraftSearchInput);
      this.inventorySortButton?.addEventListener('click', this.onInventorySort);
      this.closeInventoryButton?.addEventListener('click', this.onInventoryToggle);
      this.openInventoryButtons.forEach((el) => {
        el.addEventListener('click', this.onInventoryToggle);
      });
      this.ui?.dimensionInfoEl?.addEventListener('click', this.onVictoryReplay);
    }

    unbindEvents() {
      document.removeEventListener('pointerlockchange', this.onPointerLockChange);
      document.removeEventListener('pointerlockerror', this.onPointerLockError);
      document.removeEventListener('keydown', this.onKeyDown);
      document.removeEventListener('keyup', this.onKeyUp);
      document.removeEventListener('mousemove', this.onMouseMove);
      document.removeEventListener('mousedown', this.onMouseDown);
      window.removeEventListener('resize', this.onResize);
      this.canvas.removeEventListener('wheel', this.onCanvasWheel);
      this.canvas.removeEventListener('pointerdown', this.onTouchLookPointerDown);
      window.removeEventListener('pointermove', this.onTouchLookPointerMove);
      window.removeEventListener('pointerup', this.onTouchLookPointerUp);
      window.removeEventListener('pointercancel', this.onTouchLookPointerUp);
      this.canvas.removeEventListener('contextmenu', this.preventContextMenu);
      if (this.hotbarEl) {
        this.hotbarEl.removeEventListener('click', this.onHotbarClick);
      }
      this.craftLauncherButton?.removeEventListener('click', this.onOpenCrafting);
      this.closeCraftingButton?.removeEventListener('click', this.onCloseCrafting);
      this.craftingModal?.removeEventListener('click', this.onCraftingModalBackdrop);
      this.craftButton?.removeEventListener('click', this.onCraftButton);
      this.clearCraftButton?.removeEventListener('click', this.onClearCraft);
      this.craftSequenceEl?.removeEventListener('click', this.onCraftSequenceClick);
      this.craftSuggestionsEl?.removeEventListener('click', this.onCraftSuggestionClick);
      this.craftingSearchResultsEl?.removeEventListener('click', this.onCraftSuggestionClick);
      this.craftingInventoryEl?.removeEventListener('click', this.onCraftingInventoryClick);
      this.craftingSearchInput?.removeEventListener('input', this.onCraftSearchInput);
      this.inventorySortButton?.removeEventListener('click', this.onInventorySort);
      this.closeInventoryButton?.removeEventListener('click', this.onInventoryToggle);
      this.openInventoryButtons.forEach((el) => {
        el.removeEventListener('click', this.onInventoryToggle);
      });
      this.ui?.dimensionInfoEl?.removeEventListener('click', this.onVictoryReplay);
      this.teardownMobileControls();
    }

    handlePointerLockChange() {
      this.pointerLocked = document.pointerLockElement === this.canvas;
    }

    handlePointerLockError() {
      this.pointerLocked = false;
    }

    handleMouseMove(event) {
      if (!this.pointerLocked) return;
      this.yaw -= event.movementX * POINTER_SENSITIVITY;
      this.pitch -= event.movementY * POINTER_SENSITIVITY;
      const maxPitch = Math.PI / 2 - 0.01;
      this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch));
    }

    handleKeyDown(event) {
      this.keys.add(event.code);
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'].includes(event.code)) {
        event.preventDefault();
      }
      if (event.code === 'KeyW' && !event.repeat) {
        console.log('Moving forward');
      }
      if (event.code === 'KeyR') {
        this.resetPosition();
        event.preventDefault();
      }
      if (event.code === 'KeyF') {
        if (this.portalActivated && this.isPlayerNearPortal()) {
          this.advanceDimension();
        } else if (this.portalReady && this.isPlayerNearPortalFrame()) {
          this.ignitePortal('torch');
        }
        event.preventDefault();
      }
      if (event.code === 'KeyQ') {
        this.placeBlock();
        event.preventDefault();
      }
      if (event.code === 'KeyE') {
        const open = this.craftingModal?.hidden !== false;
        this.toggleCraftingModal(open);
        event.preventDefault();
      }
      if (event.code === 'KeyI') {
        const open = this.inventoryModal?.hidden !== false;
        this.toggleInventoryModal(open);
        event.preventDefault();
      }
      if (event.code === 'Escape') {
        this.toggleCraftingModal(false);
        this.toggleInventoryModal(false);
      }
      if (event.code.startsWith('Digit')) {
        const index = Number.parseInt(event.code.slice(5), 10) - 1;
        if (Number.isInteger(index)) {
          this.selectHotbarSlot(index, true);
          event.preventDefault();
        }
      }
    }

    handleKeyUp(event) {
      this.keys.delete(event.code);
    }

    handleResize() {
      if (!this.renderer || !this.camera) return;
      const width = this.canvas.clientWidth || window.innerWidth || 1;
      const height = this.canvas.clientHeight || window.innerHeight || 1;
      this.renderer.setSize(width, height, false);
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      const touchPreference = this.detectTouchPreferred();
      if (touchPreference !== this.isTouchPreferred) {
        this.isTouchPreferred = touchPreference;
        this.initializeMobileControls();
      }
    }

    handleMouseDown(event) {
      if (!this.pointerLocked || !this.camera) return;
      if (event.button === 0) {
        this.mineBlock();
      } else if (event.button === 2) {
        this.placeBlock();
      }
    }

    resetPosition() {
      this.velocity.set(0, 0, 0);
      this.verticalVelocity = 0;
      this.isGrounded = false;
      this.positionPlayer();
    }

    renderFrame(timestamp) {
      this.animationFrame = requestAnimationFrame((nextTimestamp) => this.renderFrame(nextTimestamp));
      if (!this.prevTime) {
        this.prevTime = timestamp;
      }
      const delta = Math.min(0.05, (timestamp - this.prevTime) / 1000);
      this.prevTime = timestamp;
      this.elapsed += delta;
      this.updateDayNightCycle();
      this.updateMovement(delta);
      this.updateCameraShake(delta);
      this.updateTerrainCulling(delta);
      this.updateZombies(delta);
      this.updateGolems(delta);
      this.updatePortalAnimation(delta);
      this.updateHands(delta);
      this.updatePlayerAnimation(delta);
      this.updateScoreSync(delta);
      this.updateScoreboardPolling(delta);
      this.renderer.render(this.scene, this.camera);
    }

    updateMovement(delta) {
      const THREE = this.THREE;
      const forward = this.tmpForward;
      const right = this.tmpRight;
      forward.set(0, 0, -1).applyEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
      forward.y = 0;
      if (forward.lengthSq() > 0) forward.normalize();
      right.set(1, 0, 0).applyEuler(new THREE.Euler(0, this.yaw + Math.PI / 2, 0));
      right.y = 0;
      if (right.lengthSq() > 0) right.normalize();

      const speed = this.currentSpeed;
      if (this.keys.has('KeyW')) {
        this.velocity.addScaledVector(forward, speed * delta);
      }
      if (this.keys.has('KeyS')) {
        this.velocity.addScaledVector(forward, -speed * delta);
      }
      if (this.keys.has('KeyA')) {
        this.velocity.addScaledVector(right, -speed * delta);
      }
      if (this.keys.has('KeyD')) {
        this.velocity.addScaledVector(right, speed * delta);
      }

      const joystickForward = this.THREE.MathUtils.clamp(-this.joystickVector.y, -1, 1);
      const joystickRight = this.THREE.MathUtils.clamp(this.joystickVector.x, -1, 1);
      const digitalForward = (this.touchButtonStates.up ? 1 : 0) - (this.touchButtonStates.down ? 1 : 0);
      const digitalRight = (this.touchButtonStates.right ? 1 : 0) - (this.touchButtonStates.left ? 1 : 0);
      const combinedForward = this.THREE.MathUtils.clamp(joystickForward + digitalForward, -1, 1);
      const combinedRight = this.THREE.MathUtils.clamp(joystickRight + digitalRight, -1, 1);
      if (Math.abs(combinedForward) > 0.001) {
        this.velocity.addScaledVector(forward, speed * delta * combinedForward);
      }
      if (Math.abs(combinedRight) > 0.001) {
        this.velocity.addScaledVector(right, speed * delta * combinedRight);
      }

      this.velocity.multiplyScalar(PLAYER_INERTIA);

      const cameraQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
      this.camera.quaternion.copy(cameraQuaternion);

      const position = this.playerRig ? this.playerRig.position : this.camera.position;
      position.add(this.velocity);

      const groundHeight = this.sampleGroundHeight(position.x, position.z);
      if ((this.keys.has('Space') || this.touchJumpRequested) && this.isGrounded) {
        const jumpBoost = 4.6 + (1.5 - Math.min(1.5, this.gravityScale));
        this.verticalVelocity = jumpBoost;
        this.isGrounded = false;
      }
      this.touchJumpRequested = false;
      const gravityForce = 22 * this.gravityScale;
      this.verticalVelocity -= gravityForce * delta;
      position.y += this.verticalVelocity * delta;
      const desiredHeight = groundHeight + PLAYER_EYE_HEIGHT;
      if (position.y <= desiredHeight) {
        position.y = desiredHeight;
        this.verticalVelocity = 0;
        this.isGrounded = true;
      }

      const maxDistance = (WORLD_SIZE / 2 - 2) * BLOCK_SIZE;
      position.x = THREE.MathUtils.clamp(position.x, -maxDistance, maxDistance);
      position.z = THREE.MathUtils.clamp(position.z, -maxDistance, maxDistance);
    }

    updateCameraShake(delta) {
      if (!this.camera || !this.cameraBaseOffset) {
        return;
      }
      if (this.cameraShakeIntensity <= 0 || this.cameraShakeDuration <= 0) {
        this.camera.position.copy(this.cameraBaseOffset);
        this.cameraShakeOffset.set(0, 0, 0);
        this.cameraShakeRotation.set(0, 0, 0);
        this.cameraShakeDuration = 0;
        this.cameraShakeTime = 0;
        return;
      }
      this.cameraShakeTime += delta;
      const progress = this.cameraShakeDuration > 0 ? this.cameraShakeTime / this.cameraShakeDuration : 1;
      if (progress >= 1) {
        this.cameraShakeIntensity = 0;
        this.cameraShakeOffset.set(0, 0, 0);
        this.cameraShakeRotation.set(0, 0, 0);
        this.camera.position.copy(this.cameraBaseOffset);
        this.cameraShakeDuration = 0;
        this.cameraShakeTime = 0;
        return;
      }
      const falloff = (1 - progress) * (1 - progress);
      const strength = this.cameraShakeIntensity * falloff;
      this.cameraShakeNoise.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
      this.cameraShakeOffset.copy(this.cameraShakeNoise).multiplyScalar(0.08 * strength);
      this.camera.position.copy(this.cameraBaseOffset).add(this.cameraShakeOffset);
      this.cameraShakeRotation.set(this.cameraShakeOffset.y * 0.6, -this.cameraShakeOffset.x * 1.1, 0);
      this.tmpQuaternion.setFromEuler(this.cameraShakeRotation);
      this.camera.quaternion.multiply(this.tmpQuaternion);
    }

    triggerCameraImpulse(strength = 0.35, duration = 0.25) {
      if (!this.camera || !this.cameraBaseOffset) {
        return;
      }
      this.cameraShakeIntensity = Math.min(1.6, Math.max(strength, this.cameraShakeIntensity * 0.6 + strength));
      this.cameraShakeDuration = Math.max(duration, 0.12);
      this.cameraShakeTime = 0;
    }

    updateHands(delta) {
      if (!this.handGroup) return;
      const THREE = this.THREE;
      const speed = this.velocity.length();
      const target = Math.min(1, speed * 3.2 + (this.isGrounded ? 0 : 0.25));
      this.handSwingStrength = THREE.MathUtils.lerp(this.handSwingStrength, target, delta * 6.5);
      this.handSwingTimer += delta * (4 + speed * 3);
      const bob = Math.sin(this.handSwingTimer) * 0.05 * this.handSwingStrength;
      const sway = Math.cos(this.handSwingTimer * 0.5) * 0.08 * this.handSwingStrength;
      this.handGroup.position.set(0.42 + sway, -0.46 + bob, -0.8);
      this.handGroup.rotation.set(-0.55 + bob * 1.8, sway * 0.6, sway * 0.15);
    }

    updatePlayerAnimation(delta) {
      if (!this.playerMixer) return;
      this.playerMixer.update(delta);
    }

    updateScoreSync(delta) {
      if (!this.apiBaseUrl) return;
      this.scoreSyncHeartbeat += delta;
      const now = performance.now();
      if (this.pendingScoreSyncReason && !this.scoreSyncInFlight) {
        if (now - this.lastScoreSyncAt > this.scoreSyncCooldownSeconds * 1000) {
          this.flushScoreSync();
        }
        return;
      }
      if (
        !this.scoreSyncInFlight &&
        this.scoreSyncHeartbeat >= this.scoreSyncCooldownSeconds * 2 &&
        now - this.lastScoreSyncAt > this.scoreSyncCooldownSeconds * 1000
      ) {
        this.flushScoreSync(true);
        this.scoreSyncHeartbeat = 0;
      }
    }

    updateTerrainCulling(delta) {
      if (!this.camera || !this.terrainChunkGroups.length) {
        return;
      }
      this.terrainCullingAccumulator += delta;
      if (this.terrainCullingAccumulator < this.terrainCullingInterval) {
        return;
      }
      this.terrainCullingAccumulator = 0;
      this.refreshDirtyTerrainChunks();
      this.camera.updateMatrixWorld();
      this.chunkFrustumMatrix.multiplyMatrices(
        this.camera.projectionMatrix,
        this.camera.matrixWorldInverse,
      );
      this.chunkFrustum.setFromProjectionMatrix(this.chunkFrustumMatrix);
      for (const chunk of this.terrainChunkGroups) {
        const sphere = chunk.userData?.boundingSphere;
        if (!sphere) {
          chunk.visible = true;
          continue;
        }
        chunk.visible = this.chunkFrustum.intersectsSphere(sphere);
      }
      if (this.debugChunkCulling) {
        const visibleCount = this.terrainChunkGroups.reduce(
          (total, chunk) => total + (chunk.visible ? 1 : 0),
          0,
        );
        const now = performance.now();
        if (!this.lastCullingDebugLog || now - this.lastCullingDebugLog > 500) {
          console.debug(`[Chunks] visible ${visibleCount}/${this.terrainChunkGroups.length}`);
          this.lastCullingDebugLog = now;
        }
      }
    }

    sampleGroundHeight(x, z) {
      const gridX = Math.round(x / BLOCK_SIZE + WORLD_SIZE / 2);
      const gridZ = Math.round(z / BLOCK_SIZE + WORLD_SIZE / 2);
      const height = this.heightMap[gridX]?.[gridZ] ?? 0;
      return height * BLOCK_SIZE;
    }

    updateDayNightCycle() {
      if (!this.sunLight || !this.hemiLight) return;
      const cycle = (this.elapsed % DAY_LENGTH_SECONDS) / DAY_LENGTH_SECONDS;
      const angle = cycle * Math.PI * 2;
      const intensity = Math.max(0.12, Math.sin(angle) * 0.5 + 0.55);
      this.daylightIntensity = intensity;
      this.sunLight.position.set(Math.cos(angle) * 60, Math.sin(angle) * 45, Math.sin(angle * 0.7) * 40);
      this.sunLight.intensity = 0.6 + intensity * 0.8;
      this.hemiLight.intensity = 0.6 + intensity * 0.4;
      if (this.scene?.fog) {
        this.scene.fog.color.setHSL(0.55, 0.5, 0.7 - intensity * 0.2);
      }
      if (this.ui?.timeEl) {
        const daylight = Math.round(Math.min(1, Math.max(0, intensity)) * 100);
        let label = 'Daylight';
        if (intensity < 0.28) {
          label = 'Nightfall';
        } else if (intensity < 0.45) {
          label = 'Dusk';
        } else if (intensity > 0.85) {
          label = 'Dawn';
        }
        this.ui.timeEl.textContent = `${label} ${daylight}%`;
      }
    }

    updatePortalAnimation(delta) {
      if (!this.portalMesh) return;
      const material = this.portalMesh.material;
      if (material?.uniforms?.uTime) {
        material.uniforms.uTime.value += delta * 1.2;
      }
    }

    updateZombies(delta) {
      if (!this.zombieGroup) return;
      const THREE = this.THREE;
      if (!this.isNight()) {
        if (this.zombies.length) {
          this.clearZombies();
        }
        return;
      }
      if (this.elapsed - this.lastZombieSpawn > ZOMBIE_SPAWN_INTERVAL && this.zombies.length < ZOMBIE_MAX_PER_DIMENSION) {
        this.spawnZombie();
        this.lastZombieSpawn = this.elapsed;
      }
      const playerPosition = this.getCameraWorldPosition(this.tmpVector3);
      const tmpDir = this.tmpVector;
      const tmpStep = this.tmpVector2;
      for (const zombie of this.zombies) {
        const { mesh } = zombie;
        tmpDir.subVectors(playerPosition, mesh.position);
        const distance = tmpDir.length();
        if (distance > 0.001) {
          tmpDir.normalize();
          tmpStep.copy(tmpDir).multiplyScalar(zombie.speed * delta);
          mesh.position.add(tmpStep);
          mesh.rotation.y = Math.atan2(tmpDir.x, tmpDir.z);
        }
        const groundHeight = this.sampleGroundHeight(mesh.position.x, mesh.position.z);
        mesh.position.y = THREE.MathUtils.lerp(mesh.position.y, groundHeight + 0.9, delta * 10);
        if (distance < ZOMBIE_CONTACT_RANGE && this.elapsed - zombie.lastAttack > 1.2) {
          this.damagePlayer(1);
          zombie.lastAttack = this.elapsed;
        }
      }
    }

    isNight() {
      return this.daylightIntensity < 0.32;
    }

    spawnZombie() {
      const THREE = this.THREE;
      if (!THREE) return;
      const id = (this.zombieIdCounter += 1);
      const angle = Math.random() * Math.PI * 2;
      const radius = WORLD_SIZE * 0.45;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const ground = this.sampleGroundHeight(x, z);
      if (!this.zombieGeometry) {
        this.zombieGeometry = new THREE.BoxGeometry(0.9, 1.8, 0.9);
      }
      const material = this.materials.zombie.clone();
      material.color.offsetHSL(0, (Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.1);
      const mesh = new THREE.Mesh(this.zombieGeometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.position.set(x, ground + 0.9, z);
      this.zombieGroup.add(mesh);
      const zombie = { id, mesh, speed: 2.4, lastAttack: this.elapsed, placeholder: true };
      this.zombies.push(zombie);
      this.upgradeZombie(zombie);
      console.log('Zombie spawned, chasing');
    }

    clearZombies() {
      for (const zombie of this.zombies) {
        this.zombieGroup.remove(zombie.mesh);
        disposeObject3D(zombie.mesh);
      }
      this.zombieGroup.clear();
      this.zombies = [];
    }

    removeZombie(target) {
      if (!target) return;
      const index = this.zombies.indexOf(target);
      if (index >= 0) {
        this.zombies.splice(index, 1);
      }
      this.zombieGroup.remove(target.mesh);
      disposeObject3D(target.mesh);
    }

    findNearestZombie(position) {
      if (!position) return null;
      let best = null;
      let bestDistance = Infinity;
      for (const zombie of this.zombies) {
        const distance = position.distanceTo(zombie.mesh.position);
        if (distance < bestDistance) {
          best = zombie;
          bestDistance = distance;
        }
      }
      return best;
    }

    createGolemActor() {
      const THREE = this.THREE;
      if (!THREE) return null;
      const group = new THREE.Group();
      const bodyMaterial = new THREE.MeshStandardMaterial({ color: '#d9c9a7', roughness: 0.7, metalness: 0.1 });
      const accentMaterial = new THREE.MeshStandardMaterial({ color: '#ffb347', emissive: '#ff7043', emissiveIntensity: 0.3 });
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.6, 0.6), bodyMaterial);
      body.position.y = 0.8;
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), bodyMaterial.clone());
      head.position.y = 1.6;
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.02), accentMaterial);
      eye.position.set(0, 1.6, 0.32);
      const armGeometry = new THREE.BoxGeometry(0.28, 0.9, 0.28);
      const leftArm = new THREE.Mesh(armGeometry, bodyMaterial.clone());
      leftArm.position.set(-0.65, 0.6, 0);
      const rightArm = new THREE.Mesh(armGeometry, bodyMaterial.clone());
      rightArm.position.set(0.65, 0.6, 0);
      const legGeometry = new THREE.BoxGeometry(0.3, 0.8, 0.3);
      const leftLeg = new THREE.Mesh(legGeometry, bodyMaterial.clone());
      leftLeg.position.set(-0.25, 0.1, 0);
      const rightLeg = new THREE.Mesh(legGeometry, bodyMaterial.clone());
      rightLeg.position.set(0.25, 0.1, 0);
      [body, head, eye, leftArm, rightArm, leftLeg, rightLeg].forEach((mesh) => {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
      });
      return group;
    }

    spawnGolem() {
      const THREE = this.THREE;
      if (!THREE || !this.golemGroup) return;
      if (this.golems.length >= GOLEM_MAX_PER_DIMENSION) return;
      const actor = this.createGolemActor();
      if (!actor) return;
      const base = this.getCameraWorldPosition(this.tmpVector3);
      const angle = Math.random() * Math.PI * 2;
      const radius = 6 + Math.random() * 4;
      const x = base.x + Math.cos(angle) * radius;
      const z = base.z + Math.sin(angle) * radius;
      const ground = this.sampleGroundHeight(x, z);
      actor.position.set(x, ground + 1, z);
      this.golemGroup.add(actor);
      const golem = {
        id: `golem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        mesh: actor,
        cooldown: 0,
        speed: 3.1,
        placeholder: true,
      };
      this.golems.push(golem);
      this.upgradeGolem(golem);
      this.lastGolemSpawn = this.elapsed;
      this.showHint('An iron golem joins your defense.');
    }

    updateGolems(delta) {
      if (!this.golemGroup) return;
      const shouldSpawnGuard = this.isNight() || this.zombies.length > 0;
      if (
        shouldSpawnGuard &&
        this.elapsed - this.lastGolemSpawn > GOLEM_SPAWN_INTERVAL &&
        this.golems.length < GOLEM_MAX_PER_DIMENSION
      ) {
        this.spawnGolem();
      }
      if (!this.golems.length) return;
      const THREE = this.THREE;
      const playerPosition = this.getCameraWorldPosition(this.tmpVector3);
      for (const golem of this.golems) {
        golem.cooldown = Math.max(0, golem.cooldown - delta);
        const target = this.findNearestZombie(golem.mesh.position) ?? null;
        const destination = target?.mesh?.position ?? playerPosition;
        if (destination) {
          this.tmpVector.subVectors(destination, golem.mesh.position);
          const distance = this.tmpVector.length();
          if (distance > 0.001) {
            this.tmpVector.normalize();
            this.tmpVector2.copy(this.tmpVector).multiplyScalar(golem.speed * delta);
            golem.mesh.position.add(this.tmpVector2);
            golem.mesh.rotation.y = Math.atan2(this.tmpVector.x, this.tmpVector.z);
          }
          const ground = this.sampleGroundHeight(golem.mesh.position.x, golem.mesh.position.z);
          golem.mesh.position.y = THREE.MathUtils.lerp(golem.mesh.position.y, ground + 1.1, delta * 8);
          if (target && distance < GOLEM_CONTACT_RANGE && golem.cooldown <= 0) {
            this.removeZombie(target);
            golem.cooldown = 1.1;
            this.score += 0.5;
            this.updateHud();
            this.audio.play('zombieGroan', { volume: 0.3 });
            this.showHint('Iron golem smashed a zombie!');
            this.scheduleScoreSync('golem-defense');
          }
        }
      }
      this.golems = this.golems.filter((golem) => golem.mesh.parent === this.golemGroup);
    }

    clearGolems() {
      if (!this.golems.length) return;
      for (const golem of this.golems) {
        this.golemGroup.remove(golem.mesh);
        disposeObject3D(golem.mesh);
      }
      this.golemGroup?.clear?.();
      this.golems = [];
    }

    damagePlayer(amount) {
      const previous = this.health;
      this.health = Math.max(0, this.health - amount);
      if (this.health !== previous) {
        this.updateHud();
        this.audio.play('crunch', { volume: 0.55 + Math.random() * 0.2 });
        this.triggerCameraImpulse(0.6, 0.4);
      }
      if (this.health <= 0) {
        this.handleDefeat();
      }
    }

    handleDefeat() {
      this.health = FALLBACK_HEALTH;
      this.score = Math.max(0, this.score - 4);
      this.verticalVelocity = 0;
      this.isGrounded = false;
      this.positionPlayer();
      this.clearZombies();
      this.lastZombieSpawn = this.elapsed;
      this.clearGolems();
      this.lastGolemSpawn = this.elapsed;
      this.updateHud();
      this.scheduleScoreSync('respawn');
      this.audio.play('bubble', { volume: 0.45 });
      console.log('Respawn triggered');
    }

    mineBlock() {
      const intersections = this.castFromCamera();
      if (!intersections.length) return;
      const hit = intersections.find((intersection) => intersection.object?.userData?.columnKey);
      if (!hit) return;
      const mesh = hit.object;
      const columnKey = mesh.userData.columnKey;
      const column = this.columns.get(columnKey);
      if (!column || !column.length) return;
      const top = column[column.length - 1];
      if (top !== mesh) {
        return;
      }
      column.pop();
      if (mesh.parent) {
        mesh.parent.remove(mesh);
      } else {
        this.terrainGroup.remove(mesh);
      }
      const removedChunkKey = mesh.userData?.chunkKey || this.getTerrainChunkKey(mesh.userData.gx, mesh.userData.gz);
      this.markTerrainChunkDirty(removedChunkKey);
      this.blocksMined += 1;
      const blockType = mesh.userData.blockType || 'stone';
      this.score += blockType === 'stone' ? 1 : 0.75;
      this.heightMap[mesh.userData.gx][mesh.userData.gz] = column.length;
      if (column.length) {
        const newTop = column[column.length - 1];
        newTop.material = this.materials.grass;
        newTop.userData.blockType = 'grass-block';
      }
      this.updatePortalFrameStateForColumn(mesh.userData.gx, mesh.userData.gz);
      const drops = this.getDropsForBlock(blockType);
      if (drops.length) {
        this.collectDrops(drops);
      }
      this.updateHud();
      this.audio.playRandom(['miningA', 'miningB'], {
        volume: 0.45 + Math.random() * 0.2,
        rate: 0.92 + Math.random() * 0.12,
      });
      this.triggerCameraImpulse(0.45, 0.22);
    }

    placeBlock() {
      const intersections = this.castFromCamera();
      if (!intersections.length) return;
      const hit = intersections.find((intersection) => intersection.object?.userData?.columnKey);
      if (!hit) return;
      const mesh = hit.object;
      const { columnKey, gx, gz } = mesh.userData;
      const column = this.columns.get(columnKey) ?? [];
      const newLevel = column.length;
      const worldX = mesh.position.x;
      const worldZ = mesh.position.z;
      if (newLevel >= 12) {
        this.showHint('Column at maximum height. Try another spot.');
        return;
      }
      const allowed = new Set(['grass-block', 'dirt', 'stone']);
      const consumed = this.useSelectedItem({ allow: allowed });
      if (!consumed) {
        this.showHint('Select a block in your hotbar to place it.');
        return;
      }
      const blockType = consumed;
      const material = this.getMaterialForBlock(blockType);
      if (column.length) {
        const prevTop = column[column.length - 1];
        if (prevTop) {
          prevTop.material = this.materials.dirt;
          prevTop.userData.blockType = 'dirt';
        }
      }
      const chunkKey = this.getTerrainChunkKey(gx, gz);
      const chunk = this.ensureTerrainChunk(chunkKey);
      const newMesh = new this.THREE.Mesh(this.blockGeometry, material);
      newMesh.castShadow = true;
      newMesh.receiveShadow = true;
      newMesh.position.set(worldX, newLevel * BLOCK_SIZE + BLOCK_SIZE / 2, worldZ);
      newMesh.matrixAutoUpdate = false;
      newMesh.updateMatrix();
      newMesh.userData = { columnKey, level: newLevel, gx, gz, blockType, chunkKey };
      chunk.add(newMesh);
      this.markTerrainChunkDirty(chunkKey);
      column.push(newMesh);
      this.columns.set(columnKey, column);
      this.heightMap[gx][gz] = column.length;
      this.blocksPlaced += 1;
      this.score = Math.max(0, this.score - 0.25);
      this.updatePortalFrameStateForColumn(gx, gz);
      this.updateHud();
      this.audio.play('crunch', { volume: 0.4 + Math.random() * 0.15 });
      this.triggerCameraImpulse(0.32, 0.18);
    }

    castFromCamera() {
      const THREE = this.THREE;
      if (!this.camera) return [];
      const origin = this.getCameraWorldPosition(this.tmpVector3);
      const direction = this.getCameraWorldDirection(this.tmpVector);
      this.raycaster.set(origin, direction.normalize());
      return this.raycaster.intersectObjects(this.terrainGroup.children, true);
    }

    getMaterialForBlock(blockType) {
      if (blockType === 'grass-block') return this.materials.grass;
      if (blockType === 'dirt') return this.materials.dirt;
      return this.materials.stone;
    }

    getDropsForBlock(blockType) {
      const drops = [];
      if (blockType === 'grass-block') {
        drops.push({ item: 'grass-block', quantity: 1 });
        if (Math.random() < 0.35) {
          drops.push({ item: 'stick', quantity: 1 });
        }
      } else if (blockType === 'dirt') {
        drops.push({ item: 'dirt', quantity: 1 });
        if (Math.random() < 0.15) {
          drops.push({ item: 'stick', quantity: 1 });
        }
      } else if (blockType === 'stone') {
        drops.push({ item: 'stone', quantity: 1 });
        if (this.currentDimensionIndex >= 2 && Math.random() < 0.18) {
          drops.push({ item: 'portal-charge', quantity: 1 });
        }
      } else {
        drops.push({ item: blockType, quantity: 1 });
      }
      return drops;
    }

    collectDrops(drops = []) {
      let collectedAny = false;
      drops.forEach(({ item, quantity }) => {
        if (!item || quantity <= 0) return;
        const accepted = this.addItemToInventory(item, quantity);
        if (accepted) {
          collectedAny = true;
        }
      });
      if (collectedAny) {
        this.updateHud();
      }
    }

    getCameraWorldPosition(target) {
      const THREE = this.THREE;
      const destination = target ?? (THREE ? new THREE.Vector3() : { x: 0, y: 0, z: 0 });
      if (this.camera?.getWorldPosition) {
        this.camera.getWorldPosition(destination);
        return destination;
      }
      if (this.playerRig) {
        destination.copy?.(this.playerRig.position);
        if (!destination.copy) {
          destination.x = this.playerRig.position.x;
          destination.y = this.playerRig.position.y;
          destination.z = this.playerRig.position.z;
        }
        return destination;
      }
      if (destination.set) {
        destination.set(0, 0, 0);
      } else {
        destination.x = 0;
        destination.y = 0;
        destination.z = 0;
      }
      return destination;
    }

    getCameraWorldDirection(target) {
      const THREE = this.THREE;
      const destination = target ?? (THREE ? new THREE.Vector3() : { x: 0, y: 0, z: -1 });
      if (this.camera?.getWorldDirection) {
        this.camera.getWorldDirection(destination);
        if (destination.normalize) destination.normalize();
        return destination;
      }
      if (this.camera?.quaternion && destination.set) {
        destination.set(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
        return destination;
      }
      if (destination.set) {
        destination.set(0, 0, -1);
      } else {
        destination.x = 0;
        destination.y = 0;
        destination.z = -1;
      }
      return destination;
    }

    addItemToInventory(item, quantity = 1) {
      if (!item || quantity <= 0) return false;
      let remaining = quantity;
      for (let i = 0; i < this.hotbar.length && remaining > 0; i += 1) {
        const slot = this.hotbar[i];
        if (slot.item === item && slot.quantity < MAX_STACK_SIZE) {
          const add = Math.min(MAX_STACK_SIZE - slot.quantity, remaining);
          slot.quantity += add;
          remaining -= add;
        }
      }
      for (let i = 0; i < this.hotbar.length && remaining > 0; i += 1) {
        const slot = this.hotbar[i];
        if (!slot.item) {
          const add = Math.min(MAX_STACK_SIZE, remaining);
          slot.item = item;
          slot.quantity = add;
          remaining -= add;
        }
      }
      if (remaining > 0) {
        const existing = this.satchel.get(item) ?? 0;
        this.satchel.set(item, existing + remaining);
        remaining = 0;
      }
      if (remaining === 0) {
        this.updateInventoryUi();
        return true;
      }
      return false;
    }

    removeItemFromInventory(item, quantity = 1) {
      if (!item || quantity <= 0) return 0;
      let remaining = quantity;
      for (let i = 0; i < this.hotbar.length && remaining > 0; i += 1) {
        const slot = this.hotbar[i];
        if (slot.item !== item) continue;
        const take = Math.min(slot.quantity, remaining);
        slot.quantity -= take;
        remaining -= take;
        if (slot.quantity <= 0) {
          slot.item = null;
          slot.quantity = 0;
        }
      }
      if (remaining > 0) {
        const available = this.satchel.get(item) ?? 0;
        const take = Math.min(available, remaining);
        if (take > 0) {
          this.satchel.set(item, available - take);
          remaining -= take;
        }
        if (this.satchel.get(item) === 0) {
          this.satchel.delete(item);
        }
      }
      if (remaining > 0) {
        return quantity - remaining;
      }
      this.updateInventoryUi();
      return quantity;
    }

    useSelectedItem({ allow } = {}) {
      const slot = this.hotbar[this.selectedHotbarIndex];
      if (!slot?.item || slot.quantity <= 0) {
        return null;
      }
      if (allow instanceof Set && !allow.has(slot.item)) {
        return null;
      }
      const item = slot.item;
      slot.quantity -= 1;
      if (slot.quantity <= 0) {
        slot.item = null;
        slot.quantity = 0;
        this.refillHotbarSlot(this.selectedHotbarIndex, item);
      }
      this.updateInventoryUi();
      return item;
    }

    refillHotbarSlot(index, item) {
      if (!item) return;
      const available = this.satchel.get(item);
      if (!available) return;
      const slot = this.hotbar[index];
      const take = Math.min(MAX_STACK_SIZE, available);
      slot.item = item;
      slot.quantity = take;
      this.satchel.set(item, available - take);
      if (this.satchel.get(item) === 0) {
        this.satchel.delete(item);
      }
    }

    getTotalInventoryCount() {
      const hotbarTotal = this.hotbar.reduce((sum, slot) => sum + (slot.quantity || 0), 0);
      let satchelTotal = 0;
      this.satchel.forEach((value) => {
        satchelTotal += value;
      });
      return hotbarTotal + satchelTotal;
    }

    updateInventoryUi() {
      this.updateHotbarUi();
      this.updateCraftingInventoryUi();
      this.updateInventoryModal();
      this.updateCraftButtonState();
    }

    updateHotbarUi() {
      if (!this.hotbarEl) return;
      const slots = Array.from(this.hotbarEl.querySelectorAll('[data-hotbar-slot]'));
      if (!slots.length) {
        this.hotbarEl.innerHTML = '';
        this.hotbar.forEach((slot, index) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'hotbar-slot';
          button.dataset.hotbarSlot = index;
          button.setAttribute('aria-label', 'Empty slot');
          this.hotbarEl.appendChild(button);
        });
      }
      const updatedSlots = Array.from(this.hotbarEl.querySelectorAll('[data-hotbar-slot]'));
      updatedSlots.forEach((element) => {
        const index = Number.parseInt(element.dataset.hotbarSlot ?? '-1', 10);
        if (!Number.isInteger(index) || index < 0 || index >= this.hotbar.length) return;
        const slot = this.hotbar[index];
        const def = getItemDefinition(slot.item);
        element.dataset.active = index === this.selectedHotbarIndex ? 'true' : 'false';
        element.textContent = slot.item ? `${def.icon} ${slot.quantity}` : '·';
        element.setAttribute('aria-label', slot.item ? formatInventoryLabel(slot.item, slot.quantity) : 'Empty slot');
      });
    }

    updateCraftingInventoryUi() {
      if (!this.craftingInventoryEl) return;
      const fragment = document.createDocumentFragment();
      const aggregate = new Map();
      this.hotbar.forEach((slot) => {
        if (!slot.item) return;
        aggregate.set(slot.item, (aggregate.get(slot.item) ?? 0) + slot.quantity);
      });
      this.satchel.forEach((quantity, item) => {
        aggregate.set(item, (aggregate.get(item) ?? 0) + quantity);
      });
      const items = Array.from(aggregate.entries());
      items.sort((a, b) => b[1] - a[1]);
      items.forEach(([item, quantity]) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'crafting-inventory__item';
        button.dataset.itemId = item;
        button.textContent = formatInventoryLabel(item, quantity);
        button.setAttribute('role', 'listitem');
        button.setAttribute('aria-label', formatInventoryLabel(item, quantity));
        fragment.appendChild(button);
      });
      this.craftingInventoryEl.innerHTML = '';
      this.craftingInventoryEl.appendChild(fragment);
    }

    updateInventoryModal() {
      if (!this.inventoryGridEl) return;
      const aggregate = new Map();
      this.hotbar.forEach((slot) => {
        if (!slot.item) return;
        aggregate.set(slot.item, (aggregate.get(slot.item) ?? 0) + slot.quantity);
      });
      this.satchel.forEach((quantity, item) => {
        aggregate.set(item, (aggregate.get(item) ?? 0) + quantity);
      });
      const items = Array.from(aggregate.entries());
      items.sort((a, b) => a[0].localeCompare(b[0]));
      this.inventoryGridEl.innerHTML = '';
      if (!items.length) {
        this.inventoryGridEl.textContent = 'Inventory empty — gather resources to craft.';
        return;
      }
      items.forEach(([item, quantity]) => {
        const cell = document.createElement('div');
        cell.className = 'inventory-grid__cell';
        cell.textContent = formatInventoryLabel(item, quantity);
        this.inventoryGridEl.appendChild(cell);
      });
      if (this.inventoryOverflowEl) {
        const satchelOnly = Array.from(this.satchel.entries()).reduce((sum, [, value]) => sum + value, 0);
        if (satchelOnly > 0) {
          this.inventoryOverflowEl.hidden = false;
          this.inventoryOverflowEl.textContent = `${satchelOnly} items stored in satchel reserves.`;
        } else {
          this.inventoryOverflowEl.hidden = true;
          this.inventoryOverflowEl.textContent = '';
        }
      }
    }

    selectHotbarSlot(index, announce = true) {
      if (!Number.isInteger(index) || index < 0 || index >= this.hotbar.length) {
        return;
      }
      this.selectedHotbarIndex = index;
      this.updateHotbarUi();
      if (announce) {
        const slot = this.hotbar[index];
        const label = slot?.item ? formatInventoryLabel(slot.item, slot.quantity) : 'Empty slot';
        this.showHint(`Selected ${label}`);
      }
    }

    cycleHotbar(direction) {
      const next = (this.selectedHotbarIndex + direction + this.hotbar.length) % this.hotbar.length;
      this.selectHotbarSlot(next, true);
    }

    showHint(message) {
      if (!this.playerHintEl || !message) return;
      this.playerHintEl.textContent = message;
    }

    handleHotbarClick(event) {
      const button = event.target.closest('[data-hotbar-slot]');
      if (!button) return;
      const index = Number.parseInt(button.dataset.hotbarSlot ?? '-1', 10);
      if (!Number.isInteger(index)) return;
      this.selectHotbarSlot(index, true);
    }

    handleCanvasWheel(event) {
      if (!this.pointerLocked) return;
      event.preventDefault();
      const delta = event.deltaY > 0 ? 1 : -1;
      this.cycleHotbar(delta);
    }

    handleVictoryReplay(event) {
      const button = event?.target?.closest('[data-action="replay-run"]');
      if (!button) {
        return;
      }
      if (event?.preventDefault) {
        event.preventDefault();
      }
      if (typeof window !== 'undefined' && typeof window.location?.reload === 'function') {
        window.location.reload();
      }
    }

    handleCraftingInventoryClick(event) {
      const button = event.target.closest('[data-item-id]');
      if (!button) return;
      const item = button.dataset.itemId;
      if (!item) return;
      const slotCount = this.getCraftingSlotCount();
      if (this.craftingState.sequence.length >= slotCount) {
        this.showHint('Sequence full — craft or clear to add more.');
        return;
      }
      const available = this.getInventoryCountForItem(item);
      const planned = this.craftingState.sequence.filter((entry) => entry === item).length;
      if (planned >= available) {
        this.showHint('Not enough resources in your satchel. Gather more.');
        return;
      }
      this.craftingState.sequence.push(item);
      this.refreshCraftingUi();
    }

    handleCraftSequenceClick(event) {
      const button = event.target.closest('[data-sequence-index]');
      if (!button) return;
      const index = Number.parseInt(button.dataset.sequenceIndex ?? '-1', 10);
      if (!Number.isInteger(index) || index < 0 || index >= this.craftingState.sequence.length) {
        return;
      }
      this.craftingState.sequence.splice(index, 1);
      this.refreshCraftingUi();
    }

    handleClearCraft() {
      if (!this.craftingState.sequence.length) return;
      this.craftingState.sequence = [];
      this.refreshCraftingUi();
    }

    handleCraftButton() {
      if (!this.craftingState.sequence.length) {
        this.showHint('Add items to the sequence to craft.');
        return;
      }
      const key = this.craftingState.sequence.join(',');
      const recipe = this.craftingRecipes.get(key);
      if (!recipe) {
        this.showHint('Sequence unstable. Try a different item order.');
        return;
      }
      const counts = new Map();
      this.craftingState.sequence.forEach((item) => {
        counts.set(item, (counts.get(item) ?? 0) + 1);
      });
      for (const [item, required] of counts.entries()) {
        if (this.getInventoryCountForItem(item) < required) {
          this.showHint('Not enough materials. Gather or reclaim resources.');
          return;
        }
      }
      counts.forEach((required, item) => {
        this.removeItemFromInventory(item, required);
      });
      this.addItemToInventory(recipe.id, 1);
      this.craftingState.sequence = [];
      this.craftedRecipes.add(recipe.id);
      this.craftingState.unlocked.set(key, recipe);
      this.score += recipe.score;
      this.savePersistentUnlocks();
      this.showHint(`${recipe.label} crafted!`);
      this.refreshCraftingUi();
      this.updateHud();
      this.scheduleScoreSync('recipe-crafted');
      this.audio.play('craftChime', { volume: 0.6 });
    }

    handleCraftSuggestionClick(event) {
      const button = event.target.closest('[data-recipe-key]');
      if (!button) return;
      const key = button.dataset.recipeKey;
      if (!key) return;
      const parts = key.split(',').filter(Boolean);
      this.craftingState.sequence = parts.slice(0, this.getCraftingSlotCount());
      this.refreshCraftingUi();
    }

    handleCraftSearchInput(event) {
      this.craftingState.searchTerm = (event.target?.value || '').toLowerCase();
      this.updateCraftingSearchResults();
    }

    handleOpenCrafting(event) {
      if (event?.preventDefault) {
        event.preventDefault();
      }
      this.toggleCraftingModal(true);
    }

    handleCloseCrafting(event) {
      if (event?.preventDefault) {
        event.preventDefault();
      }
      this.toggleCraftingModal(false);
    }

    handleInventorySort(event) {
      if (event?.preventDefault) {
        event.preventDefault();
      }
      this.sortInventoryByQuantity();
      this.updateInventoryUi();
      this.showHint('Inventory sorted.');
      this.inventorySortButton?.setAttribute('aria-pressed', 'true');
    }

    handleInventoryToggle(event) {
      if (event?.preventDefault) {
        event.preventDefault();
      }
      const willOpen = this.inventoryModal?.hidden !== false;
      this.toggleInventoryModal(willOpen);
    }

    getInventoryCountForItem(item) {
      if (!item) return 0;
      let total = 0;
      this.hotbar.forEach((slot) => {
        if (slot.item === item) {
          total += slot.quantity;
        }
      });
      total += this.satchel.get(item) ?? 0;
      return total;
    }

    getCraftingSlotCount() {
      const count = Number.parseInt(this.craftSequenceEl?.dataset.slotCount ?? '0', 10);
      return Number.isInteger(count) && count > 0 ? count : 7;
    }

    toggleCraftingModal(visible) {
      if (!this.craftingModal) return;
      if (visible) {
        this.craftingModal.hidden = false;
        this.craftingModal.setAttribute('aria-hidden', 'false');
        document.exitPointerLock?.();
        this.refreshCraftingUi();
      } else {
        this.craftingModal.hidden = true;
        this.craftingModal.setAttribute('aria-hidden', 'true');
        this.toggleCraftingSearch(false);
        this.canvas.focus({ preventScroll: true });
      }
      if (this.craftLauncherButton) {
        this.craftLauncherButton.setAttribute('aria-expanded', visible ? 'true' : 'false');
      }
    }

    toggleInventoryModal(visible) {
      if (!this.inventoryModal) return;
      if (visible) {
        this.inventoryModal.hidden = false;
        this.inventoryModal.setAttribute('aria-hidden', 'false');
        document.exitPointerLock?.();
        this.updateInventoryModal();
        this.inventorySortButton?.setAttribute('aria-pressed', 'false');
      } else {
        this.inventoryModal.hidden = true;
        this.inventoryModal.setAttribute('aria-hidden', 'true');
        this.canvas.focus({ preventScroll: true });
        this.inventorySortButton?.setAttribute('aria-pressed', 'false');
      }
      this.openInventoryButtons.forEach((btn) => {
        if (!btn) return;
        btn.setAttribute('aria-expanded', visible ? 'true' : 'false');
        if (btn.tagName === 'BUTTON') {
          btn.textContent = visible ? 'Close Inventory' : 'Open Inventory';
        }
      });
    }

    toggleCraftingSearch(visible) {
      if (!this.craftingSearchPanel) return;
      if (visible) {
        this.craftingSearchPanel.hidden = false;
        this.craftingSearchPanel.setAttribute('aria-hidden', 'false');
        this.updateCraftingSearchResults();
        this.craftingSearchInput?.focus();
      } else {
        this.craftingSearchPanel.hidden = true;
        this.craftingSearchPanel.setAttribute('aria-hidden', 'true');
        this.craftingState.searchTerm = '';
      }
    }

    refreshCraftingUi() {
      this.updateCraftingSequenceUi();
      this.updateCraftingInventoryUi();
      this.updateCraftingSuggestions();
      this.updateCraftButtonState();
    }

    updateCraftingSequenceUi() {
      if (!this.craftSequenceEl) return;
      const slotCount = this.getCraftingSlotCount();
      const fragment = document.createDocumentFragment();
      for (let i = 0; i < slotCount; i += 1) {
        const item = this.craftingState.sequence[i] ?? null;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'crafting-sequence__slot';
        button.dataset.sequenceIndex = i;
        if (item) {
          button.textContent = formatInventoryLabel(item, 1);
          button.setAttribute('aria-label', `Remove ${getItemDefinition(item).label} from sequence`);
        } else {
          button.textContent = '·';
          button.setAttribute('aria-label', 'Empty sequence slot');
        }
        fragment.appendChild(button);
      }
      this.craftSequenceEl.innerHTML = '';
      this.craftSequenceEl.appendChild(fragment);
    }

    updateCraftingSuggestions() {
      if (!this.craftSuggestionsEl) return;
      const fragment = document.createDocumentFragment();
      const entries = Array.from(this.craftingState.unlocked.entries());
      entries.sort((a, b) => a[1].label.localeCompare(b[1].label));
      entries.forEach(([key, recipe]) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'crafting-suggestions__item';
        button.dataset.recipeKey = key;
        button.textContent = `${recipe.label} (${key.replace(/,/g, ' → ')})`;
        const li = document.createElement('li');
        li.appendChild(button);
        fragment.appendChild(li);
      });
      if (!entries.length) {
        const empty = document.createElement('li');
        empty.textContent = 'Discover recipes to unlock quick sequences.';
        fragment.appendChild(empty);
      }
      this.craftSuggestionsEl.innerHTML = '';
      this.craftSuggestionsEl.appendChild(fragment);
    }

    updateCraftButtonState() {
      if (!this.craftButton) return;
      const key = this.craftingState.sequence.join(',');
      const recipe = this.craftingRecipes.get(key);
      let enabled = Boolean(recipe);
      if (enabled && recipe) {
        const counts = new Map();
        this.craftingState.sequence.forEach((item) => {
          counts.set(item, (counts.get(item) ?? 0) + 1);
        });
        for (const [item, required] of counts.entries()) {
          if (this.getInventoryCountForItem(item) < required) {
            enabled = false;
            break;
          }
        }
      }
      this.craftButton.disabled = !enabled;
    }

    updateCraftingSearchResults() {
      if (!this.craftingSearchResultsEl) return;
      const term = (this.craftingState.searchTerm || '').trim();
      const results = [];
      this.craftingRecipes.forEach((recipe, key) => {
        if (!term || recipe.label.toLowerCase().includes(term) || key.includes(term)) {
          results.push({ key, recipe });
        }
      });
      const fragment = document.createDocumentFragment();
      results.slice(0, 12).forEach(({ key, recipe }) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'crafting-search__result';
        button.dataset.recipeKey = key;
        button.textContent = `${recipe.label} — ${key.replace(/,/g, ' → ')}`;
        const li = document.createElement('li');
        li.appendChild(button);
        fragment.appendChild(li);
      });
      if (!results.length) {
        const li = document.createElement('li');
        li.className = 'crafting-search__empty';
        li.textContent = 'No recipes match that phrase.';
        fragment.appendChild(li);
      }
      this.craftingSearchResultsEl.innerHTML = '';
      this.craftingSearchResultsEl.appendChild(fragment);
    }

    sortInventoryByQuantity() {
      const items = this.hotbar.filter((slot) => slot.item);
      items.sort((a, b) => b.quantity - a.quantity);
      const reordered = [];
      items.forEach((slot) => {
        reordered.push({ item: slot.item, quantity: slot.quantity });
      });
      while (reordered.length < this.hotbar.length) {
        reordered.push({ item: null, quantity: 0 });
      }
      this.hotbar = reordered;
      this.selectedHotbarIndex = 0;
    }

    updateHud() {
      const { heartsEl, scoreTotalEl, scoreRecipesEl, scoreDimensionsEl } = this.ui;
      if (heartsEl) {
        heartsEl.innerHTML = createHeartMarkup(this.health);
      }
      if (scoreTotalEl) {
        scoreTotalEl.textContent = Math.round(this.score).toString();
      }
      if (scoreRecipesEl) {
        scoreRecipesEl.textContent = `${this.craftedRecipes.size}`;
      }
      if (scoreDimensionsEl) {
        scoreDimensionsEl.textContent = `${this.currentDimensionIndex + 1}`;
      }
      this.updateInventoryUi();
      this.updateDimensionInfoPanel();
      this.updatePortalProgress();
    }

    updatePortalProgress() {
      const { portalProgressLabel, portalProgressBar } = this.ui;
      const required = this.portalFrameRequiredCount || PORTAL_BLOCK_REQUIREMENT;
      const rawProgress = required > 0 ? this.portalBlocksPlaced / required : 0;
      const progress = Math.min(1, Math.max(0, rawProgress));
      if (portalProgressLabel) {
        if (this.victoryAchieved) {
          portalProgressLabel.textContent = 'Eternal Ingot secured';
        } else if (this.portalActivated) {
          portalProgressLabel.textContent = 'Portal stabilised';
        } else if (this.portalReady) {
          portalProgressLabel.textContent = 'Portal ready — press F to ignite';
        } else if (!this.portalFrameInteriorValid && this.portalBlocksPlaced > 0) {
          portalProgressLabel.textContent = 'Clear the portal interior';
        } else {
          portalProgressLabel.textContent = `Portal frame ${Math.round(progress * 100)}%`;
        }
      }
      if (portalProgressBar) {
        let displayProgress = this.victoryAchieved ? 1 : progress;
        if (this.portalReady && !this.portalActivated) {
          displayProgress = 1;
        } else if (!this.portalFrameInteriorValid && !this.portalActivated) {
          displayProgress = Math.min(displayProgress, 0.5);
        }
        portalProgressBar.style.setProperty('--progress', displayProgress.toFixed(2));
      }
    }

    updateDimensionInfoPanel() {
      const { dimensionInfoEl } = this.ui;
      if (!dimensionInfoEl) return;
      if (this.victoryAchieved) {
        const rank = this.getPlayerLeaderboardRank();
        const totalRuns = Math.max(this.scoreEntries.length, rank ?? 0);
        const leaderboardLabel = rank
          ? `Rank #${rank} of ${Math.max(totalRuns, rank)}`
          : 'Unranked — connect to publish your run.';
        const scoreLabel = Math.round(this.score);
        dimensionInfoEl.innerHTML = `
          <h3>Netherite Terminus</h3>
          <p>You stabilised every dimension and recovered the Eternal Ingot.</p>
          <p class="dimension-meta">Score ${scoreLabel} · ${leaderboardLabel}</p>
          <p><button type="button" class="victory-replay-button" data-action="replay-run">Replay Run</button></p>
        `;
        return;
      }
      const theme = this.dimensionSettings ?? DIMENSION_THEME[0];
      dimensionInfoEl.dataset.simpleInit = 'true';
      const gravity = (theme.gravity ?? 1).toFixed(2);
      const speed = (theme.speedMultiplier ?? 1).toFixed(2);
      dimensionInfoEl.innerHTML = `
        <h3>${theme.name}</h3>
        <p>${theme.description ?? ''}</p>
        <p class="dimension-meta">Gravity ×${gravity} · Speed ×${speed} · Dimension ${
          this.currentDimensionIndex + 1
        }/${DIMENSION_THEME.length}</p>
      `;
    }
  }

  function createSimpleExperience(options) {
    return new SimpleExperience(options);
  }

  window.SimpleExperience = {
    create: createSimpleExperience,
  };
})();
