import type { Point2, SectionGeometry, SectionSolid } from './index'

export type GeometryInputHole = {
  id: string
  points: Point2[]
}

export type GeometryInputOuter = {
  id: string
  points: Point2[]
  holes: GeometryInputHole[]
  rebars: GeometryInputRebar[]
}

export type GeometryInputRebar = {
  id: string
  dia: number
  x: number
  y: number
}

export type GeometryInputRebarView = GeometryInputRebar & {
  solidIndex: number
}

export type GeometryInput = {
  id: string
  name: string
  unit: 'mm'
  outers: GeometryInputOuter[]
}

export const createEmptyGeometryInput = (patch: Partial<Pick<GeometryInput, 'id' | 'name'>> = {}): GeometryInput => ({
  id: patch.id ?? 'geometry-input-1',
  name: patch.name ?? 'Geometry input',
  unit: 'mm',
  outers: []
})

export const clonePoint = (point: Point2): Point2 => ({ ...point })
export const cloneRing = (ring: Point2[]): Point2[] => ring.map(clonePoint)

export const createGeometryInputOuter = (
  id: string,
  points: Point2[],
  holes: GeometryInputHole[] = [],
  rebars: GeometryInputRebar[] = []
): GeometryInputOuter => ({
  id,
  points: cloneRing(points),
  holes: holes.map((hole) => ({ id: hole.id, points: cloneRing(hole.points) })),
  rebars: cloneRebars(rebars)
})

type RebarWithOuterIndex = GeometryInputRebar & { solidIndex?: number }

export const cloneRebars = (rebars: GeometryInputRebar[]): GeometryInputRebar[] =>
  rebars.map(({ id, dia, x, y }) => ({ id, dia, x, y }))

const rebarsForOuter = (rebars: RebarWithOuterIndex[], outerIndex: number) =>
  rebars
    .filter((bar) => (Number.isFinite(bar.solidIndex) ? bar.solidIndex === outerIndex : outerIndex === 0))
    .map(({ id, dia, x, y }) => ({ id, dia, x, y }))

export const geometryInputFromSectionGeometry = (
  geometry: SectionGeometry,
  rebars: RebarWithOuterIndex[] = []
): GeometryInput => ({
  id: geometry.id,
  name: geometry.name,
  unit: geometry.unit,
  outers: geometry.solids.map((solid, outerIndex) => ({
    id: `outer-${outerIndex + 1}`,
    points: cloneRing(solid.outer),
    holes: solid.holes.map((hole, holeIndex) => ({
      id: `outer-${outerIndex + 1}-hole-${holeIndex + 1}`,
      points: cloneRing(hole)
    })),
    rebars: rebarsForOuter(rebars, outerIndex)
  }))
})

export const sectionSolidFromGeometryOuter = (outer: GeometryInputOuter): SectionSolid =>
  ({
    outer: cloneRing(outer.points),
    holes: outer.holes.map((hole) => cloneRing(hole.points))
  })

export const sectionGeometryFromGeometryInput = (input: GeometryInput): SectionGeometry => ({
  id: input.id,
  name: input.name,
  unit: input.unit,
  solids: input.outers
    .filter((outer) => outer.points.length >= 3)
    .map(sectionSolidFromGeometryOuter)
})

export const geometryInputOuterToRings = (outer: GeometryInputOuter): Point2[][] => [
  outer.points,
  ...outer.holes.map((hole) => hole.points)
]

export const geometryInputToRings = (input: GeometryInput): Point2[][][] =>
  input.outers.map((outer) => geometryInputOuterToRings(outer))

export const geometryInputFromSolid = (solid: SectionSolid, id: string): GeometryInputOuter => {
  return {
    id,
    points: cloneRing(solid.outer),
    holes: solid.holes.map((hole, index) => ({
      id: `${id}-hole-${index + 1}`,
      points: cloneRing(hole)
    })),
    rebars: []
  }
}

export const geometryInputRebars = (input: GeometryInput): GeometryInputRebarView[] =>
  input.outers.flatMap((outer, solidIndex) =>
    outer.rebars.map((bar) => ({ ...bar, solidIndex }))
  )

export const updateGeometryInputRebars = (
  input: GeometryInput,
  rebars: RebarWithOuterIndex[]
): GeometryInput => ({
  ...input,
  outers: input.outers.map((outer, index) => ({
    ...outer,
    rebars: rebarsForOuter(rebars, index)
  }))
})
