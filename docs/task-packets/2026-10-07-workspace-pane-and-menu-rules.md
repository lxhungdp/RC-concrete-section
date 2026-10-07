# Workspace pane and menu rules

Objective: add the user's four presentation rules to the canonical design skill
and apply them across the workspace: popup/trigger font parity, separate rounded
sidebar and CAD panes, stronger selected navigation and no repeated module title
in the sidebar. Follow-up: match the outer left/right/bottom inset to the pane
gap, retain only the clickable PM logo, and move the existing application
information popup to that logo. Preserve the primary blue/teal and drawing palette.

Change class: 1, presentation and view-only layout. Owners: development/09,
canonical design skill and thin Claude adapter, shared chrome/tokens,
WorkspaceComboboxes, WorkspaceFrame/layout, SectionDrawingClient and layout tests.
Authorities: docs/00 and control map; development/01 and /04; docs/08; existing
workspace design contract. The user's rules supersede the source's joined frame
and the earlier fixed module header.

Contracts: expanded options copy the current trigger's computed typography before
popup sizing. Native values/events/keyboard behavior remain intact. Pane gap is
6px, defined by the pure layout owner and exposed to CSS by the shell and WorkspaceFrame;
the outer left/right/bottom insets use the same variable. The 28px logo opens
the existing information popup; its content/dismissal remain unchanged;
the toolbar title and separate right information button are omitted.
each pane has a one-pixel border and 12px corners. Resize preserves CAD space
after reserving the gutter. Top navigation is 13px/500, selected 600 with accent
tint/border and aria-pressed; selected appearance wins over hover. Functional
group captions remain. The sidebar keeps an accessible active-module label.

No engineering inputs, equations, normalization, defaults, persistence schema,
reports, dependencies, CAD roles, commits, pushes or deployment change.

Acceptance: computed typography parity for standard and table comboboxes in both
themes; separate panes/gap/corners on desktop and stacked mobile layouts; menu
selection/hover/focus and accessible state; no repeated module heading; pointer
and keyboard resize/reset/clamping; unchanged populated drawing colours; layout
tests, structure/typecheck, application tests, production build/bundle and skill
schema/adapter parity validation. Record failed/unexecuted gates below.

## Verification evidence

- Structure and strict TypeScript checks passed. All 340 unit tests passed,
  including the four focused sidebar-bounds and combobox-navigation tests.
- Production build passed for `/` and `/geometry`. Bundle gate passed: initial
  JavaScript 372.7/375 KiB, Plotly 1325.7/1400 KiB, worker 116.9/120 KiB and
  Excel 248.1/300 KiB, measured as gzip.
- Aggregate `npm test` stopped at the same four pre-existing ADSEC source-hash
  failures recorded in the preceding control follow-up: KDS/P16 source `9c08ebf4`
  versus manifest `6d952aaf`, ACI source `be988e18` versus manifest `922c722e`.
  No source, manifest, oracle or tolerance was changed. Separately executed
  downstream gates passed: 11 CAD tests, project JSON round trip, stress-strain
  and equivalent-block Excel exports, Demand Check workbook and PDF report.
- Rendered production UI passed in light/dark across Section, Materials,
  Capacity, Demand Check and Options, plus `/geometry`. Measured toolbar 44px,
  outer left/right/bottom insets and pane gap all 6px, pane borders 1px and
  corners 12px; repeated module headers absent. Selected navigation exposed
  `aria-pressed`, 600 weight and accent tint; other menus used 500 weight.
- Standard combobox trigger/options both measured 13px; table trigger/options
  both measured 12px, with identical family, weight, line height and letter
  spacing in both themes. Arrow/Escape retained the criteria value; file-format
  typeahead/Enter committed JSON and updated original action labels; pointer
  selection restored Excel. Browser console had no errors or warnings.
- Resize passed by keyboard (378 to 388px), pointer (378 to 428px), reset
  (378px), theme round trip and viewport clamping. At 600px viewport CAD retained
  280px with a 6px gutter. At 360px the panes stacked with 6px insets/gap,
  12px corners, hidden resizer and no horizontal page overflow. Pointer/Escape,
  pointer-cancel and lost-capture cancellation paths remain unchanged; this
  turn did not simulate a held-pointer cancellation.
- The single PM logo opened the existing information popup by pointer and Enter;
  Escape and outside/File-menu dismissal passed. The popup stayed within the
  360px viewport (left 10px, right 342px). No toolbar title or separate right
  information button remained. Application scope/status content was preserved.
- All 135 baseline CAD element style signatures were present in the current
  populated drawing in both themes (159 current elements, including existing
  centroid annotation). This checks drawing-role colours, not pixel identity.
- Canonical and Claude-adapter platform schema validation passed. Structure
  parity passed. Current-revision explicit and description-triggered Codex CLI
  skill probes remain unexecuted: the prior automatic approval review rejected
  external transmission of the private skill/design documents, and the user
  has not authorized that transmission. Claude CLI was unavailable in the
  prior environment check; its runtime probes remain unexecuted. Schema
  validation does not establish cross-agent runtime discovery.

Local evidence lives in the task's visualization directory under
`workspace-style-qa`: `pane-measurements.json`, `pane-tests.log`,
`pane-integrations.log` and `pane-*.png`. Numeric, schema and report impact: none.
UI behavior is locally observed; aggregate ADSEC and cross-agent runtime gates
remain unresolved. Engineering preview/release status is unchanged.
