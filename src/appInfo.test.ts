import { describe, expect, it } from "vitest";

import { getApplicationName } from "./appInfo";

describe("getApplicationName", () => {
  it("returns the Coedit product name", () => {
    expect(getApplicationName()).toBe("Coedit");
  });
});
