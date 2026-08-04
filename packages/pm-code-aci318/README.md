# `@pm/code-aci318`

ACI CODE-318-19(22) adapter for the independent equivalent-block kernel.

Implemented basis:

- Whitney block: `epsilon_cu = 0.003`, uniform stress `0.85*f'c`, and `a = beta1*c`.
- SI `beta1`: `0.85` through 28 MPa, reduced by `0.05` per 7 MPa above 28 MPa, with a lower bound of `0.65`.
- Strength reduction: compression `phi = 0.65` for tied columns or `0.75` for qualifying spirals; tension `phi = 0.90`; linear transition from `epsilon_y` to `epsilon_y + 0.003`.
- Pure-compression endpoint: `P0 = 0.85*f'c*(Ag-Ast) + sum(fy*As)`.
- Maximum design compression: `0.80*phi*P0` for tied columns or `0.85*phi*P0` for qualifying spirals.

The adapter owns only ACI policy. Geometry integration and inverse solving remain in `@pm/equivalent-block`, and no existing solver, UI, or persisted project schema is changed.
