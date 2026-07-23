/**
 * Reference verification case, transcribed from `docs/example case/PM-advanced (7) 2D.xlsx`.
 *
 * Sheet `2D (15deg)` rows 28-42 supply the geometry and bars; sheet `Input` supplies the materials;
 * sheet `Newton` A4:D6 supplies the demand that sits exactly on the 15-degree capacity surface.
 *
 * One definition feeds both the station selftest and the exported project JSON, so the file a user
 * imports is provably the same section the tests verify.
 */
import type { GeometryInput, GeometryInputRebar, Point2 } from '@pm/geometry'
import { createKdsConcrete, createKdsRebarSteel, type MaterialStore } from '@pm/materials'
import {
  createLoadCombination,
  createProjectDocument,
  type LoadingsInput,
  type PmProjectDocument
} from '@pm/project'

const KN = 1e3
const KNM = 1e6

/** Sequential point ids across the whole geometry so ring membership stays readable in the JSON. */
const ringFrom = (firstId: number, coords: Array<[number, number]>): Point2[] =>
  coords.map(([x, y], index) => ({ id: firstId + index, x, y }))

/** Sheet `2D (15deg)` rows 28-29 — outer boundary, 1500 x 1200 with 200 mm chamfers. */
const OUTER = ringFrom(1, [
  [-550, 600],
  [550, 600],
  [750, 400],
  [750, -400],
  [550, -600],
  [-550, -600],
  [-750, -400],
  [-750, 400]
])

/** Sheet `2D (15deg)` rows 32-33 — left void. */
const HOLE_1 = ringFrom(101, [
  [-450, 400],
  [-250, 400],
  [-150, 300],
  [-150, -300],
  [-250, -400],
  [-450, -400],
  [-550, -300],
  [-550, 300]
])

/** Sheet `2D (15deg)` rows 36-37 — right void. */
const HOLE_2 = ringFrom(201, [
  [250, 400],
  [450, 400],
  [550, 300],
  [550, -300],
  [450, -400],
  [250, -400],
  [150, -300],
  [150, 300]
])

/** Sheet `2D (15deg)` rows 40-42 — 18 x D32. */
const REBAR_POSITIONS: Array<[number, number]> = [
  [-400, 530],
  [-200, 530],
  [0, 530],
  [200, 530],
  [400, 530],
  [-400, -530],
  [-200, -530],
  [0, -530],
  [200, -530],
  [400, -530],
  [-680, 300],
  [-680, 100],
  [-680, -100],
  [-680, -300],
  [680, 300],
  [680, 100],
  [680, -100],
  [680, -300]
]

const REBARS: GeometryInputRebar[] = REBAR_POSITIONS.map(([x, y], index) => ({
  id: index + 1,
  steelMaterialId: 1,
  dia: 32,
  x,
  y
}))

export const REFERENCE_NET_AREA = 1120000

export const referenceGeometryInput = (): GeometryInput => ({
  id: 1,
  name: 'PM-advanced (7) 2D — 1500x1200 chamfered section, two voids',
  outers: [
    {
      id: 1,
      points: OUTER.map((point) => ({ ...point })),
      holes: [
        { id: 1, points: HOLE_1.map((point) => ({ ...point })) },
        { id: 2, points: HOLE_2.map((point) => ({ ...point })) }
      ],
      rebars: REBARS.map((rebar) => ({ ...rebar }))
    }
  ]
})

/** Sheet `Input`: fck 30 MPa, epsCu 0.0033, eps0 0.002, n 2, alpha 0.85, Es 200000, fy 400. */
export const referenceMaterialStore = (): MaterialStore => ({
  strainSign: 'compression-positive',
  concrete: createKdsConcrete({ name: 'KDS C30 (workbook Input)', fck: 30 }),
  steel: [createKdsRebarSteel({ id: 1, name: 'SD400 (workbook Input)', fy: 400, elasticModulus: 200000 })],
  defaults: { steelMaterialId: 1 }
})

/**
 * Demand cases. `ULS-1` is the sheet `Newton` demand, which equals the nominal P5 station at
 * 15 degrees, so a correct engine must report utilization 1.0 and recover
 * `eps0 = 1.5186813783709277e-3`, `kx = 2.3834429019879034e-6`, `ky = 6.386416007933503e-7`.
 */
export const referenceLoadings = (): LoadingsInput => ({
  combinations: [
    createLoadCombination({
      id: 1,
      name: 'ULS-1 workbook Newton demand (on the 15 deg surface)',
      P: 24942.922102452183 * KN,
      Mx: 3714.165943842699 * KNM,
      My: 1431.7807276950741 * KNM
    }),
    createLoadCombination({
      id: 2,
      name: 'ULS-2 same axial, half moment (inside)',
      P: 24942.922102452183 * KN,
      Mx: 1857.0829719213495 * KNM,
      My: 715.890363847537 * KNM
    }),
    createLoadCombination({
      id: 3,
      name: 'ULS-3 low axial, high moment',
      P: 5000 * KN,
      Mx: 4000 * KNM,
      My: 1500 * KNM
    })
  ]
})

export const referenceProjectDocument = (): PmProjectDocument =>
  createProjectDocument({
    geometry: referenceGeometryInput(),
    materials: referenceMaterialStore(),
    loadings: referenceLoadings(),
    meta: {
      id: 1,
      name: 'PM-advanced (7) 2D reference case',
      createdAt: '2026-07-23T00:00:00.000Z'
    }
  })
