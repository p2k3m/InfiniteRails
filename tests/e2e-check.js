const { chromium } = require('playwright');

async function run() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const warnings = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      warnings.push(msg.text());
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
