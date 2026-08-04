# `@pm/equivalent-block`

Independent mechanics kernel for reinforced-concrete equivalent rectangular stress-block analysis. It has no dependency on project schemas, UI code, the existing fiber solver, or a design standard.

## Contract

- Units: N, mm, MPa.
- Axial sign: compression positive.
- Moments about the supplied reference point: `Mx = F(y-yref)` and `My = -F(x-xref)`.
- State: neutral-axis normal angle `theta` and positive neutral-axis depth `c`, measured from the compression edge.
- Concrete block: uniform compression on the clipped polygon at depth `a = depthFactor * c`.
- Steel: linear strain compatibility; concrete displaced by a bar inside the block can be subtracted explicitly.

## Separate pipelines

1. `prepareEquivalentBlockSection(input)` validates and normalizes outer rings, holes, disconnected solids, bars, units, and signs.
2. `evaluateEquivalentBlock(section, law, steelLaws, state)` is the exact forward evaluator. Polygon half-plane clipping integrates concrete area and first moments without a fiber mesh.
3. `buildCapacitySurface(...)` samples independent direction/station coordinates, inserts code and rupture events at the controlling longitudinal bar, adaptively checks both coordinates, and returns a triangulated P-Mx-My surface plus interpolation/convergence and topology diagnostics. Adjacent variable-length rows are connected by a monotone zipper triangulation.
4. `clipCapacitySurfaceByAxialCap(...)` clips that surface and closes the new cap contour.
5. `solveFixedAxialCapacity(...)` uses bracketed depth roots plus an angular root search; it does not rely on a prebuilt surface.
6. `solveProportionalRayCapacity(...)` intersects a surface for a robust initial seed, then optionally refines the exact evaluator with a damped three-variable solve. Exhausting the exact solve returns `mesh-fallback`, not a false convergence claim.

`topology.closed` means the parameter-space mesh has no boundary or non-manifold edge. `degenerateTriangles` is reported separately because exact plastic plateaus can map several distinct strain states to the same P-Mx-My point; ray intersection safely skips those zero-area cells.

The standalone kernel fallback target is 1% normalized chord error in both direction and neutral-axis-depth coordinates; the application production profile supplies 0.75% in both coordinates. Refinement alternates the two coordinates because a new angular sample can reveal a missed depth interval and vice versa. The returned `directionRefinementConverged` and `stationRefinementConverged` flags must be checked when a surface is consumed without exact refinement. For a reported inverse capacity, use the surface only as a branch/initial-state seed and pass the exact evaluator to `solveProportionalRayCapacity(...)`; its damped solve is the authoritative result.

An elastic-perfectly-plastic steel law validates `eps_u > eps_y`. When `eps_u` is declared, surface states and uniform endpoints respect it and inverse results report every bar strain violation. A code axial-cap face has no unique strain state, so its admissibility is explicitly marked unevaluated instead of manufacturing a concrete strain check.

`bindEquivalentBlockForwardEvaluator(...)` caches only the outer-boundary projection that depends on
section and angle. Repeated depth evaluations at that angle still perform exact clipping and full
steel/resultant evaluation; no state-dependent resistance is cached.

`componentForceResidual` and the two component-moment residuals audit assembly of the concrete and steel ledgers only. They are not equilibrium residuals. Inverse equilibrium diagnostics are computed independently as the exact evaluated response minus the scaled demand, with a separately normalized residual norm.

The package deliberately contains no KDS or ACI constants. Standard adapters supply the block law, endpoints, strength factors, and axial cap.

The package-local moment convention is `My = -F(x-xref)`. The project DTO only stores a field named
`My`; it does not define a formula or convert signs. The stress-strain backend and workbook use
`My = +F(x-xref)`, while the application bridge and UI pass the block value through unchanged.
Consumers comparing the two backends must therefore treat nonzero-`My` equivalent-block output as
preview-only until a common convention or an explicit boundary transform is implemented and tested.
