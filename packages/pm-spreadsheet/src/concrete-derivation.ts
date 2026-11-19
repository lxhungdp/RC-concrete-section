import { kdsConcreteParams, kdsElasticModulus, type ConcreteMaterial } from '@pm/materials'

/**
 * Workbook replay of the Materials-panel fck edit (docs/task-packets/2026-11-12-kds-workbook-fck-derivation.md).
 *
 * In the panel, editing fck of a KDS concrete re-derives its KDS law parameters through the
 * material owner, and a later edit of one of those parameters is an explicit override. A workbook
 * has no edit order, so the export records the fck and the derived values it was written with.
 * On import, a changed fck re-derives every tracked value whose cell still holds the exported
 * value; a cell the author changed stays authoritative. No formula is evaluated here.
 */
export const KDS_DERIVED_CONCRETE_PATHS = [
  'elasticModulus', 'stressStrain.n', 'stressStrain.eps0', 'stressStrain.epsCu', 'limits.eps0', 'limits.epsCu'
] as const
type DerivedPath = (typeof KDS_DERIVED_CONCRETE_PATHS)[number]
export type ConcreteDerivationSnapshot = { fck: number; values: Array<{ path: DerivedPath; value: number }> }

type Fields = Record<string, unknown>
const record = (value: unknown): value is Fields => value !== null && typeof value === 'object' && !Array.isArray(value)
const read = (material: ConcreteMaterial | Fields, path: DerivedPath): number | undefined => {
  const [head, tail] = path.split('.') as [string, string | undefined]
  const container = (material as unknown as Record<string, unknown>)[head]
  const value = tail === undefined ? container : container !== null && typeof container === 'object'
    ? (container as Record<string, unknown>)[tail] : undefined
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}
const write = (material: Fields, path: DerivedPath, value: number): Fields => {
  const [head, tail] = path.split('.') as [string, string | undefined]
  if (tail === undefined) return { ...material, [head]: value }
  return record(material[head]) ? { ...material, [head]: { ...material[head], [tail]: value } } : material
}
// Unit conversion of an unchanged cell may differ from the exported canonical value in the last bits.
const same = (a: number, b: number) => Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(a), Math.abs(b))

export const concreteDerivationSnapshot = (material: ConcreteMaterial): ConcreteDerivationSnapshot | undefined => {
  if (material.standard !== 'KDS') return undefined
  const values = KDS_DERIVED_CONCRETE_PATHS.flatMap(path => {
    const value = read(material, path)
    return value === undefined ? [] : [{ path, value }]
  })
  return { fck: material.fck, values }
}

export const replayConcreteDerivation = (
  material: Fields, snapshot: ConcreteDerivationSnapshot | undefined
): Fields => {
  const fck = material.fck, mc = material.mc
  if (!snapshot || material.standard !== 'KDS' || typeof fck !== 'number' || !Number.isFinite(fck) ||
    !(fck > 0) || same(fck, snapshot.fck) || typeof mc !== 'number' || !Number.isFinite(mc) || !(mc > 0)) return material
  // Decode first, normalize second, validate the complete project last (development/02 §10).
  // These are the tracked assignments of applyKdsConcreteDerived; all quantities remain owned
  // by @pm/materials. Do not cast an unvalidated workbook candidate to ConcreteMaterial.
  const params = kdsConcreteParams(fck)
  const derived: Array<{ path: DerivedPath; value: number }> = [
    { path: 'elasticModulus', value: kdsElasticModulus(fck, mc) },
    { path: 'limits.epsCu', value: params.epsCu }
  ]
  if (record(material.stressStrain) && material.stressStrain.type === 'kds-parabolic') {
    derived.push({ path: 'stressStrain.n', value: params.n }, { path: 'stressStrain.eps0', value: params.eps0 },
      { path: 'stressStrain.epsCu', value: params.epsCu }, { path: 'limits.eps0', value: params.eps0 })
  }
  let next = material
  for (const { path, value } of derived) {
    const authored = read(material, path)
    const exported = snapshot.values.find(item => item.path === path)?.value
    // Replace only unchanged finite values. Invalid or missing authored data reach the validator;
    // a changed cell remains an explicit override, including a temporarily inconsistent strain pair.
    if (authored !== undefined && exported !== undefined && same(authored, exported)) next = write(next, path, value)
  }
  return next
}
