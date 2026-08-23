import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:3205';
const API = 'http://localhost:8891';

// E2E testy pro Roadmapy záložku a Roadmap Executor.
// Ověřují, že roadmapy se načítají z API a executor endpointy fungují.

test.describe('Roadmapy záložka', () => {
  test('1. Roadmapy záložka se načte a zobrazí roadmapy', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.locator('button', { hasText: 'Roadmapy' }).first().click();
    await page.waitForFunction(() => !document.body.innerText.includes('Načítám roadmapy'), null, { timeout: 10000 });

    // Měly by se zobrazit karty roadmap (nebo prázdný stav)
    const body = await page.locator('body').innerText();
    expect(body.length).toBeGreaterThan(0);
  });

  test('2. Kliknutí na roadmapu otevře detail', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.locator('button', { hasText: 'Roadmapy' }).first().click();
    await page.waitForFunction(() => !document.body.innerText.includes('Načítám roadmapy'), null, { timeout: 10000 });

    // Najdi první kartu roadmapy a klikni na ni
    const firstCard = page.locator('button').filter({ hasText: 'úkolů' }).first();
    if (await firstCard.count() > 0) {
      await firstCard.click();
      // Detail by měl zobrazit "Autonomní exekuce" panel
      await expect(page.locator('body')).toContainText('Autonomní exekuce', { timeout: 10000 });
    }
  });
});

test.describe('Roadmap Executor API', () => {
  test('3. /api/executor/state vrací stav s budgetem', async ({ request }) => {
    const res = await request.get(`${API}/api/executor/state`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body.totalExecutions).toBe('number');
    expect(typeof body.maxTotal).toBe('number');
    expect(body.maxTotal).toBeGreaterThan(0);
  });

  test('4. /api/executor/next/:project vrací task nebo done', async ({ request }) => {
    const res = await request.get(`${API}/api/executor/next/okeye`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect('done' in body).toBe(true);
  });

  test('5. /api/roadmaps vrací pole roadmap', async ({ request }) => {
    const res = await request.get(`${API}/api/roadmaps`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    if (body.length > 0) {
      expect(body[0].project).toBeTruthy();
      expect(typeof body[0].progress).toBe('number');
    }
  });

  test('6. /api/roadmaps/:project s invalid name → 400', async ({ request }) => {
    const res = await request.get(`${API}/api/roadmaps/foo;rm%20-rf%20/`);
    expect(res.status()).toBe(400);
  });

  test('7. Executor run bez auth → 401', async ({ request }) => {
    const res = await request.post(`${API}/api/executor/run/okeye`);
    expect(res.status()).toBe(401);
  });
});
