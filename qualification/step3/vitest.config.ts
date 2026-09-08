import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["qualification/step3/**/*.qual.ts"],
  },
});
