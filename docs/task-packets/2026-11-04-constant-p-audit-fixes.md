# Constant-P audit corrections

Objective: close CP-A01/02/03 from the working-tree audit at HEAD
`4709046611bd7e42f66413e6c9ac4247293e3e7a`. Class 4 (domain query and report evidence).
Requirements: ENG-AN-003, ENG-RES-001/002, ENG-REP-001/002. Authorities: engineering/05 sections
3–4, docs/07 section 4, docs/03 and docs/06 normalized residuals, development/04 reporting contract.

Owners: `@pm/analysis` Constant-P query; block bridge field evidence; `@pm/report` standalone block
equilibrium sheet and basis labels. Preserve existing uncommitted work. No normative coefficient,
material law, resistance surface, schema, Fixed margin or proportional-query change is authorized.

Input/output contract: Constant P scales only moments; P remains Pu in state, residual, normalized
evidence and workbook. Establish axial-axis containment independently of crossing-count parity.
Tangential/coplanar ambiguity cannot produce an adequate verdict. Use the existing normalized
geometry criteria, signed solid-angle containment and transverse crossing evidence; an interior
horizontal axial-bound face remains a permitted start in its closed Constant-P cross-section.
The proportional branch retains its existing arithmetic, formulas, residual norms and wording.

Blocking failures: exterior axis accepted at a tangency; ambiguous exits published as capacity;
inconsistent field residual/norm; workbook scaling Pu by the moment multiplier; unexplained
proportional result drift. No capacity fallback or fabricated numerical sentinel.

Oracles: analytic closed tetrahedra/cubes, vertex/edge/tangent/coplanar cases and rotations;
direct per-component balance and normalization; serialized Excel recalculation and residual/verdict
assertions; pre-change captures of proportional checks, physical states and workbook cells.
Verification: focused red/green regressions, full npm test, structure/typecheck, build/bundle,
baseline portability, strain sampling, equivalent block, cross-model benchmarks and browser harness.
Baselines, oracles and tolerances are retained. Release/independent structural acceptance remains open.

Impact: Constant-P ambiguity becomes unavailable; corrected evidence/recalculation for balanced
states. Out of scope: member design, new code clauses, remeasurement of the Fixed margin and release.
Status: implemented and development verification passed; independent engineering release review
remains open. The transient query gains `geometric-ambiguity`; persisted project/schema contracts
are unchanged. The geometric formula source is recorded in docs/07; no package dependency is added.

## Corrections and evidence

- CP-A01: separate signed-solid-angle containment from selected-ray parity, reject opposing
  incident hit directions and coplanar side contacts, and preserve genuine shared-edge/vertex exits
  and horizontal axial-bound starts. The proportional intersection visitor is unchanged.
- CP-A02: share the declared axial/moment target convention between block solver and field
  evidence; Constant-P residual norms use the actual residual vector and existing block surface
  normalization. Proportional arithmetic/norms retain their original branch.
- CP-A03: standalone block Equilibrium formulas, normalization, labels and verdict use Pu without
  the moment multiplier. PDF Constant-P detail captions identify the proportional secondary ratio.

Verification artifacts are under ignored `outputs/constant-p-fixes/`. Prior audit artifacts remain
unchanged. The pre-fix red run failed on all three omissions; the final focused run passed 41 tests.
Fourteen new tests cover rotated exterior-axis tangencies, genuine edge/vertex exits, cap-face
starts, coplanarity, remote tangencies, field residual/norm reconciliation and independent standalone
workbook residual/verdict recalculation under both bases. Existing fallback tests also assert every
Constant-P field residual component. No tolerance or oracle was loosened.

The original audit reproductions now return axis-outside-domain with no UR; the balanced field has
ΔP=0 and norm 1.0998e-16; the recalculated workbook has ΔP=-4.55e-13 kN and reconciles the
Constant-P state (relative residual 8.52e-16).

Proportional pre/post captures match exactly after excluding explicitly identified generation
timestamps: two mechanics, eight checks, four inverse/field records, two shared Demand Check
workbooks and one standalone block workbook. Every number, formula and other label is retained.
Capture/comparison scripts and raw evidence are in the output folder; baseline data were not edited.

Full `npm test` passed on the current shared working tree: 579 unit tests, 5 ADSEC, CAD, project
roundtrip, both calculation workbooks, Demand Check and PDF integrations. Structure/typecheck,
production build/bundle, equivalent-block/strain-sampling/pipelines benchmarks and the existing
real-worker browser harness passed. Browser evidence covers both bases/mechanics, values, paths,
detail, persistence, narrow layouts and restoration. Unrelated concurrent changes were preserved.
The unchanged portable baseline passed on Node 24.20.0/npm 11.19.0: 17 resultant roundoff differences,
maximum section-normalized delta 4.957e-17. Normal verification used Node 24.22.1/npm 11.19.1 on
Windows x64; exact bit identity against a macOS baseline is not claimed. No Fixed-margin policy,
material law, resistance factor or accepted/released status changed.
