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

`@pm/project` persists `inputs.design` directly in strict project schema version 1. There is no
migration or profile inference layer; `calculationProfileId`, materials, analysis options, and the
DesignBasis must be mutually consistent in the v1 document.
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

For a design-material profile, reference and design laws are independently evaluated at the same
stored strain state. No global scalar is inferred from the final resultants.

The maximum axial-compression operation is applied after the state factor. A row crossing is
interpolated and clipped stations are projected onto radial rings between the axial centre and that
crossing. This closes the horizontal cap face, including the pure-compression demand ray, while
beta/station IDs remain stable. Capped design vertices therefore represent a domain boundary and
need not retain the uncapped nominal strain state with the same ID.

## 3. Governing utilization

The primary section utilization is a ray intersection in normalized `(P, Mx, My)` coordinates:

```text
capacity = lambda * (Pu, Mux, Muy)
UR_3D = 1 / lambda
adequate when UR_3D <= 1
```

Normalization affects only numerical conditioning; the returned capacity is in physical units.
The Fixed-P Mx-My intersection is retained as a secondary diagnostic and is reported separately as
`fixedPUtilization`. It is not the governing value in the loadcase table.

This is a **section-strength** check. It does not include member slenderness, second-order effects,
stability, load generation, accidental eccentricity, seismic detailing, or serviceability.

## 4. UI behavior

The Results sidebar contains `Design resistance` directly below `Result Status`.

- Selecting a profile restores its declared defaults.
- Editing any factor marks the profile `modified` and `draft`.
- A modified profile cannot be applied without an override reason.
- The selected profile is persisted and invalidates/rebuilds the result surface.
- Fixed-P and Vertical Slice charts show `Design` and `Nominal` layers. Both are independently
  switchable; Design is on by default.
- Loadcase rows state that actions are factored ULS and display governing `3D UR`.
- Loadcase detail shows the secondary Fixed-P UR and the controlling global factor or
  design-material method.

## 5. Workbook audit trail

Excel export uses the same design basis and design surface as the UI. `Design_Check` records:

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

## 6. Implemented profiles and release status

| Profile | Format | Software status |
|---|---|---|
| KDS 2024 current set; resistance clauses KDS 14 20 10:2021 + KDS 14 20 20:2022 | global resultant factor | `draft` preview |
| ACI 318-19, reapproved 2022 | global resultant factor | `draft` preview |
| EN 1992-1-1:2004 default recommended factors, no National Annex | design-material reevaluation | `draft` preview |

No profile is marked `reviewed` or `verified`. Results and workbooks must not be represented as
certified or released design output
until the verification matrix in the engineering specification is complete and a competent
engineer approves the exact project jurisdiction and code edition.

## 7. Automated evidence

`packages/pm-analysis/src/design-resistance.test.ts` covers:

- compression, transition and tension factor breakpoints;
- removal of embedded material factors for global-factor profiles;
- paired nominal/design topology and global ledger scaling;
- axial-cap application;
- design-material reevaluation;
- 3D proportional demand-ray utilization.

The project round-trip test covers schema version 1, factored ULS action basis and design-profile
persistence. Full project verification is `npm test`, followed by `npm run build`.

## 8. UI ownership and display contract

- `Analysis Options` owns the persisted design-code profile, factors, transverse-reinforcement
  classification, and the optional maximum axial-compression limit.
- The sidebar separates `Points`, `Mesh`, and `Design Resistance` into tabs. All three groups update
  their canonical project inputs directly; Design Resistance has no separate Apply button.
- Disabling only the maximum axial limit is an analysis option and does not require an override
  reason. Editing a code coefficient or reinforcement classification still requires one.
- `Results` consumes the applied basis. Its 3D P-Mx-My chart shows either Nominal or Design,
  selected by radio button, never both at once.
- Fixed-P Mx-My and Vertical Slice may show both curves. Nominal is faint/dashed only while Design
  is also visible. If either curve is shown alone, it uses the blue primary line and red station
  markers.
- Plotly line traces explicitly use linear point-to-point interpolation with gap connection
  disabled.

The 2024 KDS profile label follows MOLIT Notice 2024-879. That partial revision changes KDS
14 20 52 and adds KDS 14 20 68; the draft resistance coefficients remain attributed to the exact
KDS 14 20 10:2021 and KDS 14 20 20:2022 documents.
