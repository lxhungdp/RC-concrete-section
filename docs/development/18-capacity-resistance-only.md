# Capacity Resistance-Only Presentation

Status: implemented; scoped presentation and regression checks passed on 2026-11-03. Preview only.

## Task packet

- Objective: remove demand overlays from Capacity while retaining its Design/Nominal resistance
  geometry and existing geometric inspection slices.
- Change class: 2, result-identical presentation change.
- Authority: development/04 sections 4 and 5; the workspace design standard.
- Owners: ResultsWorkspace and its SectionDrawingClient caller.
- Contract: Capacity 3D contains no loadcase markers, proportional demand paths, UR crossings or
  loadcase-specific field points; surface interaction cannot select a combination. Design/Nominal
  meshes, grids, cap qualification, Fixed-P slices and Direct-beta meridians remain inspectable.
- Blocking failures: changing numerical resistance, UR, persistence, demand fields or chart units;
  leaving a hidden demand trace/click route in Capacity; losing resistance inspection geometry.
- Oracles: production Plotly data equal the existing result DTO; no demand-related traces; Capacity
  geometry remains identical after selecting another loadcase; existing NG and field regressions.
- Schema/report/kernel/dependency/style impact: none. No new controls or plotting formulas.
- Out of scope: first-load performance optimization, new Demand Check charts, design-code changes.

## Verification

- `npm test`: PASS, including structure, typecheck, 416 unit tests, 5 AdSec checks, 11 CAD tests,
  project round-trip, independently recalculated workbooks, demand-check exports and reproducible PDFs.
- Focused results-view, surface-plot-geometry and current-loadcase-evidence tests: 15/15 PASS.
- Production build `HBSY2gQX_3oEruVlXNg3A` and bundle gate: PASS. Gzip initial 338.0/375 KiB,
  worker 79.2/120 KiB, Plotly 1325.4/1400 KiB and Excel 248.1/300 KiB.
- Production Edge browser regression: PASS for stress-strain and Adaptive equivalent-block.
  Capacity contains none of the five removed demand trace types. Design and Nominal plotted
  coordinates match their browser-worker result DTOs exactly; Design connectivity is unchanged.
  Direct-beta and grid inspection remain present. Selecting zero demand after an NG demand leaves
  the entire Capacity trace geometry identical. Light/dark screenshots cover both resistance stages.
- Existing Demand Check coverage remains PASS: inside/NG/extreme/axial/zero demands, Demand theta,
  Direct beta, Fixed-P paths and crossings, demand/capacity field selection, unchanged stored UR,
  display units, phone layout and a failed lazy field-chunk transport. No page or worker errors.
- The new presentation oracle is the same immutable browser-worker DTO consumed by the view.
  The first harness attempt compared it with an independently recomputed Node surface and observed
  small cross-runtime roundoff differences. The corrected check verifies exact source-to-view
  correspondence; no numerical tolerance, engineering oracle or benchmark baseline was changed.

Evidence: `outputs/capacity-resistance-only/{npm-test.log,typecheck.log,focused.log,build.log,
web-bundle.log,browser-final.log}` and `browser/browser-evidence.json`, with production screenshots
beside that JSON. The maintained browser harness is `tools/verification/demand-charts/browser.mjs`.
Runtime: Node 24.22.1/npm 11.19.1 on Windows.

Only the private web component props/click route and chart overlays changed. No numerical,
project-schema, report, dependency, CSS or control-role change was made. Numerical benchmarks were
not repeated for this presentation-only slice. Engineering acceptance/release gates remain unchanged;
these checks establish display/regression behavior only.


## Fixed-P table notation follow-up — 2026-11-03

The Design table headings and the lightweight table-export helper use `Mrx`/`Mry`, paired with
Nominal `Mnx`/`Mny`. This Class 1 wording correction retains the internal `Mx`/`My` component
values, units, resistance stages and formulas. No kernel, schema or report calculation changed.

Verification: full `npm test` PASS (416 unit, 5 AdSec, 11 CAD and all integration/export/PDF gates);
focused chart-data-table tests 12/12 PASS; production build `3ZQCkZgjwq9X-qGK8_kf6` and unchanged
bundle budgets PASS. Production browser checks confirm both stage labels, identical Design rows
after a stage round trip, no surface rebuild, Metric/US labels and light/dark/phone layouts, with
no page errors. Evidence is under `outputs/capacity-moment-labels/` (`npm-test.log`, `focused.log`,
`build.log`, `web-bundle.log`, `browser-final.log` and `browser-evidence.json`).
