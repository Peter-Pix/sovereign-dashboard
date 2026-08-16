import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:3205';

// E2E testy chybových stavů.
// Tyto testy ověřují, že frontend správně zobrazuje chyby,
// když backend neběží nebo vrací chyby.

test.describe('Chybové stavy', () => {
  test('1. Pulse zobrazí chybu, když backend neběží', async ({ page }) => {
    // Simulujeme backend down tím, že přejdeme na neexistující API
    // (použijeme page.route pro mock chyby)
    await page.route('**/api/projects', (route) => {
      route.fulfill({ status: 500, body: 'Internal Server Error' });
    });

    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.locator('button', { hasText: 'Pulse' }).first().click();

    // Měla by se zobrazit chyba
    await expect(page.locator('text=Chyba:')).toBeVisible({ timeout: 10000 });
  });

  test('2. Agenti zobrazí chybu, když backend neběží', async ({ page }) => {
    await page.route('**/api/agents', (route) => {
      route.fulfill({ status: 500, body: 'Internal Server Error' });
    });

    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.locator('button', { hasText: 'Agenti' }).first().click();

    await expect(page.locator('text=Chyba:')).toBeVisible({ timeout: 10000 });
  });

  test('3. Neexistující agent vrátí chybu (API test)', async ({ request }) => {
    const response = await request.post('http://localhost:8891/api/agents/neexistuje/run');
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.error).toContain('Neznámý agent');
  });

  test('4. Neexistující projekt vrátí chybu (API test)', async ({ request }) => {
    const response = await request.get('http://localhost:8891/api/projects/neexistuje');
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.error).toContain('Project not found');
  });

  test('5. Rate limiting — max 2 paralelní joby', async ({ request }) => {
    // Spustíme 3 joby najednou, třetí by měl vrátit 429.
    // POZOR: první 2 joby spustí reálnou exekuci (pomalé), takže
    // použijeme krátký timeout a ověříme jen status kód.
    const responses = await Promise.allSettled([
      request.post('http://localhost:8891/api/agents/archivist/run', { timeout: 3000 }),
      request.post('http://localhost:8891/api/agents/scout/run', { timeout: 3000 }),
      request.post('http://localhost:8891/api/agents/strategist/run', { timeout: 3000 }),
    ]);
    const statuses = responses.map((r) => (r.status === 'fulfilled' ? r.value.status() : 0));
    // Alespoň jeden by měl být 429 (rate limited)
    expect(statuses).toContain(429);
  });
});
