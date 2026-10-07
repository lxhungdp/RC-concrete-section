# Data Contracts, Persistence, and Versioning

## 1. Current persisted contracts

The project is pre-release. The outer schema remains v1, while nested contracts carry their own versions:

- project document `version: 1`;
- design basis `basisVersion: 3`;
- analysis `optionsVersion: 1`;
- `strain-domain-surface-v1` and `equivalent-block-surface-v1` method IDs;
- shared `unified-27-v2` schedule ID for both calculation methods.

The project parser accepts only:

```text
schema  = "pm-column-project"
version = 1
```

Unsupported schema, profile, method, and options discriminants fail. The parser migrates legacy
DesignBasis v1 scalar EN factors to v2 expressions and the former v1/v2 EN `eps_cu` compression
endpoint to the v3 `eps_c2` point-C pivot. Within project schema v1, the field-by-field parser also
applies these documented defaults/repairs:

- omitted `inputs.design` receives a material-derived default;
- omitted stress-strain `analysis.mesh` receives the current default mesh object;
- omitted concrete density receives `2350 kg/m3`;
- an invalid default steel-material ID is warned and replaced by the first steel material on open;
- unknown extra object properties are not globally rejected.
- an omitted legacy user-curve `extrapolation` field is normalized to the previous `clamp`
  behaviour; canonical exports write the field explicitly.

These are parser-v1 rules, not compatibility with another project version. New project exports
write all canonical fields explicitly. Changing any of these rules requires fixture and round-trip
test review, but no migration framework is part of the current project.

## 2. Canonical project document

```ts
type PmProjectDocument = {
  schema: 'pm-column-project'
  version: 1
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
    loadings: { combinations: LoadCombination[] }
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

The round-trip test serializes and parses schema v1 and requires exact equality of analysis/profile/
design inputs. Separate tests cover both mechanics and the code-aware transition rule.

## 9. Runtime results are not project input

Prepared meshes, compiled material functions, capacity surfaces, inverse iterations, field maps,
and Plotly traces are runtime artifacts. They are regenerated from persisted definitions and are not
embedded in the project JSON. A future accepted-result artifact requires its own immutable contract,
input hash, kernel/profile versions, convergence evidence, and release policy.

## 10. Editable project workbook

`Import Export` selects Excel (`.xlsx`, default) or JSON. Both export the same applied input
snapshot and project metadata; unapplied geometry drafts are excluded. The web boundary adapter
`features/section-editor/project/project-xlsx.ts` owns `pm-column-input-workbook`, version 3.
The canonical project schema and its parser remain unchanged.

The format selector sits above two explicitly labeled Import and Export buttons. Project share
links are removed: the app neither creates project URL payloads nor reads project inputs from the
URL fragment on startup. Recent-file storage and explicit Excel/JSON file imports retain their
existing validation and apply paths. No URL-fragment compatibility or migration is provided.

Visible sheets are Project, Section, Rebar, Material, and Loadings. Analysis and Resistance are
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
Section and Rebar state mm once in the first note row; Loadings states P in N and Mx/My in N.mm.
Their named column headers omit units. These labels do not change canonical values or conversions.

| Sheet | Marker | User-facing inputs |
|---|---|---|
| Project | PROJECT | Name, Client, Company, Designed by, Checked by, Address, Date |
| Section | `outer #1`, `outer #2`, ... | X, Y |
| Section | `hole #1`, `hole #2`, ... | X, Y; belongs to the nearest preceding outer |
| Rebar | REBAR | Diameter, X, Y; Steel Material ID shown when several grades exist |
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
arrays require consecutive zero-based indexes. Version-1/2 previews require re-export; there is no
silent migration. Required hidden sheets/metadata must be retained; missing advanced settings are
not reconstructed from defaults.

Lengths remain mm, stresses/moduli MPa, density kg/m3, forces N, moments N.mm, and declared angles
degrees. Compression-positive P/strain and canonical moment signs are unchanged. Stored doubles
retain full precision; cell formatting affects display only. Formulas, cached results, dates,
errors and linked/rich text cells are rejected; paste values. Material parameters remain explicit
independent inputs; editing strength does not derive a new modulus or code parameter.

Import reconstructs raw definitions and uses `parseProjectDocument` for engineering validation
and documented parser-v1 normalization. Missing sheets/markers/columns, duplicate authoritative
fields/entities, malformed types/units, broken references and resource exhaustion return typed
failures with sheet/row context. No project state changes until validation succeeds. Limits are
10 MiB compressed, 64 MiB declared expanded ZIP content, 256 ZIP entries, 100,000 rows per sheet,
and 64 columns: resource bounds, not engineering tolerances/defaults. Input workbooks contain no
results and confer no acceptance or release status. Their verification status must match the
selected registry profile (currently draft or user-defined); a workbook cannot grant reviewed/
verified status. These boundary rules do not change JSON parser-v1 behavior.
