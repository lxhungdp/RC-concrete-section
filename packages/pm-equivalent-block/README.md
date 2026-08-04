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
3. `buildCapacitySurface(...)` samples independent direction/station coordinates, adaptively checks both coordinates, and returns a triangulated P-Mx-My surface plus interpolation/convergence and topology diagnostics.
4. `clipCapacitySurfaceByAxialCap(...)` clips that surface and closes the new cap contour.
5. `solveFixedAxialCapacity(...)` uses bracketed depth roots plus an angular root search; it does not rely on a prebuilt surface.
6. `solveProportionalRayCapacity(...)` intersects a surface for a robust initial seed, then optionally refines the exact evaluator with a damped three-variable solve.

`topology.closed` means the parameter-space mesh has no boundary or non-manifold edge. `degenerateTriangles` is reported separately because exact plastic plateaus can map several distinct strain states to the same P-Mx-My point; ray intersection safely skips those zero-area cells.

The default surface target is 1% normalized chord error in both direction and neutral-axis-depth coordinates. Refinement alternates the two coordinates because a new angular sample can reveal a missed depth interval and vice versa. The returned `directionRefinementConverged` and `stationRefinementConverged` flags must be checked when a surface is consumed without exact refinement. For a reported inverse capacity, use the surface only as a branch/initial-state seed and pass the exact evaluator to `solveProportionalRayCapacity(...)`; its damped solve is the authoritative result.

The package deliberately contains no KDS or ACI constants. Standard adapters supply the block law, endpoints, strength factors, and axial cap.
