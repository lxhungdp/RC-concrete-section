# Hardening coverage corrections

Objective: close HA-01/02/03 from the working-tree hardening audit. Requirements: ENG-MAT-001/002/005
(existing material definition, straight interpolation and signed cutoff); engineering/04 section 5,
docs/12 two independent mechanics, development/04 auditable/recalculable reports, engineering/06.
Class 4 correction to capacity admissibility and calculated reports. No normative coefficient changes.

Owners: pm-report workbook formula/input binding and limit presentation; pm-equivalent-block Fixed-P
solver and the existing extreme-compression-strain resolver; pm-analysis-equivalent-block bridge.
Keep raw project JSON, material definitions and resistance formats unchanged. Namespace material
and tangent inputs per grade and workbook resistance stage. Reuse existing interpolation and unit
owners. Reject retained Fixed-P roots exceeding their signed limits using the pipeline's existing
1e-9 relative strain criterion; preserve actual compression-pivot kinematics. Physical rupture and
design cutoff remain distinct. No invented fuk substitution into code P0/caps.

Blocking failures: undefined Excel names, a shared tangent across grades, double strength reduction,
out-of-domain capacity roots, missing law IDs, non-finite limits/strains and misleading cutoff notes.
Oracles: independent endpoint interpolation and exhaustive per-bar signed checks; HyperFormula
recalculation after serialization and parameter edits; the audit's outside-tension-range case.

Verification: targeted regressions before/after fixes; full npm test, structure/typecheck, production
build/bundle, relevant equivalent-block, pipelines, baseline and strain-sampling benchmarks. Preserve
all baselines and tolerances. Add explicit coverage for chart/Fixed-P, point trace and shared-demand
Excel, mixed grades, Reference/Design, plateau, physical bounds and compression pivot.

Impact: invalid low-level Fixed-P candidates become no-capacity; exported formulas and explanatory
limits are corrected. No project schema, numerical material law, code factor or release-status change.
Independent engineering acceptance remains pending. Verification status: implementation and
development regressions passed; portable baseline equivalent under the existing project policy.

## Implemented corrections

- HA-01: chart/Fixed-P, shared Demand Check and selected-point workbooks now declare endpoint,
  cutoff and tangent names per grade. A shared report helper binds the existing material-owner
  formulas. Stage strengths are reduced once; the selected-point sheet now uses resolved stage
  yield strength. Independent recalculation also exposed and corrected the uniform-strain
  control-projection formula, which previously disagreed with its stored value.
- HA-02: Fixed-P roots are filtered against every bar's actual signed strain. The production bridge
  supplies the compression pivot; the exact tensile boundary is sampled so a valid boundary root
  is retained. Trial evaluations and code axial-cap formulas retain their existing meanings.
- HA-03: the block workbook separately identifies optional physical rupture and the effective
  tensile cutoff, including the minimum when both are declared.

## Verification evidence

Evidence is under ignored `outputs/steel-hardening/coverage-fix-*`; no baseline was regenerated.

- 22 focused regressions passed. They cover both mechanics, KDS/EN, Reference/Design, Appendix
  strength reduction, mixed grades and plateau/hardening, serialized workbook recalculation,
  direct-strength/ratio/strain/cutoff edits, independent endpoint interpolation, tighter inner-bar
  limits, physical compression rejection, compression-pivot retention and invalid inputs.
- Structure, TypeScript, production build and production bundle checks passed.
- Equivalent-block, strain-sampling and cross-model pipeline benchmarks passed with no failures.
- The default exact baseline command rejected runtime provenance (current Node 24.22.1 versus
  baseline 24.20.0). The existing portable gate was then run with an isolated official Node 24.20.0
  executable verified against its publisher SHA-256 manifest and npm 11.19.0. It passed against
  the unchanged darwin/arm64 baseline on win32/x64: 17 resultant roundoff differences, maximum
  section-normalized delta 4.957e-17. Exact cross-platform bit identity is not claimed. Neither
  baseline data nor comparison policy/tolerances were modified.
- Final full `npm test` passed: 483 unit tests, 5 ADSEC tests, CAD tests, project roundtrip,
  stress-strain Excel, equivalent-block Excel, Demand Check Excel and PDF integration checks.

These are development verification results. Independent engineering review/acceptance and release
gates remain separate; no calculation or report is promoted from its existing draft/preview status.
