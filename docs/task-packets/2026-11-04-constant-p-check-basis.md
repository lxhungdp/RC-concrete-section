# Constant-P check basis

Date: 2026-11-04. Change class: 4, utilization and report classification. Status: Preview only.

Objective: add a project-declared alternative to the proportional 3D check. The new basis holds
`P = Pu` and intersects the horizontal ray through the demand with the same Design surface.
Requirements: ENG-LOAD-001, ENG-RES-001, ENG-REP-001, ENG-REP-002. Authorities: engineering/05 section
3, docs/07 sections 3-4, docs/05 sections 7, 9 and 10, docs/12 section 4, development/02 and
development/04. The basis is a project query, not a design-code rule, so no normative value is added.

Owners: `@pm/project` contract, `@pm/analysis` query and field, the block bridge, `@pm/report`, and web
Demand Check presentation. Input: `inputs.loadings.checkBasis`, default `proportional3D`. Output: the
existing check and inverse DTOs, with `utilizationDefinition` naming the basis.

Blocking failures: any change to `proportional3D` results; a ratio reported as total utilization;
UR = 0 for a zero-moment demand; a number where the ray has no unique
exit; an OK verdict with `Pu` outside the axial range; a proportional field shown under this basis;
stale evidence from the other basis; a renderer selecting or recalculating a ratio.

Oracles: the independent contour route on an asymmetric section; the exact block Fixed-P solver;
boundary demands scaled from stored contour points; byte identity of the default path; schema and
workbook round trips; worker and fallback equivalence; independent workbook recalculation.

Impact: project JSON gains one optional field under schema v3, and the input workbook moves to
version 8. Default results are unchanged. Reports gain basis labels. No material law, factor,
tolerance or baseline changes. The Fixed margin decision is recorded below.

Out of scope: a 3D chart in Demand Check, a Fixed-grid bound for this basis, and any change to code
axial caps or resistance factors.

## Delivered behavior

- `intersectSurfaceAtConstantAxial` shares the triangle pass of the proportional query and counts
  exits. `checkLoadcaseUtilizationFromSurface` selects the definition before minimum-eccentricity
  candidates are ranked. `Pu` outside the range is `inadequate` with no UR.
- An NG field is a physical state at `P = Pu`: a moment-only multiplier in the stress-strain Newton
  solve, and the exact `solveFixedAxialCapacity` state in the block route.
- Demand Check has Check basis radio buttons stored in project loadings. Its vertical path is horizontal
  at `Pu`, the table recalculates and the calculation detail shows the constant-P derivation.
- PDF, Demand Check, stress-strain and block workbooks take the basis and state it. The block inverse
  sheet compares P directly at constant axial force.

## Verification

Runtime: Node 24.22.1 / npm 11.19.1, Windows x64, unless stated. No baseline, tolerance or oracle was
changed. Another session's walkable-start fix in `sliceMomentPlane` shares this working tree and was
retained.

| Gate | Outcome |
|---|---|
| Default-path identity against the pre-change capture | 24 surface, demand and kernel records byte-identical; capacity fingerprint identical; workbooks differ only by the added Check basis row and its row shift, and run timestamps |
| `bench:verify:portable`, Node 24.20.0 / npm 11.19.0 | PORTABLE-EQUIVALENT, unchanged: 17 resultant roundoff deviations, worst section-normalized delta 4.957e-17 |
| `bench:equivalent-block`, `bench:strain-sampling`, `bench:pipelines` | passed, no failures |
| `npm test` | passed: 513 unit tests, 5 AdSec, 11 CAD, round trip, workbook and PDF self-tests |
| `check:structure`, `typecheck`, `build`, `check:web-bundle` | passed: 346.1/375, 1325.4/1400, 82.0/120, 248.1/300 KiB gzip |
| Differential oracle | 3D constant-P crossing against the contour route within 1e-6 relative, on KDS-REAL-05 and the L-shape, at four axial levels and eight off-axis directions |
| Physical field | both mechanics resolve an NG field at `Pu` on the demand direction, within 5% of the faceted crossing on Adaptive surfaces |
| Fail-closed cases | `Pu` above and below range, zero moment, axis outside the domain, non-unique exit |
| Workbook | serialized Demand Check workbooks recalculate independently in both mechanics |
| `tools/verification/constant-p-check/browser.mjs` | passed on the local dev server through the real worker, both mechanics: chart path horizontal, table equals the kernel, detail shown, project export keeps the basis, radios fit at 900 and 360 px, theme toggled, switching back restores table and path exactly |

Worker and fallback equivalence is covered by the browser
harness and the fallback tests, not by one direct comparison. The harness used a Playwright module
already on the machine through `PM_PLAYWRIGHT_MODULE`, because the repository does not install one.
Adaptive selection was exercised in tests, not in the browser. Independent structural review of
this basis is open, and no calculation or report is promoted from Preview.

## Decision: Fixed margin

Context: the first delivery returned `indeterminate` for every Fixed constant-P check, because the
2% screening margin was measured on proportional rays only. Decision, by the project owner on
2026-11-04: use the same 2% margin at constant P, in the same domains as the 3D ray. Alternatives
were keeping CHECK with Adaptive only, or measuring a bound first. Impact: Fixed stress-strain
plateau checks now classify as OK, CHECK or NG. Equivalent block and hardening stay CHECK under
Fixed. The verdict message states that the margin is unmeasured for this ray. This does not widen a
validated bound and is not a Fixed uncertainty claim; independent review remains open.

Measurement after the decision, one section only: KDS-REAL-05 stress-strain, Fixed 27 x 36 against a
converged Adaptive surface, 648 rays at nine axial levels and 72 off-sample directions. Fixed moment
capacity ranged from 2.31% below to 0.84% above the Adaptive value. The Adaptive reference itself
carries a 1% target, so this is a sampled comparison, not a bound, and it does not validate the margin.

## Decision: one Fixed rule

Decision, by the project owner on 2026-11-04: every Fixed check is OK, CHECK or NG with CHECK only
within 2% of UR = 1. This supersedes the previous section's scope and the 2026-09-03 decision that
failed Fixed equivalent-block checks closed. Alternatives were keeping CHECK, or Adaptive only.

Measurements, Fixed against a reference, 96 rays per basis. Unsafe means Fixed under-reports UR.

| Group | Reference | Sections | Worst unsafe | Worst safe |
|---|---|---|---|---|
| Block, 3D ray | exact block solve | 12 | 1.74% | 8.77% |
| Block, constant P | exact block solve | 12 | 1.31% | 11.61% |
| Hardening, 3D ray | converged Adaptive | 1 | 0.46% | 2.42% |
| Hardening, constant P | converged Adaptive | 1 | 0.38% | 3.84% |

Residual risk: the 2.18% audit case exceeds the margin, so 2% is not a bound. A row shown as OK has
UR <= 0.98, so under that worst case its true UR is at most about 1.0014. The audit demand itself
(UR 0.981, exact 1.001) stays CHECK. Hardening evidence is one section. UR values are unchanged; only
verdicts, intervals and messages change. Independent review remains open.

Verification of this decision: 24 surface, raw demand and kernel records stayed byte-identical, and
workbooks changed only in verdict, evidence and interval cells. `npm test` passed with 514 unit tests
plus the AdSec, CAD, workbook and PDF suites. The three benchmarks, the portable baseline on Node
24.20.0, build, bundle and the browser harness passed; block rows now show OK and NG away from UR = 1.
