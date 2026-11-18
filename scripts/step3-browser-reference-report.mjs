/** Parse completed observations against the fixture manifest, retaining partial rows. */
export function parseBrowserReference(stdout, profile) {
  const rows = [];
  const errors = [];
  const expected = new Set();
  for (const candidate of ["yjs", "automerge"]) {
    for (let iteration = 0; iteration < profile.method.samples; iteration++) {
      for (const shape of profile.shapes)
        expected.add(`editing:${candidate}:${shape.id}:${iteration}`);
      expected.add(`lifecycle:${candidate}:${iteration}`);
    }
    for (const edge of profile.edgeCases)
      expected.add(`edge:${candidate}:${edge}`);
  }
  const seen = new Set();
  for (const match of stdout.matchAll(
    /STEP3_BROWSER_REFERENCE_ROW=(\{[^\r\n]*\})/g,
  )) {
    try {
      const row = JSON.parse(match[1]);
      rows.push(row);
      const key =
        row.kind === "editing"
          ? `editing:${row.candidate}:${row.profile}:${row.iteration}`
          : row.kind === "lifecycle"
            ? `lifecycle:${row.candidate}:${row.iteration}`
            : `edge:${row.candidate}:${row.case}`;
      if (!expected.has(key) || seen.has(key))
        throw Error(`Unexpected or duplicate observation ${key}`);
      seen.add(key);
      if (row.kind === "editing") {
        if (
          JSON.stringify(row.operations?.map((operation) => operation.name)) !==
          JSON.stringify(profile.operations)
        )
          throw Error(`Incomplete operation sequence ${key}`);
        for (const operation of row.operations)
          for (const field of ["driverOrDispatchMs", "publicationMs"])
            if (!Number.isFinite(operation[field]) || operation[field] < 0)
              throw Error(`Invalid ${field} in ${key}`);
      } else if (row.kind === "lifecycle") {
        if (
          JSON.stringify(row.observations?.map((entry) => entry.name)) !==
          JSON.stringify(profile.lifecyclePhases)
        )
          throw Error(`Incomplete lifecycle sequence ${key}`);
      } else if (
        row.kind !== "edge" ||
        !["exact", "atomic-refusal"].includes(row.outcome)
      ) {
        throw Error(`Invalid edge outcome ${key}`);
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  for (const key of expected)
    if (!seen.has(key)) errors.push(`Missing observation ${key}`);
  return { rows, errors, expectedRows: expected.size };
}

/** Descriptive paired editing summaries; no estimate of a tail distribution. */
export function summarizeBrowserReference(rows) {
  const groups = new Map();
  for (const row of rows) {
    if (row.kind !== "editing") continue;
    for (const operation of row.operations) {
      const key = `${row.candidate}:${row.profile}:${operation.name}`;
      const group = groups.get(key) ?? {
        candidate: row.candidate,
        profile: row.profile,
        operation: operation.name,
        samples: [],
      };
      group.samples.push(operation);
      groups.set(key, group);
    }
  }
  const median = (values) =>
    [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  return [...groups.values()].map(({ samples, ...identity }) => ({
    ...identity,
    sampleCount: samples.length,
    medianDriverOrDispatchMs: median(
      samples.map((sample) => sample.driverOrDispatchMs),
    ),
    medianPublicationMs: median(samples.map((sample) => sample.publicationMs)),
  }));
}
