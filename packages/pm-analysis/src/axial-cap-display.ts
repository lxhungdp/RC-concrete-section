import type { Resultant } from './index'
import { axialCapEdgeIntersection } from './axial-cap-intersection'

/**
 * docs/05 §9: geometric portions strictly beyond Pmax, including exact linear edge crossings.
 * Input paths already belong to the retained reduced Design dataset; this is never a capacity
 * calculation, a strain interpolation, or an extrapolation beyond the sampled geometry.
 */
export const axialCapExcludedPaths = (
  paths: readonly (readonly Resultant[])[],
  cap: number
): Resultant[][] => {
  if (!Number.isFinite(cap)) throw new RangeError('An axial-cap display limit must be finite.')
  const result: Resultant[][] = []
  for (const path of paths) {
    let current: Resultant[] = []
    const flush = () => { if (current.length > 1) result.push(current); current = [] }
    for (let index = 1; index < path.length; index++) {
      const a = path[index - 1]; const b = path[index]
      if (![a.P, a.Mx, a.My, b.P, b.Mx, b.My].every(Number.isFinite)) {
        throw new RangeError('Axial-cap display paths must contain finite resultants.')
      }
      const aAbove = a.P > cap; const bAbove = b.P > cap
      if (!aAbove && !bAbove) { flush(); continue }
      const crossing = () => axialCapEdgeIntersection(a,b,cap).point
      if (!current.length) current.push(aAbove ? a : crossing())
      current.push(bAbove ? b : crossing())
      if (!bAbove) flush()
    }
    flush()
  }
  return result
}
