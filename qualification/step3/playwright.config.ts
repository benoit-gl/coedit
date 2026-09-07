import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";

const evidenceDirectory = resolve(
  process.cwd(),
  process.env.COEDIT_STEP3_EVIDENCE_DIR ?? "artifacts/step3",
);

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.pw.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 15_000,
  reporter: [
    ["list"],
    ["json", { outputFile: resolve(evidenceDirectory, "playwright.json") }],
  ],
  use: {
    baseURL: "http://127.0.0.1:5173",
    browserName: "chromium",
    headless: true,
    permissions: ["clipboard-read", "clipboard-write"],
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
