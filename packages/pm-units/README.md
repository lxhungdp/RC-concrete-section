# @pm/units

Presentation/input boundary adapter. P-M's canonical units remain mm, mm², MPa, N, N·mm,
dimensionless strain and the existing explicit angle contracts. No engineering kernel depends on
this package; the repository structure gate enforces this direction.

The source-backed shared definitions come from the pinned MIT @jscad/engineering-units 1.0.0
artifact in `vendor/`. Its archive/source hashes are checked by the package tests. There are no
transitive dependencies and no DOM, storage, network, solver, material or design-code behavior.
Curvature and mass density extend the boundary using reciprocal length and mass/length³; the
conversion source is recorded in `docs/development/10-display-units.md`.

Contexts are immutable version-1 `UnitSelection` values. Force, moment, geometry length, bar
diameter, stress, modulus and mass density can be chosen independently. Area, section modulus,
inertia and curvature follow the selected geometry length dimension. Unknown quantities/units,
nonfinite values, overflow and nonzero underflow throw typed `UnitConversionError` failures.

`editableQuantity` and `commitQuantity` keep the exact original canonical number for a no-op edit.
`formatInputQuantity` is the separate compact resting view: at most three fractional digits, one
for modulus, no grouping separators, and scientific notation for nonzero values that round to zero.
Focus must seed its draft with `editableQuantity`, never the compact resting text.
Display rounding never returns to a kernel. UI preference is stored separately from project JSON,
worker requests and analysis cache identities. `fieldQuantity` maps only the explicitly declared
dimensional project/material fields; identifiers, counts, ratios and coefficients have no unit
conversion mapping.
