import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  // Defaultně vyloučíme @slow testy (reálná exekuce agenta — 5 min + tokeny)
  grepInvert: /@slow/,
  use: {
    baseURL: 'http://localhost:3205',
    headless: true,
  },
  reporter: [['list']],
});
