/** Indexed simple-loop triangulation, including collinear boundary subdivision.
 * Coordinates and the supplied linear tolerance must use the same planar units.
 * Extracted from the existing block geometry; contains no mechanics or resistance policy.
 */
export type PlanarLoopPoint = { x: number; y: number }
export type PlanarLoopTriangle = { a: number; b: number; c: number }

const signedLoopArea = (indices: number[], points: readonly PlanarLoopPoint[]) => {
  let area = 0
  for (let index = 0; index < indices.length; index += 1) {
    const current = points[indices[index]]
    const next = points[indices[(index + 1) % indices.length]]
    area += current.x * next.y - next.x * current.y
  }
  return area / 2
}

const pointInLoopTriangle = (
  point: PlanarLoopPoint,
  a: PlanarLoopPoint,
  b: PlanarLoopPoint,
  c: PlanarLoopPoint,
  tolerance: number
) => {
  const cross2 = (p: PlanarLoopPoint, q: PlanarLoopPoint, r: PlanarLoopPoint) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x)
  const ab = cross2(a, b, point)
  const bc = cross2(b, c, point)
  const ca = cross2(c, a, point)
  // Only a point strictly inside blocks an ear. Treating points on an ear edge as
  // interior can leave a numerically collinear final polygon with no selectable ear.
  return ab > tolerance && bc > tolerance && ca > tolerance
}

export const triangulateIndexedLoop = (
  source: number[],
  points: readonly PlanarLoopPoint[],
  tolerance: number
): PlanarLoopTriangle[] => {
  if (!Number.isFinite(tolerance) || tolerance < 0 || source.some(index => !Number.isInteger(index) ||
    index < 0 || index >= points.length || !Number.isFinite(points[index].x) || !Number.isFinite(points[index].y))) {
    throw new RangeError('Planar loop indices, coordinates and tolerance must be valid and finite.')
  }
  let momentScale = 1
  for (const index of source) {
    momentScale = Math.max(
      momentScale,
      Math.abs(points[index].x),
      Math.abs(points[index].y)
    )
  }
  const distanceTolerance = Math.max(1e-12 * momentScale, tolerance)
  const crossTolerance = Math.max(1e-12 * momentScale ** 2, tolerance ** 2)
  const distinctIndices = source.filter((index, position, values) => position === 0 || index !== values[position - 1])
  if (distinctIndices.length > 1 && distinctIndices[0] === distinctIndices[distinctIndices.length - 1]) {
    distinctIndices.pop()
  }
  const boundary = signedLoopArea(distinctIndices, points) >= 0
    ? distinctIndices
    : [...distinctIndices].reverse()
  const cleaned = boundary.filter((index, position, values) => {
    if (position === 0) return true
    const current = points[index]
    const previous = points[values[position - 1]]
    return Math.hypot(current.x - previous.x, current.y - previous.y) > distanceTolerance
  })
  if (cleaned.length > 1) {
    const first = points[cleaned[0]]
    const last = points[cleaned[cleaned.length - 1]]
    if (Math.hypot(first.x - last.x, first.y - last.y) <= distanceTolerance) cleaned.pop()
  }
  let removed = true
  while (removed && cleaned.length > 3) {
    removed = false
    for (let index = 0; index < cleaned.length; index += 1) {
      const previous = points[cleaned[(index - 1 + cleaned.length) % cleaned.length]]
      const current = points[cleaned[index]]
      const next = points[cleaned[(index + 1) % cleaned.length]]
      const leftX = current.x - previous.x
      const leftY = current.y - previous.y
      const rightX = next.x - current.x
      const rightY = next.y - current.y
      const cross = leftX * rightY - leftY * rightX
      if (Math.abs(cross) > crossTolerance || leftX * rightX + leftY * rightY < 0) continue
      cleaned.splice(index, 1)
      removed = true
      break
    }
  }
  if (cleaned.length < 3) {
    throw new Error('The axial-cap contour collapsed below three distinct moment points.')
  }
  const loop = [...cleaned]
  const remaining = [...loop]
  const triangles: PlanarLoopTriangle[] = []
  let guard = 0
  while (remaining.length > 3 && guard < loop.length * loop.length) {
    let clipped = false
    for (let index = 0; index < remaining.length; index += 1) {
      const previousIndex = remaining[(index - 1 + remaining.length) % remaining.length]
      const currentIndex = remaining[index]
      const nextIndex = remaining[(index + 1) % remaining.length]
      const previous = points[previousIndex]
      const current = points[currentIndex]
      const next = points[nextIndex]
      const convex =
        (current.x - previous.x) * (next.y - current.y) -
        (current.y - previous.y) * (next.x - current.x)
      if (convex <= crossTolerance) continue
      const contains = remaining.some((candidateIndex) =>
        candidateIndex !== previousIndex && candidateIndex !== currentIndex && candidateIndex !== nextIndex &&
        pointInLoopTriangle(points[candidateIndex], previous, current, next, crossTolerance)
      )
      if (contains) continue
      triangles.push({ a: previousIndex, b: currentIndex, c: nextIndex })
      remaining.splice(index, 1)
      clipped = true
      break
    }
    if (!clipped) break
    guard += 1
  }
  if (remaining.length === 3) triangles.push({ a: remaining[0], b: remaining[1], c: remaining[2] })
  if (triangles.length !== loop.length - 2) {
    throw new Error(`The axial-cap contour could not be triangulated reliably (${loop.length} vertices, ${remaining.length} unresolved).`
    )
  }
  /**
   * Ear clipping intentionally removes collinear cap vertices, but every such vertex still belongs
   * to a clipped side-face edge. Restore them by subdividing the matching boundary triangle; otherwise
   * a circular or straight-sided cap reports one open edge for every omitted intermediate vertex.
   */
  for (let edge = 0; edge < loop.length; edge += 1) {
    const left = loop[edge]
    const right = loop[(edge + 1) % loop.length]
    const chain = [left]
    let position = boundary.indexOf(left)
    let guard = 0
    while (boundary[position] !== right && guard <= boundary.length) {
      position = (position + 1) % boundary.length
      chain.push(boundary[position])
      guard += 1
    }
    if (chain[chain.length - 1] !== right) {
      throw new Error('The axial-cap boundary subdivision is inconsistent.')
    }
    if (chain.length <= 2) continue
    const triangleIndex = triangles.findIndex((triangle) => {
      const vertices = [triangle.a, triangle.b, triangle.c]
      return vertices.includes(left) && vertices.includes(right)
    })
    if (triangleIndex < 0) {
      throw new Error('A subdivided axial-cap edge has no adjacent triangle.')
    }
    const triangle = triangles[triangleIndex]
    const third = [triangle.a, triangle.b, triangle.c].find((vertex) => vertex !== left && vertex !== right)
    if (third === undefined) {
      throw new Error('A subdivided axial-cap triangle is degenerate.')
    }
    const replacements = chain.slice(0, -1).map((vertex, index) => ({
      a: vertex,
      b: chain[index + 1],
      c: third
    }))
    triangles.splice(triangleIndex, 1, ...replacements)
  }
  if (triangles.length !== boundary.length - 2) {
    throw new Error(`The axial-cap boundary subdivision is incomplete (${boundary.length} vertices, ${triangles.length} triangles).`
    )
  }
  return triangles
}

