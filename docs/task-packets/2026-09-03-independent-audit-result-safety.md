# Independent Audit Result-Safety Remediation

Date: 2026-09-03  
Change class: **Class 4 — utilization, geometry/material acceptance, numerical kernel, and report classification**  
Status: implementation and local automated verification complete; named independent review remains
required; Preview-only; no profile promotion or released-report authority

## Objective

Close independently reproduced safety defects in the current Preview pipeline: a Fixed equivalent-
block surface can over-predict an exact refined ray by more than the shared 2% screening margin;
PDF and Excel can replace the kernel's three-state decision with a raw `UR <= 1` test; project and
kernel boundaries accept invalid polygon topology or a bar whose centre is inside concrete while
its disk crosses the boundary; user curves can be silently reordered; and the stress-strain forward
kernel uses cancellation-sensitive naive sums.

## Engineering requirement IDs

- `ENG-GEO-001`, `ENG-GEO-002`, `ENG-GEO-005`: finite/identity, topology, full bar-disk, and
  overlap validation before analysis;
- `ENG-MAT-001`, `ENG-MAT-002`: explicit user-curve policy and strictly increasing ordinates;
- forward-kernel verification items 1, 4, 6, and 8 in `docs/03` and release Gate B;
- `ENG-AN-002`, `ENG-AN-003`, `ENG-RES-001`: uncertainty-aware, fail-closed Design-surface checks;
- `ENG-REP-001`, `ENG-REP-002`: report and workbook reproduce the kernel DTO decision.

## Owners and allowed files

- authority/decision: `docs/01-control-map.md`, `docs/engineering/03-*`, `04-*`, `05-*`,
  `docs/03-*`, `05-*`, `07-*`, `12-*`, affected development pipeline docs, and this packet;
- geometry gateway: `packages/pm-geometry`, `packages/pm-project`, the two mechanics preparation
  boundaries, and focused tests;
- materials: `packages/pm-materials`, parser/default creators and focused tests/fixtures;
- demand result/report: `packages/pm-results`, `packages/pm-analysis`,
  `packages/pm-analysis-equivalent-block`, `packages/pm-report`, and focused tests;
- forward numerics: `packages/pm-analysis` and its focused tests/benchmarks.

Unrelated Node.js 24 runtime-hardening changes already present in the worktree are user-owned and
must be preserved.

## Input contract

- Geometry is finite schema-v1 `GeometryInput`, converted to exact polygon solids plus circular
  reinforcement disks. The validation tolerance scales with section extent and is not an editor
  rounding tolerance.
- User-curve points are persisted in evaluation order, use linear interpolation and an explicit
  `clamp` extrapolation policy, and have strictly increasing finite strain coordinates.
- Demand is `factoredULS`; `thetaLoad = atan2(My, Mx)` queries the completed Design surface.
- A report receives a kernel-composed inverse result containing the governing adequacy and
  uncertainty interval; inverse convergence and fixed-P utilization remain diagnostics.

## Output contract

- Invalid/self-intersecting/overlapping topology, duplicate entity IDs, boundary-crossing or
  overlapping bars, and invalid user curves fail before numerical analysis.
- Stress-strain Fixed checks retain the existing 2% measured regression screening envelope.
- Equivalent-block Fixed checks return `indeterminate` until that mechanics owns a validated
  screening bound or measured per-run refinement evidence; no replacement percentage is invented.
- PDF and Excel publish `adequate`, `inadequate`, `indeterminate`, or `not checked` from the kernel
  result and include the utilization interval/evidence when available.
- Stress-strain force, moment, contribution-ledger, and tangent sums use compensated accumulation.

## Blocking failure cases

- any consumer derives adequacy from raw utilization or inverse convergence;
- a missing/invalid uncertainty value becomes a pass or fail;
- topology is repaired silently, a bar disk crossing a boundary is treated as valid, or bar overlap
  is accepted;
- a user curve is sorted or extrapolated under an unrecorded policy;
- an unexplained full-precision fingerprint drift, changed design-code coefficient, or loosened
  benchmark tolerance;
- any attempt to promote a draft profile, Preview result, or report.

## Acceptance tests and independent oracles

- retain the core ACI L-section ray where Fixed UR is approximately `0.979616` while exact refined
  UR is approximately `1.001`, and reproduce its production-reference-point counterpart at Fixed
  UR `0.981` versus exact refined UR `1.00089`; both Fixed classifications must be `indeterminate`;
- report-model and workbook integration tests require the same three-state result and interval as
  `checkLoadcaseUtilizationFromSurface`;
- analytical rectangle/bow-tie/hole/overlap fixtures and Euclidean point-to-segment distances for
  full circular bar containment;
- independently ordered curve fixtures proving rejection rather than sorting;
- adversarial mixed-sign sums and fiber-order reversal compared with a higher-stability reference;
- required repository unit/integration/build, benchmark, security, and web-bundle gates.

## Schema, provenance, and report impact

- schema remains project v1; missing legacy user-curve `extrapolation` is normalized to the previous
  clamp behaviour and canonical exports write `extrapolation: 'clamp'` explicitly;
- result DTO gains governing `adequacy` and `utilizationInterval` on the composed inverse result;
- Fixed equivalent-block verdicts change from potentially adequate/inadequate to indeterminate;
- compensated sums can create explainable last-bit fingerprint drift and require explicit review
  before any baseline update.

## Decision record

### Context and decision

The existing 2% Fixed screening constant was justified by the stress-strain dense matrix but was
also applied to equivalent-block surfaces. An independent exact clipped-block refinement found an
unsafe 2.1829% capacity over-prediction. The decision is to retain the existing mechanics-specific
stress-strain envelope and fail closed for Fixed equivalent-block checks. Adaptive checks continue
to use their returned, converged sampling evidence.

Adequacy is carried on the result contract and copied by report formats. Geometry validation is a
shared pure package service used at parser and both mechanics boundaries. User curves carry one
explicit supported extrapolation policy (`clamp`) and are never reordered. Forward cancellation is
controlled with Neumaier compensated accumulators.

### Alternatives rejected

- Raising the equivalent-block margin to 3% was rejected because the available matrix is regression
  evidence, not a proven universal bound.
- Exact-solving every quick check was rejected for this slice because it changes the interactive
  performance contract and still needs a separate convergence/error policy.
- Keeping report-local `UR <= 1` formulas was rejected because it creates a second engineering
  decision engine.
- Silently shrinking or moving invalid bars was rejected because normalization must not change the
  physical section.

### Engineering/package impact, evidence, and review

The change is conservative for Fixed equivalent-block verdicts and does not change code factors or
production fixture geometry. Geometry/user-curve inputs previously accepted can now be rejected.
Compensated sums alter final bits; the P16 oracle regeneration changed 2,899 numeric values with a
maximum relative change of `9.61e-9` and maximum absolute moment change of `0.00255 N·mm`.

The analysis benchmark's L-section fixture did contain invalid reinforcement: one right-leg bar
duplicated the bottom-corner bar and later bars crossed the re-entrant boundary. Those four
benchmark-only bars were moved to valid, non-overlapping positions before the baseline was updated.
The moment-plane fingerprint normalizer now buckets axial ordinates at `1e-12` of force scale so a
symmetric `+/-M` pair cannot swap because of a last-bit `P` difference. No acceptance tolerance was
loosened.

Local evidence on Node.js 24.20.0/npm 11.19.0: repository structure and typecheck pass; the full
`npm test` pipeline passes with 306 unit tests, 11 CAD tests, project round-trip, Excel, Demand Check,
and PDF suites; P16 read-only verification passes; strain-sampling, equivalent-block, cross-model,
and bit-identical 8-section x 24-quantity capacity fingerprint gates pass; production build and web
bundle budgets pass; the high/critical dependency audit passes with two documented moderate
`exceljs -> uuid` findings. Named independent numerical and qualified structural review remain
required for verification or release.

### Supersession rule

Equivalent-block Fixed classification may become decisive only through a later reviewed decision
that supplies a representative structural matrix, an approved bound or per-run refinement
evidence, regression gates, and updated provenance. Report consumers may not reintroduce a local
adequacy rule.

## Out of scope

Code-specific cover/clear-spacing/detailing rules without a declared profile policy; persisted
multi-region bar-parent assignment; member stability/slenderness/second-order effects; major module
splits; linter/dependency migration; accepted-result/released-report implementation; commits,
deployment, or profile verification.
