/** Existing drawing-interchange envelope; implementation work bounds, not accuracy tolerances. */
export const GEOMETRY_INPUT_LIMITS = Object.freeze({
  rings: 128, verticesPerRing: 1_024, vertices: 4_096, rebars: 2_048
})

type GeometryCountsInput = {
  solids: readonly { outer: readonly unknown[]; holes: readonly (readonly unknown[])[] }[]
  rebars?: readonly unknown[]
}

export const geometryInputResourceLimitIssue = (input: {
  outers: readonly { points: readonly unknown[]; holes: readonly { points: readonly unknown[] }[] }[]
  rebars: readonly unknown[]
}): string | null => {
  if (input.outers.length > GEOMETRY_INPUT_LIMITS.rings) return 'Too many concrete rings.'
  let rings = 0
  for (const outer of input.outers) {
    rings += 1 + outer.holes.length
    if (rings > GEOMETRY_INPUT_LIMITS.rings) return 'Too many concrete rings.'
  }
  return geometryResourceLimitIssue({
    solids: input.outers.map((outer) => ({ outer: outer.points, holes: outer.holes.map((hole) => hole.points) })),
    rebars: input.rebars
  })
}

export class GeometryResourceLimitError extends Error {
  readonly code = 'GEOMETRY_RESOURCE_LIMIT' as const
  constructor(message: string) { super(message); this.name = 'GeometryResourceLimitError' }
}

export const geometryResourceLimitIssue = (input: GeometryCountsInput): string | null => {
  if (input.solids.length > GEOMETRY_INPUT_LIMITS.rings) return 'Too many concrete rings.'
  if ((input.rebars?.length ?? 0) > GEOMETRY_INPUT_LIMITS.rebars) return 'Too many reinforcement bars.'
  let rings = 0, vertices = 0
  for (const solid of input.solids) {
    rings += 1 + solid.holes.length
    if (rings > GEOMETRY_INPUT_LIMITS.rings) return 'Too many concrete rings.'
    for (const ring of [solid.outer, ...solid.holes]) {
      if (ring.length > GEOMETRY_INPUT_LIMITS.verticesPerRing) return 'Too many vertices in one ring.'
      vertices += ring.length
      if (vertices > GEOMETRY_INPUT_LIMITS.vertices) return 'Too many geometry vertices.'
    }
  }
  return null
}
