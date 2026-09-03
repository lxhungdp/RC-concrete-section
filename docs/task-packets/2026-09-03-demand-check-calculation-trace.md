# Demand Check Calculation Trace

Date: 2026-09-03
Change class: **Class 4 — on-screen utilization/report-classification trace; result-identical**
Status: implemented and verified as Preview evidence; not accepted or released

Objective:
Open a concise, auditable calculation-trace modal from a dedicated action in each Demand Check row,
with the governing Design-ray check, uncertainty decision, inverse diagnostic, and secondary
fixed-`P` ratio presented in their authoritative order.

Engineering requirement IDs:
`ENG-LOAD-001`, `ENG-AN-003`, `ENG-RES-001`, `DEV-ARCH-006`, `ENG-REP-002`.

Allowed packages/files:

- `packages/pm-analysis` quick-check result evidence and focused tests;
- Demand Check/Loadings web components, result styles, worker-consumer wiring, and focused UI
  helpers/tests;
- the owning engineering/development documentation and this task packet.

Input contract:
One current `factoredULS` `LoadCombination`, the matching `LoadcaseQuickCheckResult`, the matching
composed `InversePreviewResult`, current Design surface/profile provenance, and applied section
inputs. Identity is the stable positive loadcase ID; the loadcase name and row ordinal are not keys.

Output contract:

- a dedicated row action opens the dialog, editable cells remain input-only, and the header selector
  can move directly to any loadcase;
- raw and code-adjusted demand remain distinct and retain canonical compression-positive `P`,
  `Mx = sum(F*y)`, and `My = sum(F*x)` conventions;
- the governing trace shows `R(lambda) = lambda D`, the stored Design-surface intersection,
  `lambda_cap`, proportional utilization, uncertainty evidence/interval, and the exact table verdict;
- inverse equilibrium and fixed-`P` output are clearly labelled diagnostic/secondary and cannot
  replace the governing check;
- the governing 3D check explains the origin-to-demand proportional ray, its first positive Design-
  surface intersection, and why `UR = 1/lambda_cap`; display-only precision is limited by quantity
  type while stored calculation values remain full precision;
- missing or demand-mismatched evidence stays pending/unavailable and never falls back to another
  row;
- the table filters its keyed quick-check cache at the render boundary, so an effect/worker response
  from an older `P/Mx/My/actionBasis` revision cannot appear for even one rendered frame;
- Excel reuses the existing Demand Check workbook builder for exactly the selected combination.

Blocking failure cases:
No current surface/profile, missing proportional crossing, non-finite or absent utilization,
stale/mismatched loadcase evidence, inverse non-convergence, inadmissible/unevaluated material state,
and workbook export failure.

Acceptance tests/oracles:

- governing ray evidence independently satisfies `capacity = lambda_cap * checked demand` and
  `UR = 1 / lambda_cap` for nonzero demands;
- zero demand retains `UR = 0` without exporting an infinite numeric multiplier;
- fixed-`P` moment evidence reproduces its stored ratio and remains labelled secondary;
- focused selection tests preserve stable loadcase identity, reject stale modal/frame evidence, and
  filter stale/orphaned entries from the table evidence map;
- browser checks cover the dedicated trace action, selector switching, pending/error states, keyboard focus,
  responsive overflow, and one-loadcase Excel dispatch;
- required repository, full-test, build, bundle, and result-identical benchmark gates pass.

Schema/provenance/report impact:
No project persistence schema or capacity-result change. The serializable preview quick-check DTO
gains explicit explanatory evidence already produced by its owning ray/fixed-`P` query. The dialog
and workbook remain Preview/draft evidence and do not create an accepted or released result.

Out of scope:
Changing surface construction, ray intersection, minimum-eccentricity policy, resistance factors,
uncertainty/classification policy, inverse algorithms, station/direction sampling, loadcase schema,
or released-report eligibility.

Verification record (2026-09-03):

- focused owner and stale-evidence tests pass, including independent biaxial angle and fixed-`P`
  ratio reproduction;
- browser checks pass for dedicated-action activation, loadcase switching, Escape/focus restore,
  editable-cell isolation, 390 px responsive overflow, and clean console output;
- the browser-side blob export returns to idle without a UI/console error (the in-app harness did
  not expose its blob download event); the existing Demand Check integration test independently
  verifies that one selected combination creates exactly one worked sheet group;
- `npm test`, production build, repository structure/type checks, and web-bundle budget pass;
- `bench:verify` is bit-identical for 8 sections × 24 capacity quantities, and
  `bench:strain-sampling`, `bench:equivalent-block`, and `bench:pipelines` report no failures.
