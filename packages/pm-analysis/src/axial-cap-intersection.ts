import type { Resultant } from './index'

/** One affine edge/plane intersection for both the clipped mesh and dotted source paths. */
export const axialCapEdgeIntersection = (a: Resultant, b: Resultant, cap: number) => {
  if (![a.P,a.Mx,a.My,b.P,b.Mx,b.My,cap].every(Number.isFinite)) throw new RangeError('Non-finite axial-cap edge.')
  const high = a.P >= b.P ? a : b; const low = high === a ? b : a
  if (cap > high.P || cap < low.P || high.P === low.P) throw new RangeError('The cap plane does not straddle this edge.')
  if (a.P === cap) return { point:{ P:cap,Mx:a.Mx,My:a.My }, fractionFromA:0 }
  if (b.P === cap) return { point:{ P:cap,Mx:b.Mx,My:b.My }, fractionFromA:1 }
  const ratio = (cap - high.P) / (low.P - high.P)
  const point = { P:cap, Mx:high.Mx+ratio*(low.Mx-high.Mx), My:high.My+ratio*(low.My-high.My) }
  if (![ratio, point.Mx, point.My].every(Number.isFinite)) throw new RangeError('Non-finite axial-cap intersection.')
  return { point,
    fractionFromA: high === a ? ratio : 1-ratio }
}
