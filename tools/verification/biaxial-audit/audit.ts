/**
 * Biaxial P-M audit: production engine versus the independent oracle in ./oracle.ts.
 *
 * Record: docs/task-packets/2026-11-11-biaxial-pm-audit.md (findings F-01 to F-07) and the fix
 * packets it links. Gated rows reproduce the acceptance evidence for F-01, F-02 and F-03; OPEN rows
 * reproduce the evidence for findings that are recorded but not fixed. A pass is preview
 * code/solution evidence, never design-code approval or an accepted result.
 *
 * Run:  npm run verify:biaxial-audit                 (all gated rows decide the exit status)
 *       npm run verify:biaxial-audit -- --gate F-01  (only the listed gates decide it)
 *       npm run verify:biaxial-audit -- --only F-01  (compute only the listed rows)
 * Writes outputs/biaxial-audit/latest.json and latest.md (git-ignored).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildDesignPreviewSurface,
  checkLoadcaseUtilizationFromSurface,
  evaluatePreparedState,
  intersectSurfaceWithDemandRay,
  prepareAnalysis,
  type PreviewSurface
} from '@pm/analysis'
import { buildEquivalentBlockPreviewSurface } from '@pm/analysis-equivalent-block'
import { createAci318Model } from '@pm/code-aci318'
import { createAs3600Model } from '@pm/code-as3600'
import {
  createAci318DesignBasis,
  createKdsAppendixDesignBasis,
  createKdsBasicDesignBasis,
  type DesignBasis
} from '@pm/design'
import { prepareEquivalentBlockSection } from '@pm/equivalent-block'
import { geometryInputRebars, netConcreteCentroid, sectionGeometryFromGeometryInput } from '@pm/geometry'
import { createKdsConcrete, createKdsRebarSteel, type MaterialStore } from '@pm/materials'
import {
  analysisMeshKernelOptions,
  applyCalculationProfileToMaterials,
  createAdaptiveAnalysisOptions,
  createAnalysisOptionsForProfile,
  createDefaultAnalysisOptions,
  type CalculationProfileId,
  type EquivalentBlockAnalysisOptions
} from '@pm/project'
import { FIXED_GRID_SCREENING_RELATIVE_UNCERTAINTY } from '@pm/results'
import { UNIFIED_STEEL_STRAIN_YIELD_RATIOS } from '@pm/stations'
import { AUDIT_CASES, auditCase, geometryInputOf, oracleSectionOf, type AuditCase } from './cases'
import {
  CHECK_ORACLE_OPTIONS,
  createOracle,
  DEFAULT_ORACLE_OPTIONS,
  evaluateState,
  prepareOracle,
  type OracleMechanics,
  type OracleSurface,
  type Resultant
} from './oracle'

// ------------------------------------------------------------------ declared inputs and bounds

const FCK = 30
const FY = 400
const ES = 200000

/** KDS 14 20 20 Table 4.1-2 first row (fck <= 40 MPa) with n = 2; KDS 14 20 10 phi; 0.80 cap. */
const KDS_FIBRE: OracleMechanics = {
  concrete: { kind: 'parabolic', fck: FCK, alpha: 0.85, epsC0: 0.002, epsCu: 0.0033 },
  steel: { fy: FY, Es: ES },
  phi: { kind: 'kds-fixed-or-yield-multiple', phiCompression: 0.65, phiTension: 0.85, yieldStressThreshold: 400, fixedLimit: 0.005, yieldMultiple: 2.5 },
  axialCapRatio: 0.8,
  tensionPoleYieldMultiple: 25
}

/** ACI 318-19(22) Whitney block as stated in packages/pm-code-aci318/README.md. */
const aciBeta1 = (fc: number) => fc <= 28 ? 0.85 : Math.max(0.65, 0.85 - 0.05 * (fc - 28) / 7)
const ACI_BLOCK: OracleMechanics = {
  concrete: { kind: 'block', stress: 0.85 * FCK, beta1: aciBeta1(FCK), epsCu: 0.003 },
  steel: { fy: FY, Es: ES },
  phi: { kind: 'aci-yield-plus', phiCompression: 0.65, phiTension: 0.9, extraStrain: 0.003 },
  axialCapRatio: 0.8,
  tensionPoleYieldMultiple: 25
}

/**
 * Gate bounds. Forward agreement uses the verification-fixture target of docs/06 section 6 for the
 * meshed fibre kernel and round-off for the exact block clipping. Over-prediction is the unsafe
 * side, so its bound is the production screening interval itself: an "adequate" Fixed verdict is
 * safe only while the oracle capacity is at least lambda (1 - u),
 * u = FIXED_GRID_SCREENING_RELATIVE_UNCERTAINTY. Under-prediction is conservative; its bound is the
 * documented Fixed stress-strain envelope of docs/12 section 6 (below 4.0 % under-prediction),
 * applied here to both mechanics.
 */
const U = FIXED_GRID_SCREENING_RELATIVE_UNCERTAINTY
const BOUNDS = {
  forwardFibre: 1e-3,
  forwardBlock: 1e-9,
  minimumEccentricity: 1e-12,
  fixedOverPrediction: 1 / (1 - U) - 1,
  fixedUnderPrediction: 0.04,
  /**
   * Largest fine-vs-coarse oracle difference accepted as a reference (a quarter of the screening
   * margin). The difference itself is added to every Fixed-grid error before it is compared with
   * its bound, so a pass holds even when the oracle carries that much error.
   */
  oracleSelfConvergence: 5e-3
} as const

/**
 * Start of the schedule's tension end (eps_s/eps_y = 10, the second-to-last finite criterion). Its
 * 10 -> 20 step and the user-selected transition to uniform tension are reported as F-08.
 */
const TENSION_END_CRITERION = UNIFIED_STEEL_STRAIN_YIELD_RATIOS[UNIFIED_STEEL_STRAIN_YIELD_RATIOS.length - 2]

// ------------------------------------------------------------------ production adapters

const KN = 1e3
const prepareCase = (item: AuditCase) => {
  const input = geometryInputOf(item)
  return { section: sectionGeometryFromGeometryInput(input), rebars: geometryInputRebars(input) }
}

const kdsStore = (fck = FCK, fy = FY): MaterialStore => ({
  strainSign: 'compression-positive',
  concrete: createKdsConcrete({ name: `C${fck}`, fck }),
  steel: [createKdsRebarSteel({ id: 1, name: `SD${fy}`, fy, elasticModulus: ES })],
  defaults: { steelMaterialId: 1 }
})

const fibreSurface = (item: AuditCase, basis: DesignBasis, adaptive = false, store = kdsStore()) => {
  const { section, rebars } = prepareCase(item)
  const options = adaptive ? createAdaptiveAnalysisOptions() : createDefaultAnalysisOptions()
  return buildDesignPreviewSurface(section, rebars, store, basis, analysisMeshKernelOptions(options), options)
}

const blockSurface = (item: AuditCase, profile: CalculationProfileId, basis: DesignBasis, store = kdsStore()) => {
  const { section, rebars } = prepareCase(item)
  return buildEquivalentBlockPreviewSurface(
    profile, section, rebars, applyCalculationProfileToMaterials(store, profile), basis,
    createAnalysisOptionsForProfile(profile) as EquivalentBlockAnalysisOptions
  )
}

// ------------------------------------------------------------------ result table

type Status = 'PASS' | 'FAIL' | 'OPEN' | 'INFO'
type Row = { id: string; caseId: string; mechanics: string; metric: string; value: number | string; bound: string; status: Status; detail?: string }
const rows: Row[] = []
const add = (row: Row) => { rows.push(row); console.log(formatRow(row)) }
const pct = (value: number) => `${(value * 100).toFixed(2)}%`
const formatRow = (row: Row) => [
  row.id.padEnd(5), row.caseId.padEnd(28), row.mechanics.padEnd(10), row.metric.padEnd(44),
  String(typeof row.value === 'number' ? row.value.toPrecision(4) : row.value).padEnd(12), row.bound.padEnd(12), row.status,
  row.detail ? `  ${row.detail}` : ''
].join(' ')

// ------------------------------------------------------------------ C-1 forward agreement

const forwardFibre = (item: AuditCase) => {
  const { section, rebars } = prepareCase(item)
  const prepared = prepareAnalysis(section, rebars, kdsStore(), analysisMeshKernelOptions(createDefaultAnalysisOptions()))
  const oracle = prepareOracle(oracleSectionOf(item), KDS_FIBRE)
  const scale = Math.abs(oracle.area * 0.85 * FCK)
  const length = Math.max(...item.outers.flat().map((p) => Math.hypot(p.x - oracle.centroid.x, p.y - oracle.centroid.y))) * 2
  let worst = 0
  for (const thetaDeg of [0, 17, 45, 90, 133, 200, 251, 315]) {
    const theta = (thetaDeg * Math.PI) / 180
    const gx = Math.cos(theta)
    const gy = Math.sin(theta)
    const projections = item.outers.flat().map((p) => gx * p.x + gy * p.y)
    const maximum = Math.max(...projections)
    const depthTotal = maximum - Math.min(...projections)
    for (const ratio of [0.12, 0.3, 0.55, 0.85, 1.2]) {
      const c = ratio * depthTotal
      const kappa = KDS_FIBRE.concrete.epsCu / c
      const origin = prepared.origin
      const state = {
        e0: KDS_FIBRE.concrete.epsCu - kappa * (maximum - (gx * origin.x + gy * origin.y)),
        kx: kappa * gy,
        ky: kappa * gx
      }
      const tool = evaluatePreparedState(prepared, state).total
      const reference = evaluateState(oracle, { theta, depth: c }).nominal
      worst = Math.max(worst,
        Math.abs(tool.P - reference.P) / scale,
        Math.abs(tool.Mx - reference.Mx) / (scale * length),
        Math.abs(tool.My - reference.My) / (scale * length))
    }
  }
  add({ id: 'C-1', caseId: item.id, mechanics: 'KDS fibre', metric: 'forward resultant |tool - oracle| / scale', value: worst,
    bound: `<= ${BOUNDS.forwardFibre}`, status: worst <= BOUNDS.forwardFibre ? 'PASS' : 'FAIL' })
}

const forwardBlock = (item: AuditCase) => {
  const { section } = prepareCase(item)
  const centroid = netConcreteCentroid(section)
  const prepared = prepareEquivalentBlockSection({
    solids: section.solids.map((solid) => ({ outer: solid.outer.map(({ x, y }) => ({ x, y })), holes: solid.holes.map((hole) => hole.map(({ x, y }) => ({ x, y }))) })),
    rebars: item.bars.map((bar, index) => ({ id: String(index + 1), x: bar.x, y: bar.y, area: bar.area, dia: bar.dia, steelLawId: '1' })),
    referencePoint: centroid,
    units: 'N-mm-MPa',
    signConvention: 'compression-positive'
  })
  const model = createAci318Model({ concreteStrength: FCK, steel: { '1': { elasticModulus: ES, yieldStress: FY } }, transverseReinforcement: 'tied' })
  const evaluate = model.bindNominalEvaluator(prepared)
  const oracle = prepareOracle(oracleSectionOf(item), ACI_BLOCK)
  const scale = Math.abs(oracle.area * 0.85 * FCK)
  const length = Math.max(...item.outers.flat().map((p) => Math.hypot(p.x - oracle.centroid.x, p.y - oracle.centroid.y))) * 2
  let worst = 0
  for (const thetaDeg of [0, 17, 45, 90, 133, 200, 251, 315]) {
    const theta = (thetaDeg * Math.PI) / 180
    const projections = item.outers.flat().map((p) => Math.cos(theta) * p.x + Math.sin(theta) * p.y)
    const depthTotal = Math.max(...projections) - Math.min(...projections)
    for (const ratio of [0.12, 0.3, 0.55, 0.85, 1.2]) {
      const tool = evaluate({ neutralAxisAngle: theta, neutralAxisDepth: ratio * depthTotal }).resultants
      const reference = evaluateState(oracle, { theta, depth: ratio * depthTotal }).nominal
      worst = Math.max(worst,
        Math.abs(tool.P - reference.P) / scale,
        Math.abs(tool.Mx - reference.Mx) / (scale * length),
        Math.abs(tool.My - reference.My) / (scale * length))
    }
  }
  add({ id: 'C-1', caseId: item.id, mechanics: 'ACI block', metric: 'forward resultant |tool - oracle| / scale', value: worst,
    bound: `<= ${BOUNDS.forwardBlock}`, status: worst <= BOUNDS.forwardBlock ? 'PASS' : 'FAIL' })
}

// ------------------------------------------------------------------ ray fan against the oracle

type Region = 'schedule' | 'cap' | 'post-schedule-tension'
type Fan = { lat: number; lon: number; demand: Resultant; lambda: number; lambdaCheck: number; region: Region }

/**
 * Region of the oracle crossing. "post-schedule-tension" marks a crossing on a facet that touches
 * a state shallower than the tension-end criterion (eps_s/eps_y = 10 at the deepest bar) or the
 * tension pole: there the production schedule interpolates over its coarsest user-selected steps
 * and transition (finding F-08), so that conservative error is reported apart from F-03.
 */
const regionOf = (surface: OracleSurface, mechanics: OracleMechanics, triangle: number): Region => {
  if (triangle < 0) return 'cap'
  const ratio = TENSION_END_CRITERION * (mechanics.steel.fy / mechanics.steel.Es) / mechanics.concrete.epsCu
  for (let corner = 0; corner < 3; corner += 1) {
    const vertex = surface.triangles[3 * triangle + corner]
    if (vertex === 0) return 'post-schedule-tension'
    const row = surface.vertexRow[vertex]
    if (row < 0) continue
    if (surface.vertexDepth[vertex] < surface.rows[row].controllingBarDepth / (1 + ratio)) return 'post-schedule-tension'
  }
  return 'schedule'
}

const oracleFan = (item: AuditCase, mechanics: OracleMechanics) => {
  const section = oracleSectionOf(item)
  const fine = createOracle(section, mechanics)
  const coarse = createOracle(section, mechanics, CHECK_ORACLE_OPTIONS)
  const bound = (key: keyof Resultant) =>
    fine.surface.vertices.reduce((maximum, vertex) => Math.max(maximum, Math.abs(vertex[key])), 0)
  const Ps = bound('P'); const Mxs = bound('Mx'); const Mys = bound('My')
  const fan: Fan[] = []
  for (let lat = -80; lat <= 80; lat += 5) {
    for (let lon = 0; lon < 360; lon += 5) {
      const a = (lat * Math.PI) / 180
      const b = (lon * Math.PI) / 180
      const demand = { P: Ps * Math.sin(a), Mx: Mxs * Math.cos(a) * Math.cos(b), My: Mys * Math.cos(a) * Math.sin(b) }
      const hit = fine.mesh.firstExit(demand)
      const check = coarse.mesh.firstExit(demand)
      if (hit === null || check === null) throw new Error(`Oracle ray miss for ${item.id} at ${lat}/${lon}.`)
      fan.push({ lat, lon, demand, lambda: hit.lambda, lambdaCheck: check.lambda, region: regionOf(fine.surface, mechanics, hit.triangle) })
    }
  }
  return { fan, rows: fine.surface.rows.length, checkRows: coarse.surface.rows.length }
}

const compareFixed = (item: AuditCase, label: string, oracle: ReturnType<typeof oracleFan>, surface: PreviewSurface) => {
  let over = 0; let overAt = ''
  let under = 0; let underAt = ''
  let tail = 0; let tailAt = ''
  let selfConvergence = 0
  for (const ray of oracle.fan) {
    const hit = intersectSurfaceWithDemandRay(surface, ray.demand)
    if (!hit) throw new Error(`Production ray miss for ${item.id} at ${ray.lat}/${ray.lon}.`)
    const ratio = hit.lambda / ray.lambda - 1
    const at = `lat ${ray.lat} lon ${ray.lon}`
    if (ratio > over) { over = ratio; overAt = at }
    if (ray.region === 'post-schedule-tension') { if (-ratio > tail) { tail = -ratio; tailAt = at } }
    else if (-ratio > under) { under = -ratio; underAt = at }
    selfConvergence = Math.max(selfConvergence, Math.abs(ray.lambda / ray.lambdaCheck - 1))
  }
  add({ id: 'O-1', caseId: item.id, mechanics: label, metric: 'oracle reference vs half-resolution check', value: selfConvergence,
    bound: `<= ${BOUNDS.oracleSelfConvergence}`, status: selfConvergence <= BOUNDS.oracleSelfConvergence ? 'PASS' : 'FAIL',
    detail: `${oracle.rows} vs ${oracle.checkRows} rows` })
  const margin = `+ oracle ${pct(selfConvergence)}`
  add({ id: 'F-02', caseId: item.id, mechanics: label, metric: `Fixed capacity over-prediction (${surface.directions.length} rows)`, value: pct(over),
    bound: `<= ${pct(BOUNDS.fixedOverPrediction)}`, status: over + selfConvergence <= BOUNDS.fixedOverPrediction ? 'PASS' : 'FAIL',
    detail: `${margin}; ${overAt}` })
  add({ id: 'F-03', caseId: item.id, mechanics: label, metric: `Fixed capacity under-prediction (${surface.stations.length} stations)`, value: pct(under),
    bound: `<= ${pct(BOUNDS.fixedUnderPrediction)}`, status: under + selfConvergence <= BOUNDS.fixedUnderPrediction ? 'PASS' : 'FAIL',
    detail: `${margin}; ${underAt}` })
  add({ id: 'F-08', caseId: item.id, mechanics: label, metric: 'Fixed under-prediction beyond eps_s/eps_y = 10', value: pct(tail),
    bound: 'open', status: 'OPEN', detail: tailAt })
}

const compareAdaptive = (item: AuditCase, fan: readonly Fan[], surface: PreviewSurface) => {
  const converged = surface.directionError.withinTolerance && surface.stationError.withinTolerance
  const u = Math.max(surface.directionError.maxRelativeComponent, surface.stationError.maxRelative)
  let outside = 0
  let excess = 0
  let at = ''
  for (const ray of fan) {
    const hit = intersectSurfaceWithDemandRay(surface, ray.demand)
    if (!hit) continue
    const ratio = ray.lambda / hit.lambda
    const beyond = Math.max(ratio - (1 + u), (1 - u) - ratio, 0)
    if (beyond > 0) outside += 1
    if (beyond > excess) { excess = beyond; at = `lat ${ray.lat} lon ${ray.lon}` }
  }
  add({ id: 'F-04', caseId: item.id, mechanics: 'KDS fibre', metric: `Adaptive interval misses (u=${pct(u)}, conv=${converged})`, value: `${outside}/${fan.length}`,
    bound: 'open', status: 'OPEN', detail: `worst excess ${pct(excess)} ${at}` })
}

// ------------------------------------------------------------------ F-01 minimum eccentricity

const minimumEccentricitySigns = (item: AuditCase, label: string, surface: PreviewSurface) => {
  const P = 0.75 * surface.bounds.P[1]
  const governing = checkLoadcaseUtilizationFromSurface(surface, { id: 1, name: 'concentric', actionBasis: 'factoredULS', P, Mx: 0, My: 0 })
  // KDS 14 20 20:2022 Appendix 3.2(2): e_min = 15 + 0.03 h, h measured along each principal axis.
  const extent = (axis: 'x' | 'y') => {
    const values = item.outers.flat().map((point) => point[axis])
    return Math.max(...values) - Math.min(...values)
  }
  const aboutX = 15 + 0.03 * extent('y')
  const aboutY = 15 + 0.03 * extent('x')
  const candidates = [
    { Mx: P * aboutX, My: 0 }, { Mx: -P * aboutX, My: 0 }, { Mx: 0, My: P * aboutY }, { Mx: 0, My: -P * aboutY }
  ].map((moment) => {
    const hit = intersectSurfaceWithDemandRay(surface, { P, ...moment })
    if (!hit) throw new Error('Minimum-eccentricity candidate has no crossing.')
    return 1 / hit.lambda
  })
  const required = Math.max(...candidates)
  const tool = governing.utilization ?? Number.NaN
  const ok = tool >= required * (1 - BOUNDS.minimumEccentricity)
  add({ id: 'F-01', caseId: item.id, mechanics: label, metric: 'governing UR / max signed e_min candidate UR', value: tool / required,
    bound: '>= 1', status: ok ? 'PASS' : 'FAIL', detail: `tool UR ${tool.toFixed(4)} (${governing.adequacy}); candidates ${candidates.map((value) => value.toFixed(4)).join(', ')}` })
}

// ------------------------------------------------------------------ informational OPEN findings

const openFindings = () => {
  const column = auditCase('column-400x600')
  const Ag = 400 * 600
  const As = column.bars.reduce((sum, bar) => sum + bar.area, 0)
  // F-07: KDS Main-body maximum axial design strength 0.80 phi P0, P0 = 0.85 fck (Ag - Ast) + fy Ast.
  for (const [fck, fy] of [[80, 600], [90, 600]] as const) {
    const formula = 0.8 * 0.65 * (0.85 * fck * (Ag - As) + fy * As)
    const fibre = fibreSurface(column, createKdsBasicDesignBasis(), false, kdsStore(fck, fy)).bounds.P[1]
    const block = blockSurface(column, 'kds-142020-equivalent-block', createKdsBasicDesignBasis(), kdsStore(fck, fy)).bounds.P[1]
    add({ id: 'F-07', caseId: column.id, mechanics: `fck${fck}/fy${fy}`, metric: 'fibre Pmax / (0.80 phi P0 formula)', value: fibre / formula,
      bound: 'open', status: 'OPEN', detail: `fibre ${(fibre / KN).toFixed(1)} kN, block ${(block / KN).toFixed(1)} kN, formula ${(formula / KN).toFixed(1)} kN` })
  }
  // F-05: ACI P0 with fy above the hypothesised 550 MPa limit (clause text not available to this audit).
  const { section } = prepareCase(column)
  const prepared = prepareEquivalentBlockSection({
    solids: section.solids.map((solid) => ({ outer: solid.outer.map(({ x, y }) => ({ x, y })), holes: [] })),
    rebars: column.bars.map((bar, index) => ({ id: String(index + 1), x: bar.x, y: bar.y, area: bar.area, dia: bar.dia, steelLawId: '1' })),
    referencePoint: netConcreteCentroid(section), units: 'N-mm-MPa', signConvention: 'compression-positive'
  })
  const aci690 = createAci318Model({ concreteStrength: 35, steel: { '1': { elasticModulus: ES, yieldStress: 690 } }, transverseReinforcement: 'tied' })
  const P0 = aci690.nominalEndpoints(prepared).compression.resultants.P
  const hypothesis = 0.85 * 35 * (Ag - As) + 550 * As
  add({ id: 'F-05', caseId: column.id, mechanics: 'ACI block', metric: 'P0(fy=690) / P0(fy capped 550, UNVERIFIED)', value: P0 / hypothesis,
    bound: 'open', status: 'OPEN', detail: `engine ${(P0 / KN).toFixed(1)} kN, hypothesis ${(hypothesis / KN).toFixed(1)} kN` })
  // F-06: AS 3600 phi between balance and pure bending, state-ku versus pure-bending kuo (UNVERIFIED reading).
  const asSection = prepareEquivalentBlockSection({
    solids: [{ outer: [{ x: -200, y: -300 }, { x: 200, y: -300 }, { x: 200, y: 300 }, { x: -200, y: 300 }], holes: [] }],
    rebars: [[-140, -240], [0, -240], [140, -240], [-140, 240], [0, 240], [140, 240]].map(([x, y], index) => ({ id: String(index + 1), x, y, area: 620, dia: 28, steelLawId: '1' })),
    referencePoint: { x: 0, y: 0 }, units: 'N-mm-MPa', signConvention: 'compression-positive'
  })
  const asModel = createAs3600Model({ concreteStrength: 40, steel: { '1': { elasticModulus: ES, yieldStress: 500 } }, compressionPhiClass: 'ordinary' })
  const nominal = asModel.bindNominalEvaluator(asSection)
  const design = asModel.bindDesignEvaluator(asSection)
  const angle = Math.PI / 2
  const dO = 540
  let low = 5; let high = 540
  for (let iteration = 0; iteration < 80; iteration += 1) {
    const middle = (low + high) / 2
    if (nominal({ neutralAxisAngle: angle, neutralAxisDepth: middle }).resultants.P > 0) high = middle
    else low = middle
  }
  const phiBending = Math.min(0.85, Math.max(0.65, 1.24 - (13 * (low / dO)) / 12))
  const balanced = nominal({ neutralAxisAngle: angle, neutralAxisDepth: (0.003 / (0.003 + 0.0025)) * dO }).resultants.P
  const state = { neutralAxisAngle: angle, neutralAxisDepth: 250 }
  const Nu = nominal(state).resultants.P
  const phiTool = (design(state).metadata as { phi: number }).phi
  const phiHypothesis = 0.6 + (phiBending - 0.6) * (1 - Nu / balanced)
  add({ id: 'F-06', caseId: 'as3600-400x600', mechanics: 'AS block', metric: 'phi(state ku) / phi(pure-bending kuo, UNVERIFIED)', value: phiTool / phiHypothesis,
    bound: 'open', status: 'OPEN', detail: `c = 250 mm, Nu ${(Nu / KN).toFixed(0)} kN: engine ${phiTool.toFixed(4)}, hypothesis ${phiHypothesis.toFixed(4)}` })
}

// ------------------------------------------------------------------ main

/** Compact record table: one line per case and mechanics, then the remaining rows. */
const markdownSummary = () => {
  const lines = [
    '| Case | Mechanics | Rows x stations | F-02 over | F-03 under | F-08 tension end | Oracle O-1 |',
    '|---|---|---|---:|---:|---:|---:|'
  ]
  const keyed = new Map<string, Partial<Record<string, Row>>>()
  for (const row of rows) {
    if (!['O-1', 'F-02', 'F-03', 'F-08'].includes(row.id)) continue
    const key = `${row.caseId}|${row.mechanics}`
    keyed.set(key, { ...keyed.get(key), [row.id]: row })
  }
  const cell = (row: Row | undefined) => {
    if (!row) return '-'
    const value = typeof row.value === 'number' ? `${(row.value * 100).toFixed(2)}%` : row.value
    return row.status === 'FAIL' ? `${value} FAIL` : value
  }
  for (const [key, entry] of keyed) {
    const [caseId, mechanics] = key.split('|')
    const directions = /\((\d+) rows\)/u.exec(entry['F-02']?.metric ?? '')?.[1] ?? '?'
    const stations = /\((\d+) stations\)/u.exec(entry['F-03']?.metric ?? '')?.[1] ?? '?'
    lines.push(`| ${caseId} | ${mechanics} | ${directions} x ${stations} | ${cell(entry['F-02'])} | ${cell(entry['F-03'])} | ${cell(entry['F-08'])} | ${cell(entry['O-1'])} |`)
  }
  lines.push('', '| ID | Case | Mechanics | Value | Status | Detail |', '|---|---|---|---:|---|---|')
  for (const row of rows) {
    if (['O-1', 'F-02', 'F-03', 'F-08'].includes(row.id)) continue
    const value = typeof row.value === 'number' ? row.value.toPrecision(4) : row.value
    lines.push(`| ${row.id} | ${row.caseId} | ${row.mechanics} | ${value} | ${row.status} | ${row.detail ?? ''} |`)
  }
  return `${lines.join('\n')}\n`
}

const listArgument = (flag: string) => {
  const index = process.argv.indexOf(flag)
  if (index < 0) return null
  const value = process.argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a comma-separated list such as F-01,C-1.`)
  return new Set(value.split(','))
}

const main = () => {
  const gates = listArgument('--gate')
  const only = listArgument('--only')
  const wants = (...ids: string[]) => !only || ids.some((id) => only.has(id))
  const started = Date.now()
  console.log('Biaxial P-M audit: production engine vs independent oracle (tools/verification/biaxial-audit)')
  console.log(`Fixed screening u = ${pct(U)}; oracle ${DEFAULT_ORACLE_OPTIONS.baseDirections}+ bisected rows (tolerance ${DEFAULT_ORACLE_OPTIONS.tolerance}) x ${DEFAULT_ORACLE_OPTIONS.depthRatios.length} depth states; ray fan 33 x 72.`)
  if (wants('C-1')) {
    for (const id of ['column-400x600', 'hollow-600-box', 'L-concrete-600', 'chamfered-600-uneven']) {
      forwardFibre(auditCase(id))
      forwardBlock(auditCase(id))
    }
  }
  if (wants('O-1', 'F-02', 'F-03', 'F-04', 'F-08')) {
    for (const item of AUDIT_CASES.filter((candidate) => candidate.id !== 'square-500-L-bars-mirror-x')) {
      const fibreFan = oracleFan(item, KDS_FIBRE)
      compareFixed(item, 'KDS fibre', fibreFan, fibreSurface(item, createKdsBasicDesignBasis()))
      if (wants('F-04') && ['square-500-L-bars', 'rect-300x700-short-faces', 'wall-250x2500'].includes(item.id)) {
        compareAdaptive(item, fibreFan.fan, fibreSurface(item, createKdsBasicDesignBasis(), true))
      }
      compareFixed(item, 'ACI block', oracleFan(item, ACI_BLOCK), blockSurface(item, 'aci-318-19-22-equivalent-block', createAci318DesignBasis()))
    }
  }
  if (wants('F-01')) {
    for (const id of ['square-500-L-bars', 'square-500-L-bars-mirror-x']) {
      const item = auditCase(id)
      minimumEccentricitySigns(item, 'KDS fibre', fibreSurface(item, createKdsAppendixDesignBasis()))
      minimumEccentricitySigns(item, 'KDS block', blockSurface(item, 'kds-142020-equivalent-block', createKdsAppendixDesignBasis()))
    }
  }
  if (wants('F-05', 'F-06', 'F-07')) openFindings()
  const decisive = rows.filter((row) => (row.status === 'PASS' || row.status === 'FAIL') && (!gates || gates.has(row.id)))
  const failed = decisive.filter((row) => row.status === 'FAIL')
  const outputDirectory = resolve(process.cwd(), 'outputs/biaxial-audit')
  mkdirSync(outputDirectory, { recursive: true })
  writeFileSync(resolve(outputDirectory, 'latest.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), bounds: BOUNDS, rows }, null, 2)}\n`)
  writeFileSync(resolve(outputDirectory, 'latest.md'), markdownSummary())
  console.log(`\n${decisive.length - failed.length}/${decisive.length} gated rows pass${gates ? ` (gates ${[...gates].join(', ')})` : ''}; ${Date.now() - started} ms.`)
  if (failed.length > 0) {
    console.error(`FAILED: ${[...new Set(failed.map((row) => row.id))].join(', ')}`)
    process.exitCode = 1
  }
}

main()
