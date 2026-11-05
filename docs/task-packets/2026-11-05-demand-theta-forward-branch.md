# Forward branch of the load-angle cut

Status: implemented and regression-checked, Preview only. User correction on 2026-11-05.

- Objective: keep the optional red theta cut on the forward load-moment branch, consistent with
  the one-sided Direct-beta view, and always explain the option beneath the chart.
- Class: 3, geometric display query. Requirements: ENG-AN-003, ENG-RES-001/002, DEV-ARCH-006.
- Owners: root 05 section 8 first; engineering/05; development/04; analysis Demand P-M query,
  chart traces, Data snapshot and ResultsWorkspace footer. No normative material data changes.
- Contract: cut the same complete Nominal/Design surfaces, then retain Mtheta >= 0. Insert exact
  affine segment intersections at Mtheta = 0, preserve separate connected paths and source point
  order, and apply the same selection to pre-cap theta geometry. Never fold the opposite branch
  with absolute values or connect distinct components. Boundary points remain geometric evidence.
- Plot meaning: theta is the checked load-moment direction; beta is the strain-gradient direction.
  Surface/UR/checks, Direct-beta coordinates and diagnostics retain their existing owners.
- Oracles: exact synthetic closed/open paths and zero-moment edge intersections; mixed-sign,
  disconnected, zero-boundary and non-finite cases; positive-segment equivalence with an independent
  per-segment clip of the full surface cut; unchanged governing crossing and check; all current
  mechanics/stages/check-bases/units; plotted/Data coordinates and stable toggle layout.
- Impact: theta display arrays change to the forward half-section. Persisted inputs, reports,
  resistance domain, factors, numerical tolerances, governing UR and classification are unaffected.
- UI: a fixed footer note explains the red theta cut and its relation to load direction. Keep
  the existing compact checkbox and red styling, without checked-only explanatory content.
- Additional user clarification: Capacity plots the opposite +180-degree branch on the negative
  side while retaining positive M_R in calculations and tables. The concurrent working-tree
  change supplies signed M and positive MR with branchSign, including pre-cap paths and markers.
  Verify that behavior together with this forward-theta correction.

## Verification

- All 41 focused tests pass. Synthetic rectangle, open/disconnected, exact-axis, pre-cap and
  invalid-arithmetic cases exercise clipping independently. Real surface cuts match an independent
  per-segment half-plane clip using the existing normalized 1e-9 geometry scale. Governing crossings
  remain on the retained forward Design branch across the existing route/mode/basis/unit matrix.
- Full `npm test` passes with structure/docs/traceability/typecheck, 680 unit tests, AdSec, CAD,
  project round trip, independently recalculated workbooks and deterministic Unicode preview PDFs.
  The isolated production build, bundle gate and `bench:pipelines` pass.
- Production browser QA passes for both mechanics, light/dark and 1600/390-pixel widths. Theta
  curves are red and contain only nonnegative plotted moments. The fixed note explains the
  load-moment direction and forward branch before and after selection. Header/canvas rectangles
  and note content remain identical when toggled.
- Capacity QA verifies both plotted sides and exact per-point correspondence between signed x,
  positive M_R and branchSign, including station/pre-cap/cap-marker data where present. Source
  component signs remain available in chart data. Demand and Capacity screenshots were inspected.
- Evidence is retained under ignored `outputs/theta-forward*` logs/directories. No numerical
  baseline, material rule, resistance factor, governing utilization or project schema changed.
  This is Preview verification without independent design-release approval.
