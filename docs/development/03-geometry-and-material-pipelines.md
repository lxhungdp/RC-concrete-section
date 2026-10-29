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
  rebars[] -> id, steelMaterialId?, dia, area, areaSource?, x, y
```

The UI keeps additional draft `BoundaryObject` data. Pressing Apply converts one active boundary to
`GeometryInput`. Project export writes only applied geometry and warns when unapplied draft
boundaries exist. This draft/applied separation is correct and shall be preserved.
The boundary list reports its current multi-selection count. In its Concrete geometry context, the
Delete key removes every selected boundary through the same applied-section confirmation and cleanup
path as the row action; editable fields and dialogs do not trigger the shortcut.

The Point editor uses the shared terminal-table role for the selected Outer/Hole.
Remove all clears only that unlocked draft ring's vertices and retains the ring
slot, other rings and reinforcement. Add can rebuild an empty ring; the initial
point is an editable proposal at the editor origin, not an analysis default.
Applied input remains unchanged during these edits. The web adapter
`geometry/boundary-draft.ts` validates every unfiltered draft ring and bar through
the existing `@pm/geometry` validator before conversion, then validates input
identities. This prevents the input adapter from silently omitting a cleared
outer. Apply reports typed issues and leaves the applied section unchanged for
incomplete, degenerate or invalid drafts.

### Editable section drawing exchange

The web geometry adapter `geometry/section-dxf.ts` owns section DXF exchange.
This is an editable input drawing, separate from the downstream mesh-audit DXF.
Export uses R2000 ASCII DXF with closed straight-segment 2D LWPOLYLINE boundaries and
CIRCLE reinforcement. Export includes the active boundary's outers, holes and
bars, including their full-precision coordinates; circle radius is `dia / 2`.
It does not export an analysis mesh or acceptance status.
An explicit As different from the circle equation blocks section DXF export with
`UNSUPPORTED_REBAR_AREA`; a CIRCLE cannot carry that independent calculation input. Use project
JSON or an area-aware workbook to preserve it. DXF imports remain explicit diameter-only drafts;
the application materializes their area once before editing or canonical project export.
The R2000 container includes HEADER, CLASSES, TABLES, BLOCKS, ENTITIES and
OBJECTS, with all nine system symbol tables, the standard linetypes/styles/ACAD
application entry, both space block records and the root/ACAD_GROUP dictionaries.
Each TABLE starts with its group-2 name before the handle. Handles are unique,
owner references resolve, and DIMSTYLE entries use group 105. Regression checks
inspect the raw container before a permissive CAD library can synthesize defaults.

The single layer `pm` is case-insensitive. Closed straight 2D POLYLINE and
LWPOLYLINE rings are classified by strict nesting: even depth is a concrete
outer, odd depth is a hole in the immediately containing outer. Containment is
established by the existing geometry validator, never entity order, winding or
proximity. Every CIRCLE entity is reinforcement regardless of diameter.
All boundaries, including circular-section polygons and small holes, are
polylines. No diameter-based inference or curve discretization is introduced.
Shared validation rejects intersecting/touching rings, ambiguous nesting,
invalid full bar disks and overlapping bars. Unrelated layers are ignored with
a count warning. Unsupported entities on the pm layer, bulges, fitted
curves, nonzero elevation/thickness, non-default extrusion, paperspace data,
binary DXF, malformed numbers and exhausted limits fail closed. Boundary curves
must be converted to explicitly chosen straight polygon segments in CAD; the
adapter never silently approximates them.

Drawing lengths are mm, X right and Y up with no translation or snapping.
Export declares `$INSUNITS = 4`. Import rejects other declared units; absent or
unitless declarations require an explicit user choice of one drawing unit =
one mm before parsing geometry. No magnitude-based unit inference is allowed.
The adapter's resource limits are 10 MiB text, 500,000 code/value pairs,
20,000 entities, 128 rings, 1,024 vertices per ring, 4,096 total vertices and
2,048 bars, checked before topology validation. These are interchange safety
bounds, not engineering tolerances or model defaults.

Import creates a new editable draft boundary without replacing the applied
section; Apply remains the explicit calculation-input transition. IDs are newly
allocated within their existing namespaces. DXF carries geometry, not material
definitions: imported bars use the first existing steel material by stored order
(ID references, never name foreign keys). Existing concrete is retained. If
either family is missing, the adapter uses the repository's existing default
factories resolved through the current calculation profile and reports creation.
It changes no existing material parameters, profile, resistance basis or analysis
options. Material validation and geometry validation must both succeed before
any import state is published. Invalid existing material definitions are not silently
replaced. The default concrete remains the single concrete definition supported
by project schema v2 and its legacy v1 reader.

Autodesk format authorities, accessed 2026-10-08:
[POLYLINE](https://help.autodesk.com/cloudhelp/2020/ENU/AutoCAD-DXF/files/GUID-ABF6B778-BE20-4B49-9B58-A94E64CEFFF3.htm),
[LWPOLYLINE](https://help.autodesk.com/cloudhelp/2017/ENU/AutoCAD-DXF/files/GUID-748FC305-F3F2-4F74-825A-61F04D757A50.htm),
[CIRCLE](https://help.autodesk.com/cloudhelp/2016/ENU/AutoCAD-DXF/files/GUID-8663262B-222C-414D-B133-4A8506A27C18.htm),
[INSUNITS](https://help.autodesk.com/cloudhelp/2023/ENU/AutoCAD-Core/files/GUID-A58A87BB-482B-4042-A00A-EEF55A2B4FD8.htm).
Container references, accessed 2026-10-08:
[Autodesk symbol table example](https://help.autodesk.com/cloudhelp/2019/ENU/AutoCAD-DXF/files/GUID-0D904716-CF15-445C-94C6-05455736ED13.htm),
[common symbol table codes](https://help.autodesk.com/cloudhelp/2018/ENU/AutoCAD-DXF/files/GUID-5926A569-3E40-4ED2-AE06-6ACCE0EFC813.htm),
[ezdxf minimum R13-and-later content](https://ezdxf.readthedocs.io/en/stable/dxfinternals/filestructure.html#dxf-r13-r14-and-later).

The browser application intentionally imports ASCII DXF only. The file adapter
`geometry/section-drawing-file.ts` checks the actual byte limit, extension and
signature before decoding text. Binary DWG, including a DWG renamed to .dxf,
returns a blocking format issue with instructions to save ASCII DXF in CAD.
Binary DXF and other extensions are rejected. File chooser filtering is not
treated as content validation. No native CAD decoder, WASM dependency or drawing
upload is included. The native-DWG cost review remains recorded as prototype
evidence in its task packet, not an implemented product capability.

### Implemented geometry helpers

| Input | Function group | Current output/use |
|---|---|---|
| shape parameters | rectangle/circle/chamfer/capsule/ring factories | point rings for editor |
| ordered primitives | `composeSectionPrimitives` | polygon-clipping result as one/more solids and warnings |
| two or more section geometries | `intersectSectionGeometries` | common polygon-clipping region, preserving disconnected solids within each operand |
| `GeometryInput` | `sectionGeometryFromGeometryInput` | concrete-only `SectionGeometry` view |
| `GeometryInput` | `geometryInputRebars` | flattened UI rebar view with `solidIndex` |
| section geometry | area/centroid/perimeter summaries | editor display/basic warnings |
| section + pattern parameters | `generateRebarsForSection` | proposed bar locations |

Quick-generator parameters, pattern and replace/append choice are transient workspace editor
state. Canonical length parameters remain mm and survive Rebar-panel/menu unmounts and display-unit
changes. Opening a project resets this helper state to its existing defaults; it is not serialized
into project JSON. Existing bars change only through the Generate action or an explicit bar edit.
The generator retains independent canonical diameter and As, with one-time Equation/Catalog fills.
Generated bars copy both inputs. Later diameter edits do not derive As. The shared area owner and
legacy boundary are described in [stored-area contracts](11-rebar-area-and-catalogs.md).

These outputs are `implemented/preview`. `summarizeSection().isValid` remains an editor summary, not
the analysis gate. `validateGeometryInput`/`validatePolygonSection` now provide the shared
scale-aware topology, full circular-bar disk, and overlap gate used by project import and both
mechanics; code-specific cover/clear-spacing and persisted multi-region bar assignment remain open.

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
| partial | shared typed topology and circular-bar validation now block parser and mechanics input | finish deterministic normalization, persisted parent mapping, and resource-count policy |
| blocking | point IDs/outer IDs can collide or be regenerated without a cross-reference report | enforce namespaces and source-to-normalized ID mapping |
| partial | full disks/outside/holes/overlap and steel foreign keys are blocked | add code-specific cover/clear-spacing and persisted parent-region policy |
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

The Materials editor exposes hierarchical Code, calculation-method, and concrete-model selectors.
They are not independent free-form selectors: every lower choice comes from the selected profile's
capability registry. A change atomically derives the material source/model, mechanics, resistance
basis, and matching analysis-options DTO, preventing contradictory states such as an ACI block
profile with stress-strain options.

The lower-level material enums `KDS`, `ACI318`, `EC2`, and `CUSTOM` remain serializable definition
fields. EN appears only as a limited preview calculation profile; legacy Custom IDs remain readable
but Custom is not a Code. AS is executable only as a disclosed `draft` preview. Releasing a standard still requires a
complete profile and matching numerical route, not only a combobox label.

### Implemented compilation

`compileConcreteMaterial`, `compileSteelMaterial`, and `compileMaterialStore` produce stress/tangent
functions and a small limit record. The UI uses these functions to draw preview curves.

Concrete compilers currently read `factors.alpha` and `factors.gammaC` when present and use the
effective multiplier `alpha / gammaC`. Steel compilers currently read `factors.gammaS` when present
and use `fy / gammaS` as the model yield stress. For EN these material fields are derived runtime
snapshots; `DesignBasis.factors` is the canonical editable source. The Excel export must mirror these effective values
in its named inputs (`alpha`, `fy`) while also displaying the characteristic/source values for audit.

This is a useful package boundary, but the current compiler is not an analysis acceptance boundary:

- unknown/default branches silently choose a model;
- `positiveOr` substitutes fallback engineering values;
- user curves now reject non-increasing breakpoints and record the supported clamp policy; broader
  rupture/extrapolation families remain unimplemented;
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

Generic resistance basis and sequencing live in `@pm/design`; implemented equivalent-block code
policy lives in `@pm/code-kds142020` and `@pm/code-aci318`. The application bridge is
`@pm/analysis-equivalent-block`. None of these rules belongs in a generic material dropdown or model
filename.

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
