import type { Point2, SectionGeometry, SectionSolid } from './index'

export type Rebar = {
  id: string
  x: number
  y: number
  dia: number
  groupId?: string
  solidIndex?: number
}

export type RebarPatternKind = 'top-bottom' | 'sides' | 'perimeter-spacing'

export type RebarGenerateParams = {
  cover: number
  dia: number
  count?: number
  spacing?: number
  nx?: number
  ny?: number
  topCount?: number
  bottomCount?: number
  leftCount?: number
  rightCount?: number
  x?: number
  y?: number
  solidIndex?: number | 'all'
}

const DEFAULT_DIA = 20
const DEFAULT_COVER = 40

export const makeRebarId = () => `rb-${Math.random().toString(36).slice(2, 9)}`
export const makeRebarGroupId = (kind: string) => `rg-${kind}-${Math.random().toString(36).slice(2, 7)}`

const makeTempId = () => `t-${Math.random().toString(36).slice(2, 9)}`

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const length2 = (x: number, y: number) => Math.hypot(x, y)

const normalize = (x: number, y: number) => {
  const len = length2(x, y)
  if (len < 1e-12) return { x: 0, y: 0 }
  return { x: x / len, y: y / len }
}

const leftNormal = (dx: number, dy: number) => normalize(-dy, dx)

const signedArea = (points: Point2[]) => {
  if (points.length < 3) return 0
  let sum = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    sum += a.x * b.y - b.x * a.y
  }
  return sum / 2
}

const perimeterOf = (points: Point2[]) => {
  if (points.length < 2) return 0
  let sum = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    sum += Math.hypot(b.x - a.x, b.y - a.y)
  }
  return sum
}

const ensureCcw = (ring: Point2[]) => (signedArea(ring) < 0 ? [...ring].reverse() : ring)

const ringBounds = (ring: Point2[]) => {
  const xs = ring.map((p) => p.x)
  const ys = ring.map((p) => p.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2
  }
}

export const offsetRingInward = (ring: Point2[], cover: number): Point2[] => {
  const src = ensureCcw(ring)
  if (src.length < 3 || cover <= 0) return src.map((p) => ({ id: makeTempId(), x: p.x, y: p.y }))

  const n = src.length
  const result: Point2[] = []

  for (let i = 0; i < n; i++) {
    const prev = src[(i - 1 + n) % n]
    const curr = src[i]
    const next = src[(i + 1) % n]
    const e1 = normalize(curr.x - prev.x, curr.y - prev.y)
    const e2 = normalize(next.x - curr.x, next.y - curr.y)
    const n1 = leftNormal(e1.x, e1.y)
    const n2 = leftNormal(e2.x, e2.y)
    let bis = normalize(n1.x + n2.x, n1.y + n2.y)
    if (length2(bis.x, bis.y) < 1e-9) bis = n1

    const cos = clamp(bis.x * n1.x + bis.y * n1.y, 0.15, 1)
    const dist = cover / cos
    result.push({
      id: makeTempId(),
      x: curr.x + bis.x * dist,
      y: curr.y + bis.y * dist
    })
  }

  return result
}

const cumulativeLengths = (ring: Point2[]) => {
  const lengths = [0]
  let total = 0
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    total += Math.hypot(b.x - a.x, b.y - a.y)
    lengths.push(total)
  }
  return { lengths, total }
}

const pointAtArcLength = (ring: Point2[], distance: number) => {
  const { lengths, total } = cumulativeLengths(ring)
  if (total < 1e-9) return { x: ring[0].x, y: ring[0].y }
  const d = ((distance % total) + total) % total
  for (let i = 0; i < ring.length; i++) {
    const segStart = lengths[i]
    const segEnd = lengths[i + 1]
    if (d <= segEnd || i === ring.length - 1) {
      const a = ring[i]
      const b = ring[(i + 1) % ring.length]
      const segLen = Math.max(1e-9, segEnd - segStart)
      const t = (d - segStart) / segLen
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
    }
  }
  return { x: ring[0].x, y: ring[0].y }
}

const barsFromPositions = (
  positions: Array<{ x: number; y: number }>,
  dia: number,
  groupId: string,
  solidIndex: number
): Rebar[] =>
  positions.map((pos) => ({
    id: makeRebarId(),
    x: Math.round(pos.x * 1000) / 1000,
    y: Math.round(pos.y * 1000) / 1000,
    dia,
    groupId,
    solidIndex
  }))

const sampleRingByCount = (ring: Point2[], count: number) => {
  const n = Math.max(1, Math.round(count))
  const peri = perimeterOf(ring)
  if (peri < 1e-9) return [{ x: ring[0].x, y: ring[0].y }]
  const positions: Array<{ x: number; y: number }> = []
  for (let i = 0; i < n; i++) positions.push(pointAtArcLength(ring, (peri * i) / n))
  return positions
}

const sampleRingBySpacing = (ring: Point2[], spacing: number) => {
  const peri = perimeterOf(ring)
  const step = Math.max(1, spacing)
  const count = Math.max(3, Math.round(peri / step))
  return sampleRingByCount(ring, count)
}

const generatePerimeterSpacingBars = (
  solid: SectionSolid,
  params: { cover: number; dia: number; spacing: number },
  solidIndex: number,
  groupId: string
) => {
  const offset = offsetRingInward(solid.outer, Math.max(0, params.cover))
  return barsFromPositions(sampleRingBySpacing(offset, Math.max(1, params.spacing)), params.dia, groupId, solidIndex)
}

const generateTopBottomBars = (
  solid: SectionSolid,
  params: { cover: number; dia: number; topCount: number; bottomCount: number },
  solidIndex: number,
  groupId: string
) => {
  const bounds = ringBounds(solid.outer)
  const cover = Math.max(0, params.cover)
  const left = bounds.minX + cover
  const right = bounds.maxX - cover
  const bottom = bounds.minY + cover
  const top = bounds.maxY - cover
  if (right <= left || top <= bottom) return []

  const distribute = (count: number, y: number) => {
    const n = Math.max(1, Math.round(count))
    const positions: Array<{ x: number; y: number }> = []
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1)
      positions.push({ x: left + (right - left) * t, y })
    }
    return positions
  }

  return barsFromPositions(
    [...distribute(params.bottomCount, bottom), ...distribute(params.topCount, top)],
    params.dia,
    groupId,
    solidIndex
  )
}

const generateSideBars = (
  solid: SectionSolid,
  params: { cover: number; dia: number; leftCount: number; rightCount: number },
  solidIndex: number,
  groupId: string
) => {
  const bounds = ringBounds(solid.outer)
  const cover = Math.max(0, params.cover)
  const left = bounds.minX + cover
  const right = bounds.maxX - cover
  const bottom = bounds.minY + cover
  const top = bounds.maxY - cover
  if (right <= left || top <= bottom) return []

  const distribute = (count: number, x: number) => {
    const n = Math.max(0, Math.round(count))
    if (n <= 0) return []
    const positions: Array<{ x: number; y: number }> = []
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1)
      positions.push({ x, y: bottom + (top - bottom) * t })
    }
    return positions
  }

  return barsFromPositions(
    [...distribute(params.leftCount, left), ...distribute(params.rightCount, right)],
    params.dia,
    groupId,
    solidIndex
  )
}

const selectSolids = (geometry: SectionGeometry, solidIndex: number | 'all' | undefined) => {
  if (geometry.solids.length === 0) return []
  if (solidIndex === undefined || solidIndex === 'all') {
    return geometry.solids.map((solid, index) => ({ solid, index }))
  }
  const solid = geometry.solids[solidIndex]
  return solid ? [{ solid, index: solidIndex }] : []
}

export const generateRebarsForSection = (
  geometry: SectionGeometry,
  kind: RebarPatternKind,
  params: RebarGenerateParams
): Rebar[] => {
  const cover = params.cover ?? DEFAULT_COVER
  const dia = params.dia ?? DEFAULT_DIA
  const groupId = makeRebarGroupId(kind)
  const targets = selectSolids(geometry, params.solidIndex)
  const bars: Rebar[] = []

  for (const { solid, index } of targets) {
    switch (kind) {
      case 'perimeter-spacing':
        bars.push(
          ...generatePerimeterSpacingBars(solid, { cover, dia, spacing: params.spacing ?? 100 }, index, groupId)
        )
        break
      case 'top-bottom': {
        const count = Math.max(1, Math.round(params.count ?? params.topCount ?? 4))
        bars.push(
          ...generateTopBottomBars(
            solid,
            {
              cover,
              dia,
              topCount: params.topCount ?? count,
              bottomCount: params.bottomCount ?? count
            },
            index,
            groupId
          )
        )
        break
      }
      case 'sides': {
        const count = Math.max(1, Math.round(params.count ?? params.leftCount ?? 3))
        bars.push(
          ...generateSideBars(
            solid,
            {
              cover,
              dia,
              leftCount: params.leftCount ?? count,
              rightCount: params.rightCount ?? count
            },
            index,
            groupId
          )
        )
        break
      }
      default:
        break
    }
  }

  return bars
}

export const REBAR_PATTERN_OPTIONS: Array<{
  kind: RebarPatternKind
  label: string
  description: string
}> = [
  { kind: 'top-bottom', label: 'Top / Bottom', description: 'Bars along top and bottom edges' },
  { kind: 'sides', label: 'Left / Right', description: 'Bars along left and right edges' },
  { kind: 'perimeter-spacing', label: 'Spacing', description: 'Around offset perimeter by spacing' }
]
