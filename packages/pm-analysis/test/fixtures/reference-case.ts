/**
 * Deterministic complex-section fixture for software regression and invariant tests.
 *
 * This fixture is not an external comparison oracle and makes no engineering-validation claim.
 * One definition feeds both automated tests and the importable public example so they cannot drift.
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

/** Outer boundary: 1500 x 1200 with 200 mm chamfers. */
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

/** Left void. */
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

/** Right void. */
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

/** Symmetric 18 x D32 reinforcement layout. */
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
  name: 'KDS complex stress-strain — 1500x1200 chamfered section, two voids',
  outers: [
    {
      id: 1,
      points: OUTER.map((point) => ({ ...point })),
      holes: [
        { id: 1, points: HOLE_1.map((point) => ({ ...point })) },
        { id: 2, points: HOLE_2.map((point) => ({ ...point })) }
      ]
    }
  ],
  rebars: REBARS.map((rebar) => ({ ...rebar }))
})

/** KDS C30 concrete and SD400 reinforcement used by the current preview profile. */
export const referenceMaterialStore = (): MaterialStore => ({
  strainSign: 'compression-positive',
  concrete: createKdsConcrete({ name: 'KDS C30', fck: 30 }),
  steel: [createKdsRebarSteel({ id: 1, name: 'SD400', fy: 400, elasticModulus: 200000 })],
  defaults: { steelMaterialId: 1 }
})

/**
 * Deterministic factored load combinations for current preview checks. They are regression inputs,
 * not externally certified capacity points.
 */
export const referenceLoadings = (): LoadingsInput => ({
  combinations: [
    createLoadCombination({
      id: 1,
      name: 'ULS-1 high axial biaxial demand',
      P: 24942.922102452183 * KN,
      Mx: 3714.165943842699 * KNM,
      My: 1431.7807276950741 * KNM
    }),
    createLoadCombination({
      id: 2,
      name: 'ULS-2 same axial, half moment',
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
      name: 'KDS complex stress-strain regression example',
      information: {
        client: 'Public software example',
        company: 'P-M Column Designer',
        designedBy: 'Engineering example',
        checkedBy: 'Unverified preview',
        address: 'Seoul, Korea',
        date: '2026-09-03'
      },
      createdAt: '2026-09-03T00:00:00.000Z'
    }
  })
