# 01 — Domain Model, Materials, and Design-Code Boundary

This file defines the **normalized analysis** engineering contract. It is not the current persisted
editor DTO. Project schema v1 stores `GeometryInput.outers[]`; the adapter required by
[`development/02-data-contracts-persistence-and-versioning.md`](development/02-data-contracts-persistence-and-versioning.md)
maps that definition to the validated model below. Runtime data shall be serializable at the
definition boundary, validated, immutable after normalization, and independent of UI state.

The first verified analysis profile may restrict this normalized contract to one connected concrete
region with holes even though the editor/project format can store several regions. Unsupported
topology is a typed failure, not silent data loss.

## 1. Branded units and finite-number validation

TypeScript's `number` does not protect units. Use branded types at public boundaries and plain
numbers only inside a module whose units are fixed.

```ts
type Brand<T, B extends string> = T & { readonly __brand: B };
export type Mm = Brand<number, 'mm'>;
export type N = Brand<number, 'N'>;
export type MPa = Brand<number, 'MPa'>;
export type Nmm = Brand<number, 'Nmm'>;
export type Strain = Brand<number, 'strain'>;
export type Radian = Brand<number, 'radian'>;
```

At the API boundary:

- reject `NaN`, infinities, negative lengths, and nonpositive areas/diameters;
- require an explicit declared input unit system and convert once;
- cap vertex, hole, bar, and requested-resolution counts before allocation;
- never infer mm from values or silently mix kN and N.

## 2. Geometry and reinforcement DTOs

```ts
export interface PtInput { x: number; y: number; }
export type RingInput = readonly PtInput[];

export interface RebarInput {
  id: string;
  x: number;
  y: number;
  diameter: number;
  materialId: string;
}

export interface SectionGeometryInput {
  outer: RingInput;
  holes: readonly RingInput[];
  rebars: readonly RebarInput[];
  referenceOrigin?: { x: number; y: number; kind: 'user' };
}
```

The first release supports exactly one concrete outer region with holes. Disconnected concrete
regions require an explicit future `MultiRegionSection` model; they must not be smuggled in through
self-crossing rings.

## 3. Material definitions are data, not arbitrary callbacks

User-supplied functions cannot be validated, hashed, persisted, migrated, or transferred safely to
a Web Worker. Public inputs therefore use discriminated, serializable definitions. A registry
compiles them to internal evaluators.

```ts
export type ExtrapolationPolicy =
  | { kind: 'error' }
  | { kind: 'constant' }
  | { kind: 'linear' }
  | { kind: 'zeroAfterRupture'; ruptureStrain: number };

export interface CurvePoint { strain: number; stress: number; }

export interface PiecewiseLinearMaterialDef {
  kind: 'piecewiseLinear';
  id: string;
  role: 'concrete' | 'reinforcement';
  points: readonly CurvePoint[];
  lowerExtrapolation: ExtrapolationPolicy;
  upperExtrapolation: ExtrapolationPolicy;
  admissibleStrain?: { min: number; max: number };
  metadata: Readonly<Record<string, string | number | boolean>>;
}

export type MaterialDefinition = PiecewiseLinearMaterialDef | BuiltInMaterialDef;
```

### Required curve validation

- at least two points;
- all strain/stress values finite;
- strains strictly increasing after normalization; duplicate strains are errors;
- any stress discontinuity must use a dedicated discontinuous material type, not duplicate x data;
- extrapolation is explicit on both ends;
- `admissibleStrain`, when present, lies within supported/extrapolated behavior;
- design-code metadata required by the selected adapter is present;
- all built-in parameters are checked against that model's documented validity range.

"Constant outside the curve" is not a default. It can unintentionally create infinite ductility or
an unbounded concrete plateau.

## 4. Internal material evaluator

```ts
export interface StressComponent {
  source: 'concrete' | 'reinforcement' | 'prestressing' | 'displacedConcrete';
  materialId: string;
  stress: number;
}

export interface UniaxialMaterial {
  readonly id: string;
  readonly role: 'concrete' | 'reinforcement';
  stress(strain: number): number;       // MPa, compression positive
  /** Components sum exactly to stress(); mandatory for ULS resistance audit. */
  stressComponents(strain: number): readonly StressComponent[];
  tangent(strain: number): number;      // MPa; one-sided convention documented at kinks
  strainBreakpoints(): readonly number[];
  admissible(strain: number): boolean;
}
```

`tangent()` is required for the optional physical/service equilibrium solver. The ULS forward
surface only needs `stress()`. At a kink, use a documented deterministic one-sided tangent; the
solver must not assume differentiability there.

Do not use a ULS concrete design curve's tangent as the physical elastic modulus. If an elastic
seed is required, the analysis scenario supplies separate `serviceElasticModuli`.

## 5. Piecewise-linear evaluator

Binary search is preferred to a linear segment scan because a material curve can contain many
points. The evaluator returns the exact segment slope inside each segment.

```ts
interface Segment { e0:number; e1:number; s0:number; slope:number; }

export function compilePiecewiseLinear(def: PiecewiseLinearMaterialDef): UniaxialMaterial {
  const p = validateAndFreezeCurve(def);
  const segments: Segment[] = p.slice(0, -1).map((a, i) => {
    const b = p[i + 1];
    return { e0:a.strain, e1:b.strain, s0:a.stress,
             slope:(b.stress-a.stress)/(b.strain-a.strain) };
  });
  // locate(), extrapolateStress(), and extrapolateTangent() are total functions.
  // They throw typed input/domain errors only when the declared policy is 'error'.
  return makeEvaluator(def, segments);
}
```

Unit tests must cover every breakpoint from both sides, extrapolation, rupture, and serialization.

## 6. Gross-concrete integration and embedded reinforcement

The chosen integration model meshes the gross concrete region, including the small areas occupied
by bars. Each bar therefore contributes net stress:

`σbar,net(ε) = σsteel(ε) − σconcrete(ε)`.

Do not subtract concrete only in compression; call the selected concrete material directly so the
rule remains correct if a service model includes tension stiffening.

```ts
export function embeddedRebar(
  steel: UniaxialMaterial,
  concrete: UniaxialMaterial,
): UniaxialMaterial {
  return {
    id: `embedded(${steel.id},${concrete.id})`,
    role: 'reinforcement',
    stress: e => steel.stress(e) - concrete.stress(e),
    stressComponents: e => [
      { source:'reinforcement', materialId:steel.id, stress:steel.stress(e) },
      { source:'displacedConcrete', materialId:concrete.id, stress:-concrete.stress(e) },
    ],
    tangent: e => steel.tangent(e) - concrete.tangent(e),
    strainBreakpoints: () => mergeSortedUnique(
      steel.strainBreakpoints(), concrete.strainBreakpoints()),
    admissible: e => steel.admissible(e) && concrete.admissible(e),
  };
}
```

The point-bar approximation is an explicit model assumption. If bar diameter is large relative to
the local strain-gradient length scale, report a warning or use a future finite-area bar integrator.

## 7. Analysis scenario and design basis

```ts
export interface StandardIdentity {
  organization: string;       // e.g. MOLIT/KDS or ACI
  document: string;
  edition: string;
  amendment?: string;
  jurisdiction?: string;
  nationalAnnex?: string;
}

export interface DesignBasis {
  standard: StandardIdentity;
  adapterId: string;
  adapterVersion: string;
  /** Required even when an organization publishes more than one permitted resistance method. */
  methodId: string;
  profileVersion: string;
  options: Readonly<Record<string, string | number | boolean>>;
}

export interface AnalysisScenario {
  mode: 'ulsResistance' | 'serviceResponse' | 'verificationReference';
  geometry: SectionGeometryInput;
  materials: readonly MaterialDefinition[];
  concreteMaterialId: string;
  designBasis?: DesignBasis;
}
```

The design basis must include every classification that changes resistance: exact method,
reinforcement type, confinement/transverse reinforcement class, concrete and steel grades,
applicable national annex, and any user choice permitted by the standard. For example, `KDS` alone
is invalid because the basic global-factor method and the KDS 14 20 20 Appendix material-factor
method are alternatives. Missing required choices are errors, not defaults.

## 8. Design-code adapter

```ts
export interface DesignCodeAdapter {
  readonly identity: StandardIdentity;
  readonly adapterId: string;
  readonly adapterVersion: string;
  readonly verificationState: 'draft' | 'reviewed' | 'verified';

  validateScenario(s: AnalysisScenario): readonly EngineeringIssue[];
  resolveResistanceProfile(s: AnalysisScenario): StandardResistanceProfile;
  createUlsMaterials(s: AnalysisScenario): UlsMaterialSet;
  createStrainDomain(g: NormalizedSectionGeometry, m: UlsMaterialSet): UltimateStrainDomain;
  resistanceEvaluator(m: UlsMaterialSet): DesignResistanceEvaluator;
  traceability(): readonly ClauseTrace[];
}
```

Every ULS state has a mandatory characteristic/nominal reference evaluation. Different standards
then use different final resistance formats. Some reduce the complete nominal resultant by a
state-dependent scalar; others require reevaluation with material design strengths. Therefore the
generic kernel must not assume `design = φ × nominal`. File `11` is authoritative for sequencing,
profile identities, and the permitted resistance formats.

```ts
export interface UlsMaterialSet {
  /** Mandatory characteristic/nominal laws used for the auditable reference evaluation. */
  reference: MaterialRegistry;
  /** Required only when the selected profile reevaluates design material laws. */
  design?: MaterialRegistry;
  profile: StandardResistanceProfileIdentity;
  resistanceFormat: ResistanceFormat;
}

export interface ResistanceStateEvaluation {
  nominal: NominalStateEvaluation;
  designResistance: Resultant;
  appliedStages: readonly AppliedResistanceStage[];
  clauseRefs: readonly string[];
}

export interface DesignResistanceEvaluator {
  evaluateNominalState(state: UltimateStrainState, fibers: readonly Fiber[]):
    NominalStateEvaluation;
  evaluateDesignState(nominal: NominalStateEvaluation, fibers: readonly Fiber[]):
    ResistanceStateEvaluation;
  clipDomain(mesh: OrientedSurfaceMesh): OrientedSurfaceMesh;
}
```

For a design-material profile, `evaluateDesignState` reevaluates the design stress laws at the
stored strain state. It must not multiply a combined embedded-bar result; full steel and displaced
concrete contributions remain independently traceable. For a global-factor profile, it multiplies
the complete nominal vector exactly once. The API rejects any mixed or repeated method.

Axial compression caps are domain clipping operations. They must preserve a closed, oriented
design domain and be tested at the new cap faces.

## 9. Prevent duplicated engineering truth

Do not store independent copies of `fy`, `Es`, `εy`, `εcu`, and curve points that can disagree.
Derived properties come from one authoritative material/code definition. If a design criterion
uses a nominal yield strain that is not derivable from the curve, the adapter stores it once with
its clause trace and validates the curve against it.

## 10. Provenance

Normalized material and design definitions are part of the input hash. Results must preserve:

- original user input and normalized form;
- material IDs and compiled-model versions;
- standard identity and clause traces;
- all explicit extrapolation policies;
- any warning about model range or unverified adapter state.

Production ULS results are prohibited when the selected adapter state is `draft`. A `reviewed`
adapter may be used only with a persistent non-certified banner; certification requires `verified`.
