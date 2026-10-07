# Workspace controls follow-up

Objective: match Frame jscad comboboxes, apply the Section technical number face
to displayed quantities across menus, and use one smaller row/table action size.
Preserve the user-approved P-M primary blue/teal and CAD drawing palette.

Change class: 2 for native-select presentation/interaction refactor; font and
button dimensions are Class 1. Native option values, existing handlers, validation,
formatting, numerical kernels, project schema and result status remain unchanged.
Allowed owners: shared web controls/chrome/tokens, numeric value markup, the
canonical design skill, development/09 and this packet. No new dependencies.

Authorities: control map, development/01 and /04, docs/08, development/05,
engineering/06; source jscad skill and UI_THEME sections 5 and 7. The earlier
OS-popup adaptation is superseded by the user's explicit fidelity correction.

Contracts: single-select native fields remain mounted and own their handlers.
The React portal owns only presentation. Exploration/cancellation is view-only;
enabled option commit emits original input/change once. Disabled/multiple-select
controls do not enter this adapter. Labels and names stay sans; `ws-num` identifies
numeric summaries, counts, table cells, ratios and field metrics explicitly.
Compact row/table actions are 22px; standard actions remain 26px.

Acceptance: keyboard navigation/typeahead tests; visible native values unchanged
after hover/Escape, correctly updated through original handler on commit; popup
check/hover distinction, keyboard focus, long-label sizing/clipping and nested
file/basis menus in both themes; computed numeric font/weight and compact button
dimensions; unchanged populated CAD role colours; structure/typecheck, aggregate
tests, production build and web bundle gate. Record failed or unrun gates below.

Out of scope: design-code coefficients, quantities, precision, report content,
project parsing, engineering release status, deployment and unrelated ADSEC data.

## Delivered implementation

- `WorkspaceComboboxes.tsx` owns the browser-only portal, delegated single-select
  interaction, option-state checks and viewport placement. It loads as a separate
  web chunk; native fields remain mounted throughout hydration. Pure navigation
  and typeahead helpers live in `combobox-navigation.ts` with two focused tests.
- Shared tokens/chrome own jscad trigger/popup/check styling, 13px/400 standard
  combobox text, 12px/400 dense-table text and the 22px compact action role.
  CSS input exclusions use `:where` so legacy field specificity cannot override
  the combobox role. Selected rows retain their highlight around select fields.
- Numeric markup covers Capacity tables/summaries, Demand Check utilization and
  field metrics, Options counts/spacing, mesh and equivalent-block quantities.
  The existing point-index role also uses the technical face. Labels/statuses
  retain their ordinary face; displayed numeric formatting expressions are intact.
- Section Apply uses the compact action class; existing table add/delete classes
  resolve to the same 22px icon target. Primary colours remain light `#197381`
  and dark `#38bdf8`. No numerical, project-schema or report-content changes.
- The canonical skill and design-system authority supersede the earlier native
  OS popup adaptation. The Claude adapter keeps the same name/description and
  canonical link. No dependencies, commits, pushes or deployment were added.

## Verification, 2026-10-07

Passed: repository structure and TypeScript checks; all 340 unit tests; production
build; CAD tests, JSON roundtrip, Excel stress-strain export, Excel equivalent-block
export, demand-check export and PDF-report integration checks. Integration checks
were run separately because aggregate testing stops at ADSEC. Sandbox EPERM on
existing build/report outputs was resolved by authorized build/test escalation.
Structure/tests were rerun after the build finished to avoid a changing `.next`
directory during the repository walk.

Bundle gates pass: initial gzip 372.7/375 KiB, Plotly 1325.7/1400 KiB, analysis
worker 116.9/120 KiB and Excel 248.1/300 KiB. Platform skill validation passes for
the canonical skill and Claude adapter using Python UTF-8 mode.

Observed in the final production UI:

- light and dark trigger/popup/border/highlight colours match their declared
  tokens; standard fields are 26px/13px, table fields 24px/12px, both weight 400;
- arrows/typeahead exploration keeps the current value and selected check;
  keyboard and pointer commit update original Import/Export handlers; Escape
  preserves the selected value and enclosing file/basis menu; Tab/outside press
  dismiss; exploring Design code leaves the KDS selection unchanged on cancel;
- long labels widen the popup without a global fixed minimum; a 360px viewport
  leaves 8px gutters with no text overflow; the 300px-high layout stays within
  the viewport. Above-trigger placement is implemented but not separately observed;
- Capacity numeric cells/summaries and Demand inputs/UR/footer quantities use the
  Section monospace stack and weight 400 in both themes. Options indices, values,
  summaries and mesh quantities do likewise; Section Apply and table targets
  measure 22px with 6px corners and ordinary 12px text in both themes;
- all drawing-role colour signatures represented by the 135-element pre-change
  baseline are retained in both themes. The current view also exposes existing
  centroid lines (`globals.css`, unchanged `#dc2626`); this is additional visible
  drawing content, not a palette change. No browser warnings/errors were observed.

Aggregate `npm test` remains non-green: 340 unit tests pass, then four pre-existing
ADSEC source-hash failures recur. KDS/P16 starts `9c08ebf4` versus manifest
`6d952aaf`; ACI starts `be988e18` versus `922c722e`. Data, manifests and oracle
tolerances were preserved. No engineering verification/release status is promoted.

The two Codex CLI runtime skill-invocation probes for this revision remain
unexecuted. Read-only sandbox attempts could not connect; automatic approval
review rejected external CLI access because it could transmit private skill and
design-contract contents without permission for that destination. The user was
asked for permission and requested an explanation; no permission has been granted.
The earlier revision's successful probes do not verify this revised workflow.
Claude CLI is not installed, so its explicit/natural runtime probes are also
unexecuted. Schema validation and adapter parity do not substitute for these gates.

Evidence: `controls-*.png`, `controls-measurements.json`,
`controls-drawing-comparison.json` and build/test/integration/bundle logs under
`C:/Users/USER/.codex/visualizations/2026/10/07/01a11417-ba2d-7102-86e7-ac5f59085602/workspace-style-qa/`.
UI implementation is available for review; aggregate ADSEC and cross-agent
runtime verification remain incomplete. Numerical benches were not applicable
to this presentation-only change.
