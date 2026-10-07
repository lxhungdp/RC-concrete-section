# Workspace chart surfaces

Objective: remove the separate white chart backgrounds in Capacity and Demand
Check, and give all chart panels the same simple border and background as the
sidebar, as explicitly clarified by the user during implementation.
Change class: 1, presentation only. Authorities: docs/00; development/01 and /04;
docs/08; development/09 and the workspace-style-design skill.

Owners changed: shared tokens and final workspace chrome, ResultsWorkspace's Plotly 3D scene
background, maintained design contract, canonical skill and thin Claude adapter.
Each chart owns one 1px workspace border and 12px corners. The enclosing results
grid has no extra frame; charts use the sidebar's menu surface. Neutral metric
cards and Plotly backgrounds are transparent to their chart panel. Empty
results retain one pane border. Horizontal/vertical chart gaps use the shared
6px `--ws-pane-gap`, matching the sidebar/results gutter and shell insets.
The user rejected the border-matches-frame trial as too flat. The latest
solution separates neutral frame/panel/border brightness: light `#ececec` /
`#ffffff` / `#dedede`, dark `#1d1d1d` / `#282828` / `#3a3a3a`.
Both themes use the same `0 1px 3px` pane shadow, opacity `0.08` / `0.24`.
Share those panel outlines and depth
across sidebar, CAD frame, charts and Options mesh/block cards. Pane border
geometry remains 1px; retain current 12px corners and 6px spacing. Layout wrappers
are transparent and allow the short shadow to extend into existing gutters.
Neutral metric/status card outlines share the border colour. Primary, CAD and
trace/field palettes stay unchanged; control typography and behavior stay jscad.

No calculation, input, default, result eligibility, project schema, report,
dependency, trace/field/CAD palette, chart ordering, primary-chart behavior,
visibility, hover or selection-handler change. No new presentation-only tests
that mirror CSS. Acceptance uses rendered populated charts, computed surfaces
and border equality in both themes, resize/visibility behavior, console checks,
focused owner tests, structure/typecheck, application tests, build/bundle and
skill schema/parity validation. Record limitations without changing oracles.

## Verification evidence

- Structure, strict TypeScript and final production build passed. Bundle gate
  passed: initial JavaScript 372.7/375 KiB, Plotly 1325.7/1400 KiB, worker
  116.9/120 KiB and Excel 248.1/300 KiB, measured as gzip.
- All 35 focused results-owner tests and 340 application/package unit tests
  passed. The aggregate `npm test` stopped at the same four pre-existing ADSEC
  source-hash failures: KDS/P16 `9c08ebf4` versus manifest `6d952aaf`, ACI
  `be988e18` versus manifest `922c722e`. No source manifest, oracle or tolerance
  changed. Separately executed downstream gates passed: 11 CAD tests, project
  JSON round trip, stress-strain and equivalent-block Excel exports, Demand
  Check workbook and PDF report. Final colour/depth iterations changed CSS and
  documentation only; owner tests were not repeated for each colour trial.
- Final rendered Capacity and Demand Check had matching sidebar/chart
  backgrounds, 1px borders, border colours, 12px corners and shared shadows
  in both themes. Plotly paper/plot/scene and field-metric backgrounds remained
  transparent. Options mesh panels matched the sidebar's surface and border.
  No redundant frame remained around results or mesh layouts.
- Horizontal/vertical chart gaps, sidebar/chart gutter and shell insets all
  measured 6px. Chart promotion and hiding preserved these surfaces/gaps.
  Keyboard resize from 378 to 388px retained the 6px gutter. At 360px the
  sidebar/results panes stacked with a 6px gap and no horizontal page overflow
  in both themes. The viewport override was reset. Browser console had no
  errors or warnings.
- All 135 populated baseline CAD style signatures remained present in both
  themes (159 current elements, including existing centroid annotations).
  This checks role colours, not pixel identity. CAD drawing rules were unchanged.
- Canonical/Claude-adapter schema validation and structure parity passed.
  Current-revision explicit and description-triggered Codex CLI skill probes
  remain unexecuted: the prior automatic approval review rejected external
  transmission of the private skill/design documents, and the user has not
  authorized that transmission. Claude CLI was unavailable in the preceding
  environment check; its runtime probes remain unexecuted. Schema validation
  does not prove cross-agent runtime discovery.

Local evidence lives in the task's visualization directory under
`workspace-style-qa`: `chart-measurements.json`, `chart-tests.log`,
`chart-integrations.log` and final `chart-*.png` previews. The evidence represents
the final neutral pane-depth solution, superseding earlier colour trials.
Numeric/schema/report impact: none. Aggregate ADSEC and cross-agent runtime gates
remain unresolved; engineering preview/release status is unchanged.
