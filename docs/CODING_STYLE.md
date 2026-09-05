# Coding, documentation, and command-line standard

**Status:** Accepted engineering contract. The Step 1 tooling baseline implements
the configuration described here.

## 1. Purpose and authority

This document defines source-code structure, as-implemented API documentation,
linting, formatting, dependency checks, command-line interfaces, and developer
platform portability for Coedit.

[`MVP_ARCHITECTURE.md`](MVP_ARCHITECTURE.md) controls component authority.
[`MVP_IMPLEMENTATION_SPEC.md`](MVP_IMPLEMENTATION_SPEC.md) controls private MVP
implementation rules outside this focused standard.
[`MVP_VERIFICATION_PLAN.md`](MVP_VERIFICATION_PLAN.md) controls required
evidence. [`../SCAFFOLDING_PLAN.md`](../SCAFFOLDING_PLAN.md) controls when the
tooling is introduced.

When implementation exists, TSDoc attached to an exported declaration is the
direct as-implemented contract for that symbol. It does not override product or
architecture intent. A mismatch between source contract, implementation, test,
or higher-level authority is a defect; update all affected artifacts in the same
change.

## 2. Base guides and deliberate profile

Use the [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html)
as a structural guide, especially its rules for modules, restricted visibility,
small exported surfaces, `readonly` data, and useful API documentation.

Do not adopt environment-specific or cosmetic Google rules automatically.
Whitespace, wrapping, quote, semicolon, and brace placement are formatter
decisions. Coedit-specific rules in this document control when they differ from
a general guide.

Use [TSDoc](https://tsdoc.org/) syntax for `/** ... */` API documentation and
[TypeDoc](https://typedoc.org/) to generate and validate reference documentation.
Use ordinary `//` comments for implementation reasoning that callers do not need
to know.

## 3. Module and dependency structure

Dependency direction is part of correctness:

- `domain` remains pure and imports no React, browser, storage, editor, carrier,
  or platform implementation;
- application/engine code depends on domain contracts and ports, not React
  components or concrete browser adapters;
- carrier, editor, Markdown, portable-format, storage, and browser modules adapt
  external concerns to inward-facing contracts;
- React components use application queries, commands, projections, and editor
  adapters rather than storage or carrier internals;
- production modules do not import tests, fixtures, generated documentation, or
  development-only utilities;
- cross-subsystem access uses an explicit supported entry point rather than a
  deep import into another subsystem; and
- runtime dependency cycles are prohibited.

Only export a symbol used outside its module. Do not create mutable exported
bindings or broad barrel files that expose a directory accidentally. Carrier,
repository, and codec types remain private unless an authoritative public
contract deliberately exposes a carrier-neutral form.

The architecture rule set grows with implemented directories. A legitimate new
dependency edge requires an architecture review and a rule/configuration update
in the same change; it is not bypassed with an unexplained lint suppression.

## 4. TypeScript structural rules

Use strict TypeScript. Step 1 must enable `strict` and also explicitly evaluate
and normally enable:

- `exactOptionalPropertyTypes`;
- `noFallthroughCasesInSwitch`;
- `noImplicitOverride`;
- `noImplicitReturns`;
- `noUncheckedIndexedAccess`;
- `noUncheckedSideEffectImports`;
- `useUnknownInCatchVariables`;
- `verbatimModuleSyntax`; and
- `forceConsistentCasingInFileNames`.

If the pinned TypeScript version makes one of these inappropriate, record the
exception and rationale here rather than disabling it silently.

Prefer:

- branded types for durable identities;
- discriminated unions for closed commands, events, errors, and states;
- exhaustive handling of those unions;
- `readonly` input and result data;
- typed `Result`-style expected failures at application boundaries;
- `unknown` followed by validation for hostile or external input; and
- named parameter objects when positional arguments would hide meaning.

Avoid:

- `any` except at a narrow, documented compatibility boundary;
- type assertions as a substitute for validation;
- boolean parameters whose meaning is unclear at a call site;
- framework or carrier objects in domain/public engine types;
- catch-all utility modules; and
- comments that merely restate a name or TypeScript type.

## 5. As-implemented TSDoc contract

TSDoc is required for:

- every exported type, function, class, constant, and public member;
- public engine commands, queries, receipts, errors, and notifications;
- ports and adapter contracts;
- persisted or portable records;
- discriminated-union variants whose meaning is not completely obvious; and
- private algorithms or invariants whose safety cannot be understood from code
  and tests alone.

A contract documents the facts a correct caller or implementer needs. As
applicable, cover:

- purpose and when to use the symbol;
- preconditions and validation;
- invariants and ownership;
- atomicity and publication timing;
- idempotency and retry behavior;
- mutation and side effects;
- concurrency or version assumptions;
- expected failure behavior;
- selected or frozen resource guards and capacity-failure behavior; and
- security or trust boundaries.

Use standard TSDoc tags such as `@remarks`, `@param`, `@returns`, `@throws`,
`@example`, `@see`, `@deprecated`, and `{@link}`. Prefer Markdown labels inside
`@remarks` over custom tags for contract sections. Do not document a typed
parameter or return value twice unless the prose adds semantics not carried by
the signature.

The documentation check must fail on malformed TSDoc, unresolved internal links,
invalid documentation paths, references to symbols that are not exported, and
undocumented exported API. Configure the corresponding TypeDoc validation
options and treat validation warnings as failures. Generated HTML is a build
artifact and is not tracked. When the stable `DocumentEngine` entry point
exists, add an API Extractor report or equivalent reviewed declaration report
so public-surface changes are visible in diffs.

## 6. Linter configuration

Use ESLint's flat configuration in `eslint.config.mjs`. The accepted initial
profile is:

1. ESLint recommended JavaScript rules;
2. typescript-eslint `recommendedTypeChecked` using
   `parserOptions.projectService`;
3. `eslint-plugin-react-hooks` recommended rules for React/TSX;
4. `eslint-plugin-jsx-a11y` recommended rules for TSX;
5. `eslint-plugin-tsdoc` with `tsdoc/syntax` as an error;
6. Coedit path-specific import restrictions; and
7. `eslint-config-prettier` last to disable formatting conflicts.

Add these reviewed rules as errors unless the selected preset already provides
an equal or stronger rule:

```text
@typescript-eslint/consistent-type-imports
@typescript-eslint/explicit-module-boundary-types
@typescript-eslint/no-explicit-any
@typescript-eslint/no-floating-promises
@typescript-eslint/no-misused-promises
@typescript-eslint/switch-exhaustiveness-check
```

Apply `explicit-module-boundary-types` to domain, engine, port, adapter, and
other supported subsystem exports. A narrow React-component exception is
permitted only when inference is obvious and the component is not a public
application contract.

Use ESLint `no-restricted-imports` for simple directory/package prohibitions.
Use [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) for
dependency direction, cycles, unresolved modules, production-to-test imports,
and cross-subsystem boundaries. Do not add overlapping import plugins without a
specific uncovered need.

Inline disable comments must name the smallest possible rule and include a
reason. Unused disable directives are errors. File-wide disables and reductions
of an error to a warning require a recorded exception in this document.

ESLint must exclude generated build output, generated documentation, coverage,
dependencies, and other generated artifacts from source linting. Do not change
generated bundles only to satisfy source lint rules.

## 7. Automatic formatting and text normalization

Use Prettier as a separate formatter. Do not run it as an ESLint rule. The
initial configuration is:

```json
{
  "endOfLine": "lf",
  "proseWrap": "preserve"
}
```

All other formatting follows the pinned Prettier defaults. Format TypeScript,
TSX, JavaScript, JSON, CSS, Markdown, YAML, and supported configuration files.
Exclude dependencies, generated output, coverage, caches, carrier fixtures whose
bytes are contractual, and other explicitly byte-stable artifacts.

Add `.editorconfig` and `.gitattributes` in Step 1. Repository text uses UTF-8
and LF on every operating system. Git and editors may present native tooling,
but a checkout or formatter run must not produce line-ending-only diffs.

## 8. Cross-platform command-line contract

The application and its development toolchain must be usable from a terminal
without an IDE.

Platform tiers are:

| Tier    | Requirement                                                                                             |
| ------- | ------------------------------------------------------------------------------------------------------- |
| Windows | Required native developer platform. Commands work from PowerShell or `cmd.exe` through package scripts. |
| Linux   | Required developer and CI platform.                                                                     |
| macOS   | Intended supported developer platform; use the same commands and avoid known incompatibilities.         |

Step 1 pins the Node.js runtime range and pnpm version in project metadata and
commits the pnpm lockfile. Node.js and its bundled npm are the only required
global runtime and package-management tools. A clean checkout starts with
`npm run bootstrap`, which obtains the pinned pnpm version through `npm exec` and
runs the frozen pnpm install. Do not require a global pnpm installation,
Corepack, a global IDE extension, Bash on Windows, PowerShell on Unix, WSL,
Docker, or a native compiler merely to build and test the browser application.

Package scripts must invoke Node-based CLIs or cross-platform Node scripts. Do
not depend on:

- `bash`, `sh`, PowerShell, batch files, or OS-specific command syntax;
- Unix utilities such as `rm`, `cp`, `find`, `sed`, or `grep`;
- inline environment-variable assignment syntax that differs by shell;
- shell glob or brace expansion;
- platform path separators, drive letters, or case-insensitive paths;
- symlink creation or executable permission bits; or
- CI-only behavior not exercised by the ordinary package scripts.

Use Node path/URL and filesystem APIs for custom automation. Prefer configuration
files and CLI arguments over environment variables; use a reviewed cross-platform
helper only when an environment variable is genuinely necessary.

The production browser build must not assume deployment at the URL root. Use a
relative Vite base so generated asset URLs remain relative to the generated HTML.
Keep production minification enabled and emit external source maps so browser
devtools can map the production bundle back to the original source. Source maps
are generated output and are not tracked or source-linted. Use `npm run preview`
to inspect `dist` locally over HTTP. Direct `file://` execution is not a supported
browser path because the build uses native ES modules.

## 9. Required package commands

Step 1 must provide these non-OS-specific commands. npm is the public command
interface; pnpm remains the pinned dependency resolver and lockfile owner.

| Command                | Contract                                                                                |
| ---------------------- | --------------------------------------------------------------------------------------- |
| `npm run bootstrap`    | Obtains pinned pnpm through npm and performs the frozen dependency install.             |
| `npm run dev`          | Starts the interactive Vite development server.                                         |
| `npm run build`        | Produces the production browser build non-interactively.                                |
| `npm run preview`      | Serves the production build locally over HTTP for interactive inspection.               |
| `npm run test`         | Runs the complete default test suite once and exits.                                    |
| `npm run test:watch`   | Runs the explicitly interactive local test watcher.                                     |
| `npm run typecheck`    | Runs TypeScript checking without relying on a production emit.                          |
| `npm run lint`         | Runs ESLint with zero warnings accepted.                                                |
| `npm run lint:deps`    | Runs dependency-cruiser architectural checks.                                           |
| `npm run format`       | Applies Prettier to supported files.                                                    |
| `npm run format:check` | Checks formatting without writing.                                                      |
| `npm run docs:check`   | Validates TSDoc and generated API-reference inputs without tracking generated HTML.     |
| `npm run check`        | Runs all non-interactive format, type, lint, dependency, documentation, and test gates. |

`npm run bootstrap`, `npm run check`, and `npm run build` are the canonical
clean-checkout verification sequence. The bootstrap command must use the exact
pnpm version pinned by the project and must not require pnpm to be installed
globally. No command may prompt, enter watch mode, open a browser, or mutate
tracked source during this sequence.

## 10. CI and platform verification

The repository CI workflow runs on Linux for pull requests and pushes to `main`.
It uses the ordinary repository commands rather than a separate CI-only build or
test path. The required job runs:

```text
npm run bootstrap
npm run check
npm run build
npm run check
```

The second `npm run check` verifies that generated build output does not affect
source verification. Keep this workflow small and deterministic. Add a CI-only
helper, cache, matrix, service, or platform job only when a concrete verification
need justifies it.

Linux CI is the ordinary pull-request gate. It does not reduce the Windows
compatibility requirement. Changes to bootstrap behavior, package scripts,
build tooling, path handling, or other platform-sensitive developer tooling must
also be qualified on native Windows. Other changes do not require a Windows CI
job merely because Windows is a supported developer platform.

Before Step 1 exits, retain successful clean-checkout evidence from:

- one native Windows environment; and
- one Linux environment, which may be native, a disposable VM, or a container.

A macOS smoke run is recommended when a macOS environment is available and
before a release intended for general developer use. Until such evidence exists,
macOS support is best effort, but no accepted script may knowingly exclude it.

## 11. Maintenance rule

Formatting changes are automatic and do not justify unrelated code churn.
Lint, dependency, documentation, and platform exceptions are reviewed as design
changes. Update this standard, its configuration, and relevant verification
evidence together when a rule changes.

Pin tool and plugin versions. Upgrade them deliberately, review newly enabled or
removed rules, regenerate the API report when applicable, and run the canonical
verification sequence before accepting the upgrade.

## 12. Technical references

- [ESLint flat configuration](https://eslint.org/docs/latest/use/configure/configuration-files)
- [typescript-eslint typed linting](https://typescript-eslint.io/getting-started/typed-linting)
- [React Hooks ESLint plugin](https://react.dev/reference/eslint-plugin-react-hooks)
- [eslint-plugin-jsx-a11y](https://github.com/jsx-eslint/eslint-plugin-jsx-a11y)
- [eslint-plugin-tsdoc](https://tsdoc.org/pages/packages/eslint-plugin-tsdoc/)
- [Prettier installation and linter integration](https://prettier.io/docs/install)
- [TypeDoc validation](https://typedoc.org/documents/Options.Validation.html)
- [API Extractor API reports](https://api-extractor.com/pages/overview/demo_api_report/)
