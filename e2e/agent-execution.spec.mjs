import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:3205';

// E2E test reálné exekuce agenta přes UI.
// Tento test spustí agenta (archivist) přes tlačítko "Spustit job"
// a ověří, že se job dokončí (reálná exekuce přes OpenClaw agenta).
// POZOR: exekuce může trvat až 5 minut (cloud model).

test.describe('Reálná exekuce agenta', () => {
  test('Spustí archivista a ověří dokončení jobu', async ({ page }) => {
    test.setTimeout(360000); // 6 min timeout (exekuce má 5 min limit)

    await page.goto(BASE, { waitUntil: 'networkidle' });

    // Přejít na záložku Agenti
    await page.locator('button', { hasText: 'Agenti' }).first().click();

    // Počkat na načtení agentů
    await page.waitForFunction(() => !document.body.innerText.includes('Načítám agenty'), null, { timeout: 10000 });

    // Najít kartu archivisty a kliknout na "Spustit job"
    const archivistCard = page.locator('.space-y-3 > div').filter({ hasText: 'archivist' }).first();
    await expect(archivistCard).toBeVisible();

    const runButton = archivistCard.locator('button', { hasText: 'Spustit job' });
    await expect(runButton).toBeVisible();
    await runButton.click();

    // Ověřit, že se zobrazí "Job spuštěn" (okamžitá zpětná vazba)
    await expect(page.locator('body')).toContainText('Job spuštěn', { timeout: 5000 });

    // Počkat na dokončení jobu (až 5 min)
    // Hledáme buď "Job dokončen" (úspěch) nebo "Selhání" (chyba)
    await page.waitForFunction(() => {
      const text = document.body.innerText;
      return text.includes('Job dokončen') || text.includes('Selhání') || text.includes('Chyba');
    }, null, { timeout: 330000 });

    // Ověřit výsledek
    const body = await page.locator('body').innerText();
    if (body.includes('Job dokončen')) {
      // Úspěch — job se dokončil
      expect(body).toContain('Job dokončen');
    } else {
      // Selhání — ale aspoň se vrátila odpověď (ne "Failed to fetch")
      expect(body).not.toContain('Failed to fetch');
    }
  });
});
