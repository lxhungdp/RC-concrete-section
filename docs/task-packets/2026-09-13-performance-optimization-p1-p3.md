# Performance optimization P1-P3 task packet

Status: P1-P3 implemented and locally verified on the current dirty working tree; no release-status
promotion. The repository-wide `npm test` chain remains blocked by pre-existing AdSec source-hash
mismatches described in the verification record below.

## Objective

Reduce CPU time, transient allocation, avoidable rebuilds, and cancellation latency in the current
preview analysis pipeline without changing mechanics, engineering defaults, sampled states,
topology, result ordering, or failure classification.

The work is gated sequentially:

1. P1 — stress-strain forward integration and adaptive-sampling execution;
2. P2 — equivalent-block clipping/evaluation and bounded worker reuse;
3. P3 — interruptible worker cancellation with live-job replay and bundle protection.

No later phase starts until the preceding phase passes its focused tests, exact or portable
fingerprint gate, and performance comparison.

## Engineering and development requirements

- `ENG-GEO-003`, `ENG-GEO-004`, `ENG-GEO-006` — preserve deterministic normalized geometry,
  exact support geometry, and mesh sanity/convergence evidence.
- `ENG-AN-001`, `ENG-AN-002`, `ENG-AN-003` — preserve the selected mechanics/profile,
  sampling/convergence evidence, topology, and demand-query invariants.
- `ENG-RES-001` — preserve uncertainty-aware classification and governing-state trace.
- `DEV-ARCH-001` through `DEV-ARCH-007` — preserve package direction, kernel ownership, and
  third-party boundaries.
- `docs/03` section 8 — remove allocation and lookup overhead in the fibre loop before considering
  state batching; preserve the scalar reference/evidence path.
- `docs/05` sections 1, 5, and 6 — Fixed and Adaptive remain separate calculations; adaptive
  midpoint evidence, independent meridians, explicit topology, and dataset ownership remain intact.
- `docs/06` sections 1, 5, and 9 — do not trade numerical evidence for speed; cache only immutable,
  mathematically compatible state.
- `docs/08` sections 6-8 — deterministic results, bounded worker behavior, and profile-led
  optimization.

## Allowed packages and files

- P1: `packages/pm-analysis/src`, its focused tests/benchmarks, and performance documentation.
- P2: `packages/pm-equivalent-block/src`, the four `packages/pm-code-*` equivalent-block adapters,
  `packages/pm-analysis-equivalent-block/src`, their focused tests/benchmarks,
  `apps/web/workers/pm-analysis.worker.ts`, worker/fallback cache helpers and focused web tests, and
  performance documentation. The adapters are included because they own the public evaluator and
  surface-builder binding; public point/audit evaluation retains full clipping geometry.
- P3: `apps/web/application/analysis`, `apps/web/workers`, focused web tests, and worker/performance
  documentation.

Existing unrelated changes in `SectionDrawingClient.tsx`, the `/geometry` route, generated chart/
build/output directories, and unrelated documentation paragraphs are excluded and must be
preserved.

## Input contract

The current project-v1 geometry, material, design-basis, load-combination, and model-specific
analysis-options DTOs are unchanged. Canonical units remain mm, MPa, N, N-mm, dimensionless strain,
and radians. Compression-positive `P`, `Mx = sum(F*(y-y0))`, and `My = sum(F*(x-x0))` are unchanged.

## Output contract

For the same input/runtime, each completed non-cancelled calculation returns the same surface
points, topology, station/direction evidence, component ledgers, design stages, checks, audits, and
failure classifications. P3 may complete a cancelled request earlier, but a cancelled or partial
job never publishes or enters a cache.

## Blocking failure cases

- any unexplained full-precision fingerprint drift;
- changed point/station/direction/triangle ordering or counts;
- changed mesh, material law, resistance sequence, tolerance, convergence, or adequacy result;
- reuse across a mismatched geometry/material/profile/options/design-basis key;
- a cancelled or failed job publishing or populating a reusable result cache;
- non-deterministic merge order, stale surface handle, unbounded cache growth, or main-thread
  calculation introduced by the optimization;
- focused, structural, type, build, bundle, benchmark, or differential gate failure.

## Acceptance tests and independent oracles

- exact same-runtime `capacity-fingerprint-v2` comparison for stress-strain numerical changes;
- accelerated-versus-reference/differential tests for resultants, clipping, polygon moments, and
  transformed geometry;
- fixed/adaptive sampling tests and the permanent sampling/pipeline benchmarks;
- equivalent-block analytical polygon moment/ledger tests and production benchmark matrix;
- worker cache-key, stale-handle, abort, restart, late-result, and fallback tests;
- `check:structure`, `typecheck`, focused owner tests after each phase;
- final full `npm test`, production `npm run build`, and post-build `check:web-bundle`.

Timings are evidence only when compared on the same runtime and fixture. A speed regression blocks
that optimization even when numerical tests pass.

## Change class and review independence

- P1: Class 2, performance/refactor expected to be result-identical.
- P2: Class 2 unless a clipping operation order causes numerical drift; unexplained drift escalates
  to Class 4 and blocks the phase.
- P3: Class 3 because the worker job/cancellation pipeline behavior changes.

Implementation and initial verification are performed in one working session. Independent
software/numerical and qualified structural review remain required for release; this work cannot
promote a draft profile or preview result.

## Schema, provenance, and report impact

No project/schema version, method ID, profile identity, result formula, report value, or report
eligibility change is intended. Worker protocol changes, if required, remain internal and versioned
by their discriminated message shape. Completed result bytes and report inputs remain unchanged.

## Out of scope

- changing quadrature order, mesh density, station/direction seeds, tolerances, factors, material
  laws, design-code interpretation, or accepted-result policy;
- adding a dependency, WebAssembly numerical kernel, SharedArrayBuffer requirement, or multi-worker
  pool;
- implementing targeted demand-utilization refinement or accepted-result/released-report gates;
- optimizing unrelated editor, CAD, Excel, or PDF features.

## Verification record — 2026-09-13, Node 24.20.0 / npm 11.19.0

- P1: 121 focused analysis tests passed; `capacity-fingerprint-v2` remained bit-identical for eight
  sections by 24 capacity quantities; the same-process reference/optimized forward-loop A/B was
  234.99 ms versus 206.03 ms (1.14x).
- P2: 82 focused block/code/bridge/cache tests passed; full-geometry versus resultants-only surface
  output was deeply bit-identical. The 96-vertex hollow-circle A/B was 343.84 ms versus 200.21 ms
  (1.72x) and retained clipped vertices fell from 96,756 to zero. The production equivalent-block
  benchmark matrix and fixed/adaptive sampling benchmark reported no verification failures.
- P3: worker tests passed for bounded LRU eviction, true abort by termination, replay of other live
  jobs, repeated abort after replay, stale surface rehydration, and rejection of late results from
  an interrupted worker.
- Final passing gates: `check:structure`, `typecheck`, 322/322 unit tests, CAD, project round-trip,
  stress-strain Excel, equivalent-block Excel, Demand Check Excel, PDF report, production web build,
  and `check:web-bundle`.
- Final blocked gate: `test:adsec` reports four failures because the tracked source files for
  `p16-ec2-kds-approximation` and `p16-aci` do not match their tracked manifest SHA-256 values. The
  optimization patch does not modify those oracle files or the manifest, and this evidence was not
  regenerated or accepted during the work.
