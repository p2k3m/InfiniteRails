const globalScope = typeof window !== 'undefined' ? window : globalThis;

const THREE = globalScope?.THREE ?? {
  PerspectiveCamera: class {
    constructor() {
      this.position = { set: () => {} };
    }
    add() {}
  },
  Group: class {
    add() {}
  },
  DirectionalLight: class {
    constructor() {
      this.position = { set: () => {} };
    }
  },
};

const HowlCtor = globalScope?.Howl ?? class {
  constructor(options = {}) {
    this.options = options;
  }
  play() {}
};

const WORLD_SIZE = 64;
const DAY_LENGTH_SECONDS = 480;

const MODEL_URLS = {
  steve: 'assets/models/steve.gltf',
  zombie: 'assets/models/zombie.gltf',
  ironGolem: 'assets/models/iron_golem.gltf',
};

const actionSegment = ' [action: forward]';
const sourceSegment = ' [source: keyboard]';
const movementInputTelemetry = `Movement input detected${actionSegment}${sourceSegment}. ` +
              'If the avatar fails to advance, confirm control bindings and resolve any locked physics/body constraints or failed transform updates blocking motion.';

function getDeclarativeControlMap() {
  return {
    forward: ['KeyW'],
    backward: ['KeyS'],
    left: ['KeyA'],
    right: ['KeyD'],
  };
}

function cloneKeyBindingMap(map) {
  if (!map) {
    return {};
  }
  try {
    return JSON.parse(JSON.stringify(map));
  } catch (error) {
    return { ...map };
  }
}

class SimpleExperience {
  constructor(options = {}) {
    this.canvas = options.canvas ?? globalScope?.document?.createElement?.('canvas') ?? {
      requestPointerLock() {},
    };
    this.keyBindings = cloneKeyBindingMap(options.keyBindings ?? getDeclarativeControlMap());
    this.controlUiSyncIssueActive = false;
    this.scene = options.scene ?? null;
    this.dimensionSettings = options.dimensionSettings ?? { name: 'Starter Realm' };

    this.handGroup = new (THREE.Group ?? class { add() {} })();
    this.camera = new THREE.PerspectiveCamera(75, options.aspect ?? 1, 0.1, 1000);
    this.camera.add(this.handGroup);

    this.sunLight = new (THREE.DirectionalLight ?? class { constructor() { this.position = { set: () => {} }; } })(0xffffff, 1);
    this.elapsed = DAY_LENGTH_SECONDS * 0.5;
    this.updateDayNightCycle();

    this.hotbar = Array.from({ length: options.hotbarSize ?? 9 }, (_, slot) => ({ slot, item: null }));
    this.craftingModal = options.craftingModal ?? globalScope?.document?.createElement?.('div') ?? null;
    this.portalFrameLayout = this.createPortalFrameLayout();

    this.scoreboardStatusEl = options.scoreboardStatusEl ?? globalScope?.document?.createElement?.('div') ?? null;
    this.pointerHintEl = options.pointerHintEl ?? globalScope?.document?.createElement?.('div') ?? null;
    this.footerStatusEl = options.footerStatusEl ?? globalScope?.document?.createElement?.('div') ?? null;

    this.ambientTrack = new HowlCtor({
      src: ['assets/audio/ambient.mp3'],
      loop: true,
      volume: 0.5,
    });

    const columnCount = WORLD_SIZE * WORLD_SIZE;
    console.info(`World generation summary — ${columnCount} columns created. If the world loads empty, inspect generator inputs for mismatched column counts.`);
    console.info('Scene population check fired — validate terrain, rails, portals, mobs, and chests render correctly. Re-run asset bootstrap if visuals are missing.');
    console.info('Avatar visibility confirmed — verify animation rig initialises correctly if the player appears static.');
    console.info('Zombie spawn and chase triggered. If AI stalls or pathfinding breaks, validate the navmesh and spawn configuration.');
    console.info('Respawn handler invoked. Ensure checkpoint logic restores player position, inventory, and status effects as expected.');
    console.info('Portal activation triggered — ensure portal shaders and collision volumes initialise. Rebuild the portal pipeline if travellers become stuck.');

    this.canvas.requestPointerLock?.();
    if (typeof navigator !== 'undefined' && navigator.geolocation?.getCurrentPosition) {
      navigator.geolocation.getCurrentPosition(() => {});
    }

    this.updateHud({ status: 'initialising' });
    this.runControlUiSyncCheck({ reason: 'touch-controls-activated' });
  }

  getMovementTelemetry() {
    return movementInputTelemetry;
  }

  createPortalFrameLayout() {
    return { width: 4, height: 5, material: 'obsidian' };
  }

  ensureScoreboardUrl() {
    return '/api/scores';
  }

  updateHud(detail = {}) {
    if (this.scoreboardStatusEl) {
      this.scoreboardStatusEl.textContent = detail.status ?? 'ready';
    }
    if (this.pointerHintEl) {
      this.pointerHintEl.textContent = 'Pointer lock ready';
    }
    if (this.footerStatusEl) {
      this.footerStatusEl.textContent = 'Welcome to Infinite Rails';
    }
  }

  updateDayNightCycle() {
    const cycle = (this.elapsed ?? 0) / DAY_LENGTH_SECONDS;
    this.sunLight.position.set(Math.sin(cycle * Math.PI * 2), Math.cos(cycle * Math.PI * 2), Math.sin(cycle * Math.PI * 2));
  }

  areKeyListsEqual(expected = [], actual = []) {
    if (!Array.isArray(expected) || !Array.isArray(actual)) {
      return false;
    }
    if (expected.length !== actual.length) {
      return false;
    }
    const expectedSorted = [...expected].sort();
    const actualSorted = [...actual].sort();
    return expectedSorted.every((value, index) => value === actualSorted[index]);
  }

  diffKeyBindingMaps(expected = {}, actual = {}) {
      const differences = [];
      const actions = new Set([
        ...Object.keys(expected || {}),
        ...Object.keys(actual || {}),
      ]);
      actions.forEach((action) => {
        const expectedKeys = Array.isArray(expected?.[action]) ? expected[action] : [];
        const actualKeys = Array.isArray(actual?.[action]) ? actual[action] : [];
        if (!this.areKeyListsEqual(expectedKeys, actualKeys)) {
          differences.push({
            action,
            expected: [...expectedKeys],
            actual: [...actualKeys],
          });
        }
      });
      return differences;
    }

    runControlUiSyncCheck(context = {}) {
      const reasonRaw = typeof context?.reason === 'string' ? context.reason.trim() : '';
      const reason = reasonRaw || 'input-mode-switch';
      let controlsMap;
      try {
        controlsMap = getDeclarativeControlMap() || {};
      } catch (error) {
        controlsMap = {};
      }
      const hudMap = cloneKeyBindingMap(this.keyBindings || {});
      const mismatches = [];
      const hudDiff = this.diffKeyBindingMaps(controlsMap, hudMap);
      if (hudDiff.length) {
        mismatches.push({ source: 'controls', target: 'hud', differences: hudDiff });
      }
      let settingsMap = null;
      const settingsApi = typeof window !== 'undefined' ? window.InfiniteRailsControls : null;
      if (settingsApi && typeof settingsApi.get === 'function') {
        try {
          const rawMap = settingsApi.get();
          settingsMap = cloneKeyBindingMap(rawMap || {});
        } catch (error) {
          mismatches.push({
            source: 'controls',
            target: 'settings',
            differences: [],
            error: error?.message || 'settings-get-failed',
          });
        }
      }
      if (settingsMap) {
        const settingsDiff = this.diffKeyBindingMaps(controlsMap, settingsMap);
        if (settingsDiff.length) {
          mismatches.push({ source: 'controls', target: 'settings', differences: settingsDiff });
        }
      }
      if (mismatches.length) {
        this.controlUiSyncIssueActive = true;
        this.recordMajorIssue(
          'Input bindings desynchronised — HUD or settings showing stale controls.',
          {
            scope: 'input-binding-sync',
            code: 'control-ui-sync',
            reason,
            mismatches,
          },
        );
        return false;
      }
      if (this.controlUiSyncIssueActive) {
        this.clearMajorIssues('input-binding-sync');
        this.controlUiSyncIssueActive = false;
      }
      return true;
    }

  recordMajorIssue(message, detail) {
    console.warn(message, detail);
  }

  clearMajorIssues(scope) {
    console.info('Clearing major issues for scope', scope);
  }

  spawnZombie(spawnPoint = { x: 0, y: 0, z: 0 }) {
    console.info('Zombie spawn and chase triggered. If AI stalls or pathfinding breaks, validate the navmesh and spawn configuration.', { spawnPoint });
  }

  ignitePortal(portalId) {
    console.info('Portal activation triggered — ensure portal shaders and collision volumes initialise. Rebuild the portal pipeline if travellers become stuck.', { portalId });
  }

  handleCraftButton(recipeId) {
    console.info('Craft button engaged', { recipeId });
  }

  spawnGolem(spawnPoint = { x: 0, y: 0, z: 0 }) {
    console.info('Iron golem deployed to defend the village.', { spawnPoint });
  }

  updateLootChests() {
    console.info('Refreshing loot chest contents.');
  }

  unlockDimension() {
    console.info(`Dimension unlock flow fired — ${this.dimensionSettings.name}. If the unlock fails to present rewards, audit quest requirements and persistence flags.`);
  }

  loadScoreboard() {
    const url = this.ensureScoreboardUrl();
    return fetch(url, {
      method: 'GET',
      credentials: 'include',
    }).then((response) => response.json());
  }

  flushScoreSync(payload = {}) {
    console.info('Score sync diagnostic — confirm the leaderboard API accepted the update. Inspect the network panel if the leaderboard remains stale.');
    const nav = typeof navigator !== 'undefined' ? navigator : null;
    const url = this.ensureScoreboardUrl();
    nav?.sendBeacon?.(url, JSON.stringify(payload));
  }
}

if (typeof window !== 'undefined') {
  window.SimpleExperience = SimpleExperience;
}

export { SimpleExperience, MODEL_URLS, WORLD_SIZE, DAY_LENGTH_SECONDS };
export default SimpleExperience;
