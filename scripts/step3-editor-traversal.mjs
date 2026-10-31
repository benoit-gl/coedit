/** Parse all required browser traversal observations. Empty snapshots are valid. */
export function parseEditorTraversal(stdout) {
  const matches = [
    ...stdout.matchAll(/STEP3_EDITOR_TRAVERSAL_JSON=(\{[^\r\n]*\})/g),
  ];
  const rows = matches.map((match) => JSON.parse(match[1]));
  const expected = new Set();
  for (const candidate of ["yjs", "automerge"])
    for (const variant of ["snapshot", "targeted"])
      for (const editor of ["snapshot", "targeted"])
        for (const count of [0, 4])
          expected.add(JSON.stringify([candidate, variant, editor, count]));
  for (const row of rows) {
    const key = JSON.stringify([
      row.candidate,
      row.variant,
      row.editorProjectionVariant,
      row.unrelatedBlocks,
    ]);
    if (
      !expected.delete(key) ||
      typeof row.userAgent !== "string" ||
      row.userAgent.length === 0 ||
      row.unrelatedPayloads !== row.unrelatedBlocks ||
      !Number.isSafeInteger(row.decoderCalls) ||
      row.decoderCalls < 0 ||
      !Array.isArray(row.snapshots) ||
      !row.snapshots.every(
        (s) =>
          ["other", "read", "position", "publish"].includes(s.phase) &&
          s.payloads === row.unrelatedBlocks + 1 &&
          s.placements === row.unrelatedBlocks,
      )
    )
      throw new Error("Invalid or duplicate browser traversal observation.");
  }
  if (expected.size !== 0)
    throw new Error("Browser traversal observations are incomplete.");
  return rows;
}

/** Parse both semantic-editor insertion and stable-position resolution observations. */
export function parseNodeEditorTraversal(stdout) {
  const parse = (marker, requiresDecoderCalls) => {
    const pattern = new RegExp(`${marker}=(\\{[^\\r\\n]*\\})`, "g");
    const rows = [...stdout.matchAll(pattern)].map((match) =>
      JSON.parse(match[1]),
    );
    const expected = new Set();
    for (const candidate of ["yjs", "automerge"])
      for (const variant of ["snapshot", "targeted"])
        for (const count of [0, 4])
          expected.add(JSON.stringify([candidate, variant, count]));
    for (const row of rows) {
      const key = JSON.stringify([
        row.candidate,
        row.variant,
        row.unrelatedBlocks,
      ]);
      if (
        !expected.delete(key) ||
        (requiresDecoderCalls &&
          (!Number.isSafeInteger(row.decoderCalls) || row.decoderCalls < 0)) ||
        !Array.isArray(row.snapshots) ||
        !row.snapshots.every(
          (snapshot) =>
            ["editor", "publish", "position"].includes(snapshot.phase) &&
            snapshot.payloads === row.unrelatedBlocks + 1 &&
            snapshot.placements === row.unrelatedBlocks,
        )
      )
        throw new Error(`Invalid or duplicate ${marker} observation.`);
    }
    if (expected.size)
      throw new Error(`${marker} observations are incomplete.`);
    return rows;
  };
  return {
    editor: parse("STEP3_SEMANTIC_EDITOR_TRAVERSAL_JSON", true),
    resolution: parse("STEP3_POSITION_RESOLUTION_TRAVERSAL_JSON", false),
  };
}
