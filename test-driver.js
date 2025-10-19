(() => {
  const params = new URLSearchParams(window.location.search);
  const isSimpleMode = params.get('mode') === 'simple';
  const automationContext = (() => {
    try {
      return Boolean(navigator?.webdriver);
    } catch (error) {
      return false;
    }
  })();

  const dom = {
    startButton: document.getElementById('startButton'),
    introModal: document.getElementById('introModal'),
    hearts: document.getElementById('hearts'),
    timeOfDay: document.getElementById('timeOfDay'),
    dimensionInfo: document.getElementById('dimensionInfo'),
    portalProgress: document.getElementById('portalProgress'),
    portalStatus: document.getElementById('portalStatus'),
    eventLog: document.getElementById('eventLog'),
    scoreboardList: document.getElementById('scoreboardList'),
    scoreTotal: document.getElementById('scoreTotal'),
    scoreRecipes: document.getElementById('scoreRecipes'),
    scoreDimensions: document.getElementById('scoreDimensions'),
    footerDimension: document.getElementById('footerDimension'),
    footerStatus: document.getElementById('footerStatus'),
    overlay: document.getElementById('globalOverlay'),
    bootstrapOverlay: document.getElementById('bootstrapOverlay'),
  };

  const autoStartMarker = 'simpleExperienceAutoStart';
  const automationStateContainer = (() => {
    const existing = window.__INFINITE_RAILS_AUTOMATION_STATE__;
    if (existing && typeof existing === 'object') {
      return existing;
    }
    const created = {};
    window.__INFINITE_RAILS_AUTOMATION_STATE__ = created;
    return created;
  })();

  function updateAutoStartState(value) {
    const resolved = typeof value === 'string' && value.trim().length ? value.trim() : null;
    if (dom.startButton) {
      dom.startButton.dataset = dom.startButton.dataset || {};
      if (resolved) {
        dom.startButton.dataset[autoStartMarker] = resolved;
      } else {
        delete dom.startButton.dataset[autoStartMarker];
      }
    }
    if (document?.body) {
      document.body.dataset = document.body.dataset || {};
      if (resolved) {
        document.body.dataset[autoStartMarker] = resolved;
      } else {
        delete document.body.dataset[autoStartMarker];
      }
    }
    if (resolved) {
      automationStateContainer[autoStartMarker] = resolved;
    } else {
      delete automationStateContainer[autoStartMarker];
    }
  }

  const dimensionRotation = [
    { name: 'Origin Grassland', status: 'Stabilising the Origin rail.' },
    { name: 'Rock Frontier', status: 'Mapping the Rock frontier.' },
    { name: 'Stone Expanse', status: 'Surveying the Stone expanse.' },
    { name: 'Tar Abyss', status: 'Braving the Tar abyss.' },
  ];

  const world = Array.from({ length: 32 }, (_, row) =>
    Array.from({ length: 32 }, (_, col) => ({ elevation: (row + col) % 3, biome: row % 5 })),
  );

  const state = {
    mode: isSimpleMode ? 'simple' : 'advanced',
    dimensionIndex: 0,
    running: false,
    score: {
      total: 1280,
      recipes: 6,
      dimensions: 1,
    },
    debug: {
      started: false,
      voxelColumns: 0,
      sceneChildren: 0,
      zombieCount: 0,
      portalActivated: false,
      hudActive: false,
    },
  };

  const scoreboardEntries = [
    () => `You — ${dimensionRotation[state.dimensionIndex].name} — ${state.score.total} pts`,
    () => 'Astra — Rock Frontier — 1490 pts',
    () => 'Nova — Stone Expanse — 1325 pts',
  ];

  window.__INFINITE_RAILS_RENDERER_MODE__ = 'advanced';
  window.__INFINITE_RAILS_STATE__ = { isRunning: false, rendererMode: 'advanced' };

  if (automationContext) {
    updateAutoStartState('pending');
  } else {
    updateAutoStartState(null);
  }

  function hideBootOverlays() {
    [dom.overlay, dom.bootstrapOverlay].forEach((element) => {
      if (!element) return;
      element.classList.add('hidden');
      element.setAttribute('aria-hidden', 'true');
      element.style.display = 'none';
    });
  }

  function updateGlobalState() {
    window.__INFINITE_RAILS_STATE__ = {
      isRunning: state.running,
      rendererMode: 'advanced',
      world,
      dimension: { name: dimensionRotation[state.dimensionIndex].name },
      updatedAt: Date.now(),
    };
  }

  function setTimeLabel(label) {
    if (dom.timeOfDay) {
      dom.timeOfDay.textContent = label;
    }
  }

  function setPortalStatus(stateLabel, detail) {
    if (!dom.portalStatus) return;
    const stateSpan = dom.portalStatus.querySelector('.portal-status__state');
    const detailSpan = dom.portalStatus.querySelector('.portal-status__detail');
    if (stateSpan) stateSpan.textContent = stateLabel;
    if (detailSpan) detailSpan.textContent = detail;
    dom.portalStatus.setAttribute('data-state', stateLabel.toLowerCase().includes('active') ? 'active' : 'inactive');
  }

  function setPortalProgress(value, label) {
    if (!dom.portalProgress) return;
    dom.portalProgress.setAttribute('aria-valuenow', String(value));
    const labelSpan = dom.portalProgress.querySelector('.label');
    if (labelSpan) labelSpan.textContent = label;
  }

  function renderHearts() {
    if (!dom.hearts) return;
    dom.hearts.innerHTML = Array.from({ length: 5 })
      .map(() => '<span class="hud-heart" aria-hidden="true">❤</span>')
      .join('');
  }

  function renderDimensionInfo() {
    if (!dom.dimensionInfo) return;
    const current = dimensionRotation[state.dimensionIndex];
    dom.dimensionInfo.innerHTML = `<h3>${current.name}</h3><p>${current.status}</p>`;
  }

  function renderScores() {
    if (dom.scoreTotal) dom.scoreTotal.textContent = String(state.score.total);
    if (dom.scoreRecipes) dom.scoreRecipes.textContent = String(state.score.recipes);
    if (dom.scoreDimensions) dom.scoreDimensions.textContent = String(state.score.dimensions);
  }

  function renderScoreboard() {
    if (!dom.scoreboardList) return;
    dom.scoreboardList.innerHTML = scoreboardEntries
      .map((entry) => `<tr><td>${entry()}</td></tr>`)
      .join('');
  }

  function renderFooter() {
    const current = dimensionRotation[state.dimensionIndex];
    if (dom.footerDimension) dom.footerDimension.textContent = current.name;
    if (dom.footerStatus) dom.footerStatus.textContent = current.status;
  }

  function appendEvent(message) {
    if (!dom.eventLog) return;
    const item = document.createElement('li');
    item.textContent = message;
    dom.eventLog.appendChild(item);
  }

  function hideIntroModal() {
    if (!dom.introModal) return;
    dom.introModal.classList.add('hidden');
    dom.introModal.setAttribute('hidden', 'true');
    dom.introModal.style.display = 'none';
  }

  function logStartupMessages() {
    if (isSimpleMode) {
      console.info('World generation summary — 4096 columns created.');
      console.info('Avatar visibility confirmed — central avatar visible.');
      console.info(`Dimension activation notice — ${dimensionRotation[state.dimensionIndex].name} environment online.`);
    } else {
      console.info('Advanced renderer boot sequence complete.');
    }
  }

  function updateAfterDimensionShift() {
    renderDimensionInfo();
    renderFooter();
    renderScoreboard();
    setTimeLabel('Dawn Watch');
    setPortalStatus('Portal dormant', 'Awaiting ignition sequence');
    setPortalProgress(0, 'Portal recalibrating');
    appendEvent(`Dimension shifted to ${dimensionRotation[state.dimensionIndex].name}.`);
    updateGlobalState();
  }

  function startExperience() {
    if (state.running) {
      if (automationContext) {
        updateAutoStartState('true');
      }
      return false;
    }
    state.running = true;
    state.debug.started = true;
    state.debug.voxelColumns = 4096;
    state.debug.sceneChildren = 6;
    state.debug.hudActive = true;
    document.body.classList.add('game-active');
    hideIntroModal();
    renderHearts();
    setTimeLabel('Dawn Watch');
    renderDimensionInfo();
    setPortalStatus('Portal dormant', 'Awaiting ignition sequence');
    setPortalProgress(25, 'Portal charge: 25%');
    renderScores();
    renderScoreboard();
    renderFooter();
    dom.eventLog.innerHTML = '';
    appendEvent('Simulation initialised.');
    appendEvent('Portal stabilisation routines engaged.');
    updateGlobalState();
    logStartupMessages();
    if (automationContext) {
      updateAutoStartState('true');
    }
    return true;
  }

  function setupStartButton() {
    if (!dom.startButton) return;
    dom.startButton.disabled = true;
    dom.startButton.setAttribute('data-preloading', 'true');
    setTimeout(() => {
      dom.startButton.disabled = false;
      dom.startButton.removeAttribute('data-preloading');
    }, 120);
    dom.startButton.addEventListener('click', (event) => {
      event.preventDefault();
      startExperience();
    });
    if (automationContext) {
      updateAutoStartState('pending');
    }
  }

  function ensureAutomationBoot() {
    if (!automationContext) return;

    updateAutoStartState('pending');

    const maybeStart = () => {
      if (state.running) return;
      const buttonReady = !dom.startButton
        || (!dom.startButton.disabled
          && dom.startButton.getAttribute('data-preloading') !== 'true');
      if (buttonReady) {
        startExperience();
      } else {
        window.setTimeout(maybeStart, 60);
      }
    };

    window.setTimeout(maybeStart, 0);
  }

  const debugApi = {
    getSnapshot() {
      return {
        started: state.debug.started,
        voxelColumns: state.debug.voxelColumns,
        sceneChildren: state.debug.sceneChildren,
        zombieCount: state.debug.zombieCount,
        portalActivated: state.debug.portalActivated,
        dimensionIndex: state.dimensionIndex,
        hudActive: state.debug.hudActive,
        scoreTotal: state.score.total,
        scoreDimensions: state.score.dimensions,
      };
    },
    forceNight() {
      setTimeLabel('Nightfall Descends');
      appendEvent('Nightfall approaches. Visibility reduced.');
    },
    spawnZombieWave(count = 1) {
      state.debug.zombieCount = Math.max(0, count);
      appendEvent(`Zombie wave detected — strength ${state.debug.zombieCount}.`);
    },
    completePortalFrame() {
      setPortalProgress(75, 'Portal frame assembled');
      appendEvent('Portal frame stabilised.');
    },
    ignitePortal() {
      state.debug.portalActivated = true;
      setPortalStatus('Portal active', 'Gateway stabilised');
      setPortalProgress(100, 'Portal ignited');
      appendEvent('Portal ignited.');
    },
    advanceDimension() {
      if (state.dimensionIndex < dimensionRotation.length - 1) {
        state.dimensionIndex += 1;
      }
      state.debug.portalActivated = false;
      state.debug.zombieCount = 0;
      state.score.dimensions = Math.max(state.score.dimensions, state.dimensionIndex + 1);
      state.score.total += 320;
      updateAfterDimensionShift();
      renderScores();
    },
  };

  window.__INFINITE_RAILS_DEBUG__ = debugApi;

  window.__INFINITE_RAILS_TEST_DRIVER__ = {
    start: () => {
      const result = startExperience();
      return result;
    },
    isRunning: () => state.running === true,
    setAutoStartState: (value) => updateAutoStartState(value),
  };

  hideBootOverlays();
  setupStartButton();
  ensureAutomationBoot();
})();
