import { describe, expect, it } from "vitest";
import { TauriDocumentGateway } from "./tauriGateway";

describe("Tauri document gateway capabilities", () => {
  it("advertises revision queries as host-deferred without a throwing query stub", () => {
    const gateway = new TauriDocumentGateway();

    expect(gateway.revisionQueryCapability).toEqual({
      kind: "unavailable",
      reason: "host-deferred",
    });
    expect("materializeRevision" in gateway).toBe(false);
  });
});
