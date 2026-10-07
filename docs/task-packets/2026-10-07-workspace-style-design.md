# Frame jscad workspace design adaptation

Objective: copy the user's Frame jscad design skill into P-M and apply its shared
workspace language throughout the web application. Keep P-M's blue/teal primary
actions in both themes, every CAD drawing colour, and text module navigation
without an icon rail.

Change class: 1, presentation and transient layout state only. No engineering
requirement, equation, input validation, calculation handler, default, persisted
schema, result classification or report content changes.

Authorities: `docs/00-README.md`, the control map, development/01 and /04,
`docs/08`, development/05, engineering/06 and `docs/09`. Source evidence is
Frame jscad's canonical `workspace-style-design` skill, its measurement ledger,
`UI_THEME.md`, shared tokens/chrome and SVG paths. The owning P-M adaptation is
[development/09](../development/09-workspace-design-system.md); the user's three
exceptions take precedence over source measurements.

Allowed owners: web presentation styles, shared React icons and workspace frame,
component markup/labels, layout tests, the canonical skill and thin Claude adapter,
the UI authority map and this packet. The source jscad repository is read only.

Input/output contract: existing project/editor inputs and exports are unchanged.
Sidebar width is session-only view state, clamped on window resize without losing
the desktop preference. The shared frame wraps the current editor and drawing;
existing resize observers remain responsible for canvas/plot resizing. Native
selects retain native option, keyboard and event semantics, with a shared closed
surface and SVG chevron. Native popup rendering is an intentional platform-owned
adaptation, rather than importing jscad's imperative DOM adapter into React.

Blocking failures: lost engineering controls or validation, changed drawing
palette, project data modified by layout state, inaccessible narrow navigation,
compilation or bundle regression. No new dependency, engineering migration,
deployment, commit or push is included.

## Implementation and evidence

- Canonical skill and copied measurement ledger live in `.agents/skills`; the
  `.claude/skills` adapter delegates to that canonical source. AGENTS.md and the
  control map route future UI work to the new contract.
- Shared tokens/chrome replace the old anchor-reference override. Geometry-only
  chrome uses the same contract; its existing drawing rules are retained verbatim.
- Toolbar is 44px, default sidebar 378px, joined workspace uses one separator.
  Standard fields/actions are 26px with 6px corners, numeric inputs are weight-400
  monospace in both themes, dense table editors are 24px. Resistance editors are
  96px wide so values such as `0.005` remain visible.
- Section, reinforcement, concrete/steel Materials, Capacity, Demand Check,
  Options, mesh view, project menu/information and calculation dialogs were
  inspected. Screenshots cover both themes, long labels and populated drawings.
- Actual CAD SVG role colours were compared with the pre-change populated
  baseline in light and dark: 135 elements, no changed or missing role signatures.
  Renderer palettes and numerical packages were not edited.
- Browser resize checks: pointer drag 428 to 518px; double-click reset to 378px;
  arrow and Shift steps; Home 260px and End 720px; theme round trip retains width.
  Tablet 768px and stacked 520/360px layouts have no document overflow; text module
  navigation and file popup remain reachable. Temporary viewport override reset.

## Verification status

Passed on Node 24.20.0 / npm 11.19.0:

- `check:structure`, `typecheck`, production build and `git diff --check`;
- all 338 unit tests, including two layout tests and 10 workbook tests with exact
  canonical round trips of 14 independent project JSON fixtures;
- CAD (11 tests), JSON roundtrip, Excel stress-strain export, Excel equivalent-block
  export, demand-check export and PDF-report integration gates, run separately
  after the aggregate command stopped;
- web bundle: initial gzip 372.6/375 KiB, Plotly 1325.7/1400 KiB,
  worker 116.9/120 KiB and Excel 248.1/300 KiB;
- platform skill validator for canonical and Claude adapter; Codex CLI read-only
  explicit-name and natural-description invocations both selected the canonical
  skill and its P-M contract. No Claude CLI is installed, so its two runtime
  invocation checks remain unexecuted; structure verifies adapter parity only.

Aggregate `npm test` is not green: after 338 passing unit tests it reaches the
same four existing ADSEC source-hash failures recorded before this task. KDS/P16
source starts `9c08ebf4` versus manifest `6d952aaf`; ACI starts `be988e18` versus
`922c722e`. Source data, manifest and oracle tolerances were preserved.

UI export was invoked without a browser error, but the in-app browser's download
event timed out; a downloaded file was not observed through that event. Workbook
generation, edited-file parsing and round trips passed the owner tests. Mid-drag
Escape/pointer-cancel/lost-capture restoration is implemented and code-reviewed,
but the browser's atomic drag API cannot exercise a held-pointer cancellation.
Native OS select popup appearance and these interaction checks remain manual QA
limitations. No pixel-perfect or complete cross-agent-runtime claim is made.

Desktop QA artifacts are in
`C:/Users/USER/.codex/visualizations/2026/10/07/01a11417-ba2d-7102-86e7-ac5f59085602/workspace-style-qa/`:
before/after theme screenshots, CAD comparison JSON, control measurements,
aggregate/build/integration logs and both Codex CLI invocation logs.

Status: requested UI implementation is available for review. Aggregate ADSEC and
unavailable Claude runtime gates remain incomplete. This Class-1 evidence makes
no change to engineering verification, acceptance or release eligibility.
