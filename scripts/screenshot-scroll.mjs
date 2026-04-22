import playwright from 'playwright';

const url = process.argv[2] || 'http://localhost:5175';
const output = process.argv[3] || '/tmp/screenshot.png';
const clickText = process.argv[4];
const scrollPixels = parseInt(process.argv[5] || '0');

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

if (scrollPixels) {
  await page.evaluate((px) => window.scrollTo(0, px), scrollPixels);
  await page.waitForTimeout(500);
}

await page.screenshot({ path: output, fullPage: false });
await browser.close();
console.log(`Screenshot saved to ${output}`);
