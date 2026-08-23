import { test, expect } from '@playwright/test';

// E2E test Paparazzi API — data collector a ekosystémový přehled.
// Tyto testy volají reálné Paparazzi endpointy na backendu (:8891).
// Vyžadují, aby backend běžel (node server/index.cjs).

const API = 'http://localhost:8891';

test.describe('Paparazzi API', () => {
  test('1. /health vrací ok', async ({ request }) => {
    const res = await request.get(`${API}/health`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.uptime).toBeGreaterThan(0);
  });

  test('2. /api/paparazzi/data vrací projekty + summary', async ({ request }) => {
    const res = await request.get(`${API}/api/paparazzi/data`);
    expect(res.status()).toBe(200);
    const body = await res.json();

    // Projekty — pole objektů s klíčovými poli
    expect(Array.isArray(body.projects)).toBe(true);
    expect(body.projects.length).toBeGreaterThan(0);

    // První projekt má správná pole
    const p = body.projects[0];
    expect(p.name).toBeTruthy();
    expect(p).toHaveProperty('lastHash');
    expect(p).toHaveProperty('lastMsg');
    expect(p).toHaveProperty('lastCommitAgo');
    expect(p).toHaveProperty('branch');
    expect(p).toHaveProperty('dirty');
    expect(p).toHaveProperty('activity');
    expect(p).toHaveProperty('health');

    // Summary — agregovaný přehled
    expect(body.summary).toBeTruthy();
  });

  test('3. /api/paparazzi/data — health je v rozsahu 0-100', async ({ request }) => {
    const res = await request.get(`${API}/api/paparazzi/data`);
    const body = await res.json();
    for (const p of body.projects) {
      expect(p.health).toBeGreaterThanOrEqual(0);
      expect(p.health).toBeLessThanOrEqual(100);
    }
  });

  test('4. /api/paparazzi vrací captures (screenshoty)', async ({ request }) => {
    const res = await request.get(`${API}/api/paparazzi`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('5. /api/paparazzi/report vrací SSE stream (Manažer Report)', async ({ request }) => {
    test.setTimeout(90000); // report generuje LLM text, může trvat

    const res = await request.get(`${API}/api/paparazzi/report`);
    expect(res.status()).toBe(200);

    // Report je nyní SSE stream (text/event-stream), ne JSON
    const contentType = res.headers()['content-type'] || '';
    expect(contentType).toContain('text/event-stream');

    // Přečti stream a ověř, že obsahuje data
    const text = await res.text();
    expect(text).toContain('data:');
  });

  test('6. /api/projects vrací seznam projektů', async ({ request }) => {
    const res = await request.get(`${API}/api/projects`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    expect(body[0]).toHaveProperty('name');
  });
});
