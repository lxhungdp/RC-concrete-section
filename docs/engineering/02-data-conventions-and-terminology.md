# Engineering Data, Conventions, and Terminology

## 1. Canonical units

The current `pm-column-project` schema version 1 uses one fixed canonical system. The pre-release
project has no version-migration layer; limited omitted-field/default normalization in the current
parser is documented separately and does not change these units:

| Quantity | Canonical unit |
|---|---|
| length, coordinate, bar diameter | mm |
| area | mm² |
| stress, elastic modulus | MPa = N/mm² |
| force `P` | N |
| moment `Mx`, `My` | N·mm |
| strain | dimensionless |
| angle | rad internally |

These units are explicit through the schema contract even though schema v1 does not repeat unit fields in
every object. External import/UI adapters may accept other units only when the source unit is
declared and converted once at the boundary. Values must never be interpreted by magnitude.

Results and reports store the canonical units and may add presentation-unit metadata. Display-unit
changes shall not rerun or alter resistance calculations.

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

The physical section view and the `Mx-My` action-space view do not use the same plotted vector.
Under the authoritative resultant convention below, the bending-action direction overlaid on
section coordinates `(x,y)` has components `(My,Mx)`. The reference section line perpendicular to
that direction has tangent `(-Mx,My)`. Compare the actual neutral-axis tangent `(-kx,ky)` with this
perpendicular reference line, treating both as undirected axes modulo 180 degrees. Do not compare
the neutral-axis angle directly with `thetaLoad = atan2(My,Mx)`, which lives in `Mx-My` action space.

The generalized strain plane is:

`ε(x,y) = ε0 + κx·y + κy·x`

The resultants about the declared origin are:

`P = ∫σ dA`, `Mx = ∫σ y dA`, `My = ∫σ x dA`.

If the new origin is offset by `(Δx, Δy)` from the old origin, with new coordinates
`x' = x - Δx`, `y' = y - Δy`:

`Mx' = Mx - P·Δy`, `My' = My - P·Δx`.

This convention is authoritative. Import adapters must transform external sign conventions and
record the mapping rather than changing the kernel convention.

### Current implementation discrepancy: equivalent-block `My`

The stress-strain pipeline follows the authoritative `My = sum(F*x)` convention. The standalone
`@pm/equivalent-block` package currently defines its local result as `My = -sum(F*x)`, and
`@pm/analysis-equivalent-block` does not yet perform an explicit local-to-project sign transform.
This is a code discrepancy, not an alternate project convention. Until the bridge is corrected and
verified on asymmetric sections with nonzero `My`, equivalent-block output is preview-only and
must not be used to claim cross-model sign agreement.

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
versioned input, never an invisible mutation.
