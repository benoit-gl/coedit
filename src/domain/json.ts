import type { JsonObject, JsonValue } from "./types";

function pathFor(parent: string, key: string | number): string {
  return typeof key === "number" ? `${parent}[${key}]` : `${parent}.${key}`;
}

function cloneValue(value: unknown, path: string, ancestors: Set<object>): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`${path} contains a non-finite number.`);
    return value;
  }
  if (typeof value !== "object") throw new TypeError(`${path} is not JSON-compatible.`);
  if (ancestors.has(value)) throw new TypeError(`${path} contains a circular reference.`);

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.getOwnPropertySymbols(value).length > 0) {
        throw new TypeError(`${path} contains symbol properties.`);
      }
      const extraKeys = Object.getOwnPropertyNames(value).filter((key) => {
        if (key === "length") return false;
        const index = Number(key);
        return !Number.isSafeInteger(index) || index < 0 || index >= value.length || String(index) !== key;
      });
      if (extraKeys.length > 0) throw new TypeError(`${path} contains non-index array properties.`);

      const result: JsonValue[] = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor) {
          throw new TypeError(`${pathFor(path, index)} is a sparse array element.`);
        }
        if (!descriptor.enumerable || !("value" in descriptor)) {
          throw new TypeError(`${pathFor(path, index)} is not an enumerable data property.`);
        }
        result.push(cloneValue(descriptor.value, pathFor(path, index), ancestors));
      }
      return result;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(`${path} contains a non-plain object.`);
    }
    if (Object.getOwnPropertySymbols(value).length > 0) {
      throw new TypeError(`${path} contains symbol properties.`);
    }

    const result: JsonObject = {};
    for (const key of Object.getOwnPropertyNames(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !("value" in descriptor)) {
        throw new TypeError(`${pathFor(path, key)} is not an enumerable data property.`);
      }
      Object.defineProperty(result, key, {
        configurable: true,
        enumerable: true,
        writable: true,
        value: cloneValue(descriptor.value, pathFor(path, key), ancestors),
      });
    }
    return result;
  } finally {
    ancestors.delete(value);
  }
}

/** Validates a value as JSON data and returns a detached copy. */
export function cloneJson<T>(value: T): T {
  return cloneValue(value, "$", new Set()) as T;
}

export function cloneJsonObject(value: unknown): JsonObject {
  const cloned = cloneValue(value, "$", new Set());
  if (cloned === null || Array.isArray(cloned) || typeof cloned !== "object") {
    throw new TypeError("$ must be a JSON object.");
  }
  return cloned;
}

function compareUtf16(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function serialize(value: JsonValue): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(serialize).join(",")}]`;

  return `{${Object.keys(value)
    .sort(compareUtf16)
    .map((key) => `${JSON.stringify(key)}:${serialize(value[key])}`)
    .join(",")}}`;
}

/**
 * Serializes JSON data deterministically. Object keys use explicit UTF-16 code-unit
 * ordering and are emitted directly, so JavaScript's integer-key enumeration rules
 * cannot reorder the canonical representation.
 */
export function canonicalJson(value: unknown): string {
  return serialize(cloneValue(value, "$", new Set()));
}

export function compareJsonStrings(left: string, right: string): number {
  return compareUtf16(left, right);
}
