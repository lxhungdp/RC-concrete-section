# 02 — Geometry Validation and 2D Numerical Integration

This file starts after persisted/editor geometry has passed the adapter and capability gate defined
in the two instruction groups. The geometry subsystem has two outputs with different purposes:

1. exact normalized polygon data for reference properties, support coordinates, containment, and
   traceability;
2. a numerical integration mesh whose discretization error is measured by refinement.

Do not replace exact section geometry with the fiber cloud.

## 1. Geometry normalization pipeline

Apply these steps in order and return typed issues with ring/bar IDs:

1. Validate finite coordinates and minimum three distinct vertices per ring.
2. Remove only consecutive duplicate points within a scale-aware tolerance.
3. Reject zero-length edges and near-zero-area rings.
4. Detect self-intersections and self-touching ambiguity; reject them in v2.
5. Verify every hole is strictly inside the outer ring.
6. Reject overlapping/touching holes unless a future topology policy explicitly supports them.
7. Normalize outer winding CCW and holes CW.
8. Compute exact polygon area, first moments, centroid, second moments, perimeter, and bounds.
9. Select the declared reference origin and translate normalized geometry once.
10. Validate reinforcement after translation: positive diameter, unique ID, material exists, bar
    center inside concrete and outside holes, and code-required cover/spacing checks delegated to
    the code adapter.

Topological tolerance is based on a section scale, not a hard-coded `1e-12 mm`:

```text
Lref = max(bbox width, bbox height, 1 mm)
tolLength = max(1e-10·Lref, 32·Number.EPSILON·Lref)
tolArea   = max(1e-12·Lref², 64·Number.EPSILON·Lref²)
```

User-facing dimensional tolerances may be larger and are distinct from floating-point guards.

## 2. Polygon properties

For each ring, compute signed area, centroid numerators, and second moments with standard polygon
line-integral formulas. Sum the outer ring and holes by their normalized sign.

```ts
export interface PolygonProperties {
  area: number;
  cx: number;
  cy: number;
  Ix: number;     // about selected origin after parallel-axis transform
  Iy: number;
  Ixy: number;
  perimeter: number;
}
```

Use compensated summation for area and moment accumulations when coordinate magnitudes are large or
the net area is a small difference between outer and hole areas. Prefer translating coordinates
near the bounding-box center before evaluating polygon formulas, then transform the result.

The geometric centroid is independent of material stiffness. Transformed elastic properties are a
separate solver aid in file `03`.

## 3. Exact support coordinates for ultimate strain states

For direction vector

`n(β) = (sinβ, cosβ)` in `(x,y)` coordinates,

the projected coordinate is

`u = sinβ·x + cosβ·y`.

Compute:

```ts
export function support(section: NormalizedSectionGeometry, beta: number) {
  let uMin = Infinity, uMax = -Infinity;
  for (const p of section.outer) {
    const u = Math.sin(beta)*p.x + Math.cos(beta)*p.y;
    uMin = Math.min(uMin, u);
    uMax = Math.max(uMax, u);
  }
  return { uMin, uMax, depth: uMax-uMin };
}
```

For a polygon, extrema of a linear projection occur at vertices. Holes do not define the exterior
compression support. Farthest reinforcement coordinates come from exact bar centers. Never use
concrete-fiber centroids for `uMin/uMax`.

Reject a direction state when its controlling distance is not greater than a scale-aware tolerance.

## 4. Point classification

Ray casting may be used only after topology validation. Return a three-state classification rather
than a Boolean:

```ts
type PointClass = 'inside' | 'outside' | 'boundary';
```

First test point-to-edge distance for `boundary`; then use an even–odd crossing rule. The caller
selects the policy. For bars, a center on the boundary is invalid unless the code adapter explicitly
permits it.

## 5. Clipped-cell integration mesh

Overlay a square grid and intersect each candidate cell with the normalized net concrete polygon.
`polygon-clipping` is acceptable behind a local adapter. "Exact clipping" means the clipped polygon
area is evaluated from the returned intersection geometry; it does not mean JavaScript floating
arithmetic is mathematically exact.

### Critical rule: preserve connected components and use interior quadrature

One grid cell may intersect several disconnected concrete pieces. Do not combine all pieces into a
single centroid. A concave component's area centroid may also lie outside its material region, so it
is not an acceptable general quadrature point. For each output polygon:

1. evaluate its outer ring and holes;
2. compute that connected component's net area and centroid;
3. triangulate the component, including holes, with a pinned/audited triangulator;
4. verify triangle orientation, positive areas, containment, and area/first-moment conservation;
5. place a three-point degree-2 quadrature rule in each triangle;
6. discard only components below a scale-aware sliver threshold and accumulate their discarded area
   for diagnostics.

For triangle vertices `a,b,c`, the three barycentric quadrature points are permutations of
`(2/3,1/6,1/6)`, each with weight `Atriangle/3`. They lie inside the triangle and integrate
polynomials through degree 2 exactly. Therefore, when stress is linear throughout the triangle,
both force and first moments are integrated exactly; material kinks/nonlinearity still require mesh
refinement.

```ts
export interface ConcreteFiber {
  kind: 'concrete';
  x: number;
  y: number;
  area: number;
  materialId: string;
  cellI: number;
  cellJ: number;
  component: number;
  triangle: number;
  quadraturePoint: 0 | 1 | 2;
}

export interface RebarFiber {
  kind: 'rebar';
  x: number;
  y: number;
  area: number;
  barId: string;
  materialId: string; // compiled embedded-rebar material
}

export type Fiber = ConcreteFiber | RebarFiber;
```

The triangle quadrature preserves area, first moments, and second-order polynomial integrals subject
to verified triangulation. General nonlinear stress-resultant error is controlled by solution
verification in file `06`.

## 6. Initial cell size is a starting guess, not an accuracy claim

Define:

- `Dmax`: maximum outer-section caliper depth, used for result normalization;
- `Dmin`: minimum positive caliper width of the outer convex hull;
- `gmin`: verified minimum relevant concrete ligament/feature size, when available;
- `hUserMax`: optional user cap.

Recommended initial rule:

```text
h0 = min(Dmin/32, gmin/3 if known, hUserMax if supplied)
```

For ordinary compact sections this is only a practical seed. No fixed division count guarantees a
universal moment error. Do not use the bounding-box diagonal divided by `N`; it makes cells larger,
not more conservative. Rebar spacing does not control the concrete mesh because bars are integrated
as discrete point fibers.

If robust `gmin` cannot be computed, require either a user-provided feature size or rely on refinement
with a warning that geometric-feature detection is incomplete. `2A/perimeter` is not a minimum wall
thickness and shall not be labeled as one.

## 7. Resource preflight

Before clipping, estimate `nx·ny`, expected fibers, surface evaluations, and memory. Apply configured
limits. If the requested verification tolerance is likely to exceed browser resources, return a
typed `RESOURCE_LIMIT` result with suggested actions; do not silently loosen tolerances.

Long meshing operations run in a worker and accept `AbortSignal` plus progress reporting.

## 8. Mesh sanity checks

Run on every mesh level:

- sum of concrete fiber areas vs exact net polygon area;
- sum of `A·x`, `A·y` vs exact first moments about the analysis origin;
- all fiber values finite and areas positive;
- total discarded sliver area reported and below tolerance;
- each rebar appears exactly once with correct area;
- no concrete fiber centroid is used as a geometric boundary;
- per-component triangle area/first moments vs the clipped polygon properties;
- deterministic fiber ordering by `(cellI,cellJ,component,triangle,quadraturePoint)`.

Use combined absolute and relative tolerances:

```text
|Amesh−Aexact| <= atolA + rtolA·Aexact
```

An area match is a topology/sanity check, not proof that stress integration has converged.

## 9. Independent geometry verification cases

Include rectangles, triangles, circles approximated by known polygons, annuli, L/T sections, narrow
ligaments, multiple holes, translated/rotated copies, and cells cutting two disconnected pieces.
Compare area/centroid/inertia with analytical values where possible and with an independent polygon
implementation for regression fixtures.
