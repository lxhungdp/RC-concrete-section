# Data Contracts, Persistence, and Versioning

## 1. Current persisted contracts

Immediate steel hardening uses a new `linear-hardening` material discriminant. Project JSON remains
v3 with its explicit v1/v2 readers. Older readers reject the unfamiliar law instead of evaluating a
plateau. Raw hardening strength, construction strain and the discriminated cutoff rule are stored
once. Compiled tangents and effective design strengths are derived runtime data. A separate optional
`steelModelModified` flag records KDS steel customization independently of concrete customization.
Project workbook v2 preserves the explicit hardening strength, construction strain and cutoff
inputs; no earlier Excel format is supported. Native project JSON schema versions are independent
of the workbook format.

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

The generated complex-section example follows the current canonical export version. Its checked-in
JSON must match `npm run fixture:complex-section-json` byte for byte, including the pinned timestamp,
stored rebar areas and explicit load-reference/check-basis defaults. Other examples may retain
declared legacy versions for reader coverage; menu-example tests must distinguish those contracts
instead of requiring every example to remain v1. The CI fixture-diff gate remains strict.

Authoring visibility is separate from persistence compatibility. The
[active-input inventory](17-active-inputs-and-audit.md) governs panel/dialog/workbook inputs.
Concrete `mc` and `elasticModulus` remain in JSON and readonly workbook properties for exact round
trips, but are not presented for entry or as active calculation parameters. Moving them out of the
input sheets never regenerates material definitions. The first external workbook format is v1;
there are no earlier Excel readers.

JSON file import checks file bytes before reading and text/entity budgets before expensive parsing
or topology work. In a browser with Worker support, the application parses and validates in a
dedicated worker, terminates it on success/failure/cancellation, and applies only its successful
validated document. Superseding/unmounting an import aborts that job. Worker startup/runtime failure
blocks the import. Environments without Worker support retain the same bounded parser with
request-boundary cancellation only. Recent/example definitions still use the bounded synchronous
parser; these paths do not promise cooperative inner-loop cancellation.

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

An explicit switch to either KDS mechanics removes prior material `gammaC`, `gammaS` and
`resistanceScale` snapshots before deriving the nominal yield snapshot. The selected DesignBasis
alone owns subsequent resistance reduction. Strengths, modulus, material identity and declared
physical strain bounds survive the switch. This authoring rule does not rewrite imported projects
or reconstruct characteristic strengths from an explicitly supplied design-level user curve.

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

The KDS Appendix basis also stores its explicit `minimumEccentricity` constant, depth factor and
clause reference. Parsing preserves all supplied finite values and applies the design owner's
range/reason checks. Only an omitted rule receives the selected profile's documented default.
A rule supplied to a profile without that capability is rejected. This repairs an input-loss bug;
it introduces no new eccentricity equation, coefficient or profile applicability.

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

### Check basis

`loadings.checkBasis` is `'proportional3D'`, `'direct2D'` or `'constantAxial'`, defined by engineering/05 §3.
Canonical exports write it. A project document that omits it, at any version, reads as
`proportional3D`, the only behaviour those files could have declared; this is a documented parser
default, not a migration. An unknown value is rejected. It is a load-check input rather than an
analysis option, so changing it reuses the resistance surface.

## 8. Parsing and validation

### Input resource preflight

Before JSON parsing, allocation of normalized arrays or topology validation, reject JSON above
10 MiB UTF-8. The web file adapter checks bytes before reading the file. The geometry owner reuses
the existing drawing-interchange safety envelope: at most 128 rings, 1,024 vertices per ring,
4,096 vertices in total and 2,048 bars. Material input allows at most 2,048 steel definitions and
4,096 curve points in total (and per individual curve). Project loadings allow at most 100,000
combinations, matching the existing workbook row ceiling. These project-selected memory/work
bounds are not engineering applicability limits or accuracy claims. They are checked on direct
unknown-object input as well as text import, before quadratic edge-pair validation. Exceeding a
bound returns a typed resource failure and leaves applied state unchanged.

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

The Project menu Export and Open generate the Project XLSX v2 format owned by
`@pm/spreadsheet/project-xlsx`. Direct Import and spreadsheet Update share its validator.

| Sheet | Input responsibility |
|---|---|
| Section | Section name and ordered outer/hole coordinates |
| Rebar | Diameter, stored As, coordinates and steel assignment |
| Material | Calculation profile, default steel, active material definitions and user curves |
| Loadings | Ordered factored ULS actions about the section centroid |

Generated workbooks have four visible, unlocked sheets with normal views, no frozen rows and no
cell notes. They use dark-blue text for inputs, plain headings and no cell fills. Export and Open
capture the current Options units and write converted numeric values with matching field and column
labels. Workbook properties carry the versioned source unit selection. Earlier v2 files without
that property use their original canonical units. Import uses the workbook declaration regardless
of the current Options. Conversion of visible values can introduce ordinary binary64 roundoff.
The recorded rebar area and diameter are kept exactly when both displayed cells still match the
source pair. Technical IDs,
material template identity, inactive material compatibility fields and As provenance are transport
data. They contain no backup of editable values. Material yield is derived through the material
compiler where a bound yield snapshot is present.

The reader ignores additional sheets. It validates the four groups before publishing them together.
Project information, sampling, mesh, resistance and Check Basis come from the current project
default owners. The imported Material profile selects analysis and resistance defaults. Loadings
use zero origin offsets because the workbook already carries centroidal resultants. Diameter-only
geometry from legacy JSON materializes As through the existing geometry owner on export.

The v1 compatibility reader uses its Project Profile, Units and Load reference declarations only
to interpret the engineering inputs. It ignores Project information, Options and Resistance and
publishes the same defaults as v2. The v1 origin conversion uses the existing load-reference owner.
A user-defined concrete model under a design Code requires a project-specific resistance record
under the project validator. The compact exchange blocks that case and directs users to Project JSON,
which preserves the record, including the P16 UMD design-level concrete model and factors.

Missing inputs, conflicting headers, nonfinite values, invalid topology/references and resource
exhaustion fail atomically. The existing compressed/expanded ZIP, row, column and editor cell bounds
apply. Direct Import consumes plain cells. The modeless editor supplies current finite scalar
formula results on Update and retains the formula-bearing draft for native Save. Native Open and
Save preserve authored styles, formulas and helper sheets of existing files. The editor only
publishes the declared input sheets. JSON readers and result workbooks use their own contracts.
