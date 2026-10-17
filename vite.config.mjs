import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  base: "./",
  build: {
    minify: true,
    sourcemap: true,
  },
  test: {
    exclude: [...configDefaults.exclude, "qualification/**/*.browser.test.ts"],
  },
});
