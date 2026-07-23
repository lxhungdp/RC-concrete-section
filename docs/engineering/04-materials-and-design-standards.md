# Materials and Design-Standard Rules

## 1. Separate three concepts

The product shall not collapse these concepts into one `standard` dropdown:

1. **Material definition** — serializable parameters/curve data and engineering source.
2. **Material evaluator** — runtime stress, tangent, breakpoints, components, and admissibility
   compiled from a validated definition.
3. **Design-code resistance profile** — exact standard identity, method, applicability,
   classifications, ultimate strain domain, resistance format, factors/caps, and clause trace.

A material tagged `KDS`, `ACI318`, or `EC2` is not proof that a complete code check is implemented.
The exact document, edition, amendment, jurisdiction or National Annex, and `methodId` belong to the
design basis/profile.

## 2. Material definition requirements

Every definition is immutable after normalization, serializable, finite, and versioned. It records:

- role (`concrete` or `reinforcement`), stable ID, and display name;
- model kind and all authoritative parameters;
- compression-positive sign convention and canonical stress/strain units;
- lower/upper behavior outside the curve or an explicit domain error policy;
- admissible strain range and all breakpoints;
- source/profile metadata and verification status;
- derivation rule for every computed property.

Do not independently store values that can contradict one another, such as `fy`, `Es`, `epsY`, and
curve points. One authoritative definition derives the others, or validation proves agreement within
an approved tolerance.

## 3. User-defined curves

A curve requires at least two finite points with strictly increasing strain. Duplicate strains,
implicit discontinuities, and empty curves are errors. Tension behavior, extrapolation on both ends,
rupture, and admissible limits are explicit.

Compilation may pre-sort only after validation has established a deterministic normalized order. A
runtime evaluator shall not sort and allocate on every stress call. Tangents are analytical segment
slopes with a documented one-sided convention at kinks; a fixed finite-difference tangent is not an
accepted production default.

## 4. Concrete and steel behavior

Concrete ULS laws, service-response laws, and equivalent rectangular stress blocks are not
interchangeable. A service elastic modulus is not inferred from an ultimate stress block unless the
governing model explicitly defines that use.

Steel laws must define elastic behavior, yield transition, hardening/plateau, and ultimate strain or
extrapolation policy. Compression/tension symmetry is an explicit model property, not a universal
assumption.

Evaluation outside an admissible ultimate strain does not silently return zero. It returns a typed
domain failure unless the selected law explicitly defines post-ultimate behavior for the analysis
mode.

## 5. Current implementation assessment

| Current model/helper | Code status | Engineering use until hardened/verified |
|---|---|---|
| KDS parabolic concrete and derived values | implemented preview | curve preview and regression only; exact profile/clauses and domain behavior still require verification |
| elastic-perfectly-plastic steel | implemented preview | usable only in non-certified development fixtures |
| bilinear steel | implemented preview | hardening/ultimate range and kink behavior require validation |
| EC2 parabolic-rectangular concrete | implemented preview | generic model family, not an edition/National-Annex profile |
| user curves | implemented preview | blocked from accepted analysis until strict curve/extrapolation validation exists |
| ACI Whitney helper | implemented but not analysis-valid | current evaluator ignores `beta1` in local stress integration; it must be redesigned as a code-specific equivalent-block operation or replaced by a verified fiber law |

The current compiler also uses silent fallbacks and numerical tangents. Those behaviors are allowed
for UI preview only and shall not enter an accepted result.

The current project schema stores one concrete definition (`id = 1`) and multiple steel definitions.
That is the supported persisted v2 scope. A future multi-concrete-region capability requires a
versioned mapping/migration; it shall not infer material assignment by array order.

## 6. Nominal/reference and design resistance

For every ULS surface state:

1. construct an admissible strain state from exact geometry and the selected profile;
2. evaluate and retain `nominalReference` with a contribution ledger;
3. apply exactly one profile-declared resistance format;
4. apply that method's caps/domain operations;
5. revalidate the design resistance domain.

Permitted resistance formats are:

- global resultant factor;
- design-material reevaluation at the same strain state;
- contribution-factor transform with proof of factorability;
- explicitly ordered hybrid method.

Material partial factors and a global strength-reduction factor are not interchangeable. Basic and
alternative methods from the same standard are mutually exclusive unless the governing profile
explicitly proves an ordered hybrid requirement.

The detailed sequencing contract is in
[`../11-design-standards-and-resistance-formats.md`](../11-design-standards-and-resistance-formats.md).

## 7. Acceptance gates

| ID | Gate |
|---|---|
| `ENG-MAT-001` | strict definition/schema/range validation passes |
| `ENG-MAT-002` | compiled evaluator is deterministic, total over its declared domain, and exposes breakpoints/components/admissibility |
| `ENG-MAT-003` | bar and region material references resolve uniquely |
| `ENG-MAT-004` | exact standard profile identity and applicability are complete |
| `ENG-MAT-005` | clause trace, breakpoints, authoritative examples, and independent engineering review pass |
| `ENG-MAT-006` | contribution ledger reproduces totals and anti-double-reduction tests pass |
| `ENG-MAT-007` | ULS and service material sets cannot be mixed by type or orchestration |

Until an entire profile passes these gates, the UI may show it only with a persistent preview or
unverified label and report release remains blocked.
