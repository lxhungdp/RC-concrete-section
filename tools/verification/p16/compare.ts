import fs from 'node:fs'
import path from 'node:path'
import {
  buildDesignPreviewSurface,
  buildPreviewSurface,
  checkLoadcasesUtilizationFromSurface,
  intersectFixedPContourWithMomentRay,
  sliceFixedPContour
} from '@pm/analysis'
import {
  createDefaultAnalysisOptions,
  createLoadCombination,
  createProjectDocument,
  parseProjectDocument,
  serializeProjectDocument
} from '@pm/project'
import { createEn1992DesignBasis, setMaterialFactorComponentValue } from '@pm/design'
import type { GeometryInput, GeometryInputRebar } from '@pm/geometry'
import type { MaterialStore, StressStrainPoint } from '@pm/materials'

const root = process.cwd()
const sourcePath = path.join(root, 'docs', 'examples', 'reference-case', 'source', 'P16_Column_ULS_R _260730_콘크리트 커브 추가수정.md')
const outputDir = path.join(root, 'outputs', 'p16-umd-comparison')
fs.mkdirSync(outputDir, { recursive: true })

const text = fs.readFileSync(sourcePath, 'utf8')
const lines = text.split(/\r?\n/)

const numeric = (value: string) => Number(value.replace(/,/g, ''))

const parseNumberLine = (line: string) => {
  const cleaned = line.replace(/&#x20;/g, ' ')
  return [...cleaned.matchAll(/[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:E[-+]?\d+)?/gi)].map((item) => numeric(item[0]))
}

const lineIndex = (needle: string, from = 0) => {
  const index = lines.findIndex((line, i) => i >= from && line.includes(needle))
  if (index < 0) throw new Error(`Could not find "${needle}"`)
  return index
}

const parseSectionNodes = () => {
  const start = lineIndex('Section Nodes')
  const nodes: Array<[number, number]> = []
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].includes('Bars')) break
    const nums = parseNumberLine(lines[i])
    if (nums.length >= 3) nodes.push([nums[1], nums[2]])
  }
  if (nodes.length !== 8) throw new Error(`Expected 8 section nodes, got ${nodes.length}`)
  return nodes
}

const parseBars = (): GeometryInputRebar[] => {
  const start = lineIndex('Bars')
  const end = lineIndex('Geometric Centroid', start)
  const bars: GeometryInputRebar[] = []
  for (let i = start + 1; i < end; i++) {
    const nums = parseNumberLine(lines[i])
    if (nums.length >= 4) {
      bars.push({
        id: nums[0],
        steelMaterialId: 1,
        x: nums[1],
        y: nums[2],
        dia: nums[3]
      })
    }
  }
  if (bars.length === 0) throw new Error('No bars parsed')
  return bars
}

const parseConcreteCurve = (): StressStrainPoint[] => {
  const start = lineIndex('ULS Compression Curve')
  const end = lineIndex('ULS Tension Curve', start)
  const points: StressStrainPoint[] = []
  for (let i = start + 1; i < end; i++) {
    const nums = parseNumberLine(lines[i])
    if (nums.length >= 2) points.push({ strain: nums[0], stress: nums[1] / 1e6 })
  }
  if (points.length < 2) throw new Error(`Expected concrete curve points, got ${points.length}`)
  return points
}

const parseLoadCases = () => {
  const start = lineIndex('Load Case        N')
  const end = lineIndex('ULS Cases Analysed', start)
  const cases = []
  for (let i = start + 1; i < end; i++) {
    const nums = parseNumberLine(lines[i])
    if (nums.length >= 4) {
      cases.push(
        createLoadCombination({
          id: nums[0],
          name: `UMD Load Case ${nums[0]}`,
          P: nums[1] * 1000,
          Mx: nums[2] * 1e6,
          My: nums[3] * 1e6
        })
      )
    }
  }
  if (cases.length !== 6) throw new Error(`Expected 6 load cases, got ${cases.length}`)
  return cases
}

const parseSummary = () => {
  const start = lineIndex('Strength Analysis - Summary')
  const end = lineIndex('Strength Analysis - Details', start)
  const rows = []
  for (let i = start + 1; i < end; i++) {
    const nums = parseNumberLine(lines[i])
    if (nums.length >= 8) {
      rows.push({
        caseId: nums[0],
        N_kN: nums[3],
        M_kNm: nums[4],
        Mu_kNm: nums[5],
        ratio: nums[6],
        neutralAxisAngleDeg: nums[7],
        neutralAxisDepthMm: nums[8] ?? null
      })
    }
  }
  return rows.slice(0, 6)
}

const parseDetails = () => {
  const start = lineIndex('Strength Analysis - Details')
  const end = lineIndex('Strain Planes at ULS Strength', start)
  const details = new Map<number, Record<string, { N_kN: number; M_kNm: number }>>()
  let current: number | null = null
  const descriptions = [
    'Axial strength at M',
    'Balanced yield',
    'Compressive strength at M=0',
    'Bending strength at N=0'
  ]
  for (let i = start + 1; i < end; i++) {
    const line = lines[i]
    const nums = parseNumberLine(line)
    const caseMatch = line.match(/^\s*(?:&#x20;\s*)?(\d)\s+/)
    if (caseMatch && descriptions.some((description) => line.includes(description))) {
      current = Number(caseMatch[1])
      details.set(current, {})
    }
    if (current === null) continue
    for (const description of descriptions) {
      if (!line.includes(description)) continue
      const record = details.get(current)!
      const pair = nums.slice(-2)
      record[description] = { N_kN: pair[0], M_kNm: pair[1] }
    }
  }
  return [...details.entries()].map(([caseId, values]) => ({ caseId, ...values }))
}

const parseGlobalStrengthExtremes = () => {
  const start = lineIndex('Strength Analysis - Details')
  const end = lineIndex('Strain Planes at ULS Strength', start)
  let compression: { N_kN: number; M_kNm: number } | null = null
  let tension: { N_kN: number; M_kNm: number } | null = null
  for (let i = start + 1; i < end; i++) {
    const nums = parseNumberLine(lines[i])
    if (lines[i].includes('Max. compressive strain') && nums.length >= 3) {
      const pair = nums.slice(-2)
      compression = { N_kN: pair[0], M_kNm: pair[1] }
    }
    if (lines[i].includes('Max. tensile strain') && nums.length >= 3) {
      const pair = nums.slice(-2)
      tension = { N_kN: pair[0], M_kNm: pair[1] }
    }
  }
  if (!compression || !tension) throw new Error('Could not parse global PM extremes from UMD details.')
  return { compression, tension }
}

const positiveMomentPlaneCurve = (
  points: Array<{ beta: number; station: number; P: number; Mx: number; My: number }>,
  theta: number
) => {
  const stationCount = Math.max(...points.map((point) => point.station)) + 1
  const byStation = Array.from({ length: stationCount }, (_unused, station) =>
    points
      .filter((point) => point.station === station)
      .sort((a, b) => a.beta - b.beta)
  )
  const c = Math.cos(theta)
  const s = Math.sin(theta)
  const result: Array<{ station: number; P_kN: number; M_kNm: number }> = []

  for (let station = 0; station < stationCount; station++) {
    const ring = byStation[station]
    if (ring.length === 0) continue
    const radii = ring.map((point) => Math.hypot(point.Mx, point.My))
    if (Math.max(...radii) <= 1e-6) {
      result.push({ station, P_kN: ring[0].P / 1000, M_kNm: 0 })
      continue
    }
    const cuts = []
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]
      const b = ring[(i + 1) % ring.length]
      const fa = a.Mx * s - a.My * c
      const fb = b.Mx * s - b.My * c
      if (fa === fb) continue
      if (fa * fb > 0) continue
      const q = fa / (fa - fb)
      if (q < -1e-9 || q > 1 + 1e-9) continue
      const P = a.P + q * (b.P - a.P)
      const Mx = a.Mx + q * (b.Mx - a.Mx)
      const My = a.My + q * (b.My - a.My)
      const M = Mx * c + My * s
      if (M >= -1e-6) cuts.push({ station, P_kN: P / 1000, M_kNm: Math.max(0, M / 1e6) })
    }
    if (cuts.length > 0) {
      cuts.sort((a, b) => b.M_kNm - a.M_kNm)
      result.push(cuts[0])
    }
  }

  return result.sort((a, b) => b.P_kN - a.P_kN)
}

const interpolatePAtM = (curve: Array<{ P_kN: number; M_kNm: number }>, targetM: number) => {
  let best: { P_kN: number; M_kNm: number } | null = null
  for (let i = 0; i < curve.length - 1; i++) {
    const a = curve[i]
    const b = curve[i + 1]
    const da = a.M_kNm - targetM
    const db = b.M_kNm - targetM
    if (da === 0) return { P_kN: a.P_kN, M_kNm: targetM }
    if (da * db > 0 || a.M_kNm === b.M_kNm) continue
    const q = (targetM - a.M_kNm) / (b.M_kNm - a.M_kNm)
    const candidate = { P_kN: a.P_kN + q * (b.P_kN - a.P_kN), M_kNm: targetM }
    if (!best || candidate.P_kN > best.P_kN) best = candidate
  }
  return best
}

const nearestCurvePointByStation = (
  curve: Array<{ station: number; P_kN: number; M_kNm: number }>,
  station: number
) => curve.find((point) => point.station === station) ?? null

const nodes = parseSectionNodes()
const geometry: GeometryInput = {
  id: 1,
  name: 'P16 Column ULS R from UMD',
  outers: [
    {
      id: 1,
      points: nodes.slice(0, 4).map(([x, y], index) => ({ id: index + 1, x, y })),
      holes: [
        {
          id: 1,
          points: nodes.slice(4).map(([x, y], index) => ({ id: index + 101, x, y }))
        }
      ]
    }
  ],
  rebars: parseBars()
}

const materials: MaterialStore = {
  strainSign: 'compression-positive',
  concrete: {
    id: 1,
    name: 'UMD C50 explicit ULS curve',
    standard: 'EC2',
    fck: 50,
    mc: 2400,
    elasticModulus: 37280,
    stressStrain: {
      type: 'user-curve',
      interpolation: 'linear',
      zeroTension: true,
      points: parseConcreteCurve()
    },
    limits: { eps0: 0.0021, epsCu: 0.0032, ignoreTension: true },
    factors: { alpha: 1, gammaC: 1 }
  },
  steel: [
    {
      id: 1,
      name: 'UMD FY500',
      standard: 'EC2',
      fy: 500,
      elasticModulus: 200000,
      stressStrain: { type: 'elastic-perfectly-plastic' },
      limits: { epsY: 450 / 200000, epsU: 0.05 },
      factors: { gammaS: 1.1111111111111112 }
    }
  ],
  defaults: { steelMaterialId: 1 }
}

const analysis = createDefaultAnalysisOptions()
analysis.directions.seed = { type: 'uniform', count: 360, startDeg: 0 }
analysis.directions.refinement = { type: 'fixed', probe: { stationIds: [] } }
analysis.mesh = { sizing: { type: 'automatic', seedDivisions: 96 }, maxCells: 1_000_000, maxSubdivision: 6 }

const design = setMaterialFactorComponentValue(
  setMaterialFactorComponentValue(createEn1992DesignBasis(), 'gammaC', 1),
  'gammaS',
  1.111
)
design.modified = true
design.materialModelModified = true
design.overrideReason =
  'Match the UMD report: use its explicit design-level concrete curve (gammaC,ULS = 1.000) ' +
  'and reinforcement factor gammaS,ULS = 1.111.'

const loadcases = parseLoadCases()
const project = createProjectDocument({
  calculationProfileId: 'en-1992-1-1-2004-stress-strain',
  geometry,
  materials,
  loadings: { combinations: loadcases },
  analysis,
  design,
  meta: {
    id: 16,
    name: 'P16 Column ULS R - UMD comparison input',
    createdAt: '2026-07-30T00:00:00.000Z'
  }
})
project.meta.updatedAt = '2026-08-12T00:00:00.000Z'
const parsedProject = parseProjectDocument(project)
if (!parsedProject.ok) throw new Error(`Generated UMD project is not importable: ${parsedProject.error}`)

const inputPath = path.join(outputDir, 'P16_Column_ULS_R_UMD_input.pm-project.json')
fs.writeFileSync(inputPath, serializeProjectDocument(parsedProject.document))

const section = {
  solids: geometry.outers.map((outer) => ({
    outer: outer.points,
    holes: outer.holes.map((hole) => hole.points)
  }))
}
const rebars = geometry.rebars

const meshOptions = {
  seedDivisions: analysis.mesh.sizing.type === 'automatic' ? analysis.mesh.sizing.seedDivisions : undefined,
  maxCells: analysis.mesh.maxCells,
  maxSubdivision: analysis.mesh.maxSubdivision
}
const nominalSurface = buildPreviewSurface(section, rebars, materials, meshOptions, analysis)
const designSurface = buildDesignPreviewSurface(section, rebars, materials, design, meshOptions, analysis)

const checks = checkLoadcasesUtilizationFromSurface(designSurface, loadcases)
const summary = parseSummary()
const details = parseDetails()
const globalExtremes = parseGlobalStrengthExtremes()

const thetaRows = loadcases.map((loadcase) => {
  const theta = Math.atan2(loadcase.My, loadcase.Mx)
  const contour = sliceFixedPContour(designSurface.points, loadcase.P)
  const fixedP = intersectFixedPContourWithMomentRay(contour, theta)
  const zeroPContour = sliceFixedPContour(designSurface.points, 0)
  const zeroP = intersectFixedPContourWithMomentRay(zeroPContour, theta)
  return {
    caseId: loadcase.id,
    thetaDeg: (theta * 180) / Math.PI,
    fixedP,
    zeroP,
    contourPoints: contour.length
  }
})

const byCase = checks.map((check) => {
  const umd = summary.find((row) => row.caseId === check.loadcaseId)
  const theta = thetaRows.find((row) => row.caseId === check.loadcaseId)!
  const demandM = Math.hypot(check.demand.Mx, check.demand.My) / 1e6
  const softwareMu = theta.fixedP ? theta.fixedP.M / 1e6 : null
  const softwareRatio = softwareMu ? demandM / softwareMu : null
  return {
    caseId: check.loadcaseId,
    demand: {
      P_kN: check.demand.P / 1000,
      Mx_kNm: check.demand.Mx / 1e6,
      My_kNm: check.demand.My / 1e6,
      M_kNm: demandM
    },
    umdSummary: umd,
    software: {
      proportionalUtilization: check.proportionalUtilization,
      fixedPUtilization: check.fixedPUtilization,
      fixedP_Mu_kNm: softwareMu,
      fixedP_ratio: softwareRatio,
      fixedP_capacityP_kN: theta.fixedP ? theta.fixedP.P / 1000 : null,
      fixedP_capacityMx_kNm: theta.fixedP ? theta.fixedP.Mx / 1e6 : null,
      fixedP_capacityMy_kNm: theta.fixedP ? theta.fixedP.My / 1e6 : null,
      proportionalCapacityP_kN: check.capacityPoint ? check.capacityPoint.P / 1000 : null,
      proportionalCapacityMx_kNm: check.capacityPoint ? check.capacityPoint.Mx / 1e6 : null,
      proportionalCapacityMy_kNm: check.capacityPoint ? check.capacityPoint.My / 1e6 : null,
      bendingStrengthAtN0_kNm: theta.zeroP ? theta.zeroP.M / 1e6 : null,
      compressionStrengthAtM0_kN: designSurface.bounds.P[1] / 1000
    }
  }
})

const pmCurveComparisons = loadcases.map((loadcase) => {
  const detail = details.find((item) => item.caseId === loadcase.id) as
    | (Record<string, { N_kN: number; M_kNm: number }> & { caseId: number })
    | undefined
  if (!detail) throw new Error(`No UMD detail rows for loadcase ${loadcase.id}`)
  const theta = Math.atan2(loadcase.My, loadcase.Mx)
  const softwareCurve = positiveMomentPlaneCurve(designSurface.points, theta)
  const demandM = Math.hypot(loadcase.Mx, loadcase.My) / 1e6
  const axialAtM = interpolatePAtM(softwareCurve, demandM)
  const balanced = nearestCurvePointByStation(softwareCurve, 9)
  const zeroP = intersectFixedPContourWithMomentRay(sliceFixedPContour(designSurface.points, 0), theta)
  const labels = [
    'Max. compressive strain',
    'Axial strength at M',
    'Balanced yield',
    'Compressive strength at M=0',
    'Bending strength at N=0',
    'Max. tensile strain'
  ]
  const umdRows = [
    globalExtremes.compression,
    detail['Axial strength at M'],
    detail['Balanced yield'],
    detail['Compressive strength at M=0'],
    detail['Bending strength at N=0'],
    globalExtremes.tension
  ]
  const softwareRows = [
    { P_kN: designSurface.bounds.P[1] / 1000, M_kNm: 0 },
    axialAtM,
    balanced,
    { P_kN: designSurface.bounds.P[1] / 1000, M_kNm: 0 },
    zeroP ? { P_kN: 0, M_kNm: zeroP.M / 1e6 } : null,
    { P_kN: designSurface.bounds.P[0] / 1000, M_kNm: 0 }
  ]
  return {
    caseId: loadcase.id,
    thetaDeg: (theta * 180) / Math.PI,
    pointCount: labels.length,
    labels,
    points: labels.map((label, index) => ({
      order: index + 1,
      label,
      umd: umdRows[index],
      software: softwareRows[index],
      deltaP_kN:
        softwareRows[index] && umdRows[index] ? softwareRows[index]!.P_kN - umdRows[index].N_kN : null,
      deltaM_kNm:
        softwareRows[index] && umdRows[index] ? softwareRows[index]!.M_kNm - umdRows[index].M_kNm : null
    })),
    softwareSampledCurve: softwareCurve
  }
})

const result = {
  sourcePath,
  inputPath,
  generatedAt: new Date().toISOString(),
  counts: {
    sectionNodes: nodes.length,
    rebars: rebars.length,
    concreteCurvePoints: materials.concrete.stressStrain.type === 'user-curve' ? materials.concrete.stressStrain.points.length : 0,
    loadcases: loadcases.length,
    nominalSurfacePoints: nominalSurface.points.length,
    designSurfacePoints: designSurface.points.length,
    meshPoints: nominalSurface.mesh.points
  },
  mesh: nominalSurface.mesh,
  nominalBounds: {
    P_kN: nominalSurface.bounds.P.map((value) => value / 1000),
    Mx_kNm: nominalSurface.bounds.Mx.map((value) => value / 1e6),
    My_kNm: nominalSurface.bounds.My.map((value) => value / 1e6)
  },
  designBounds: {
    P_kN: designSurface.bounds.P.map((value) => value / 1000),
    Mx_kNm: designSurface.bounds.Mx.map((value) => value / 1e6),
    My_kNm: designSurface.bounds.My.map((value) => value / 1e6)
  },
  umd: { summary, details, globalExtremes },
  software: byCase,
  pmCurveComparisons,
  nominalSurfacePoints: nominalSurface.nominalPoints.map((point) => ({
    betaDeg: (point.beta * 180) / Math.PI,
    station: point.station,
    stationId: point.stationId,
    P_kN: point.P / 1000,
    Mx_kNm: point.Mx / 1e6,
    My_kNm: point.My / 1e6
  }))
}

const resultPath = path.join(outputDir, 'p16-umd-comparison-data.json')
fs.writeFileSync(resultPath, JSON.stringify(result, null, 2))
console.log(JSON.stringify({ inputPath, resultPath, counts: result.counts, designBounds: result.designBounds }, null, 2))
