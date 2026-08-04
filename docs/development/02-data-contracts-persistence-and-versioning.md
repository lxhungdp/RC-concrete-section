# Data Contracts, Persistence, and Versioning

## 1. Current rule: every persisted calculation contract is v1

The project is pre-release and all current persisted calculation code is v1:

- project document `version: 1`;
- design basis `basisVersion: 1`;
- analysis `optionsVersion: 1`;
- `strain-domain-surface-v1` and `equivalent-block-surface-v1` method IDs;
- `transition-aware-p0-p24-v1`, `legacy-p0-p18-v1`, and `verified-37-v1` schedule IDs.

The project parser accepts only:

```text
schema  = "pm-column-project"
version = 1
```

No other persisted calculation version exists. There is no migration or backward-compatibility
layer. Unsupported schema, version, profile, method, and options discriminants fail. Within v1, the
field-by-field parser applies these documented defaults/repairs:

- omitted `inputs.design` receives a material-derived default;
- omitted stress-strain `analysis.mesh` receives the current default mesh object;
- omitted concrete density receives `2350 kg/m3`;
- an invalid default steel-material ID is warned and replaced by the first steel material on open;
- unknown extra object properties are not globally rejected.

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
    createdAt: string
    updatedAt: string
  }
  inputs: {
    calculationProfileId:
      | 'kds-2024-stress-strain'
      | 'kds-142020-equivalent-block'
      | 'aci-318-19-22-equivalent-block'
    geometry: GeometryInput
    materials: MaterialStore
    loadings: { combinations: LoadCombination[] }
    analysis: AnalysisOptions | EquivalentBlockAnalysisOptions
    design: DesignBasis
  }
}
```

Canonical internal units are millimetres, newtons, megapascals, and newton-millimetres. Axial force
and strain are compression positive. Entity IDs are positive integers and references are by ID, not
array position or display name.

## 3. Atomic calculation profile

`calculationProfileId` is the one persisted selection that binds mechanics, standard, material
defaults, resistance basis, and analysis-options family. Changing it in Materials must atomically
replace dependent defaults:

| Profile | Mechanics | Analysis DTO | Resistance basis |
|---|---|---|---|
| `kds-2024-stress-strain` | stress-strain integration | `strain-domain-surface-v1` | KDS global resultant factor |
| `kds-142020-equivalent-block` | equivalent rectangular block | `equivalent-block-surface-v1` | KDS global resultant factor |
| `aci-318-19-22-equivalent-block` | equivalent rectangular block | `equivalent-block-surface-v1` | ACI global resultant factor |

Downstream packages switch on these IDs. They must not infer mechanics from concrete material text.

## 4. Stress-strain analysis options v1

```ts
type AnalysisOptions = {
  optionsVersion: 1
  methodId: 'strain-domain-surface-v1'
  stations: {
    basedOn: 'transition-aware-p0-p24-v1' | 'legacy-p0-p18-v1' | 'custom'
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

Station criteria are `c-over-c1`, `steel-stress-ratio`, `steel-strain`,
`strength-reduction-transition-ratio`, and `strength-reduction-post-transition`. The last two are
standard-independent coordinates: the solver resolves them using the selected DesignBasis.

The production default is 25 total stations, 36 uniform seed directions, and adaptive all-station
refinement at 0.005 relative tolerance. `legacy-p0-p18-v1` exists only for an explicit regression
fixture or user-selected legacy schedule; it is not inferred during import.

## 5. Equivalent-block analysis options v1

```ts
type EquivalentBlockAnalysisOptions = {
  optionsVersion: 1
  methodId: 'equivalent-block-surface-v1'
  neutralAxisStations: {
    basedOn: 'verified-37-v1' | 'custom'
    values: Array<
      | { type: 'extreme-tension-strain'; strain: number }
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
uses exact polygon clipping. Its production defaults are 37 initial neutral-axis states, 24 seed
directions, and 0.75% adaptive station/direction refinement. Code-owned bar-strain events are
resolved transiently from the selected profile and steel grades; they are not duplicated in the
project DTO.

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

The round-trip test serializes and parses schema v1 and requires exact equality of analysis/profile/
design inputs. Separate tests cover both mechanics and the code-aware transition rule.

## 9. Runtime results are not project input

Prepared meshes, compiled material functions, capacity surfaces, inverse iterations, field maps,
and Plotly traces are runtime artifacts. They are regenerated from persisted definitions and are not
embedded in the project JSON. A future accepted-result artifact requires its own immutable contract,
input hash, kernel/profile versions, convergence evidence, and release policy.
