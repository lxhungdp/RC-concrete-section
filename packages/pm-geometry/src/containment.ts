import type { Point2, SectionGeometry, SectionSolid } from './index'

const BASE_TOLERANCE = 1e-9

const pointOnSegment = (point: Pick<Point2, 'x' | 'y'>, a: Point2, b: Point2, tolerance: number) => {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const length = Math.hypot(dx, dy)
  if (length <= tolerance) return Math.hypot(point.x - a.x, point.y - a.y) <= tolerance
  const cross = Math.abs((point.x - a.x) * dy - (point.y - a.y) * dx)
  if (cross > tolerance * length) return false
  const projection = (point.x - a.x) * dx + (point.y - a.y) * dy
  return projection >= -tolerance * length && projection <= length * length + tolerance * length
}

export const pointInSectionRing = (
  point: Pick<Point2, 'x' | 'y'>,
  ring: readonly Point2[],
  tolerance = BASE_TOLERANCE
) => {
  let inside = false
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const a = ring[previous]
    const b = ring[index]
    if (pointOnSegment(point, a, b, tolerance)) return true
    if ((a.y > point.y) !== (b.y > point.y)) {
      const atX = ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
      if (point.x < atX) inside = !inside
    }
  }
  return inside
}

const centerBelongsToSolid = (
  center: { x: number; y: number },
  solid: SectionSolid,
  tolerance: number
) => {
  if (!pointInSectionRing(center, solid.outer, tolerance)) return false
  if (solid.holes.some((hole) => pointInSectionRing(center, hole, tolerance))) return false
  return true
}

/** True when the bar centre belongs to one concrete solid and no void, matching both mechanics. */
export const rebarCenterInConcrete = (
  bar: { x: number; y: number; dia: number },
  section: SectionGeometry
) => {
  if (!Number.isFinite(bar.x) || !Number.isFinite(bar.y) || !Number.isFinite(bar.dia) || bar.dia <= 0) return false
  const coordinates = section.solids.flatMap((solid) => [solid.outer, ...solid.holes]).flat()
  const xs = coordinates.map((point) => point.x)
  const ys = coordinates.map((point) => point.y)
  const characteristicLength = coordinates.length === 0
    ? 1
    : Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 1)
  const tolerance = BASE_TOLERANCE * characteristicLength
  return section.solids.some((solid) => centerBelongsToSolid({ x: bar.x, y: bar.y }, solid, tolerance))
}
