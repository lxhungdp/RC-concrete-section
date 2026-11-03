export type GroupSupport<T> = {
  groupId: string
  minimum: T
  maximum: T
  minimumProjection: number
  maximumProjection: number
}

/** Exact support points per group. Cache keys retain the actual direction without angle bins. */
export const prepareGroupedPointSupports = <T extends { x: number; y: number }>(
  points: readonly T[],
  groupId: (point: T) => string
) => {
  const groups = new Map<string, T[]>()
  for (const point of points) {
    const id = groupId(point)
    const group = groups.get(id)
    if (group) group.push(point)
    else groups.set(id, [point])
  }
  const cache = new Map<string, GroupSupport<T>[]>()
  return (normalX: number, normalY: number): GroupSupport<T>[] => {
    if (!Number.isFinite(normalX) || !Number.isFinite(normalY)) throw new RangeError('Support direction must be finite.')
    const length = Math.hypot(normalX, normalY)
    const nx = length === 0 ? 0 : normalX / length
    const ny = length === 0 ? 0 : normalY / length
    const key = `${nx},${ny}`
    const existing = cache.get(key)
    if (existing) return existing
    const result: GroupSupport<T>[] = []
    for (const [id, group] of groups) {
      let minimum = group[0]
      let maximum = group[0]
      let minimumProjection = minimum.x * nx + minimum.y * ny
      let maximumProjection = minimumProjection
      for (let index = 1; index < group.length; index += 1) {
        const point = group[index]
        const projection = point.x * nx + point.y * ny
        if (projection < minimumProjection) { minimum = point; minimumProjection = projection }
        if (projection > maximumProjection) { maximum = point; maximumProjection = projection }
      }
      result.push({ groupId: id, minimum, maximum, minimumProjection, maximumProjection })
    }
    // A bounded runtime cache. Eviction changes cost only, never the support result.
    const oldestKey = cache.keys().next().value
    if (cache.size >= 128 && oldestKey !== undefined) cache.delete(oldestKey)
    cache.set(key, result)
    return result
  }
}
