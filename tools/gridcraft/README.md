# Gridcraft integration

The web application self-hosts a pinned, modified Gridcraft WebAssembly build. It is a transient
table/workbook authoring tool; it has no P-M mechanics, resistance, classification, worker or
project persistence role. Only evaluated input values cross the Update boundary. The
@pm/spreadsheet adapter declares either the mapped sheet/column count or explicit workbook mode;
Project, Loadcases, Coordinates and Rebars share the checked host/transport. Tables use cells-only
dialogs; Project uses a modeless app window with the original full native UI.

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
P-M parent, when a table's Open XLSX action or the Project menu's Open action creates the iframe. Existing initial-route, analysis-worker and Excel
bundle ceilings are unchanged. The independent lazy spreadsheet asset ceiling is 10 MiB gzip.

## Bounded source patch

`patch.mjs` checks each replacement against the pinned source before applying it. It copies the
reviewed Cargo.lock, `pm_host.rs` and `pm_budget.rs`, and changes the corresponding host/rendering/resource entry points.
The patch adds cells-only table chrome, blocks unrelated commands in that mode, disables file
drops and preference/workbook recovery in both host modes, and provides a narrow same-origin bridge.
Project mode retains the native title row, File menu, ribbon, formula bar, tabs and status bar;
the right-hand title controls are adapted as described below.
Native Open/Save/Save As route through P-M's bounded file adapter and a serialized busy boundary.
The native title row has only Open, Save, Undo and Redo icons on the left and the centred filename.
Project mode omits AutoSave, Home, the Undo-list chevron and More; the four remaining controls use
native commands and enabled states. Open/Save still use the bounded adapter. In Project
mode its right-hand Search/Share/Comments/theme cluster is replaced by a reserved 240px slot plus
8px right inset. The shared P-M controls overlay that slot: Update to Project then Minimize,
Maximize/Restore and Close. They add no second header row or native menu/ribbon action. The shared
38px-high overlay leaves native left controls clickable and a transparent centre drag target owns
modeless movement. Busy periods suspend editing events while file/Update work runs. Native File/View
menus retain theme selection.
Formula-number printing retains the exact parsed binary64 value. Upstream's 15-significant-digit
display formatter can change a numeric constant during AST printing/fill/XLSX export; P-M uses
the existing exact scientific fallback whenever that display text does not round-trip bit-for-bit.
Rust round-trip tests and the saved/reopened rebar formula browser case cover this boundary.
Escape first belongs to editing/popups/copy mode; otherwise it closes a cells-only P-M modal.
In Project mode Escape belongs to the original native UI and does not close the app window.
Cells-only mode also omits comment/note corner indicators, hover panels and creation actions.
Source notes remain in the workbook for exact unit transport. The authoring template highlights
and protects its mapped table header while unlocking the bounded data/helper columns. Review
commands cannot remove that protection through the embedded UI. Generated whole-project workbooks
are unlocked; native Open preserves authored views/styles/protection and full UI. Native sheet
operations stay in the engine, with
the complete nine-sheet project schema checked at Update rather than enforced by row locks.

Ready, open, values, export, theme, close, native file actions/status and typed failure replies use protocol version 4 and a
per-opening session. Requests validate parent window/origin/session and are bounded. There is no
general engine command API. The parent validates replies and ignores late responses after disposal.
Open requires a nonempty Excel-compatible worksheet name (at most 31 characters), plus either
2–64 mapped columns for a table or an explicit workbook discriminator, validated in TypeScript
and Rust. The mapping changes only after a successful open. Sheet navigation is native UI;
the bridge exposes no sheet-command action.

Opening recalculates the workbook and enables automatic calculation. Before returning values the
host finishes the UI input pass and commits the active edit, then reads the current typed,
full-precision cell results, formula flags and source notes. Update does not independently rerun
formulas or recalculate volatile functions. It never asks ExcelJS to trust imported formula caches.
Date-formatted numeric cells are distinguished from mapped quantity values. The input patch also preserves
fast same-frame typing when the in-cell editor first receives focus.

File limits are 10 MiB compressed, 64 MiB declared expanded ZIP content and 256 entries. Open,
Update and Save validate at most 256 sheets, 100,001 rows per sheet, 64 columns and 1,000,000
populated cells, including unmapped helper cells. These boundary checks do not preempt every UI edit.
The evaluated snapshot additionally caps mapped row/column slots at 1,000,000 before allocation;
sparse helper cells cannot force an unbounded dense reply for a wide future table. Whole-workbook
mode sums dense slots across every sheet before allocating and includes readonly format properties
in its evaluated snapshot. The project adapter checks those properties and validates all inputs
through the existing first-format v1 reader. Formula values discard former literal unit notes.
External/structured references, active code, iterative calculation and Python cells are excluded.
The modified evaluator caps materialized arrays at 100,000 cells and concatenated-array text at
16 MiB, and meters recalculation at 2,000,000 expression visits / 2 seconds. Exhausted evaluation
produces a spreadsheet error and blocks Update; it never becomes a valid P-M input value.
The time check is cooperative at expression boundaries, not preemptive cancellation of a builtin
function or a WebAssembly thread. The same-origin iframe is not a CPU/security isolation claim.

The iframe CSP restricts scripts/assets/connections to its own origin, with no arbitrary code
evaluation. Table frames retain scripts/same-origin sandbox permissions without popups, top-level
navigation or iframe-owned downloads. The Project frame is trusted same-origin UI without that
cells-only sandbox, preserving original native link, download and print services. XLSX Open/Save
still use the P-M file adapter. Neither frame is a security-isolation boundary. There is no separate
browser address bar: the modeless window stays within P-M. Closing unmounts it and retires the session;
minimize keeps its current document mounted. Startup remains covered until workbook/theme and paint.

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

The [initial task packet](../../docs/task-packets/2026-11-05-loadcase-gridcraft-plan.md) and
[title-row packet](../../docs/task-packets/2026-11-05-project-spreadsheet-title-bar.md) record actual
checks and limitations. Engineering quantities continue through `@pm/units` and the project-owned
load-reference boundary. No formula, layout, compiled workbook or result is added to project JSON.
