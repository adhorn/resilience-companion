/**
 * Take a screenshot of a specific page/tab in the Resilience Companion.
 * Usage: node scripts/screenshot.mjs [url] [output] [clickText]
 *
 * Examples:
 *   node scripts/screenshot.mjs http://localhost:5175/orrs/ID /tmp/shot.png
 *   node scripts/screenshot.mjs http://localhost:5175/orrs/ID /tmp/shot.png "Learning"
 */
import playwright from 'playwright';

const url = process.argv[2] || 'http://localhost:5175';
const output = process.argv[3] || '/tmp/screenshot.png';
const clickText = process.argv[4];

const browser = await playwright.chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto(url);
await page.waitForLoadState('networkidle');

if (clickText) {
  const buttons = page.locator('button');
  const count = await buttons.count();
  for (let i = 0; i < count; i++) {
    const text = await buttons.nth(i).textContent();
    if (text?.includes(clickText)) {
      await buttons.nth(i).click();
      break;
    }
  }
  await page.waitForTimeout(2000);
}

await page.screenshot({ path: output, fullPage: true });
await browser.close();
console.log(`Screenshot saved to ${output}`);
