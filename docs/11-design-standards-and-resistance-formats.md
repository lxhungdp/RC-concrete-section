# 11 — Design Standards, Nominal-to-Design Resistance, and Standard Registry

This file is authoritative for the boundary between section mechanics and design-code resistance.
It closes a critical ambiguity: `nominal`, `design`, and `factored` are not interchangeable, and
not every standard obtains design resistance by multiplying the total nominal resultant by one
number.

## 1. Mandatory engineering decision

The engine shall use this ordered pipeline for every ULS state:

1. construct an admissible ultimate strain state from exact geometry and the selected standard;
2. evaluate and retain a characteristic/nominal **reference** response at that state;
3. in a separate final resistance stage, apply exactly one standard-specific resistance method;
4. apply member/section caps and other domain operations required by that same method;
5. validate and store the resulting design-resistance surface.

The mechanics kernel never contains a hidden `0.65`, `0.90`, `phi`, partial factor, or national
choice. The selected `StandardResistanceProfile` owns those rules.

The phrase "multiply by factors at the final step" means a final, traceable resistance stage. It
does **not** mean that every standard can be represented as

`Rd = scalar * Rn`.

That scalar form is valid only when the governing standard explicitly defines it.

## 2. Required terminology

Use the following terms in code, reports, and UI:

- `demand`: factored ULS action `(Pu,Mux,Muy)`;
- `nominalReference`: resultant obtained with the profile's declared characteristic/nominal
  material laws at a stored strain state;
- `designResistance`: resistance allowed for comparison with the factored demand;
- `globalStrengthReduction`: one state-dependent scalar applied to the complete nominal resultant;
- `designMaterialStrength`: a characteristic material strength modified by a material/partial
  factor and then used in the design stress law;
- `domainCap`: a geometric limit imposed after state evaluation, such as maximum axial resistance.

Avoid a bare field or label named `factored`. If it must appear for user familiarity, display
`Factored/design resistance` and retain the exact method ID in the result.

## 3. Supported resistance formats

### 3.1 Global resultant factor

Use only when the standard defines design strength as a reduction of nominal strength:

```text
Rn(s) = [Pn(s), Mnx(s), Mny(s)]
Rd(s) = phi(s, classification, options) * Rn(s)
```

The same state-specific `phi` is applied to `P`, `Mx`, and `My` at that surface vertex. The factor
may change with controlling tensile strain, transverse reinforcement, failure classification, or
other code-defined state. It is not selected independently for concrete, steel, tension, and
compression fibers.

### 3.2 Design-material reevaluation

Use when the standard applies factors to material strengths or design stress-strain laws:

```text
Rreference(s) = Integral[sigma_characteristic(epsilon(s))] dA
Rd(s)         = Integral[sigma_design(epsilon(s), material factors)] dA
```

Both evaluations use the same stored strain state, but the design law is evaluated independently.
In general, this is **not** equal to multiplying the final characteristic resultant by a scalar.
For example:

```text
min(Es*epsilon, 0.90*fy) != 0.90*min(Es*epsilon, fy)
```

The right-hand side incorrectly reduces the elastic modulus. Therefore a steel material factor
that modifies yield strength must be applied when compiling/evaluating the design material law,
not blindly to the total nominal steel force.

### 3.3 Contribution-factor transform

This optimized form is allowed only when the adapter proves that every relevant design stress is
a constant multiple of its reference stress over the supported strain range:

```text
Rreference = sum(Rg,reference)
Rd         = sum(eta_g * Rg,reference)
```

The forward result must then contain a contribution ledger by independently factorable group.
Combining concrete and steel into one contribution before factoring is prohibited. In particular,
an embedded-bar contribution `steel - displaced concrete` must preserve full-steel and displaced-
concrete terms separately.

### 3.4 Hybrid method

A standard may require design-material reevaluation or contribution factors followed by an
additional state factor or domain cap. A hybrid profile shall declare the exact ordered stages and
clause trace. It must not be created merely to reproduce a target spreadsheet value.

## 4. Resistance-state contract

```ts
export type ResistanceFormat =
  | { kind: 'globalResultantFactor' }
  | { kind: 'designMaterialReevaluation' }
  | { kind: 'contributionFactorTransform' }
  | { kind: 'hybrid'; stages: readonly ResistanceStageKind[] };

export type ContributionGroup =
  | 'concreteCompression'
  | 'concreteTension'
  | 'reinforcementTension'
  | 'reinforcementCompression'
  | 'prestressing'
  | 'displacedConcrete'
  | `material:${string}`;

export interface ResultantContribution {
  group: ContributionGroup;
  materialId: string;
  resultant: Resultant;
}

export interface NominalStateEvaluation {
  state: UltimateStrainState;
  nominalReference: Resultant;
  contributions: readonly ResultantContribution[];
  stateClassification: Readonly<Record<string, string | number | boolean>>;
}

export interface DesignStateEvaluation {
  nominal: NominalStateEvaluation;
  designResistance: Resultant;
  resistanceFormat: ResistanceFormat;
  appliedStages: readonly AppliedResistanceStage[];
  clauseRefs: readonly string[];
}
```

The nominal contribution sum must reproduce `nominalReference` within compensated-summation
tolerance. Every applied stage records inputs, outputs, factor values or design-material IDs,
classification, and clause references.

## 5. Standard registry

Selecting only an organization name such as `KDS`, `ACI`, or `Eurocode` is invalid. A profile key
contains at least:

```ts
export interface StandardResistanceProfileIdentity {
  organization: string;
  document: string;
  edition: string;
  amendment?: string;
  jurisdiction?: string;
  nationalAnnex?: string;
  methodId: string;
  profileVersion: string;
}

export interface StandardResistanceProfile {
  identity: StandardResistanceProfileIdentity;
  status: 'draft' | 'reviewed' | 'verified';
  format: ResistanceFormat;
  requiredOptions: readonly StandardOptionDefinition[];
  buildReferenceMaterials(input: AnalysisScenario): MaterialRegistry;
  buildDesignMaterials(input: AnalysisScenario): MaterialRegistry | undefined;
  classifyState(state: UltimateStrainState): ResistanceClassification;
  evaluateResistance(nominal: NominalStateEvaluation): DesignStateEvaluation;
  clipDesignDomain(mesh: OrientedSurfaceMesh): OrientedSurfaceMesh;
  traceability(): readonly ClauseTrace[];
}
```

No profile may silently inherit factors from another edition. Unknown edition, missing national
annex, missing transverse-reinforcement classification, or an unsupported material grade is a
typed fatal error.

## 6. KDS profiles confirmed for this specification

### 6.1 KDS basic strength-reduction method

Profile key:

```text
organization: MOLIT/KDS
document: KDS 2024 current set · resistance: KDS 14 20 10:2021 + KDS 14 20 20:2022
edition: 2024 partial-revision framework (effective 2025-01-05)
amendment: MOLIT Notice 2024-879, 2024-12-30
methodId: kds-2024-current-set-global-strength-reduction
format: globalResultantFactor
```

“KDS 2024 current set” identifies the current concrete-code set established by MOLIT Notice
2024-879. The official revision notice identifies KDS 14 20 52 as revised and KDS 14 20 68 as a
new standard; it does not list the strength-reduction provisions in KDS 14 20 10 or the
flexure/compression provisions in KDS 14 20 20 as revised. The software therefore records both the
2024 umbrella amendment and the exact 2021/2022 resistance documents from which this draft
profile's coefficients are taken.

KDS 14 20 10, 4.2.3 defines design strength as nominal strength multiplied by a strength-reduction
factor. For moment, axial force, and combined P-M states covered here:

| Section state | Required factor |
|---|---:|
| Tension-controlled | `0.85` |
| Compression-controlled, spiral reinforcement satisfying the KDS spiral provisions | `0.70` |
| Compression-controlled, other reinforced-concrete members | `0.65` |
| Transition between compression- and tension-controlled limits | increase from the applicable compression value to `0.85` as prescribed by KDS |

The implemented KDS rule resolves the tension-controlled limit as `0.005` for `fy <= 400 MPa` and
`2.5 eps_y` for higher-strength reinforcement. Phi is linearly interpolated from the applicable
compression value to `0.85` between `eps_y` and that limit. Both calculation mechanics record the
controlling tensile strain, yield strain/stress, resolved limit, and transverse-reinforcement class.
Applicable axial caps are separate domain operations.

For high-strength KDS concrete, the flexural equivalent block uses `eta 0.85 fck`, while the code
concentric-compression reference `P0` uses `0.85 fck`. These are retained as two different objects:
the physical `eta`-reduced compression limit closes the Nominal/Design surfaces, and `P0` is exposed
as a named code reference point only. No triangle interpolates through the otherwise unsupported
band between them.

This method follows the literal nominal-then-global-factor pipeline. It does **not** apply `0.90`
to reinforcement and `0.65` to concrete.

### 6.2 KDS 14 20 20:2022 Appendix material-factor method

Profile key:

```text
organization: MOLIT/KDS
document: KDS 14 20 20:2022 Appendix
edition: 2022
methodId: kds-appendix-design-material-strengths
format: designMaterialReevaluation
```

The Appendix is an alternative analysis method whose design strengths may replace those from the
basic KDS method. Its material coefficients are:

| Material | Coefficient |
|---|---:|
| Concrete | `0.65` |
| Reinforcement and prestressing steel | `0.90` |

KDS requires the resulting design material strengths to replace the corresponding strengths in
the concrete, reinforcement, and prestressing stress-strain relations. Consequently:

- `0.65` and `0.90` are **material-strength coefficients**, not one final scalar for the entire
  P-M resultant;
- reinforcement coefficient `0.90` is not chosen by tension versus compression; it applies to the
  reinforcement/prestressing strength within the Appendix scope;
- concrete tension treatment remains whatever the verified KDS ULS material law prescribes;
- do not also apply the basic KDS `phi` values; the two methods are alternatives;
- compute and store a characteristic/nominal reference evaluation for audit, then independently
  evaluate the Appendix design material laws at the same state.

The UI label shall be `KDS 14 20 20:2022 — Appendix material-factor method`, not merely `KDS`.

## 7. Other standard families

The registry shall reserve separate, non-inheriting profiles for the following families. Their
format is integrated here; numeric coefficients cannot enter production until the exact licensed
edition, amendment, jurisdiction, and clause set pass the verification gates in file `09`.

| Profile family | Resistance format | Integration rule |
|---|---|---|
| ACI 318-19(22) | `globalResultantFactor` | Use the state-dependent factor for moment, axial force, or combined P-M from Table 21.2.2, followed by separately traced axial limits. Official ACI guidance reproduces `0.65` for other compression-controlled members, `0.75` for qualifying spirals, transition interpolation, and `0.90` for tension-controlled sections. |
| ACI CODE-318-25 | separate edition-specific profile | Do not copy the 318-19 table automatically. Verify Chapter 21 and all P-M limits against the licensed 2025 text before status can exceed `draft`. |
| EN 1992-1-1:2023 | `designMaterialReevaluation` | Derive design concrete/reinforcement laws from characteristic properties, partial factors, and every Nationally Determined Parameter in the selected National Annex. Do not add an ACI/KDS-style global factor unless that edition/annex explicitly requires it. |
| CSA A23.3 edition selected by jurisdiction | edition-specific material/design-resistance profile | Keep concrete and reinforcement resistance treatment separate and verify stress-block, strain, prestress, and axial-cap rules from that edition. No KDS coefficient fallback is permitted. |
| AS 3600:2018 plus selected amendments | edition-specific capacity-reduction profile | Evaluate nominal section capacity, then apply the code's action/state-dependent capacity reduction and axial limits. Exact values and ductility/state logic must come from the purchased governing text. |

The first production release should enable only profiles whose `status` is `verified`. Draft rows
may be visible in a developer registry but must be rejected by certification/report APIs.

Current material UI support for `KDS`, `ACI318`, `EC2`, and `CUSTOM` is not this registry. It is a
serializable material-source layer that chooses stress-strain families and stores their parameters.
For EN 1992 preview, `alpha_cc`, `gamma_c`, and `gamma_s` are applied inside the material laws, so a
later EN resistance profile must recognize that it is using a design-material reevaluation path and
must not apply another global ACI/KDS-style factor. For the implemented ACI 318-19(22)
equivalent-block preview, material definitions store Whitney/block-family data while
`@pm/code-aci318` and `@pm/design` evaluate state-dependent `phi` and the axial cap. An ACI
stress-strain/fiber calculation profile is not implemented.

## 8. ACI 318-19(22) transition example

For a reviewed ACI 318-19(22) implementation, the state factor for combined moment and axial force
is based on net tensile strain at nominal strength and the transverse-reinforcement class:

```text
compression-controlled:
  epsilon_t <= epsilon_ty
  qualifying spiral -> phi = 0.75
  other              -> phi = 0.65

tension-controlled:
  epsilon_t >= epsilon_ty + 0.003 -> phi = 0.90

transition, epsilon_ty < epsilon_t < epsilon_ty + 0.003:
  qualifying spiral -> phi = 0.75 + 0.15*(epsilon_t-epsilon_ty)/0.003
  other              -> phi = 0.65 + 0.25*(epsilon_t-epsilon_ty)/0.003
```

These numbers are an edition-specific profile, not generic defaults. The transition bounds,
definition of net tensile strain, axial maximum-strength limits, prestressing effects, and material
scope must be taken from the same ACI edition. `ACI 318-25` must not resolve to this profile.

## 9. Required execution order

```text
exact geometry + selected standard profile
        |
        v
admissible ultimate strain state s
        |
        +--> reference/nominal material evaluation
        |       -> nominal resultants + contribution ledger
        |
        +--> one declared resistance format
                - global resultant factor, or
                - design-material reevaluation, or
                - proven contribution transform, or
                - explicitly ordered hybrid
        |
        v
design resultant at state s
        |
        v
adaptive design-surface refinement
        |
        v
code-specific domain caps and topology revalidation
        |
        v
factored demand versus design resistance
```

Adaptive refinement must be run on the design surface even when the nominal surface converged.
State-dependent factors and design-material yield points can introduce new kinks.

## 10. Anti-double-reduction invariants

Every profile and every design state must satisfy:

1. exactly one top-level `methodId` is active;
2. every reduction stage has a unique stage ID and clause trace;
3. the basic KDS method rejects KDS Appendix material coefficients;
4. the KDS Appendix method rejects the basic KDS global strength-reduction factor;
5. ACI factors cannot be combined with KDS/CSA/EN material coefficients;
6. `designResistance` is generated once and is immutable;
7. a report cannot multiply a stored design result again;
8. changing UI display units cannot trigger resistance evaluation.

Violations are `DOUBLE_REDUCTION`, `MIXED_STANDARD_METHODS`, or
`UNTRACEABLE_RESISTANCE_STAGE` fatal errors.

## 11. Verification matrix for each profile

Before a profile is `verified`, test at least:

- pure compression, balanced/transition states, tension-controlled bending, and pure tension;
- both principal bending directions and biaxial states for asymmetric reinforcement;
- every exact factor/partial-factor breakpoint from both sides;
- each allowed transverse-reinforcement classification;
- every axial cap and the resulting triangulated cap face;
- equality of nominal totals and their contribution-ledger sums;
- independent recomputation of design-material stress laws at elastic, yield-transition, plateau,
  and ultimate strains;
- anti-double-reduction and cross-edition rejection tests;
- published or authority-approved examples with clause-by-clause calculation traces;
- independent professional review by a structural engineer familiar with that exact standard.

## 12. Normative/source anchors

- Official KCSC notice for the 2024 concrete-code partial revision, MOLIT Notice 2024-879:
  <https://kcsc.re.kr/board/notdetail/6639>
- Official KDS 14 20 10 viewer, especially 4.2.3:
  <https://www.kcsc.re.kr/standardCode/viewer/KDS%2014%2020%2010:2022-01-11>
- Official KDS 14 20 20:2022 viewer, Appendix 2.1 and 2.2:
  <https://www.kcsc.re.kr/standardCode/viewer/KDS%2014%2020%2020:2022-01-11>
- Official ACI code-edition listing for ACI CODE-318-25:
  <https://www.concrete.org/publications/typesofpublications/standards%28codesandspecs%29/suiteofcodes.aspx>
- ACI's official technical Q&A reproducing ACI 318-19(22) Table 21.2.2 for moment, axial force,
  and combined P-M:
  <https://www.concrete.org/publications/getarticle.aspx?m=icap&pubid=51740277>
- European Commission/JRC overview of Eurocode 2 and National Annex implementation:
  <https://eurocodes.jrc.ec.europa.eu/EN-Eurocodes/eurocode-2-design-concrete-structures>
  and <https://eurocodes.jrc.ec.europa.eu/en-eurocodes-implementation/national-standards>

Source access alone does not make an adapter verified. The profile-specific traceability bundle
must identify every implemented clause, edition, amendment, interpretation, test, and reviewer.

## 13. Implemented preview boundary (2026-08-04)

The repository implements two independent mechanics and the common resistance formats:

- stress-strain integration for the KDS current profile;
- exact equivalent rectangular blocks for KDS 14 20 20 and ACI 318-19(22);
- `globalResultantFactor` for those KDS and ACI calculation profiles;
- a `designMaterialReevaluation` basis exists for EN 1992-1-1:2004 preview work, but EC2 is not yet
  exposed as a complete calculation profile in the main selector.

Canonical project schema-v1 exports persist the complete basis and loadcases are explicitly
factored ULS actions. The parser's remaining omitted-field defaults are listed as pre-release debt
in `development/02` and `development/06`.
The result DTO contains both `nominalPoints` and governing design `points`. Analysis Options owns
the model-specific sampling controls, factors, transverse-reinforcement class, and optional axial cap.
The single calculation-profile selection itself lives in Materials and updates these defaults atomically.
Results does not edit that basis. The 3D plot uses a light Nominal/Design radio selector and renders
only one surface at a time. The two-dimensional plots may show both curves; when both are visible,
nominal is a faint dashed reference, while a single visible curve receives the primary blue line
and red diagnostic points. All Mx-My point connections use explicit straight-line segments.
The loadcase table uses
the three-dimensional proportional demand-ray intersection with the design surface; the Fixed-P
ratio is diagnostic only. The stress-strain Excel export records the exact profile and check in
`Design_Check`. The equivalent-block export provides its own block/steel ledgers, clipped-polygon
reconciliation, resistance stages, and solver evidence.

Both mechanics now compute `My = sum(F*(x-x0))`; the project DTO, bridge, UI, report model, and
workbook formulas carry that value without a mechanics-specific transform. Asymmetric-section tests
verify the sign independently for concrete and steel contributions. This closes the sign mismatch,
but does not by itself satisfy the separate acceptance and profile-verification gates below.

Implementation details and automated evidence are in
[`development/07-design-resistance-implementation.md`](development/07-design-resistance-implementation.md).

These profiles are all marked `draft`; none is `reviewed` or `verified`. The software must continue
to reject any claim of certified code compliance until the
profile verification matrix, jurisdiction/annex selection, and independent professional review are
complete.
