# Design-Resistance Implementation

Status: **implemented preview; not a certified design-code adapter**.

This document describes the code that separates nominal/reference section mechanics from the
resistance used for a factored ULS check. The engineering requirements remain authoritative in
[`../11-design-standards-and-resistance-formats.md`](../11-design-standards-and-resistance-formats.md).

## 1. Data and package ownership

`@pm/design` owns:

- exact profile identity: organization, document, edition, method ID and profile version;
- resistance format;
- profile factors and transverse-reinforcement classification;
- modified-profile status and mandatory override reason;
- construction of reference, state and design material sets;
- state-dependent global-strength-reduction evaluation.

`@pm/project` writes `inputs.design` directly in the canonical project schema version 3, retaining explicit v1/v2 readers. DesignBasis
version 2 replaced the old EN-only scalar fields with standard-neutral factor expressions; version
3 corrects the EN domain-5 pure-compression endpoint from `eps_cu2` to the `eps_c2` point-C pivot.
The parser migrates both legacy forms. As a documented version-specific parser rule, a missing basis is synthesized;
canonical exports always contain it. `calculationProfileId`, materials, analysis
options, and the DesignBasis must be mutually consistent after parsing.
Every load combination is explicitly tagged `actionBasis: "factoredULS"`.

`@pm/analysis` owns the immutable calculation pipeline and never reads factors from UI controls
directly.

## 2. Calculation pipeline

```text
source materials + exact DesignBasis
              |
              v
buildResistanceMaterialSets
  - state materials
  - nominal/reference materials
  - design materials
              |
              v
one strain-state topology on one section mesh
              |
       +------+------+
       |             |
       v             v
reference ledger   declared resistance method
                  - global resultant factor, or
                  - design-material reevaluation
       |             |
       +------+------+
              v
maximum axial domain operation, when enabled
              |
              v
PreviewSurface
  - nominalPoints: audit/reference surface
  - points: governing design-resistance surface
              |
              v
factored ULS demand ray / design surface
              |
              v
3D proportional UR = 1 / lambda
```

For a global-resultant profile, embedded `gammaC` and `gammaS` fields are removed before nominal
evaluation. One state factor is then applied to the complete ledger (`concrete`, `steelGross`,
`displacedConcrete`, `steel`, and `total`). This is the anti-double-reduction boundary.

For a design-material profile, reference and design laws are independently evaluated on the same
declared strain-domain topology. No global scalar is inferred from the final resultants. The
standard-neutral expression compiler supports ordered multiply/divide components, so KDS
`fcd=0.65fck`, `fyd=0.90fyk` and EN `fcd=alpha_cc fck/gamma_c`, `fyd=fyk/gamma_s` use one pipeline.
Only strength ordinates are changed: steel `Es` and characteristic concrete strain parameters are
not scaled.

The KDS Appendix route implements the 3.1 strain domains: uniform compression reaches
`epsilon_c0`; an internal neutral axis reaches `epsilon_cu`; and an outside neutral axis uses the
continuous all-compression pivot between those limits. A concrete definition without `epsilon_c0`
is an `AnalysisInputError` with code `INVALID_MATERIAL`, not a fall back to `epsilon_cu`.

Both mechanics close the Appendix design surface on the 3.2(1) equations (3-2)/(3-3) design axial
strength, which carries no `eta` and is therefore model independent. `createKds142020Model` selects
that pole through `surfaceCompressionPole`; the `eta`-reduced concentric block limit remains
available as `physicalCompressionEndpoint` and still closes the Main-body surfaces, where the
maximum-axial cap removes the band. When `eta < 1` the prepared block analysis reports
`appendixPoleDivergesFromBlockLimit` and the preview surface warns that the final band up to the
pole is an interpolation.

`e_min = 15 + 0.03h` is applied to demand, and the route has neither a global resultant factor nor
the Main-body maximum-axial cap. `minimumEccentricityCandidates` in `@pm/design` is the single
implementation for both mechanics. For biaxial nonzero moment, `h` is the section depth projected on
the demand eccentricity direction; a zero-moment axial demand yields one candidate per principal
axis. The governing candidate is resolved by design-surface proportional utilization:
`checkLoadcaseUtilizationFromSurface` owns that choice, and `solveInversePreviewFromPrepared`
receives it through `codeAdjustedDemandOfCheck` so the reported equilibrium state belongs to the
demand that was checked. Selecting with the inverse's own fixed-P ratio made the two mechanics
report different principal axes for the same section.

The nonzero-biaxial projected-depth rule is a documented implementation interpretation. It is not
yet verified as equivalent to applying the Appendix minimum separately about both principal axes,
including all moment-sign combinations. That clause interpretation is a release blocker for the
Appendix route; the product must continue to label it `draft` preview.

The maximum axial-compression operation is applied after the state factor as the exact half-space
intersection of the sampled domain. Original permitted vertices/faces remain unchanged, actual
source-edge intersections are inserted and the cap boundary is triangulated. Geometric cap vertices
carry explicit provenance and no unique physical strain state. See development/15 for its oracles.

## 3. Governing utilization

The primary section utilization is a ray intersection in normalized `(P, Mx, My)` coordinates:

```text
capacity = lambda * (Pu, Mux, Muy)
UR_3D = 1 / lambda
classify the UR interval as adequate / indeterminate / inadequate
```

Every Fixed check uses the shared `@pm/results` 2% screening policy by the project decision
recorded in engineering/05 section 4. Its measured scope is stress-strain proportional sampling;
the use for other mechanics/domains/bases is explicitly unvalidated. It is not an error bound.
Adaptive mode uses its station and direction error evidence. Only an interval wholly below
`UR = 1` is adequate; only one wholly above it is inadequate.

Normalization affects only numerical conditioning; the returned capacity is in physical units.
The default check basis is `proportional3D`; Fixed-P is then a separate secondary diagnostic.
With an explicit `constantAxial` project basis, the qualified Constant-P query governs and the
proportional ratio is secondary. Engineering/05 owns all qualified/unavailable outcomes.

This is the **Stage 1: Section Resistance Only** check. It does not include member slenderness, second-order effects,
stability, load generation, accidental eccentricity, seismic detailing, or serviceability.

## 4. UI behavior

`Resistance` is the third tab in the top-level `Options` workspace. It is not
duplicated in Capacity.

- Selecting a profile restores its declared defaults.
- Materials is the sole editor for concrete/reinforcement material factors and, for non-AS
  global-factor profiles, transverse-reinforcement class and the axial-compression cap. Resistance
  does not repeat these fields or provide a full-profile reset that could overwrite them.
- Resistance edits the active compression factor, tension factor and applicable transition rule.
  It retains the AS compression-factor class because Materials has no AS class input; AS does not
  display the unused common-schema strain transition. An inactive compression-class coefficient
  remains stored but is not another editable field. Design-material routes expose only their
  declared minimum-eccentricity inputs here, when present.
- A missing required override reason remains enterable in Resistance. A reason already entered in
  Materials is retained without another populated editor. AS retains its reason editor here as its
  sole input location. A reason started in Resistance remains editable for that panel session.
- Editing any factor marks the profile `modified` and `draft`.
- A modified code coefficient is not published to canonical state until an override reason makes it
  valid. Reinforcement classification and disabling only the optional axial cap are explicit
  analysis choices and do not require that reason.
- The selected profile is persisted and invalidates/rebuilds the result surface.
- Fixed-P and Vertical Slice charts show `Design` and `Nominal` layers. Both are independently
  switchable; Design is on by default.
- Loadcase rows state that actions are factored ULS and display the governing UR for the declared check basis.
- Loadcase detail shows the secondary Fixed-P UR and the controlling global factor or
  design-material method.

## 5. Workbook audit trail

For the stress-strain pipeline, Excel export uses the same design basis and design surface as the
UI. `Design_Check` records:

- exact profile identity and status;
- all active factors and classifications;
- override reason;
- action basis;
- governing and secondary utilization;
- design capacity point;
- controlling factor/classification and tensile strain when applicable.

Detailed fibre/bar sheets audit the constitutive evaluation. For a global-resultant method they
remain the nominal/reference ledger and `Design_Check` records the separate global factor. For a
design-material method they evaluate the design material laws directly.

Equivalent-block result export uses its dedicated clipped-block ledger: clipped area/centroid,
`c`, `a`, `beta1`, block stress, compatible bar strains, resistance stages, admissibility, and
exact-refinement evidence. For the KDS Appendix it publishes reduced concrete/steel strengths and
an identity resultant factor, preventing the workbook from applying `phi` a second time.

## 6. Implemented profiles and release status

| Profile | Format | Software status |
|---|---|---|
| KDS 2024 current set; resistance clauses KDS 14 20 10:2021 + KDS 14 20 20:2022 | global resultant factor | `draft` preview |
| KDS 14 20 20:2022 Appendix, independently selectable for either KDS mechanics | design-material reevaluation; Appendix 3.1 strain domains; minimum eccentricity | `draft` preview |
| ACI 318-19, reapproved 2022 | global resultant factor | `draft` preview |
| EN 1992-1-1:2004 default recommended factors, no National Annex | selectable stress-strain/design-material profile with an explicit non-EC2 strain-domain warning | `draft` preview only |
| AS 3600:2018 incorporating Amendments 1 and 2 | equivalent rectangular block with `alpha2`, `gamma`, concrete strain `0.003`, and Table 2.2.2 axial/bending capacity-factor interpolation | `draft` preview only |

No profile is marked `reviewed` or `verified`. Results and workbooks must not be represented as
certified or released design output
until the verification matrix in the engineering specification is complete and a competent
engineer approves the exact project jurisdiction and code edition.

## 7. Automated evidence

`packages/pm-analysis/test/design-resistance.test.ts` covers:

- compression, transition and tension factor breakpoints;
- removal of embedded material factors for global-factor profiles;
- paired nominal/design topology and global ledger scaling;
- axial-cap application;
- design-material reevaluation;
- exact KDS Appendix concrete/steel ordinate ratios, unchanged steel modulus, 3.1 strain domains,
  absence of global factor/cap, and minimum-eccentricity demand adjustment;
- independent hand evaluation of Appendix equations (3-2) and (3-3) against the surface compression
  pole, run at `fck = 30` and `fck = 60` so the `eta < 1` case is exercised, and at `fy = 400` and
  `fy = 600` so both clause branches are exercised. The same fixture matrix runs against the
  equivalent block in `packages/pm-analysis-equivalent-block/test/integration.test.ts`;
- the typed rejection of a concrete definition with no `epsilon_c0` under the Appendix route, and
  its continued acceptance under the Main body;
- agreement between the loadcase-table check and the inverse solver on the governing
  minimum-eccentricity principal axis, and the untouched raw-demand path when the clause does not
  bite or the demand is tensile;
- KDS Main-versus-Appendix comparison at pure tension, compression, and zero axial force;
- EN recommended-factor regression and legacy scalar-factor migration;
- 3D proportional demand-ray utilization.

The project round-trip tests cover canonical v3 and explicit v1/v2 readers, factored ULS action basis and design-profile
persistence. Full regression is `npm test`, followed by `npm run build`; block-specific verification
also runs through `npm run bench:equivalent-block` and `npm run bench:pipelines`.

## 8. UI ownership and display contract

- `@pm/design` owns the persisted resistance basis. Materials edits material factors and the
  non-AS reinforcement-class/axial-cap inputs. Options > Resistance edits only the remaining active
  resultant-factor/transition or minimum-eccentricity inputs, plus the AS compression-factor class.
- The sidebar separates `Points`, `Mesh`/`Block`, and `Resistance` into tabs. All three groups update
  their canonical project inputs directly; Resistance has no separate Apply button.
- Reinforcement classification and disabling only the maximum axial limit are analysis options and
  do not require an override reason. Editing a code coefficient still requires one.
- `Capacity` consumes the applied basis. Its 3D P-Mx-My chart shows either Nominal or Design,
  selected by radio button, never both at once.
- Fixed-P Mx-My and Vertical Slice may show both curves. Nominal is faint/dashed only while Design
  is also visible. If either curve is shown alone, it uses the blue primary line and red station
  markers.
- Plotly line traces explicitly use linear point-to-point interpolation with gap connection
  disabled.

The 2024 KDS profile label follows MOLIT Notice 2024-879. That partial revision changes KDS
14 20 52 and adds KDS 14 20 68; the draft resistance coefficients remain attributed to the exact
KDS 14 20 10:2021 and KDS 14 20 20:2022 documents.
