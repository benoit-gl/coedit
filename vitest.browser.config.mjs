import { playwright } from "@vitest/browser-playwright";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@automerge/automerge": fileURLToPath(
        new URL(
          "./node_modules/@automerge/automerge/dist/mjs/entrypoints/fullfat_base64.js",
          import.meta.url,
        ),
      ),
    },
  },
  test: {
    include: ["qualification/**/*.browser.test.ts"],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
      trace: {
        mode: "retain-on-failure",
        tracesDir: "browser-traces",
      },
    },
  },
});
