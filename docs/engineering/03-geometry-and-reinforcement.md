# Geometry and Reinforcement Engineering Rules

## 1. Engineering model

The persisted geometry is an input definition. Analysis consumes a separate immutable normalized
model. The two must not be treated as the same validation state.

A section may be represented by one or more concrete regions. Each region has:

- one exterior polygon ring;
- zero or more polygon holes;
- reinforcement bars assigned to that region;
- stable entity identities.

The current project model calls the region collection `outers[]`. The target analysis term is
`concreteRegions[]`. This naming difference is resolved by an explicit adapter, not by duplicating
the data in application state.

Support for multiple disconnected regions is capability-gated. An editor may store them while a
particular analysis profile rejects them as out of scope.

## 2. Geometry pipeline

```text
editor/import definition
  -> schema and resource validation
  -> topology validation
  -> deterministic normalization
  -> exact section properties/reference frame
  -> reinforcement validation
  -> numerical integration model
```

Each arrow is a validation boundary. Downstream stages accept only the successful output type of the
preceding stage.

### Definition-stage checks

- coordinates and dimensions are finite;
- entity IDs are valid and unique within their namespace;
- every ring contains at least three distinct non-collinear vertices;
- bar diameter and required generator dimensions are positive;
- resource limits are checked before geometric allocation or boolean operations.

### Topology-stage checks

- no zero-length edge, self-intersection, or ambiguous self-touch;
- every hole lies strictly inside its parent exterior;
- holes do not overlap or touch one another unless a later explicit topology policy supports it;
- disconnected regions do not overlap;
- rings do not rely on a repeated closing point;
- near-boundary cases are classified with scale-aware tolerances and reported.

### Normalization-stage rules

- remove only permitted consecutive duplicates;
- normalize exterior winding counter-clockwise and holes clockwise;
- preserve source/entity traceability through any boolean reconstruction;
- establish one analysis origin and transform coordinates once;
- order normalized entities deterministically where order has no engineering meaning.

Normalization does not silently repair a materially different shape. A topology repair belongs to
an explicit user-reviewed editing/import step.

## 3. Exact boundary versus numerical integration

The normalized exact rings control:

- area, centroid, first/second moments, perimeter, bounds, and support coordinates;
- extreme compression/tension geometry;
- point classification and bar containment;
- report drawings and provenance.

The integration mesh controls only numerical integration. It is an approximation with convergence
evidence. Fiber centroids shall never redefine the section boundary, extreme fiber, origin, cover,
or hole topology.

Exact polygon properties and numerical fiber sums are compared as sanity checks. Matching area does
not prove force/moment convergence.

## 4. Reinforcement rules

Every bar has a stable ID, center coordinate, positive diameter, parent region, and valid steel
material reference. Prior to analysis:

- the center and the full bar disk satisfy the selected boundary/cover policy;
- the bar is outside holes and does not cross a concrete boundary;
- duplicate or overlapping bars are rejected or explicitly classified;
- material references resolve without fallback;
- code-required cover, clear spacing, layering, and transverse-reinforcement classification are
  checked by the applicable rule/profile.

### Cover semantics

The word `cover` is ambiguous and shall not be used alone in a certified input contract. A generator
must declare one of:

- `clearCoverToBarSurface`;
- `clearCoverToTransverseReinforcement` plus tie/stirrup diameter;
- `barCenterlineOffset`.

If clear cover is measured to the longitudinal bar surface, the centerline offset includes
`diameter / 2` and any declared transverse-reinforcement allowance. The current UI quick generator
uses its `cover` value as an approximate centerline offset; it is therefore a **preview editing
helper**, not a verified cover-layout tool.

### Generator limitations

Bounding-box top/bottom or side layouts and a simple vertex-bisector offset can place bars outside a
concave section, across a hole, or at an invalid corner. Generated bars are proposals only until the
same containment, cover, and spacing validators used for manual bars pass. Generation success never
implies engineering validity.

## 5. Concrete occupied by bars

The selected mechanics model integrates gross concrete and treats reinforcement as discrete bars.
It therefore subtracts the concrete displaced by each bar through an independently traceable
`displacedConcrete` contribution evaluated with the selected concrete law at the bar strain.

Do not subtract concrete only because a bar is in “compression” according to a hard-coded sign rule;
evaluate the concrete law so service models with tension behavior remain consistent. The point-bar
approximation and any diameter/gradient warning are recorded in the result.

## 6. Current capability and acceptance

The existing `@pm/geometry` implementation is `implemented/preview`: it provides primitives,
polygon boolean composition, area/centroid summaries, editor-to-input adapters, and rebar generators.
It does not yet implement the complete validation/normalization/integration contract above.

Before geometry can enter accepted analysis, all of these gates must pass:

| ID | Gate |
|---|---|
| `ENG-GEO-001` | schema, finite values, identity, and resource checks |
| `ENG-GEO-002` | complete topology and containment checks |
| `ENG-GEO-003` | deterministic winding/origin normalization |
| `ENG-GEO-004` | exact property and support-function verification |
| `ENG-GEO-005` | bar disk, material reference, cover, and spacing policy checks |
| `ENG-GEO-006` | integration mesh sanity and convergence evidence |
| `ENG-GEO-007` | selected analysis profile explicitly supports the number/type of regions |

Failure at any gate blocks design analysis and identifies the affected entity.
