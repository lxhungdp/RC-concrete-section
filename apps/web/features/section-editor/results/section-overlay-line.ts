type Point = { x: number; y: number }

/** N.A. and ⊥Rm overlays share one thin dashed stroke, in CSS pixels. */
export const OVERLAY_LINE_WIDTH = 1.5
export const OVERLAY_LINE_DASH: readonly number[] = [6, 4]

/** Overhang of an overlay line beyond the section, as a fraction of the larger section span. */
export const SECTION_LINE_OVERHANG = 0.08

/**
 * Display segment of the infinite line through `point` with direction `direction`, limited to the
 * section and extended by a short overhang at each end. The segment is in world coordinates, so it
 * moves with zoom and pan. The chord runs between the outermost crossings of the section rings; when
 * the line misses the section it spans the section's projection onto the line. Display only.
 */
export const sectionLineSegment = (
  point: Point,
  direction: Point,
  rings: ReadonlyArray<readonly Point[]>,
  overhang = SECTION_LINE_OVERHANG
): [Point, Point] | null => {
  const length = Math.hypot(direction.x, direction.y)
  if (!(length > 1e-15) || !rings.some((ring) => ring.length >= 2)) return null
  const ux = direction.x / length
  const uy = direction.y / length
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  let crossMin = Infinity
  let crossMax = -Infinity
  let shadowMin = Infinity
  let shadowMax = -Infinity
  for (const ring of rings) {
    for (let index = 0; index < ring.length; index++) {
      const a = ring[index]
      const b = ring[(index + 1) % ring.length]
      minX = Math.min(minX, a.x)
      maxX = Math.max(maxX, a.x)
      minY = Math.min(minY, a.y)
      maxY = Math.max(maxY, a.y)
      const along = (a.x - point.x) * ux + (a.y - point.y) * uy
      shadowMin = Math.min(shadowMin, along)
      shadowMax = Math.max(shadowMax, along)
      // Signed distances of the edge ends from the line; a sign change is a crossing.
      const da = (a.x - point.x) * uy - (a.y - point.y) * ux
      const db = (b.x - point.x) * uy - (b.y - point.y) * ux
      if ((da > 0 && db > 0) || (da < 0 && db < 0) || da === db) continue
      const s = da / (da - db)
      const x = a.x + (b.x - a.x) * s
      const y = a.y + (b.y - a.y) * s
      const t = (x - point.x) * ux + (y - point.y) * uy
      crossMin = Math.min(crossMin, t)
      crossMax = Math.max(crossMax, t)
    }
  }
  const crosses = crossMax > crossMin
  const start = crosses ? crossMin : shadowMin
  const end = crosses ? crossMax : shadowMax
  const extra = overhang * Math.max(maxX - minX, maxY - minY)
  return [
    { x: point.x + ux * (start - extra), y: point.y + uy * (start - extra) },
    { x: point.x + ux * (end + extra), y: point.y + uy * (end + extra) }
  ]
}

/**
 * Parts of the infinite line through `point` with direction `direction` that lie inside the section
 * (even-odd over all rings, so holes split the line). No overhang: used for the equivalent-block
 * edge, which is drawn only across the concrete. World coordinates; display only.
 */
export const sectionLineChords = (
  point: Point,
  direction: Point,
  rings: ReadonlyArray<readonly Point[]>
): Array<[Point, Point]> => {
  const length = Math.hypot(direction.x, direction.y)
  if (!(length > 1e-15)) return []
  const ux = direction.x / length
  const uy = direction.y / length
  const crossings: number[] = []
  for (const ring of rings) {
    for (let index = 0; index < ring.length; index++) {
      const a = ring[index]
      const b = ring[(index + 1) % ring.length]
      const da = (a.x - point.x) * uy - (a.y - point.y) * ux
      const db = (b.x - point.x) * uy - (b.y - point.y) * ux
      // Half-open rule: a vertex on the line is counted once.
      if ((da > 0) === (db > 0)) continue
      const s = da / (da - db)
      crossings.push((a.x + (b.x - a.x) * s - point.x) * ux + (a.y + (b.y - a.y) * s - point.y) * uy)
    }
  }
  crossings.sort((left, right) => left - right)
  const chords: Array<[Point, Point]> = []
  for (let index = 0; index + 1 < crossings.length; index += 2) {
    const [t0, t1] = [crossings[index], crossings[index + 1]]
    if (t1 - t0 <= 1e-9) continue
    chords.push([
      { x: point.x + ux * t0, y: point.y + uy * t0 },
      { x: point.x + ux * t1, y: point.y + uy * t1 }
    ])
  }
  return chords
}
