/**
 * Clipped-cell integration mesh for the concrete region — `docs/02` §5..§8.
 *
 * The mesh is built by intersecting a square grid with the exact net concrete polygon, so every
 * quadrature weight comes from real clipped geometry instead of an all-or-nothing cell-centre test.
 * Each clipped connected component is triangulated and carries a three-point degree-2 rule, which
 * integrates area, first moments, and any linear stress field exactly.
 */
import polygonClipping from 'polygon-clipping'
import type { MultiPolygon, Pair, Polygon, Ring } from 'polygon-clipping'
import type { Point2, SectionGeometry } from './index'

export type MeshQuadraturePoint = {
  x: number
  y: number
  /** Quadrature weight, i.e. the tributary area of this point (mm²). */
  area: number
  cellI: number
  cellJ: number
  /** Subdivision depth of the owning cell; 0 for a base-grid cell. */
  depth: number
  component: number
  triangle: number
  point: 0 | 1 | 2
}

export type ConcreteMeshReport = {
  /** Base grid cell size (mm). */
  cellSize: number
  /** Minimum caliper width of the outer convex hull, `Dmin` in `docs/02` §6. */
  minCaliperWidth: number
  gridX: number
  gridY: number
  cells: number
  components: number
  triangles: number
  points: number
  /** Exact polygon properties about the analysis origin. */
  exact: { area: number; firstMomentX: number; firstMomentY: number }
  /** Same properties recovered by summing the quadrature rule. */
  meshed: { area: number; firstMomentX: number; firstMomentY: number }
  areaError: number
  firstMomentXError: number
  firstMomentYError: number
  discardedArea: number
  /** True when every sanity check in `docs/02` §8 passed. */
  ok: boolean
  warnings: string[]
}

export type ConcreteMesh = {
  points: MeshQuadraturePoint[]
  report: ConcreteMeshReport
}

export type ConcreteMeshOptions = {
  /** Explicit cell size (mm). Overrides the `Dmin/32` seed rule. */
  cellSize?: number
  /** Optional user cap on the seed cell size (mm). */
  maxCellSize?: number
  /** Divisions used by the seed rule `h0 = Dmin / divisions`. */
  seedDivisions?: number
  /** Hard preflight limit on base-grid cells (`docs/02` §7). */
  maxCells?: number
  /** Times a cell may be quartered when its clip result still contains a hole. */
  maxSubdivision?: number
}

const DEFAULT_SEED_DIVISIONS = 32
const DEFAULT_MAX_CELLS = 250_000
const DEFAULT_MAX_SUBDIVISION = 4

const closeRing = (points: Array<{ x: number; y: number }>): Ring => {
  const ring = points.map((point) => [point.x, point.y] as Pair)
  if (ring.length > 0) ring.push([...ring[0]] as Pair)
  return ring
}

const ringToPairs = (ring: Ring): Pair[] => {
  if (ring.length < 2) return [...ring]
  const [first] = ring
  const last = ring[ring.length - 1]
  return first[0] === last[0] && first[1] === last[1] ? ring.slice(0, -1) : [...ring]
}

/** Net concrete region: union over solids of (outer ring minus its holes). */
export const netConcreteMultiPolygon = (section: SectionGeometry): MultiPolygon => {
  let net: MultiPolygon = []

  for (const solid of section.solids) {
    if (solid.outer.length < 3) continue
    const outer: Polygon = [closeRing(solid.outer)]
    const holes: Polygon[] = solid.holes.filter((hole) => hole.length >= 3).map((hole) => [closeRing(hole)])
    const piece = holes.length > 0 ? polygonClipping.difference(outer, ...holes) : polygonClipping.union(outer)
    net = net.length > 0 ? polygonClipping.union(net, piece) : piece
  }

  return net
}

/**
 * Exact area and first moments about the origin, from the polygon line integrals in `docs/02` §2.
 * `polygon-clipping` emits CCW outer rings and CW holes, so the signed sums combine directly.
 */
export const multiPolygonProperties = (multi: MultiPolygon) => {
  let area = 0
  let firstMomentX = 0 // ∫ y dA
  let firstMomentY = 0 // ∫ x dA

  for (const polygon of multi) {
    for (const ring of polygon) {
      const pairs = ringToPairs(ring)
      for (let i = 0; i < pairs.length; i++) {
        const [ax, ay] = pairs[i]
        const [bx, by] = pairs[(i + 1) % pairs.length]
        const cross = ax * by - bx * ay
        area += cross
        firstMomentY += (ax + bx) * cross
        firstMomentX += (ay + by) * cross
      }
    }
  }

  return { area: area / 2, firstMomentX: firstMomentX / 6, firstMomentY: firstMomentY / 6 }
}

const ringArea = (pairs: Pair[]) => {
  let sum = 0
  for (let i = 0; i < pairs.length; i++) {
    const [ax, ay] = pairs[i]
    const [bx, by] = pairs[(i + 1) % pairs.length]
    sum += ax * by - bx * ay
  }
  return sum / 2
}

const convexHull = (points: Array<{ x: number; y: number }>) => {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y)
  if (sorted.length < 3) return sorted
  const cross = (o: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const build = (source: typeof sorted) => {
    const chain: typeof sorted = []
    for (const point of source) {
      while (chain.length >= 2 && cross(chain[chain.length - 2], chain[chain.length - 1], point) <= 0) chain.pop()
      chain.push(point)
    }
    chain.pop()
    return chain
  }
  return [...build(sorted), ...build([...sorted].reverse())]
}

/**
 * `Dmin` from `docs/02` §6: minimum caliper width of the outer convex hull. Rotating-calipers
 * width for a convex polygon equals the smallest "max vertex distance to an edge line".
 */
export const minCaliperWidth = (points: Array<{ x: number; y: number }>) => {
  const hull = convexHull(points)
  if (hull.length < 2) return 0
  let best = Number.POSITIVE_INFINITY

  for (let i = 0; i < hull.length; i++) {
    const a = hull[i]
    const b = hull[(i + 1) % hull.length]
    const ex = b.x - a.x
    const ey = b.y - a.y
    const length = Math.hypot(ex, ey)
    if (length < 1e-12) continue
    let width = 0
    for (const point of hull) {
      width = Math.max(width, Math.abs((point.x - a.x) * ey - (point.y - a.y) * ex) / length)
    }
    best = Math.min(best, width)
  }

  return Number.isFinite(best) ? best : 0
}

/**
 * Ear clipping for one simple ring. Returns CCW triangles whose areas sum to the ring area.
 * The mesh report re-checks that sum, so a triangulation failure cannot pass silently.
 */
const triangulateSimpleRing = (pairs: Pair[]): Array<[Pair, Pair, Pair]> => {
  const ring = ringArea(pairs) < 0 ? [...pairs].reverse() : [...pairs]
  const n = ring.length
  if (n < 3) return []
  if (n === 3) return [[ring[0], ring[1], ring[2]]]

  const indices = ring.map((_, index) => index)
  const triangles: Array<[Pair, Pair, Pair]> = []
  const cross = (o: Pair, a: Pair, b: Pair) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

  const inTriangle = (p: Pair, a: Pair, b: Pair, c: Pair) => {
    const d1 = cross(a, b, p)
    const d2 = cross(b, c, p)
    const d3 = cross(c, a, p)
    return d1 >= 0 && d2 >= 0 && d3 >= 0
  }

  let guard = indices.length * indices.length + 16
  while (indices.length > 3 && guard-- > 0) {
    let clipped = false
    for (let i = 0; i < indices.length; i++) {
      const a = ring[indices[(i - 1 + indices.length) % indices.length]]
      const b = ring[indices[i]]
      const c = ring[indices[(i + 1) % indices.length]]
      if (cross(a, b, c) <= 0) continue

      let containsOther = false
      for (let j = 0; j < indices.length; j++) {
        const other = ring[indices[j]]
        if (other === a || other === b || other === c) continue
        if (inTriangle(other, a, b, c)) {
          containsOther = true
          break
        }
      }
      if (containsOther) continue

      triangles.push([a, b, c])
      indices.splice(i, 1)
      clipped = true
      break
    }
    if (!clipped) break
  }

  if (indices.length === 3) {
    triangles.push([ring[indices[0]], ring[indices[1]], ring[indices[2]]])
  }

  return triangles
}

/** Degree-2 barycentric rule: permutations of (2/3, 1/6, 1/6), each weighted A/3. */
const TRIANGLE_RULE: Array<[number, number, number]> = [
  [2 / 3, 1 / 6, 1 / 6],
  [1 / 6, 2 / 3, 1 / 6],
  [1 / 6, 1 / 6, 2 / 3]
]

export const buildConcreteMesh = (
  section: SectionGeometry,
  options: ConcreteMeshOptions = {}
): ConcreteMesh => {
  const warnings: string[] = []
  const net = netConcreteMultiPolygon(section)
  const exact = multiPolygonProperties(net)
  const emptyReport = (message: string): ConcreteMesh => {
    warnings.push(message)
    return {
      points: [],
      report: {
        cellSize: 0,
        minCaliperWidth: 0,
        gridX: 0,
        gridY: 0,
        cells: 0,
        components: 0,
        triangles: 0,
        points: 0,
        exact,
        meshed: { area: 0, firstMomentX: 0, firstMomentY: 0 },
        areaError: exact.area,
        firstMomentXError: exact.firstMomentX,
        firstMomentYError: exact.firstMomentY,
        discardedArea: 0,
        ok: false,
        warnings
      }
    }
  }

  if (net.length === 0 || Math.abs(exact.area) < 1e-9) return emptyReport('Net concrete region is empty.')

  const outerPoints: Point2[] = section.solids.flatMap((solid) => solid.outer)
  const allPairs = net.flatMap((polygon) => polygon.flatMap((ring) => ringToPairs(ring)))
  const minX = Math.min(...allPairs.map((pair) => pair[0]))
  const maxX = Math.max(...allPairs.map((pair) => pair[0]))
  const minY = Math.min(...allPairs.map((pair) => pair[1]))
  const maxY = Math.max(...allPairs.map((pair) => pair[1]))
  const lRef = Math.max(maxX - minX, maxY - minY, 1)

  const dMin = minCaliperWidth(outerPoints.length >= 3 ? outerPoints : allPairs.map(([x, y]) => ({ x, y })))
  const seed = (dMin > 0 ? dMin : lRef) / Math.max(1, options.seedDivisions ?? DEFAULT_SEED_DIVISIONS)
  const cellSize = Math.max(1e-6, Math.min(options.cellSize ?? seed, options.maxCellSize ?? Number.POSITIVE_INFINITY))

  const gridX = Math.max(1, Math.ceil((maxX - minX) / cellSize))
  const gridY = Math.max(1, Math.ceil((maxY - minY) / cellSize))
  const maxCells = options.maxCells ?? DEFAULT_MAX_CELLS
  if (gridX * gridY > maxCells) {
    return emptyReport(`RESOURCE_LIMIT: ${gridX}x${gridY} cells exceeds the configured limit of ${maxCells}.`)
  }

  const maxSubdivision = options.maxSubdivision ?? DEFAULT_MAX_SUBDIVISION
  const tolArea = Math.max(1e-12 * lRef * lRef, 64 * Number.EPSILON * lRef * lRef)

  const points: MeshQuadraturePoint[] = []
  let components = 0
  let triangles = 0
  let cells = 0
  let discardedArea = 0

  const emitCell = (x0: number, y0: number, size: number, cellI: number, cellJ: number, depth: number) => {
    const cellPolygon: Polygon = [
      [
        [x0, y0],
        [x0 + size, y0],
        [x0 + size, y0 + size],
        [x0, y0 + size],
        [x0, y0]
      ]
    ]

    let pieces: MultiPolygon
    try {
      pieces = polygonClipping.intersection(net, cellPolygon)
    } catch {
      warnings.push(`Clipping failed for cell (${cellI},${cellJ}) at depth ${depth}.`)
      return
    }
    if (pieces.length === 0) return

    // A clipped piece with its own hole cannot be ear-clipped directly; quarter the cell instead.
    if (pieces.some((polygon) => polygon.length > 1)) {
      if (depth < maxSubdivision) {
        const half = size / 2
        emitCell(x0, y0, half, cellI, cellJ, depth + 1)
        emitCell(x0 + half, y0, half, cellI, cellJ, depth + 1)
        emitCell(x0, y0 + half, half, cellI, cellJ, depth + 1)
        emitCell(x0 + half, y0 + half, half, cellI, cellJ, depth + 1)
        return
      }
      warnings.push(`Cell (${cellI},${cellJ}) still contains a hole at maximum subdivision depth.`)
    }

    cells++

    for (const polygon of pieces) {
      // Outer ring only; a surviving inner ring is reported above and its area is tracked as discarded.
      for (let ringIndex = 1; ringIndex < polygon.length; ringIndex++) {
        discardedArea += Math.abs(ringArea(ringToPairs(polygon[ringIndex])))
      }

      const outer = ringToPairs(polygon[0])
      const componentArea = Math.abs(ringArea(outer))
      if (componentArea <= tolArea) {
        discardedArea += componentArea
        continue
      }

      const componentIndex = components++
      const fans = triangulateSimpleRing(outer)
      let triangulatedArea = 0

      fans.forEach((triangle, triangleIndex) => {
        const [a, b, c] = triangle
        const area = ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2
        if (!(area > tolArea)) {
          discardedArea += Math.abs(area)
          return
        }
        triangulatedArea += area
        triangles++
        TRIANGLE_RULE.forEach(([w0, w1, w2], pointIndex) => {
          points.push({
            x: w0 * a[0] + w1 * b[0] + w2 * c[0],
            y: w0 * a[1] + w1 * b[1] + w2 * c[1],
            area: area / 3,
            cellI,
            cellJ,
            depth,
            component: componentIndex,
            triangle: triangleIndex,
            point: pointIndex as 0 | 1 | 2
          })
        })
      })

      if (Math.abs(triangulatedArea - componentArea) > Math.max(tolArea, 1e-9 * componentArea)) {
        warnings.push(
          `Triangulation of component ${componentIndex} in cell (${cellI},${cellJ}) lost ` +
            `${(componentArea - triangulatedArea).toExponential(3)} mm².`
        )
      }
    }
  }

  for (let i = 0; i < gridX; i++) {
    for (let j = 0; j < gridY; j++) {
      emitCell(minX + i * cellSize, minY + j * cellSize, cellSize, i, j, 0)
    }
  }

  // docs/02 §8 — deterministic ordering.
  points.sort(
    (a, b) =>
      a.cellI - b.cellI ||
      a.cellJ - b.cellJ ||
      a.depth - b.depth ||
      a.component - b.component ||
      a.triangle - b.triangle ||
      a.point - b.point
  )

  const meshed = points.reduce(
    (acc, point) => ({
      area: acc.area + point.area,
      firstMomentX: acc.firstMomentX + point.area * point.y,
      firstMomentY: acc.firstMomentY + point.area * point.x
    }),
    { area: 0, firstMomentX: 0, firstMomentY: 0 }
  )

  const areaError = meshed.area - exact.area
  const firstMomentXError = meshed.firstMomentX - exact.firstMomentX
  const firstMomentYError = meshed.firstMomentY - exact.firstMomentY
  const momentScale = Math.abs(exact.area) * lRef

  if (Math.abs(areaError) > Math.max(tolArea, 1e-9 * Math.abs(exact.area))) {
    warnings.push(`Meshed area differs from the exact polygon area by ${areaError.toExponential(3)} mm².`)
  }
  if (Math.abs(firstMomentXError) > Math.max(tolArea * lRef, 1e-9 * momentScale)) {
    warnings.push(`Meshed first moment about x differs by ${firstMomentXError.toExponential(3)} mm³.`)
  }
  if (Math.abs(firstMomentYError) > Math.max(tolArea * lRef, 1e-9 * momentScale)) {
    warnings.push(`Meshed first moment about y differs by ${firstMomentYError.toExponential(3)} mm³.`)
  }
  if (points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y) || !(point.area > 0))) {
    warnings.push('Mesh contains a non-finite coordinate or a non-positive weight.')
  }

  return {
    points,
    report: {
      cellSize,
      minCaliperWidth: dMin,
      gridX,
      gridY,
      cells,
      components,
      triangles,
      points: points.length,
      exact,
      meshed,
      areaError,
      firstMomentXError,
      firstMomentYError,
      discardedArea,
      ok: warnings.length === 0,
      warnings
    }
  }
}
