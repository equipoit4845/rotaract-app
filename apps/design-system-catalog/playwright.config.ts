import { defineConfig } from "@playwright/test";

// Visual regression only — a11y testing has its own runner (test:a11y,
// via @storybook/test-runner) and its own server on port 6007... no, on
// 6007 too but as a separate process; Playwright's `webServer` here starts
// its own instance on 6009 to avoid colliding with a `test:a11y` run in
// the same CI job.
export default defineConfig({
  testDir: "./visual",
  snapshotPathTemplate: "{testDir}/__screenshots__/{arg}{ext}",
  fullyParallel: true,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:6009",
    viewport: { width: 1280, height: 800 },
    trace: "off",
    launchOptions: { args: ["--no-sandbox"] },
  },
  expect: {
    // Element-scoped (see visual/story.ts), so this is tight on purpose —
    // a full-page ratio here would dilute a real single-component color
    // regression well under threshold (caught during setup, see story.ts).
    toHaveScreenshot: { maxDiffPixelRatio: 0.01 },
  },
  webServer: {
    command: "npx http-server storybook-static -p 6009 -s",
    port: 6009,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
