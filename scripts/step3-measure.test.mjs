import { test } from "vitest";
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath, URL } from "node:url";

const runner = fileURLToPath(new URL("./step3-measure.mjs", import.meta.url));
test("measurement refuses to overwrite an existing checkpoint", () => {
  const directory = mkdtempSync(join(process.cwd(), "measure-test-"));
  try {
    const evidence = join(directory, "step3-evidence");
    mkdirSync(evidence);
    const path = join(evidence, "measurements.json");
    writeFileSync(path, "prior evidence\n");
    const child = spawnSync(process.execPath, [runner], {
      cwd: directory,
      encoding: "utf8",
      timeout: 30_000,
    });
    assert.notEqual(child.status, 0);
    assert.match(child.stderr, /EEXIST/);
    assert.equal(readFileSync(path, "utf8"), "prior evidence\n");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
