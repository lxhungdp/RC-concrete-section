# Equivalent Stress-Block Verification

Date: 2026-08-04  
Runtime: Node.js 22.22.2, Windows  
Scope: independent equivalent-block mechanics, KDS 14 20 20:2022 and ACI 318-19(22) adapters,
version-locked schema v1, worker routing, UI configuration, and result visualization. The parser's
limited v1 defaulting/repair behavior is documented separately; this record does not claim that
every omitted optional field or unknown property is rejected. The stress-strain pipeline remains
independent.

## Verification strategy

- Closed-form checks cover rectangular block force, centroidal moment, pure compression, and the
  axial cap.
- Exact-geometry checks cover outer rings, holes, concavity, disconnected islands, displaced
  concrete, translation invariance, invalid self-intersections, and bars in voids.
- Inverse round trips generate demand from a known neutral-axis state and recover it using exact
  proportional-ray/damped-LM and fixed-axial bracketed solvers.
- Surface checks cover closed topology, cap closure, degenerate triangles, station/direction
  convergence diagnostics, and analytical ray intersection.
- Code checks cover KDS table interpolation and high-strength rules, ACI `beta1`, both standards'
  strain-dependent `phi`, nominal `P0`, and tied/spiral caps.
- Integration checks cover schema-v1 round trip, the separate worker branch, exact block-field
  geometry, one profile selection in Materials, Nominal/Design surfaces, and factored ULS demand.
- Limit checks cover declared steel rupture, actual concrete/bar strain admissibility, and an
  explicitly unevaluated code axial-cap face.
- Resource checks build the validator-maximum 198-station by 720-direction surface without
  argument-spread extrema or stack overflow.

## Review-finding closure

| Finding | Resolution and permanent evidence |
|---|---|
| KDS high-strength `P0` gap | flexural surfaces close at the eta-reduced physical limit; `P0` is a separate non-triangulated code reference; strengths 40-90 MPa are tested |
| steel `ultimateStrain` ignored | EPP construction validates `eps_u > eps_y`; surfaces, poles, fixed-axial events, and inverse admissibility honor it |
| KDS SD300/SD400 ambiguity | `0.005` is used through 400 MPa and `2.5 eps_y` above; SD300, SD400, and SD500 boundary tests are present |
| tautological closure diagnostic | renamed to component-assembly residual; equilibrium residual is independently evaluated as response minus scaled demand |
| admissibility stub | physical inverse states evaluate concrete vertices and every bar; violations carry values, limits, and bar IDs |
| station schedules drifted by mechanics | both pipelines now consume `unified-27-v2`; automatic transition/event insertion is disabled in the production baseline |
| argument-spread overflow | extrema/scales use loops; the maximum validated surface and large polygon paths are stress-tested |
| surface rebuilt per loadcase | worker caches a core Design surface with a complete resistance-domain key; integration test proves four checks cause one build |
| benchmark confused verification density with defaults | dense references remain explicitly benchmark-only; production surfaces use the shared 27 stations |
| failed LM reported converged | status is `mesh-fallback`, `converged=false`, `ok=false`; the raw last exact state and residual remain auditable |

## Commands and outcome

| Command | Outcome |
|---|---|
| `npm.cmd test` | Passed: full unit/integration, CAD, schema round-trip, station, and Excel self-test suite |
| `npm.cmd run build` | Production Next.js build passed; static application generated |
| `npm.cmd run bench:equivalent-block` | 8/8 standard/geometry combinations; no failures |
| `npm.cmd run bench:pipelines` | 5/5 fixtures and 15 candidate surfaces; 100% ray hits |
| `npm.cmd run bench:verify` | 8 sections x 24 capacity quantities bit-identical to the new baseline |

## Core mechanics benchmark

The matrix contains KDS and ACI versions of a rectangle, hollow section, L-section, and two
disconnected concrete islands, each with eight bars. These are machine-dependent regression
observations, not contractual speed limits.

| Metric | Observed range / worst case |
|---|---:|
| Exact forward evaluation | 177.7-492.2 thousand evaluations/s |
| Controlled surface | 25.28-37.18 ms |
| Fixed production surface | measured by the current harness |
| Effective directions / points | 36 directions and the fixed station schedule |
| Surface ray query | 3,564-17,495 queries/s; 100% hits |
| Coarse 36-direction ray error | at most 2.622% |
| Fixed surface seed to exact LM correction | emitted by every run |
| Exact proportional inverse | 0.32-1.01 ms/solve |
| Exact proportional inverse residual | at most 7.39e-10 |
| Fixed-axial inverse | solved directly and checked against known states |
| Fixed-axial relative error | at most 1.21e-13 |
| Estimated 20-loadcase cache speedup | 4.98x-6.76x |
| Surface topology | zero degenerate triangles; all closed |

## Sampling benchmark against a high-resolution reference

Five structurally different sections are compared against dense direction/reference evaluations.
Every production candidate uses `unified-27-v2`; the benchmark is allowed to increase evaluation
density only for an independent numerical oracle. It does not publish or persist another default
station schedule. Fixed and adaptive candidates differ only in direction policy.

## UI engineering check

The integration fixture verifies that the UI bridge exposes `c`, `a`, `beta1`, exact block area,
block polygon, controlling bar/strain, resistance evidence, component-assembly residuals, and actual
admissibility. Switching profiles keeps the same 27 stations and restores the independent KDS
stress-strain direction controls. The block result never paints constant concrete stress
outside `0 <= depth <= a`.

## Acceptance interpretation

The block surface is a branch locator and visualization object, not the final numerical authority.
Its 0.75% direction-chord target drives adaptive direction sampling; final proportional capacity is reevaluated
by exact clipping and damped LM. Fixed-axial capacity uses bracketed roots directly. This is why
final equilibrium residuals are many orders of magnitude smaller than interpolation error.

A faceted value remains available when LM fails, but it is diagnostic only: `mesh-fallback` is not
converged or admissible acceptance. Similarly, component-assembly closure is not presented as an
equilibrium audit.

This evidence supports implementation readiness, not third-party certification. Design release
still requires independently reviewed licensed-code examples and commercial-software golden files;
no licensed external dataset is stored in the repository.
