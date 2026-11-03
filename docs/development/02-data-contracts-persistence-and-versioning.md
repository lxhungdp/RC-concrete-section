# Data Contracts, Persistence, and Versioning

## 1. Current persisted contracts

Immediate steel hardening uses a new `linear-hardening` material discriminant. Project JSON remains
v3 with its explicit v1/v2 readers. Older readers reject the unfamiliar law instead of evaluating a
plateau. Raw hardening strength, construction strain and the discriminated cutoff rule are stored
once. Compiled tangents and effective design strengths are derived runtime data. A separate optional
`steelModelModified` flag records KDS steel customization independently of concrete customization.
The editable workbook revision for these fields is v7, with bounded v5/v6 readers retaining their
existing load-reference semantics.

The compact hardening form exposes construction strain, radio-selected ratio/stress peak strength,
and linked editable percentage/direct tensile cutoffs without a mode selector. Editing a cutoff
field selects its stored discriminant; simply viewing both fields does not rewrite it. Percentages are presentation values:
90% stores the existing factor 0.9. New curves select ratio strength input; KDS/Custom persist an
explicit endpoint identity cutoff and EN its named recommended preview rule. Switching strength
radio converts the current value without resetting it. Editing either strain field updates its
companion and selects the factor or absolute basis. Only the selected representations are stored;
physical bounds remain canonical inputs and stay visible if present, with explicit clearing rather
than silent removal when Advanced is removed. No schema/workbook revision or legacy-input
rewrite accompanies this authoring change.

Off -> On creates a valid, editable starter through the project-owned authoring helper, using
the current material and DesignBasis. Its explicit endpoint values are stored and exported just
like user-entered values. This is an authoring action, not an import/parser default; no existing
definition is repaired or replaced. The template and its source are defined in engineering/04 §5.

The project is pre-release. New exports use outer schema v3; explicit centroidal v1/v2 read contracts
remain available. Nested contracts carry their own versions:

- project document `version: 3` (load reference), with v2 stored-area and v1 diameter-only readers;
- design basis `basisVersion: 3`;
- analysis `optionsVersion: 1`;
- `strain-domain-surface-v1` and `equivalent-block-surface-v1` method IDs;
- shared `unified-27-v2` schedule ID for both calculation methods.

The project parser accepts only:

```text
schema  = "pm-column-project"
version = 1 | 2 | 3
```

Unsupported schema, profile, method, and options discriminants fail. The parser migrates legacy
DesignBasis v1 scalar EN factors to v2 expressions and the former v1/v2 EN `eps_cu` compression
endpoint to the v3 `eps_c2` point-C pivot. The field-by-field parser also
applies these documented defaults/repairs:

- omitted `inputs.design` receives a material-derived default;
- omitted stress-strain `analysis.mesh` receives the current default mesh object;
- omitted concrete density receives `2350 kg/m3`;
- an invalid default steel-material ID is warned and replaced by the first steel material on open;
- unknown extra object properties are not globally rejected.
- an omitted legacy user-curve `extrapolation` field is normalized to the previous `clamp`
  behaviour; canonical exports write the field explicitly.

New project exports write all canonical fields explicitly. Version 2 requires finite positive `area`
in mm² on every rebar, independently of `dia` in mm. Optional `areaSource` records a one-time fill
snapshot; it cannot override either number. Version 1 preserves diameter-only input and rejects
stored-area fields. The isolated legacy adapter retains each mechanics' previous binary64 operation
order; creating a v2 document materializes that selected route's area once. No general migration
framework is introduced. See [stored-area contract](11-rebar-area-and-catalogs.md).

## 2. Canonical project document

```ts
type PmProjectDocument = {
  schema: 'pm-column-project'
  version: 3 // canonical export; the reader also accepts explicit centroidal v1/v2
  meta: {
    id: number
    name: string
    information: {
      client: string
      company: string
      designedBy: string
      checkedBy: string
      address: string
      date: string // YYYY-MM-DD or empty
    }
    createdAt: string
    updatedAt: string
  }
  inputs: {
    calculationProfileId:
      | 'kds-2024-stress-strain'
      | 'kds-142020-equivalent-block'
      | 'aci-318-19-22-equivalent-block'
      | 'en-1992-1-1-2004-stress-strain'
      | 'custom-stress-strain'
      | 'custom-equivalent-block'
    geometry: GeometryInput
    materials: MaterialStore
    loadings: { reference: LoadReference; combinations: LoadCombination[] }
    analysis: AnalysisOptions | EquivalentBlockAnalysisOptions
    design: DesignBasis
  }
}
```

`meta.information` is the canonical project/report identity. It is part of the initial schema-v1
contract, while every individual text field - including `meta.name` - may be empty. New projects
start with editable default values and the current local date. This metadata is not an engineering
input: changing it invalidates only report presentation and project serialization, never the
resistance surface or demand result.

Canonical internal units are millimetres, newtons, megapascals, and newton-millimetres. Axial force
and strain are compression positive. Entity IDs are positive integers and references are by ID, not
array position or display name.

## 3. Atomic calculation profile

`calculationProfileId` is the one persisted selection that binds mechanics, standard, material
defaults, resistance basis, and analysis-options family. Changing it in Materials must atomically
replace dependent defaults:

The UI presents Code, method, and concrete model separately, but the capability registry resolves
them back to this atomic compatibility key. They are not independent unvalidated schema fields.

| Profile | Mechanics | Analysis DTO | Resistance basis |
|---|---|---|---|
| `kds-2024-stress-strain` | stress-strain integration | `strain-domain-surface-v1` | KDS global resultant factor |
| `kds-142020-equivalent-block` | equivalent rectangular block | `equivalent-block-surface-v1` | KDS global resultant factor |
| `aci-318-19-22-equivalent-block` | equivalent rectangular block | `equivalent-block-surface-v1` | ACI global resultant factor |
| `en-1992-1-1-2004-stress-strain` | stress-strain integration | `strain-domain-surface-v1` | EN design-material reevaluation, preview only |
| `as-3600-2018-amd2-equivalent-block` | equivalent rectangular block | `equivalent-block-surface-v1` | AS action/state-dependent capacity factor, preview only |
| `custom-stress-strain` | stress-strain integration | `strain-domain-surface-v1` | user-defined global resultant factor |
| `custom-equivalent-block` | equivalent rectangular block | `equivalent-block-surface-v1` | user-defined global resultant factor |

Downstream packages switch on these IDs. They must not infer mechanics from concrete material text.

`CALCULATION_PROFILES` in `packages/pm-project/src/calculation-profiles.ts` is the single owner of
this binding: each entry names its `mechanics`, `materialStandard` and `designProfileId`, and both
the parser's coherence assertions and the atomic Materials apply read that table rather than
re-deriving the answer from the profile id. Narrow by mechanics, never by excluding one id — that is
how a newly added profile silently reaches the wrong kernel.

### 3.1 Custom profiles

A `Custom` profile persists `materialStandard: 'CUSTOM'` and a DesignBasis with
`profileId: 'custom-user-defined'`. Two v1 rules make it safe to carry alongside the code profiles:

- `verificationStatus: 'user-defined'` is reserved for, and required by, that profile id. The parser
  asserts the pairing in both directions, so a code profile cannot borrow the status and a custom
  profile cannot masquerade as `draft`.
- The concrete `stressStrain.type` is checked against the mechanics that will evaluate it. A fibre
  profile rejects `user-block`; a block profile accepts only `user-block`. A code profile needs no
  such check because its material standard already pins the model.

### 3.2 `user-block` concrete model

```ts
{ type: 'user-block'; beta1: number; alpha: number; epsCu: number }
```

`sigma_block = alpha * fck` over `a = beta1 * c`. Like `aci-whitney-block` it is a resultant
equivalence rather than a pointwise law, so `UNSUPPORTED_CONCRETE_MODELS` blocks it from the fibre
kernel and only the equivalent-block adapter consumes it. The stress the kernel integrates comes
from `userBlockCompressionStress`, which is also what the Materials panel and the workbook display,
so the three cannot diverge.

## 4. Stress-strain analysis options v1

```ts
type AnalysisOptions = {
  optionsVersion: 1
  methodId: 'strain-domain-surface-v1'
  stations: {
    basedOn: 'unified-27-v2' | 'custom'
    intermediate: AnalysisStation[]
  }
  directions: {
    seed: { type: 'uniform'; count: number; startDeg: number }
        | { type: 'explicit'; anglesDeg: number[] }
    refinement: DirectionRefinement
  }
  mesh: AnalysisMeshOptions
}
```

The canonical criteria are `depth-ratio` and `bar-tension-yield-ratio`. The production list is six
`c/D` values plus nineteen `εₛ/εy` values, bracketed by the two exact poles. The parser accepts
`unified-27-v2` only when the serialized list exactly matches that order and content; any edited
list must be explicitly marked `custom`. Direction refinement remains independent.

## 5. Equivalent-block analysis options v1

```ts
type EquivalentBlockAnalysisOptions = {
  optionsVersion: 1
  methodId: 'equivalent-block-surface-v1'
  neutralAxisStations: {
    basedOn: 'unified-27-v2' | 'custom'
    values: Array<
      | { type: 'extreme-tension-strain'; strain: number }
      | { type: 'bar-tension-yield-ratio'; ratio: number }
      | { type: 'depth-ratio'; ratio: number }
    >
    refinement: BlockStationRefinement
  }
  directions: {
    seedCount: number
    startDeg: number
    refinement: BlockDirectionRefinement
  }
}
```

This DTO intentionally contains no concrete integration-mesh settings. The equivalent-block kernel
uses exact polygon clipping. Its production default is the shared 27 fixed stations and 36 fixed
directions. Automatic code-transition, rupture-event, and adaptive station insertion is disabled;
explicit custom low-level events remain an opt-in kernel facility.

## 6. Design basis v1

Global-factor bases persist numeric phi/axial-cap factors and a discriminated transition rule:

```ts
type TensionControlledLimitRule =
  | { type: 'yield-plus-strain'; extraStrain: number }
  | {
      type: 'fixed-or-yield-multiple'
      yieldStressThreshold: number
      fixedStrainLimit: number
      highStrengthYieldMultiple: number
    }
```

ACI uses the first rule. KDS uses the second. This prevents the project from persisting one ambiguous
`transitionExtraStrain` and applying it to both standards.

## 7. Load combinations

Every current demand combination has `actionBasis: 'factoredULS'` and stores `P`, `Mx`, and `My` in
canonical units. The design check rejects a different basis. Factored demand is compared with the
Design surface; it is never multiplied by the resistance factor again.

### Applied input reference

V3 requires `loadings.reference = { kind: 'centroid-offset', offsetX, offsetY }` in canonical mm.
Every persisted `LoadCombination` still contains moments about the exact net-concrete centroid.
Input fields/workbooks show explicitly translated copies about the applied origin. All Direct,
Fixed-P, demand-plane and 3D charts retain their centroidal frame, including the converted demand.
@pm/project owns this pure translation; UI and reports introduce no independent equation.
The draft offset and unchecked-by-default Convert option are not persisted. Apply is atomic:
Convert retains the canonical combinations exactly; unchecked Apply reinterprets the previous
displayed numbers at the new origin. Code demand corrections and all numerical checks remain
centroidal. V1/v2 declare zero offset and reject a reference extension rather than silently dropping
it. V3 rejects an omitted/unknown/non-finite reference. See [the task packet](16-load-reference-origin.md).

## 8. Parsing and validation

Parsing is a boundary operation:

- reject unsupported schema/version/method/profile discriminants;
- reject non-finite values, invalid ranges, duplicate IDs, and broken references;
- require analysis explicitly; current parsing may synthesize `design` and stress-strain `mesh` as
  documented in section 1, while canonical exports always write them;
- validate model/profile consistency before running a numerical kernel;
- return warnings only for conditions that remain mathematically defined; never repair a value that
  changes resistance.

Every canonical concrete or steel `user-curve` records `interpolation: 'linear'` and
`extrapolation: 'clamp'`. Its strain coordinates are finite and strictly increasing in persisted
order; the parser and compiler reject reordered or repeated ordinates instead of sorting them.

Round-trip tests cover canonical v3, centroidal v2 and diameter-only v1, exact stored areas and unchanged analysis/profile/
design inputs. Separate tests cover both mechanics and the code-aware transition rule.

## 9. Runtime results are not project input

Prepared meshes, compiled material functions, capacity surfaces, inverse iterations, field maps,
and Plotly traces are runtime artifacts. They are regenerated from persisted definitions and are not
embedded in the project JSON. A future accepted-result artifact requires its own immutable contract,
input hash, kernel/profile versions, convergence evidence, and release policy.

## 10. Editable project workbook

`Import Export` selects Excel (`.xlsx`, default) or JSON. Both export the same applied input
snapshot and project metadata; unapplied geometry drafts are excluded. The web boundary adapter
`features/section-editor/project/project-xlsx.ts` owns `pm-column-input-workbook`, version 6.
It retains the declared project version and adds editable As plus optional hidden source snapshots.
Canonical v2/v3 rows require As. Explicit legacy v1 workbooks retain diameter-only rows until export
through the canonical project creator.

Version 6 includes a visible Load reference declaration. Loadings values are about that declared
origin and normalize once to centroid on import. The explicit workbook-v5 reader declares zero
offset; earlier versions require re-export. JSON keeps centroidal actions. Nonzero-frame Excel
round trips retain full binary64 cell values without display rounding; subtraction/addition of
lever-arm terms can incur ordinary roundoff. The zero-offset exact round-trip contract is unchanged.
Standalone loadcase workbooks carry the same reference declaration; old files without it explicitly
contain centroidal moments. Missing new-format declarations fail closed.

The format selector sits above two explicitly labeled Import and Export buttons. Project share
links are removed: the app neither creates project URL payloads nor reads project inputs from the
URL fragment on startup. Recent-file storage and explicit Excel/JSON file imports retain their
existing validation and apply paths. No URL-fragment compatibility or migration is provided.

Visible sheets are Project, Section, Rebar, Material, Loadings, and Load reference. Analysis and Resistance are
hidden (not veryHidden); users may unhide them for advanced editing. Analysis also retains separate
PROJECT_METADATA and SECTION_METADATA field/value blocks for workbook identity, project IDs/
timestamps/profile and section identity. Those blocks cannot override the visible Project fields.
Material hides the fixed strain sign, curve interpolation/extrapolation, limits/factors, and
advanced code-model coefficients. Base strengths/density/moduli, names, standard/model identity,
user-block coefficients, bilinear hardening, user-curve points and zero-tension control remain
visible. The general material settings block is hidden when there is only one steel grade.
All hidden material parameters remain independent, persisted inputs; strength edits derive nothing.
No JSON snapshot overrides the editable cells, including the explicitly retained hidden advanced settings.

Ordinary cells, bold markers/headers, gridlines, and basic widths/text/number formats support
editing. There are no native Excel Tables, merges, background fills, or print layouts.
Section/Rebar and Loadings state their declared display units in the first note row. The hidden
Units sheet owns the strict version-1 transport selection. Named table headers remain stable;
material/advanced dimensional field labels and curve stress headers carry their declared units.
The UI passes its captured display selection; programmatic exports default to canonical units.

| Sheet | Marker | User-facing inputs |
|---|---|---|
| Project | PROJECT | Name, Client, Company, Designed by, Checked by, Address, Date |
| Section | `outer #1`, `outer #2`, ... | X, Y |
| Section | `hole #1`, `hole #2`, ... | X, Y; belongs to the nearest preceding outer |
| Rebar | REBAR | Diameter, As, X, Y; Steel Material ID shown when several grades exist |
| Material | MATERIAL; CONCRETE, ID; STEEL, ID | Independent material field/value inputs and default steel reference |
| Material | CONCRETE_CURVE, ID; STEEL_CURVE, ID | Strain (1), Stress (MPa) |
| Loadings | LOADINGS | Name, P, Mx, My |
| Analysis (hidden) | ANALYSIS; STATIONS | Explicit options and ordered station records |
| Resistance (hidden) | RESISTANCE | Explicit design basis and provenance |

Markers and named column headers, never absolute row/column coordinates, identify tables.
Keywords/column names are case-insensitive with surrounding spaces ignored. Blank rows and single-cell
`#` comments are ignored; repeated column headers continue a table. Columns can be reordered.
Loading names beginning with `#` or matching LOADINGS remain data when demand cells are present.
Outer/hole numbers are stable entity IDs; they must be positive and unique in their namespaces.
A hole before an outer fails closed. Move an outer together with its holes to retain ownership.
Vertex/station/curve order remains row order; sorting changes meaning and is never repaired.

Point, bar and loading ID columns are hidden optional transport hints, not user-required inputs.
Existing unique IDs survive a round trip. New rows, missing ID columns and copied duplicate ID
hints receive unused positive IDs through the existing public identity allocator; copied-ID
reassignment is reported as a warning. This normalization concerns editor identity only and
changes no coordinates, bars, material references, demand values, signs or engineering parameters.
Malformed explicit ID hints still fail closed. New blank bar material references use the persisted
default under the existing project contract. The optional Steel Material ID column remains readable
even when hidden; imported explicit references must exist. Loadings has no Action basis column:
the current application's `createLoadCombination` owner declares every row `factoredULS`.
Export rejects another demand basis instead of relabeling it.

Add/delete complete rows directly, or add an outer/hole by copying a marker, headers and vertices
and assigning a new marker number. Rebar/loading blocks can repeat. Copy STEEL fields and assign
a unique material ID to add a grade. Empty tables represent empty arrays; deleting a definition
removes it subject to geometry/material validation. No ordering-column renumbering is needed.
Section may contain no polygon blocks for an empty project.

Field/value tables use explicit per-block allowed-field/type maps; units appear in field names.
Booleans accept TRUE/FALSE. Empty optional objects/arrays use {}/[]; numeric paths in advanced
arrays require consecutive zero-based indexes. Version-1/2/3/4 previews require re-export; there is no
silent migration. Required hidden sheets/metadata must be retained; missing advanced settings are
not reconstructed from defaults.

Workbook numbers use the declared per-quantity presentation units and convert once at the
explicit typed field/column boundary. Canonical project lengths remain mm, stresses/moduli MPa,
density kg/m3, forces N, moments N.mm, and declared angles degrees. Compression-positive P/strain and canonical moment signs are unchanged. Stored doubles
retain full precision; cell formatting affects display only. Formulas, cached results, dates,
errors and linked/rich text cells are rejected; paste values. Material parameters remain explicit
independent inputs; editing strength does not derive a new modulus or code parameter.

Import reconstructs raw definitions and uses `parseProjectDocument` for engineering validation
and documented version-specific normalization. Missing sheets/markers/columns, duplicate authoritative
fields/entities, malformed types/units, broken references and resource exhaustion return typed
failures with sheet/row context. No project state changes until validation succeeds. Limits are
10 MiB compressed, 64 MiB declared expanded ZIP content, 256 ZIP entries, 100,000 rows per sheet,
and 64 columns: resource bounds, not engineering tolerances/defaults. Input workbooks contain no
results and confer no acceptance or release status. Their verification status must match the
selected registry profile (currently draft or user-defined); a workbook cannot grant reviewed/
verified status. Source snapshots that disagree with edited diameter/As become Manual.

### Exact no-op unit transport

Unit-aware project, loadcase and section/rebar workbooks carry a strict Units declaration; missing,
unknown or malformed declarations fail. None reads the browser preference on import. Native JSON
retains canonical units. Section DXF cannot preserve independent As and rejects lossy exports.
Standalone section/rebar workbooks use `pm-section-rebars-area-v2` and require As; earlier previews
require re-export.

When binary64 display conversion has no exact inverse for the original number, the numeric cell
also carries a `pm-unit-source/v1` comment with its quantity, source display unit, canonical value
and exported display value. The reader verifies this scalar record against the shared converter.
Only an unchanged visible numeric value with a matching declared unit retains that original number.
An edited cell always converts its visible value; an inconsistent record fails. This is exact
no-op provenance, not a model snapshot or an override of edited cells. IDs, order, ratios and
coefficients never receive quantity records. Moving an Excel cell carries its comment with it.
