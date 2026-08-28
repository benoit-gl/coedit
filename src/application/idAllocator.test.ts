import { describe, expect, it } from "vitest";

import { isCanonicalUuidV4 } from "../domain/index.js";
import { createWebCryptoDurableIdAllocator } from "./idAllocator.js";

describe("Web Crypto durable ID allocation", () => {
  it("returns canonical UUID-v4 text without a type discriminator", () => {
    const allocator = createWebCryptoDurableIdAllocator();
    const ids = [
      allocator.createDocumentId(),
      allocator.createBlockId(),
      allocator.createInlineContentId(),
    ];

    expect(ids.every((id) => isCanonicalUuidV4(id))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
