const { chromium } = require('playwright');

async function run() {
  const browser = await chromium.launch();
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
    await page.goto('file://' + process.cwd() + '/index.html');
    await page.click('#startButton');
    await page.waitForTimeout(1500);
    const introVisible = await page.isVisible('#introModal').catch(() => false);
    if (introVisible) {
      throw new Error('Intro modal remained visible after starting the game.');
    }
    const eventCount = await page.evaluate(() => document.querySelectorAll('#eventLog li').length);
    if (eventCount === 0) {
      throw new Error('No events were logged after starting the game.');
    }
    const worldGenerated = infoLogs.find((line) => line.includes('World generated:'));
    if (!worldGenerated) {
      throw new Error('World generation log was not emitted.');
    }
    const steveVisible = infoLogs.find((line) => line.includes('Steve visible in scene'));
    if (!steveVisible) {
      throw new Error('Player visibility confirmation log missing.');
    }
    const dimensionLog = infoLogs.find((line) => line.includes('Dimension online:'));
    if (!dimensionLog) {
      throw new Error('Dimension activation log missing.');
    }
    const hudState = await page.evaluate(() => ({
      gameActive: document.body.classList.contains('game-active'),
      heartsMarkup: document.querySelector('#hearts')?.innerHTML ?? '',
      timeText: document.querySelector('#timeOfDay')?.textContent?.trim() ?? '',
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
    const unexpected = warnings.filter((msg) =>
      !msg.includes('accounts.google.com') &&
      !msg.includes('ERR_CERT_AUTHORITY_INVALID') &&
      !msg.includes('GPU stall') &&
      !msg.includes('Automatic fallback to software WebGL')
    );
    if (unexpected.length) {
      throw new Error(`Console reported unexpected issues: ${unexpected.join(' | ')}`);
    }
    console.log('E2E smoke test passed.');
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
