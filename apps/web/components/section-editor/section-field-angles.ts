type StrainPlaneState = { e0: number; kx: number; ky: number }

const toDegrees = (radians: number) => (radians * 180) / Math.PI

export const normalizeVectorAngleDeg = (degrees: number) => ((degrees % 360) + 360) % 360

/** Normalize an undirected line orientation to [0, 180). */
export const normalizeLineAngleDeg = (degrees: number) => ((degrees % 180) + 180) % 180

/**
 * Orientation of the epsilon=0 neutral-axis line, CCW from section +x.
 *
 * The strain plane is `epsilon = e0 + kx*y + ky*x`, whose in-section gradient is `(ky,kx)`.
 * A tangent to the neutral axis is therefore `(-kx,ky)`.
 */
export const neutralAxisAngleDeg = (state: StrainPlaneState) => {
  if (Math.hypot(state.kx, state.ky) < 1e-16) return null
  return normalizeLineAngleDeg(toDegrees(Math.atan2(state.ky, -state.kx)))
}

/** Demand/resistance direction in Mx-My action space, not in physical section x-y space. */
export const momentAngleDeg = (Mx: number, My: number) => {
  if (Math.hypot(Mx, My) < 1e-9) return null
  return normalizeVectorAngleDeg(toDegrees(Math.atan2(My, Mx)))
}

/**
 * Direction of the bending action when it is overlaid on the physical section.
 *
 * With `Mx = integral(sigma*y dA)` and `My = integral(sigma*x dA)`, the section-coordinate
 * components are `(My,Mx)`. This is deliberately different from the `(Mx,My)` vector used in a
 * P-Mx-My action-space chart.
 */
export const sectionBendingDirectionAngleDeg = (Mx: number, My: number) => {
  if (Math.hypot(Mx, My) < 1e-9) return null
  return normalizeVectorAngleDeg(toDegrees(Math.atan2(Mx, My)))
}

/** Orientation of the section line perpendicular to the bending-action direction `(My,Mx)`. */
export const perpendicularBendingAxisAngleDeg = (Mx: number, My: number) => {
  if (Math.hypot(Mx, My) < 1e-9) return null
  return normalizeLineAngleDeg(toDegrees(Math.atan2(My, -Mx)))
}

/** Smallest angle between two undirected lines, in [0, 90]. */
export const lineAngleDifferenceDeg = (first: number, second: number) => {
  const difference = Math.abs(normalizeLineAngleDeg(first) - normalizeLineAngleDeg(second))
  return Math.min(difference, 180 - difference)
}

/** Convert the sampled strain-gradient direction beta to the actual neutral-axis line angle. */
export const strainDirectionToNeutralAxisAngleDeg = (betaDeg: number) =>
  normalizeLineAngleDeg(180 - betaDeg)

export const sectionFieldAngleComparison = (
  state: StrainPlaneState,
  Mx: number,
  My: number
) => {
  const neutralAxis = neutralAxisAngleDeg(state)
  const perpendicularBendingAxis = perpendicularBendingAxisAngleDeg(Mx, My)
  return {
    neutralAxis,
    momentSpace: momentAngleDeg(Mx, My),
    sectionBendingDirection: sectionBendingDirectionAngleDeg(Mx, My),
    perpendicularBendingAxis,
    difference:
      neutralAxis == null || perpendicularBendingAxis == null
        ? null
        : lineAngleDifferenceDeg(neutralAxis, perpendicularBendingAxis)
  }
}
