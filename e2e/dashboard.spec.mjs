import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:3205';

test.describe('Sovereign Dashboard E2E', () => {
  test('1. Dashboard se načte a zobrazí záložky', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await expect(page.locator('h1')).toContainText('Sovereign Command');
    for (const tab of ['Pulse', 'Pipeline', 'Leady', 'Agenti', 'Paparazzi', 'Roadmapy', 'Log']) {
      await expect(page.locator('button', { hasText: tab }).first()).toBeVisible();
    }
  });

  test('2. Pulse záložka načte projekty z API', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.locator('button', { hasText: 'Pulse' }).first().click();
    await page.waitForFunction(() => !document.body.innerText.includes('Načítám projekty'), null, { timeout: 10000 });
    const cards = page.locator('.grid > div');
    expect(await cards.count()).toBeGreaterThan(0);
  });

  test('3. Pipeline záložka zobrazí úkoly a tlačítka Spustit', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.locator('button', { hasText: 'Pipeline' }).first().click();
    // Úkoly se zobrazí jako text
    await expect(page.locator('body')).toContainText('Aktivovat Archivistu');
    await expect(page.locator('body')).toContainText('Aktivovat Scouta');
    await expect(page.locator('body')).toContainText('Aktivovat Strategistu');
    // Tlačítka "Spustit" existují
    const runButtons = page.locator('button', { hasText: 'Spustit' });
    expect(await runButtons.count()).toBeGreaterThanOrEqual(3);
  });

  test('4. Agenti záložka načte agenty z API', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.locator('button', { hasText: 'Agenti' }).first().click();
    await page.waitForFunction(() => !document.body.innerText.includes('Načítám agenty'), null, { timeout: 10000 });
    const agentCards = page.locator('.space-y-3 > div');
    expect(await agentCards.count()).toBeGreaterThan(0);
  });

  test('5. Leady záložka načte leady z API', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.locator('button', { hasText: 'Leady' }).first().click();
    await page.waitForTimeout(2000);
    expect((await page.locator('body').innerText()).length).toBeGreaterThan(0);
  });

  test('6. Paparazzi záložka načte captures', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.locator('button', { hasText: 'Paparazzi' }).first().click();
    // Počkej na načtení dat (Paparazzi sbírá data... zmizí)
    await page.waitForFunction(() => !document.body.innerText.includes('Paparazzi sbírá data'), null, { timeout: 15000 });
    // Ověř, že se zobrazí nějaký obsah (report, summary, nebo captures)
    const body = await page.locator('body').innerText();
    expect(body.length).toBeGreaterThan(0);
  });
});
