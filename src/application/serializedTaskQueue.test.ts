import { describe, expect, it } from "vitest";
import { SerializedTaskQueue } from "./serializedTaskQueue";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

describe("SerializedTaskQueue", () => {
  it("does not start the next task until the current task settles", async () => {
    const queue = new SerializedTaskQueue();
    const first = deferred<string>();
    const events: string[] = [];

    const firstResult = queue.enqueue(async () => {
      events.push("first:start");
      const value = await first.promise;
      events.push("first:end");
      return value;
    });
    const secondResult = queue.enqueue(async () => {
      events.push("second:start");
      return "second";
    });

    await Promise.resolve();
    expect(events).toEqual(["first:start"]);
    first.resolve("first");
    await expect(firstResult).resolves.toBe("first");
    await expect(secondResult).resolves.toBe("second");
    expect(events).toEqual(["first:start", "first:end", "second:start"]);
  });

  it("continues after a failed task", async () => {
    const queue = new SerializedTaskQueue();
    const failure = new Error("save failed");
    const first = queue.enqueue(async () => { throw failure; });
    const second = queue.enqueue(async () => "recovered");

    await expect(first).rejects.toBe(failure);
    await expect(second).resolves.toBe("recovered");
  });
});
