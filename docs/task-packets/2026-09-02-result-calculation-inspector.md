# Result calculation inspector — task packet

Objective:
Replace the chart-row summary popup with an engineer-facing calculation trace that derives the
displayed `P`, `Mx`, and `My` from basic geometry/material inputs, the active integration model,
compatible strain state, contribution ledgers, and exactly one resistance route.

Engineering requirement IDs:
`ENG-GEO-003`, `ENG-GEO-006`, `ENG-MAT-002`, `ENG-MAT-003`, `ENG-MAT-004`,
`ENG-MAT-006`, `ENG-AN-001`, `ENG-RES-001`.

Change class and status:
Class 2, preview-only and result-identical. The calculation kernels, coefficients, surface sampling,
stored resultants, project schema, and accepted/released status do not change. A selected stored
physical state is re-evaluated only to produce auditable evidence, then reconciled against that
state's stored ledger before publication.

Owners and allowed files:

- engineering meaning: `docs/engineering/04-*`, `docs/engineering/05-*`, `docs/03-*`, `docs/02-*`;
- stress-strain evidence: `@pm/analysis`;
- equivalent-block evidence: `@pm/analysis-equivalent-block` and `@pm/equivalent-block`;
- lazy orchestration: web analysis worker/client contracts;
- presentation only: Results calculation dialog and styles;
- focused tests and owning documentation.

Input contract:
Applied exact section, rebars, source material store, selected calculation profile, DesignBasis,
model-specific analysis options, resistance stage, and one or more stored `PreviewSurfacePoint`
objects selected by the existing Vertical or Fixed-P row query.

Output contract:
A discriminated, serializable audit DTO containing the analysis origin; effective material inputs
and formula/provenance descriptions; mesh or exact-block geometry evidence; strain/depth profile;
concrete contribution groups; every rebar contribution; resultant reconciliation; and any typed
reason why a synthetic pole/cap point has no unique physical state. React formats this DTO and does
not evaluate a material, apply a factor, clip geometry, search a bracket, or recreate a resultant.

Blocking failure cases:
Unknown profile, invalid material/geometry, unusable mesh, unsupported mechanics/model pairing,
non-finite audit term, missing steel law, synthetic point without a physical state, or a
scale-aware reconciliation failure. Such a branch displays a blocking evidence gap and never
fabricates a calculation route.

Acceptance tests and oracles:

- stress-strain audit group and bar sums reproduce `evaluatePreparedState` and the stored point;
- equivalent-block audit reproduces exact clipped block and bar evaluation from the owner kernel;
- global-factor and design-material stages select the correct material/resultant route exactly once;
- Fixed-P retains independent lower/upper endpoint audits and the existing interpolation evidence;
- UI has no profile-status/sampling noise, orders inputs before integration/results, and draws
  strain/stress profiles with an explicit off-section neutral-axis indication;
- structure, typecheck, focused tests, full tests/build, web-bundle, and relevant numerical
  regression gates pass without capacity fingerprint drift.

Schema/provenance/report impact:
No persistence or accepted-result schema change. The worker protocol gains a preview-only lazy
query. The audit reports the exact DesignBasis identity and existing code/profile provenance; when
the current material contract lacks clause-level provenance, it says so explicitly instead of
inventing a reference. Existing Excel formulas remain an independent presentation oracle.

Out of scope:
Changing standard coefficients or interpretations, claiming design-code verification, exposing all
quadrature rows in the browser, changing surface/interpolation algorithms, member/slenderness or
second-order design, and promoting preview results to accepted or released status.

Verification record — 2026-09-02:

- `npm test`: passed 265 unit tests plus CAD, round-trip, station, Excel, demand-check, and PDF
  integration suites. Test-regenerated reference workbooks were restored and are not part of this
  change.
- `npm run bench:verify`: bit-identical capacity fingerprints for 8 sections and unchanged inverse
  residuals.
- `npm run bench:strain-sampling`, `npm run bench:equivalent-block`, and
  `npm run bench:pipelines`: completed with no verification failures.
- `npm run build` and `npm run check:web-bundle`: passed; the analysis-worker bundle remains within
  its reviewed limit.
- Focused stress-strain and equivalent-block audit tests passed, including group/bar closure,
  material-factor separation, selected-result reconciliation, exact block stress discontinuity,
  and typed unavailability for synthetic axial-cap points.
- Browser review covered stress-strain Vertical and Fixed-P rows, equivalent-block rows,
  material-factor Nominal/Design separation, and an off-section neutral axis. No console errors
  were observed.
