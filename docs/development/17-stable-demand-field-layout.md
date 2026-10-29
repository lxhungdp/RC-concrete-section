# Stable Demand-Field Layout and Transitions

Status: implemented; scoped view/regression verification passed on 2026-10-29. Preview only.

## Task packet

- Objective: preserve CAD geometry placement and layout between loadcases, including Pmax, and
  replace completed results smoothly after load-reference Apply.
- Change class: 2, result-identical view-state/performance change; no mechanics change.
- Requirements: development/04 sections 5 and 7 (current evidence and immutable frame identity);
  engineering/05 field qualification; workspace design standard chart layout and shared roles.
- Owners: development/04; ResultsWorkspace, loadcase-calculation-trace, field/outline renderers,
  workspace-chrome layout; focused tests and production browser verification.
- Input/output contracts: existing immutable centroidal results and surface identity are unchanged.
  One outgoing frame may be displayed as previous, never promoted to the requested demand.
- Blocking failures: mixing partial/new evidence with old fields; publishing old UR as current;
  retaining a frame across a changed surface or removed row; hiding the before-cap qualification.
- Oracles: strict evidence-identity tests; identical section-to-pixel transforms; browser bounding
  boxes and mounted-canvas identity during delayed workers; exact canonical load/UR invariants.
- Schema/provenance/report impact: none. No dependencies, field palette, solver or sampling changes.
- Out of scope: new numerical algorithms, animation/interpolation of physical fields, released
  result eligibility, unrelated workspace edits.

## Verification

- `npm test`: PASS, including structure, typecheck, 416 unit tests, 5 AdSec checks, 11 CAD tests,
  canonical round-trip, independently recalculated workbooks, demand exports and reproducible PDFs.
- Focused final evidence/currentness and viewport tests: 8/8 PASS. Edited outgoing demands are never
  current evidence; removed rows, missing selection and changed surfaces withdraw old frames.
- Final production build and `check:web-bundle`: PASS. Gzip initial 338.0/375 KiB, worker 79.2/120 KiB,
  Plotly 1325.4/1400 KiB and Excel 248.1/300 KiB. Final structure check also passed.
- Production Edge UI: PASS on build `It81Ys_YKKmZk2Dd-caT5`, Node 24.22.1/npm 11.19.1 on Windows.
  Both mechanics cover inside, NG/extreme, above-Pmax, zero and unavailable fields; constant CAD,
  footer and panel boxes; identical section placement across field/outline; rapid selections;
  primary/secondary/hidden charts; light/dark; 1600px and 360px layouts.
- Requests were delayed by 650 ms. Each completed run observes 41–83 previous-frame samples per
  switch and 88/90 Apply samples. The outgoing renderer remains mounted and explicitly labelled;
  a field canvas retains its pixels until replacement. No current frame is associated with another
  requested row. Applying the previewed origin does not refit the drawing.
- Convert preserves the exact canonical combinations, result DTO and UR, with no calculation jobs.
  Unchecked Apply changes canonical demand according to the existing project translation owner,
  then publishes the existing kernel check; it does not change capacity or the centroidal convention.
- Existing demand-chart production regression: PASS for stress-strain and Adaptive block, Mx–My,
  Demand theta, Direct beta, proportional paths/crossings, UR, units, 3D selected ray, responsive
  layouts and unavailable-field chunk transport. No browser or worker errors.

Evidence: `outputs/stable-demand-field/{npm-test.log,focused-final.log,build-final.log,
web-bundle.log,structure-final.log,browser-pass.log,browser-evidence.json,demand-browser.log}`;
production screenshots and `demand-regression/browser-evidence.json` are adjacent. The maintained
browser harness is `tools/verification/stable-demand-field/browser.mjs`. Harness corrections wait
for imported rows in the mounted Demand Check workspace, handle the SVG-only field state, and use
`resolveLoadcaseField` for field eligibility rather than treating a diagnostic capacity candidate
as a governing physical field. No engineering expectation or numerical tolerance was relaxed.

Numerical benchmarks were not repeated because this slice changes only web presentation and
transient view history. It does not qualify mechanics, code profiles, accepted results or released
reports. General display-driver/browser performance beyond the measured fixtures remains outside
this scoped verification. Previous unrelated working-tree edits were preserved.
