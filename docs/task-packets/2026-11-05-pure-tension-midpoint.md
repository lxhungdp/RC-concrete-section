# One shared fibre pure-tension midpoint

Status: Class 3 numerical sampling change implemented, Preview; current system checks pass,
historical fingerprint gate and independent engineering/release qualification remain open.

Objective: implement the user's explicit selection of one `Pure tens 50%` station with steel
hardening both On and Off, replacing the seven hardening-only seeds. The fibre analysis owner
supplies the station to surfaces, exact directions, Data, ledgers and reports; no UI-only row is
added. Equivalent-block mechanics retain their independent schedule and are outside this request.

Requirements: ENG-AN-001/002/003, ENG-MAT-002 and ENG-REP-002. Authorities are the control-map
parameter registry, [sampling §2.3](../05-pm-diagram-stations-angles-plotting.md),
[material domains](../engineering/04-materials-and-design-standards.md),
[forward ledgers](../03-forward-analysis-and-jacobian.md) and
[convergence](../06-mesh-sizing-and-convergence.md). This is an explicit sampling choice, not a
normative material or design-code change. Beta remains the strain-gradient direction; demand
moment direction still comes from `(Muy, Mux)` and queries the completed surface.

Allowed owners: `@pm/analysis` station assembly and focused tests; `@pm/results` station-ID type;
downstream benchmark metadata,
traceability, result/workbook verification and current documentation as required by those changes.
Existing MaterialPanel, ResultsWorkspace, chart-heading and layout work is preserved.

Input contract: persisted `unified-27-v2` and custom criteria, materials, units, profile, mesh and
resistance basis are unchanged. Values remain mm, N, MPa and N.mm with compression-positive P.
The normalized analysis adds one result descriptor after the last intermediate criterion. Its
definition is `tension-pole-transition-ratio`, source is that criterion, ratio is `0.5`, ID is
`pure-tension-transition-50`, and `fixed` is true.

Output contract: default Fixed fibre metadata has 28 descriptors with exactly one transition;
custom schedules gain the same one transition. Hardening On retains the compatible finite-steel
boundary; Off retains the existing three-leg path and pole assumption. Adaptive may add evaluated
midpoints for finite hardening and must report exhausted/nonconverged runs honestly. Legacy
unbounded transitions retain their existing adaptive exclusion. Uniform tension remains one
physical pole. All existing base states and the hardening 50% state must remain numerically
unchanged; surface interpolation and derived demand checks can change because topology changes.

Blocking failures: invalid/nonfinite inputs, violated signed strain bounds, incorrect station
ordering or duplicated poles, incompatible topology, unreconciled ledgers, false convergence,
unexplained base-state drift, or unexplained regression drift. No tolerance or oracle is relaxed.

Independent oracles: analytical strain equalities for the finite joint; existing scalar material
laws and per-bar force summation; independent horizontal-strip polynomial integration of the
reproduced KDS geometry; state continuity; mesh and station convergence. Compare common states
with the pre-change output by station identity. The screenshot is reproduced from
`KDS-REAL-05-complex-stress-strain` with endpoint hardening, beta 0 and seed 32. Its 50%-62.5% P
gap is continuous: loss of concrete compression plus additional steel tension, not a resistance
factor jump. The 50% ratio must not be described as 50% tensile capacity.

Acceptance: owner tests for both laws, mixed grades, inactive hardening, custom schedules,
adaptive success/exhaustion and existing input failures; structure/docs/traceability/type checks;
full test/build; relevant numerical, strain-sampling, sampling-mode and cross-pipeline benchmarks;
production bundle gate. Record any intentional historical fingerprint shape change separately
from unexplained numerical differences; do not overwrite a baseline merely to get a pass.

Schema/provenance/report impact: no project schema or dependency change. Result station metadata,
physical-state count, topology and derived checks change; reports consume those resolved values.
No result is promoted to accepted/released. Independent engineering and release review remain open.

Out of scope: constitutive equations, code factors, ultimate-strain defaults, solver tolerances,
mesh, block mechanics, duplicated transition equations in workbooks, extra fixed breakpoints or UI
control changes. The workbook consumes the engine plane for the new transition and independently
recalculates its forces; it must not assume extreme concrete strain stays at epsCu there.

## Numerical review evidence

The pre-change screenshot reproducer matches every displayed transition to two decimals. At 50%,
the Design ledger is concrete `+1386.753` kN and full steel `-3749.222` kN, for `P=-2362.469` kN.
At 62.5%, concrete contributes zero and steel contributes `-5161.949` kN. The constant factor is
0.85 throughout. The `2799.480` kN gap is therefore the loss of concrete compression plus
`1412.727` kN of additional steel tension. Independent compatible-state evaluation is continuous
through 50%; all bars have yielded around 51.9983%, and concrete compression disappears around
53.0957%. These percentages are case-specific, not new fixed criteria.

`outputs/pure-tension-audit/audit.ts` independently integrates the declared quadratic KDS law by
horizontal polynomial strips and sums bar endpoint laws. It does not call the production material
evaluator or triangulator. Mesh seeds 32/64/128/256 give 50% force errors of
`-14.063/-1.280/+1.468/-0.077` kN relative to that strip integral; the corresponding moment errors
are `-7.334/-0.659/+0.777/-0.041` kN.m. Steel summation agrees to floating-point
roundoff. This is code/solution verification for the declared project law, not design-code approval.

The user selected a compact Fixed schedule, not a higher-accuracy approximation. In this one
meridian, at `P≈-5123.18` kN, the new 50%-to-pole chord gives `|M|≈103.20` kN.m versus the
independent boundary's `64.81` kN.m, a local overprediction of `38.39` kN.m. The former 50%-62.5%
chord's maximum discrepancy over the same dense transition was about `8.13` kN.m. This is a
same-P meridian diagnostic, not a universal capacity or UR bound. The single midpoint must not be
presented as a convergence improvement. Fixed hardening uncertainty remains unqualified under
the existing policy; accepted-result/released-report gates remain blocked. Adaptive retains real
state refinement, existing tolerances/budgets and fail-closed convergence reporting.

A same-runtime differential against HEAD `9f09fdc` compares all 27 retained base states in each of
36 directions across eight benchmark sections: 7776 states and 163296 full-precision values
(resultants, state components and all five ledger parts) remain bit-identical. The reproduced
hardening 50% point, every other retained state and all ledger components also remain bit-identical.
Only the requested extra/removed descriptors, topology and derived interpolations may differ.

The permanent mixed-grade all-tension test now exercises Adaptive, where nonuniform all-tension
states are refined, instead of requiring a removed Fixed seed. Its admissibility and independent
dense-boundary checks are retained. New fixed tests independently derive the one-grade midpoint
strain equalities and bar forces for KDS/EN with hardening On/Off, and reconcile Nominal and Design
without double reduction. The XLSX integration test now reads resolved counts and evaluates the
transition row as well as both poles; an initial run exposed and led to correcting the old
constant-`epsCu` assumption for the newly visible plateau transition.

Historical capacity fingerprints are unchanged. `npm run bench:verify` stops on provenance:
the committed reference records Node 24.20.0/npm 11.19.0, while this workstation uses Node
24.22.1/npm 11.19.1. Its old 27-row array shape also predates this deliberate sampling change.
An isolated current-runtime repeatability run records a temporary fingerprint under `outputs/`
and compares a second run against it: all eight sections by 24 quantities are bit-identical. This
proves repeatability, not independent accuracy or a pass of the historical reference gate.

## Final gate outcomes

- `npm test`: pass, including structure/docs/traceability/strict type checks, 708 unit tests,
  ADSEC parser tests, CAD tests, project round trips, independently recalculated stress-strain,
  block and demand workbooks, and PDF report checks. All 28 default workbook rows, the custom
  extra midpoint and the final pole are covered without relaxing existing tolerances.
- `npm run build`: pass with isolated `PM_NEXT_DIST_DIR=dist/pure-tension-midpoint-next`.
- `npm run check:web-bundle`: pass against that build: initial 352.8 KiB, Plotly 1325.4 KiB,
  analysis worker 69.3 KiB and Excel 248.1 KiB gzip, inside unchanged budgets.
- `npm run bench:strain-sampling`, `npm run bench:sampling-modes`, and `npm run bench:pipelines`:
  pass with unchanged error tolerances. Fixed station-count expectations now explicitly
  distinguish fibre (28) from block (27).
- `npm run bench:verify`: historical comparison blocked by runtime provenance as described above;
  no baseline or policy changed. Separate current-runtime exact repeatability and pre/post
  common-state differential pass. This does not close the historical reference/review gate.
- Browser interaction was not exercised for this package change. A local HTTP probe was blocked
  by the sandbox socket restriction; no browser/UI runtime claim is made. Reports and existing
  view-model/package consumers are covered by the full test/build gates.

The resolved adaptive seed count also includes the new fixed midpoint. A budget that covers only
the persisted base seeds is rejected with typed `INVALID_ANALYSIS_OPTIONS`, rather than returning
more states than requested. A dedicated failure-boundary test covers this requirement.

Code and solution evidence support the declared sampling behavior and retained-state equality.
The coarser Fixed hardening interpolation remains a recorded limitation. There is no dependency,
project schema, material-law, code-factor, unit/sign or accepted-result classification change.
Author review is Codex; independent structural/software and release approval are not claimed.

## Later CI reference synchronization

The [fixture/CI follow-up](2026-11-05-complex-fixture-ci.md) selects versioned 28-station capacity
and P16 regression records after recovering the historical 27-station evidence by removing only
the added midpoint and rerunning its queries. The original historical files and the gate outcomes
above remain unchanged. Current exact/portable and external-comparison gates pass as recorded in
that follow-up; the compact Fixed hardening uncertainty and independent release gates remain open.
