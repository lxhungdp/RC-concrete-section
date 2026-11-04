# Demand verdict consistency across profiles and mechanics

Date: 2026-11-04. Status: software verification completed for the declared matrix, Preview only.

Objective: audit OK/CHECK/NG across every registered calculation profile, both KDS resistance
routes, Fixed/Adaptive sampling, and proportional/constant-axial checks. Reproduce UR 0.91 and
outside-capacity demands without treating one fixture as evidence for every route.

Requirements: ENG-RES-001, ENG-AN-002, ENG-AN-003, ENG-LOAD-001, DEV-ARCH-006.
Authorities: engineering/05 sections 3-4, engineering/06, docs/05-07, docs/09, docs/12,
development/01, development/04-05, and the superseding one-Fixed-rule decision in
[the constant-P packet](2026-11-04-constant-p-check-basis.md).

Change class: 2 for diagnostic propagation with result-identical arithmetic. No change to the
classification thresholds, resistance factors, material laws, surface construction or resource
limits is authorized by this packet. A discovered numerical defect requires a separately recorded
impact assessment before correction.

Owners: @pm/results classification, @pm/analysis check evidence/messages, worker/fallback
orchestration, @pm/report consumers, and the web table/calculation-dialog presentation.
Input/output numerical contracts and persisted schema remain unchanged. The existing check
message must distinguish a decision-boundary interval from missing intersection, undefined
constant-P ratio, missing/invalid uncertainty and unconverged Adaptive evidence.

Blocking failures: code/mechanics-specific Fixed verdicts; CHECK away from the Fixed band when
a valid ratio exists; Adaptive OK/NG despite non-convergence; stale cross-profile/basis evidence;
UI/report recomputation of classification; universal near-boundary explanations for undefined or
unconverged checks; changes to any pre-existing user work or normative value.

Oracles: analytical interval boundaries; independently constructed closed polyhedra for query
failures; surface-boundary scaling; triangle-contour differential checks; batch/single and
worker/fallback agreement; report DTO equality. Examples remain software verification fixtures,
not normative capacity oracles. The broad geometry matrix covers rectangle, hollow, L-section and
disconnected solids, supplemented by the current example projects and finite-steel domains.

Scope: all seven registered calculation profiles, KDS basic/Appendix routes (nine route selections),
two sampling modes, two check bases, axial/bending/biaxial/zero/outside demands, interval transitions,
and retained non-convergence failures. Unsupported code/method combinations must not be invented.

Impact: diagnostic text, regression coverage and evidence only; no numeric/schema/resistance or
report-verdict change. No profile is promoted to verified, accepted or released. No deployment,
commit or baseline update is part of this task.

## Initial findings

- The committed baseline supplied null Fixed uncertainty for equivalent-block and finite-steel
  domains, forcing CHECK regardless of UR. Existing uncommitted work already replaces this with
  the common project-selected 2% Fixed rule; preserve that change and lock it with cross-profile tests.
- Default Adaptive ACI and AS hollow-section surfaces can exhaust refinement before the direction
  target is satisfied. Their finite UR is diagnostic and their CHECK must remain fail closed.
- The dialog currently appends a boundary-crossing explanation to every indeterminate result,
  and the table suggests Adaptive even for an already-Adaptive non-converged run. These messages
  conceal the actual cause and need to consume the owning check's diagnostic instead.

## Verification

Evidence is scoped to the current dirty working tree, not a deployed build or an independent
design-code/release assessment. Generated observations are under ignored `outputs/verdict-audit/`.
Other active work in this checkout changes Constant-P geometric/admissibility and field evidence;
those edits were preserved. This packet owns diagnostics and tests, not those numerical changes.

| Check | Result |
|---|---|
| `node --import tsx tools/verification/demand-verdicts/run.ts --full` | 84 surfaces, 47,040 classified checks, 3,360 independent triangle-plane/segment-ray comparisons; no failures |
| Four geometry categories and all nine route selections | both modes, both bases, five axial levels, eight off-axis directions and seven demand scales |
| Finite-steel supplement | KDS fibre/block with both resistance routes, EN fibre, Custom fibre; both modes on the rectangle |
| `node --import tsx tools/verification/demand-verdicts/examples.ts` | all 14 repository example projects, 180 authored-load checks, 56 project/mode/basis configurations; no failures |
| Focused unit suites | 32 matrix/evidence tests, 18 report/table equality tests, three shared-classifier tests passed |
| `npm test` | passed: 578 unit tests, five AdSec, 11 CAD, round trip, workbook and PDF checks; the added axial/zero assertions also passed in the subsequent focused run |
| `check:structure`, `typecheck`, production `build`, `check:web-bundle` | passed; gzip 346.7/375, 1325.4/1400, 82.8/120 and 248.1/300 KiB |
| `bench:strain-sampling`, `bench:equivalent-block`, `bench:pipelines` | passed, no verification failures |
| `bench:verify:portable` on host Node 24.22.1/npm 11.19.1 | rejected by the provenance gate, as required; reference runtime is 24.20.0/11.19.0 |
| Same portable gate on the existing reference runtime | passed: PORTABLE-EQUIVALENT, 17 roundoff deviations, worst section-normalized delta 4.957e-17; no baseline or tolerance change |
| `tools/verification/demand-verdicts/browser.mjs` | 19 configurations, 228 table verdicts through actual browser workers equal fallback/kernel verdicts, both bases; no page errors |
| Browser diagnostics | real unconverged ACI hollow case displays the owning failure reason in the tooltip/dialog, including light desktop and dark 360px layouts |

The browser harness uses the already installed Playwright module via `PM_PLAYWRIGHT_MODULE` and
the existing localhost:3001 application. Sandbox Edge startup failed; the same isolated headless
harness passed outside the sandbox. No dependency was installed. A second server launch found the
port already occupied, so the existing server was retained. This is local application evidence,
not evidence about the public deployment.

## Findings and disposition

**VDM-001 (ENG-RES-001, corrected by existing work and regression-locked here):** committed code
gave Fixed block/hardening checks no uncertainty, so UR 0.91 and 1.1 both became CHECK. The current
working tree applies the previously authorized common Fixed rule to every registered route. The
new matrix locks that policy without introducing a code-specific exception. No valid-ratio Fixed
case in the matrix is CHECK outside the prescribed band.

**VDM-002 (ENG-AN-002/ENG-RES-001, retained blocking evidence):** nine Adaptive configurations do
not converge. Seven miss the 1% direction target after eight passes: ACI hollow; AS hollow, L and
two-island; KDS basic/Appendix L; Custom block L. Their direction estimates range from 1.06% to
1.52%. Two further cases, KDS block hardening on the rectangle with basic/Appendix resistance,
miss the station target (8.29%/6.41%). Every demand checked on these surfaces remains CHECK even
when the diagnostic UR is far from one. No tolerance, pass limit, profile or acceptance gate was
relaxed. The fix replaces misleading near-boundary text with the actual missing-convergence reason.

**VDM-003 (ENG-AN-003, separate existing preview limitation):** the polar-sorted flattened Fixed-P
contour helper is not a reliable independent oracle for every triangulated slice. At the KDS
rectangle Fixed surface, axial fraction 0.1, direction `(3 + 0.37)*pi/4`, its radius is
127321664.0569824 N mm, while the actual triangle ray radius is 127264494.39138862 N mm.
The independent per-triangle plane-cut/2D-segment oracle confirms the latter. Its analytical box
checks pass to 1e-12 and all 3,360 matrix comparisons meet the existing 1e-6 relative criterion.
No production query, baseline or tolerance was changed to make this comparison pass. This finding
limits claims about the secondary contour/plot helper; it does not change the governing verdict
checks verified here. A topology-preserving multi-loop contour contract remains outside this
diagnostic change and is required before claiming complete contour/query consistency.

No code-profile clause validation, member design, universal Fixed error bound, accepted result,
released report or deployment is established by these software checks.
