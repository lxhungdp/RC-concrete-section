# Exact axial-cap intersections

Status: implemented with the required regression gates passed; Preview only. User-authorized on 2026-10-29 after identifying
the solid/dotted discontinuity and explicitly requesting the exact intersection plus remaining
original curve points.

## Task packet

- Objective: replace radial station-index cap projection with the actual geometric half-space
  intersection of the sampled pre-cap Design domain and P <= Pmax; share the exact cut endpoint
  between solid and dotted curves without changing any pre-cap physical strain/material state.
- Class: 3 numerical geometry correction with governing-result impact. Requirements: ENG-AN-003,
  ENG-RES-001, ENG-LOAD-001. Owners: root 05 section 9; stress-strain surface construction; shared
  purely geometric planar-loop triangulation; chart/table/audit consumers and regression evidence.
- Basis: root 11 defines an axial cap as a domain operation after resistance evaluation. No code
  coefficient, applicability, material law, resistance format, sampling schedule, sign or unit changes.
- Root cause: the previous implementation computed the correct crossing but multiplied its moments
  by station/crossingStation, never putting the actual crossing on the boundary. Its new side faces
  therefore changed the below-cap domain. The dotted pre-cap curve exposed that earlier error.
- Contracts: retain original below-cap vertices/side-face geometry; add source-edge intersection
  vertices with geometric cap provenance and no physical-station identity; close the actual cap
  loops with explicit topology. A one-direction query clips that exact meridian's original edges.
  Synthetic cap points carry no claimed material strain field. Before-cap Field solving is separate.
  The table includes an explicitly geometric `Pmax intersection` row. Chart-audit source rows use
  the interpolated ledger and leave physical criterion/strain/curvature values unavailable.
  Plane-cut graph welding retains exact cap-plane coordinates in preference to nearby interpolated
  side-edge nodes, including the theta=0 zero-demand view; no matching tolerance is increased.
- Independent oracles: exact affine edge intersections; half-space/ray identity
  lambda_capped = min(lambda_uncapped, Pmax/Pu) for positive compression demand; unchanged
  negative-P rays; identical below-cap plane cuts; cap topology/edge incidence; shared solid/dotted
  endpoints for sampled/exact beta and demand-theta; analytical polyhedra and existing block route
  as supporting differential evidence. No tolerance or baseline changes just to pass.
- Impact: affected near-cap UR/crossings can change; the earlier request to preserve UR applied
  to the display-only feature, not to preserving this demonstrated geometry error. Original ULS-2
  remains governed by the same Pmax/UR. Original Fixed ULS-1 changes approximately from
  1.5393867075082743 to 1.539353698893289 under the exact sampled-domain half-space operation.
  A 1440-ray diagnostic sweep of the example found 254 altered Adaptive rays and a worst measured
  UR difference of about 1.614%; this is example-specific, not a universal bound.
- Blocking failures: invalid/non-finite inputs, missing topology for unequal rows, unresolved cap
  loops or triangulation, non-manifold geometry, unsupported ambiguity, and failed physical field
  refinement. Do not nudge charts, normalize the final station ratio, use a convex hull, or retain
  an old UR disconnected from the corrected displayed domain.
- Pipeline: update geometric owner first; preserve compiled mechanics, original pre-cap evidence,
  transient field basis and the dotted/filled-marker presentation; update chart/audit consumers.
  Declare the report facade's import-time purity so filename/error-only UI imports do not load its
  workbook/numerical dependency graph. No bundle budget is increased.
- Scope/verification: affected geometry/analysis tests, independent cap oracles, application and
  export suites, build/bundle, relevant numerical benchmarks and browser replay. Existing nominal
  fingerprint baseline remains untouched. No persistence schema or release/accepted-result change.

The independent investigation and original incorrect endpoint/ray data are retained under ignored
`outputs/axial-cap-continuity/`. This packet supersedes development/14's unchanged-capped-domain
invariant only for this independently demonstrated cap-geometry correction. Formal independent
structural/code-profile release review remains outside this Preview change.

## Verification

- `npm test`: passed on the final shared workspace, including structure/type checks, 413 unit tests, ADSEC/CAD/round-trip checks,
  Excel formula replay for both mechanics, Demand Check workbooks and PDF report checks.
- New independent geometry tests cover an analytical box, affine meridian intersection,
  below-cap vertex identity, closed cap topology, missing/open/non-finite geometry failures,
  eight structural benchmark sections and sampled/exact-beta solid/dotted endpoint continuity.
- The original example's Fixed and Adaptive 1440-ray sweeps each match the independent half-space
  ray oracle after correction (2880 rays total, residual differences at floating-point roundoff).
- Numerical gates passed: `bench:strain-sampling`, `bench:equivalent-block`, `bench:pipelines`,
  and `bench:verify:portable` under the recorded Node 24.20.0/npm 11.19.0 reference runtime. The
  untouched nominal fingerprint has 17 permitted resultant roundoff deviations, worst
  section-normalized difference 4.957e-17. No baseline, screening margin or tolerance was changed.
- Production build and bundle gates passed: initial JavaScript 337.8/375 KiB gzip; worker
  79.2/120 KiB; Plotly 1325.4/1400 KiB; Excel 248.1/300 KiB. Budgets are unchanged.
- The production-browser Pmax harness passed for both mechanics: original cases, zero demand,
  Demand-theta/Direct-beta/3D continuity, filled markers, same-colour dotted overlays, cap-disabled
  cleanup, units, phone/light/dark views and actual Excel downloads. The general demand harness
  also passed, including missing field-chunk fault injection with governing UR/plots retained.
- Evidence is stored in ignored `outputs/axial-cap-continuity/`: original `evidence.json`, final
  `evidence-final.json`, `npm-test-final.log`, numerical/build/bundle logs, browser JSON/screenshots,
  downloaded chart-audit workbooks and `demand-browser` fault-injection evidence.

## Implementation and contract impact

- `pm-analysis/src/axial-cap.ts` owns stress-strain half-space clipping;
  `axial-cap-intersection.ts` shares the actual edge cut with dotted display paths. The root builder
  retains original pre-cap topology and constructs the explicit clipped Design mesh. Horizontal
  ray faces use their exact plane equation. Invalid geometry has the typed
  `INVALID_RESISTANCE_SURFACE` error from the shared `analysis-error.ts` class.
- `pm-geometry/src/triangulate-indexed-loop.ts` contains the extracted geometric triangulation used
  by both clippers; equivalent-block material/integration mechanics remain separate and unchanged.
- The plane-cut query preserves exact cap coordinates during node welding. ResultsWorkspace,
  chart-data-table and the chart-audit export show explicitly geometric cut points. The report
  facade's package metadata preserves lazy loading when only names/error types are imported.
- No persisted project schema, material/profile coefficients, sampling criteria or accepted-result
  status changes. Derived cap topology, near-cap query/UR values and chart-audit row counts change
  as documented. Nested cap loops remain explicitly unsupported/fail closed.

These checks are implementation/regression evidence. They do not constitute independent
structural/code-profile release approval or promote this Stage 1 section-resistance Preview.
