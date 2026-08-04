# Geometry and Material Pipelines

This file binds the current `@pm/geometry` and `@pm/materials` code to the required production
pipelines. It distinguishes implemented behavior from required behavior so later coding does not
mistake a preview helper for an analysis contract.

## 1. Geometry: current input and output

### Persisted/editor input

`GeometryInput` is the canonical current project input:

```text
geometry
  id, name
  outers[]
    id
    points[]
    holes[] -> points[]
    rebars[] -> id, steelMaterialId?, dia, x, y
```

The UI keeps additional draft `BoundaryObject` data. Pressing Apply converts one active boundary to
`GeometryInput`. Project export writes only applied geometry and warns when unapplied draft
boundaries exist. This draft/applied separation is correct and shall be preserved.

### Implemented geometry helpers

| Input | Function group | Current output/use |
|---|---|---|
| shape parameters | rectangle/circle/chamfer/capsule/ring factories | point rings for editor |
| ordered primitives | `composeSectionPrimitives` | polygon-clipping result as one/more solids and warnings |
| `GeometryInput` | `sectionGeometryFromGeometryInput` | concrete-only `SectionGeometry` view |
| `GeometryInput` | `geometryInputRebars` | flattened UI rebar view with `solidIndex` |
| section geometry | area/centroid/perimeter summaries | editor display/basic warnings |
| section + pattern parameters | `generateRebarsForSection` | proposed bar locations |

These outputs are `implemented/preview`. `summarizeSection().isValid` is not the production geometry
gate because it does not establish self-intersection, hole containment, region overlap, bar disk
containment, cover/spacing, or scale-aware topology validity.

## 2. Target geometry package pipeline

```text
GeometryInput
  -> GeometryDefinitionSchema
  -> validateGeometryDefinition
  -> validateSectionTopology
  -> normalizeSectionGeometry
  -> computeExactSectionProperties
  -> validateReinforcement
  -> buildIntegrationMesh
  -> GeometryAnalysisModel
```

Suggested package submodules:

```text
src/
  definitions/   input DTOs and factories
  editing/       boolean composition and preview generators
  validation/    schema, topology, bars, issues
  normalization/ winding, origin, stable ordering, source mapping
  exact/         area, centroid, inertia, support, classification
  integration/   clipping, triangulation/quadrature, sanity reports
  adapters/      GeometryInput -> normalized analysis model
```

Editing helpers may accept incomplete data and return preview warnings. `validation/normalization`
is the sole gateway to analysis.

### Geometry stage contracts

| Stage | Success invariant |
|---|---|
| schema | finite values, positive/unique IDs, bounded counts, valid discriminants |
| topology | non-degenerate simple rings, valid nesting, disjoint supported regions |
| normalization | deterministic winding/order/frame with source ID mapping |
| exact properties | verified area/centroid/inertia/support and scale values |
| reinforcement | resolved steel IDs and approved disk/cover/spacing/parent checks |
| integration | positive interior quadrature fibers, conserved geometry moments, diagnostics |

Do not reuse editor coordinate rounding (`toFixed`, 0.001 mm, or default six decimal places) as an
analysis tolerance. Editing precision, topology tolerance, and numerical convergence are separate
settings with separate provenance.

## 3. Geometry gaps to close

| Priority | Current behavior | Required change |
|---|---|---|
| blocking | only basic summary warnings | add complete typed schema/topology/normalization validators |
| blocking | point IDs/outer IDs can collide or be regenerated without a cross-reference report | enforce namespaces and source-to-normalized ID mapping |
| blocking | bars can lie outside, in holes, overlap, or reference deleted steel | validate full bar disk and all foreign keys |
| blocking | quick `cover` semantics are ambiguous | replace with declared cover/centerline contract and post-validation |
| high | simple inward offset is unreliable for concave/hole geometry | use a robust offset adapter or limit generator scope explicitly |
| high | top/bottom/side generators use bounding boxes | clip/validate proposals or restrict to verified rectangular scope |
| high | exact properties lack second moments/support API | implement and verify exact analysis properties |
| high | boolean tolerance/rounding is fixed rather than scale-aware | separate editor boolean settings from analysis topology tolerances |
| future | multiple regions exist in input | add capability check and verified analysis support before enabling |

## 4. Geometry tests

At minimum:

- analytical rectangle/triangle/circle-polygon/annulus area, centroid, and inertia;
- concave, hole, thin-ligament, touching/near-touching, self-intersecting, duplicate-vertex cases;
- translated, rotated, reflected, and scaled copies;
- multiple disconnected regions and unsupported-capability rejection;
- bar center/disk on inside/outside/boundary/hole, overlap, cover, spacing, and missing material;
- boolean composition conservation and deterministic output;
- integration area/first/second moments and refinement;
- property-based input-order and transformation invariants.

## 5. Materials: current input and output

### Persisted definition store

`MaterialStore` currently contains:

- compression-positive sign convention;
- one concrete definition (`id = 1`);
- one or more steel definitions;
- default steel ID used by new bars.

Concrete definitions support KDS parabolic, ACI Whitney block, EC2 parabolic-rectangular, and user
curve discriminants. Steel supports elastic-perfectly-plastic, bilinear, and user curves.

The Materials editor exposes one calculation-profile selector. Its current choices are KDS 2024
stress-strain integration, KDS 14 20 20 equivalent block, and ACI 318-19(22) equivalent block. One
change atomically derives the material source/model, mechanics, resistance basis, and matching
analysis-options DTO. A second independent mechanics or standard selector must not be introduced,
because it would allow contradictory states such as an ACI block profile with stress-strain options.

The lower-level material enums `KDS`, `ACI318`, `EC2`, and `CUSTOM` remain serializable definition
fields. EC2 and Custom material families do not currently appear as complete calculation profiles in
the main selector; adding one requires a complete profile and matching numerical route, not only a
new combobox label.

### Implemented compilation

`compileConcreteMaterial`, `compileSteelMaterial`, and `compileMaterialStore` produce stress/tangent
functions and a small limit record. The UI uses these functions to draw preview curves.

Concrete compilers currently read `factors.alpha` and `factors.gammaC` when present and use the
effective multiplier `alpha / gammaC`. Steel compilers currently read `factors.gammaS` when present
and use `fy / gammaS` as the model yield stress. The Excel export must mirror these effective values
in its named inputs (`alpha`, `fy`) while also displaying the characteristic/source values for audit.

This is a useful package boundary, but the current compiler is not an analysis acceptance boundary:

- unknown/default branches silently choose a model;
- `positiveOr` substitutes fallback engineering values;
- user curves are sorted/clamped without strict breakpoint/extrapolation validation;
- tangents often use a fixed numerical difference;
- admissibility, breakpoints, contribution components, model version, and typed issues are absent;
- stress beyond concrete ultimate strain can silently become zero;
- the current ACI Whitney implementation does not use `beta1` in integration.

## 6. Target material package pipeline

```text
MaterialStore + selected analysis/profile context
  -> MaterialDefinitionSchema
  -> validateMaterialDefinitions
  -> normalize/derive authoritative properties
  -> resolve region/bar references
  -> compileMaterialRegistry
  -> CompiledMaterialSet
```

Suggested submodules:

```text
src/
  definitions/  serializable discriminated DTOs
  validation/   finite/range/curve/source/profile compatibility
  derivation/   versioned standard-family property derivations
  compile/      deterministic evaluators and registries
  models/       concrete and steel model implementations
  embedded/     full-steel and displaced-concrete composition
```

Complete design-code resistance adapters live in `@pm/design-codes`, not in a generic material
dropdown or model filename.

### Required compiled evaluator

```ts
type CompiledMaterial = {
  id: number
  role: 'concrete' | 'reinforcement'
  modelVersion: string
  stress(strain: number): number
  tangent(strain: number): number
  stressComponents(strain: number): readonly StressComponent[]
  strainBreakpoints(): readonly number[]
  admissible(strain: number): boolean
}
```

Compilation must be allocation-free in the analysis fiber loop where practical. Validate and
precompute curve segments once; use binary search or indexed segment traversal.

## 7. Material gaps to close

| Priority | Current behavior | Required change |
|---|---|---|
| blocking | material forms can create invalid/inconsistent combinations | strict discriminated validation and authoritative derivation |
| blocking | silent fallback/default model selection | exhaustive switch and typed unsupported-model error |
| partial | generic curve extrapolation/admissibility is incomplete | the equivalent-block EPP law now enforces declared rupture strain; finish equivalent policies for every generic curve family |
| closed routing hazard | ACI Whitney `beta1` cannot be used as a local fiber law | local-law path rejects it; the ACI calculation profile routes to `@pm/code-aci318`, where `a = beta1 c` is evaluated by exact block clipping |
| high | numerical tangents and unspecified kink side | analytical tangents and documented deterministic kink convention |
| high | no stress contribution ledger | expose concrete/steel/displaced-concrete components |
| high | deleting steel can orphan bars | block deletion or require explicit reassignment command |
| high | family label lacks exact edition/method | keep it as source/model family; add design profile outside material store |
| future | one concrete material only | versioned multi-region material mapping when engineering scope requires it |

## 8. Material tests

- parameter range/boundary tests for every model;
- exact stress and tangent on every segment and both sides of every kink;
- curve ordering, duplicates, extrapolation, rupture, serialization, and non-finite values;
- derived-property consistency (`fy/Es`, KDS-derived fields where verified);
- reference stress tables independent of the compiled implementation;
- embedded steel minus displaced concrete identity and contribution-ledger sum;
- material definition/store/project round-trip;
- profile compatibility and cross-edition/mixed-method rejection;
- randomized deterministic curves with stored seeds.

## 9. Cross-package assembly

Geometry stores only steel material IDs on bars. Materials know nothing about bar coordinates.
Orchestration resolves the two normalized outputs and returns a typed issue for every missing or
incompatible reference. This keeps both packages independently reusable and avoids a circular
dependency.
