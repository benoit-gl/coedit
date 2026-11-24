from pathlib import Path
root=Path('/workspace/work/merge10-implementation/load-stages/source/qualification/step3/immutableRuns')
helper='''import { openSync, writeSync } from "node:fs";
import { getHeapStatistics } from "node:v8";
import { performance } from "node:perf_hooks";
const path = process.env.COEDIT_LOAD_STAGES;
if (!path) throw Error("COEDIT_LOAD_STAGES required for instrumented source");
const fd = openSync(path, "wx");
let sequence = 0;
export function loadMark(event: string, phase: string, extra: Record<string, unknown> = {}): void {
  writeSync(fd, JSON.stringify({ kind: "load-substage", complete: false, sequence: sequence++, event, phase,
    elapsedMs: performance.now(), memory: process.memoryUsage(), heapSizeLimitBytes: getHeapStatistics().heap_size_limit,
    peakRssKiB: process.resourceUsage().maxRSS, ...extra }) + "\\n");
}
export function loadStep<T>(phase: string, fn: () => T): T {
  loadMark("start", phase);
  const started = performance.now();
  try {
    const result = fn();
    const operationMs = performance.now() - started;
    loadMark("end", phase, { operationMs });
    return result;
  } catch (error) {
    loadMark("error", phase, { message: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}
'''
(root/'loadStageDiagnostic.ts').write_text(helper)
p=root/'nativeDocument.ts'; s=p.read_text(); s='import { loadMark, loadStep } from "./loadStageDiagnostic.js";\n'+s
replacements={
'''      A.load<NativeState>(encoded),
    );
    result.rebuildUuidIndex(result.activate().entries);
    result.ensureOneNativeHead();''':'''      loadStep("native-A.load", () => A.load<NativeState>(encoded)),
    );
    const loadedActivation = loadStep("native-activate", () => result.activate());
    loadStep("native-uuid-index", () => result.rebuildUuidIndex(loadedActivation.entries));
    loadStep("native-head-join", () => result.ensureOneNativeHead());''',
'''    const namespace = collectRecordNamespace(this.document);
    const entries = Object.freeze([...namespace.records.values()]);
    const protocol = ImmutableRunProtocolV1.validate(entries);''':'''    const namespace = loadStep("namespace-collection", () => collectRecordNamespace(this.document));
    loadMark("counts", "namespace-collection", { records: namespace.records.size, objectDepths: namespace.objectDepths.size });
    const entries = loadStep("entries-array", () => Object.freeze([...namespace.records.values()]));
    const protocol = loadStep("protocol-validation", () => ImmutableRunProtocolV1.validate(entries));''',
'''    const provider = new NativeProvider(
      this.document,
      entries,
      protocol,
      namespace.objectDepths,
    );''':'''    const provider = loadStep("provider-construction", () => new NativeProvider(
      this.document,
      entries,
      protocol,
      namespace.objectDepths,
    ));''',
'''    validateImmutableRunCommandsV1(protocol, provider);''':'''    loadStep("semantic-command-validation", () => validateImmutableRunCommandsV1(protocol, provider));''',
'''    for (const bytes of A.getAllChanges(document)) {
      const change = A.decodeChange(bytes);''':'''    let diagnosticChanges = 0;
    for (const bytes of loadStep("provider-get-all-changes", () => A.getAllChanges(document))) {
      const change = A.decodeChange(bytes);
      if (++diagnosticChanges % 500 === 0) loadMark("progress", "provider-construction", { changes: diagnosticChanges });''',
'''    const authored = new Set([
      ...this.#commandProvenance.keys(),''':'''    loadMark("counts", "provider-construction", { changes: diagnosticChanges, rootMetadata: this.#rootMetadata.size, metadataByChange: this.#metadataByChange.size, commandProvenance: this.#commandProvenance.size });
    const authored = new Set([
      ...this.#commandProvenance.keys(),''',
'''      objectDepths.set(objectId, current.path.length);
      for (const key of Object.keys(node)) {''':'''      objectDepths.set(objectId, current.path.length);
      if (objectDepths.size % 10000 === 0) loadMark("progress", "namespace-collection", { objectDepths: objectDepths.size, records: result.size, pending: pending.length });
      for (const key of Object.keys(node)) {'''
}
for old,new in replacements.items():
    assert s.count(old)==1,(old,s.count(old)); s=s.replace(old,new)
p.write_text(s)
p=root/'automergeCarrier.ts';s=p.read_text();s='import { loadStep } from "./loadStageDiagnostic.js";\n'+s
old='''    this.activation = native.activate();
    const cold = this.activation.provider.view(this.activation.root);
    this.view = new WarmNativeView(cold, this.activation.entries);'''
new='''    this.activation = loadStep("carrier-activation", () => native.activate());
    const cold = loadStep("carrier-selected-view", () => this.activation.provider.view(this.activation.root));
    this.view = loadStep("carrier-warm-view", () => new WarmNativeView(cold, this.activation.entries));'''
assert s.count(old)==1;s=s.replace(old,new)
old='''    this.replicaUuid = native.freshReplicaUuid();
    this.rebuildSelectedIndexes();''';new='''    this.replicaUuid = native.freshReplicaUuid();
    loadStep("carrier-selected-indexes", () => this.rebuildSelectedIndexes());'''
assert s.count(old)==1;s=s.replace(old,new);p.write_text(s)
