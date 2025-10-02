const { chromium } = require('playwright');

const ALLOWED_WARNING_SUBSTRINGS = [
  'accounts.google.com',
  'ERR_CERT_AUTHORITY_INVALID',
  'ERR_TUNNEL_CONNECTION_FAILED',
  'GPU stall',
  'Automatic fallback to software WebGL',
  'URL scheme "file" is not supported',
  'Failed to load model',
  'Model load failed',
  'Multiple instances of Three.js being imported',
  'Failed to load script',
  'Asset load failure',
];

function createConsoleCapture(page) {
  const warnings = [];
  const infoLogs = [];
  page.on('console', (msg) => {
    const text = msg.text();
    if (msg.type() === 'log') {
      infoLogs.push(text);
    }
    if (msg.type() === 'error' || msg.type() === 'warning') {
      warnings.push(text);
    }
  });
  return { warnings, infoLogs };
}

function findUnexpectedWarnings(warnings) {
  return warnings.filter(
    (msg) => !ALLOWED_WARNING_SUBSTRINGS.some((allowed) => msg.includes(allowed)),
  );
}

async function maybeClickStart(page) {
  const startButtonVisible = await page.isVisible('#startButton').catch(() => false);
  if (startButtonVisible) {
    await page.click('#startButton');
  }
}

async function ensureGameHudReady(page, { requireNight = false } = {}) {
  const hudState = await page.evaluate(() => ({
    gameActive: document.body.classList.contains('game-active'),
    heartsMarkup: document.querySelector('#hearts')?.innerHTML ?? '',
    timeText: document.querySelector('#timeOfDay')?.textContent?.trim() ?? '',
    dimensionHeading: document.querySelector('#dimensionInfo h3')?.textContent?.trim() ?? '',
    portalLabel: document.querySelector('#portalProgress .label')?.textContent?.trim() ?? '',
  }));
  if (!hudState.gameActive) {
    throw new Error('HUD did not transition to the active gameplay state.');
  }
  if (!hudState.heartsMarkup || hudState.heartsMarkup.trim().length === 0) {
    throw new Error('Heart display did not initialise.');
  }
  if (!hudState.timeText) {
    throw new Error('Time-of-day indicator remained empty.');
  }
  if (requireNight && !/Nightfall|Dusk/i.test(hudState.timeText)) {
    throw new Error('Day/night indicator did not reflect forced night cycle.');
  }
  if (!hudState.dimensionHeading) {
    throw new Error('Dimension info heading was empty.');
  }
  if (!hudState.portalLabel) {
    throw new Error('Portal progress label did not populate.');
  }
  return hudState;
}

async function waitForLeaderboard(page) {
  await page.waitForFunction(() => {
    const rows = Array.from(document.querySelectorAll('#scoreboardList tr')).filter(
      (row) => row.textContent.trim().length > 0,
    );
    return rows.length > 0;
  }, { timeout: 15000 });

  const { rows, summaries } = await page.evaluate(() => {
    const entries = Array.from(document.querySelectorAll('#scoreboardList tr'))
      .map((row) => row.textContent.replace(/\s+/g, ' ').trim())
      .filter((text) => text.length > 0);
    return {
      rows: entries.length,
      summaries: entries,
    };
  });
  if (rows === 0) {
    throw new Error('Leaderboard failed to populate with the current run.');
  }
  const dimensionLabels = /Origin|Rock|Stone|Tar|Marble|Netherite/i;
  if (!summaries.some((text) => dimensionLabels.test(text))) {
    throw new Error('Leaderboard rows did not include a dimension summary.');
  }
}

async function validateScoreHud(page, { requireDimensionCount = false } = {}) {
  const scoreHud = await page.evaluate(() => ({
    total: Number.parseInt(document.querySelector('#scoreTotal')?.textContent ?? '0', 10),
    recipes: Number.parseInt(document.querySelector('#scoreRecipes')?.textContent ?? '0', 10),
    dimensions: Number.parseInt(document.querySelector('#scoreDimensions')?.textContent ?? '0', 10),
  }));
  if (!Number.isFinite(scoreHud.total) || scoreHud.total < 0) {
    throw new Error('Score HUD did not initialise with a finite total.');
  }
  if (requireDimensionCount && (!Number.isFinite(scoreHud.dimensions) || scoreHud.dimensions < 1)) {
    throw new Error('Dimension counter did not reflect progression.');
  }
  return scoreHud;
}

async function runAdvancedScenario(browser) {
  const page = await browser.newPage();
  const { warnings } = createConsoleCapture(page);
  page.on('pageerror', (err) => {
    throw err;
  });

  try {
    await page.goto('file://' + process.cwd() + '/index.html');
    await maybeClickStart(page);
    await page.waitForFunction(() => document.body.classList.contains('game-active'), {
      timeout: 15000,
    });
    await page.waitForFunction(() => Boolean(window.__INFINITE_RAILS_STATE__), { timeout: 15000 });

    const stateSnapshot = await page.evaluate(() => {
      const state = window.__INFINITE_RAILS_STATE__;
      if (!state) return null;
      const worldRows = Array.isArray(state.world) ? state.world.length : 0;
      const worldCols = Array.isArray(state.world?.[0]) ? state.world[0].length : 0;
      const eventCount = document.querySelectorAll('#eventLog li').length;
      return {
        isRunning: Boolean(state.isRunning),
        worldRows,
        worldCols,
        rendererMode: window.__INFINITE_RAILS_RENDERER_MODE__ ?? null,
        dimensionName: state.dimension?.name ?? null,
        eventCount,
      };
    });
    if (!stateSnapshot || !stateSnapshot.isRunning) {
      throw new Error('Advanced renderer did not start running.');
    }
    if (stateSnapshot.rendererMode !== 'advanced') {
      throw new Error(`Advanced renderer did not report the expected mode flag (saw "${stateSnapshot.rendererMode}").`);
    }
    if (!stateSnapshot.dimensionName) {
      throw new Error('Advanced renderer did not report an active dimension.');
    }
    if (stateSnapshot.worldRows * stateSnapshot.worldCols < 1024) {
      throw new Error('Advanced renderer world generation incomplete.');
    }
    if (stateSnapshot.eventCount === 0) {
      throw new Error('Advanced renderer did not record any event log entries.');
    }

    await ensureGameHudReady(page);
    await waitForLeaderboard(page);
    await validateScoreHud(page);

    const unexpected = findUnexpectedWarnings(warnings);
    if (unexpected.length) {
      throw new Error(`Console reported unexpected issues during advanced run: ${unexpected.join(' | ')}`);
    }
  } finally {
    await page.close();
  }
}

async function runSimpleScenario(browser) {
  const page = await browser.newPage();
  const { warnings, infoLogs } = createConsoleCapture(page);
  page.on('pageerror', (err) => {
    throw err;
  });

  try {
    await page.goto('file://' + process.cwd() + '/index.html?mode=simple');
    await maybeClickStart(page);
    await page.waitForTimeout(1500);
    const introVisible = await page.isVisible('#introModal').catch(() => false);
    if (introVisible) {
      throw new Error('Intro modal remained visible after starting the game.');
    }

    const eventCount = await page.evaluate(() => document.querySelectorAll('#eventLog li').length);
    if (eventCount === 0) {
      throw new Error('Sandbox event log did not record any entries.');
    }

    const worldGenerated = infoLogs.find((line) => line.includes('World generation summary —'));
    if (!worldGenerated) {
      console.warn('World generation log was not captured; relying on debug snapshot.');
    }
    const steveVisible = infoLogs.find((line) => line.includes('Avatar visibility confirmed —'));
    if (!steveVisible) {
      console.warn('Player visibility confirmation log missing; verifying via scene graph.');
    }
    const dimensionLog = infoLogs.find((line) => line.includes('Dimension activation notice —'));
    if (!dimensionLog) {
      console.warn('Dimension activation log missing; relying on HUD validation.');
    }

    await page.waitForFunction(() => Boolean(window.__INFINITE_RAILS_DEBUG__?.getSnapshot), {
      timeout: 15000,
    });
    await page.waitForFunction(
      () => (window.__INFINITE_RAILS_DEBUG__?.getSnapshot?.()?.voxelColumns ?? 0) >= 4096,
      { timeout: 15000 },
    );
    await page.evaluate(() => {
      const debug = window.__INFINITE_RAILS_DEBUG__;
      debug?.forceNight?.();
      debug?.spawnZombieWave?.(3);
    });
    await page.waitForFunction(
      () => (window.__INFINITE_RAILS_DEBUG__?.getSnapshot?.()?.zombieCount ?? 0) > 0,
      { timeout: 10000 },
    );
    const debugSnapshot = await page.evaluate(() =>
      window.__INFINITE_RAILS_DEBUG__?.getSnapshot ? window.__INFINITE_RAILS_DEBUG__.getSnapshot() : null,
    );
    if (!debugSnapshot) {
      throw new Error('Debug snapshot unavailable — gameplay instance not exposed.');
    }
    if (!debugSnapshot.started) {
      throw new Error('Gameplay instance did not report a started state.');
    }
    if (debugSnapshot.voxelColumns < 4096) {
      throw new Error(`World generation incomplete — expected 4096 columns, saw ${debugSnapshot.voxelColumns}.`);
    }
    if (debugSnapshot.sceneChildren < 3) {
      throw new Error('Scene graph missing expected child nodes.');
    }

    await ensureGameHudReady(page, { requireNight: true });

    await page.evaluate(() => {
      const debug = window.__INFINITE_RAILS_DEBUG__;
      debug?.completePortalFrame?.();
      debug?.ignitePortal?.();
    });
    await page.waitForFunction(
      () => Boolean(window.__INFINITE_RAILS_DEBUG__?.getSnapshot?.()?.portalActivated),
      { timeout: 8000 },
    );
    await page.evaluate(() => {
      window.__INFINITE_RAILS_DEBUG__?.advanceDimension?.();
    });
    await page.waitForFunction(
      () => (window.__INFINITE_RAILS_DEBUG__?.getSnapshot?.()?.dimensionIndex ?? 0) > 0,
      { timeout: 10000 },
    );

    await waitForLeaderboard(page);
    await validateScoreHud(page, { requireDimensionCount: true });

    if (!debugSnapshot.hudActive) {
      throw new Error('Debug snapshot indicates HUD inactive despite gameplay start.');
    }

    const unexpected = findUnexpectedWarnings(warnings);
    if (unexpected.length) {
      throw new Error(`Console reported unexpected issues during sandbox run: ${unexpected.join(' | ')}`);
    }
  } finally {
    await page.close();
  }
}

async function run() {
  let browser;
  try {
    browser = await chromium.launch();
  } catch (error) {
    const message = error?.message || '';
    const missingExecutable = message.includes("Executable doesn't exist");
    const missingDeps = message.includes('Host system is missing dependencies');
    if (missingExecutable || missingDeps) {
      console.warn(
        `Skipping E2E smoke test (${missingExecutable ? 'browser download required' : 'system dependencies unavailable'}).`,
      );
      console.warn('Details:', message.trim());
      return;
    }
    throw error;
  }

  try {
    await runAdvancedScenario(browser);
    await runSimpleScenario(browser);
    console.error(
      'E2E smoke test completion checkpoint — review scenario assertions if this emits during a failing run; success must be validated by test expectations rather than console output.',
    );
  } finally {
    await browser?.close?.();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
