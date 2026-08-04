# `@pm/code-kds142020`

KDS adapter for the independent equivalent-block kernel.

Implemented basis:

- KDS 14 20 20:2022, 4.1.1(8), Table 4.1-2: `a = beta1*c`, uniform stress `eta*0.85*fck`, and strength-dependent `epsilon_cu`.
- KDS strength reduction: compression `phi = 0.65` for other transverse reinforcement or `0.70` for a qualifying spiral; tension `phi = 0.85`; linear transition from `epsilon_y` to `0.005` through SD400 or `2.5*epsilon_y` above SD400.
- Pure-compression endpoint: `P0 = 0.85*fck*(Ag-Ast) + sum(fy*As)`. The flexural `eta` reduction is not applied to `P0`.
- Maximum design compression: `0.80*phi*P0` for other transverse reinforcement or `0.85*phi*P0` for a qualifying spiral.

For `fck <= 40 MPa`, the first Table 4.1-2 row is used. Between tabulated strengths, parameters are linearly interpolated. Above 90 MPa the adapter refuses to extrapolate and requires a positive, documented project-specific override.

The adapter does not import the existing material/design profiles and does not modify the current fiber solver.
