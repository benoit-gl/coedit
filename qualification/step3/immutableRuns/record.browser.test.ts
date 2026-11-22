import { expect, it } from "vitest";
import { commitRecordV1, decodeRecordKeyV1 } from "./record.js";

it("matches browser Web Crypto for exact canonical UTF-16 source commitments", async () => {
  const uuid = (n: number): string =>
    `c2000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
  // Grammar/hash verification does not admit this string to a native text carrier.
  const source = "A😀\ud800Z\n";
  const tuple = [
    "coedit-step3-record",
    1,
    uuid(10),
    "run",
    ["text", uuid(2), uuid(3)],
    ["1", uuid(4)],
    [[uuid(5), "0".repeat(64)], null],
    ["actor", "effect"],
    uuid(6),
    ["payload", 0, 0],
    [null, source, ["human", "origin"]],
  ];
  const entry = commitRecordV1(tuple);
  const canonical = JSON.stringify(tuple);
  const expected = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical)),
  );
  expect(entry.canonical).toBe(canonical);
  expect(entry.commitment).toBe(
    [...expected].map((n) => n.toString(16).padStart(2, "0")).join(""),
  );
  expect(decodeRecordKeyV1(entry.key, true)).toEqual(entry);
  expect(entry.canonical).toContain("\\ud800");
});
