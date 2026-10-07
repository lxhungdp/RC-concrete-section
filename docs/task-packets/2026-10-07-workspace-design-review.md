# Workspace control design review

Objective: centre Boolean icon/text actions; match compact Apply and Final;
introduce one smaller chart-control role; restore sidebar page tabs; frame the
calculation-basis summary visibly using the previous design as reference.

Change class: 1, presentation only. Authorities: docs/00, development/01 and /04,
docs/08, development/09, canonical workspace-style-design skill and the previous
calculation-summary styles at HEAD. Owners: shared chrome/tokens, relevant
Section/Material/Results/mesh/block markup, maintained design contract and
canonical skill/Claude adapter. No formulas, defaults, handlers, validation,
DTO/schema, report content, palette, dependencies or engineering-status changes.

Contracts:
- Boolean content uses one centred inline group, without pixel translations.
- Compact actions and Final use 22px/11px/400/6px corners; Apply/Final have a 44px
  minimum width. Final remains a noninteractive status with existing colours.
- Custom chart headers/toolbars use 20px/11px/400/4px corners, 6px padding, 4px
  gaps and 12px icons, including fields, joined choices, Hide/layout tools and
  mesh-navigation buttons. Mesh overlay text uses the same 11px/400 role.
  Numeric fields reserve 12ch plus padding/borders so values remain readable.
  Metric cards auto-fit with a 120px preferred minimum. Below 560px, chart
  panels stack in one scrollable column with a shared 420px minimum height.
  Sidebar visibility stays 26px; Plotly/data/drawing typography is unchanged.
- Sidebar page tabs retain the original hairline and active-underline design.
  Both height and minimum height enforce the shared 28px tab role.
- Calculation summary uses its field border/surface, 28px height and 330px
  desktop width, 286px below 1200px and code-only below 900px, with existing
  narrow toolbar omission and interaction semantics.

Baseline observation: Boolean icon/text bounds were horizontally centred but
text range sat about 0.6px above the button centre; Apply was 22px/12px while
Final was 24px/11px/600. New roles eliminate that inconsistent geometry/type.
Preserve unrelated uncommitted work. No CSS-mirror tests added.

## Verification evidence

Passed structure/parity checks, TypeScript, 47 focused results/geometry tests,
all 340 unit tests, CAD tests, JSON roundtrip, stress-strain/equivalent-block/
Demand Check workbook gates, PDF gates, production build and bundle limits.
Initial JavaScript is 372.7 KiB gzip against the 375 KiB limit; Plotly, worker
and lazy Excel chunks also pass. Canonical and Claude-adapter platform schema
validation pass. No oracle, manifest or tolerance was changed.

The aggregate `npm test` gate fails in four pre-existing ADSEC source-hash
checks: KDS/P16 actual `9c08ebf4...` versus manifest `6d952aaf...`, and ACI
actual `be988e18...` versus `922c722e...`. Its subsequent suites were run
separately and passed. This is a UI review, not engineering acceptance/release.

Rendered checks cover light/dark Section, Capacity, Demand Check, Material,
Options mesh/block, selection and keyboard/pointer interactions. Boolean
content is centred within 0.01px rounding horizontally and exactly vertically;
Apply/Final are both 44x22px with 11px/400 labels and preserved status colours.
Chart actions/fields retain their shared 20px/11px scale and numeric focus
uses the accent border. Hide/show and field mode still work with the keyboard.
Sidebar page navigation remains underlined tabs, not joined choices.
The 1024px layout retains the framed 286px code/method/resistance summary.
The 360px layout stacks full-width 420px charts with scrolling and two metric
columns, correcting the observed overlapping metric text. The desktop layout
retains its three-panel grid. Matching CAD states preserve all 135 pre-change
SVG role signatures in both themes; the initial light comparison differed
only because the boundary was hovered, resolved by matching selection/hover.

Local evidence is saved under the active Codex visualization directory's
`workspace-style-qa`: `design-review-measurements.json`, focused/aggregate/
integration logs and Section/Capacity/Demand/narrow screenshots. All recorded
rendered checks pass after the final preview refresh, including the legacy
30px minimum-height override removed from Material tabs. Temporary preview
tab/viewport/server are cleaned up; no project draft was applied or persisted.

Changed presentation owners: `workspace-tokens.css`, `workspace-chrome.css`,
SectionDrawingClient, MaterialPanel, ResultsWorkspace, AnalysisMeshWorkspace,
EquivalentBlockGeometryWorkspace and SectionMeshChart markup. Updated
development/09, the canonical skill and thin Claude adapter together.
Numeric contracts, persistence schema and report content have no change.

Current-revision CLI skill probes remain unexecuted: earlier automatic approval
review rejected transmission of private skill/design documents to OpenAI, and
the user has not authorized it. Claude CLI was unavailable at the preceding
environment check. Schema validation does not prove runtime discovery.
