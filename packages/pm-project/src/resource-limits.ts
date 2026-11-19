import { GEOMETRY_INPUT_LIMITS } from '@pm/geometry'
import { MATERIAL_INPUT_LIMITS } from '@pm/materials'

export const PROJECT_INPUT_LIMITS = Object.freeze({ jsonBytes: 10 * 1_024 * 1_024, combinations: 100_000 })

export class ProjectResourceLimitError extends Error {
  readonly code = 'PROJECT_RESOURCE_LIMIT' as const
  constructor(message: string) { super(message); this.name = 'ProjectResourceLimitError' }
}

const record = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined
const array = (value: unknown): readonly unknown[] => Array.isArray(value) ? value : []
const within = (count: number, maximum: number, name: string) => {
  if (count > maximum) throw new ProjectResourceLimitError(`${name} exceeds the input resource limit (${maximum}).`)
}

/** Count UTF-8 bytes without allocating a second copy of an oversized JSON string. */
export const assertProjectJsonSize = (text: string): void => {
  if (text.length > PROJECT_INPUT_LIMITS.jsonBytes) throw new ProjectResourceLimitError('Project JSON exceeds 10 MiB.')
  let bytes = 0
  for (let index = 0; index < text.length; index += 1) {
    const unit = text.charCodeAt(index)
    if (unit <= 0x7f) bytes += 1
    else if (unit <= 0x7ff) bytes += 2
    else if (unit >= 0xd800 && unit <= 0xdbff && text.charCodeAt(index + 1) >= 0xdc00 && text.charCodeAt(index + 1) <= 0xdfff) {
      bytes += 4
      index += 1
    } else bytes += 3
    if (bytes > PROJECT_INPUT_LIMITS.jsonBytes) throw new ProjectResourceLimitError('Project JSON exceeds 10 MiB.')
  }
}

/** Resource-only inspection; malformed fields remain the semantic parser's responsibility. */
export const assertProjectInputResources = (value: unknown): void => {
  const inputs = record(record(value)?.inputs)
  const geometry = record(inputs?.geometry)
  const outers = array(geometry?.outers)
  within(outers.length, GEOMETRY_INPUT_LIMITS.rings, 'Concrete rings')
  within(array(geometry?.rebars).length, GEOMETRY_INPUT_LIMITS.rebars, 'Reinforcement bars')
  let ringCount = 0, vertexCount = 0
  for (const outerValue of outers) {
    const outer = record(outerValue), holes = array(outer?.holes)
    ringCount += 1 + holes.length
    within(ringCount, GEOMETRY_INPUT_LIMITS.rings, 'Concrete rings')
    for (const ring of [array(outer?.points), ...holes.map((hole) => array(record(hole)?.points))]) {
      within(ring.length, GEOMETRY_INPUT_LIMITS.verticesPerRing, 'Vertices in one ring')
      vertexCount += ring.length
      within(vertexCount, GEOMETRY_INPUT_LIMITS.vertices, 'Geometry vertices')
    }
  }
  const materials = record(inputs?.materials), steel = array(materials?.steel)
  within(steel.length, MATERIAL_INPUT_LIMITS.steelMaterials, 'Steel materials')
  let curvePoints = 0
  for (const material of [materials?.concrete, ...steel]) {
    const model = record(record(material)?.stressStrain)
    curvePoints += array(model?.points).length
    within(curvePoints, MATERIAL_INPUT_LIMITS.curvePoints, 'Material curve points')
  }
  within(array(record(inputs?.loadings)?.combinations).length, PROJECT_INPUT_LIMITS.combinations, 'Load combinations')
}
