const { chromium } = require('playwright');

async function run() {
  let browser;
  try {
    browser = await chromium.launch();
  } catch (error) {
    const message = error?.message || '';
    const missingExecutable = message.includes('Executable doesn\'t exist');
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

  const page = await browser.newPage();
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
  page.on('pageerror', (err) => {
    throw err;
  });
  try {
    await page.goto('file://' + process.cwd() + '/index.html?mode=simple');
    const startButtonVisible = await page.isVisible('#startButton').catch(() => false);
    if (startButtonVisible) {
      await page.click('#startButton');
    }
    await page.waitForTimeout(1500);
    const introVisible = await page.isVisible('#introModal').catch(() => false);
    if (introVisible) {
      throw new Error('Intro modal remained visible after starting the game.');
    }
    const eventCount = await page.evaluate(() => document.querySelectorAll('#eventLog li').length);
    const worldGenerated = infoLogs.find((line) => line.includes('World generated:'));
    if (!worldGenerated) {
      console.warn('World generation log was not captured; relying on debug snapshot.');
    }
    const steveVisible = infoLogs.find((line) => line.includes('Steve visible in scene'));
    if (!steveVisible) {
      console.warn('Player visibility confirmation log missing; verifying via scene graph.');
    }
    const dimensionLog = infoLogs.find((line) => line.includes('Dimension online:'));
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
    if (!hudState.dimensionHeading) {
      throw new Error('Dimension info heading was empty.');
    }
    if (!hudState.portalLabel) {
      throw new Error('Portal progress label did not populate.');
    }
    const leaderboardRows = await page.evaluate(() =>
      Array.from(document.querySelectorAll('#scoreboardList tr')).filter((row) => row.textContent.trim().length > 0).length,
    );
    if (leaderboardRows === 0) {
      throw new Error('Leaderboard failed to populate with the current run.');
    }
    const leaderboardSummaries = await page.evaluate(() =>
      Array.from(document.querySelectorAll('#scoreboardList tr'))
        .map((row) => row.textContent.replace(/\s+/g, ' ').trim())
        .filter((text) => text.length > 0),
    );
    const dimensionLabels = /Origin|Rock|Stone|Tar|Marble|Netherite/i;
    if (!leaderboardSummaries.some((text) => dimensionLabels.test(text))) {
      throw new Error('Leaderboard rows did not include a dimension summary.');
    }
    if (!debugSnapshot.hudActive) {
      throw new Error('Debug snapshot indicates HUD inactive despite gameplay start.');
    }
    const unexpected = warnings.filter((msg) =>
      !msg.includes('accounts.google.com') &&
      !msg.includes('ERR_CERT_AUTHORITY_INVALID') &&
      !msg.includes('GPU stall') &&
      !msg.includes('Automatic fallback to software WebGL') &&
      !msg.includes('URL scheme "file" is not supported') &&
      !msg.includes('Failed to load model') &&
      !msg.includes('Model load failed')
    );
    if (unexpected.length) {
      throw new Error(`Console reported unexpected issues: ${unexpected.join(' | ')}`);
    }
    console.log('E2E smoke test passed.');
  } finally {
    await browser?.close?.();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
