(function () {
  const THREE_FALLBACK_SRC = 'https://unpkg.com/three@0.161.0/build/three.min.js';

  function loadScript(src, attributes = {}) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = false;
      Object.entries(attributes).forEach(([key, value]) => {
        script.setAttribute(key, value);
      });
      script.onload = () => resolve(script);
      script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
      document.head.appendChild(script);
    });
  }

  function showDependencyError(message, error) {
    console.error(message, error);
    const modal = document.getElementById('introModal');
    const startButton = document.getElementById('startButton');
    if (startButton) {
      startButton.disabled = true;
      startButton.textContent = 'Unable to start';
      startButton.setAttribute('aria-hidden', 'true');
      startButton.setAttribute('tabindex', '-1');
    }
    if (!modal) {
      alert(message);
      return;
    }
    modal.hidden = false;
    modal.style.display = 'grid';
    modal.setAttribute('aria-hidden', 'false');
    const content = modal.querySelector('.modal-content');
    if (content) {
      content.innerHTML = `
        <h2>Infinite Dimension</h2>
        <p class=\"modal-error\">${message}</p>
      `;
    }
  }

  function bootstrap() {
    const THREE = window.THREE_GLOBAL || window.THREE;

    if (!THREE) {
      throw new Error('Three.js failed to load. Ensure the CDN script is available.');
    }

    const scoreboardUtils =
      (typeof window !== 'undefined' && window.ScoreboardUtils) ||
      (typeof ScoreboardUtils !== 'undefined' ? ScoreboardUtils : null);

    if (!scoreboardUtils) {
      throw new Error('Scoreboard utilities failed to load.');
    }

    const { normalizeScoreEntries, upsertScoreEntry, formatScoreNumber, formatRunTime, formatLocationLabel } = scoreboardUtils;

    const canvas = document.getElementById('gameCanvas');
    if (canvas && !canvas.hasAttribute('tabindex')) {
      canvas.setAttribute('tabindex', '0');
    }
    const startButton = document.getElementById('startButton');
    const introModal = document.getElementById('introModal');
    const guideModal = document.getElementById('guideModal');
    const mobileControls = document.getElementById('mobileControls');
    const heartsEl = document.getElementById('hearts');
    const bubblesEl = document.getElementById('bubbles');
    const timeEl = document.getElementById('timeOfDay');
    const dimensionInfoEl = document.getElementById('dimensionInfo');
    const portalProgressEl = document.getElementById('portalProgress');
    const hudRootEl = document.getElementById('gameHud');
    const objectivesPanelEl = document.getElementById('objectivesPanel');
    const victoryBannerEl = document.getElementById('victoryBanner');
    const hotbarEl = document.getElementById('hotbar');
    const extendedInventoryEl = document.getElementById('extendedInventory');
    const toggleExtendedBtn = document.getElementById('toggleExtended');
    const craftButton = document.getElementById('craftButton');
    const clearCraftButton = document.getElementById('clearCraft');
    const recipeListEl = document.getElementById('recipeList');
    const recipeSearchEl = document.getElementById('recipeSearch');
    const craftSequenceEl = document.getElementById('craftSequence');
    const craftSuggestionsEl = document.getElementById('craftSuggestions');
    const craftConfettiEl = document.getElementById('craftConfetti');
    const craftingInventoryEl = document.getElementById('craftingInventory');
    const openCraftingSearchButton = document.getElementById('openCraftingSearch');
    const craftingSearchPanel = document.getElementById('craftingSearchPanel');
    const craftingSearchInput = document.getElementById('craftingSearchInput');
    const craftingSearchResultsEl = document.getElementById('craftingSearchResults');
    const closeCraftingSearchButton = document.getElementById('closeCraftingSearch');
    const craftLauncherButton = document.getElementById('openCrafting');
    const craftingModal = document.getElementById('craftingModal');
    const closeCraftingButton = document.getElementById('closeCrafting');
    const eventLogEl = document.getElementById('eventLog');
    const codexListEl = document.getElementById('dimensionCodex');
    const openGuideButton = document.getElementById('openGuide');
    const landingGuideButton = document.getElementById('landingGuideButton');
    const openSettingsButton = document.getElementById('openSettings');
    const settingsModal = document.getElementById('settingsModal');
    const closeSettingsButton = document.getElementById('closeSettings');
    const settingsVolumeInputs = {
      master: document.getElementById('masterVolume'),
      music: document.getElementById('musicVolume'),
      effects: document.getElementById('effectsVolume'),
    };
    const settingsVolumeLabels = {
      master: document.querySelector('[data-volume-label="master"]'),
      music: document.querySelector('[data-volume-label="music"]'),
      effects: document.querySelector('[data-volume-label="effects"]'),
    };
    const portalProgressLabel = portalProgressEl.querySelector('.label');
    const portalProgressBar = portalProgressEl.querySelector('.bar');
    const headerUserNameEl = document.getElementById('headerUserName');
    const headerUserLocationEl = document.getElementById('headerUserLocation');
    const userNameDisplayEl = document.getElementById('userNameDisplay');
    const userLocationDisplayEl = document.getElementById('userLocationDisplay');
    const userDeviceDisplayEl = document.getElementById('userDeviceDisplay');
    const googleButtonContainers = Array.from(document.querySelectorAll('[data-google-button-container]'));
    const googleFallbackButtons = Array.from(document.querySelectorAll('[data-google-fallback-signin]'));
    const googleSignOutButtons = Array.from(document.querySelectorAll('[data-google-sign-out]'));
    const landingSignInPanel = document.getElementById('landingSignInPanel');
    const scoreboardListEl = document.getElementById('scoreboardList');
    const scoreboardStatusEl = document.getElementById('scoreboardStatus');
    const refreshScoresButton = document.getElementById('refreshScores');
    const leaderboardModal = document.getElementById('leaderboardModal');
    const openLeaderboardButton = document.getElementById('openLeaderboard');
    const closeLeaderboardButton = document.getElementById('closeLeaderboard');
    const leaderboardTableContainer = document.getElementById('leaderboardTable');
    const leaderboardEmptyMessage = document.getElementById('leaderboardEmptyMessage');
    const leaderboardSortHeaders = Array.from(document.querySelectorAll('.leaderboard-sortable'));
    const scorePanelEl = document.getElementById('scorePanel');
    const scoreTotalEl = document.getElementById('scoreTotal');
    const scoreRecipesEl = document.getElementById('scoreRecipes');
    const scoreDimensionsEl = document.getElementById('scoreDimensions');
    let scoreOverlayInitialized = false;

    const HUD_INACTIVITY_TIMEOUT = 12000;
    let hudInactivityTimer = null;

    function hasActiveBlockingOverlay() {
      if (document.body.classList.contains('sidebar-open')) return true;
      return Boolean(document.querySelector('.modal[aria-modal="true"]:not([hidden])'));
    }

    function applyHudInactiveState() {
      if (!hudRootEl && !objectivesPanelEl) return;
      if (!document.body.classList.contains('game-active')) return;
      if (hasActiveBlockingOverlay()) return;
      document.body.classList.add('hud-inactive');
    }

    function resetHudInactivityTimer() {
      if (!hudRootEl && !objectivesPanelEl) return;
      document.body.classList.remove('hud-inactive');
      if (hudInactivityTimer) {
        window.clearTimeout(hudInactivityTimer);
        hudInactivityTimer = null;
      }
      if (!document.body.classList.contains('game-active')) return;
      hudInactivityTimer = window.setTimeout(applyHudInactiveState, HUD_INACTIVITY_TIMEOUT);
    }

    const hudActivityEvents = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'];
    hudActivityEvents.forEach((eventName) => {
      const listenerOptions = eventName === 'keydown' ? false : { passive: true };
      window.addEventListener(eventName, resetHudInactivityTimer, listenerOptions);
    });

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        resetHudInactivityTimer();
      }
    });

    resetHudInactivityTimer();

    const leaderboardDefaultSortDirection = {
      score: 'desc',
      name: 'asc',
      runTimeSeconds: 'asc',
      dimensionCount: 'desc',
      inventoryCount: 'desc',
      locationLabel: 'asc',
      updatedAt: 'desc',
    };

    let leaderboardSortState = { key: 'score', direction: 'desc' };

    function initializeScoreOverlayUI() {
      if (scoreOverlayInitialized) return;
      if (!scoreTotalEl) return;

      const initialValue = (scoreTotalEl.textContent || '0').trim() || '0';
      scoreTotalEl.dataset.value = initialValue;
      scoreTotalEl.textContent = '';
      scoreTotalEl.classList.add('score-overlay__value--ready');

      const digits = initialValue.split('');
      digits.forEach((digit, index) => {
        const slot = document.createElement('span');
        slot.className = 'score-digit-slot';

        const digitEl = document.createElement('span');
        digitEl.className = 'score-digit score-digit--current';
        digitEl.dataset.value = digit;
        digitEl.textContent = digit;
        digitEl.style.setProperty('--digit-index', index);

        slot.appendChild(digitEl);
        scoreTotalEl.appendChild(slot);
      });

      if (scoreRecipesEl) {
        scoreRecipesEl.dataset.value = scoreRecipesEl.textContent ?? '';
      }

      if (scoreDimensionsEl) {
        scoreDimensionsEl.dataset.value = scoreDimensionsEl.textContent ?? '';
      }

      scoreOverlayInitialized = true;
    }

    function createDigitElement(char, index) {
      const digitEl = document.createElement('span');
      digitEl.className = 'score-digit score-digit--current score-digit--enter';
      digitEl.dataset.value = char;
      digitEl.textContent = char;
      digitEl.style.setProperty('--digit-index', index);
      digitEl.addEventListener(
        'animationend',
        () => {
          digitEl.classList.remove('score-digit--enter');
        },
        { once: true },
      );
      return digitEl;
    }

    function animateScoreDigits(container, value) {
      if (!container) return;
      const normalizedValue = value.toString();
      const previousValue = container.dataset.value ?? '';
      if (previousValue === normalizedValue) return;

      const digits = normalizedValue.split('');
      const existingSlots = Array.from(container.querySelectorAll('.score-digit-slot'));

      while (existingSlots.length < digits.length) {
        const slot = document.createElement('span');
        slot.className = 'score-digit-slot';
        container.appendChild(slot);
        existingSlots.push(slot);
      }

      digits.forEach((char, index) => {
        const slot = existingSlots[index];
        if (!slot) return;
        const currentDigit = slot.querySelector('.score-digit--current');
        if (currentDigit?.dataset.value === char) {
          currentDigit.style.setProperty('--digit-index', index);
          return;
        }

        if (currentDigit) {
          currentDigit.classList.remove('score-digit--current');
          currentDigit.classList.add('score-digit--exit');
          currentDigit.style.setProperty('--digit-index', index);
          currentDigit.addEventListener(
            'animationend',
            () => {
              if (currentDigit.parentElement === slot) {
                currentDigit.remove();
              }
            },
            { once: true },
          );
        }

        const digitEl = createDigitElement(char, index);
        slot.appendChild(digitEl);
      });

      for (let i = digits.length; i < existingSlots.length; i += 1) {
        const slot = existingSlots[i];
        const currentDigit = slot.querySelector('.score-digit--current');
        if (currentDigit) {
          currentDigit.classList.remove('score-digit--current');
          currentDigit.classList.add('score-digit--exit');
          currentDigit.style.setProperty('--digit-index', i);
          currentDigit.addEventListener(
            'animationend',
            () => {
              if (slot.parentElement) {
                slot.remove();
              }
            },
            { once: true },
          );
        } else if (slot.parentElement) {
          slot.remove();
        }
      }

      container.dataset.value = normalizedValue;
    }

    function animateMetricUpdate(element, text) {
      if (!element) return;
      const previousValue = element.dataset.value ?? '';
      if (previousValue === text) return;

      element.dataset.value = text;
      element.textContent = text;

      if (typeof element.getAnimations === 'function') {
        element.getAnimations().forEach((animation) => animation.cancel());
      }

      if (typeof element.animate === 'function') {
        element.animate(
          [
            { transform: 'translateY(0.55em)', opacity: 0 },
            { transform: 'translateY(0)', opacity: 1, offset: 0.45 },
            { transform: 'translateY(0)', opacity: 1 },
          ],
          {
            duration: 420,
            easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)',
          },
        );
      }
    }
    const playerHintEl = document.getElementById('playerHint');
    const drowningVignetteEl = document.getElementById('drowningVignette');
    const dimensionTransitionEl = document.getElementById('dimensionTransition');
    const defeatOverlayEl = document.getElementById('defeatOverlay');
    const defeatMessageEl = document.getElementById('defeatMessage');
    const defeatInventoryEl = document.getElementById('defeatInventory');
    const defeatCountdownEl = document.getElementById('defeatCountdown');
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
    const PORTAL_ACTIVATION_DURATION = 2;
    const PORTAL_TRANSITION_BUILDUP = 2;
    const PORTAL_TRANSITION_FADE = 0.65;
    const raycaster = new THREE.Raycaster();

    const PORTAL_VERTEX_SHADER = `
      varying vec2 vUv;

      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    const PORTAL_FRAGMENT_SHADER = `
      varying vec2 vUv;

      uniform float uTime;
      uniform float uActivation;
      uniform vec3 uColor;
      uniform float uOpacity;

      void main() {
        vec2 uv = vUv - 0.5;
        float radius = length(uv);
        float activation = clamp(uActivation, 0.0, 2.0);
        float time = uTime * (0.7 + activation * 0.35);
        float swirl = activation * 2.4;
        float theta = swirl * (1.0 - radius);
        float s = sin(theta + time);
        float c = cos(theta + time);
        vec2 rotated = mat2(c, -s, s, c) * uv;
        rotated += 0.05 * vec2(
          sin(time * 1.7 + radius * 12.0),
          cos(time * 1.3 + radius * 9.0)
        );

        float angle = atan(rotated.y, rotated.x);
        float bands = sin(angle * 6.0 - time * 2.2);
        float ripples = sin(radius * 18.0 - time * 4.5);
        float spokes = sin(angle * 12.0 + time * 3.5);

        float core = smoothstep(0.55, 0.0, radius);
        float edge = smoothstep(0.6, 0.4, radius);
        float intensity = core * (0.6 + 0.4 * sin(time * 2.0 + radius * 10.0));
        intensity += edge * (0.2 + 0.3 * bands);
        intensity += (0.2 + 0.25 * activation) * max(0.0, spokes);

        float alpha = clamp(intensity * (0.6 + 0.5 * activation), 0.0, 1.2);
        alpha *= (0.8 + 0.2 * sin(time * 5.0 + radius * 12.0));
        if (radius > 0.52) {
          alpha *= smoothstep(0.58, 0.52, radius);
        }

        vec3 base = mix(vec3(0.04, 0.07, 0.13), uColor, 0.55 + 0.25 * activation);
        base += uColor * (0.3 + 0.25 * ripples) * (0.4 + 0.6 * activation);
        base += uColor * 0.2 * max(0.0, bands);

        gl_FragColor = vec4(base, alpha * uOpacity);
      }
    `;

    const marbleGhosts = [];

    const SCORE_POINTS = {
      recipe: 2,
      dimension: 5,
    };

    const AUDIO_SETTINGS_KEY = 'infinite-dimension-audio-settings';
    const AUDIO_SAMPLE_URL = 'assets/audio-samples.json';
    const CRUNCH_RESOURCES = new Set(['wood', 'tar']);

    const audioState = {
      context: null,
      masterVolume: 0.8,
      musicVolume: 0.6,
      effectsVolume: 0.85,
      registry: [],
      effects: {},
      ready: false,
      initialized: false,
      loadingSamples: false,
      lastHarvestAt: 0,
    };

    function clampVolume(value) {
      if (!Number.isFinite(value)) return 0;
      return Math.min(1, Math.max(0, value));
    }

    function formatVolumePercent(value) {
      return `${Math.round(clampVolume(value) * 100)}%`;
    }

    function updateVolumeLabels() {
      Object.entries(settingsVolumeLabels).forEach(([key, label]) => {
        if (!label) return;
        const stateKey = `${key}Volume`;
        label.textContent = formatVolumePercent(audioState[stateKey]);
      });
    }

    function persistAudioSettings() {
      try {
        if (!window.localStorage) return;
        const payload = {
          master: audioState.masterVolume,
          music: audioState.musicVolume,
          effects: audioState.effectsVolume,
        };
        window.localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(payload));
      } catch (error) {
        console.warn('Unable to persist audio settings.', error);
      }
    }

    function loadStoredAudioSettings() {
      try {
        if (!window.localStorage) return;
        const raw = window.localStorage.getItem(AUDIO_SETTINGS_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (typeof parsed.master === 'number') {
          audioState.masterVolume = clampVolume(parsed.master);
        }
        if (typeof parsed.music === 'number') {
          audioState.musicVolume = clampVolume(parsed.music);
        }
        if (typeof parsed.effects === 'number') {
          audioState.effectsVolume = clampVolume(parsed.effects);
        }
      } catch (error) {
        console.warn('Unable to load stored audio settings.', error);
      }
    }

    function applyAudioSettingsToInputs() {
      Object.entries(settingsVolumeInputs).forEach(([key, input]) => {
        if (!input) return;
        const stateKey = `${key}Volume`;
        const value = clampVolume(audioState[stateKey]);
        input.value = Math.round(value * 100);
      });
    }

    function updateHowlVolumeEntry(entry) {
      if (!entry?.howl) return;
      const channelVolume = entry.channel === 'music' ? audioState.musicVolume : audioState.effectsVolume;
      entry.howl.volume(audioState.masterVolume * channelVolume * entry.baseVolume);
    }

    function refreshHowlVolumes() {
      audioState.registry.forEach((entry) => updateHowlVolumeEntry(entry));
    }

    function registerHowl(options, channel = 'effects', baseVolume = 1) {
      if (typeof window.Howl !== 'function') return null;
      const howl = new window.Howl({ ...options, volume: 0 });
      const entry = { howl, channel, baseVolume };
      audioState.registry.push(entry);
      updateHowlVolumeEntry(entry);
      return howl;
    }

    function handleVolumeChange(channel, normalizedValue) {
      const clamped = clampVolume(normalizedValue);
      if (channel === 'master') {
        audioState.masterVolume = clamped;
      } else if (channel === 'music') {
        audioState.musicVolume = clamped;
      } else {
        audioState.effectsVolume = clamped;
      }
      updateVolumeLabels();
      refreshHowlVolumes();
      persistAudioSettings();
    }

    function initializeAudioControls() {
      loadStoredAudioSettings();
      applyAudioSettingsToInputs();
      updateVolumeLabels();
      Object.entries(settingsVolumeInputs).forEach(([channel, input]) => {
        if (!input) return;
        input.addEventListener('input', (event) => {
          const value = Number(event.target.value) / 100;
          handleVolumeChange(channel, value);
        });
      });
      initializeAudioEngine();
    }

    async function initializeAudioEngine() {
      if (audioState.initialized || audioState.loadingSamples) {
        refreshHowlVolumes();
        return;
      }
      if (typeof window.Howl !== 'function') {
        console.warn('Howler.js is unavailable. Audio cues will fall back to basic tones.');
        return;
      }
      audioState.loadingSamples = true;
      try {
        const response = await fetch(AUDIO_SAMPLE_URL, { cache: 'no-cache' });
        if (!response.ok) {
          throw new Error(`Failed to load audio samples: ${response.status}`);
        }
        const samples = await response.json();
        const miningSources = [samples?.miningA, samples?.miningB]
          .filter((value) => typeof value === 'string' && value.length > 0)
          .map((value) => `data:audio/wav;base64,${value}`);
        audioState.effects.mining = miningSources
          .map((src) => registerHowl({ src: [src], preload: true }, 'effects', 0.9))
          .filter(Boolean);
        if (typeof samples?.crunch === 'string' && samples.crunch.length > 0) {
          audioState.effects.crunch = registerHowl(
            { src: [`data:audio/wav;base64,${samples.crunch}`], preload: true },
            'effects',
            0.92,
          );
        }
        if (typeof samples?.bubble === 'string' && samples.bubble.length > 0) {
          audioState.effects.bubble = registerHowl(
            { src: [`data:audio/wav;base64,${samples.bubble}`], preload: true },
            'effects',
            0.7,
          );
        }
        audioState.initialized = true;
        audioState.ready = true;
        refreshHowlVolumes();
      } catch (error) {
        console.warn('Unable to initialise audio engine.', error);
      } finally {
        audioState.loadingSamples = false;
      }
    }

    function playHowlInstance(howl) {
      if (!howl) return;
      try {
        if (window.Howler?.ctx?.state === 'suspended') {
          window.Howler.ctx.resume().catch(() => {});
        }
        howl.play();
      } catch (error) {
        console.warn('Unable to play Howler effect.', error);
      }
    }

    function playFallbackEffect({ startFreq, endFreq, duration, type = 'triangle', peak = 0.2 }) {
      const context = ensureAudioContext();
      if (!context) return;
      if (context.state === 'suspended') {
        context.resume().catch(() => {});
      }
      const now = context.currentTime;
      try {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(Math.max(20, startFreq), now);
        if (endFreq && endFreq !== startFreq) {
          oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
        }
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(Math.max(0.001, peak), now + Math.min(0.05, duration * 0.35));
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(now);
        oscillator.stop(now + duration + 0.05);
      } catch (error) {
        console.warn('Unable to play fallback effect.', error);
      }
    }

    function playHarvestAudio(resourceId) {
      if (typeof state?.elapsed === 'number') {
        if (state.elapsed - audioState.lastHarvestAt < 0.12) {
          return;
        }
        audioState.lastHarvestAt = state.elapsed;
      }
      const isCrunch = CRUNCH_RESOURCES.has(resourceId);
      if (isCrunch && audioState.effects?.crunch) {
        playHowlInstance(audioState.effects.crunch);
        return;
      }
      if (!isCrunch && Array.isArray(audioState.effects?.mining) && audioState.effects.mining.length > 0) {
        const index = Math.floor(Math.random() * audioState.effects.mining.length);
        const howl = audioState.effects.mining[index];
        playHowlInstance(howl);
        return;
      }
      if (isCrunch) {
        const base = 180 + Math.random() * 40;
        playFallbackEffect({ startFreq: base, endFreq: base * 0.55, duration: 0.22, type: 'square', peak: 0.18 });
      } else {
        const base = 320 + Math.random() * 60;
        playFallbackEffect({ startFreq: base, endFreq: base * 0.45, duration: 0.2, type: 'sawtooth', peak: 0.2 });
      }
    }

    const MAX_CRAFT_SLOTS = 7;
    const craftSlots = [];
    let craftConfettiTimer = null;
    let craftingDragGhost = null;
    let craftingDragTrailEl = null;
    let activeInventoryDrag = null;
    let dragFallbackSlotIndex = null;
    let craftSequenceErrorTimeout = null;
    const inventoryClickBypass = new WeakSet();

    let renderer;
    let scene;
    let camera;
    let worldGroup;
    let entityGroup;
    let particleGroup;
    let playerMesh;
    let playerMeshParts;
    let tileRenderState = [];
    const zombieMeshes = [];
    const ironGolemMeshes = [];
    let hemiLight;
    let sunLight;
    let moonLight;
    let torchLight;
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

    const CAMERA_EYE_OFFSET = 0.76;
    const CAMERA_FORWARD_OFFSET = 0.22;
    const CAMERA_LOOK_DISTANCE = 6.5;
    const CAMERA_FRUSTUM_HEIGHT = 9.2;
    const CAMERA_BASE_ZOOM = 1.18;
    const WORLD_UP = new THREE.Vector3(0, 1, 0);
    const cameraState = {
      lastFacing: new THREE.Vector3(0, 0, 1),
    };
    const tmpCameraForward = new THREE.Vector3();
    const tmpCameraTarget = new THREE.Vector3();
    const tmpCameraRight = new THREE.Vector3();
    const tmpColorA = new THREE.Color();
    const tmpColorB = new THREE.Color();
    const tmpColorC = new THREE.Color();
    const tmpColorD = new THREE.Color();

    const ZOMBIE_OUTLINE_COLOR = new THREE.Color('#ff5a7a');
    const GOLEM_OUTLINE_COLOR = new THREE.Color('#58b7ff');

    const baseMaterialCache = new Map();
    const accentMaterialCache = new Map();
    const textureVariantCache = new Map();
    const spriteTextureCache = new Map();

    const textureLoader = new THREE.TextureLoader();

    const particleSystems = [];

    const BASE_ATMOSPHERE = {
      daySky: '#bcd7ff',
      nightSky: '#0b1324',
      duskSky: '#f7b07b',
      groundDay: '#1c283f',
      groundNight: '#050912',
      fogColor: '#0b1324',
      fogDensity: 0.055,
    };

    const lightingState = {
      daySky: new THREE.Color(BASE_ATMOSPHERE.daySky),
      nightSky: new THREE.Color(BASE_ATMOSPHERE.nightSky),
      duskSky: new THREE.Color(BASE_ATMOSPHERE.duskSky),
      groundDay: new THREE.Color(BASE_ATMOSPHERE.groundDay),
      groundNight: new THREE.Color(BASE_ATMOSPHERE.groundNight),
      dayStrength: 1,
      nightStrength: 0,
    };

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

    function getBaseMaterial(color, variant = 'default') {
      const key = `${variant}|${color}`;
      if (!baseMaterialCache.has(key)) {
        const options = {
          color: new THREE.Color(color),
          roughness: 0.85,
          metalness: 0.05,
        };
        const textures = getTextureSetForVariant(variant);
        if (textures) {
          options.map = textures.map;
          options.normalMap = textures.normalMap;
          options.roughnessMap = textures.roughnessMap;
        }
        baseMaterialCache.set(key, new THREE.MeshStandardMaterial(options));
      }
      return baseMaterialCache.get(key);
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

    function getTextureSetForVariant(variant) {
      if (!variant || variant === 'default') {
        return null;
      }
      if (textureVariantCache.has(variant)) {
        return textureVariantCache.get(variant);
      }
      let generator = null;
      switch (variant) {
        case 'dew':
          generator = createDewTextureSet;
          break;
        case 'grain':
          generator = createGrainTextureSet;
          break;
        case 'bark':
          generator = createBarkTextureSet;
          break;
        default:
          generator = null;
      }
      const result = generator ? generator() : null;
      textureVariantCache.set(variant, result);
      return result;
    }

    function createProceduralTextureDataUrl(size, draw) {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      draw(ctx, size);
      return canvas.toDataURL('image/png');
    }

    function applyTextureSettings(texture, options = {}) {
      const repeat = options.repeat ?? { x: 2, y: 2 };
      const anisotropy = renderer?.capabilities?.getMaxAnisotropy?.() ?? 4;
      texture.wrapS = options.wrapS ?? THREE.RepeatWrapping;
      texture.wrapT = options.wrapT ?? THREE.RepeatWrapping;
      if (typeof repeat === 'number') {
        texture.repeat.set(repeat, repeat);
      } else if (repeat) {
        texture.repeat.set(repeat.x ?? 1, repeat.y ?? 1);
      }
      texture.anisotropy = anisotropy;
      texture.magFilter = options.magFilter ?? THREE.LinearFilter;
      texture.minFilter = options.minFilter ?? THREE.LinearMipmapLinearFilter;
      if (options.colorSpace) {
        texture.colorSpace = options.colorSpace;
      }
      texture.needsUpdate = true;
    }

    function createTexture(url, options) {
      const texture = textureLoader.load(url, (loaded) => applyTextureSettings(loaded, options));
      applyTextureSettings(texture, options);
      return texture;
    }

    function addNoise(ctx, size, variance = 0.15) {
      const image = ctx.getImageData(0, 0, size, size);
      for (let i = 0; i < image.data.length; i += 4) {
        const offset = (Math.random() - 0.5) * variance * 255;
        image.data[i] = clamp(image.data[i] + offset, 0, 255);
        image.data[i + 1] = clamp(image.data[i + 1] + offset, 0, 255);
        image.data[i + 2] = clamp(image.data[i + 2] + offset, 0, 255);
      }
      ctx.putImageData(image, 0, 0);
    }

    function createDewTextureSet() {
      const size = 256;
      const albedoUrl = createProceduralTextureDataUrl(size, (ctx, dimension) => {
        const gradient = ctx.createLinearGradient(0, 0, dimension, dimension);
        gradient.addColorStop(0, '#1d7a46');
        gradient.addColorStop(1, '#2aa35a');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, dimension, dimension);
        for (let i = 0; i < 220; i++) {
          const radius = Math.random() * 6 + 2;
          const x = Math.random() * dimension;
          const y = Math.random() * dimension;
          const droplet = ctx.createRadialGradient(x, y, 0, x, y, radius);
          droplet.addColorStop(0, 'rgba(255, 255, 255, 0.75)');
          droplet.addColorStop(1, 'rgba(255, 255, 255, 0)');
          ctx.fillStyle = droplet;
          ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
        }
        addNoise(ctx, dimension, 0.05);
      });

      const normalUrl = createProceduralTextureDataUrl(size, (ctx, dimension) => {
        ctx.fillStyle = 'rgb(128,128,255)';
        ctx.fillRect(0, 0, dimension, dimension);
        for (let i = 0; i < 200; i++) {
          const radius = Math.random() * 6 + 2;
          const x = Math.random() * dimension;
          const y = Math.random() * dimension;
          const highlight = ctx.createRadialGradient(x, y, 0, x, y, radius);
          highlight.addColorStop(0, 'rgb(170,200,255)');
          highlight.addColorStop(1, 'rgb(120,120,250)');
          ctx.fillStyle = highlight;
          ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
        }
      });

      const roughnessUrl = createProceduralTextureDataUrl(size, (ctx, dimension) => {
        ctx.fillStyle = 'rgb(180, 180, 180)';
        ctx.fillRect(0, 0, dimension, dimension);
        for (let i = 0; i < 220; i++) {
          const radius = Math.random() * 6 + 2;
          const x = Math.random() * dimension;
          const y = Math.random() * dimension;
          const droplet = ctx.createRadialGradient(x, y, 0, x, y, radius);
          droplet.addColorStop(0, 'rgb(120, 120, 120)');
          droplet.addColorStop(1, 'rgb(200, 200, 200)');
          ctx.fillStyle = droplet;
          ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
        }
        addNoise(ctx, dimension, 0.08);
      });

      return {
        map: createTexture(albedoUrl, { repeat: { x: 3, y: 3 }, colorSpace: THREE.SRGBColorSpace }),
        normalMap: createTexture(normalUrl, { repeat: { x: 3, y: 3 }, colorSpace: THREE.NoColorSpace }),
        roughnessMap: createTexture(roughnessUrl, { repeat: { x: 3, y: 3 }, colorSpace: THREE.NoColorSpace }),
      };
    }

    function createGrainTextureSet() {
      const size = 256;
      const albedoUrl = createProceduralTextureDataUrl(size, (ctx, dimension) => {
        const gradient = ctx.createLinearGradient(0, 0, dimension, dimension);
        gradient.addColorStop(0, '#d4b179');
        gradient.addColorStop(1, '#c59855');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, dimension, dimension);
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 28; i++) {
          const y = (dimension / 28) * i + Math.random() * 4;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(dimension, y + Math.random() * 6 - 3);
          ctx.stroke();
        }
        addNoise(ctx, dimension, 0.12);
      });

      const normalUrl = createProceduralTextureDataUrl(size, (ctx, dimension) => {
        ctx.fillStyle = 'rgb(128,128,255)';
        ctx.fillRect(0, 0, dimension, dimension);
        ctx.strokeStyle = 'rgba(150, 130, 255, 0.35)';
        ctx.lineWidth = 2;
        for (let i = 0; i < 24; i++) {
          const y = (dimension / 24) * i + Math.random() * 4;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(dimension, y + Math.random() * 4 - 2);
          ctx.stroke();
        }
      });

      const roughnessUrl = createProceduralTextureDataUrl(size, (ctx, dimension) => {
        ctx.fillStyle = 'rgb(210,210,210)';
        ctx.fillRect(0, 0, dimension, dimension);
        ctx.strokeStyle = 'rgba(90,90,90,0.3)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 36; i++) {
          const y = (dimension / 36) * i + Math.random() * 3;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(dimension, y + Math.random() * 4 - 2);
          ctx.stroke();
        }
        addNoise(ctx, dimension, 0.1);
      });

      return {
        map: createTexture(albedoUrl, { repeat: { x: 2.2, y: 2.2 }, colorSpace: THREE.SRGBColorSpace }),
        normalMap: createTexture(normalUrl, { repeat: { x: 2.2, y: 2.2 }, colorSpace: THREE.NoColorSpace }),
        roughnessMap: createTexture(roughnessUrl, { repeat: { x: 2.2, y: 2.2 }, colorSpace: THREE.NoColorSpace }),
      };
    }

    function createBarkTextureSet() {
      const size = 256;
      const albedoUrl = createProceduralTextureDataUrl(size, (ctx, dimension) => {
        const gradient = ctx.createLinearGradient(0, 0, dimension, dimension);
        gradient.addColorStop(0, '#4f3418');
        gradient.addColorStop(1, '#3a2412');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, dimension, dimension);
        ctx.strokeStyle = 'rgba(255, 210, 150, 0.22)';
        ctx.lineWidth = 4;
        for (let i = 0; i < 12; i++) {
          const x = (dimension / 12) * i + Math.random() * 6;
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.bezierCurveTo(
            x + Math.random() * 10 - 5,
            dimension * 0.25,
            x + Math.random() * 10 - 5,
            dimension * 0.75,
            x + Math.random() * 8 - 4,
            dimension
          );
          ctx.stroke();
        }
        addNoise(ctx, dimension, 0.18);
      });

      const normalUrl = createProceduralTextureDataUrl(size, (ctx, dimension) => {
        ctx.fillStyle = 'rgb(128,128,255)';
        ctx.fillRect(0, 0, dimension, dimension);
        ctx.strokeStyle = 'rgba(90,70,230,0.6)';
        ctx.lineWidth = 3;
        for (let i = 0; i < 14; i++) {
          const x = (dimension / 14) * i + Math.random() * 8;
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.bezierCurveTo(
            x + Math.random() * 12 - 6,
            dimension * 0.3,
            x + Math.random() * 12 - 6,
            dimension * 0.7,
            x + Math.random() * 8 - 4,
            dimension
          );
          ctx.stroke();
        }
      });

      const roughnessUrl = createProceduralTextureDataUrl(size, (ctx, dimension) => {
        ctx.fillStyle = 'rgb(140,140,140)';
        ctx.fillRect(0, 0, dimension, dimension);
        ctx.strokeStyle = 'rgba(60,60,60,0.4)';
        ctx.lineWidth = 2;
        for (let i = 0; i < 18; i++) {
          const x = (dimension / 18) * i + Math.random() * 6;
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x + Math.random() * 6 - 3, dimension);
          ctx.stroke();
        }
        addNoise(ctx, dimension, 0.14);
      });

      return {
        map: createTexture(albedoUrl, { repeat: { x: 1.4, y: 1.4 }, colorSpace: THREE.SRGBColorSpace }),
        normalMap: createTexture(normalUrl, { repeat: { x: 1.4, y: 1.4 }, colorSpace: THREE.NoColorSpace }),
        roughnessMap: createTexture(roughnessUrl, { repeat: { x: 1.4, y: 1.4 }, colorSpace: THREE.NoColorSpace }),
      };
    }

    function getParticleTexture() {
      const key = 'harvestSpark';
      if (spriteTextureCache.has(key)) {
        return spriteTextureCache.get(key);
      }
      const size = 128;
      const dataUrl = createProceduralTextureDataUrl(size, (ctx, dimension) => {
        ctx.clearRect(0, 0, dimension, dimension);
        const gradient = ctx.createRadialGradient(
          dimension / 2,
          dimension / 2,
          0,
          dimension / 2,
          dimension / 2,
          dimension / 2
        );
        gradient.addColorStop(0, 'rgba(255,255,255,1)');
        gradient.addColorStop(0.45, 'rgba(255,255,255,0.45)');
        gradient.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(dimension / 2, dimension / 2, dimension / 2, 0, Math.PI * 2);
        ctx.fill();
      });
      const texture = createTexture(dataUrl, {
        repeat: { x: 1, y: 1 },
        wrapS: THREE.ClampToEdgeWrapping,
        wrapT: THREE.ClampToEdgeWrapping,
        magFilter: THREE.LinearFilter,
        minFilter: THREE.LinearFilter,
        colorSpace: THREE.SRGBColorSpace,
      });
      spriteTextureCache.set(key, texture);
      return texture;
    }

    function worldToScene(x, y) {
      return {
        x: (x - state.width / 2) * TILE_UNIT + TILE_UNIT / 2,
        z: (y - state.height / 2) * TILE_UNIT + TILE_UNIT / 2,
      };
    }

    function sceneToWorld(sceneX, sceneZ) {
      const gridX = (sceneX - TILE_UNIT / 2) / TILE_UNIT + state.width / 2;
      const gridY = (sceneZ - TILE_UNIT / 2) / TILE_UNIT + state.height / 2;
      return {
        x: Math.round(gridX),
        y: Math.round(gridY),
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
          if (sidePanelEl.classList.contains('open')) {
            sidePanelEl.setAttribute('aria-hidden', 'false');
            document.body.classList.add('sidebar-open');
            toggleSidebarButton?.setAttribute('aria-expanded', 'true');
            if (sidePanelScrim) sidePanelScrim.hidden = false;
          } else {
            sidePanelEl.setAttribute('aria-hidden', 'true');
            document.body.classList.remove('sidebar-open');
            toggleSidebarButton?.setAttribute('aria-expanded', 'false');
            if (sidePanelScrim) sidePanelScrim.hidden = true;
          }
          resetHudInactivityTimer();
          return;
        }
      if (sidePanelEl.classList.contains('open')) {
        sidePanelEl.setAttribute('aria-hidden', 'false');
        if (sidePanelScrim) sidePanelScrim.hidden = false;
      } else {
        sidePanelEl.setAttribute('aria-hidden', 'true');
        if (sidePanelScrim) sidePanelScrim.hidden = true;
      }
      resetHudInactivityTimer();
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
      resetHudInactivityTimer();
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
      resetHudInactivityTimer();
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
      playerHintEl.removeAttribute('data-variant');
    }

    function showPlayerHint(message, options = {}) {
      if (!playerHintEl || (!message && !options.html)) return;
      if (playerHintTimer) {
        clearTimeout(playerHintTimer);
        playerHintTimer = null;
      }
      if (options.variant) {
        playerHintEl.setAttribute('data-variant', options.variant);
      } else {
        playerHintEl.removeAttribute('data-variant');
      }
      if (options.html) {
        playerHintEl.innerHTML = options.html;
      } else if (message) {
        playerHintEl.textContent = message;
      } else {
        playerHintEl.textContent = '';
      }
      playerHintEl.classList.add('visible');
      const duration = Number.isFinite(options.duration) ? Number(options.duration) : 5600;
      if (!options.persist) {
        playerHintTimer = window.setTimeout(() => {
          hidePlayerHint();
        }, Math.max(1000, duration));
      }
    }

    const coarsePointerQuery =
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(pointer: coarse)')
        : null;

    function prefersTouchControls() {
      if (coarsePointerQuery?.matches) return true;
      if (navigator.maxTouchPoints != null && navigator.maxTouchPoints > 0) return true;
      if (navigator.msMaxTouchPoints != null && navigator.msMaxTouchPoints > 0) return true;
      return typeof window !== 'undefined' && 'ontouchstart' in window;
    }

    function createControlsHintMarkup(preferredScheme = 'desktop') {
      const desktopActive = preferredScheme === 'desktop';
      const mobileActive = preferredScheme === 'touch';
      const desktopBadge = desktopActive ? '<span class="player-hint__badge">Detected</span>' : '';
      const mobileBadge = mobileActive ? '<span class="player-hint__badge">Detected</span>' : '';
      const desktopList = [
        'Move with WASD or the arrow keys.',
        'Press Space or click adjacent tiles to gather resources.',
        'Press Q to place blocks and R to ignite portal frames.',
      ];
      const mobileList = [
        'Tap the on-screen arrows to move.',
        'Tap ✦ to interact or gather from nearby tiles.',
        'Tap ⧉ to ignite portal frames.',
      ];
      const renderList = (items) =>
        `<ul class="player-hint__list">${items.map((item) => `<li>${item}</li>`).join('')}</ul>`;
      const renderKeys = (keys) =>
        `<div class="player-hint__key-row" aria-hidden="true">${keys
          .map((key) => `<span class="player-hint__key">${key}</span>`)
          .join('')}</div>`;
      const desktopKeys = renderKeys(['W', 'A', 'S', 'D']);
      const mobileKeys =
        '<div class="player-hint__key-row player-hint__key-row--mobile" aria-hidden="true">' +
        ['◀', '▲', '▼', '▶']
          .map((key) => `<span class="player-hint__key player-hint__key--arrow">${key}</span>`)
          .join('') +
        '</div>';
      return `
        <div class="player-hint__controls">
          <h3 class="player-hint__title">Choose your controls</h3>
          <p class="player-hint__intro">Pick the movement scheme that matches your device before night falls.</p>
          <div class="player-hint__columns">
            <section class="player-hint__column${desktopActive ? ' is-active' : ''}" aria-label="Desktop controls">
              <header class="player-hint__column-header">
                <span class="player-hint__label">Desktop</span>
                ${desktopBadge}
              </header>
              ${desktopKeys}
              ${renderList(desktopList)}
            </section>
            <section class="player-hint__column${mobileActive ? ' is-active' : ''}" aria-label="Touch controls">
              <header class="player-hint__column-header">
                <span class="player-hint__label">Touch</span>
                ${mobileBadge}
              </header>
              ${mobileKeys}
              ${renderList(mobileList)}
            </section>
          </div>
        </div>
      `;
    }

    function handleResize() {
      updateLayoutMetrics();
      syncSidebarForViewport();
      if (!renderer || !camera) return;
      const width = canvas.clientWidth || canvas.width || 1;
      const height = canvas.clientHeight || canvas.height || 1;
      renderer.setSize(width, height, false);
      const aspect = width / height;
      if (camera.isPerspectiveCamera) {
        camera.aspect = aspect;
      } else if (camera.isOrthographicCamera) {
        const halfHeight = CAMERA_FRUSTUM_HEIGHT / 2;
        const halfWidth = halfHeight * aspect;
        camera.left = -halfWidth;
        camera.right = halfWidth;
        camera.top = halfHeight;
        camera.bottom = -halfHeight;
      }
      camera.updateProjectionMatrix();
      syncCameraToPlayer({ idleBob: 0, walkBob: 0, movementStrength: 0 });
    }

    function syncCameraToPlayer(options = {}) {
      if (!camera || !state?.player) return;
      const facing = options.facing ?? state.player?.facing ?? { x: 0, y: 1 };
      const idleBob = options.idleBob ?? 0;
      const walkBob = options.walkBob ?? 0;
      const movementStrength = options.movementStrength ?? 0;
      const { x, z } = worldToScene(state.player.x, state.player.y);
      const baseHeight = tileSurfaceHeight(state.player.x, state.player.y) || 0;

      tmpCameraForward.set(facing.x, 0, facing.y);
      if (tmpCameraForward.lengthSq() < 0.0001) {
        tmpCameraForward.copy(cameraState.lastFacing);
      } else {
        tmpCameraForward.normalize();
        cameraState.lastFacing.copy(tmpCameraForward);
      }

      const timestamp = performance?.now ? performance.now() : Date.now();
      const bobOffset = idleBob * 0.35 + walkBob * 0.22;
      const bounceOffset =
        movementStrength > 0.01 ? Math.sin(timestamp / 320) * 0.05 * movementStrength : 0;
      const eyeY = baseHeight + CAMERA_EYE_OFFSET + bobOffset + bounceOffset;

      camera.position.set(x, eyeY, z);
      camera.position.addScaledVector(cameraState.lastFacing, CAMERA_FORWARD_OFFSET);

      tmpCameraTarget.copy(camera.position);
      tmpCameraTarget.addScaledVector(cameraState.lastFacing, CAMERA_LOOK_DISTANCE);

      if (movementStrength > 0.01) {
        const sway = Math.sin(timestamp / 280) * 0.18 * movementStrength;
        if (Math.abs(sway) > 0.0001) {
          tmpCameraRight.crossVectors(cameraState.lastFacing, WORLD_UP).normalize();
          tmpCameraTarget.addScaledVector(tmpCameraRight, sway);
        }
      }

      camera.up.copy(WORLD_UP);
      camera.lookAt(tmpCameraTarget);
    }

    function initPointerControls() {
      const pointer = {
        active: false,
        id: null,
        pointerType: null,
        button: 0,
      };
      let suppressNextClick = false;
      canvas.style.cursor = 'pointer';

      const computeFacingFromDelta = (dx, dy) => {
        const absX = Math.abs(dx);
        const absY = Math.abs(dy);
        if (absX === 0 && absY === 0) {
          return { ...state.player.facing };
        }
        if (absX > absY) {
          return { x: Math.sign(dx), y: 0 };
        }
        if (absY > absX) {
          return { x: 0, y: Math.sign(dy) };
        }
        if (state.player.facing.x !== 0 && Math.sign(dx) !== 0) {
          return { x: Math.sign(dx), y: 0 };
        }
        if (state.player.facing.y !== 0 && Math.sign(dy) !== 0) {
          return { x: 0, y: Math.sign(dy) };
        }
        return {
          x: Math.sign(dx) || 0,
          y: Math.sign(dy) || 0,
        };
      };

      const handlePointerClick = (event) => {
        if (!state.isRunning) {
          return;
        }
        if (!camera || !worldGroup) {
          interact();
          return;
        }
        const rect = canvas.getBoundingClientRect();
        const ndcX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        const ndcY = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera({ x: ndcX, y: ndcY }, camera);
        const intersections = raycaster.intersectObjects(worldGroup.children, true);
        if (!intersections.length) {
          interact();
          return;
        }
        let target = intersections[0].object;
        while (target.parent && target.parent !== worldGroup) {
          target = target.parent;
        }
        if (!target || target.parent !== worldGroup) {
          interact();
          return;
        }
        const { x: tileX, y: tileY } = sceneToWorld(target.position.x, target.position.z);
        if (!isWithinBounds(tileX, tileY)) {
          interact();
          return;
        }
        const diffX = tileX - state.player.x;
        const diffY = tileY - state.player.y;
        const adjacent = Math.abs(diffX) <= 1 && Math.abs(diffY) <= 1;
        const nextFacing = computeFacingFromDelta(diffX, diffY);
        state.player.facing = nextFacing;
        if (adjacent) {
          interact(false);
          return;
        }
        logEvent('Move closer to interact with that block.');
      };

      const resetPointerState = () => {
        pointer.active = false;
        pointer.id = null;
        pointer.pointerType = null;
        pointer.button = 0;
      };

      canvas.addEventListener('pointerdown', (event) => {
        if (event.pointerType === 'mouse' && event.button !== 0) {
          return;
        }
        pointer.active = true;
        pointer.id = event.pointerId;
        pointer.pointerType = event.pointerType;
        pointer.button = event.button;
      });

      canvas.addEventListener('pointermove', (event) => {
        if (!pointer.active) return;
        // Pointer move is retained only to keep the listener symmetrical.
        // No camera orbit updates are performed so the view remains fixed.
      });

      canvas.addEventListener('pointerup', (event) => {
        if (!pointer.active) return;
        const isPrimaryPointer =
          pointer.pointerType === 'touch' ||
          pointer.pointerType === 'pen' ||
          pointer.button === 0 ||
          event.button === 0;
        if (isPrimaryPointer && state.isRunning) {
          if (pointer.pointerType === 'touch' || pointer.pointerType === 'pen') {
            suppressNextClick = true;
            handlePointerClick(event);
          }
        }
        resetPointerState();
      });

      const cancelPointer = () => {
        if (!pointer.active) return;
        suppressNextClick = false;
        resetPointerState();
      };

      canvas.addEventListener('pointerleave', cancelPointer);
      canvas.addEventListener('pointercancel', cancelPointer);
      canvas.addEventListener('click', (event) => {
        if (suppressNextClick) {
          suppressNextClick = false;
          return;
        }
        if (!state.isRunning) return;
        handlePointerClick(event);
      });
    }

    function initRenderer() {
      if (renderer) return true;
      try {
        renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
        const gl = renderer.getContext();
        if (!gl || typeof gl.getParameter !== 'function') {
          throw new Error('WebGL context unavailable');
        }
      } catch (error) {
        renderer = null;
        showDependencyError(
          'Your browser could not initialise the 3D renderer. Please ensure WebGL is enabled and refresh to try again.',
          error
        );
        return false;
      }
      renderer.setPixelRatio(window.devicePixelRatio ?? 1);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1;

      scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(new THREE.Color(BASE_ATMOSPHERE.fogColor), BASE_ATMOSPHERE.fogDensity);

      const width = canvas.clientWidth || canvas.width || 1;
      const height = canvas.clientHeight || canvas.height || 1;
      const aspect = width / height;
      const halfHeight = CAMERA_FRUSTUM_HEIGHT / 2;
      const halfWidth = halfHeight * aspect;

      camera = new THREE.OrthographicCamera(-halfWidth, halfWidth, halfHeight, -halfHeight, 0.1, 80);
      camera.zoom = CAMERA_BASE_ZOOM;
      camera.updateProjectionMatrix();

      worldGroup = new THREE.Group();
      entityGroup = new THREE.Group();
      particleGroup = new THREE.Group();
      scene.add(worldGroup);
      scene.add(entityGroup);
      scene.add(particleGroup);

      hemiLight = new THREE.HemisphereLight(0xbcd7ff, 0x0b1324, 1.05);
      scene.add(hemiLight);

      sunLight = new THREE.DirectionalLight(0xfff2d8, 1.4);
      sunLight.position.set(12, 16, 6);
      sunLight.target.position.set(0, 0, 0);
      scene.add(sunLight);
      scene.add(sunLight.target);

      moonLight = new THREE.DirectionalLight(0x88aaff, 0.45);
      moonLight.position.set(-10, 10, -8);
      moonLight.target.position.set(0, 0, 0);
      scene.add(moonLight);
      scene.add(moonLight.target);

      torchLight = new THREE.PointLight(0xffd27f, 0, 8, 2.4);
      torchLight.castShadow = false;
      torchLight.visible = false;
      scene.add(torchLight);

      initPointerControls();
      window.addEventListener('resize', handleResize);
      handleResize();
      createPlayerMesh();
      createPlayerLocator();
      syncCameraToPlayer({ idleBob: 0, walkBob: 0, movementStrength: 0 });
      updateLighting(0);
      return true;
    }

    function resetWorldMeshes() {
      tileRenderState = [];
      if (!worldGroup) return;
      while (worldGroup.children.length) {
        worldGroup.remove(worldGroup.children[0]);
      }
      if (particleGroup) {
        while (particleGroup.children.length) {
          const child = particleGroup.children[0];
          if (child.geometry) child.geometry.dispose();
          if (child.material) child.material.dispose();
          particleGroup.remove(child);
        }
      }
      particleSystems.length = 0;
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
      let mat = material;
      if (!mat) {
        const materialOptions = {
          color: new THREE.Color(color),
          roughness,
          metalness,
          transparent,
          opacity,
          side: doubleSide ? THREE.DoubleSide : THREE.FrontSide,
        };
        if (emissive !== undefined) {
          materialOptions.emissive = new THREE.Color(emissive);
          materialOptions.emissiveIntensity = emissiveIntensity;
        }
        mat = new THREE.MeshStandardMaterial(materialOptions);
      }
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

    function createPortalSurfaceMaterial(accentColor, active = false) {
      const uniforms = {
        uTime: { value: 0 },
        uActivation: { value: active ? 1 : 0.18 },
        uColor: { value: new THREE.Color(accentColor) },
        uOpacity: { value: active ? 0.85 : 0.55 },
      };
      const material = new THREE.ShaderMaterial({
        uniforms,
        vertexShader: PORTAL_VERTEX_SHADER,
        fragmentShader: PORTAL_FRAGMENT_SHADER,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      });
      material.extensions = material.extensions || {};
      return { material, uniforms };
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

    function getSurfaceVariantForTile(type) {
      switch (type) {
        case 'grass':
        case 'tree':
        case 'village':
          return 'dew';
        case 'sand':
        case 'canyon':
        case 'stone':
        case 'rock':
        case 'ore':
        case 'marble':
        case 'marbleEcho':
        case 'netherite':
          return 'grain';
        default:
          return 'default';
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
            material: getBaseMaterial(baseColor, getSurfaceVariantForTile(tile.type)),
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
          addBlock(group, { material: getBaseMaterial(TILE_TYPES.grass.base, 'dew'), height: 0.9 });
          addTopPlate(group, TILE_TYPES.grass.accent, 0.9, 0.5);
          addBlock(group, {
            material: getBaseMaterial('#4f3418', 'bark'),
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
          addBlock(group, { material: getBaseMaterial(baseColor, 'grain'), height: 0.8 });
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
          const { material: shaderMaterial, uniforms } = createPortalSurfaceMaterial(
            accentColor,
            tile.type === 'portal'
          );
          const plane = new THREE.Mesh(PORTAL_PLANE_GEOMETRY, shaderMaterial);
          plane.position.y = height + 0.85;
          plane.renderOrder = 2;
          group.add(plane);
          const planeBMaterial = shaderMaterial.clone();
          planeBMaterial.uniforms = uniforms;
          const planeB = new THREE.Mesh(PORTAL_PLANE_GEOMETRY, planeBMaterial);
          planeB.position.y = height + 0.85;
          planeB.rotation.y = Math.PI / 2;
          planeB.renderOrder = 2;
          group.add(planeB);
          renderInfo.animations.portalSurface = {
            uniforms,
            materials: [plane.material, planeB.material],
          };
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
          const variant = getSurfaceVariantForTile(tile.type);
          const baseBlock = addBlock(group, { height, material: getBaseMaterial(baseColor, variant) });
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
      if (renderInfo.animations.portalSurface) {
        const { uniforms } = renderInfo.animations.portalSurface;
        uniforms.uTime.value = state.elapsed;
        if (tile.type === 'portal') {
          const portalState = tile.portalState;
          const activation = portalState?.activation ?? 0.6;
          const surge = portalState?.transition ?? 0;
          const energy = Math.min(1.6, 0.25 + activation * 0.9 + surge * 0.8);
          uniforms.uActivation.value = energy;
          uniforms.uOpacity.value = Math.min(1, 0.65 + activation * 0.25 + surge * 0.2);
        } else {
          const dormant = tile.portalState?.activation ?? 0;
          uniforms.uActivation.value = 0.12 + dormant * 0.4;
          uniforms.uOpacity.value = 0.45;
        }
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

      const hairBasePosition = hair.position.clone();
      const fringeBasePosition = fringe.position.clone();

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
        hair,
        fringe,
        hairBasePosition,
        fringeBasePosition,
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

        const leftLeg = buildLeg(-0.18);
        const rightLeg = buildLeg(0.18);
        zombie.add(leftLeg);
        zombie.add(rightLeg);

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

        const leftArm = buildArm(-0.46);
        const rightArm = buildArm(0.46);
        zombie.add(leftArm);
        zombie.add(rightArm);

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
        eyeMaterial.transparent = true;
        eyeMaterial.opacity = 0.85;
        eyeMaterial.depthWrite = false;
        const eyeGeometry = new THREE.PlaneGeometry(0.08, 0.1);
        const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        leftEye.position.set(-0.12, headHeight * 0.65, 0.22);
        headGroup.add(leftEye);
        const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        rightEye.position.set(0.12, headHeight * 0.65, 0.22);
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
        const bodyMaterials = [];
        const baseBodyColors = [];
        const baseEmissiveColors = [];
        zombie.traverse((child) => {
          if (!child?.isMesh || child.material === eyeMaterial) return;
          const material = child.material;
          if (!material) return;
          bodyMaterials.push(material);
          baseBodyColors.push(material.color?.clone?.() ?? new THREE.Color('#ffffff'));
          baseEmissiveColors.push(material.emissive?.clone?.() ?? new THREE.Color('#000000'));
        });
        entityGroup.add(zombie);
        zombieMeshes.push({
          group: zombie,
          parts: {
            leftLeg,
            rightLeg,
            leftArm,
            rightArm,
            head: headGroup,
          },
          eyes: [leftEye, rightEye],
          eyeMaterial,
          baseEyeColor: new THREE.Color(colors.eye),
          aggressiveEyeColor: new THREE.Color('#ff9a9a'),
          tempColor: new THREE.Color(colors.eye),
          bodyMaterials,
          baseBodyColors,
          baseEmissiveColors,
          previousXZ: new THREE.Vector2(),
          hasPrev: false,
          lastUpdate: typeof performance !== 'undefined' ? performance.now() : Date.now(),
          walkPhase: Math.random() * Math.PI * 2,
          movement: 0,
          aggression: 0,
        });
      }
      while (zombieMeshes.length > count) {
        const zombieData = zombieMeshes.pop();
        if (!zombieData) continue;
        entityGroup.remove(zombieData.group);
        zombieData.eyeMaterial?.dispose?.();
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

        const leftLeg = buildLeg(-0.26);
        const rightLeg = buildLeg(0.26);
        golem.add(leftLeg);
        golem.add(rightLeg);

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

        const leftArm = buildArm(-0.78);
        const rightArm = buildArm(0.78);
        golem.add(leftArm);
        golem.add(rightArm);

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
        eyeMaterial.transparent = true;
        eyeMaterial.opacity = 0.9;
        eyeMaterial.depthWrite = false;
        const eyeGeometry = new THREE.PlaneGeometry(0.1, 0.1);
        const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        leftEye.position.set(-0.12, headHeight * 0.58, 0.24);
        headGroup.add(leftEye);
        const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        rightEye.position.set(0.12, headHeight * 0.58, 0.24);
        headGroup.add(rightEye);

        golem.add(headGroup);
        const bodyMaterials = [];
        const baseBodyColors = [];
        const baseEmissiveColors = [];
        golem.traverse((child) => {
          if (!child?.isMesh || child.material === eyeMaterial) return;
          const material = child.material;
          if (!material) return;
          bodyMaterials.push(material);
          baseBodyColors.push(material.color?.clone?.() ?? new THREE.Color('#ffffff'));
          baseEmissiveColors.push(material.emissive?.clone?.() ?? new THREE.Color('#000000'));
        });
        entityGroup.add(golem);
        ironGolemMeshes.push({
          group: golem,
          parts: {
            leftLeg,
            rightLeg,
            leftArm,
            rightArm,
            head: headGroup,
          },
          eyes: [leftEye, rightEye],
          eyeMaterial,
          baseEyeColor: new THREE.Color(colors.eye),
          aggressiveEyeColor: new THREE.Color('#ffe2a8'),
          tempColor: new THREE.Color(colors.eye),
          bodyMaterials,
          baseBodyColors,
          baseEmissiveColors,
          previousXZ: new THREE.Vector2(),
          hasPrev: false,
          lastUpdate: typeof performance !== 'undefined' ? performance.now() : Date.now(),
          walkPhase: Math.random() * Math.PI * 2,
          movement: 0,
          aggression: 0,
        });
      }
      while (ironGolemMeshes.length > count) {
        const golemData = ironGolemMeshes.pop();
        if (!golemData) continue;
        entityGroup.remove(golemData.group);
        golemData.eyeMaterial?.dispose?.();
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
          if (playerMeshParts.hair) {
            const base = playerMeshParts.hairBasePosition;
            const idleSway = Math.sin(now / 420) * 0.03;
            const stepSway = Math.sin(walkCycle * 1.2) * 0.08 * movementStrength;
            const backDrift = Math.max(0, Math.cos(walkCycle)) * 0.05 * movementStrength;
            playerMeshParts.hair.rotation.x = -0.18 * movementStrength + (idleSway + stepSway) * 0.7;
            playerMeshParts.hair.rotation.z = Math.sin(now / 960) * 0.05;
            if (base) {
              playerMeshParts.hair.position.x = base.x + Math.sin(walkCycle * 0.5) * 0.02 * movementStrength;
              playerMeshParts.hair.position.z = base.z - 0.03 * movementStrength - backDrift;
            }
          }
          if (playerMeshParts.fringe) {
            const base = playerMeshParts.fringeBasePosition;
            const idleLift = Math.sin(now / 360) * 0.02;
            const forwardSwing = Math.sin(walkCycle * 1.1 + Math.PI / 3) * 0.05 * movementStrength;
            playerMeshParts.fringe.rotation.x = 0.12 * movementStrength - (idleLift + forwardSwing);
            if (base) {
              playerMeshParts.fringe.position.x = base.x + Math.sin(walkCycle * 0.8 + Math.PI / 6) * 0.015 * movementStrength;
              playerMeshParts.fringe.position.z = base.z + Math.max(0, Math.sin(walkCycle)) * 0.03 * movementStrength;
            }
          }
        }

        syncCameraToPlayer({
          idleBob,
          walkBob: bob,
          movementStrength,
          facing,
        });
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
      const nightFactor = THREE.MathUtils.clamp(lightingState.nightStrength ?? 0, 0, 1);
      state.zombies.forEach((zombie, index) => {
        const actor = zombieMeshes[index];
        if (!actor) return;
        const { group, parts } = actor;
        const { x, z } = worldToScene(zombie.x, zombie.y);
        const h = tileSurfaceHeight(zombie.x, zombie.y);
        const deltaMs = actor.lastUpdate != null ? now - actor.lastUpdate : 16;
        actor.lastUpdate = now;
        const deltaSeconds = deltaMs / 1000;
        const prevXZ = actor.previousXZ;
        const distance = actor.hasPrev ? Math.hypot(x - prevXZ.x, z - prevXZ.y) : 0;
        prevXZ.set(x, z);
        actor.hasPrev = true;
        const targetMovement = THREE.MathUtils.clamp(distance * 3, 0, 1);
        const smoothing = Math.min(1, deltaSeconds * 6);
        const previousMovement = actor.movement ?? targetMovement;
        const movement = previousMovement + (targetMovement - previousMovement) * smoothing;
        actor.movement = movement;
        actor.walkPhase = (actor.walkPhase ?? Math.random() * Math.PI * 2) + deltaSeconds * (5 + movement * 6);
        const stride = Math.sin(actor.walkPhase) * 0.65 * movement;
        const lift = Math.cos(actor.walkPhase) * 0.45 * movement;
        if (parts.leftLeg) {
          parts.leftLeg.rotation.x = stride;
          parts.leftLeg.rotation.z = 0;
        }
        if (parts.rightLeg) {
          parts.rightLeg.rotation.x = -stride;
          parts.rightLeg.rotation.z = 0;
        }
        const idleFlail = Math.sin(now / 260 + index) * 0.2;
        if (parts.leftArm) {
          parts.leftArm.rotation.x = -stride * 0.9 - movement * 0.4;
          parts.leftArm.rotation.z = idleFlail * (1 - movement * 0.6);
        }
        if (parts.rightArm) {
          parts.rightArm.rotation.x = stride * 0.9 - movement * 0.4;
          parts.rightArm.rotation.z = -idleFlail * (1 - movement * 0.6);
        }
        if (parts.head) {
          parts.head.rotation.y = Math.sin(now / 900 + index) * 0.12 + Math.sin(actor.walkPhase * 0.6) * 0.1 * movement;
          parts.head.rotation.x = Math.cos(now / 780 + index) * 0.07 + Math.cos(actor.walkPhase * 0.4) * 0.05 * movement;
        }
        const bob = Math.abs(lift) * 0.15 + Math.sin(now / 520 + index) * 0.01 * (1 - movement);
        group.position.set(x, h + bob, z);

        const distToPlayer = Math.abs(zombie.x - state.player.x) + Math.abs(zombie.y - state.player.y);
        const aggressionTarget = distToPlayer <= 1 ? 1 : Math.max(0, 1 - distToPlayer / 6);
        const previousAggression = actor.aggression ?? 0;
        const aggression = previousAggression + (aggressionTarget - previousAggression) * Math.min(1, deltaSeconds * 4);
        actor.aggression = aggression;
        const pulse = (Math.sin(now / 120 + index) + 1) * 0.25 * aggression;
        const eyeColor = actor.tempColor;
        eyeColor.copy(actor.baseEyeColor).lerp(actor.aggressiveEyeColor, THREE.MathUtils.clamp(aggression + pulse, 0, 1));
        actor.eyeMaterial.color.copy(eyeColor);
        actor.eyeMaterial.opacity = 0.75 + aggression * 0.25;
        actor.eyeMaterial.needsUpdate = true;
        if (actor.bodyMaterials?.length) {
          const outlineStrength = THREE.MathUtils.clamp(nightFactor * 0.85 + aggression * 0.45, 0, 1);
          actor.bodyMaterials.forEach((material, matIndex) => {
            if (!material) return;
            const baseColor = actor.baseBodyColors?.[matIndex];
            const baseEmissive = actor.baseEmissiveColors?.[matIndex];
            if (baseColor && material.color) {
              tmpColorC.copy(baseColor);
              const targetColor = tmpColorD.copy(ZOMBIE_OUTLINE_COLOR);
              material.color.copy(tmpColorC.lerp(targetColor, outlineStrength * 0.35));
            }
            if (material.emissive) {
              const base = baseEmissive ?? material.emissive;
              tmpColorC.copy(base);
              const target = tmpColorD.copy(ZOMBIE_OUTLINE_COLOR);
              material.emissive.copy(tmpColorC.lerp(target, outlineStrength));
            } else {
              material.emissive = new THREE.Color('#000000');
              material.emissive.copy(ZOMBIE_OUTLINE_COLOR).multiplyScalar(outlineStrength);
            }
            material.emissiveIntensity = 0.25 + outlineStrength * 0.9;
          });
        }
      });
      state.ironGolems?.forEach((golem, index) => {
        const actor = ironGolemMeshes[index];
        if (!actor) return;
        const { group, parts } = actor;
        const { x, z } = worldToScene(golem.x, golem.y);
        const h = tileSurfaceHeight(golem.x, golem.y);
        const deltaMs = actor.lastUpdate != null ? now - actor.lastUpdate : 16;
        actor.lastUpdate = now;
        const deltaSeconds = deltaMs / 1000;
        const prevXZ = actor.previousXZ;
        const distance = actor.hasPrev ? Math.hypot(x - prevXZ.x, z - prevXZ.y) : 0;
        prevXZ.set(x, z);
        actor.hasPrev = true;
        const targetMovement = THREE.MathUtils.clamp(distance * 2.2, 0, 1);
        const smoothing = Math.min(1, deltaSeconds * 4);
        const previousMovement = actor.movement ?? targetMovement;
        const movement = previousMovement + (targetMovement - previousMovement) * smoothing;
        actor.movement = movement;
        actor.walkPhase = (actor.walkPhase ?? Math.random() * Math.PI * 2) + deltaSeconds * (3.2 + movement * 4.2);
        const swing = Math.sin(actor.walkPhase) * 0.38 * movement;
        const stomp = Math.max(0, Math.sin(actor.walkPhase + Math.PI / 2)) * 0.3 * movement;
        if (parts.leftLeg) {
          parts.leftLeg.rotation.x = swing;
          parts.leftLeg.rotation.z = 0;
        }
        if (parts.rightLeg) {
          parts.rightLeg.rotation.x = -swing;
          parts.rightLeg.rotation.z = 0;
        }
        if (parts.leftArm) {
          parts.leftArm.rotation.x = -swing * 0.4 - movement * 0.18;
          parts.leftArm.rotation.z = -0.05 * movement;
        }
        if (parts.rightArm) {
          parts.rightArm.rotation.x = swing * 0.4 - movement * 0.18;
          parts.rightArm.rotation.z = 0.05 * movement;
        }
        if (parts.head) {
          parts.head.rotation.y = Math.sin(actor.walkPhase * 0.35) * 0.1 * movement;
          parts.head.rotation.x = Math.cos(now / 1600 + index) * 0.03;
        }
        group.position.set(x, h + stomp, z);

        let nearestZombie = Infinity;
        state.zombies.forEach((z) => {
          const d = Math.abs(z.x - golem.x) + Math.abs(z.y - golem.y);
          if (d < nearestZombie) nearestZombie = d;
        });
        const aggressionTarget = nearestZombie === Infinity ? 0 : Math.max(0, 1 - nearestZombie / 6);
        const previousAggression = actor.aggression ?? 0;
        const aggression = previousAggression + (aggressionTarget - previousAggression) * Math.min(1, deltaSeconds * 3.5);
        actor.aggression = aggression;
        const glowPulse = (Math.sin(now / 180 + index) + 1) * 0.2 * aggression;
        const eyeColor = actor.tempColor;
        eyeColor.copy(actor.baseEyeColor).lerp(actor.aggressiveEyeColor, THREE.MathUtils.clamp(aggression + glowPulse, 0, 1));
        actor.eyeMaterial.color.copy(eyeColor);
        actor.eyeMaterial.opacity = 0.6 + aggression * 0.35;
        actor.eyeMaterial.needsUpdate = true;
        if (actor.bodyMaterials?.length) {
          const outlineStrength = THREE.MathUtils.clamp(nightFactor * 0.75 + aggression * 0.6, 0, 1);
          actor.bodyMaterials.forEach((material, matIndex) => {
            if (!material) return;
            const baseColor = actor.baseBodyColors?.[matIndex];
            const baseEmissive = actor.baseEmissiveColors?.[matIndex];
            if (baseColor && material.color) {
              tmpColorC.copy(baseColor);
              const targetColor = tmpColorD.copy(GOLEM_OUTLINE_COLOR);
              material.color.copy(tmpColorC.lerp(targetColor, outlineStrength * 0.32));
            }
            if (material.emissive) {
              const base = baseEmissive ?? material.emissive;
              tmpColorC.copy(base);
              const target = tmpColorD.copy(GOLEM_OUTLINE_COLOR);
              material.emissive.copy(tmpColorC.lerp(target, outlineStrength));
            } else {
              material.emissive = new THREE.Color('#000000');
              material.emissive.copy(GOLEM_OUTLINE_COLOR).multiplyScalar(outlineStrength);
            }
            material.emissiveIntensity = 0.3 + outlineStrength * 0.85;
          });
        }
      });
      updateMarbleGhosts();
    }

    function spawnMarbleEchoGhost() {
      if (state.dimension.id !== 'marble') return;
      if (!playerMesh || !entityGroup) return;
      const ghost = playerMesh.clone(true);
      const materials = [];
      ghost.traverse((child) => {
        if (child.isMesh) {
          const material = new THREE.MeshBasicMaterial({
            color: new THREE.Color(DIMENSIONS.marble?.theme?.accent ?? '#f3d688'),
            transparent: true,
            opacity: 0.18,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          });
          child.material = material;
          materials.push(material);
        }
      });
      ghost.scale.multiplyScalar(1.02);
      entityGroup.add(ghost);
      const rotation = Math.atan2(state.player.facing.x, state.player.facing.y);
      const scenePos = worldToScene(state.player.x, state.player.y);
      const height = tileSurfaceHeight(state.player.x, state.player.y);
      ghost.position.set(scenePos.x, height + 0.05, scenePos.z);
      ghost.rotation.y = rotation;
      marbleGhosts.push({
        group: ghost,
        materials,
        spawnAt: state.elapsed,
        triggerAt: state.elapsed + 5,
        gridX: state.player.x,
        gridY: state.player.y,
        rotation,
      });
    }

    function disposeMarbleGhost(ghost) {
      if (!ghost) return;
      if (ghost.group && entityGroup) {
        entityGroup.remove(ghost.group);
      }
      ghost.materials?.forEach((material) => material?.dispose?.());
    }

    function clearMarbleGhosts() {
      for (let i = marbleGhosts.length - 1; i >= 0; i--) {
        disposeMarbleGhost(marbleGhosts[i]);
      }
      marbleGhosts.length = 0;
    }

    function updateMarbleGhosts() {
      if (!marbleGhosts.length) return;
      const accent = DIMENSIONS.marble?.theme?.accent ?? '#f3d688';
      for (let i = marbleGhosts.length - 1; i >= 0; i--) {
        const ghost = marbleGhosts[i];
        if (state.dimension.id !== 'marble') {
          disposeMarbleGhost(ghost);
          marbleGhosts.splice(i, 1);
          continue;
        }
        const total = ghost.triggerAt - ghost.spawnAt;
        const elapsed = state.elapsed - ghost.spawnAt;
        const ratio = total > 0 ? THREE.MathUtils.clamp(elapsed / total, 0, 1) : 1;
        const fadeOutElapsed = state.elapsed - ghost.triggerAt;
        const fadeOut = fadeOutElapsed > 0 ? THREE.MathUtils.clamp(fadeOutElapsed / 0.6, 0, 1) : 0;
        const intensity = fadeOut > 0 ? Math.max(0, 1 - fadeOut) : THREE.MathUtils.smoothstep(0.05, 1, ratio);
        const scenePos = worldToScene(ghost.gridX, ghost.gridY);
        const height = tileSurfaceHeight(ghost.gridX, ghost.gridY);
        const bob = Math.sin(state.elapsed * 6 + i) * 0.04;
        ghost.group.position.set(scenePos.x, height + 0.06 + ratio * 0.35 + bob, scenePos.z);
        ghost.group.rotation.y = ghost.rotation;
        ghost.materials?.forEach((material) => {
          if (!material) return;
          material.opacity = THREE.MathUtils.clamp(0.08 + intensity * 0.5, 0, 0.65);
          material.color.set(accent);
          material.color.lerp(new THREE.Color('#ffffff'), ratio * 0.3);
        });
        if (fadeOut >= 1) {
          disposeMarbleGhost(ghost);
          marbleGhosts.splice(i, 1);
        }
      }
    }

    function spawnHarvestParticles(x, y, accentColor) {
      if (!particleGroup) return;
      const count = 42;
      const positions = new Float32Array(count * 3);
      const velocities = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        const baseIndex = i * 3;
        positions[baseIndex] = (Math.random() - 0.5) * 0.4;
        positions[baseIndex + 1] = Math.random() * 0.4;
        positions[baseIndex + 2] = (Math.random() - 0.5) * 0.4;
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.6 + Math.random() * 0.8;
        velocities[baseIndex] = Math.cos(angle) * speed;
        velocities[baseIndex + 1] = Math.random() * 1.2 + 0.6;
        velocities[baseIndex + 2] = Math.sin(angle) * speed;
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const pointsMaterial = new THREE.PointsMaterial({
        size: 0.18,
        transparent: true,
        depthWrite: false,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        map: getParticleTexture(),
        color: new THREE.Color(accentColor ?? '#ffffff'),
        sizeAttenuation: true,
      });
      const points = new THREE.Points(geometry, pointsMaterial);
      const { x: sx, z: sz } = worldToScene(x, y);
      points.position.set(sx, tileSurfaceHeight(x, y) + 0.35, sz);
      particleGroup.add(points);
      particleSystems.push({
        points,
        positions,
        velocities,
        life: 0,
        maxLife: 1.35,
        count,
      });
    }

    function advanceParticles(delta) {
      if (!particleSystems.length) return;
      for (let i = particleSystems.length - 1; i >= 0; i--) {
        const system = particleSystems[i];
        system.life += delta;
        const ratio = system.life / system.maxLife;
        const { positions, velocities, points, count } = system;
        for (let j = 0; j < count; j++) {
          const baseIndex = j * 3;
          velocities[baseIndex + 1] -= 9.81 * delta * 0.35;
          const swirl = Math.sin((system.life + j) * 9) * 0.25 * delta;
          velocities[baseIndex] += swirl;
          velocities[baseIndex + 2] -= swirl;
          positions[baseIndex] += velocities[baseIndex] * delta;
          positions[baseIndex + 1] += velocities[baseIndex + 1] * delta;
          positions[baseIndex + 2] += velocities[baseIndex + 2] * delta;
        }
        points.geometry.attributes.position.needsUpdate = true;
        points.geometry.computeBoundingSphere();
        if (points.material) {
          const fade = Math.max(0, 1 - ratio * ratio);
          points.material.opacity = fade;
          points.material.needsUpdate = true;
        }
        if (ratio >= 1) {
          particleGroup.remove(points);
          points.geometry.dispose();
          points.material.dispose();
          particleSystems.splice(i, 1);
        }
      }
    }

    function updateLighting(delta) {
      if (!scene || !state || !hemiLight || !sunLight || !moonLight) return;
      const ratio = state.dayLength > 0 ? (state.elapsed % state.dayLength) / state.dayLength : 0;
      const playerFacing = state.player?.facing ?? { x: 0, y: 1 };
      const playerScene = worldToScene(state.player?.x ?? 0, state.player?.y ?? 0);
      const playerHeight = tileSurfaceHeight(state.player?.x ?? 0, state.player?.y ?? 0) + 0.6;

      const sunAngle = ratio * Math.PI * 2;
      const sunElevation = Math.sin(sunAngle);
      const dayStrength = THREE.MathUtils.clamp((sunElevation + 1) / 2, 0, 1);
      lightingState.dayStrength = dayStrength;
      const sunRadius = 24;
      sunLight.position.set(
        playerScene.x + Math.cos(sunAngle) * sunRadius,
        playerHeight + 8 + Math.max(0, sunElevation * 14),
        playerScene.z + Math.sin(sunAngle) * sunRadius
      );
      sunLight.target.position.set(playerScene.x, playerHeight - 0.6, playerScene.z);
      sunLight.target.updateMatrixWorld();
      sunLight.intensity = 0.25 + dayStrength * 1.55;

      const moonAngle = sunAngle + Math.PI;
      const moonElevation = Math.sin(moonAngle);
      const nightStrength = THREE.MathUtils.clamp((moonElevation + 1) / 2, 0, 1);
      lightingState.nightStrength = nightStrength;
      const moonRadius = 22;
      moonLight.position.set(
        playerScene.x + Math.cos(moonAngle) * moonRadius,
        playerHeight + 6 + Math.max(0, moonElevation * 10),
        playerScene.z + Math.sin(moonAngle) * moonRadius
      );
      moonLight.target.position.copy(sunLight.target.position);
      moonLight.target.updateMatrixWorld();
      moonLight.intensity = 0.18 + nightStrength * 0.7;

      hemiLight.intensity = 0.45 + dayStrength * 0.6;
      hemiLight.color.lerpColors(lightingState.nightSky, lightingState.daySky, dayStrength);
      hemiLight.groundColor.lerpColors(lightingState.groundNight, lightingState.groundDay, dayStrength);

      const dawnDistance = Math.min(Math.abs(ratio), Math.abs(ratio - 1));
      const duskDistance = Math.abs(ratio - 0.5);
      const duskMix = Math.max(0, 0.22 - Math.min(dawnDistance, duskDistance)) / 0.22;
      tmpColorA.copy(lightingState.nightSky).lerp(lightingState.daySky, dayStrength);
      if (duskMix > 0) {
        tmpColorB.copy(lightingState.duskSky);
        tmpColorA.lerp(tmpColorB, duskMix * 0.6);
      }
      scene.fog.color.copy(tmpColorA);

      if (torchLight) {
        const selectedSlot = state.player?.inventory?.[state.player?.selectedSlot ?? 0];
        const holdingTorch = selectedSlot?.item === 'torch';
        const target = holdingTorch ? 3.4 : 0;
        const lerpAlpha = Math.min(1, delta * 6 + 0.12);
        const baseIntensity = THREE.MathUtils.lerp(torchLight.intensity ?? 0, target, lerpAlpha);
        const flicker = holdingTorch ? (Math.sin(state.elapsed * 22) + Math.sin(state.elapsed * 13.7)) * 0.18 : 0;
        torchLight.intensity = Math.max(0, baseIntensity + flicker);
        torchLight.distance = holdingTorch ? 7.5 : 4;
        torchLight.decay = 1.8;
        torchLight.visible = torchLight.intensity > 0.05;
        torchLight.position.set(
          playerScene.x + playerFacing.x * 0.45,
          playerHeight + 0.65,
          playerScene.z + playerFacing.y * 0.45
        );
      }
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
        atmosphere: {
          daySky: '#bcd7ff',
          nightSky: '#0b1324',
          duskSky: '#f7b07b',
          groundDay: '#1c283f',
          groundNight: '#050912',
          fogColor: '#0b1324',
          fogDensity: 0.055,
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
        atmosphere: {
          daySky: '#9c8b72',
          nightSky: '#1a1111',
          duskSky: '#e2b183',
          groundDay: '#2f1f19',
          groundNight: '#120909',
          fogColor: '#251611',
          fogDensity: 0.082,
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
        atmosphere: {
          daySky: '#8fb4ff',
          nightSky: '#0a1428',
          duskSky: '#8e7eff',
          groundDay: '#1b2d46',
          groundNight: '#080d19',
          fogColor: '#122036',
          fogDensity: 0.06,
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
        atmosphere: {
          daySky: '#6b4c7b',
          nightSky: '#120912',
          duskSky: '#a45d92',
          groundDay: '#2b1531',
          groundNight: '#120718',
          fogColor: '#1c0d21',
          fogDensity: 0.088,
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
        atmosphere: {
          daySky: '#f0ede4',
          nightSky: '#111522',
          duskSky: '#ffd9a1',
          groundDay: '#d9d7cf',
          groundNight: '#1a1d2c',
          fogColor: '#dfd8ce',
          fogDensity: 0.045,
        },
        rules: {
          moveDelay: 0.18,
          onAction: (state, action) => {
            spawnMarbleEchoGhost();
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
        atmosphere: {
          daySky: '#ff9d73',
          nightSky: '#290806',
          duskSky: '#ff6f5b',
          groundDay: '#4a1c12',
          groundNight: '#190606',
          fogColor: '#2b0d07',
          fogDensity: 0.075,
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

    function applyDimensionAtmosphere(dimension) {
      const atmosphere = { ...BASE_ATMOSPHERE, ...(dimension?.atmosphere ?? {}) };
      lightingState.daySky.set(atmosphere.daySky);
      lightingState.nightSky.set(atmosphere.nightSky);
      lightingState.duskSky.set(atmosphere.duskSky);
      lightingState.groundDay.set(atmosphere.groundDay);
      lightingState.groundNight.set(atmosphere.groundNight);
      if (scene?.fog) {
        scene.fog.color.set(atmosphere.fogColor);
        scene.fog.density = atmosphere.fogDensity;
      }
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
      score: 0,
      scoreBreakdown: createScoreBreakdown(),
      scoreSubmitted: false,
      ui: {
        heartsValue: null,
        airValue: null,
        lastAirUnits: null,
        drowningFadeTimeout: null,
        lastDrowningCueAt: -Infinity,
        lastBubblePopAt: -Infinity,
        respawnActive: false,
        respawnCountdownTimeout: null,
        dimensionTransition: null,
      },
    };

    resetStatusMeterMemory();
    initRenderer();
    updateScoreOverlay();

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

    function createScoreBreakdown() {
      return {
        recipes: new Set(),
        dimensions: new Set(),
      };
    }

    function resetScoreTracking(options = {}) {
      state.scoreBreakdown = createScoreBreakdown();
      state.score = 0;
      updateScoreOverlay(options);
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
      updateCraftingInventoryOverlay(combined);
    }

    function mergeInventory() {
      const map = new Map();
      [...state.player.inventory, ...state.player.satchel].forEach((entry) => {
        if (!entry) return;
        map.set(entry.item, (map.get(entry.item) ?? 0) + entry.quantity);
      });
      return Array.from(map.entries()).map(([item, quantity]) => ({ item, quantity }));
    }

    function updateCraftingInventoryOverlay(fromCombined) {
      if (!craftingInventoryEl) return;
      const combined = Array.isArray(fromCombined) ? fromCombined : mergeInventory();
      craftingInventoryEl.innerHTML = '';
      if (!combined.length) {
        const empty = document.createElement('p');
        empty.className = 'crafting-inventory__empty';
        empty.textContent = 'Gather resources to populate your satchel.';
        craftingInventoryEl.appendChild(empty);
        return;
      }
      combined.forEach((bundle) => {
        const { item, quantity } = bundle;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'crafting-inventory__item';
        button.setAttribute('data-item-id', item);
        button.innerHTML = `
          <span class="crafting-inventory__item-title">${ITEM_DEFS[item]?.name ?? item}</span>
          <span class="crafting-inventory__item-quantity">Available ×${quantity}</span>
        `;
        button.setAttribute('aria-label', `${ITEM_DEFS[item]?.name ?? item} available ×${quantity}. Drag to sequence or click to add.`);
        button.addEventListener('pointerdown', (event) => beginInventoryDrag(event, item, quantity));
        button.addEventListener('click', () => {
          if (inventoryClickBypass.has(button)) {
            inventoryClickBypass.delete(button);
            return;
          }
          addToCraftSequence(item);
        });
        craftingInventoryEl.appendChild(button);
      });
    }

    function resetStatusMeterMemory() {
      state.ui.heartsValue = state.player.hearts;
      state.ui.airValue = state.player.air;
      state.ui.lastAirUnits = Math.ceil(state.player.air);
    }

    function updateStatusBars() {
      if (!heartsEl || !bubblesEl || !timeEl) return;

      const previousHearts = state.ui.heartsValue ?? state.player.maxHearts;
      const previousAir = state.ui.airValue ?? state.player.maxAir;

      heartsEl.innerHTML = '';
      const hearts = document.createElement('div');
      hearts.className = 'meter meter--stacked';
      const heartDelta = state.player.hearts - previousHearts;
      if (heartDelta < -0.01) {
        hearts.classList.add('meter--damage');
      } else if (heartDelta > 0.01) {
        hearts.classList.add('meter--regen');
      }
      const heartCriticalThreshold = Math.max(2, state.player.maxHearts * 0.2);
      if (state.player.hearts <= heartCriticalThreshold) {
        hearts.classList.add('meter--critical');
      }
      for (let i = 0; i < state.player.maxHearts; i++) {
        const el = document.createElement('span');
        el.className = 'heart';
        const fill = clamp(state.player.hearts - i, 0, 1);
        el.style.setProperty('--fill', fill.toFixed(2));
        if (fill <= 0) {
          el.classList.add('empty');
        } else if (fill < 1) {
          el.classList.add('partial');
        }
        hearts.appendChild(el);
      }
      heartsEl.appendChild(hearts);

      bubblesEl.innerHTML = '';
      const bubbles = document.createElement('div');
      bubbles.className = 'meter meter--stacked';
      const airDelta = state.player.air - previousAir;
      if (airDelta < -0.05) {
        bubbles.classList.add('meter--damage');
      } else if (airDelta > 0.05) {
        bubbles.classList.add('meter--regen');
      }
      const airLowThreshold = Math.max(2, state.player.maxAir * 0.2);
      if (state.player.air <= airLowThreshold) {
        bubbles.classList.add('meter--low');
      }
      if (state.player.air <= 0) {
        bubbles.classList.add('meter--drowning');
      }
      for (let i = 0; i < state.player.maxAir; i++) {
        const el = document.createElement('span');
        el.className = 'bubble';
        const fill = clamp(state.player.air - i, 0, 1);
        el.style.setProperty('--fill', fill.toFixed(2));
        if (fill <= 0) {
          el.classList.add('empty');
        } else if (fill < 1) {
          el.classList.add('partial');
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

      state.ui.heartsValue = state.player.hearts;
      state.ui.airValue = state.player.air;
      state.ui.lastAirUnits = Math.ceil(state.player.air);
    }

    function updateScoreOverlay(options = {}) {
      if (!scoreTotalEl || !scoreRecipesEl || !scoreDimensionsEl) return;

      initializeScoreOverlayUI();

      const recipeCount = state.scoreBreakdown?.recipes?.size ?? 0;
      const dimensionCount = state.scoreBreakdown?.dimensions?.size ?? 0;
      const recipePoints = recipeCount * SCORE_POINTS.recipe;
      const dimensionPoints = dimensionCount * SCORE_POINTS.dimension;
      state.score = recipePoints + dimensionPoints;

      animateScoreDigits(scoreTotalEl, state.score);
      animateMetricUpdate(scoreRecipesEl, `${recipeCount} (+${recipePoints} pts)`);
      animateMetricUpdate(scoreDimensionsEl, `${dimensionCount} (+${dimensionPoints} pts)`);
      if (scorePanelEl) {
        scorePanelEl.setAttribute('data-score', state.score.toString());
        if (options.flash) {
          scorePanelEl.classList.remove('score-overlay--flash');
          void scorePanelEl.offsetWidth;
          scorePanelEl.classList.add('score-overlay--flash');
        } else {
          scorePanelEl.classList.remove('score-overlay--flash');
        }
      }
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
      if (state.isRunning) return;
      const context = ensureAudioContext();
      context?.resume?.().catch(() => {});
      if (window.Howler?.ctx?.state === 'suspended') {
        window.Howler.ctx.resume().catch(() => {});
      }
      setDimensionTransitionOverlay(false);
      state.ui.dimensionTransition = null;
      clearMarbleGhosts();
      if (introModal) {
        introModal.hidden = true;
        introModal.setAttribute('aria-hidden', 'true');
        introModal.style.display = 'none';
      }
      if (startButton) {
        startButton.disabled = true;
        startButton.setAttribute('aria-hidden', 'true');
        startButton.setAttribute('tabindex', '-1');
        startButton.blur();
      }
      canvas?.focus();
      document.body?.classList.add('game-active');
      resetHudInactivityTimer();
      updateLayoutMetrics();
      state.isRunning = true;
      state.player.effects = {};
      state.victory = false;
      state.scoreSubmitted = false;
      state.dimensionHistory = ['origin'];
      state.unlockedDimensions = new Set(['origin']);
      state.knownRecipes = new Set(['stick', 'stone-pickaxe']);
      resetScoreTracking();
      state.player.inventory = Array.from({ length: 10 }, () => null);
      state.player.satchel = [];
      state.player.selectedSlot = 0;
      state.craftSequence = [];
      renderVictoryBanner();
      loadDimension('origin');
      resetStatusMeterMemory();
      updateInventoryUI();
      updateRecipesList();
      updateCraftSequenceDisplay();
      updateAutocompleteSuggestions();
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
          const preferredScheme = prefersTouchControls() ? 'touch' : 'desktop';
          showPlayerHint(null, {
            html: createControlsHintMarkup(preferredScheme),
            variant: 'controls',
            persist: true,
          });
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
      if (id !== 'origin') {
        if (!state.scoreBreakdown.dimensions.has(id)) {
          state.scoreBreakdown.dimensions.add(id);
          logEvent(`${dim.name} documented as explored (+${SCORE_POINTS.dimension} pts).`);
          updateScoreOverlay({ flash: true });
        } else {
          updateScoreOverlay();
        }
      } else {
        updateScoreOverlay();
      }
      applyDimensionTheme(dim);
      applyDimensionAtmosphere(dim);
      document.title = `Infinite Dimension · ${dim.name}`;
      state.world = dim.generator(state);
      resetWorldMeshes();
      state.player.x = Math.floor(state.width / 2);
      state.player.y = Math.floor(state.height / 2);
      state.player.facing = { x: 0, y: 1 };
      state.portals = [];
      state.zombies = [];
      state.ironGolems = [];
      clearMarbleGhosts();
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
      syncCameraToPlayer({ idleBob: 0, walkBob: 0, movementStrength: 0, facing: state.player.facing });
      updateLighting(0);
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
      updateAutocompleteSuggestions();
      updatePortalProgress();
      deployIronGolems();
      if (!state.ui.respawnActive) {
        resetStatusMeterMemory();
      }
      updateStatusBars();
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
      updatePortalActivation();
      updateStatusBars();
      updatePortalProgress();
      updateLighting(delta);
      advanceParticles(delta);
      updateDimensionTransition(delta);
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
        const previousAir = state.player.air;
        const previousUnits = Math.ceil(previousAir);
        state.player.air = Math.max(0, state.player.air - delta * 2);
        const currentUnits = Math.ceil(state.player.air);
        if (currentUnits < previousUnits) {
          triggerDrowningCue();
        }
        if (state.player.air === 0) {
          if (state.elapsed - state.ui.lastDrowningCueAt > 0.9) {
            triggerDrowningCue();
          }
          applyDamage(0.5 * delta * 5);
        }
      } else {
        const previousAir = state.player.air;
        state.player.air = clamp(state.player.air + delta * 3, 0, state.player.maxAir);
        if (state.player.air > previousAir && drowningVignetteEl) {
          drowningVignetteEl.setAttribute('data-active', 'false');
          drowningVignetteEl.classList.remove('drowning-vignette--flash');
        }
      }
      state.ui.lastAirUnits = Math.ceil(state.player.air);
    }

    function triggerDrowningCue() {
      state.ui.lastDrowningCueAt = state.elapsed;
      flashDrowningVignette();
      playBubblePop();
    }

    function flashDrowningVignette() {
      if (!drowningVignetteEl) return;
      drowningVignetteEl.setAttribute('data-active', 'true');
      drowningVignetteEl.classList.remove('drowning-vignette--flash');
      void drowningVignetteEl.offsetWidth;
      drowningVignetteEl.classList.add('drowning-vignette--flash');
      if (state.ui.drowningFadeTimeout) {
        window.clearTimeout(state.ui.drowningFadeTimeout);
      }
      state.ui.drowningFadeTimeout = window.setTimeout(() => {
        drowningVignetteEl?.setAttribute('data-active', 'false');
        drowningVignetteEl?.classList.remove('drowning-vignette--flash');
      }, 800);
    }

    function ensureAudioContext() {
      if (audioState.context) return audioState.context;
      const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextCtor) return null;
      try {
        audioState.context = new AudioContextCtor();
      } catch (error) {
        console.warn('Unable to initialise audio context.', error);
        audioState.context = null;
      }
      return audioState.context;
    }

    function playBubblePop() {
      if (state.elapsed - state.ui.lastBubblePopAt < 0.45) return;
      state.ui.lastBubblePopAt = state.elapsed;
      if (audioState.effects?.bubble) {
        playHowlInstance(audioState.effects.bubble);
        return;
      }
      playFallbackEffect({ startFreq: 720, endFreq: 240, duration: 0.45, type: 'triangle', peak: 0.18 });
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

    function handlePlayerDefeat(message, options = {}) {
      if (state.victory || state.ui.respawnActive) return;
      logEvent(message);
      state.isRunning = false;
      state.ui.respawnActive = true;
      const snapshot = captureInventorySnapshot();
      showDefeatOverlay({
        message,
        items: snapshot,
        countdown: options.countdown ?? 4,
      });
    }

    function captureInventorySnapshot(limit = 8) {
      try {
        const bundles = mergeInventory().filter((entry) => entry && entry.quantity > 0);
        bundles.sort((a, b) => b.quantity - a.quantity);
        return bundles.slice(0, limit);
      } catch (error) {
        console.warn('Unable to capture inventory snapshot.', error);
        return [];
      }
    }

    function getItemDisplayName(itemId) {
      return ITEM_DEFS[itemId]?.name ?? itemId.replace(/-/g, ' ');
    }

    function showDefeatOverlay({ message, items, countdown }) {
      const duration = Math.max(3, Math.floor(Number.isFinite(countdown) ? countdown : 4));
      if (!defeatOverlayEl) {
        state.ui.respawnCountdownTimeout = window.setTimeout(() => completeRespawn(), duration * 1000);
        return;
      }
      defeatOverlayEl.setAttribute('data-visible', 'true');
      defeatOverlayEl.setAttribute('aria-hidden', 'false');
      if (defeatMessageEl) {
        defeatMessageEl.textContent = message;
      }
      renderDefeatInventory(items);
      if (defeatCountdownEl) {
        defeatCountdownEl.textContent = '';
      }
      window.clearTimeout(state.ui.respawnCountdownTimeout);
      window.requestAnimationFrame(() => {
        defeatOverlayEl?.focus({ preventScroll: true });
      });
      startRespawnCountdown(duration);
    }

    function renderDefeatInventory(items = []) {
      if (!defeatInventoryEl) return;
      defeatInventoryEl.innerHTML = '';
      if (!items.length) {
        defeatInventoryEl.dataset.empty = 'true';
        defeatInventoryEl.textContent = 'You drop nothing as the realm resets.';
        return;
      }
      delete defeatInventoryEl.dataset.empty;
      const label = document.createElement('p');
      label.className = 'defeat-overlay__inventory-label';
      label.textContent = 'Inventory Snapshot';
      const list = document.createElement('ul');
      list.className = 'defeat-overlay__inventory-list';
      items.forEach((entry) => {
        const li = document.createElement('li');
        li.className = 'defeat-overlay__inventory-item';
        const name = document.createElement('span');
        name.textContent = getItemDisplayName(entry.item);
        const qty = document.createElement('span');
        qty.textContent = `×${entry.quantity}`;
        li.append(name, qty);
        list.appendChild(li);
      });
      defeatInventoryEl.append(label, list);
    }

    function startRespawnCountdown(seconds) {
      const duration = Math.max(0, Math.floor(seconds));
      if (!defeatCountdownEl) {
        state.ui.respawnCountdownTimeout = window.setTimeout(() => completeRespawn(), duration * 1000);
        return;
      }
      let remaining = duration;
      const tick = () => {
        if (remaining > 0) {
          defeatCountdownEl.textContent = `Respawning in ${remaining}s`;
        } else {
          defeatCountdownEl.textContent = 'Respawning...';
        }
        if (remaining <= 0) {
          completeRespawn();
          return;
        }
        remaining -= 1;
        state.ui.respawnCountdownTimeout = window.setTimeout(tick, 1000);
      };
      tick();
    }

    function completeRespawn() {
      if (!state.ui.respawnActive) return;
      if (state.ui.respawnCountdownTimeout) {
        window.clearTimeout(state.ui.respawnCountdownTimeout);
        state.ui.respawnCountdownTimeout = null;
      }
      state.player.hearts = state.player.maxHearts;
      state.player.air = state.player.maxAir;
      state.player.zombieHits = 0;
      loadDimension('origin');
      updateStatusBars();
      if (drowningVignetteEl) {
        drowningVignetteEl.setAttribute('data-active', 'false');
        drowningVignetteEl.classList.remove('drowning-vignette--flash');
      }
      if (state.ui.drowningFadeTimeout) {
        window.clearTimeout(state.ui.drowningFadeTimeout);
        state.ui.drowningFadeTimeout = null;
      }
      state.isRunning = true;
      state.ui.respawnActive = false;
      logEvent('You rematerialise at the Grassland Threshold.');
      window.setTimeout(() => hideDefeatOverlay(), 420);
    }

    function hideDefeatOverlay() {
      if (!defeatOverlayEl) return;
      defeatOverlayEl.setAttribute('data-visible', 'false');
      defeatOverlayEl.setAttribute('aria-hidden', 'true');
      defeatOverlayEl.blur();
      if (defeatMessageEl) defeatMessageEl.textContent = '';
      if (defeatCountdownEl) defeatCountdownEl.textContent = '';
      if (defeatInventoryEl) {
        defeatInventoryEl.innerHTML = '';
        delete defeatInventoryEl.dataset.empty;
      }
    }

    function applyDamage(amount) {
      state.player.hearts = clamp(state.player.hearts - amount, 0, state.player.maxHearts);
      if (state.player.hearts <= 0 && !state.victory) {
        handlePlayerDefeat('You collapse. Echoes rebuild the realm...');
      }
    }

    function getTile(x, y) {
      if (x < 0 || y < 0 || x >= state.width || y >= state.height) return null;
      return state.world?.[y]?.[x] ?? null;
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
      if (state.ui.respawnActive) return;
      if (state.ui.dimensionTransition) return;
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
      if (state.ui.respawnActive) return;
      if (state.ui.dimensionTransition) return;
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
      const originalType = tile.type;
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
      const accentColor = TILE_TYPES[originalType]?.accent ?? '#ffffff';
      spawnHarvestParticles(x, y, accentColor);
      playHarvestAudio(itemId);
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

    function ensurePortalState(tile) {
      if (!tile) return null;
      if (!tile.portalState) {
        tile.portalState = { activation: 0, transition: 0 };
      }
      return tile.portalState;
    }

    function setDimensionTransitionOverlay(active) {
      if (!dimensionTransitionEl) return;
      if (active) {
        dimensionTransitionEl.setAttribute('data-active', 'true');
      } else {
        dimensionTransitionEl.setAttribute('data-active', 'false');
        dimensionTransitionEl.style.setProperty('--build', '0');
        dimensionTransitionEl.style.setProperty('--fade', '0');
      }
    }

    function updateTransitionOverlay(build, fade) {
      if (!dimensionTransitionEl) return;
      const clampedBuild = Number.isFinite(build) ? THREE.MathUtils.clamp(build, 0, 1) : 0;
      const clampedFade = Number.isFinite(fade) ? THREE.MathUtils.clamp(fade, 0, 1) : 0;
      dimensionTransitionEl.style.setProperty('--build', clampedBuild.toFixed(3));
      dimensionTransitionEl.style.setProperty('--fade', clampedFade.toFixed(3));
    }

    function beginDimensionTransition(portal, fromId, toId) {
      if (!portal || !toId) return;
      if (state.ui.dimensionTransition) return;
      const portalTiles = portal.tiles
        .map(({ x, y }) => ({ x, y, tile: getTile(x, y) }))
        .filter((entry) => entry.tile);
      portalTiles.forEach(({ tile }) => {
        const portalState = ensurePortalState(tile);
        if (portalState) {
          portalState.transition = 0;
        }
      });
      state.ui.dimensionTransition = {
        portal,
        from: fromId,
        to: toId,
        stage: 'build',
        stageStart: state.elapsed,
        portalTiles,
        loaded: false,
      };
      setDimensionTransitionOverlay(true);
      updateTransitionOverlay(0, 0);
      logEvent(`Stabilising bridge to ${DIMENSIONS[toId]?.name ?? toId}...`);
    }

    function clearTransitionPortalTiles(transition) {
      if (!transition?.portalTiles) return;
      transition.portalTiles.forEach(({ tile }) => {
        const portalState = ensurePortalState(tile);
        if (portalState) {
          portalState.transition = 0;
        }
      });
      transition.portalTiles = [];
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
        const tile = getTile(x, y);
        const activation = tile?.portalState?.activation ?? 0;
        if (activation < 0.99) {
          logEvent('Portal is calibrating. Give it a moment to stabilise.');
        } else {
          logEvent('Portal is dormant. Ignite it first.');
        }
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
      if (state.ui.dimensionTransition) {
        return;
      }
      const currentId = state.dimension.id;
      let targetId = null;
      if (currentId === portal.origin && portal.destination) {
        targetId = portal.destination;
      } else if (currentId === portal.destination && portal.origin) {
        targetId = portal.origin;
      }
      if (targetId) {
        beginDimensionTransition(portal, currentId, targetId);
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
      if (frame.activation) {
        logEvent('Portal is already igniting.');
        return;
      }
      frame.active = false;
      frame.activation = { start: state.elapsed, duration: PORTAL_ACTIVATION_DURATION };
      frame.announcedActive = false;
      if (hasItem('portal-igniter')) removeItem('portal-igniter', 1);
      else removeItem('torch', 1);
      frame.tiles.forEach(({ x: tx, y: ty }) => {
        const tile = getTile(tx, ty);
        if (tile) {
          tile.type = 'portal';
          const portalState = ensurePortalState(tile);
          if (portalState) {
            portalState.activation = 0;
            portalState.transition = 0;
          }
        }
      });
      logEvent(`${frame.label} begins to awaken.`);
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
        activation: null,
        announcedActive: false,
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
        if (tile) {
          tile.type = 'portalDormant';
          const portalState = ensurePortalState(tile);
          if (portalState) {
            portalState.activation = 0;
            portalState.transition = 0;
          }
        }
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
        if (tile) {
          tile.type = 'portal';
          const portalState = ensurePortalState(tile);
          if (portalState) {
            portalState.activation = 1;
            portalState.transition = 0;
          }
        }
      });
      state.portals.push({
        material: targetDimension,
        frame,
        tiles,
        active: true,
        activation: null,
        announcedActive: true,
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

    function updatePortalActivation() {
      if (!state.portals.length) return;
      const now = state.elapsed;
      for (const portal of state.portals) {
        if (portal.activation) {
          const duration = portal.activation.duration ?? PORTAL_ACTIVATION_DURATION;
          const progress = duration > 0 ? THREE.MathUtils.clamp((now - portal.activation.start) / duration, 0, 1) : 1;
          portal.activation.progress = progress;
          portal.tiles.forEach(({ x, y }) => {
            const tile = getTile(x, y);
            if (!tile) return;
            const portalState = ensurePortalState(tile);
            if (portalState) {
              portalState.activation = progress;
            }
            tile.type = 'portal';
          });
          if (progress >= 1) {
            portal.active = true;
            portal.activation = null;
            portal.tiles.forEach(({ x, y }) => {
              const tile = getTile(x, y);
              if (!tile) return;
              const portalState = ensurePortalState(tile);
              if (portalState) {
                portalState.activation = 1;
              }
            });
            if (!portal.announcedActive) {
              logEvent(`${portal.label} stabilises.`);
              portal.announcedActive = true;
            }
          }
        } else if (portal.active) {
          portal.tiles.forEach(({ x, y }) => {
            const tile = getTile(x, y);
            if (!tile) return;
            const portalState = ensurePortalState(tile);
            if (portalState) {
              portalState.activation = Math.max(portalState.activation ?? 1, 1);
            }
          });
        }
      }
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

    function updateDimensionTransition(delta) {
      const transition = state.ui.dimensionTransition;
      if (!transition) return;
      const now = state.elapsed;
      if (transition.stage === 'build') {
        const progress = Math.min(1, (now - transition.stageStart) / PORTAL_TRANSITION_BUILDUP);
        transition.progress = progress;
        transition.portalTiles?.forEach(({ tile }) => {
          const portalState = ensurePortalState(tile);
          if (portalState) {
            portalState.transition = progress;
          }
        });
        updateTransitionOverlay(progress, 0);
        if (progress >= 1) {
          transition.stage = 'fade-out';
          transition.stageStart = now;
        }
        return;
      }
      if (transition.stage === 'fade-out') {
        const progress = Math.min(1, (now - transition.stageStart) / PORTAL_TRANSITION_FADE);
        updateTransitionOverlay(1, progress);
        if (progress >= 1 && !transition.loaded) {
          clearTransitionPortalTiles(transition);
          transition.loaded = true;
          const targetId = transition.to;
          const fromId = transition.from;
          loadDimension(targetId, fromId);
          transition.stage = 'fade-in';
          transition.stageStart = state.elapsed;
          updateTransitionOverlay(0, 1);
        }
        return;
      }
      if (transition.stage === 'fade-in') {
        const progress = Math.min(1, (now - transition.stageStart) / PORTAL_TRANSITION_FADE);
        updateTransitionOverlay(0, Math.max(0, 1 - progress));
        if (progress >= 1) {
          setDimensionTransitionOverlay(false);
          state.ui.dimensionTransition = null;
        }
      }
    }

    function ensureCraftingDragElements() {
      if (!craftingDragGhost) {
        craftingDragGhost = document.createElement('div');
        craftingDragGhost.className = 'crafting-drag-ghost';
        craftingDragGhost.setAttribute('aria-hidden', 'true');
        document.body.appendChild(craftingDragGhost);
      }
      if (!craftingDragTrailEl) {
        craftingDragTrailEl = document.createElement('div');
        craftingDragTrailEl.className = 'crafting-drag-trail';
        craftingDragTrailEl.setAttribute('aria-hidden', 'true');
        document.body.appendChild(craftingDragTrailEl);
      }
    }

    function showCraftingDragGhost(itemId, available, x, y) {
      ensureCraftingDragElements();
      if (!craftingDragGhost) return;
      const name = ITEM_DEFS[itemId]?.name ?? itemId;
      craftingDragGhost.innerHTML = '';
      const title = document.createElement('span');
      title.className = 'crafting-drag-ghost__title';
      title.textContent = name;
      const quantity = document.createElement('span');
      quantity.className = 'crafting-drag-ghost__quantity';
      quantity.textContent = `Available ×${available}`;
      craftingDragGhost.append(title, quantity);
      craftingDragGhost.dataset.visible = 'true';
      positionCraftingDragGhost(x, y);
    }

    function positionCraftingDragGhost(x, y) {
      if (!craftingDragGhost) return;
      craftingDragGhost.style.left = `${x}px`;
      craftingDragGhost.style.top = `${y}px`;
    }

    function spawnCraftingDragTrail(x, y) {
      if (!craftingDragTrailEl) return;
      const particle = document.createElement('span');
      particle.className = 'crafting-drag-trail__particle';
      particle.style.left = `${x}px`;
      particle.style.top = `${y}px`;
      craftingDragTrailEl.appendChild(particle);
      window.setTimeout(() => {
        particle.remove();
      }, 420);
    }

    function clearCraftingDragElements() {
      craftingDragGhost?.removeAttribute('data-visible');
      craftingDragTrailEl?.replaceChildren();
      document.body.removeAttribute('data-crafting-drag');
    }

    function determineFallbackSlotIndex() {
      const emptyIndex = craftSlots.findIndex(({ button }) => button.classList.contains('empty'));
      if (emptyIndex !== -1) return emptyIndex;
      if (state.craftSequence.length > 0) {
        return Math.min(state.craftSequence.length - 1, MAX_CRAFT_SLOTS - 1);
      }
      return 0;
    }

    function updateCraftSlotDragHighlight(index) {
      craftSlots.forEach(({ button }) => button.classList.remove('craft-slot--target'));
      const resolvedIndex = typeof index === 'number' && !Number.isNaN(index) ? index : dragFallbackSlotIndex;
      if (typeof resolvedIndex === 'number' && resolvedIndex >= 0 && resolvedIndex < craftSlots.length) {
        craftSlots[resolvedIndex]?.button.classList.add('craft-slot--target');
      }
    }

    function clearCraftSlotDragHighlight() {
      craftSlots.forEach(({ button }) => button.classList.remove('craft-slot--target'));
      dragFallbackSlotIndex = null;
    }

    function beginInventoryDrag(event, itemId, availableQuantity) {
      if (!craftSequenceEl) return;
      ensureCraftingDragElements();
      activeInventoryDrag = {
        pointerId: event.pointerId,
        itemId,
        available: availableQuantity,
        sourceEl: event.currentTarget,
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
      };
      if (event.currentTarget instanceof HTMLElement) {
        event.currentTarget.dataset.active = 'true';
      }
      dragFallbackSlotIndex = determineFallbackSlotIndex();
      showCraftingDragGhost(itemId, availableQuantity, event.clientX, event.clientY);
      document.body.dataset.craftingDrag = 'true';
      updateCraftSlotDragHighlight(null);
      if (typeof event.currentTarget.setPointerCapture === 'function') {
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch (error) {
          console.warn('Unable to set pointer capture for crafting drag.', error);
        }
      }
      window.addEventListener('pointermove', handleInventoryDragMove);
      window.addEventListener('pointerup', handleInventoryDragEnd);
      window.addEventListener('pointercancel', handleInventoryDragEnd);
    }

    function handleInventoryDragMove(event) {
      if (!activeInventoryDrag || event.pointerId !== activeInventoryDrag.pointerId) return;
      const dx = event.clientX - activeInventoryDrag.startX;
      const dy = event.clientY - activeInventoryDrag.startY;
      if (!activeInventoryDrag.moved && Math.hypot(dx, dy) > 6) {
        activeInventoryDrag.moved = true;
      }
      positionCraftingDragGhost(event.clientX, event.clientY);
      spawnCraftingDragTrail(event.clientX, event.clientY);
      const hoveredElement = document.elementFromPoint(event.clientX, event.clientY);
      const slotEl = hoveredElement?.closest('[data-craft-slot]');
      if (slotEl) {
        const slotIndex = Number(slotEl.dataset.craftSlot);
        if (!Number.isNaN(slotIndex)) {
          updateCraftSlotDragHighlight(slotIndex);
          return;
        }
      }
      if (hoveredElement?.closest('.crafting-sequence')) {
        updateCraftSlotDragHighlight(dragFallbackSlotIndex);
      } else {
        updateCraftSlotDragHighlight(null);
      }
    }

    function handleInventoryDragEnd(event) {
      if (!activeInventoryDrag || event.pointerId !== activeInventoryDrag.pointerId) return;
      const dragContext = activeInventoryDrag;
      activeInventoryDrag = null;
      window.removeEventListener('pointermove', handleInventoryDragMove);
      window.removeEventListener('pointerup', handleInventoryDragEnd);
      window.removeEventListener('pointercancel', handleInventoryDragEnd);
      if (dragContext.sourceEl && typeof dragContext.sourceEl.releasePointerCapture === 'function') {
        try {
          dragContext.sourceEl.releasePointerCapture(event.pointerId);
        } catch (error) {
          console.warn('Unable to release pointer capture for crafting drag.', error);
        }
      }
      if (dragContext.sourceEl instanceof HTMLElement) {
        dragContext.sourceEl.removeAttribute('data-active');
      }
      const dropElement = document.elementFromPoint(event.clientX, event.clientY);
      let dropIndex = null;
      const slotEl = dropElement?.closest('[data-craft-slot]');
      if (slotEl) {
        const slotIndex = Number(slotEl.dataset.craftSlot);
        if (!Number.isNaN(slotIndex)) {
          dropIndex = slotIndex;
        }
      } else if (dropElement?.closest('.crafting-sequence')) {
        dropIndex = dragFallbackSlotIndex;
      }
      let handled = false;
      if (typeof dropIndex === 'number' && dropIndex >= 0) {
        handled = placeItemInCraftSequence(dragContext.itemId, dropIndex);
      } else if (!dragContext.moved) {
        addToCraftSequence(dragContext.itemId);
        handled = true;
      }
      if (handled && dragContext.sourceEl) {
        inventoryClickBypass.add(dragContext.sourceEl);
      }
      clearCraftingDragElements();
      clearCraftSlotDragHighlight();
    }

    function clearCraftSequenceErrorState() {
      if (!craftSequenceEl) return;
      craftSequenceEl.classList.remove('crafting-sequence--error', 'crafting-sequence--shake');
      if (craftSequenceErrorTimeout) {
        window.clearTimeout(craftSequenceErrorTimeout);
        craftSequenceErrorTimeout = null;
      }
    }

    function triggerCraftSequenceError() {
      if (!craftSequenceEl) return;
      craftSequenceEl.classList.add('crafting-sequence--error', 'crafting-sequence--shake');
      if (craftSequenceErrorTimeout) {
        window.clearTimeout(craftSequenceErrorTimeout);
      }
      craftSequenceErrorTimeout = window.setTimeout(() => {
        craftSequenceEl.classList.remove('crafting-sequence--shake');
      }, 450);
    }

    function addToCraftSequence(itemId) {
      if (!craftSequenceEl) return;
      if (state.craftSequence.length >= MAX_CRAFT_SLOTS) {
        logEvent('Sequence is full. Craft or clear before adding more steps.');
        triggerCraftSequenceError();
        return;
      }
      clearCraftSequenceErrorState();
      state.craftSequence.push(itemId);
      updateCraftSequenceDisplay();
    }

    function placeItemInCraftSequence(itemId, slotIndex) {
      if (!craftSequenceEl) return false;
      if (slotIndex < 0 || slotIndex >= MAX_CRAFT_SLOTS) return false;
      clearCraftSequenceErrorState();
      if (slotIndex < state.craftSequence.length) {
        state.craftSequence[slotIndex] = itemId;
      } else {
        if (state.craftSequence.length >= MAX_CRAFT_SLOTS) {
          triggerCraftSequenceError();
          return false;
        }
        state.craftSequence.push(itemId);
      }
      updateCraftSequenceDisplay();
      return true;
    }

    function initializeCraftSlots() {
      if (!craftSequenceEl) return;
      craftSequenceEl.innerHTML = '';
      craftSlots.length = 0;
      const slotCount = Number(craftSequenceEl.dataset.slotCount) || MAX_CRAFT_SLOTS;
      for (let i = 0; i < Math.min(slotCount, MAX_CRAFT_SLOTS); i++) {
        const slotButton = document.createElement('button');
        slotButton.type = 'button';
        slotButton.className = 'craft-slot empty';
        slotButton.dataset.craftSlot = i.toString();
        const indexLabel = document.createElement('span');
        indexLabel.className = 'craft-slot__index';
        indexLabel.textContent = String(i + 1);
        const contentLabel = document.createElement('span');
        contentLabel.className = 'craft-slot__label';
        contentLabel.textContent = 'Empty';
        slotButton.append(indexLabel, contentLabel);
        slotButton.addEventListener('click', () => {
          if (state.craftSequence.length <= i) return;
          state.craftSequence.splice(i, 1);
          clearCraftSequenceErrorState();
          updateCraftSequenceDisplay();
        });
        craftSequenceEl.appendChild(slotButton);
        craftSlots.push({ button: slotButton, label: contentLabel });
      }
      updateCraftSequenceDisplay();
    }

    function updateCraftSequenceDisplay() {
      if (!craftSequenceEl || !craftSlots.length) return;
      const sequenceLength = state.craftSequence.length;
      craftSequenceEl.classList.remove('crafting-sequence--shake');
      craftSlots.forEach(({ button, label }, index) => {
        const itemId = state.craftSequence[index];
        if (itemId) {
          const itemName = ITEM_DEFS[itemId]?.name ?? itemId;
          button.classList.add('filled');
          button.classList.remove('empty');
          label.textContent = itemName;
          button.setAttribute('aria-label', `${itemName} in slot ${index + 1}. Click to remove.`);
        } else {
          button.classList.remove('filled');
          button.classList.add('empty');
          label.textContent = 'Empty';
          button.setAttribute('aria-label', `Empty slot ${index + 1}`);
        }
      });
      craftSequenceEl.classList.toggle('full', sequenceLength >= MAX_CRAFT_SLOTS);
      if (craftButton) {
        craftButton.disabled = sequenceLength === 0;
      }
      if (craftLauncherButton) {
        craftLauncherButton.setAttribute('data-sequence', sequenceLength > 0 ? 'active' : 'idle');
      }
      if (activeInventoryDrag) {
        dragFallbackSlotIndex = determineFallbackSlotIndex();
        updateCraftSlotDragHighlight(null);
      } else {
        clearCraftSlotDragHighlight();
      }
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
        triggerCraftSequenceError();
        return;
      }
      const canCraft = recipe.sequence.every((itemId) => hasItem(itemId));
      if (!canCraft) {
        logEvent('Missing ingredients for this recipe.');
        triggerCraftSequenceError();
        return;
      }
      clearCraftSequenceErrorState();
      recipe.sequence.forEach((itemId) => removeItem(itemId, 1));
      addItemToInventory(recipe.output.item, recipe.output.quantity);
      const recipePreviouslyKnown = state.knownRecipes.has(recipe.id);
      state.knownRecipes.add(recipe.id);
      logEvent(`${recipe.name} crafted.`);
      triggerCraftConfetti();
      if (!recipePreviouslyKnown && !state.scoreBreakdown.recipes.has(recipe.id)) {
        state.scoreBreakdown.recipes.add(recipe.id);
        logEvent(`Recipe mastery recorded (+${SCORE_POINTS.recipe} pts).`);
        updateScoreOverlay({ flash: true });
      } else {
        updateScoreOverlay();
      }
      if (recipe.output.item === 'portal-igniter') {
        state.player.hasIgniter = true;
      }
      state.craftSequence = [];
      updateCraftSequenceDisplay();
      updateRecipesList();
      updateAutocompleteSuggestions();
    }

    function updateRecipesList() {
      if (!recipeListEl) return;
      recipeListEl.innerHTML = '';
      const query = recipeSearchEl?.value?.trim().toLowerCase() ?? '';
      const unlockedRecipes = RECIPES.filter((recipe) => state.unlockedDimensions.has(recipe.unlock));
      const filtered = unlockedRecipes.filter((recipe) => {
        if (!query) return true;
        const name = recipe.name.toLowerCase();
        const outputName = (ITEM_DEFS[recipe.output.item]?.name ?? recipe.output.item).toLowerCase();
        if (name.includes(query) || outputName.includes(query)) return true;
        return recipe.sequence.some((itemId) => (ITEM_DEFS[itemId]?.name ?? itemId).toLowerCase().includes(query));
      });
      if (!filtered.length) {
        const empty = document.createElement('div');
        empty.className = 'recipe-empty';
        empty.textContent = query
          ? 'No recipes match your search. Try another ingredient.'
          : 'Unlock new dimensions to discover more recipes.';
        recipeListEl.appendChild(empty);
        return;
      }
      filtered.forEach((recipe) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'recipe-card';
        if (state.knownRecipes.has(recipe.id)) {
          button.classList.add('known');
        }
        button.innerHTML = `
          <span class="recipe-card__name">${recipe.name}</span>
          <span class="recipe-card__sequence">${recipe.sequence
            .map((item) => ITEM_DEFS[item]?.name ?? item)
            .join(' → ')}</span>
          <span class="recipe-card__output">Creates ${
            ITEM_DEFS[recipe.output.item]?.name ?? recipe.output.item
          } ×${recipe.output.quantity}</span>
        `;
        button.addEventListener('click', () => {
          state.craftSequence = [...recipe.sequence];
          updateCraftSequenceDisplay();
        });
        recipeListEl.appendChild(button);
      });
    }

    function updateAutocompleteSuggestions() {
      if (!craftSuggestionsEl) return;
      const query = recipeSearchEl?.value?.trim().toLowerCase() ?? '';
      craftSuggestionsEl.innerHTML = '';
      if (!query) {
        craftSuggestionsEl.setAttribute('data-visible', 'false');
        if (craftingSearchPanel?.getAttribute('data-open') === 'true') {
          updateCraftingSearchPanelResults();
        }
        return;
      }
      const matches = RECIPES.filter((recipe) => {
        if (!state.unlockedDimensions.has(recipe.unlock)) return false;
        const name = recipe.name.toLowerCase();
        if (name.includes(query)) return true;
        const outputName = (ITEM_DEFS[recipe.output.item]?.name ?? recipe.output.item).toLowerCase();
        if (outputName.includes(query)) return true;
        return recipe.sequence.some((itemId) => (ITEM_DEFS[itemId]?.name ?? itemId).toLowerCase().includes(query));
      }).slice(0, 6);
      if (!matches.length) {
        craftSuggestionsEl.setAttribute('data-visible', 'false');
        return;
      }
      matches.forEach((recipe) => {
        const entry = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = recipe.name;
        button.addEventListener('click', () => {
          state.craftSequence = [...recipe.sequence];
          recipeSearchEl.value = recipe.name;
          updateCraftSequenceDisplay();
          updateRecipesList();
          updateAutocompleteSuggestions();
        });
        entry.appendChild(button);
        craftSuggestionsEl.appendChild(entry);
      });
      craftSuggestionsEl.setAttribute('data-visible', 'true');
      if (craftingSearchPanel?.getAttribute('data-open') === 'true') {
        updateCraftingSearchPanelResults();
      }
    }

    function openCraftingSearchPanel() {
      if (!craftingSearchPanel) return;
      craftingSearchPanel.hidden = false;
      craftingSearchPanel.setAttribute('data-open', 'true');
      craftingSearchPanel.setAttribute('aria-hidden', 'false');
      if (craftingSearchInput) {
        craftingSearchInput.value = recipeSearchEl?.value ?? '';
      }
      updateCraftingSearchPanelResults();
      window.setTimeout(() => craftingSearchInput?.focus(), 0);
    }

    function closeCraftingSearchPanel(shouldFocusTrigger = false) {
      if (!craftingSearchPanel) return;
      craftingSearchPanel.hidden = true;
      craftingSearchPanel.setAttribute('data-open', 'false');
      craftingSearchPanel.setAttribute('aria-hidden', 'true');
      if (shouldFocusTrigger) {
        openCraftingSearchButton?.focus();
      }
    }

    function updateCraftingSearchPanelResults() {
      if (!craftingSearchResultsEl) return;
      const query = craftingSearchInput?.value?.trim().toLowerCase() ?? '';
      craftingSearchResultsEl.innerHTML = '';
      const unlockedRecipes = RECIPES.filter((recipe) => state.unlockedDimensions.has(recipe.unlock));
      const matches = unlockedRecipes.filter((recipe) => {
        if (!query) return true;
        const name = recipe.name.toLowerCase();
        if (name.includes(query)) return true;
        const outputName = (ITEM_DEFS[recipe.output.item]?.name ?? recipe.output.item).toLowerCase();
        if (outputName.includes(query)) return true;
        return recipe.sequence.some((itemId) => (ITEM_DEFS[itemId]?.name ?? itemId).toLowerCase().includes(query));
      });
      if (!matches.length) {
        const empty = document.createElement('li');
        empty.className = 'crafting-search-panel__empty';
        empty.textContent = query
          ? 'No recipes match this search yet.'
          : 'Unlock more dimensions to expand your library.';
        craftingSearchResultsEl.appendChild(empty);
        return;
      }
      matches.slice(0, 12).forEach((recipe) => {
        const entry = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.innerHTML = `
          <span>${recipe.name}</span>
          <span class="crafting-search-panel__result-subtitle">${recipe.sequence
            .map((item) => ITEM_DEFS[item]?.name ?? item)
            .join(' → ')}</span>
          <span class="crafting-search-panel__result-output">Creates ${
            ITEM_DEFS[recipe.output.item]?.name ?? recipe.output.item
          } ×${recipe.output.quantity}</span>
        `;
        button.addEventListener('click', () => {
          state.craftSequence = [...recipe.sequence];
          if (recipeSearchEl) {
            recipeSearchEl.value = recipe.name;
          }
          clearCraftSequenceErrorState();
          updateCraftSequenceDisplay();
          updateRecipesList();
          updateAutocompleteSuggestions();
          closeCraftingSearchPanel(true);
        });
        entry.appendChild(button);
        craftingSearchResultsEl.appendChild(entry);
      });
    }

    function triggerCraftConfetti() {
      if (!craftConfettiEl) return;
      craftConfettiEl.classList.remove('active');
      craftConfettiEl.innerHTML = '';
      const colors = ['#49f2ff', '#f7b733', '#2bc26b', '#ff4976'];
      const pieces = 28;
      for (let i = 0; i < pieces; i++) {
        const piece = document.createElement('span');
        piece.className = 'crafting-confetti__piece';
        piece.style.background = colors[i % colors.length];
        piece.style.left = `${Math.random() * 100}%`;
        piece.style.setProperty('--offset-x', `${(Math.random() * 80 - 40).toFixed(1)}%`);
        piece.style.setProperty('--spin', `${(Math.random() * 720 - 360).toFixed(0)}deg`);
        piece.style.animationDelay = `${Math.random() * 0.25}s`;
        craftConfettiEl.appendChild(piece);
      }
      void craftConfettiEl.offsetWidth;
      craftConfettiEl.classList.add('active');
      if (craftConfettiTimer) {
        clearTimeout(craftConfettiTimer);
      }
      craftConfettiTimer = window.setTimeout(() => {
        craftConfettiEl.classList.remove('active');
        craftConfettiEl.innerHTML = '';
      }, 1600);
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
      document.addEventListener('keydown', (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
          if (!craftingModal?.hidden) {
            event.preventDefault();
            openCraftingSearchPanel();
          }
        }
      });
      craftButton?.addEventListener('click', attemptCraft);
      clearCraftButton?.addEventListener('click', () => {
        state.craftSequence = [];
        clearCraftSequenceErrorState();
        updateCraftSequenceDisplay();
        updateAutocompleteSuggestions();
      });
      recipeSearchEl?.addEventListener('focus', updateAutocompleteSuggestions);
      recipeSearchEl?.addEventListener('input', () => {
        updateAutocompleteSuggestions();
        updateRecipesList();
      });
      recipeSearchEl?.addEventListener('blur', () => {
        window.setTimeout(() => craftSuggestionsEl?.setAttribute('data-visible', 'false'), 140);
      });
      openCraftingSearchButton?.addEventListener('click', openCraftingSearchPanel);
      closeCraftingSearchButton?.addEventListener('click', () => closeCraftingSearchPanel(true));
      craftingSearchPanel?.addEventListener('click', (event) => {
        if (event.target === craftingSearchPanel) {
          closeCraftingSearchPanel(true);
        }
      });
      craftingSearchInput?.addEventListener('input', updateCraftingSearchPanelResults);
      craftLauncherButton?.addEventListener('click', openCraftingModal);
      toggleExtendedBtn.addEventListener('click', toggleExtended);
      mobileControls.querySelectorAll('button').forEach((button) => {
        button.addEventListener('click', () => updateFromMobile(button.dataset.action));
      });
      openGuideButton?.addEventListener('click', openGuideModal);
      landingGuideButton?.addEventListener('click', () => {
        openGuideModal();
      });
      openSettingsButton?.addEventListener('click', openSettingsModal);
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
        if (settingsModal && !settingsModal.hidden) {
          closeSettingsModal(true);
          event.preventDefault();
          return;
        }
        if (leaderboardModal && !leaderboardModal.hidden) {
          closeLeaderboardModal(true);
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

    function updateIdentityUI() {
      if (headerUserNameEl) headerUserNameEl.textContent = identityState.displayName ?? 'Guest Explorer';
      if (userNameDisplayEl) userNameDisplayEl.textContent = identityState.displayName ?? 'Guest Explorer';
      if (headerUserLocationEl) headerUserLocationEl.textContent = formatLocationBadge(identityState.location);
      if (userLocationDisplayEl) userLocationDisplayEl.textContent = formatLocationDetail(identityState.location);
      if (userDeviceDisplayEl) userDeviceDisplayEl.textContent = formatDeviceSnapshot(identityState.device);

      const signedIn = Boolean(identityState.googleProfile);
      googleSignOutButtons.forEach((button) => {
        button.hidden = !signedIn;
      });
      googleButtonContainers.forEach((container) => {
        const shouldHideGoogleButton =
          signedIn || !identityState.googleInitialized || !appConfig.googleClientId;
        container.hidden = shouldHideGoogleButton;
      });
      googleFallbackButtons.forEach((button) => {
        const showFallback = !signedIn;
        button.hidden = !showFallback;
        if (appConfig.googleClientId) {
          const ready = identityState.googleInitialized;
          button.disabled = !ready;
          button.textContent = ready ? 'Sign in with Google' : 'Preparing Google Sign-In…';
          button.title = ready
            ? 'Open the Google Sign-In prompt.'
            : 'Google services are still initialising. This will become clickable momentarily.';
        } else {
          button.disabled = false;
          button.textContent = 'Create local explorer profile';
          button.title = 'Skip Google Sign-In and save your progress locally on this device.';
        }
      });
      if (landingSignInPanel) {
        landingSignInPanel.hidden = signedIn;
        landingSignInPanel.setAttribute('aria-hidden', signedIn ? 'true' : 'false');
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

      if (refreshScoresButton) {
        const loading = identityState.loadingScores;
        const disabled = !signedIn || loading;
        refreshScoresButton.disabled = disabled;
        refreshScoresButton.setAttribute('data-loading', loading ? 'true' : 'false');
        refreshScoresButton.setAttribute('aria-busy', loading ? 'true' : 'false');
        refreshScoresButton.setAttribute('aria-disabled', disabled ? 'true' : 'false');
      }

      if (leaderboardEmptyMessage) {
        if (!signedIn) {
          leaderboardEmptyMessage.textContent = 'Sign in to publish your victories and see the live rankings.';
        } else if (identityState.loadingScores) {
          leaderboardEmptyMessage.textContent = 'Fetching the latest rankings...';
        } else {
          leaderboardEmptyMessage.textContent = 'No scores recorded yet. Be the first to complete a run!';
        }
      }

      renderScoreboard(identityState.scoreboard);
    }

    function renderScoreboard(entries) {
      if (!scoreboardListEl) return;
      scoreboardListEl.innerHTML = '';
      const hasEntries = Array.isArray(entries) && entries.length > 0;
      if (leaderboardTableContainer) {
        leaderboardTableContainer.dataset.empty = hasEntries ? 'false' : 'true';
      }
      if (!hasEntries) {
        updateLeaderboardSortIndicators();
        return;
      }

      const rankMap = new Map();
      entries
        .slice()
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
        .forEach((entry, index) => {
          rankMap.set(entry, index + 1);
        });

      const sortedEntries = entries.slice().sort((a, b) => {
        const { key, direction } = leaderboardSortState;
        const multiplier = direction === 'asc' ? 1 : -1;
        const aValue = getLeaderboardSortValue(a, key);
        const bValue = getLeaderboardSortValue(b, key);
        let comparison = 0;
        if (typeof aValue === 'string' || typeof bValue === 'string') {
          comparison = String(aValue).localeCompare(String(bValue));
        } else {
          comparison = Number(aValue) - Number(bValue);
        }
        if (comparison === 0) {
          comparison = Number(b.score ?? 0) - Number(a.score ?? 0);
        }
        if (comparison === 0) {
          comparison = String(a.name ?? '').localeCompare(String(b.name ?? ''));
        }
        return comparison * multiplier;
      });

      sortedEntries.forEach((entry, index) => {
        const row = document.createElement('tr');

        const rankCell = document.createElement('td');
        rankCell.className = 'leaderboard-col-rank';
        rankCell.textContent = (rankMap.get(entry) ?? index + 1).toString();
        row.appendChild(rankCell);

        const nameCell = document.createElement('td');
        const name = document.createElement('strong');
        name.textContent = entry.name ?? 'Explorer';
        nameCell.appendChild(name);
        row.appendChild(nameCell);

        const scoreCell = document.createElement('td');
        scoreCell.textContent = formatScoreNumber(entry.score);
        row.appendChild(scoreCell);

        const runTimeCell = document.createElement('td');
        runTimeCell.textContent = formatRunTime(entry.runTimeSeconds);
        row.appendChild(runTimeCell);

        const dimensionCell = document.createElement('td');
        dimensionCell.textContent = String(entry.dimensionCount ?? 0);
        row.appendChild(dimensionCell);

        const inventoryCell = document.createElement('td');
        inventoryCell.textContent = String(entry.inventoryCount ?? 0);
        row.appendChild(inventoryCell);

        const locationCell = document.createElement('td');
        locationCell.dataset.cell = 'location';
        locationCell.textContent = formatLocationLabel(entry);
        row.appendChild(locationCell);

        const updatedCell = document.createElement('td');
        updatedCell.dataset.cell = 'updated';
        if (entry.updatedAt) {
          try {
            updatedCell.textContent = new Date(entry.updatedAt).toLocaleString();
          } catch (error) {
            console.warn('Unable to parse updatedAt value.', error);
            updatedCell.textContent = entry.updatedAt;
          }
        } else {
          updatedCell.textContent = '—';
        }
        row.appendChild(updatedCell);

        scoreboardListEl.appendChild(row);
      });

      updateLeaderboardSortIndicators();
    }

    function getLeaderboardSortValue(entry, key) {
      switch (key) {
        case 'score':
          return Number(entry.score ?? 0);
        case 'name':
          return String(entry.name ?? '').toLowerCase();
        case 'runTimeSeconds': {
          const value = Number(entry.runTimeSeconds);
          return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
        }
        case 'dimensionCount':
          return Number(entry.dimensionCount ?? 0);
        case 'inventoryCount':
          return Number(entry.inventoryCount ?? 0);
        case 'locationLabel':
          return String(formatLocationLabel(entry) ?? '').toLowerCase();
        case 'updatedAt': {
          const timestamp = entry.updatedAt ? Date.parse(entry.updatedAt) : 0;
          return Number.isNaN(timestamp) ? 0 : timestamp;
        }
        default:
          return entry[key] ?? 0;
      }
    }

    function updateLeaderboardSortIndicators() {
      leaderboardSortHeaders.forEach((header) => {
        const key = header.dataset.sortKey;
        if (!key) return;
        const direction = key === leaderboardSortState.key ? leaderboardSortState.direction : 'none';
        header.setAttribute('data-sort-direction', direction);
        if (direction === 'none') {
          header.setAttribute('aria-sort', 'none');
        } else {
          header.setAttribute('aria-sort', direction === 'asc' ? 'ascending' : 'descending');
        }
      });
    }

    function applyLeaderboardSort(key) {
      if (!key) return;
      if (leaderboardSortState.key === key) {
        leaderboardSortState = {
          key,
          direction: leaderboardSortState.direction === 'asc' ? 'desc' : 'asc',
        };
      } else {
        leaderboardSortState = {
          key,
          direction: leaderboardDefaultSortDirection[key] ?? 'desc',
        };
      }
      renderScoreboard(identityState.scoreboard);
    }

    function handleLeaderboardSort(event) {
      event.preventDefault();
      const target = event.currentTarget;
      if (!target) return;
      applyLeaderboardSort(target.dataset.sortKey);
    }

    function openLeaderboardModal() {
      if (!leaderboardModal) return;
      leaderboardModal.hidden = false;
      leaderboardModal.setAttribute('aria-hidden', 'false');
      openLeaderboardButton?.setAttribute('aria-expanded', 'true');
      if (identityState.googleProfile && !identityState.scoreboard.length && !identityState.loadingScores) {
        loadScoreboard();
      }
      if (closeLeaderboardButton) {
        closeLeaderboardButton.focus();
      }
    }

    function closeLeaderboardModal(shouldFocusTrigger = false) {
      if (!leaderboardModal) return;
      leaderboardModal.hidden = true;
      leaderboardModal.setAttribute('aria-hidden', 'true');
      openLeaderboardButton?.setAttribute('aria-expanded', 'false');
      if (shouldFocusTrigger) {
        openLeaderboardButton?.focus();
      }
    }

    function setupLeaderboardModal() {
      if (!leaderboardModal || !openLeaderboardButton) return;

      openLeaderboardButton.addEventListener('click', () => {
        openLeaderboardModal();
      });

      closeLeaderboardButton?.addEventListener('click', () => {
        closeLeaderboardModal(true);
      });

      leaderboardModal.addEventListener('click', (event) => {
        if (event.target === leaderboardModal) {
          closeLeaderboardModal(true);
        }
      });

      leaderboardSortHeaders.forEach((header) => {
        header.addEventListener('click', handleLeaderboardSort);
        header.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
            event.preventDefault();
            applyLeaderboardSort(header.dataset.sortKey);
          }
        });
      });

      updateLeaderboardSortIndicators();
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
        googleButtonContainers.forEach((container) => {
          if (!container || container.dataset.rendered === 'true') return;
          google.accounts.id.renderButton(container, {
            type: 'standard',
            theme: 'outline',
            size: 'large',
            text: 'signin_with',
            shape: 'pill',
            width: 260,
          });
          container.dataset.rendered = 'true';
          container.hidden = false;
        });
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
      const dimensionCount = state.scoreBreakdown?.dimensions?.size ?? new Set(state.dimensionHistory ?? []).size;
      const recipeCount = state.scoreBreakdown?.recipes?.size ?? 0;
      const inventoryBundles = mergeInventory();
      const satchelCount = state.player.satchel?.reduce((sum, bundle) => sum + (bundle?.quantity ?? 0), 0) ?? 0;
      const inventoryCount = inventoryBundles.reduce((sum, bundle) => sum + bundle.quantity, 0) + satchelCount;
      const totalScore =
        state.score ?? recipeCount * SCORE_POINTS.recipe + dimensionCount * SCORE_POINTS.dimension;
      return {
        score: Math.round(totalScore),
        dimensionCount,
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
      googleFallbackButtons.forEach((button) => {
        button.addEventListener('click', () => {
          if (appConfig.googleClientId) {
            attemptGoogleSignInFlow();
          } else {
            handleLocalProfileSignIn();
          }
        });
      });
      googleSignOutButtons.forEach((button) => {
        button.addEventListener('click', handleGoogleSignOut);
      });
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

    initializeCraftSlots();
    updateCraftSequenceDisplay();
    updateRecipesList();
    updateAutocompleteSuggestions();

    initializeAudioControls();

    startButton.addEventListener('click', startGame);
    initEventListeners();

    setupSettingsModal();
    setupCraftingModal();
    setupGuideModal();
    setupLeaderboardModal();
    initializeIdentityLayer();
    updateLayoutMetrics();
    syncSidebarForViewport();

    function openSettingsModal() {
      if (!settingsModal) return;
      applyAudioSettingsToInputs();
      updateVolumeLabels();
      settingsModal.hidden = false;
      settingsModal.setAttribute('aria-hidden', 'false');
      openSettingsButton?.setAttribute('aria-expanded', 'true');
      initializeAudioEngine();
      window.setTimeout(() => {
        const firstInput = settingsModal.querySelector('input[type="range"]');
        firstInput?.focus();
      }, 0);
    }

    function closeSettingsModal(shouldFocusTrigger = false) {
      if (!settingsModal) return;
      settingsModal.hidden = true;
      settingsModal.setAttribute('aria-hidden', 'true');
      openSettingsButton?.setAttribute('aria-expanded', 'false');
      if (shouldFocusTrigger) {
        openSettingsButton?.focus();
      }
    }

    function setupSettingsModal() {
      if (!settingsModal) return;
      settingsModal.hidden = true;
      settingsModal.setAttribute('aria-hidden', 'true');
      openSettingsButton?.setAttribute('aria-expanded', 'false');
      settingsModal.addEventListener('click', (event) => {
        if (event.target === settingsModal) {
          closeSettingsModal(true);
        }
      });
      closeSettingsButton?.addEventListener('click', () => closeSettingsModal(true));
    }

    function openCraftingModal() {
      if (!craftingModal) return;
      craftingModal.hidden = false;
      craftingModal.setAttribute('aria-hidden', 'false');
      craftLauncherButton?.setAttribute('aria-expanded', 'true');
      updateCraftSequenceDisplay();
      updateRecipesList();
      updateAutocompleteSuggestions();
      updateCraftingInventoryOverlay();
      recipeSearchEl?.focus();
    }

    function closeCraftingModal() {
      if (!craftingModal) return;
      craftingModal.hidden = true;
      craftingModal.setAttribute('aria-hidden', 'true');
      craftSuggestionsEl?.setAttribute('data-visible', 'false');
      craftLauncherButton?.setAttribute('aria-expanded', 'false');
      closeCraftingSearchPanel();
      craftLauncherButton?.focus();
    }

    function setupCraftingModal() {
      if (!craftingModal) return;
      craftingModal.hidden = true;
      craftingModal.setAttribute('aria-hidden', 'true');
      craftLauncherButton?.setAttribute('aria-expanded', 'false');
      craftingModal.addEventListener('click', (event) => {
        if (event.target === craftingModal) {
          if (craftingSearchPanel?.getAttribute('data-open') === 'true') {
            closeCraftingSearchPanel(true);
            return;
          }
          closeCraftingModal();
        }
      });
      closeCraftingButton?.addEventListener('click', closeCraftingModal);
      if (craftingSearchPanel) {
        craftingSearchPanel.hidden = true;
        craftingSearchPanel.setAttribute('data-open', 'false');
        craftingSearchPanel.setAttribute('aria-hidden', 'true');
      }
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          if (craftingSearchPanel?.getAttribute('data-open') === 'true') {
            event.preventDefault();
            closeCraftingSearchPanel(true);
            return;
          }
          if (!craftingModal.hidden) {
            closeCraftingModal();
          }
        }
      });
    }

    const GUIDE_SLIDES = [
      {
        id: 'rail-surfing',
        category: 'Movement',
        icon: '🛤️',
        iconLabel: 'Rail icon',
        title: 'Rail Surfing 101',
        description: 'Glide across energy rails to outrun the collapsing void and gather momentum bonuses.',
        desktopControls: [
          {
            keys: ['A', 'D'],
            description: 'Strafe between parallel rails to align with the glowing conduit.',
          },
          {
            keys: ['Space'],
            description: 'Hop short gaps or falling track segments before they disintegrate.',
          },
          {
            keys: ['Shift'],
            description: 'Feather your landing for precision alignment and combo preservation.',
          },
        ],
        mobileControls: [
          {
            keys: ['Swipe ⟷'],
            description: 'Swap to the adjacent rail instantly as the cadence lights change.',
          },
          {
            keys: ['Tap Jump'],
            description: 'Vault crumbled sections of track the moment the warning rune flashes.',
          },
        ],
        demoSequence: [
          {
            label: 'Align',
            keys: ['D'],
            caption: 'Lean into the highlighted rail before the void surge reaches it.',
          },
          {
            label: 'Leap',
            keys: ['Space'],
            caption: 'Tap jump to clear the missing section and keep your combo streak alive.',
          },
          {
            label: 'Stabilise',
            keys: ['Shift'],
            caption: 'Feather the landing so magnetised boots lock onto the rail.',
          },
        ],
        tip: 'Watch the blue cadence lights — they foreshadow which rail collapses next.',
      },
      {
        id: 'portal-forging',
        category: 'Construction',
        icon: '⧉',
        iconLabel: 'Portal glyph',
        title: 'Forge a Portal Frame',
        description: 'Sequence materials in the crafting circle, then place a perfect 4×3 gate.',
        desktopControls: [
          {
            keys: ['R'],
            description: 'Open the portal planner overlay to preview the frame footprint.',
          },
          {
            keys: ['Mouse Drag'],
            description: 'Trace each block of the frame in order until the lattice hums.',
          },
          {
            keys: ['F'],
            description: 'Ignite the core once the matrix stabilises and the runes align.',
          },
        ],
        mobileControls: [
          {
            keys: ['Portal Button'],
            description: 'Open the holographic build overlay for the selected material.',
          },
          {
            keys: ['Drag Blocks'],
            description: 'Place segments by tracing the glowing outline with your finger.',
          },
          {
            keys: ['Tap Ignite'],
            description: 'Stabilise the portal when the inner matrix shifts to azure.',
          },
        ],
        demoSequence: [
          {
            label: 'Plan',
            keys: ['R'],
            caption: 'Call up the blueprint to lock the frame dimensions.',
          },
          {
            label: 'Place',
            keys: ['Mouse Drag'],
            caption: 'Drag to set each block until the lattice sings in resonance.',
          },
          {
            label: 'Ignite',
            keys: ['F'],
            caption: 'Trigger the ignition rune to activate the gateway.',
          },
        ],
        tip: 'Mixed materials destabilise the portal — keep every segment identical.',
      },
      {
        id: 'survival-kit',
        category: 'Survival',
        icon: '🛡️',
        iconLabel: 'Shield icon',
        title: 'Emergency Toolkit',
        description: 'React fast when night raids hit the rails and villagers call for help.',
        desktopControls: [
          {
            keys: ['Q'],
            description: 'Quick-cycle the hotbar to grab barricades or traps.',
          },
          {
            keys: ['1', '2', '3'],
            description: 'Deploy beacons, barricades, and decoys instantly.',
          },
          {
            keys: ['Mouse Hold'],
            description: 'Channel repair beams to mend damaged rails in place.',
          },
        ],
        mobileControls: [
          {
            keys: ['Hotbar Tap'],
            description: 'Equip barricades or drones straight from the quick slots.',
          },
          {
            keys: ['Press & Hold'],
            description: 'Maintain pressure to flood the rail with stabilising energy.',
          },
        ],
        demoSequence: [
          {
            label: 'Select',
            keys: ['Q'],
            caption: 'Swap to your emergency slot with a quick-cycle.',
          },
          {
            label: 'Deploy',
            keys: ['1'],
            caption: 'Drop a barricade to slow the raid advance.',
          },
          {
            label: 'Repair',
            keys: ['Mouse Hold'],
            caption: 'Hold to flood the rail with stabilising energy.',
          },
        ],
        tip: 'Repair beams work fastest on glowing rails — lure mobs away with decoys first.',
      },
    ];

    const guideCarouselState = {
      currentIndex: 0,
      timeouts: [],
      goToSlide: null,
    };

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
      guideCarouselState.goToSlide?.(0, { forceRender: true });
    }

    function closeGuideModal() {
      if (!guideModal) return;
      guideModal.hidden = true;
      guideModal.setAttribute('data-open', 'false');
      guideModal.setAttribute('aria-hidden', 'true');
      clearGuideDemoTimers();
      guideModal.querySelectorAll('.guide-card__step').forEach((step) => {
        step.classList.remove('is-animating');
      });
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
      initializeGuideCarousel();
    }

    function clearGuideDemoTimers() {
      guideCarouselState.timeouts.forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
      guideCarouselState.timeouts.length = 0;
    }

    function renderGuideControlsColumn(label, controls = []) {
      if (!controls.length) {
        return '';
      }
      const itemsMarkup = controls
        .map((control) => {
          const keysMarkup = (control.keys ?? [])
            .map((key) => `<kbd>${key}</kbd>`)
            .join('');
          return `
            <li>
              <div class="guide-card__control">
                <div class="guide-card__control-keys">${keysMarkup}</div>
                <p>${control.description}</p>
              </div>
            </li>
          `;
        })
        .join('');
      return `
        <div class="guide-card__list">
          <h4>${label}</h4>
          <ul>
            ${itemsMarkup}
          </ul>
        </div>
      `;
    }

    function createGuideCardMarkup(slide) {
      const captionId = `guideDemoCaption-${slide.id}`;
      const stepsMarkup = (slide.demoSequence ?? [])
        .map((step, index) => {
          const keysMarkup = (step.keys ?? [])
            .map((key) => `<kbd>${key}</kbd>`)
            .join('');
          return `
            <button type="button" class="guide-card__step" data-demo-step="${index}">
              <span class="guide-card__step-label">${step.label}</span>
              <span class="guide-card__step-keys">${keysMarkup}</span>
            </button>
          `;
        })
        .join('');
      const desktopColumn = renderGuideControlsColumn('Desktop', slide.desktopControls);
      const mobileColumn = renderGuideControlsColumn('Mobile', slide.mobileControls);
      const columnsMarkup = [desktopColumn, mobileColumn].filter(Boolean).join('');
      return `
        <header class="guide-card__header">
          <div class="guide-card__icon" role="img" aria-label="${slide.iconLabel}">
            <span aria-hidden="true">${slide.icon}</span>
          </div>
          <p class="guide-card__label">${slide.category}</p>
          <h3 class="guide-card__title">${slide.title}</h3>
          <p class="guide-card__description">${slide.description}</p>
        </header>
        <div class="guide-card__demo" data-guide-demo>
          <div class="guide-card__steps" data-guide-steps>
            ${stepsMarkup}
          </div>
          <button type="button" class="guide-card__play" data-guide-play aria-describedby="${captionId}">
            Play Demo
          </button>
          <p class="guide-card__caption" id="${captionId}" data-demo-caption>
            ${(slide.demoSequence && slide.demoSequence[0]?.caption) || ''}
          </p>
        </div>
        <div class="guide-card__columns">
          ${columnsMarkup}
        </div>
        <p class="guide-card__tip">${slide.tip}</p>
      `;
    }

    function animateGuideDemoSequence(stepButtons, captionEl, slide) {
      if (!stepButtons.length) return;
      clearGuideDemoTimers();
      (slide.demoSequence ?? []).forEach((step, index) => {
        const timeoutId = window.setTimeout(() => {
          stepButtons.forEach((button, buttonIndex) => {
            const isTarget = buttonIndex === index;
            button.classList.toggle('is-active', isTarget);
            if (isTarget) {
              button.classList.add('is-animating');
              captionEl.textContent = step.caption;
              const animationTimeout = window.setTimeout(() => {
                button.classList.remove('is-animating');
              }, 620);
              guideCarouselState.timeouts.push(animationTimeout);
            } else {
              button.classList.remove('is-animating');
            }
          });
        }, index * 900);
        guideCarouselState.timeouts.push(timeoutId);
      });
      const resetTimeout = window.setTimeout(() => {
        captionEl.textContent = slide.tip;
      }, (slide.demoSequence?.length ?? 0) * 900 + 720);
      guideCarouselState.timeouts.push(resetTimeout);
    }

    function attachGuideDemoHandlers(cardEl, slide) {
      const demoHost = cardEl.querySelector('[data-guide-demo]');
      if (!demoHost) return;
      const captionEl = demoHost.querySelector('[data-demo-caption]');
      const stepButtons = Array.from(demoHost.querySelectorAll('[data-demo-step]'));
      const playButton = demoHost.querySelector('[data-guide-play]');
      if (!captionEl || !stepButtons.length) {
        return;
      }

      function activateStep(stepIndex, { animate } = { animate: false }) {
        clearGuideDemoTimers();
        stepButtons.forEach((button, index) => {
          const isActive = index === stepIndex;
          button.classList.toggle('is-active', isActive);
          button.classList.remove('is-animating');
        });
        const step = slide.demoSequence?.[stepIndex];
        if (!step) return;
        captionEl.textContent = step.caption;
        if (animate) {
          const target = stepButtons[stepIndex];
          target.classList.add('is-animating');
          const timeoutId = window.setTimeout(() => {
            target.classList.remove('is-animating');
          }, 420);
          guideCarouselState.timeouts.push(timeoutId);
        }
      }

      stepButtons.forEach((button) => {
        const index = Number.parseInt(button.getAttribute('data-demo-step') || '0', 10);
        button.addEventListener('click', () => activateStep(index, { animate: true }));
        button.addEventListener('mouseenter', () => activateStep(index));
        button.addEventListener('focus', () => activateStep(index));
      });

      playButton?.addEventListener('click', () => {
        animateGuideDemoSequence(stepButtons, captionEl, slide);
      });

      activateStep(0);
    }

    function initializeGuideCarousel() {
      if (!guideModal || guideModal.dataset.carouselInitialized === 'true') {
        return;
      }
      const carouselEl = guideModal.querySelector('[data-guide-carousel]');
      if (!carouselEl) return;
      const cardEl = carouselEl.querySelector('[data-guide-card]');
      const prevButton = carouselEl.querySelector('[data-guide-prev]');
      const nextButton = carouselEl.querySelector('[data-guide-next]');
      const dotsContainer = carouselEl.querySelector('[data-guide-dots]');
      if (!cardEl || !prevButton || !nextButton || !dotsContainer) {
        return;
      }

      prevButton.setAttribute('aria-controls', 'guideCarouselCard');
      nextButton.setAttribute('aria-controls', 'guideCarouselCard');

      function updateDots() {
        const dots = dotsContainer.querySelectorAll('button');
        dots.forEach((dot, index) => {
          const isActive = index === guideCarouselState.currentIndex;
          dot.dataset.active = isActive ? 'true' : 'false';
          dot.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });
      }

      function renderSlide() {
        const slide = GUIDE_SLIDES[guideCarouselState.currentIndex];
        if (!slide) return;
        cardEl.setAttribute('data-current-slide', slide.id);
        cardEl.innerHTML = createGuideCardMarkup(slide);
        attachGuideDemoHandlers(cardEl, slide);
      }

      function goToSlide(index, { focusDot = false, forceRender = false } = {}) {
        if (!GUIDE_SLIDES.length) return;
        const total = GUIDE_SLIDES.length;
        const targetIndex = ((index % total) + total) % total;
        const didChange = guideCarouselState.currentIndex !== targetIndex;
        guideCarouselState.currentIndex = targetIndex;
        clearGuideDemoTimers();
        if (didChange || forceRender || !cardEl.childElementCount) {
          renderSlide();
        } else {
          const slide = GUIDE_SLIDES[targetIndex];
          attachGuideDemoHandlers(cardEl, slide);
        }
        updateDots();
        if (focusDot) {
          const activeDot = dotsContainer.querySelector("button[data-active='true']");
          activeDot?.focus();
        }
      }

      dotsContainer.innerHTML = '';
      GUIDE_SLIDES.forEach((slide, index) => {
        const dotButton = document.createElement('button');
        dotButton.type = 'button';
        dotButton.className = 'guide-carousel__dot';
        dotButton.dataset.index = String(index);
        dotButton.setAttribute('aria-label', `Show ${slide.title}`);
        dotButton.setAttribute('aria-controls', 'guideCarouselCard');
        dotButton.addEventListener('click', () => goToSlide(index, { focusDot: true }));
        dotsContainer.appendChild(dotButton);
      });

      carouselEl.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          goToSlide(guideCarouselState.currentIndex - 1);
        }
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          goToSlide(guideCarouselState.currentIndex + 1);
        }
      });

      prevButton.addEventListener('click', () => {
        goToSlide(guideCarouselState.currentIndex - 1);
      });
      nextButton.addEventListener('click', () => {
        goToSlide(guideCarouselState.currentIndex + 1);
      });

      guideCarouselState.goToSlide = (index, options = {}) => {
        goToSlide(index, { ...options, forceRender: options.forceRender ?? false });
      };

      goToSlide(guideCarouselState.currentIndex, { forceRender: true });
      guideModal.dataset.carouselInitialized = 'true';
    }

  }

  function ensureThree() {
    const existing = window.THREE_GLOBAL || window.THREE;
    if (existing) {
      return Promise.resolve(existing);
    }
    if (document.querySelector('script[data-three-fallback]')) {
      return Promise.reject(new Error('Three.js failed to initialise.'));
    }
    return loadScript(THREE_FALLBACK_SRC, { 'data-three-fallback': 'true' })
      .then(() => window.THREE_GLOBAL || window.THREE)
      .then((instance) => {
        if (!instance) {
          throw new Error('Three.js failed to load even after attempting fallback.');
        }
        return instance;
      });
  }

  ensureThree()
    .then(() => {
      bootstrap();
    })
    .catch((error) => {
      showDependencyError(
        'We could not initialise the 3D renderer. Please refresh the page after checking your connection.',
        error
      );
    });
})();
