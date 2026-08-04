# Equivalent stress-block verification

Date: 2026-08-04  
Runtime: Node.js 22.22.2, Windows  
Scope: independent mechanics kernel plus KDS 14 20 20:2022 and ACI 318-19(22) adapters. UI and the existing fiber solver are intentionally not connected in this phase.

## Verification strategy

- Closed-form checks: rectangular concrete block force and centroidal moment; pure-compression endpoint and axial cap.
- Exact geometry checks: outer rings, holes, concave polygons, disconnected concrete islands, bar displacement, translation invariance, invalid self-intersections, and bars in voids.
- Inverse round trips: generate demand from a known neutral-axis state, then recover the boundary by proportional-ray plus damped LM and by fixed-axial bracketed solves.
- Surface checks: closed/manifold topology, axial-cap closure, zero degenerate triangles in benchmark meshes, direction/station interpolation diagnostics, and analytical octahedron ray intersection.
- Code checks: KDS table nodes/interpolation and high-strength refusal/override; ACI `beta1`; both standards' strain-dependent `phi`, nominal `P0`, and tied/spiral caps.
- Regression: the repository-wide typecheck, unit tests, CAD tests, round trips, station self-test, and Excel export self-test.

## Commands and outcome

| Command | Outcome |
| --- | --- |
| `node --import tsx --test packages/pm-equivalent-block/src/forward.test.ts packages/pm-equivalent-block/src/surface-inverse.test.ts packages/pm-equivalent-block/src/robustness.test.ts` | 18/18 passed |
| KDS adapter tests | 6/6 passed |
| ACI adapter tests | 6/6 passed |
| `npm.cmd test` | Passed: typecheck and all repository test stages |
| `npm.cmd run bench:equivalent-block` | 8/8 standard/geometry combinations; no verification failures |

## Final benchmark summary

The matrix contains KDS and ACI versions of a rectangle, a hollow section, an L-section, and two disconnected concrete islands, each with eight bars. Times are machine-dependent and are useful for regression, not as hardware-independent guarantees.

| Metric | Observed range / worst case |
| --- | --- |
| Exact forward evaluation | 167.0–453.6 thousand evaluations/s |
| Controlled 36-direction surface | 24.43–42.43 ms |
| Default coupled-adaptive surface | 144.04–283.75 ms |
| Adaptive directions / mesh points | 92–108 / 2,409–3,443 |
| Direction and station convergence | 8/8 and 8/8 |
| Surface ray query | 5,516–24,623 queries/s; 100% hits |
| Coarse 36-direction ray error | at most 3.527% |
| Adaptive seed to exact LM correction | at most 0.940% |
| Exact proportional inverse time | 0.19–0.78 ms/solve |
| Exact proportional inverse residual | at most 9.91e-10 |
| Fixed-axial inverse time | 12.50–25.53 ms/solve |
| Fixed-axial relative error | at most 8.22e-15 |
| Benchmark surface topology | 0 degenerate triangles; all closed |

## Acceptance interpretation

The mesh is not treated as the final numerical authority. Its default 1% normalized chord target gives a fast, converged branch locator; the final proportional capacity is re-evaluated by the exact polygon-clipping evaluator and damped LM. Fixed-axial capacity uses bracketed roots directly. This separation is why the final equilibrium residual is many orders of magnitude smaller than mesh interpolation error.

The implementation is ready for the next integration gate at package/API level. Before a production design release, a separately reviewed set of licensed-code examples and independent commercial-software golden files should still be added; no such licensed dataset is stored in this repository, so this report does not claim third-party certification.
