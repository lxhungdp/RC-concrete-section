# `@pm/code-kds142020`

KDS adapter for the independent equivalent-block kernel.

Status: implemented draft preview. It is not a released or independently approved code-compliance
profile.

Implemented basis:

- KDS 14 20 20:2022, 4.1.1(8), Table 4.1-2: `a = beta1*c`, uniform stress `eta*0.85*fck`, and strength-dependent `epsilon_cu`.
- KDS strength reduction: compression `phi = 0.65` for other transverse reinforcement or `0.70` for a qualifying spiral; tension `phi = 0.85`; linear transition from `epsilon_y` to the tension limit, where the limit is fixed at `0.005` for `fy <= 400 MPa` and is `2.5*epsilon_y` above 400 MPa.
- Pure-compression endpoint: `P0 = 0.85*fck*(Ag-Ast) + sum(fy*As)`. The flexural `eta` reduction is not applied to `P0`.
- Maximum design compression: `0.80*phi*P0` for other transverse reinforcement or `0.85*phi*P0` for a qualifying spiral.

For `fck <= 40 MPa`, the first Table 4.1-2 row is used. Between tabulated strengths, parameters are linearly interpolated. Above 90 MPa the adapter refuses to extrapolate and requires a positive, documented project-specific override.

The adapter remains independent of the fiber solver. Project schema v1 selects it through
`kds-142020-equivalent-block`; `@pm/analysis-equivalent-block` maps the profile-owned materials and
DesignBasis into this adapter and normalizes its output to the common result DTO.
