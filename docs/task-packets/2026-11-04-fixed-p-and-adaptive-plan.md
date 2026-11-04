# Fixed-P contour reconstruction and Adaptive convergence

Research and implementation plan, 4 November 2026. Experiments ran on the local working tree based on `4709046`, using Node 24.22.1 on Windows x64. The implementation milestones below are proposed. The measurements describe section-resistance previews.

## Objective and scope

An engineer should be able to trace a loadcase marker to the actual Design surface segment at the declared axial force and identify which evidence supports its verdict. Fixed-P geometry and Adaptive convergence have different failure mechanisms. Deliver them in separate reviewable changes so any movement in the governing UR can be attributed to its source.

The matrix covers all seven registered profiles, the two KDS resistance routes where supported, both check bases and both sampling modes. The existing Fixed screening policy gives OK for UR ≤ 0.98, CHECK for 0.98 < UR ≤ 1.02 and NG above 1.02. Adaptive classification uses both convergence flags and the returned uncertainty. An axial force outside the Design range in a Constant-P check continues to have its own NG outcome. For all comparisons use full-precision, centroidal, code-adjusted factored demand, compression-positive force in N and moments in N·mm. The load angle is derived from the moment components. The direction that generated a surface meridian has a separate identity.

The principal requirements are ENG-LOAD-001, ENG-AN-002, ENG-AN-003, ENG-RES-001 and ENG-REP-002. Geometry and resistance sequencing are defined in [surface sampling §7](../05-pm-diagram-stations-angles-plotting.md), [demand checks §§3–5](../07-integration-edge-cases-and-qa.md), [convergence](../06-mesh-sizing-and-convergence.md), [materials §5](../engineering/04-materials-and-design-standards.md) and [verdict policy §§3–4](../engineering/05-loadings-analysis-results-and-reports.md). The [verdict matrix](2026-11-04-demand-verdict-matrix.md) and [Constant-P corrections](2026-11-04-constant-p-audit-fixes.md) record prior verification.

## New measurements

**Fixed-P.** Across 84 surfaces, five axial fractions and eight off-axis moment directions, all 3,360 tested rays had a qualified crossing. The legacy polar-sorted contour disagreed with the independent triangle-cut radius by more than the existing relative comparison criterion of 1e-6 on **22 rays across 10 surfaces**. The governing triangle query agreed with the independent control on all 3,360. The largest sampled difference was **+0.4554%** in moment capacity on the KDS Appendix block Adaptive rectangle, axial fraction 0.9 and second sampled octant. Its legacy radius was 117375874.6650 N·mm versus 116843746.4466 N·mm. These are geometric comparisons on stored surfaces, independent of whether a particular surface qualifies for an Adaptive verdict.

The smaller KDS Basic stress–strain Fixed rectangle provides a simple regression witness. At P = −610329.6 N and load angle 151.65°, triangle 682 contains the crossing. Its cut endpoints occur at positions 81 and 85 in the 88-point polar-sorted list, using zero-based indices. Connecting adjacent entries omits that physical segment. The direct cut gives 127264494.3914 N·mm and the flattened list gives 127321664.0570 N·mm. Use the fixture, plane, source connectivity and radius for the regression. Array ordinals are observations from this build.

**Adaptive.** For each of the nine previously unconverged fixtures, rebuild at 8, 10 and 12 passes, varying only the failing dimension. Keep the 1% targets, the 360-direction budget, the 48-station budget and the same physical demands. Both 0.91 and 1.10 boundary-scaled loads were replayed for both bases. Their raw URs agreed across these runs on the chosen rays. The convergence flags changed for five surfaces.

| Fixture and route | Measured dimension | 8 passes | 10 passes | 12 passes |
|---|---|---:|---:|---:|
| Hollow, ACI block | Direction | 1.3702% | 0.9889% | 0.9889% |
| L, KDS Basic block | Direction | 1.3260% | 1.3157% | 0.9943% |
| L, KDS Appendix block | Direction | 1.0783% | 1.0771% | 0.9966% |
| L, Custom block | Direction | 1.3162% | 1.3059% | 0.9928% |
| Two islands, AS block | Direction | 1.0727% | 1.0721% | 0.9643% |
| Hollow, AS block | Direction | 1.0593% | 1.0492% | 1.0485% |
| L, AS block | Direction | 1.5186% | 1.0083% | 1.0064% |
| Rectangle, KDS Basic block with hardening | Station | 8.2861% | 8.2861% | 8.2861% |
| Rectangle, KDS Appendix block with hardening | Station | 6.4059% | 6.4059% | 6.4059% |

For the four remaining surfaces, a second control gave both dimensions 12 passes and increased the station budget from 48 to 96. The maximum errors and evaluation counts stayed identical between those two budgets.

**AS diagnosis.** At a worst probe at 12 passes, evaluate both neighboring directions directly at the middle node's physical depth ratio, then repeat the angular midpoint comparison. For the hollow section the direct angular discrepancy was about 0.000055%, while interpolation in the right neighboring row contributed a normalized discrepancy of about 2.097%. For the L section the corresponding values were about 0.000144% and 2.012% in the left neighboring row. Direct middle-state evaluation reproduced the stored middle state to roundoff. These observations identify cross-row interpolation as the dominant term at the two traced probes. The existing combined test also measures a real error in the published facets and must still pass.

**KDS hardening diagnosis.** In both routes a worst station probe falls between the pure-tension pole and a finite-depth, steel-limited state. The requested midpoint resolves to the right endpoint at normalized coordinate 0.05278123334 and reproduces its entire resultant vector. The pure-tension pole has a different resultant. Repeated depth subdivision therefore supplies no intermediate compatible state on this chord. The experiment establishes the stall. Physical admissibility of a continuation between those states is an engineering decision.

## Delivery sequence

### 1. Capture the reference and make the existing discrepancy fail a test

Use an immutable input set for each comparison. Record worktree diff identity including untracked calculation files, expanded options, runtime, profile, resistance stage, demand basis, normalization scales and surface connectivity. Preserve separate records for the governing 3D/Constant-P query, the secondary radius and displayed/serialized geometry. Keep the governing Constant-P containment and transverse-exit tests from the existing corrections.

**Exit gate.** Reproduce the missing KDS segment and the largest KDS Appendix discrepancy through their existing public callers. Pin analytical box, separated bodies, nested loops, concave contour, single-point pole and cap-face cases before replacing the helper. Preserve a real unconverged case with finite UR as a negative verdict control. The analytic and independent segment oracles must run without calling the production contour builder.

### 2. Reconstruct Fixed-P paths in the analysis owner

Start at `sliceFixedPContour` in [the analysis package](../../packages/pm-analysis/src/index.ts). Introduce a transient slice result with the plane, resistance stage, ordered paths, individual point contacts and typed topology issues. A segment carries its triangle and two source-edge or source-vertex identities plus interpolation weights. A row used for a physical-station audit also retains its direction and physical bracket. Geometric cap intersections retain cap provenance.

1. Cut the declared indexed triangles by the plane. Construct each transverse segment before joining it to another. Reuse the existing separate axial-force and moment scales for geometric comparisons.
2. Join shared vertices and source edges by topology. Canonicalize equivalent pole/seam vertices using declared mesh identity. Test near-coincident disconnected components to prevent accidental welding. Keep the exterior perimeter of a coplanar face patch and suppress its shared internal edges.
3. Walk the segment graph deterministically into separate closed paths. Preserve winding and nesting for holes. A point contact is an explicit point result. Unexpected open chains, branch vertices and unresolved tangent/coplanar cases carry evidence and block a qualified radial ratio. A point geometrically on a cap face must retain its geometric state type.
4. Intersect the demand ray with the actual segments. Deduplicate genuine shared-edge crossings and distinguish tangency, axis outside, multiple exits and zero moment. For a qualified unique crossing, compare full P, Mx, My and multiplier against `intersectSurfaceAtConstantAxial`. Keep the independent production ray available for differential verification.

CGAL's plane/mesh slicer provides a reference for multi-polyline output, orientation and the coplanar-patch perimeter. The TypeScript implementation can use the project's existing indexed mesh. The external reference informs representation and does not supply a project tolerance. [CGAL 6.2 mesh slicer](https://doc.cgal.org/6.2/PMP_Boolean_operations/classCGAL_1_1Polygon__mesh__slicer.html)

**Exit gate.** Every rendered segment traces to a triangle cut or a permitted coplanar perimeter edge. Permuting face order and rotating the test geometry preserves the corresponding paths and radii. Tests verify disconnected components, holes, cap diagonals, exact vertices/edges and just-inside/outside axial levels. All 3,360 qualified matrix comparisons meet the existing 1e-6 relative radius criterion. Analytical fixtures separately verify ambiguous and unavailable outcomes. Freeze each surface during this milestone and require identical governing URs and verdicts for the same inputs.

### 3. Carry the path contract through each consumer

| Consumer | Work and acceptance |
|---|---|
| Capacity and Demand Check charts | Pass path breaks to Plotly. Fill only qualified closed regions and preserve holes. A Design marker must lie on its own Design path at the checked Pu. Exercise Nominal and before-cap overlays independently. |
| Table, row detail and inverse diagnostics | Use explicit path/branch and source-edge identity. Keep display sorting separate from geometric adjacency. Test that changing resistance stage either selects the same surviving source or reports it unavailable. |
| Worker, fallback and cached results | Carry the transient result across serialization, cancellation and stale-request guards. Compare single and batch checks after changes of basis, sampling mode, profile and Pu. |
| PDF and workbook outputs | Update the report model, Fixed-P curve renderer, chart audit and both mechanics workbooks. Audit the current stress–strain workbook call that supplies only `engineSurface.points`. Pass the stage's authoritative connectivity for capped and Adaptive data. Recalculate the workbook, check segment provenance and compare published radii with the same-stage kernel query. |

Important callers include [ResultsWorkspace](../../apps/web/features/section-editor/results/ResultsWorkspace.tsx), [table traces](../../apps/web/features/section-editor/results/chart-data-table.ts), [report curves](../../packages/pm-report/src/model/report-model.ts) and [stress–strain Excel](../../packages/pm-report/src/excel/stress-strain.ts). Inspect each contracted table separately. Physical reporting stations and intermediate triangle-edge vertices serve different audit roles.

**Exit gate.** Show an actual multi-component case in the browser and in the generated report. Verify separate branches even when the same ray meets several of them. Compare exported numbers at full precision and inspect the rendered artifact for fictitious connecting lines. Re-run the existing real-worker and report-verdict matrices.

### 4. Attribute Adaptive error and target the responsible interval

Work in [the block sampler](../../packages/pm-equivalent-block/src/surface.ts) and [the profile bridge](../../packages/pm-analysis-equivalent-block/src/index.ts). First add bounded diagnostic evidence for the worst interval including row angles, station coordinate, evaluated states, pre/post-pruning nodes, normalized component errors, evaluation count and stop reason. Collect this on the nine cases and converged controls. Separate pass exhaustion, point budget, duplicate physical state and residual facet error. Keep sampling diagnostics distinct from the inverse equilibrium result.

| Cohort | Candidate action | Evidence required before choosing it |
|---|---|---|
| Five pass-sensitive cases | Benchmark a bounded continuation of the existing refinement using the supported 10/12-pass configurations. Compare it with targeted row refinement under the existing default budget. | Both dimensions pass 1%. Compare UR and actual capacity points near the formerly worst cells to an independent exact block solve. Check all profiles for evaluation count, memory and determinism. Any default change goes through the parameter registry and project-option versioning review. |
| AS hollow and L | At the worst cell, separate direct angular curvature from interpolation of each neighboring meridian. When the latter dominates, prototype a physically admissible station in the offending neighboring row at the matched coordinate. Protect it during pruning while the facet still needs it, then rebuild adjacent topology. | The original combined facet estimator passes on the published mesh. Direct probes on each side and at additional interior coordinates agree with the independent block evaluator. Every refinement respects the expanded pass/station/direction budgets. A smaller angular-only diagnostic cannot qualify an inaccurate facet. |
| KDS hardening Basic and Appendix | Detect a midpoint that resolves to its endpoint while the other endpoint has a different resultant. Return an explicit unresolved steel-limit/pole interval and avoid redundant evaluations. Review the allowable family of compatible states connecting the finite bound to uniform tension for each block resistance route. | First deliver a correctly qualified CHECK and reproducible stop reason. Introduce a steel-controlled continuation only with an approved mechanics definition, each bar's signed strain limits, endpoint/ledger reconciliation and independent structural review. In its absence keep the affected path indeterminate. |

**Exit gate.** Each of the nine original failures gets a recorded disposition with before/after evidence. A case may become OK or NG only after the complete convergence and query checks succeed. Retain CHECK at the decision boundary, for invalid uncertainty and for intentionally exhausted or ambiguous runs. Exercise mixed steel grades, material-stage changes, transitions near the cap and asymmetric sections before extending any improvement beyond the measured fixture.

### 5. Verify and package separately

Treat the slice/query and sampling algorithms as numerical changes under [engineering change control](../engineering/06-verification-acceptance-and-change-control.md). Use Class 4 review where a published utilization/verdict changes or a new steel-controlled mechanics branch is introduced. Register deliberate changes to secondary URs and geometry by fixture, basis and consumer. Rebuild Adaptive surfaces independently and explain any resulting changes in capacity, uncertainty and verdict. Keep the two milestones independently reversible in source control.

Run the geometry, fail-closed and domain-owner tests, structure check, typecheck, full application/report tests, production build and web bundle gate. Run the capacity fingerprint gate on its declared reference runtime/platform or its documented portable comparison, plus strain-sampling, equivalent-block and cross-model benchmarks. Repeat the 84-surface/47,040-check matrix, the 14 example projects, report comparisons and actual-worker harness. Use fresh rays near the diagnosed cells and analyst-independent exact block checks alongside the original matrix. Report the Fixed-P discrepancy count, both convergence flags, qualified/unavailable counts, verdict flips with causes and measured computational cost. Review every numerical baseline difference before any update. Independent design-code and release gates remain separate from these software acceptance criteria.

## Research replay

The local research artifacts are in `outputs/contour-adaptive-research/`. From the repository root, run the following with the installed project runtime. The pass sweep uses the earlier verdict matrix output. The final trace records matched physical evaluations in an instrumented process and checks the returned maximum errors and kernel evaluation counter against the uninstrumented run.

```powershell
node --import tsx outputs/contour-adaptive-research/passes.cjs
node --import tsx outputs/contour-adaptive-research/four-controls.cjs
node --import tsx outputs/contour-adaptive-research/worst-trace.cjs
node --import tsx outputs/contour-adaptive-research/flat-sweep.cjs
```

The raw tables are `pass-sweep.json`, `remaining-four.json`, `worst-probes.json` and `flat-sweep.json`. The 22 observed differences concern the secondary contour radius, while the nine convergence cases concern the governing verdict on their corresponding surfaces. The samples establish regression targets. They do not establish a universal capacity-error bound.
