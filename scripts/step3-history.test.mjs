import { test } from "vitest";
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";

for (const candidate of ["yjs", "automerge"]) {
  test(`${candidate} reports separate history measurements`, () => {
    const child = spawnSync(process.execPath, ["scripts/step3-history.mjs"], {
      env: {
        ...process.env,
        STEP3_HISTORY_CANDIDATE: candidate,
        STEP3_HISTORY_COUNT: "10",
      },
      encoding: "utf8",
      timeout: 30_000,
    });
    assert.equal(child.status, 0, child.stderr);
    const result = JSON.parse(child.stdout.match(/^STEP3_HISTORY (.+)$/m)[1]);
    assert.equal(result.outcome, "completed");
    assert.ok(result.editLoopMs >= 0);
    assert.ok(result.encodeMs >= 0);
    assert.ok(result.encodedBytes > 0);
    assert.ok(result.peakRss.value > 0);
    assert.equal(result.peakRss.unit, "KiB");
  });
}
