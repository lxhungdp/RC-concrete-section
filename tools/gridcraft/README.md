# Gridcraft integration

The web application self-hosts a pinned, modified Gridcraft WebAssembly build. It is a transient
table authoring tool; it has no P-M mechanics, resistance, classification, worker or project
persistence role. Only evaluated table values cross the Update boundary. The @pm/spreadsheet
adapter declares the mapped sheet and column count; Loadcases, Coordinates and Rebars share the
same host and web modal.

## Source and build

- Upstream: `storytold/gridcraft`, revision `919a6b58fe6661de27af0609d02443ac9db467bf`, version 0.16.0.
- Source ZIP SHA-256: `43a1cef6eb3fdf4de2c18d5ececd46505e220701161f178e77fdd28be024b155`.
- Rust 1.95.0 with the `wasm32-unknown-unknown` target; wasm-bindgen-cli 0.2.129.
- The source ZIP contains exact egui/craft-libs Git revisions. The reviewed local Cargo.lock
  supersedes its lock to pin ZIP 9.2.0, webpki-root-certs 1.0.10 and Tokio 1.53.3 security fixes.
  `--locked` is mandatory. No floating upstream branch is used.
- Run `npm run build:gridcraft` explicitly to download/build the dependency. This requires the
  declared Rust tools and public GitHub/crates.io access. It uses ignored `outputs/gridcraft/`
  caches and never deletes another directory or changes the system's default toolchain.
- Normal `npm run build` uses the included artifact, runs `check:gridcraft`, and needs no Rust
  compiler or dependency download. The manifest checks source-patch and artifact hashes.

The checked web artifact lives in `apps/web/public/gridcraft/`. The loader starts only inside its
P-M parent, when Open XLSX creates the iframe. Existing initial-route, analysis-worker and Excel
bundle ceilings are unchanged. The independent lazy spreadsheet asset ceiling is 10 MiB gzip.

## Bounded source patch

`patch.mjs` checks each replacement against the pinned source before applying it. It copies the
reviewed Cargo.lock, `pm_host.rs` and `pm_budget.rs`, and changes the corresponding host/rendering/resource entry points.
The patch adds cells-only chrome, blocks unrelated UI/file/sheet-navigation commands, disables
file drops and preference/workbook recovery in host mode, and provides a narrow same-origin bridge.
Formula-number printing retains the exact parsed binary64 value. Upstream's 15-significant-digit
display formatter can change a numeric constant during AST printing/fill/XLSX export; P-M uses
the existing exact scientific fallback whenever that display text does not round-trip bit-for-bit.
Rust round-trip tests and the saved/reopened rebar formula browser case cover this boundary.
Escape first belongs to editing/popups/copy mode; otherwise it closes the P-M modal.
Cells-only mode also omits comment/note corner indicators, hover panels and creation actions.
Source notes remain in the workbook for exact unit transport. The authoring template highlights
and protects its mapped header while unlocking the bounded data/helper columns. Review commands
cannot remove that protection through the embedded UI.

Ready, open, values, export, theme, close and typed failure replies use protocol version 2 and a
per-opening session. Requests validate parent window/origin/session and are bounded. There is no
general engine command API. The parent validates replies and ignores late responses after disposal.
Open requires a nonempty Excel-compatible worksheet name (at most 31 characters) and 2–64 mapped
columns, validated in both TypeScript and Rust. The mapping changes only after a successful open.

Opening recalculates the workbook and enables automatic calculation. Before returning values the
host finishes the UI input pass and commits the active edit, then reads the current typed,
full-precision cell results, formula flags and source notes. Update does not independently rerun
formulas or recalculate volatile functions. It never asks ExcelJS to trust imported formula caches.
Date-formatted numeric cells are distinguished from mapped quantity values. The input patch also preserves
fast same-frame typing when the in-cell editor first receives focus.

File limits are 10 MiB compressed, 64 MiB declared expanded ZIP content and 256 entries. Open,
Update and Save as validate 100,001 total rows, 64 columns and at most 1,000,000
populated cells, including unmapped helper cells. These boundary checks do not preempt every UI edit.
The evaluated snapshot additionally caps mapped row/column slots at 1,000,000 before allocation;
sparse helper cells cannot force an unbounded dense reply for a wide future table.
External/structured references, active code, iterative calculation and Python cells are excluded.
The modified evaluator caps materialized arrays at 100,000 cells and concatenated-array text at
16 MiB, and meters recalculation at 2,000,000 expression visits / 2 seconds. Exhausted evaluation
produces a spreadsheet error and blocks Update; it never becomes a valid P-M input value.
The time check is cooperative at expression boundaries, not preemptive cancellation of a builtin
function or a WebAssembly thread. The same-origin iframe is not a CPU/security isolation claim.

The iframe CSP restricts scripts/assets/connections to its own origin, with no arbitrary code
evaluation. Browser sandbox permissions cover scripts and same-origin access; popups, top-level
navigation and iframe-owned downloads are not enabled. P-M owns file selection and saving.

## License and status

Upstream software is MIT OR Apache-2.0. Required licenses, NOTICE and asset attribution accompany
the artifact. The custom loader contains no upstream branding assets; the modified About text
identifies the component as based on Gridcraft and does not imply ArtCraft endorsement.
P-M's own license is unchanged. Upstream remains alpha; this integration claims only the editing
and export behaviors exercised by its fixtures, not full Microsoft Excel compatibility.

Local RustSec audit on 2026-11-05 (cargo-audit 0.22.2; advisory DB revision
`965bf9ad083b58e6340d65829d85217b18be9290`) found zero vulnerabilities after the reviewed lock
updates. Unmaintained-package warnings for proc-macro-error, zbus_names, zvariant and zvariant_derive
remain recorded in the complete lock; they do not occur in the shipped wasm32 normal-dependency
tree. After explicit authorization to send public dependency names/versions, the fresh npm production
audit passed the repository's High/Critical threshold. Two Moderate entries remain in the existing
ExcelJS/uuid chain (GHSA-w5hq-g745-h8pq); inspected ExcelJS calls use the unaffected v4 method without
output buffers. The task packet records the call-path evidence and remaining maintenance work.
These checks do not imply universal dependency safety.

The [task packet](../../docs/task-packets/2026-11-05-loadcase-gridcraft-plan.md) records actual checks
and limitations. Its engineering quantities continue through `@pm/units` and the project-owned
load-reference boundary. No formula, layout, compiled workbook or result is added to project JSON.
