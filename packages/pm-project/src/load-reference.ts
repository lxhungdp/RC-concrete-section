import type { LoadCombination, LoadingsInput } from './types'

/** Parallel input axes at the exact net-concrete centroid plus these offsets, in mm. */
export type LoadReference = { kind: 'centroid-offset'; offsetX: number; offsetY: number }
export const CENTROID_LOAD_REFERENCE: Readonly<LoadReference> = Object.freeze({
  kind: 'centroid-offset', offsetX: 0, offsetY: 0
})
type Actions = { P: number; Mx: number; My: number }

export class LoadReferenceError extends RangeError {
  readonly code = 'INVALID_LOAD_REFERENCE' as const
}

export const parseLoadReference = (value: unknown): LoadReference => {
  if (!value || typeof value !== 'object' || !('kind' in value) || value.kind !== 'centroid-offset' ||
    !('offsetX' in value) || typeof value.offsetX !== 'number' || !Number.isFinite(value.offsetX) ||
    !('offsetY' in value) || typeof value.offsetY !== 'number' || !Number.isFinite(value.offsetY)) {
    throw new LoadReferenceError('Load reference requires centroid-offset with finite X/Y offsets in mm.')
  }
  return { kind: value.kind, offsetX: value.offsetX, offsetY: value.offsetY }
}

export const loadReferenceOf = (input: Pick<LoadingsInput, 'reference'>): LoadReference =>
  input.reference ?? CENTROID_LOAD_REFERENCE

export const resolveLoadOrigin = (centroid: { x: number; y: number }, reference: LoadReference) => {
  parseLoadReference(reference)
  const origin = { x: centroid.x + reference.offsetX, y: centroid.y + reference.offsetY }
  if (![origin.x, origin.y].every(Number.isFinite)) throw new LoadReferenceError('Load-reference origin must be finite.')
  return origin
}

/** engineering/02 §2: Mx_to=Mx_from+P*(fromY-toY), with the corresponding X term for My. */
export const translateResultant = <T extends Actions>(value: T, from: LoadReference, to: LoadReference): T => {
  parseLoadReference(from); parseLoadReference(to)
  if (![value.P, value.Mx, value.My].every(Number.isFinite)) throw new LoadReferenceError('Load actions must be finite.')
  if (value.P === 0 || from.offsetX === to.offsetX && from.offsetY === to.offsetY) return value
  const Mx = from.offsetY === to.offsetY ? value.Mx : value.Mx + value.P * (from.offsetY - to.offsetY)
  const My = from.offsetX === to.offsetX ? value.My : value.My + value.P * (from.offsetX - to.offsetX)
  if (![Mx, My].every(Number.isFinite)) throw new LoadReferenceError('Load-reference translation overflowed.')
  return { ...value, Mx, My }
}
export const resultantAtLoadReference = <T extends Actions>(value: T, reference: LoadReference): T =>
  translateResultant(value, CENTROID_LOAD_REFERENCE, reference)
export const resultantAtCentroid = <T extends Actions>(value: T, reference: LoadReference): T =>
  translateResultant(value, reference, CENTROID_LOAD_REFERENCE)

/** Apply one authored input patch without round-tripping untouched centroidal components. */
export const editLoadAtReference = (load: LoadCombination, patch: Partial<LoadCombination>, reference: LoadReference): LoadCombination => {
  const authored = { ...resultantAtLoadReference(load, reference), ...patch }
  const canonical = resultantAtCentroid(authored, reference)
  return { ...load, ...patch,
    Mx: patch.P !== undefined || patch.Mx !== undefined ? canonical.Mx : load.Mx,
    My: patch.P !== undefined || patch.My !== undefined ? canonical.My : load.My }
}

/** Atomic Apply. Convert keeps the canonical vectors and their array identity exactly. */
export const applyLoadReference = (input: LoadingsInput, next: LoadReference, convert: boolean): LoadingsInput => {
  const reference = parseLoadReference(next)
  const previous = parseLoadReference(loadReferenceOf(input))
  const unchanged = previous.offsetX === reference.offsetX && previous.offsetY === reference.offsetY
  const combinations = convert || unchanged ? input.combinations : input.combinations.map(load =>
    // Preserve the old displayed numbers: canonical moments gain P times the offset increment.
    translateResultant(load, reference, previous))
  for (const load of combinations) resultantAtLoadReference(load, reference)
  return { ...input, reference, combinations }
}
