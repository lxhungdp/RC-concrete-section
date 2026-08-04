# Equivalent stress-block verification

Date: 2026-08-04  
Runtime: Node.js 22.22.2, Windows  
Scope: independent equivalent-block mechanics, KDS 14 20 20:2022 and ACI 318-19(22) adapters, schema v1, worker routing, UI configuration and result visualization. The existing stress-strain/fiber pipeline remains independent.

## Verification strategy

- Closed-form checks: rectangular concrete-block force and centroidal moment, pure-compression endpoint and axial cap.
- Exact geometry checks: outer rings, holes, concave polygons, disconnected concrete islands, bar displacement, translation invariance, invalid self-intersections and bars in voids.
- Inverse round trips: generate demand from a known neutral-axis state, then recover the boundary by proportional-ray plus damped LM and by fixed-axial bracketed solves.
- Surface checks: closed/manifold topology, axial-cap closure, zero degenerate triangles, direction/station interpolation diagnostics and analytical ray intersection.
- Code checks: KDS table nodes/interpolation and high-strength refusal/override; ACI `beta1`; both standards' strain-dependent `phi`, nominal `P0` and tied/spiral caps.
- Integration checks: strict schema-v1 round trip, independent worker/runtime branch, exact block field geometry, profile-driven UI, nominal/design surfaces and factored ULS demand.
- Regression: repository-wide typecheck, unit tests, CAD tests, project round trip, KDS 19-station reference and Excel export self-test.

## Commands and outcome

| Command | Outcome |
| --- | --- |
| `npm.cmd test` | Passed: 124 unit tests, 11 CAD tests and every repository self-test |
| `npm.cmd run build` | Production Next.js build passed; static application generated |
| `npm.cmd run bench:equivalent-block` | 8/8 standard/geometry combinations; no verification failures |
| `npm.cmd run bench:pipelines` | 5/5 section fixtures, 15 candidate surfaces; no failures and 100% ray hits |
| In-app UI workflow | ACI surface, factored demand inverse, exact block-stress view, and return to the KDS curve model all passed |

## Core mechanics benchmark

The matrix contains KDS and ACI versions of a rectangle, a hollow section, an L-section and two disconnected concrete islands, each with eight bars. Times are machine-dependent regression observations.

| Metric | Observed range / worst case |
| --- | --- |
| Exact forward evaluation | 160.7–432.2 thousand evaluations/s |
| Controlled surface | 23.50–40.19 ms |
| Coupled-adaptive surface | 167.68–281.74 ms |
| Adaptive directions / points | 92–108 / 2,409–3,443 |
| Direction and station convergence | 8/8 and 8/8 |
| Surface ray query | 6,013–28,721 queries/s; 100% hits |
| Coarse ray error | at most 3.527% |
| Adaptive seed to exact LM correction | at most 0.940% |
| Exact proportional inverse | 0.23–1.02 ms/solve |
| Exact proportional inverse residual | at most 9.91e-10 |
| Fixed-axial inverse | 13.68–25.65 ms/solve |
| Fixed-axial relative error | at most 8.22e-15 |
| Benchmark surface topology | zero degenerate triangles; all closed |

## Sampling benchmark against a high-resolution reference

Five structurally different sections were compared with a 96-station by 144-direction equivalent-block reference. The existing curve model retained its verified 19-point by 24-direction sampling. The block candidates were evaluated separately.

| Block sampling policy | Worst ray error | Interpretation |
| --- | ---: | --- |
| 19 initial stations, 24 fixed directions | 6.271% | Too coarse for a general block default |
| 37 initial stations, 24 fixed directions | 3.205% | Better, but not uniformly sufficient |
| 37 initial stations, 24 seed directions, adaptive 1% | 0.590% | Accepted default; 100% ray hits on all fixtures |

The accepted adaptive profile produced 32–100 directions and 32–40 effective station definitions depending on geometry. Its surface build took 329–1,493 ms, compared with 95–608 ms for the existing curve pipeline and 827–3,573 ms for the high-resolution block reference. The adaptive block is therefore deliberately accuracy-controlled rather than forced to match the curve model's point count.

## UI engineering check

For a 400 mm square ACI column with eight D20 bars, the UI generated 2,999 design-surface states from 104 refined directions and 29 effective stations without a concrete integration mesh. A factored demand of `Pu = 1000 kN`, `Mux = 100 kN·m`, `Muy = 0` converged in two inverse iterations with utilization 0.532 and normalized residual `1.70e-11`. The result exposed `c = 301.26 mm`, `a = 251.76 mm`, `beta1 = 0.836`, exact compression-block area and concrete resultant. Switching back restored the independent KDS curve controls at 19 points and 24 directions.

## Acceptance interpretation

The surface is a branch locator and visualization object, not the final numerical authority. Its default 1% normalized chord target drives adaptive sampling; the final proportional capacity is re-evaluated by exact polygon clipping and damped LM. Fixed-axial capacity uses bracketed roots directly. This separation is why the final equilibrium residual is many orders of magnitude smaller than the surface interpolation error.

This verification supports implementation readiness, not third-party certification. A production design release should additionally include independently reviewed licensed-code examples and commercial-software golden files; no licensed external dataset is stored in this repository.
