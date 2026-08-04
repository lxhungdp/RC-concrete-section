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

## Commands and outcome

| Command | Outcome |
|---|---|
| `npm.cmd test` | Passed: 125 unit tests, 11 CAD tests, and every repository self-test |
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
| Exact forward evaluation | 130.8-478.4 thousand evaluations/s |
| Controlled surface | 22.59-42.58 ms |
| Coupled-adaptive surface | 149.24-276.55 ms |
| Adaptive directions / points | 92-108 / 2,409-3,443 |
| Direction and station convergence | 8/8 and 8/8 |
| Surface ray query | 6,251-27,280 queries/s; 100% hits |
| Coarse ray error | at most 3.527% |
| Adaptive seed to exact LM correction | at most 0.940% |
| Exact proportional inverse | 0.19-0.87 ms/solve |
| Exact proportional inverse residual | at most 9.91e-10 |
| Fixed-axial inverse | 16.60-29.40 ms/solve |
| Fixed-axial relative error | at most 8.22e-15 |
| Surface topology | zero degenerate triangles; all closed |

## Sampling benchmark against a high-resolution reference

Five structurally different sections were compared with a 96-station by 144-direction
equivalent-block reference. The block candidates were evaluated independently from the current
25-station/36-seed adaptive stress-strain pipeline.

| Block sampling policy | Worst ray error | Interpretation |
|---|---:|---|
| 19 initial states, 24 fixed directions | 6.271% | Too coarse as a general default |
| 37 initial states, 24 fixed directions | 3.205% | Better, but not uniformly sufficient |
| 37 initial states, 24 seed directions, adaptive 1% | **0.590%** | Accepted default; 100% ray hits |

The accepted adaptive block profile produced 32-100 directions, 32-40 effective station
definitions, and 865-2,744 surface points, depending on geometry. In the 2026-08-04 pipeline run,
its build took 314-1,814 ms. The current adaptive stress-strain pipeline took 573-8,285 ms, and the
high-resolution block reference took 936-4,078 ms. The adaptive block is accuracy-controlled; it is
not forced to copy the other model's point count.

The corresponding stress-strain benchmark, using its own 144-direction/33-transition-node
reference, reported a worst production ray error of 0.521%. The two production pipelines therefore
achieved comparable numerical sampling quality (approximately 0.6% in these fixtures) without
mixing their mechanics or controls.

## UI engineering check

For a 400 mm square ACI column with eight D20 bars, the UI generated 2,999 design-surface states
from 104 refined directions and 29 effective stations without a concrete integration mesh. A
factored demand of `Pu = 1000 kN`, `Mux = 100 kN*m`, `Muy = 0` converged in two inverse iterations,
with utilization 0.532 and normalized residual `1.70e-11`. The result exposed `c = 301.26 mm`,
`a = 251.76 mm`, `beta1 = 0.836`, exact block area, and the concrete resultant. Switching back
restored the independent KDS stress-strain controls: 25 stations, 36 seed directions, and adaptive
refinement.

## Acceptance interpretation

The block surface is a branch locator and visualization object, not the final numerical authority.
Its 1% normalized-chord target drives adaptive sampling; final proportional capacity is reevaluated
by exact clipping and damped LM. Fixed-axial capacity uses bracketed roots directly. This is why
final equilibrium residuals are many orders of magnitude smaller than interpolation error.

This evidence supports implementation readiness, not third-party certification. Design release
still requires independently reviewed licensed-code examples and commercial-software golden files;
no licensed external dataset is stored in the repository.
