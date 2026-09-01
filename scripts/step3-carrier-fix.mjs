import { readFile, writeFile } from "node:fs/promises";

async function replaceIn(path, replacements) {
  let text = await readFile(path, "utf8");
  for (const [from, to] of replacements) {
    if (!text.includes(from)) {
      throw new Error(
        `Expected text not found in ${path}: ${from.slice(0, 120)}`,
      );
    }
    text = text.replace(from, to);
  }
  await writeFile(path, text, "utf8");
}

await replaceIn("src/carrier/automergeContentCarrier.ts", [
  [
    `  /** Deletes one UTF-16 logical range after translating it to scalar offsets. */\n  public deleteRange(start: number, end: number): void {\n    const startScalar = utf16ToScalarIndex(this.document.text, start);\n    const endScalar = utf16ToScalarIndex(this.document.text, end);\n    if (endScalar < startScalar) {\n      throw new RangeError("Carrier range end must not precede its start.");\n    }\n    if (endScalar === startScalar) {\n      return;\n    }\n    this.document = Automerge.change(this.document, (draft) => {\n      Automerge.splice(\n        draft,\n        [...TEXT_PATH],\n        startScalar,\n        endScalar - startScalar,\n      );\n    });\n  }`,
    `  /** Deletes one UTF-16/code-unit logical range. */\n  public deleteRange(start: number, end: number): void {\n    assertRange(start, end, this.document.text.length);\n    if (start === end) {\n      return;\n    }\n    this.document = Automerge.change(this.document, (draft) => {\n      Automerge.splice(draft, [...TEXT_PATH], start, end - start);\n    });\n  }`,
  ],
  [
    `    const start = utf16ToScalarIndex(this.document.text, mark.start);\n    const end = utf16ToScalarIndex(this.document.text, mark.end);\n    if (end <= start) {`,
    `    assertRange(mark.start, mark.end, this.document.text.length);\n    const { start, end } = mark;\n    if (end <= start) {`,
  ],
  [
    `        start: scalarToUtf16Index(this.document.text, mark.start),\n        end: scalarToUtf16Index(this.document.text, mark.end),`,
    `        start: mark.start,\n        end: mark.end,`,
  ],
  [
    `  /** Creates one Automerge cursor after UTF-16 to scalar translation. */\n  public createCursor(offset: number, affinity: "before" | "after"): string {\n    const scalar = utf16ToScalarIndex(this.document.text, offset);\n    return Automerge.getCursor(this.document, [...TEXT_PATH], scalar, affinity);\n  }\n\n  /** Resolves one Automerge cursor and translates it back to a UTF-16 offset. */\n  public resolveCursor(cursor: string): number | undefined {\n    try {\n      const scalar = Automerge.getCursorPosition(\n        this.document,\n        [...TEXT_PATH],\n        cursor,\n      );\n      return scalarToUtf16Index(this.document.text, scalar);\n    } catch {\n      return undefined;\n    }\n  }`,
    `  /** Creates one Automerge cursor at a UTF-16/code-unit offset. */\n  public createCursor(offset: number, affinity: "before" | "after"): string {\n    assertOffset(offset, this.document.text.length);\n    return Automerge.getCursor(this.document, [...TEXT_PATH], offset, affinity);\n  }\n\n  /** Resolves one Automerge cursor to a UTF-16/code-unit offset. */\n  public resolveCursor(cursor: string): number | undefined {\n    try {\n      return Automerge.getCursorPosition(this.document, [...TEXT_PATH], cursor);\n    } catch {\n      return undefined;\n    }\n  }`,
  ],
  [
    `    const scalarOffset = utf16ToScalarIndex(this.document.text, offset);\n    const insertedScalars = [...inserted].length;`,
    `    assertOffset(offset, this.document.text.length);\n    const insertedUnits = inserted.length;`,
  ],
  [
    `      Automerge.splice(draft, [...TEXT_PATH], scalarOffset, 0, inserted);`,
    `      Automerge.splice(draft, [...TEXT_PATH], offset, 0, inserted);`,
  ],
  [
    `          start: scalarOffset,\n          end: scalarOffset + insertedScalars,`,
    `          start: offset,\n          end: offset + insertedUnits,`,
  ],
  [
    `  const characters = [...text];\n  const items: ContentItem[] = [];\n  let markIndex = 0;\n\n  for (let scalar = 0; scalar < characters.length; scalar += 1) {\n    while (\n      markIndex < originMarks.length &&\n      (originMarks[markIndex]?.end ?? 0) <= scalar\n    ) {\n      markIndex += 1;\n    }\n    const mark = originMarks[markIndex];\n    if (\n      mark === undefined ||\n      mark.start > scalar ||\n      mark.end <= scalar ||\n      typeof mark.value !== "string"\n    ) {\n      throw new TypeError(\n        "Every live Automerge text unit must carry one Origin.",\n      );\n    }\n    const next = originMarks[markIndex + 1];\n    if (next !== undefined && next.start <= scalar && next.end > scalar) {\n      throw new TypeError(\n        "A live Automerge text unit must not carry conflicting Origins.",\n      );\n    }\n    const originId = parseOriginId(mark.value);\n    const character = characters[scalar]!;\n    if (character === "\\n") {\n      items.push({ kind: "hardBreak", originId });\n    } else {\n      appendText(items, character, originId);\n    }\n  }`,
    `  const items: ContentItem[] = [];\n  let markIndex = 0;\n\n  for (let offset = 0; offset < text.length; offset += 1) {\n    while (\n      markIndex < originMarks.length &&\n      (originMarks[markIndex]?.end ?? 0) <= offset\n    ) {\n      markIndex += 1;\n    }\n    const mark = originMarks[markIndex];\n    if (\n      mark === undefined ||\n      mark.start > offset ||\n      mark.end <= offset ||\n      typeof mark.value !== "string"\n    ) {\n      throw new TypeError(\n        "Every live Automerge text unit must carry one Origin.",\n      );\n    }\n    const next = originMarks[markIndex + 1];\n    if (next !== undefined && next.start <= offset && next.end > offset) {\n      throw new TypeError(\n        "A live Automerge text unit must not carry conflicting Origins.",\n      );\n    }\n    const originId = parseOriginId(mark.value);\n    const codeUnit = text.slice(offset, offset + 1);\n    if (codeUnit === "\\n") {\n      items.push({ kind: "hardBreak", originId });\n    } else {\n      appendText(items, codeUnit, originId);\n    }\n  }`,
  ],
  [
    `function utf16ToScalarIndex(text: string, offset: number): number {\n  if (!Number.isSafeInteger(offset) || offset < 0 || offset > text.length) {\n    throw new RangeError("UTF-16 offset is outside Automerge text.");\n  }\n  let utf16 = 0;\n  let scalar = 0;\n  for (const character of text) {\n    if (utf16 === offset) {\n      return scalar;\n    }\n    utf16 += character.length;\n    scalar += 1;\n    if (utf16 > offset) {\n      throw new RangeError("UTF-16 offset splits one Unicode scalar value.");\n    }\n  }\n  return scalar;\n}\n\nfunction scalarToUtf16Index(text: string, scalarIndex: number): number {\n  if (!Number.isSafeInteger(scalarIndex) || scalarIndex < 0) {\n    throw new RangeError("Scalar offset is invalid.");\n  }\n  let utf16 = 0;\n  let scalar = 0;\n  for (const character of text) {\n    if (scalar === scalarIndex) {\n      return utf16;\n    }\n    utf16 += character.length;\n    scalar += 1;\n  }\n  if (scalar !== scalarIndex) {\n    throw new RangeError("Scalar offset is outside Automerge text.");\n  }\n  return utf16;\n}\n\n`,
    `function assertOffset(offset: number, length: number): void {\n  if (!Number.isSafeInteger(offset) || offset < 0 || offset > length) {\n    throw new RangeError("Carrier offset is outside content.");\n  }\n}\n\nfunction assertRange(start: number, end: number, length: number): void {\n  assertOffset(start, length);\n  assertOffset(end, length);\n  if (end < start) {\n    throw new RangeError("Carrier range end must not precede its start.");\n  }\n}\n\n`,
  ],
]);

await replaceIn("src/carrier/contentCarrier.test.ts", [
  [
    `function sortedMarks(value: InlineContentValue): readonly FormattingMark[] {\n  return [...value.marks].sort((left, right) =>\n    JSON.stringify(left).localeCompare(JSON.stringify(right)),\n  );\n}`,
    `function sortedMarks(value: InlineContentValue): readonly FormattingMark[] {\n  return [...value.marks].sort(\n    (left, right) =>\n      left.start - right.start ||\n      left.end - right.end ||\n      left.kind.localeCompare(right.kind) ||\n      left.boundaryPolicy.localeCompare(right.boundaryPolicy) ||\n      JSON.stringify(left.target ?? null).localeCompare(\n        JSON.stringify(right.target ?? null),\n      ),\n  );\n}`,
  ],
]);
