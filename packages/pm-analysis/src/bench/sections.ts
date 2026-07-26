/**
 * Benchmark fixtures required by `docs/08` §8: an ordinary compact section, a hollow/thin-feature
 * section, an asymmetric section with many bars, plus the verified reference case.
 *
 * These are also the correctness fixtures for any optimisation: a change that speeds the kernel up
 * must reproduce every one of these to the last bit, so the set deliberately spans convex/concave
 * outlines, holes, dense vertex counts and very different `Dmin` (and therefore mesh density).
 */
import {
  geometryInputFromOuterRings,
  type GeometryInput,
  type GeometryInputRebar,
  type Point2
} from '@pm/geometry'
import { createKdsConcrete, createKdsRebarSteel, type MaterialStore } from '@pm/materials'
import { referenceGeometryInput, referenceMaterialStore } from '../reference-case'

export type BenchCase = {
  key: string
  title: string
  geometry: GeometryInput
  materials: MaterialStore
  /** Axial levels used for the fixed-P contour timings, N. */
  contourLevels: number[]
  /** Demand used for the inverse-solver timing, N and N·mm. */
  demand: { P: number; Mx: number; My: number }
}

const KN = 1e3
const KNM = 1e6

let pointId = 0
const ring = (coords: Array<[number, number]>): Point2[] =>
  coords.map(([x, y]) => ({ id: ++pointId, x, y }))

const circleRing = (radius: number, segments: number, cx = 0, cy = 0, clockwise = false): Point2[] =>
  ring(
    Array.from({ length: segments }, (_, index) => {
      const angle = ((clockwise ? -index : index) / segments) * Math.PI * 2
      // Same 3-decimal quantisation the geometry package applies to generated rings.
      const round = (value: number) => Math.round(value * 1000) / 1000
      return [round(cx + radius * Math.cos(angle)), round(cy + radius * Math.sin(angle))] as [number, number]
    })
  )

let rebarId = 0
const bars = (positions: Array<[number, number]>, dia: number): GeometryInputRebar[] =>
  positions.map(([x, y]) => ({ id: ++rebarId, steelMaterialId: 1, dia, x, y }))

/** Bars spread evenly along the perimeter of a rectangle, corners included once. */
const perimeterBars = (halfWidth: number, halfHeight: number, perSide: number, dia: number) => {
  const positions: Array<[number, number]> = []
  const lerp = (a: number, b: number, i: number, n: number) => a + ((b - a) * i) / n
  for (let i = 0; i < perSide; i++) positions.push([lerp(-halfWidth, halfWidth, i, perSide), -halfHeight])
  for (let i = 0; i < perSide; i++) positions.push([halfWidth, lerp(-halfHeight, halfHeight, i, perSide)])
  for (let i = 0; i < perSide; i++) positions.push([lerp(halfWidth, -halfWidth, i, perSide), halfHeight])
  for (let i = 0; i < perSide; i++) positions.push([-halfWidth, lerp(halfHeight, -halfHeight, i, perSide)])
  return positions
}

const ringBars = (radius: number, count: number, dia: number) =>
  bars(
    Array.from({ length: count }, (_, index) => {
      const angle = (index / count) * Math.PI * 2
      const round = (value: number) => Math.round(value * 1000) / 1000
      return [round(radius * Math.cos(angle)), round(radius * Math.sin(angle))] as [number, number]
    }),
    dia
  )

const defaultMaterials = (): MaterialStore => ({
  strainSign: 'compression-positive',
  concrete: createKdsConcrete({ name: 'KDS C30', fck: 30 }),
  steel: [createKdsRebarSteel({ id: 1, name: 'SD400', fy: 400, elasticModulus: 200000 })],
  defaults: { steelMaterialId: 1 }
})

/** High-strength concrete exercises the `n < 2` branch of the KDS parabola. */
const highStrengthMaterials = (): MaterialStore => ({
  strainSign: 'compression-positive',
  concrete: createKdsConcrete({ name: 'KDS C60', fck: 60 }),
  steel: [createKdsRebarSteel({ id: 1, name: 'SD500', fy: 500, elasticModulus: 200000 })],
  defaults: { steelMaterialId: 1 }
})

/** A tabulated law: the interpolation path has a different hot loop from the closed forms. */
const userCurveMaterials = (): MaterialStore => {
  const base = defaultMaterials()
  const fck = base.concrete.fck
  const points = Array.from({ length: 21 }, (_, index) => {
    const strain = (0.0033 * index) / 20
    const eps0 = 0.002
    const stress =
      strain <= eps0 ? 0.85 * fck * (1 - Math.pow(1 - strain / eps0, 2)) : 0.85 * fck
    return { strain, stress }
  })
  return {
    ...base,
    concrete: {
      ...base.concrete,
      name: 'Tabulated C30',
      standard: 'CUSTOM',
      stressStrain: { type: 'user-curve', interpolation: 'linear', zeroTension: true, points }
    }
  }
}

const buildCases = (): BenchCase[] => {
  const cases: BenchCase[] = []

  cases.push({
    key: 'reference',
    title: 'Reference case — 1500x1200 chamfered, two voids, 18 bars',
    geometry: referenceGeometryInput(),
    materials: referenceMaterialStore(),
    contourLevels: [24942.9 * KN, 10000 * KN, 0, -3000 * KN],
    demand: { P: 24942.922102452183 * KN, Mx: 3714.165943842699 * KNM, My: 1431.7807276950741 * KNM }
  })

  cases.push({
    key: 'square-compact',
    title: 'Compact 600x600 square, 12 bars',
    geometry: geometryInputFromOuterRings(
      2,
      'square-compact',
      [[ring([[-300, -300], [300, -300], [300, 300], [-300, 300]])]],
      bars(perimeterBars(240, 240, 3, 25), 25)
    ),
    materials: defaultMaterials(),
    contourLevels: [6000 * KN, 2000 * KN, 0],
    demand: { P: 3000 * KN, Mx: 300 * KNM, My: 120 * KNM }
  })

  cases.push({
    key: 'tall-rectangle-dense',
    title: 'Asymmetric 1000x2500 wall, 60 bars, mixed diameters',
    geometry: geometryInputFromOuterRings(
      3,
      'tall-rectangle-dense',
      [[ring([[-500, -1250], [500, -1250], [500, 1250], [-500, 1250]])]],
      [
        ...bars(perimeterBars(430, 1180, 15, 32), 32),
        // Deliberately off-centre inner layer: no symmetry to hide a sign error behind.
        ...bars(
          Array.from({ length: 8 }, (_, index) => [-200 + index * 30, -600 + index * 150] as [number, number]),
          20
        )
      ]
    ),
    materials: highStrengthMaterials(),
    contourLevels: [30000 * KN, 10000 * KN, 0, -8000 * KN],
    demand: { P: 12000 * KN, Mx: 4000 * KNM, My: 400 * KNM }
  })

  cases.push({
    key: 'circular',
    title: 'Circular D900, 64-gon, 20 bars',
    geometry: geometryInputFromOuterRings(
      4,
      'circular',
      [[circleRing(450, 64)]],
      ringBars(370, 20, 25)
    ),
    materials: defaultMaterials(),
    contourLevels: [12000 * KN, 4000 * KN, 0],
    demand: { P: 5000 * KN, Mx: 900 * KNM, My: 350 * KNM }
  })

  cases.push({
    key: 'hollow-circular',
    title: 'Hollow circular D1800/D1200 pier, 32 bars',
    geometry: geometryInputFromOuterRings(
      5,
      'hollow-circular',
      [[circleRing(900, 96), circleRing(600, 96, 0, 0, true)]],
      [...ringBars(840, 20, 32), ...ringBars(660, 12, 25)]
    ),
    materials: defaultMaterials(),
    contourLevels: [25000 * KN, 8000 * KN, 0],
    demand: { P: 9000 * KN, Mx: 3000 * KNM, My: 1200 * KNM }
  })

  cases.push({
    key: 'thin-box',
    title: 'Thin-walled box 3000x2000, 250 mm walls — small Dmin, dense mesh',
    geometry: geometryInputFromOuterRings(
      6,
      'thin-box',
      [
        [
          ring([[-1500, -1000], [1500, -1000], [1500, 1000], [-1500, 1000]]),
          ring([[-1250, -750], [-1250, 750], [1250, 750], [1250, -750]])
        ]
      ],
      bars(perimeterBars(1400, 900, 10, 25), 25)
    ),
    materials: defaultMaterials(),
    contourLevels: [20000 * KN, 5000 * KN, 0],
    demand: { P: 8000 * KN, Mx: 6000 * KNM, My: 2500 * KNM }
  })

  cases.push({
    key: 'l-shape',
    title: 'Concave L-shaped core, 22 bars',
    geometry: geometryInputFromOuterRings(
      7,
      'l-shape',
      [
        [
          ring([
            [-800, -800],
            [800, -800],
            [800, -300],
            [-300, -300],
            [-300, 800],
            [-800, 800]
          ])
        ]
      ],
      bars(
        [
          ...Array.from({ length: 7 }, (_, i) => [-720 + i * 240, -720] as [number, number]),
          ...Array.from({ length: 4 }, (_, i) => [720, -720 + i * 140] as [number, number]),
          ...Array.from({ length: 5 }, (_, i) => [-360 - i * 0 + i * 0, -380 + i * 240] as [number, number]),
          ...Array.from({ length: 6 }, (_, i) => [-720, 720 - i * 240] as [number, number])
        ],
        22
      )
    ),
    materials: defaultMaterials(),
    contourLevels: [12000 * KN, 3000 * KN, 0],
    demand: { P: 4000 * KN, Mx: 1200 * KNM, My: -900 * KNM }
  })

  cases.push({
    key: 'tabulated-law',
    title: 'Reference geometry with a 21-point tabulated concrete law',
    geometry: referenceGeometryInput(),
    materials: userCurveMaterials(),
    contourLevels: [20000 * KN, 5000 * KN, 0],
    demand: { P: 15000 * KN, Mx: 3000 * KNM, My: 1000 * KNM }
  })

  return cases
}

export const BENCH_CASES = buildCases()
