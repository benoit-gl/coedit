import { expect, it } from "vitest";
import { runYjsTextPreflightComparison } from "./yjsTextPreflightComparison.js";

it("compares matched reference and ASCII shortcut and observes fallback", () => {
  const result = runYjsTextPreflightComparison(1);
  expect(result.rows).toHaveLength(5);
  const ascii = result.rows.find((row) => row.profile.name === "ascii-4096")!;
  expect(ascii.temporaryTextUnits.native).toBe(8193);
  expect(ascii.temporaryTextUnits.ascii).toBe(0);
  expect(ascii.measured.native).toHaveLength(1);
  const unicode = result.rows.find(
    (row) => row.profile.name === "unicode-fallback",
  )!;
  expect(unicode.temporaryTextUnits.ascii).toBe(
    unicode.temporaryTextUnits.native,
  );
  expect(unicode.temporaryTextUnits.native).toBeGreaterThan(0);
});
