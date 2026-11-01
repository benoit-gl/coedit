import type { InlineContentId } from "../../../src/domain/index.js";
import type { IntegratedDocumentCarrier } from "../integrated/carrier.js";
import type { QualificationEffectContext } from "../integrated/effectContext.js";
import type { QualificationOrigin } from "../payload/carrier.js";
import { EditorView } from "prosemirror-view";
import type { Transaction } from "prosemirror-state";
import {
  QualificationIncrementalEditor,
  type IncrementalEditorWork,
} from "./incrementalEditor.js";
import {
  createProseMirrorEditorState,
  nativeTextFromProseMirror,
} from "./prosemirrorAdapter.js";
import type { EditorTextOperation } from "./semanticText.js";

/** Inputs for the separate qualification-only incremental mounted binding. */
export interface IncrementalProseMirrorOptions<Position> {
  /** Browser container owned by the caller. */
  readonly element: HTMLElement;
  /** Incremental carrier instance; replacing it requires a new binding. */
  readonly carrier: IntegratedDocumentCarrier<Position>;
  /** One active live text target. */
  readonly inlineContentId: InlineContentId;
  /** Trusted insertion attribution for local transactions. */
  readonly origin: QualificationOrigin;
  /** Fresh effect identity per committed gesture. */
  readonly nextContext: () => QualificationEffectContext;
  /** Optional passive counts of editor-index work. */
  readonly work?: IncrementalEditorWork;
}

/** Nested synchronous intervals for one incremental view dispatch. */
export interface IncrementalDispatchTiming {
  /** Complete synchronous adapter dispatch, excluding browser-driver overhead. */
  dispatchMs: number;
  /** ProseMirror application and extraction of inserted slices. */
  localPrepareMs: number;
  /** Indexed editor staging and canonical carrier publication. */
  publicationMs: number;
  /** Updating the ProseMirror view; not a physical paint observation. */
  viewUpdateMs: number;
}

/** Mounted incremental experiment; lifecycle refresh is explicit and separately measured. */
export interface MountedIncrementalProseMirror {
  /** Real ProseMirror view used by keyboard and transaction fixtures. */
  readonly view: EditorView;
  /** Last synchronous dispatch intervals; nested publication is measured by the carrier fixture. */
  readonly timing: IncrementalDispatchTiming;
  /** Re-activate after inbound, restore or replacement and reset transient editor state. */
  refresh(): void;
  /** Destroy the mounted view. */
  unmount(): void;
}

/**
 * Mount the delta experiment without changing the retained reference adapter.
 *
 * Only inserted step slices are projected during dispatch. The flat schema's
 * text and hard-break node sizes equal canonical UTF-16 offsets. Initialization
 * and explicit lifecycle/rejection recovery materialize the target once.
 * This binding exercises ordinary typing, deletion and replacement; the retained
 * full adapter continues to own the broader clipboard and IME qualification.
 */
export function mountIncrementalProseMirrorEditor<Position>(
  options: IncrementalProseMirrorOptions<Position>,
): MountedIncrementalProseMirror {
  const editor = new QualificationIncrementalEditor(
    options.carrier,
    options.inlineContentId,
    options.work,
  );
  const timing = {
    dispatchMs: 0,
    localPrepareMs: 0,
    publicationMs: 0,
    viewUpdateMs: 0,
  };
  let state = initialState();
  let mounted = true;
  const view = new EditorView(options.element, {
    state,
    dispatchTransaction(transaction) {
      if (!mounted) throw new TypeError("Incremental view is unmounted.");
      const start = performance.now();
      if (transaction.before !== state.doc)
        throw new TypeError("Incremental transaction has a stale editor base.");
      const nextState = state.apply(transaction);
      const operations = replacements(transaction);
      timing.localPrepareMs = performance.now() - start;
      const publishing = performance.now();
      try {
        if (operations.length > 0)
          editor.apply(operations, options.nextContext());
      } catch (error) {
        // Rejection recovery is explicit document/target-wide transition work,
        // never counted as a successful ordinary dispatch.
        editor.refresh();
        state = initialState();
        view.updateState(state);
        throw error;
      }
      timing.publicationMs = performance.now() - publishing;
      state = nextState;
      const updating = performance.now();
      view.updateState(state);
      timing.viewUpdateMs = performance.now() - updating;
      timing.dispatchMs = performance.now() - start;
    },
  });
  return {
    view,
    timing,
    refresh() {
      if (!mounted) throw new TypeError("Incremental view is unmounted.");
      editor.refresh();
      state = initialState();
      view.updateState(state);
    },
    unmount() {
      view.destroy();
      mounted = false;
    },
  };

  function initialState() {
    const spans = editor.read(0, editor.length);
    return createProseMirrorEditorState({
      text: spans.map((span) => span.text).join(""),
      spans,
    });
  }

  function replacements(
    transaction: Transaction,
  ): readonly EditorTextOperation[] {
    const operations: EditorTextOperation[] = [];
    for (let i = 0; i < transaction.steps.length; i++) {
      const after = transaction.docs[i + 1] ?? transaction.doc;
      const edits: EditorTextOperation[] = [];
      transaction.steps[i]!.getMap().forEach((from, to, newFrom, newTo) => {
        const inserted = nativeTextFromProseMirror(after.cut(newFrom, newTo));
        if (from !== to || inserted.length > 0)
          edits.push({
            start: from,
            end: to,
            insertion:
              inserted.length === 0
                ? []
                : [{ text: inserted, origin: options.origin }],
          });
      });
      operations.push(...edits.sort((a, b) => b.start - a.start));
    }
    return operations;
  }
}
