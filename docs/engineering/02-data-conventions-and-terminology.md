# Engineering Data, Conventions, and Terminology

## 1. Canonical units

Canonical project exports use version 3 with an explicit load reference and stored rebar area;
the reader retains centroidal version 2 and diameter-only version 1 contracts.
Design-basis version 3, analysis-options version 1, both
`*-surface-v1` method IDs and the declared station schedules are unchanged. Version-specific
parsing and legacy area materialization do not change these units:

| Quantity | Canonical unit |
|---|---|
| length, coordinate, bar diameter | mm |
| area | mm² |
| stress, elastic modulus | MPa = N/mm² |
| force `P` | N |
| moment `Mx`, `My` | N·mm |
| strain | dimensionless |
| angle | rad internally |

These units are explicit through the schema contract even though it does not repeat unit fields in
every object. External import/UI adapters may accept other units only when the source unit is
declared and converted once at the boundary. Values must never be interpreted by magnitude.

Results and reports store the canonical units and may add presentation-unit metadata. Display-unit
changes shall not rerun or alter resistance calculations.

### Selectable presentation units

`packages/pm-units` owns the P-M boundary adapter over the pinned shared jscad unit definitions.
`UNITS-001`: canonical project, worker and mechanics values retain the units above.
`UNITS-002`: presentation selection is immutable, versioned UI preference outside engineering input.
Changing it retains canonical inputs, results, surface handles and analysis cache identities.
`UNITS-003`: authored numeric text converts once using its captured quantity/unit context; an
unchanged edit retains the original binary64 value exactly. Blank, unknown, incompatible,
non-finite and unrepresentable input fails explicitly. Rounding is presentation only.
Resting inputs may show compact rounded copies. Focus starts from the full-precision editing
representation; an unchanged edit must never commit the rounded resting text.
`UNITS-004`: every displayed quantity and interchange field declares its actual unit. Length
powers and curvature use their dimensions; mass density is not unit weight.
`UNITS-005`: JSON and drawing contracts retain canonical units; editable unit-aware workbooks
declare their own versioned source units, independent of the active UI preference.
`UNITS-006`: reports and plots convert presentation copies only. Audit ledgers retain explicitly
declared calculation units, with selected-unit summary views. No conversion changes signs,
code/profile selection, resistance stages or adequacy.

The implementation decision and verification packet are in
[`../development/10-display-units.md`](../development/10-display-units.md).

## 2. Coordinates, signs, and moments

- global `X` is positive right and global `Y` is positive up;
- compression strain, compression stress, and compression axial force are positive;
- tension values are negative;
- the reference origin is explicit and immutable during one analysis;
- the default analysis origin is the exact net-concrete geometric centroid; a user origin is
  allowed only when stored with the transformation;
- internally, angles are radians and positive counter-clockwise unless a named adapter states its
  input mapping.
- a sampled strain-plane angle is not a demand-moment angle. Strain-domain angles parameterize the
  boundary states used to generate the surface; demand angles are computed from the action vector as
  `thetaLoad = atan2(My, Mx)` and are used only for geometric queries of the finished surface.

The physical section view and the `Mx-My` action-space view do not use the same plotted vector. Do
not compare a neutral-axis angle directly with `thetaLoad = atan2(My,Mx)`, which lives in `Mx-My`
action space.

The generalized strain plane is:

`ε(x,y) = ε0 + κx·y + κy·x`

Both the stress-strain backend `@pm/analysis` and the equivalent-block backend
`@pm/equivalent-block` compute resultants about the declared origin as:

`P = ∫σ dA`, `Mx = ∫σ y dA`, `My = ∫σ x dA`.

If the new origin is offset by `(Δx, Δy)` from the old origin,
with new coordinates
`x' = x - Δx`, `y' = y - Δy`:

`Mx' = Mx - P·Δy`, `My' = My - P·Δx`.

The load-reference editor uses parallel axes at `O = C + (Δx, Δy)`, relative to the exact
net-concrete centroid C. Project, worker, Direct/Fixed-P/3D chart and result combinations remain
centroidal. Only load-input copies use the transformation above; an authored action at O converts once with the inverse transform.
An explicit Apply commits the draft reference. Draft edits may preview the load axes on the
section drawing; they do not move the centroid, neutral axis or action-space chart frame. With Convert existing loadcases selected, preserve
the canonical actions exactly and re-express the inputs at O. Without Convert, preserve the old
displayed numbers by adding `P·(Δy_new−Δy_old)` and `P·(Δx_new−Δx_old)` to the canonical moments.
P is unchanged. The checkbox defaults off and is editing state, not an analysis option. One
transaction changes the applied reference and existing combinations; no per-loadcase history is
needed. Canonical v3 records the applied reference; v1/v2 readers declare zero offset. See
[the implementation packet](../development/16-load-reference-origin.md).

The section-coordinate direction associated with a resultant is `(My,Mx)` and its perpendicular
reference line is `(-Mx,My)`. The section-angle UI implements this mapping for both mechanics.

The project-v1 `LoadCombination`/result DTO stores the same canonical components. No
mechanics-specific sign conversion is permitted in the bridge, demand solvers, plots, report model,
or exports. An asymmetric exact-block regression checks the concrete and reinforcing-steel `My`
terms separately; this prevents symmetric geometry from masking a future sign error.

Historical audit loads that were generated directly from the former block kernel used its opposite
`My` component. Those generated fixtures are migrated with `My_new = -My_legacy`; this reflection
preserves the physical demand ray, load factor, utilization, and residual norm. Do not apply that
migration blindly to user-entered loads that already followed the UI/project convention.

## 3. Required terminology

| Term | Meaning |
|---|---|
| `raw input` | user/import data before complete validation |
| `normalized geometry` | immutable, oriented, topology-checked geometry in the analysis frame |
| `material definition` | serializable data describing a uniaxial material law and its limits/source |
| `compiled material` | runtime evaluator derived from one validated definition; never persisted |
| `design basis` | exact standard identity, method, jurisdiction choices, classifications, and options |
| `demand` | action vector to compare or equilibrate, with explicit action basis |
| `strainPlaneAngle` | parameter used by a strain-domain adapter to generate a compatible boundary state |
| `momentDirectionAngle` | angle of a demand or resistance vector in the `Mx-My` plane, measured from `Mx` |
| `nominalReference` | auditable reference resultant at a stored ULS strain state |
| `designResistance` | resultant permitted for comparison with factored ULS demand |
| `utilization` | named comparison metric; the default is proportional 3D load scaling |
| `accepted result` | converged result that passed all required engineering gates |
| `preview` | non-acceptance visualization or partial diagnostic output |

Avoid bare labels such as `factor`, `factored`, `strength`, or `loadcase result` when their basis is
ambiguous. Use `globalStrengthReduction`, `designMaterialStrength`, `factoredULSDemand`, and
`loadCombinationResult` as applicable.

## 4. Identity and traceability

Entity IDs are stable positive integers within a declared namespace. Display order is not identity.
Geometry regions, holes, points, bars, material definitions, cases, combinations, and result records
have separate namespaces unless a schema explicitly declares otherwise.

Every accepted calculation preserves:

- original input snapshot and normalized representation;
- schema version and any explicit parser normalization/repair warnings;
- profile, method, adapter, and material-model versions;
- entity IDs needed to trace warnings and contributions;
- expanded options and tolerances;
- engine and numerically relevant dependency versions;
- timestamps, input/result hashes, and review state.

Names are user-facing labels and are never used as foreign keys.

## 5. Finite and typed data policy

All public numeric values must be finite. `NaN`, `Infinity`, empty strings converted to zero, and
sentinel extreme numbers are not valid engineering states. Lengths, diameters, areas, elastic
moduli, strengths, limits, and resource counts must satisfy model-specific ranges.

Validation returns issues with stable code, severity, path/entity ID, safe message, and technical
context. A warning cannot override an error. Automatic repairs are allowed only in an explicit
import-repair preview and must be disclosed; accepted analysis uses the repaired snapshot as a new
v1 input snapshot, never an invisible mutation.
