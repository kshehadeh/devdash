import { defineConfig } from "@playwright/test";

/**
 * E2E tests require a built app. Run before testing:
 *   bun run build && bun run electron:compile
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  retries: 0,
  use: {
    trace: "on-first-retry",
  },
});
