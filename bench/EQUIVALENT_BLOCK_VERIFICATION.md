# Equivalent Stress-Block Verification

Date: 2026-08-04  
Runtime: Node.js 22.22.2, Windows  
Scope: independent equivalent-block mechanics, KDS 14 20 20:2022 and ACI 318-19(22) adapters,
strict schema v1, worker routing, UI configuration, and result visualization. The stress-strain
pipeline remains independent.

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
| phi kinks missed | nine code events are solved at the controlling longitudinal bar and merged with the independent baseline station grid |
| argument-spread overflow | extrema/scales use loops; the maximum validated surface and large polygon paths are stress-tested |
| surface rebuilt per loadcase | worker caches a core Design surface with a complete resistance-domain key; integration test proves four checks cause one build |
| benchmark used 48x72 | fixed-axial benchmark now uses production 96x96 defaults plus event depths, `eps_cu`, and steel laws |
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
| Exact forward evaluation | 174.5-518.8 thousand evaluations/s |
| Controlled surface | 24.33-40.47 ms |
| Coupled-adaptive production surface | 205.41-366.49 ms |
| Adaptive directions / points | 104-148 / 4,100-6,495 |
| Direction and station convergence | 8/8 and 8/8 |
| Surface ray query | 4,202-16,050 queries/s; 100% hits |
| Coarse 36-direction ray error | at most 2.622% |
| Production surface to exact LM correction | at most 0.918% |
| Exact proportional inverse | 0.28-1.11 ms/solve |
| Exact proportional inverse residual | at most 7.39e-10 |
| Fixed-axial inverse, production 96x96 + events | 34.15-53.65 ms/solve |
| Fixed-axial relative error | at most 1.21e-13 |
| Estimated 20-loadcase cache speedup | 5.15x-6.80x |
| Surface topology | zero degenerate triangles; all closed |

## Sampling benchmark against a high-resolution reference

Five structurally different sections were compared with a 96-station by 144-direction
equivalent-block reference. The block candidates were evaluated independently from the current
25-station/36-seed adaptive stress-strain pipeline.

| Block sampling policy | Worst ray error | Interpretation |
|---|---:|---|
| 19 initial states, 24 fixed directions | 4.988% | Too coarse as a general default |
| 37 initial states, 24 fixed directions | 2.079% | Better, but not uniformly sufficient |
| 37 initial states, 24 seed directions, adaptive 0.75% | **0.601%** | Accepted default; 100% ray hits |

The accepted adaptive block profile produced 48-112 directions, 41-51 effective station
definitions, and 1,633-4,267 surface points, depending on geometry. In the 2026-08-04 pipeline run,
its build took 249-2,271 ms. The current adaptive stress-strain pipeline took 419-7,149 ms. The
adaptive block is accuracy-controlled; it is not forced to copy the other model's point count.

The corresponding stress-strain benchmark, using its own 144-direction/33-transition-node
reference, reported a worst production ray error of 0.521%. The two production pipelines therefore
achieved comparable numerical sampling quality (approximately 0.6% in these fixtures) without
mixing their mechanics or controls.

## UI engineering check

The integration fixture verifies that the UI bridge exposes `c`, `a`, `beta1`, exact block area,
block polygon, controlling bar/strain, resistance evidence, component-assembly residuals, and actual
admissibility. Switching profiles restores the independent KDS stress-strain controls: 25 stations,
36 seed directions, and adaptive refinement. The block result never paints constant concrete stress
outside `0 <= depth <= a`.

## Acceptance interpretation

The block surface is a branch locator and visualization object, not the final numerical authority.
Its 0.75% normalized-chord target drives adaptive sampling; final proportional capacity is reevaluated
by exact clipping and damped LM. Fixed-axial capacity uses bracketed roots directly. This is why
final equilibrium residuals are many orders of magnitude smaller than interpolation error.

A faceted value remains available when LM fails, but it is diagnostic only: `mesh-fallback` is not
converged or admissible acceptance. Similarly, component-assembly closure is not presented as an
equilibrium audit.

This evidence supports implementation readiness, not third-party certification. Design release
still requires independently reviewed licensed-code examples and commercial-software golden files;
no licensed external dataset is stored in the repository.
