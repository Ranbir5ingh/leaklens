import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end flows against a running app (BASE_URL, default http://localhost:3000) with seeded data.
 * Start the app with `npm run build && npm start` (or `npm run dev`) after `npm run db:setup`.
 * Set PW_CHROME=/path/to/chrome to use a system Chrome instead of Playwright's bundled browser.
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    launchOptions: process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME, args: ["--no-sandbox"] } : {},
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } }, grepInvert: /@phone/ },
    { name: "phone", use: { ...devices["Pixel 7"] }, grep: /@phone/ },
  ],
});
