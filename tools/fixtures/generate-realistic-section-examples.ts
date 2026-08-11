import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  geometryInputRebars,
  rebarCenterInConcrete,
  sectionGeometryFromGeometryInput,
  summarizeSection,
  type GeometryInput,
  type GeometryInputRebar
} from '@pm/geometry'
import { createDefaultMaterialStore } from '@pm/materials'
import {
  buildEquivalentBlockDesignSurfaceFromPrepared,
  prepareBlockAnalysis,
  solveEquivalentBlockDemandFromPrepared
} from '@pm/analysis-equivalent-block'
import {
  applyCalculationProfileToMaterials,
  createAnalysisOptionsForProfile,
  createDesignBasisForCalculationProfile,
  createProjectDocument,
  parseProjectDocument,
  serializeProjectDocument,
  type EquivalentBlockAnalysisOptions,
  type LoadCombination
} from '@pm/project'

type Point = { x: number; y: number }
type ProfileId = 'kds-142020-equivalent-block' | 'aci-318-19-22-equivalent-block'
type ExampleSpec = {
  id: number
  fileName: string
  title: string
  profileId: ProfileId
  geometry: GeometryInput
  minimumClearCover: number
}

const OUTPUT_DIRECTORY = resolve(process.cwd(), 'docs/examples/realistic-sections')
const FIXED_TIMESTAMP = '2026-08-12T00:00:00.000Z'
const D25 = 25
const D29 = 29
const SQRT_2 = Math.sqrt(2)

const geometryPoints = (points: Point[], startId: number) =>
  points.map((point, index) => ({ id: startId + index, ...point }))

const chamferedRectangle = (
  width: number,
  height: number,
  chamfer: number,
  cx = 0,
  cy = 0,
  clockwise = false
): Point[] => {
  const x = width / 2
  const y = height / 2
  const points = [
    { x: cx - x + chamfer, y: cy - y },
    { x: cx + x - chamfer, y: cy - y },
    { x: cx + x, y: cy - y + chamfer },
    { x: cx + x, y: cy + y - chamfer },
    { x: cx + x - chamfer, y: cy + y },
    { x: cx - x + chamfer, y: cy + y },
    { x: cx - x, y: cy + y - chamfer },
    { x: cx - x, y: cy - y + chamfer }
  ]
  return clockwise ? points.reverse() : points
}

/** Parallel 45-degree chamfer after moving every face by `offset`. */
const offsetChamferedRectangle = (
  width: number,
  height: number,
  chamfer: number,
  offset: number,
  direction: 'inward' | 'outward'
) => {
  const sign = direction === 'inward' ? -1 : 1
  const adjustedChamfer = chamfer + sign * (2 - SQRT_2) * offset
  return chamferedRectangle(
    width + sign * 2 * offset,
    height + sign * 2 * offset,
    adjustedChamfer
  )
}

const circularRing = (
  radius: number,
  segments: number,
  cx = 0,
  cy = 0,
  clockwise = false
): Point[] => {
  const points = Array.from({ length: segments }, (_unused, index) => {
    const angle = -Math.PI / 2 + 2 * Math.PI * index / segments
    return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) }
  })
  return clockwise ? points.reverse() : points
}

const sampleClosedPolyline = (points: Point[], maximumSpacing: number): Point[] => {
  const samples: Point[] = []
  for (let index = 0; index < points.length; index += 1) {
    const start = points[index]
    const end = points[(index + 1) % points.length]
    const divisions = Math.max(1, Math.ceil(Math.hypot(end.x - start.x, end.y - start.y) / maximumSpacing))
    for (let step = 0; step < divisions; step += 1) {
      const ratio = step / divisions
      samples.push({
        x: start.x + ratio * (end.x - start.x),
        y: start.y + ratio * (end.y - start.y)
      })
    }
  }
  return samples
}

const circularBars = (radius: number, count: number, diameter: number, cx = 0, cy = 0) =>
  Array.from({ length: count }, (_unused, index) => {
    const angle = -Math.PI / 2 + 2 * Math.PI * index / count
    return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle), dia: diameter }
  })

const lineCoordinates = (from: number, to: number, count: number) =>
  Array.from({ length: count }, (_unused, index) => from + (to - from) * index / (count - 1))

const rebars = (bars: Array<Point & { dia: number }>): GeometryInputRebar[] =>
  bars.map((bar, index) => ({ id: index + 1, steelMaterialId: 1, ...bar }))

const hollowChamferedGeometry = (): GeometryInput => {
  const outer = chamferedRectangle(1800, 1200, 150)
  const hole = chamferedRectangle(1100, 500, 80, 0, 0, true)
  const outerCage = sampleClosedPolyline(offsetChamferedRectangle(1800, 1200, 150, 75, 'inward'), 230)
  const innerCage = sampleClosedPolyline(offsetChamferedRectangle(1100, 500, 80, 75, 'outward'), 230)
  return {
    id: 101,
    name: 'Chamfered hollow 1800 x 1200 mm; 350 mm walls; two D25 cages; 50 mm nominal cover',
    outers: [{
      id: 1,
      points: geometryPoints(outer, 1),
      holes: [{ id: 1, points: geometryPoints(hole, 101) }]
    }],
    rebars: rebars([...outerCage, ...innerCage].map((point) => ({ ...point, dia: D25 })))
  }
}

const longTwoVoidsGeometry = (): GeometryInput => {
  const outer = chamferedRectangle(4200, 1600, 180)
  const outerCage = sampleClosedPolyline(offsetChamferedRectangle(4200, 1600, 180, 80, 'inward'), 240)
  const holeCenters = [-1150, 1150]
  const holeCages = holeCenters.flatMap((cx) => circularBars(550, 18, D25, cx, 0))
  return {
    id: 102,
    name: 'Chamfered 4200 x 1600 mm section; two 950 mm circular voids; D29/D25 cages; 50 mm nominal cover',
    outers: [{
      id: 1,
      points: geometryPoints(outer, 1),
      holes: holeCenters.map((cx, index) => ({
        id: index + 1,
        points: geometryPoints(circularRing(475, 48, cx, 0, true), 101 + 100 * index)
      }))
    }],
    rebars: rebars([
      ...outerCage.map((point) => ({ ...point, dia: D29 })),
      ...holeCages
    ])
  }
}

const hSectionGeometry = (): GeometryInput => {
  const outer = [
    { x: -900, y: -1000 }, { x: 900, y: -1000 },
    { x: 900, y: -650 }, { x: 200, y: -650 },
    { x: 200, y: 650 }, { x: 900, y: 650 },
    { x: 900, y: 1000 }, { x: -900, y: 1000 },
    { x: -900, y: 650 }, { x: -200, y: 650 },
    { x: -200, y: -650 }, { x: -900, y: -650 }
  ]
  const flangeBars = [-920, -730, 730, 920].flatMap((y) =>
    lineCoordinates(-820, 820, 8).map((x) => ({ x, y, dia: D29 })))
  const webBars = [-120, 120].flatMap((x) =>
    lineCoordinates(-500, 500, 5).map((y) => ({ x, y, dia: D29 })))
  return {
    id: 103,
    name: 'H-section 1800 x 2000 mm; 350 mm flanges; 400 mm web; two-layer D29 reinforcement',
    outers: [{ id: 1, points: geometryPoints(outer, 1), holes: [] }],
    rebars: rebars([...flangeBars, ...webBars])
  }
}

const circularAnnulusGeometry = (): GeometryInput => ({
  id: 104,
  name: 'Circular annulus OD 2000 mm / ID 900 mm; inner and outer D29 cages; 50 mm nominal cover',
  outers: [{
    id: 1,
    points: geometryPoints(circularRing(1000, 72), 1),
    holes: [{ id: 1, points: geometryPoints(circularRing(450, 72, 0, 0, true), 101) }]
  }],
  rebars: rebars([
    ...circularBars(920, 24, D29),
    ...circularBars(525, 12, D29)
  ])
})

const examples: ExampleSpec[] = [
  {
    id: 101,
    fileName: 'KDS-REAL-01-chamfered-hollow.pm-project.json',
    title: 'KDS realistic 01 - Chamfered hollow section',
    profileId: 'kds-142020-equivalent-block',
    geometry: hollowChamferedGeometry(),
    minimumClearCover: 60
  },
  {
    id: 102,
    fileName: 'KDS-REAL-02-chamfered-two-circular-voids.pm-project.json',
    title: 'KDS realistic 02 - Long chamfered section with two circular voids',
    profileId: 'kds-142020-equivalent-block',
    geometry: longTwoVoidsGeometry(),
    minimumClearCover: 60
  },
  {
    id: 103,
    fileName: 'KDS-REAL-03-h-section.pm-project.json',
    title: 'KDS realistic 03 - Reinforced concrete H-section',
    profileId: 'kds-142020-equivalent-block',
    geometry: hSectionGeometry(),
    minimumClearCover: 60
  },
  {
    id: 104,
    fileName: 'ACI-REAL-04-circular-annulus.pm-project.json',
    title: 'ACI realistic 04 - Circular annular section',
    profileId: 'aci-318-19-22-equivalent-block',
    geometry: circularAnnulusGeometry(),
    minimumClearCover: 60
  }
]

const materialStore = (profileId: ProfileId) => {
  const base = createDefaultMaterialStore()
  base.concrete = { ...base.concrete, name: 'Concrete C40', fck: 40 }
  base.steel = base.steel.map((steel) => ({
    ...steel,
    name: profileId.startsWith('kds-') ? 'SD400 longitudinal reinforcement' : 'Grade 60 longitudinal reinforcement',
    fy: profileId.startsWith('kds-') ? 400 : 420,
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

const createLoadings = (
  spec: ExampleSpec,
  materials: ReturnType<typeof materialStore>,
  design: ReturnType<typeof createDesignBasisForCalculationProfile>
) => {
  const section = sectionGeometryFromGeometryInput(spec.geometry)
  const prepared = prepareBlockAnalysis(
    spec.profileId,
    section,
    geometryInputRebars(spec.geometry),
    materials,
    design
  )
  const evaluator = prepared.model.bindDesignEvaluator(prepared.section)
  const depth = 0.55 * prepared.section.characteristicLength
  return {
    combinations: [
      scaledLoad(1, 'ULS biaxial demand - 55% of reference capacity', 0.55,
        evaluator({ neutralAxisAngle: 35 * Math.PI / 180, neutralAxisDepth: depth }).resultants),
      scaledLoad(2, 'ULS major-axis demand - 70% of reference capacity', 0.70,
        evaluator({ neutralAxisAngle: 0, neutralAxisDepth: depth }).resultants),
      scaledLoad(3, 'ULS minor-axis demand - 70% of reference capacity', 0.70,
        evaluator({ neutralAxisAngle: Math.PI / 2, neutralAxisDepth: depth }).resultants)
    ]
  }
}

const distanceToSegment = (point: Point, start: Point, end: Point) => {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy
  const ratio = lengthSquared === 0
    ? 0
    : Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared))
  return Math.hypot(point.x - (start.x + ratio * dx), point.y - (start.y + ratio * dy))
}

const boundarySegments = (geometry: GeometryInput) => geometry.outers.flatMap((outer) =>
  [outer.points, ...outer.holes.map((hole) => hole.points)].flatMap((ring) =>
    ring.map((point, index) => [point, ring[(index + 1) % ring.length]] as const)))

const minimumClearCover = (geometry: GeometryInput) => {
  const segments = boundarySegments(geometry)
  return Math.min(...geometry.rebars.map((bar) =>
    Math.min(...segments.map(([start, end]) => distanceToSegment(bar, start, end))) - bar.dia / 2))
}

const minimumBarClearSpacing = (geometry: GeometryInput) => {
  let minimum = Infinity
  for (let left = 0; left < geometry.rebars.length; left += 1) {
    for (let right = left + 1; right < geometry.rebars.length; right += 1) {
      const a = geometry.rebars[left]
      const b = geometry.rebars[right]
      minimum = Math.min(minimum, Math.hypot(a.x - b.x, a.y - b.y) - (a.dia + b.dia) / 2)
    }
  }
  return minimum
}

mkdirSync(OUTPUT_DIRECTORY, { recursive: true })

const summaries = []
for (const spec of examples) {
  const section = sectionGeometryFromGeometryInput(spec.geometry)
  const sectionSummary = summarizeSection(section)
  if (!sectionSummary.isValid) throw new Error(`${spec.fileName}: ${sectionSummary.warnings.join(' ')}`)
  if (!spec.geometry.rebars.every((bar) => rebarCenterInConcrete(bar, section))) {
    throw new Error(`${spec.fileName}: a rebar centre is outside the concrete or inside a void`)
  }
  const cover = minimumClearCover(spec.geometry)
  if (cover + 1e-6 < spec.minimumClearCover) {
    throw new Error(`${spec.fileName}: minimum clear cover ${cover.toFixed(3)} mm is below ${spec.minimumClearCover} mm`)
  }
  const clearSpacing = minimumBarClearSpacing(spec.geometry)
  if (clearSpacing < 40) throw new Error(`${spec.fileName}: minimum bar clear spacing ${clearSpacing.toFixed(3)} mm is below 40 mm`)

  const steelArea = spec.geometry.rebars.reduce((sum, bar) => sum + Math.PI * bar.dia ** 2 / 4, 0)
  const reinforcementRatio = steelArea / sectionSummary.area
  if (reinforcementRatio < 0.008 || reinforcementRatio > 0.025) {
    throw new Error(`${spec.fileName}: reinforcement ratio ${(100 * reinforcementRatio).toFixed(3)}% is outside 0.8%-2.5%`)
  }

  const materials = materialStore(spec.profileId)
  const design = createDesignBasisForCalculationProfile(spec.profileId)
  const analysis = createAnalysisOptionsForProfile(spec.profileId) as EquivalentBlockAnalysisOptions
  const loadings = createLoadings(spec, materials, design)
  const document = createProjectDocument({
    calculationProfileId: spec.profileId,
    geometry: spec.geometry,
    materials,
    loadings,
    analysis,
    design,
    meta: {
      id: spec.id,
      name: spec.title,
      information: {
        client: 'Realistic section examples',
        company: 'P-M Column Designer',
        designedBy: 'Engineering example',
        checkedBy: 'Automated geometry and solver validation',
        address: 'Dimensions and reinforcement are illustrative; verify project-specific detailing.',
        date: '2026-08-12'
      },
      createdAt: FIXED_TIMESTAMP
    }
  })
  document.meta.updatedAt = FIXED_TIMESTAMP
  const parsed = parseProjectDocument(document)
  if (!parsed.ok) throw new Error(`${spec.fileName}: generated project does not parse: ${parsed.error}`)
  if (parsed.warnings.length > 0) throw new Error(`${spec.fileName}: ${parsed.warnings.join(' ')}`)

  const prepared = prepareBlockAnalysis(
    spec.profileId,
    section,
    geometryInputRebars(spec.geometry),
    materials,
    design
  )
  const surface = buildEquivalentBlockDesignSurfaceFromPrepared(prepared, analysis)
  if (!surface.topology.closed) {
    throw new Error(`${spec.fileName}: design surface is not closed: ${JSON.stringify(surface.topology)}`)
  }
  for (const loadcase of loadings.combinations) {
    const solved = solveEquivalentBlockDemandFromPrepared(prepared, analysis, loadcase, surface)
    if (!solved.ok || solved.utilization === null || solved.utilization >= 1) {
      throw new Error(`${spec.fileName}/${loadcase.name}: loadcase does not solve inside the design surface`)
    }
  }

  writeFileSync(resolve(OUTPUT_DIRECTORY, spec.fileName), `${serializeProjectDocument(parsed.document)}\n`, 'utf8')
  summaries.push({
    file: spec.fileName,
    bars: spec.geometry.rebars.length,
    concreteAreaMm2: sectionSummary.area,
    reinforcementRatioPercent: 100 * reinforcementRatio,
    minimumClearCoverMm: cover,
    minimumBarClearSpacingMm: clearSpacing
  })
}

console.log(JSON.stringify(summaries, null, 2))
