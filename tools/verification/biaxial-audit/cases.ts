/**
 * Audit sections. Coordinates in mm about an arbitrary global origin; bar areas in mm2.
 * Each case is shared by the production engine (through a native GeometryInput) and by the
 * independent oracle, so both see exactly the same declared geometry.
 */
import type { GeometryInput } from '@pm/geometry'
import type { OracleSection, Point } from './oracle'

export type AuditBar = { x: number; y: number; area: number; dia: number }
export type AuditCase = {
  id: string
  description: string
  outers: Point[][]
  holes: Point[][]
  bars: AuditBar[]
}

const rectangle = (width: number, height: number, cx = 0, cy = 0): Point[] => [
  { x: cx - width / 2, y: cy - height / 2 },
  { x: cx + width / 2, y: cy - height / 2 },
  { x: cx + width / 2, y: cy + height / 2 },
  { x: cx - width / 2, y: cy + height / 2 }
]

const bars = (area: number, dia: number, positions: Array<[number, number]>): AuditBar[] =>
  positions.map(([x, y]) => ({ x, y, area, dia }))

const wallBars = (): Array<[number, number]> => {
  const positions: Array<[number, number]> = []
  for (let row = 0; row < 15; row += 1) {
    const y = -1190 + row * 170
    positions.push([-75, y], [75, y])
  }
  return positions
}

const boxBars = (): Array<[number, number]> => {
  const positions: Array<[number, number]> = []
  for (const value of [-240, -80, 80, 240]) positions.push([value, -240], [value, 240])
  for (const value of [-80, 80]) positions.push([-240, value], [240, value])
  return positions
}

export const AUDIT_CASES: readonly AuditCase[] = [
  {
    id: 'column-400x600',
    description: 'Ordinary rectangular column, 8 bars, symmetric',
    outers: [rectangle(400, 600)],
    holes: [],
    bars: bars(500, 25, [[-140, -240], [0, -240], [140, -240], [-140, 240], [0, 240], [140, 240], [-140, 0], [140, 0]])
  },
  {
    id: 'square-500-corner-bars',
    description: 'Square, 4 corner bars, symmetric control case',
    outers: [rectangle(500, 500)],
    holes: [],
    bars: bars(800, 32, [[-190, -190], [190, -190], [190, 190], [-190, 190]])
  },
  {
    id: 'square-500-L-bars',
    description: 'Square, 5 bars along two faces (asymmetric L layout)',
    outers: [rectangle(500, 500)],
    holes: [],
    bars: bars(800, 32, [[-190, -190], [0, -190], [190, -190], [190, 0], [190, 190]])
  },
  {
    id: 'square-500-L-bars-mirror-x',
    description: 'The L layout mirrored about the x axis',
    outers: [rectangle(500, 500)],
    holes: [],
    bars: bars(800, 32, [[-190, 190], [0, 190], [190, 190], [190, 0], [190, -190]])
  },
  {
    id: 'rect-300x700-short-faces',
    description: 'Rectangle, 4 bars on the two short faces',
    outers: [rectangle(300, 700)],
    holes: [],
    bars: bars(800, 32, [[-90, -290], [90, -290], [-90, 290], [90, 290]])
  },
  {
    id: 'wall-250x2500',
    description: 'Wall, 30 bars in two layers',
    outers: [rectangle(250, 2500)],
    holes: [],
    bars: bars(200, 16, wallBars())
  },
  {
    id: 'L-concrete-600',
    description: 'L-shaped concrete 600 x 600 x 250, 8 bars',
    outers: [[{ x: 0, y: 0 }, { x: 600, y: 0 }, { x: 600, y: 250 }, { x: 250, y: 250 }, { x: 250, y: 600 }, { x: 0, y: 600 }]],
    holes: [],
    bars: bars(400, 22, [[50, 50], [300, 50], [550, 50], [550, 200], [50, 300], [50, 550], [200, 550], [200, 200]])
  },
  {
    id: 'chamfered-600-uneven',
    description: '600 square with 100 x 200 corner cuts; bar hull is a square, so only concrete supports switch off the grid',
    outers: [[
      { x: -200, y: -300 }, { x: 200, y: -300 }, { x: 300, y: -100 }, { x: 300, y: 100 },
      { x: 200, y: 300 }, { x: -200, y: 300 }, { x: -300, y: 100 }, { x: -300, y: -100 }
    ]],
    holes: [],
    bars: bars(500, 25, [[-220, -220], [0, -220], [220, -220], [220, 0], [220, 220], [0, 220], [-220, 220], [-220, 0]])
  },
  {
    id: 'hollow-600-box',
    description: 'Hollow square 600 with a 300 square void, 12 bars',
    outers: [rectangle(600, 600)],
    holes: [rectangle(300, 300)],
    bars: bars(314, 20, boxBars())
  }
]

export const auditCase = (id: string): AuditCase => {
  const found = AUDIT_CASES.find((item) => item.id === id)
  if (!found) throw new Error(`Unknown audit case ${id}.`)
  return found
}

export const oracleSectionOf = (item: AuditCase): OracleSection => ({
  outers: item.outers,
  holes: item.holes,
  bars: item.bars.map(({ x, y, area }) => ({ x, y, area }))
})

/** Native project geometry: one outer per solid, every hole inside the first outer. */
export const geometryInputOf = (item: AuditCase): GeometryInput => {
  let nextPointId = 1
  const ring = (points: Point[]) => points.map((point) => ({ id: nextPointId++, x: point.x, y: point.y }))
  return {
    id: 1,
    name: item.id,
    outers: item.outers.map((outer, index) => ({
      id: index + 1,
      points: ring(outer),
      holes: index === 0 ? item.holes.map((hole, holeIndex) => ({ id: holeIndex + 1, points: ring(hole) })) : []
    })),
    rebars: item.bars.map((bar, index) => ({
      id: index + 1,
      steelMaterialId: 1,
      dia: bar.dia,
      area: bar.area,
      x: bar.x,
      y: bar.y
    }))
  }
}
