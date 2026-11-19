import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  geometryInputRebars,
  sectionGeometryFromGeometryInput,
  type GeometryInput,
  type GeometryInputRebar
} from '@pm/geometry'
import { createDefaultMaterialStore } from '@pm/materials'
import {
  applyCalculationProfileToMaterials,
  createAnalysisOptionsForProfile,
  createDesignBasisForCalculationProfile,
  createProjectDocument,
  serializeProjectDocument,
  type CalculationProfileId,
  type EquivalentBlockAnalysisOptions,
  type LoadCombination
} from '@pm/project'
import { prepareBlockAnalysis } from '@pm/analysis-equivalent-block'

type BlockProfileId = Exclude<CalculationProfileId, 'kds-2024-stress-strain'>
type Point = { x: number; y: number }
type ExampleCase = {
  id: number
  slug: string
  title: string
  geometry: GeometryInput
}

const OUTPUT_DIRECTORY = resolve(process.cwd(), 'docs/examples/equivalent-block')
const FIXED_TIMESTAMP = '2026-08-04T00:00:00.000Z'
const BAR_DIAMETER_FOR_400_MM2 = Math.sqrt(4 * 400 / Math.PI)

const rectangle = (
  width: number,
  height: number,
  cx = 0,
  cy = 0,
  clockwise = false
): Point[] => {
  const points = [
    { x: cx - width / 2, y: cy - height / 2 },
    { x: cx + width / 2, y: cy - height / 2 },
    { x: cx + width / 2, y: cy + height / 2 },
    { x: cx - width / 2, y: cy + height / 2 }
  ]
  return clockwise ? points.reverse() : points
}

const geometryPoints = (points: Point[], startId: number) =>
  points.map((point, index) => ({ id: startId + index, ...point }))

const rebars = (coordinates: Array<[number, number]>): GeometryInputRebar[] =>
  coordinates.map(([x, y], index) => ({
    id: index + 1,
    x,
    y,
    dia: BAR_DIAMETER_FOR_400_MM2,
    steelMaterialId: 1
  }))

const examples: ExampleCase[] = [
  {
    id: 1,
    slug: 'rectangle-8-bars',
    title: 'Rectangle 400 x 500 mm, 8 bars',
    geometry: {
      id: 1,
      name: 'Benchmark 01 - Rectangle 400 x 500 mm, 8 bars',
      outers: [{
        id: 1,
        points: geometryPoints(rectangle(400, 500), 1),
        holes: []
      }],
      rebars: rebars([
        [-150, -200], [0, -200], [150, -200], [150, 0],
        [150, 200], [0, 200], [-150, 200], [-150, 0]
      ])
    }
  },
  {
    id: 2,
    slug: 'hollow-8-bars',
    title: 'Hollow rectangle 600 x 500 mm, 260 x 180 mm void, 8 bars',
    geometry: {
      id: 2,
      name: 'Benchmark 02 - Hollow rectangle 600 x 500 mm, 8 bars',
      outers: [{
        id: 1,
        points: geometryPoints(rectangle(600, 500), 1),
        holes: [{
          id: 1,
          points: geometryPoints(rectangle(260, 180, 0, 0, true), 101)
        }]
      }],
      rebars: rebars([
        [-250, -200], [0, -200], [250, -200], [250, 0],
        [250, 200], [0, 200], [-250, 200], [-250, 0]
      ])
    }
  },
  {
    id: 3,
    slug: 'l-shape-8-bars',
    title: 'L-shaped section, 8 bars',
    geometry: {
      id: 3,
      name: 'Benchmark 03 - L-shaped section, 8 bars',
      outers: [{
        id: 1,
        points: geometryPoints([
          { x: -300, y: -250 }, { x: 300, y: -250 }, { x: 300, y: -50 },
          { x: -50, y: -50 }, { x: -50, y: 300 }, { x: -300, y: 300 }
        ], 1),
        holes: []
      }],
      rebars: rebars([
        [-250, -200], [0, -200], [250, -200], [-250, 0],
        [-250, 250], [-100, -100], [100, -100], [-100, 100]
      ])
    }
  },
  {
    id: 4,
    slug: 'two-islands-8-bars',
    title: 'Two disconnected concrete regions, 8 bars',
    geometry: {
      id: 4,
      name: 'Benchmark 04 - Two disconnected regions, 8 bars',
      outers: [
        { id: 1, points: geometryPoints(rectangle(220, 440, -200, 0), 1), holes: [] },
        { id: 2, points: geometryPoints(rectangle(220, 440, 200, 0), 101), holes: [] }
      ],
      rebars: rebars([
        [-260, -170], [-140, -170], [-140, 170], [-260, 170],
        [140, -170], [260, -170], [260, 170], [140, 170]
      ])
    }
  }
]

const profiles: Array<{ id: BlockProfileId; prefix: 'KDS-EB' | 'ACI-EB' }> = [
  { id: 'kds-142020-equivalent-block', prefix: 'KDS-EB' },
  { id: 'aci-318-19-22-equivalent-block', prefix: 'ACI-EB' }
]

const materialStore = (profileId: BlockProfileId) => {
  const base = createDefaultMaterialStore()
  base.concrete = {
    ...base.concrete,
    name: 'Concrete C40',
    fck: 40
  }
  base.steel = base.steel.map((steel) => ({
    ...steel,
    name: 'Rebar fy 420',
    fy: 420,
    elasticModulus: 200_000
  }))
  return applyCalculationProfileToMaterials(base, profileId)
}

const scaledLoad = (
  id: number,
  name: string,
  factor: number,
  resultants: { P: number; Mx: number; My: number }
): LoadCombination => ({
  id,
  name,
  actionBasis: 'factoredULS',
  P: factor * resultants.P,
  Mx: factor * resultants.Mx,
  My: factor * resultants.My
})

const createAuditLoadings = (
  profileId: BlockProfileId,
  geometry: GeometryInput,
  materials: ReturnType<typeof materialStore>,
  design: ReturnType<typeof createDesignBasisForCalculationProfile>
) => {
  const prepared = prepareBlockAnalysis(
    profileId,
    sectionGeometryFromGeometryInput(geometry),
    geometryInputRebars(geometry),
    materials,
    design
  )
  const evaluator = prepared.model.bindDesignEvaluator(prepared.section)
  const depth = 0.55 * prepared.section.characteristicLength
  const oblique = evaluator({ neutralAxisAngle: 0.47, neutralAxisDepth: depth }).resultants
  const cardinal0 = evaluator({ neutralAxisAngle: 0, neutralAxisDepth: depth }).resultants
  const cardinal90 = evaluator({ neutralAxisAngle: Math.PI / 2, neutralAxisDepth: depth }).resultants
  return {
    combinations: [
      scaledLoad(1, 'Audit ray 55% - NA 26.93 deg, c/D 0.55', 0.55, oblique),
      scaledLoad(2, 'Cardinal audit 85% - NA 0 deg, c/D 0.55', 0.85, cardinal0),
      scaledLoad(3, 'Cardinal audit 85% - NA 90 deg, c/D 0.55', 0.85, cardinal90)
    ]
  }
}

mkdirSync(OUTPUT_DIRECTORY, { recursive: true })

for (const profile of profiles) {
  for (const example of examples) {
    const materials = materialStore(profile.id)
    const design = createDesignBasisForCalculationProfile(profile.id)
    const analysis = createAnalysisOptionsForProfile(profile.id) as EquivalentBlockAnalysisOptions
    const standard = profile.id === 'kds-142020-equivalent-block'
      ? 'KDS 14 20 20:2022'
      : 'ACI 318-19(22)'
    const document = createProjectDocument({
      calculationProfileId: profile.id,
      geometry: example.geometry,
      materials,
      loadings: createAuditLoadings(profile.id, example.geometry, materials, design),
      analysis,
      design,
      meta: {
        id: example.id,
        name: `${profile.prefix} ${example.id.toString().padStart(2, '0')} - ${example.title}`,
        createdAt: FIXED_TIMESTAMP
      }
    })
    document.meta.updatedAt = FIXED_TIMESTAMP
    const fileName = `${profile.prefix}-${example.id.toString().padStart(2, '0')}-${example.slug}.pm-project.json`
    writeFileSync(resolve(OUTPUT_DIRECTORY, fileName), `${serializeProjectDocument(document)}\n`, 'utf8')
  }
}

console.log(`Wrote ${profiles.length * examples.length} equivalent-block project files to ${OUTPUT_DIRECTORY}`)
