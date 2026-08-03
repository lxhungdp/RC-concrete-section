import { nextAvailableId } from './ids'
import type { Point2, SectionGeometry, SectionSolid } from './index'

export type GeometryInputHole = {
  id: number
  points: Point2[]
}

export type GeometryInputOuter = {
  id: number
  points: Point2[]
  holes: GeometryInputHole[]
}

export type GeometryInputRebar = {
  id: number
  steelMaterialId?: number
  dia: number
  x: number
  y: number
}

export type GeometryInputRebarView = GeometryInputRebar & {
  solidIndex: number
}

/** Implicit length unit: mm. Not stored in project JSON. */
export type GeometryInput = {
  id: number
  name: string
  outers: GeometryInputOuter[]
  rebars: GeometryInputRebar[]
}

export const createEmptyGeometryInput = (patch: Partial<Pick<GeometryInput, 'id' | 'name'>> = {}): GeometryInput => ({
  id: patch.id ?? 1,
  name: patch.name ?? 'Geometry input',
  outers: [],
  rebars: []
})

export const clonePoint = (point: Point2): Point2 => ({ ...point })
export const cloneRing = (ring: Point2[]): Point2[] => ring.map(clonePoint)

export const createGeometryInputOuter = (
  id: number,
  points: Point2[],
  holes: GeometryInputHole[] = []
): GeometryInputOuter => ({
  id,
  points: cloneRing(points),
  holes: holes.map((hole) => ({ id: hole.id, points: cloneRing(hole.points) }))
})

type RebarWithOuterIndex = GeometryInputRebar & { solidIndex?: number }

export const cloneRebars = (rebars: GeometryInputRebar[]): GeometryInputRebar[] =>
  rebars.map(({ id, steelMaterialId, dia, x, y }) => ({ id, steelMaterialId, dia, x, y }))

export const geometryInputFromOuterRings = (
  id: number,
  name: string,
  outers: Point2[][][],
  rebars: RebarWithOuterIndex[] = []
): GeometryInput => {
  const usedHoleIds: number[] = []
  return {
    id,
    name,
    outers: outers
      .filter((rings) => (rings[0]?.length ?? 0) >= 3)
      .map((rings, outerIndex) => {
        const holes = rings.slice(1).map((hole) => {
          const holeId = nextAvailableId(usedHoleIds)
          usedHoleIds.push(holeId)
          return { id: holeId, points: cloneRing(hole) }
        })
        return {
          id: outerIndex + 1,
          points: cloneRing(rings[0] ?? []),
          holes
        }
      }),
    rebars: cloneRebars(rebars)
  }
}

export const geometryInputFromSectionGeometry = (
  geometry: SectionGeometry,
  rebars: RebarWithOuterIndex[] = []
): GeometryInput =>
  geometryInputFromOuterRings(
    geometry.id,
    geometry.name,
    geometry.solids.map((solid) => [solid.outer, ...solid.holes]),
    rebars
  )

export const sectionSolidFromGeometryOuter = (outer: GeometryInputOuter): SectionSolid => ({
  outer: cloneRing(outer.points),
  holes: outer.holes.map((hole) => cloneRing(hole.points))
})

export const sectionGeometryFromGeometryInput = (input: GeometryInput): SectionGeometry => ({
  id: input.id,
  name: input.name,
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

export const geometryInputFromSolid = (solid: SectionSolid, id: number): GeometryInputOuter => {
  const usedHoleIds: number[] = []
  return {
    id,
    points: cloneRing(solid.outer),
    holes: solid.holes.map((hole) => {
      const holeId = nextAvailableId(usedHoleIds)
      usedHoleIds.push(holeId)
      return {
        id: holeId,
        points: cloneRing(hole)
      }
    })
  }
}

/** Flat rebar list as analysis/UI views. solidIndex is UI-only (defaults to 0). */
export const geometryInputRebars = (input: GeometryInput): GeometryInputRebarView[] =>
  input.rebars.map((bar) => ({ ...bar, solidIndex: 0 }))

export const updateGeometryInputRebars = (
  input: GeometryInput,
  rebars: RebarWithOuterIndex[]
): GeometryInput => ({
  ...input,
  rebars: cloneRebars(rebars)
})
