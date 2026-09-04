# AdSec Comparison Benchmark Plan

Status: **implemented as calculation-value differential evidence; preview only**.

## Task packet

Objective:

- Preserve the twelve AdSec reports as immutable external-source evidence and provide a
  manifest-driven, read-only calculation-value audit for P16, P16-Asym-H2, and Pylon1/CJ16.
- Compare `P/Mnx/Mny` only when the source and engine use the same printed deformation state,
  resistance level, axes, geometry, and locally evidenced material response. Utilization is
  excluded because its meaning depends on how `Mnx/Mny` are selected.

Engineering requirement IDs:

- geometry and reinforcement: `ENG-GEO-001` through `ENG-GEO-007`;
- materials and resistance-route integrity: `ENG-MAT-001` through `ENG-MAT-007`;
- demand frame/units and analysis: `ENG-LOAD-001`, `ENG-AN-001` through `ENG-AN-003`;
- result evidence: `ENG-RES-001` and `ENG-RES-002`;
- V&V gates B through E in `docs/engineering/06-verification-acceptance-and-change-control.md`.

Allowed packages/files:

- `docs/examples/reference-case/source/adsec/` for unchanged raw reports and provenance metadata;
- `docs/examples/reference-case/projects/adsec/` for generated schema-v1 inputs;
- `docs/examples/reference-case/expected/adsec/` for reviewed machine-readable comparison evidence;
- `tools/verification/adsec/` for the parser, case registry, comparison runner, and focused tests;
- `package.json` and verification documentation for read-only/update command wiring.

Production mechanics, code profiles, material laws, factors, tolerances, and report classification
are outside the allowed set unless a separately approved Class 3 or Class 4 task resolves a proven
defect or missing standard route.

Input contract:

- one manifest entry per report with source path, normalized-content hash, section family, report
  route, code/edition text, units, expected node/bar/load counts, topology segmentation, and
  provenance status;
- explicit external-to-project mapping: AdSec `y -> x`, `z -> y`, `N -> P`, `Myy -> Mx`, and
  `Mzz -> My`, subject to asymmetric and strain-plane verification;
- explicit force, moment, stress, curvature, and geometry units parsed from report rows rather than
  inferred from magnitude;
- typed `solved` or `no-solution` external result per load identity.

Output contract:

- deterministic parsed-report DTOs retaining source values and printed precision;
- direct in-memory reconstructions only; no project-v1 fixture is emitted when doing so would imply
  a hidden standard substitution;
- comparison JSON separating source values, engine values, source-rounding intervals, numerical
  error, relative/absolute differences, and `compared`/`not-comparable` status; it contains no UR;
- a concise console and Markdown summary with the exact source hash, engine/runtime versions,
  profile identity, mesh/surface options, and commands used.

Blocking failure cases:

- missing or changed source hash, duplicate case identity, malformed section boundary, count drift,
  non-finite value, unknown unit, or ambiguous source coordinate mapping;
- inability to reconstruct reported area/reinforcement area from the declared topology and bars;
- missing material-law data needed to replay a reported strain plane;
- an unexplained standard or edition mismatch; an ACI result may remain external differential
  evidence only and cannot establish edition verification;
- attempting to label the EC2-based KDS approximation as the repository KDS profile;
- comparing altered `ACI-2` demands with the original ACI rows as if they were identical;
- treating AdSec `No Solution` as a numerical zero, a passing case, or an engine failure oracle;
- non-convergence, topology failure, resource exhaustion, or unexplained full-precision drift.

Acceptance tests/oracles:

- parser golden tests for all twelve reports and mutation tests for units, section headers, counts,
  hashes, and `No Solution` rows;
- independent polygon and bar-area reconstruction for the three geometry families;
- direct forward replay of every fully specified reported strain plane, comparing `P/Mx/My`,
  concrete node strains/stresses, and all reinforcement strains/stresses without a surface query;
- nominal ACI comparison using source `Pn=P/phi` and `Mn`, with exact equivalent-block polygon
  clipping and the central printed AdSec plane retained as the steel deformation state;
- one `h -> h/2` empirical mesh-difference indicator for stress-strain integration routes; ACI
  equivalent-block cases have no mesh indicator because their clipping is exact;
- existing analytical, invariant, differential, regression, and benchmark gates remain independent
  and cannot be replaced by the AdSec suite.

Schema/provenance/report impact:

- no project schema or report-contract change;
- expected JSON records source hashes and external-program provenance only;
- raw reports and generated comparison data remain preview/verification evidence and cannot create
  an `acceptedResult`, a verified code profile, or a released report.

Out of scope:

- member stability, slenderness, second-order effects, detailing, and complete code compliance;
- calibrating production formulas or tolerances to make the AdSec values pass;
- implementing ACI 318M-08 or promoting EN/KDS/ACI profile status without normative traceability and
  independent structural review;
- deleting the legacy P16 source or regenerating current committed expected values before the new
  suite passes a reviewed migration check.

## Inventory findings

### Geometry and report coverage

| Family | Concrete topology reconstructed from report | Bars | Loads by report |
|---|---|---:|---:|
| P16 | 4-node exterior minus 4-node void; reported area `19.76E+6 mm2` | 408 | 6 EC2-based approximation, 6 EC2, 6 ACI, 8 ACI-2 |
| P16-Asym-H2 | P16 plus a second 4-node `300 x 1200 mm` void; reported area `19.40E+6 mm2` | 408 | 6 per report |
| Pylon1/CJ16 | 17-node exterior minus 15-node void; reconstructed area `8,840,227.9 mm2`, reported as `8.840E+6 mm2` | 232 | 4 per report |

P16 and P16-Asym-H2 use the same 408 bar records. Pylon1 uses the same coordinates and diameters
across routes; the EC2 report uses a different steel material label. The P16 EC2-based
approximation report differs from the legacy P16 source used by `verify:p16` only by one history
entry dated 18 August 2026, so the migration must select one canonical report explicitly.

### Material and resistance distinctions

| Report group | Report-declared model | Benchmark treatment |
|---|---|---|
| P16/P16-Asym EC2-based KDS approximation | EN 1992-1-1:2004, C50 explicit ULS curve for P16, `gammaC=1.000`, `gammaS=1.111`, `epsCu=0.0032` | custom external-match stress-strain fixture; not KDS code verification |
| Pylon1 EC2-based KDS approximation | EN 1992-1-1:2004, C45 parabolic-rectangular law, `gammaC=1.538`, `gammaS=1.111`, `epsCu=0.00325` | custom external-match stress-strain fixture; exact parameter provenance required |
| EC2 | EN 1992-1-1:2004, parabolic-rectangular concrete, `gammaC=1.5`, `gammaS=1.15`, `epsCu=0.0035` | compare only within the current EN preview scope and disclose missing National Annex |
| ACI / ACI-2 | ACI 318M-08, rectangular concrete, nominal strength plus reported strength-reduction factor | nominal `Pn=P/phi` and `Mn`; exact equivalent-block replay through the repository adapter, retained only as external differential evidence rather than edition verification |

The ACI reports label reinforcement as `Strain-hardening`. A case is enabled only when every printed
reinforcement strain/stress pair overlaps the elastic-perfectly-plastic replay within propagated
printed precision; no global hardening-law or edition equivalence is claimed.

### Load identity distinctions

- P16 ACI retains `No Solution` for original cases 1 and 6. P16 ACI-2 rotates those two demand
  directions and adds cases 7 and 8, which exercise non-0.90 strength-reduction factors.
- P16-Asym-H2 ACI retains `No Solution` for original cases 1 and 6. Its ACI-2 report rotates those
  demands and solves all six.
- Pylon1 ACI retains `No Solution` for original cases 1 and 2. Its ACI-2 report adds a nonzero second
  moment component to those two demands and solves all four.
- P16-family action units are `kN/kNm`; Pylon1 uses `kN/kNmm`.

## Implemented sequence

### Phase 1 — Source manifest and fail-closed parser

1. Add a machine-readable source manifest with normalized-content hashes and declared counts.
2. Extract the current P16 text parsing into a route-neutral parser that retains printed units,
   precision, report standard text, material blocks, load rows, summary rows, detail anchors, strain
   planes, and concrete/reinforcement tables.
3. Add parser tests for every format variant: ULS versus Nominal headings, EC2 `N/Mu`, ACI
   `P/Mn/phiMn`, `kNm` versus `kNmm`, and `No Solution`.
4. Keep the default verifier read-only. Any expected-data update requires an explicit `--update`
   command and a reviewed diff.

Exit criterion: every report either parses completely with the manifest counts and hash or fails
with a typed source error; no comparison runs on partial input.

### Phase 2 — Canonical input reconstruction

1. Build three geometry fixtures from explicit ring segmentation and preserve report IDs.
2. Recompute exact area, centroid, reinforcement area, and reference point before analysis.
3. Build separate material scenarios per report group; do not share a scenario merely because the
   concrete strength or filename looks similar.
4. Convert loads and curvatures once at the source boundary and record both source and canonical
   values.
5. Serialize/parse each representable project twice and require byte-stable canonical output.

Exit criterion: the input-only audit passes independently of capacity results. Unresolved topology,
material, standard, or provenance data blocks only the affected route and is visible in the suite
summary.

### Phase 3 — Forward-state differential verification

1. Replay each reported strain plane directly through the matching engine material law.
2. Compare point strains first; then concrete and reinforcement stresses; then contribution ledgers
   and total `P/Mx/My`.
3. Use asymmetric geometry and nonzero biaxial cases to prove the axis/sign mapping.
4. Separate integration-mesh convergence from constitutive disagreement by evaluating at multiple
   mesh levels while retaining the same source strain plane.

Exit criterion: every enabled route has an explained error budget for point values and resultants.
A rounded-source interval is not replaced by a convenient global relative tolerance.

### Phase 4 — Same-state resultant comparison

1. Derive source `Mnx/Mny` components from the capacity magnitude and that same case's printed
   `Myy/Mzz` direction; never substitute the nearest sampled surface angle.
2. Compare only the direct forward `P/Mnx/Mny` result at the evidenced strain plane. Do not compare
   UR, a separately queried fixed-`P` capacity, or a moment from another deformation state.
3. Preserve source `No Solution` rows as external diagnostics and mark them `not-comparable`; never
   convert them to zero or an engine failure oracle.

Exit criterion: every numerical row is either backed by same-state evidence or carries an explicit
`not-comparable` reason.

### Phase 5 — Gate integration and reviewed migration

1. Add `test:adsec`, `verify:adsec`, and `verify:adsec:update`; keep `verify:p16` as an independent
   compatibility check.
2. Publish one machine-readable aggregate with per-report/per-case evidence plus a Markdown summary.
3. Run `npm run check:structure`, `npm run typecheck`, focused parser/verification tests,
   `npm run verify:p16`, `npm run verify:adsec`, `npm test`, and the affected numerical benchmarks.
4. Review full-precision drift. Any unexplained result drift is Class 4 until resolved.
5. Only after a clean reviewed migration may the duplicate legacy P16 source/path be retired.

## Change classification and review independence

- The raw-evidence relocation was Class 1. The read-only parser/verifier is Class 2 verification
  infrastructure with no production mechanics, schema, formula, or result-contract change.
- Any change to mechanics, material models, code editions, resistance factors, applicability,
  tolerances, or production result contracts is Class 4. Numerical algorithm or dependency changes
  are at least Class 3.
- Commercial-program agreement is supporting differential evidence. It does not replace analytical
  oracles, clause traceability, authoritative examples, or independent qualified review.

## Audit outcome (Node 24.20.0 / npm 11.19.0)

- The 12 immutable reports contain 66 source cases: 60 solved rows and 6 AdSec `No Solution` rows.
- 57 solved rows are compared at an evidenced common deformation state. All 32 solved
  stress-strain rows are compared; 25 of 28 solved ACI rows are compared.
- The 3 remaining solved ACI rows are `not-comparable` because a printed concrete-node stress does
  not overlap the repository `beta1` block-boundary classification within propagated source
  precision. Their resultants are retained as diagnostic data but have no difference verdict.
- Across stress-strain routes, the largest moment-vector difference is `0.1600%` of the source
  capacity-moment magnitude and the largest axial difference is `0.0493%` of the documented section
  force scale. Across the compared ACI rows, those maxima are `2.1019%` and `0.6810%` respectively.
- The largest observed `h -> h/2` difference is `0.2335%` for the moment vector and `0.0748%` for
  axial force on the same normalization. These are empirical indicators, not error bounds.
- No universal acceptance tolerance, UR comparison, code-edition verification, or release verdict
  is assigned. Per-case source values, engine values, absolute differences, state evidence, and
  source hashes are in `expected/adsec/calculation-value-audit.json`.
- Passed gates: `npm run check:structure`, `npm run typecheck`, `npm run test:adsec`,
  `npm run verify:adsec`, `npm run verify:p16`, `npm test`, `npm run bench:verify:portable`,
  `npm run bench:strain-sampling`, `npm run bench:equivalent-block`, and
  `npm run bench:pipelines`.

## Open provenance decisions

Before the comparison can support a release gate, record:

1. exact AdSec product/version/build and export procedure;
2. identity/hash of the originating AdSec model files;
3. who prepared and independently checked each case;
4. exact source/justification for every modified EC2-based approximation parameter;
5. exact ACI 318M-08 material, `beta1`, strength-reduction, axial-limit, and reinforcement-law
   settings;
6. permission to retain and redistribute the raw reports in this repository.

Until those provenance items and an independent structural review are complete, the suite remains
external comparison evidence for a development preview.
