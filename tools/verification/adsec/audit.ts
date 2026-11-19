/**
 * Read-only AdSec calculation-value audit.
 *
 * The audit never compares utilization. It replays each printed AdSec strain plane, proves the
 * external/project axis mapping against every printed concrete-node and reinforcement strain, and
 * only then compares P/Mx/My from that same state. ACI rows are compared at nominal strength:
 * Pn=P/phi and Mn, never M/(phi Mn).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { evaluatePreparedState, prepareAnalysis, type StrainState } from '@pm/analysis'
import { aci318Beta1, createAci318Model } from '@pm/code-aci318'
import {
  evaluateEquivalentBlock,
  prepareEquivalentBlockSection,
  type BlockSectionState,
  type NominalBlockEvaluation,
  type PreparedEquivalentBlockSection
} from '@pm/equivalent-block'
import {
  geometryInputRebars,
  netConcreteCentroid,
  sectionGeometryFromGeometryInput,
  type GeometryInput,
  type GeometryInputRebar
} from '@pm/geometry'
import {
  compileConcreteMaterial,
  compileSteelMaterial,
  type CompiledMaterial,
  type ConcreteMaterial,
  type MaterialStore
} from '@pm/materials'

import { ADSEC_MANIFEST, type AdsecManifestEntry } from './manifest'
import {
  parseAdsecReport,
  type AdsecPlane,
  type AdsecPointResult,
  type ParsedAdsecReport,
  type SourceNumber
} from './parser'

const ROOT = process.cwd()
const JSON_OUT = resolve(ROOT, 'docs/examples/reference-case/expected/adsec/calculation-value-audit.json')
const MARKDOWN_OUT = resolve(ROOT, 'docs/examples/reference-case/expected/adsec/calculation-value-audit.md')
const UPDATE = process.argv.includes('--update')
const CHECK = process.argv.includes('--check')
const KN = 1e-3
const KNM = 1e-6
const DEG = 180 / Math.PI

const byId = <T extends { id: number }>(items: readonly T[], id: number, label: string) => {
  const item = items.find((candidate) => candidate.id === id)
  if (!item) throw new Error(`${label} ${id} is missing`)
  return item
}

const nodePoint = (report: ParsedAdsecReport, id: number) => {
  const node = report.nodes.find((candidate) => candidate.id === id)
  if (!node) throw new Error(`${report.manifest.id}: geometry node ${id} is missing`)
  return { id, x: node.x.value, y: node.y.value }
}

const geometryInput = (report: ParsedAdsecReport): GeometryInput => {
  const entry = report.manifest
  const rebars: GeometryInputRebar[] = report.bars.map((bar) => ({
    id: bar.id,
    x: bar.x.value,
    y: bar.y.value,
    dia: bar.diameter.value,
    steelMaterialId: 1
  }))
  return {
    id: 1,
    name: `${report.sectionName} — AdSec ${entry.route}`,
    outers: [{
      id: 1,
      points: entry.outerNodeIds.map((id) => nodePoint(report, id)),
      holes: entry.holeNodeIds.map((ring, index) => ({
        id: index + 1,
        points: ring.map((id) => nodePoint(report, id))
      }))
    }],
    rebars
  }
}

const prepareBlockSection = (
  section: ReturnType<typeof sectionGeometryFromGeometryInput>,
  rebars: ReturnType<typeof geometryInputRebars>,
  referencePoint: { x: number; y: number }
): PreparedEquivalentBlockSection => prepareEquivalentBlockSection({
  solids: section.solids.map((solid) => ({
    outer: solid.outer.map(({ x, y }) => ({ x, y })),
    holes: solid.holes.map((hole) => hole.map(({ x, y }) => ({ x, y })))
  })),
  rebars: rebars.map((bar) => ({
    id: String(bar.id),
    x: bar.x,
    y: bar.y,
    area: Math.PI * bar.dia ** 2 / 4,
    steelLawId: String(bar.steelMaterialId ?? 1)
  })),
  referencePoint,
  units: 'N-mm-MPa',
  signConvention: 'compression-positive'
})

const blockStateFromPlane = (
  section: PreparedEquivalentBlockSection,
  plane: AdsecPlane
): BlockSectionState => {
  const gradient = Math.hypot(plane.ky.value, plane.kx.value)
  if (!(gradient > 0)) throw new Error('Equivalent-block replay requires a nonzero source curvature.')
  const normalX = plane.ky.value / gradient
  const normalY = plane.kx.value / gradient
  const compressionEdgeProjection = Math.max(...section.solids.flatMap((solid) =>
    solid.outer.map((point) => normalX * point.x + normalY * point.y)
  ))
  const referenceProjection = normalX * section.referencePoint.x + normalY * section.referencePoint.y
  const neutralAxisProjection = referenceProjection - plane.e0.value / gradient
  const neutralAxisDepth = compressionEdgeProjection - neutralAxisProjection
  if (!(neutralAxisDepth > 0)) throw new Error('Source strain plane places the equivalent-block neutral axis beyond the compression edge.')
  return { neutralAxisAngle: Math.atan2(normalY, normalX), neutralAxisDepth }
}

const evaluateAciAtPrintedPlane = (
  section: PreparedEquivalentBlockSection,
  plane: AdsecPlane,
  model: ReturnType<typeof createAci318Model>
) => {
  const state = blockStateFromPlane(section, plane)
  const printedGradient = Math.hypot(plane.ky.value, plane.kx.value)
  const printedExtremeCompressionStrain = printedGradient * state.neutralAxisDepth
  if (!(printedExtremeCompressionStrain > 0)) {
    throw new Error('ACI replay requires a positive compression-edge strain.')
  }
  return evaluateEquivalentBlock(
    section,
    { ...model.blockLaw, extremeCompressionStrain: printedExtremeCompressionStrain },
    model.steelLaws,
    state
  )
}

const observedConcretePeak = (report: ParsedAdsecReport) => {
  let peak = 0
  for (const point of report.concretePoints) peak = Math.max(peak, point.stress.value)
  if (!(peak > 0)) throw new Error(`${report.manifest.id}: no positive concrete stress was reported`)
  return peak
}

const concreteMaterial = (report: ParsedAdsecReport): ConcreteMaterial => {
  const source = report.concrete
  const common = {
    id: 1,
    name: `${source.name} (AdSec local-state replay)`,
    standard: report.manifest.route.startsWith('aci') ? 'CUSTOM' as const : 'EC2' as const,
    fck: source.fckMpa.value,
    mc: 2400,
    elasticModulus: source.elasticModulusMpa.value,
    limits: {
      ...(source.epsC2 !== null && source.epsC2.value > 0 ? { eps0: source.epsC2.value } : {}),
      epsCu: source.epsCu.value,
      ignoreTension: true
    }
  }
  if (source.compressionCurve === 'explicit') {
    return {
      ...common,
      stressStrain: {
        type: 'user-curve',
        points: source.explicitPoints.map((point) => ({
          strain: point.strain.value,
          stress: point.stressMpa.value
        })),
        interpolation: 'linear',
        extrapolation: 'clamp',
        zeroTension: true
      }
    }
  }
  const peak = observedConcretePeak(report)
  if (source.compressionCurve === 'rectangular') {
    return {
      ...common,
      stressStrain: {
        type: 'aci-whitney-block',
        beta1: aci318Beta1(source.fckMpa.value),
        epsCu: source.epsCu.value,
        alpha: peak / source.fckMpa.value
      }
    }
  }
  if (source.epsC2 === null || !(source.epsC2.value > 0)) {
    throw new Error(`${report.manifest.id}: parabolic-rectangular concrete has no positive plateau strain`)
  }
  const gammaC = source.gammaC?.value ?? 1
  const alphaObserved = peak * gammaC / source.fckMpa.value
  return {
    ...common,
    stressStrain: {
      type: 'ec2-parabolic-rectangular',
      n: 2,
      epsC2: source.epsC2.value,
      epsCu2: source.epsCu.value,
      alpha: alphaObserved
    },
    factors: { gammaC }
  }
}

const materialStore = (report: ParsedAdsecReport): MaterialStore => ({
  strainSign: 'compression-positive',
  concrete: concreteMaterial(report),
  steel: [{
    id: 1,
    name: `${report.steel.name} (AdSec observed-state replay)`,
    standard: report.manifest.route.startsWith('aci') ? 'CUSTOM' : 'EC2',
    fy: report.steel.fyMpa.value,
    elasticModulus: report.steel.elasticModulusMpa.value,
    stressStrain: { type: 'elastic-perfectly-plastic' },
    limits: { epsU: report.steel.epsU.value },
    factors: report.steel.gammaS === null ? undefined : { gammaS: report.steel.gammaS.value }
  }],
  defaults: { steelMaterialId: 1 }
})

const sourceIntervalContains = (source: SourceNumber, value: number, addedUncertainty = 0) =>
  Math.abs(value - source.value) <= source.halfUnit + addedUncertainty + 64 * Number.EPSILON * Math.max(1, Math.abs(value))

const strainUncertainty = (
  plane: AdsecPlane,
  point: AdsecPointResult,
  reference: ParsedAdsecReport['referencePoint']
) => {
  const dx = point.x.value - reference.x.value
  const dy = point.y.value - reference.y.value
  const ux = point.x.halfUnit + reference.x.halfUnit
  const uy = point.y.halfUnit + reference.y.halfUnit
  return plane.e0.halfUnit +
    Math.abs(dx) * plane.ky.halfUnit + Math.abs(plane.ky.value) * ux + plane.ky.halfUnit * ux +
    Math.abs(dy) * plane.kx.halfUnit + Math.abs(plane.kx.value) * uy + plane.kx.halfUnit * uy +
    point.strain.halfUnit
}

const strainEvidence = (
  report: ParsedAdsecReport,
  caseId: number,
  plane: AdsecPlane,
  candidate: StrainState = { e0: plane.e0.value, kx: plane.kx.value, ky: plane.ky.value }
) => {
  const points = [
    ...report.concretePoints.filter((point) => point.caseId === caseId),
    ...report.rebarPoints.filter((point) => point.caseId === caseId)
  ]
  let maxAbsoluteDelta = 0
  let maxSourceRoundingBound = 0
  let maxExcess = 0
  let worstPoint: { kind: 'concrete-node' | 'rebar'; index: number } | null = null
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]
    if (!point) continue
    const predicted = candidate.e0 +
      candidate.kx * (point.y.value - report.referencePoint.y.value) +
      candidate.ky * (point.x.value - report.referencePoint.x.value)
    const absoluteDelta = Math.abs(predicted - point.strain.value)
    const bound = strainUncertainty(plane, point, report.referencePoint)
    const excess = Math.max(0, absoluteDelta - bound)
    if (absoluteDelta > maxAbsoluteDelta) maxAbsoluteDelta = absoluteDelta
    if (bound > maxSourceRoundingBound) maxSourceRoundingBound = bound
    if (excess > maxExcess) {
      maxExcess = excess
      worstPoint = {
        kind: index < report.concretePoints.filter((item) => item.caseId === caseId).length
          ? 'concrete-node'
          : 'rebar',
        index: point.index
      }
    }
  }
  const roundoff = 64 * Number.EPSILON * Math.max(1, maxAbsoluteDelta, maxSourceRoundingBound)
  return {
    matchedWithinPrintedPrecision: maxExcess <= roundoff,
    pointsChecked: points.length,
    maxAbsoluteDelta,
    maxSourceRoundingBound,
    maxExcessBeyondPrintedPrecision: Math.max(0, maxExcess - roundoff),
    worstPoint
  }
}

const blockStrainState = (
  section: PreparedEquivalentBlockSection,
  evaluation: NominalBlockEvaluation
): StrainState => {
  const normalX = Math.cos(evaluation.state.neutralAxisAngle)
  const normalY = Math.sin(evaluation.state.neutralAxisAngle)
  const gradient = evaluation.diagnostics.extremeCompressionStrain / evaluation.state.neutralAxisDepth
  const referenceProjection = normalX * section.referencePoint.x + normalY * section.referencePoint.y
  return {
    e0: evaluation.diagnostics.extremeCompressionStrain * (
      1 - (evaluation.diagnostics.compressionEdgeProjection - referenceProjection) /
      evaluation.state.neutralAxisDepth
    ),
    kx: gradient * normalY,
    ky: gradient * normalX
  }
}

const materialInterval = (
  compiled: CompiledMaterial,
  strain: SourceNumber,
  propagatedStrainUncertainty: number
) => {
  const radius = Math.max(strain.halfUnit, propagatedStrainUncertainty)
  const values = [
    compiled.stress(strain.value - radius),
    compiled.stress(strain.value),
    compiled.stress(strain.value + radius)
  ]
  return { min: Math.min(...values), max: Math.max(...values) }
}

const intervalGap = (
  source: SourceNumber,
  engine: { min: number; max: number },
  propagatedStressUncertainty = 0
) => {
  const sourceMin = source.value - source.halfUnit - propagatedStressUncertainty
  const sourceMax = source.value + source.halfUnit + propagatedStressUncertainty
  if (sourceMax < engine.min) return engine.min - sourceMax
  if (sourceMin > engine.max) return sourceMin - engine.max
  return 0
}

const materialEvidence = (
  report: ParsedAdsecReport,
  caseId: number,
  plane: AdsecPlane,
  steel: CompiledMaterial,
  concrete: CompiledMaterial | null,
  equivalentBlock: NominalBlockEvaluation | null
) => {
  const concretePoints = report.concretePoints.filter((point) => point.caseId === caseId)
  const rebarPoints = report.rebarPoints.filter((point) => point.caseId === caseId)
  let maxConcreteGapMpa = 0
  let maxSteelGapMpa = 0
  let worstConcretePoint: { index: number; strain: number; sourceStressMpa: number } | null = null
  let worstSteelPoint: { index: number; strain: number; sourceStressMpa: number } | null = null
  for (const point of concretePoints) {
    const strainBound = strainUncertainty(plane, point, report.referencePoint)
    let engineInterval: { min: number; max: number }
    let stressUncertainty = 0
    if (equivalentBlock !== null) {
      const beta1 = aci318Beta1(report.concrete.fckMpa.value)
      const threshold = (1 - beta1) * equivalentBlock.diagnostics.extremeCompressionStrain
      const strainMin = point.strain.value - strainBound
      const strainMax = point.strain.value + strainBound
      const compressionStress = equivalentBlock.concrete.stress
      engineInterval = strainMax < threshold
        ? { min: 0, max: 0 }
        : strainMin >= threshold
          ? { min: compressionStress, max: compressionStress }
          : { min: 0, max: compressionStress }
      stressUncertainty = 0.85 * report.concrete.fckMpa.halfUnit
    } else {
      if (concrete === null) throw new Error(`${report.manifest.id}: stress-strain replay has no concrete law`)
      engineInterval = materialInterval(concrete, point.strain, strainBound)
    }
    const gap = intervalGap(point.stress, engineInterval, stressUncertainty)
    if (gap > maxConcreteGapMpa) {
      maxConcreteGapMpa = gap
      worstConcretePoint = { index: point.index, strain: point.strain.value, sourceStressMpa: point.stress.value }
    }
  }
  for (const point of rebarPoints) {
    const strainBound = strainUncertainty(plane, point, report.referencePoint)
    const gammaS = report.steel.gammaS?.value ?? 1
    const gammaUncertainty = report.steel.gammaS?.halfUnit ?? 0
    const yieldStressUncertainty =
      report.steel.fyMpa.halfUnit / Math.abs(gammaS) +
      Math.abs(report.steel.fyMpa.value) * gammaUncertainty / (gammaS * gammaS)
    const elasticStressUncertainty = report.steel.elasticModulusMpa.halfUnit *
      (Math.abs(point.strain.value) + strainBound)
    const gap = intervalGap(
      point.stress,
      materialInterval(steel, point.strain, strainBound),
      Math.max(yieldStressUncertainty, elasticStressUncertainty)
    )
    if (gap > maxSteelGapMpa) {
      maxSteelGapMpa = gap
      worstSteelPoint = { index: point.index, strain: point.strain.value, sourceStressMpa: point.stress.value }
    }
  }
  const scale = Math.max(1, report.concrete.fckMpa.value, report.steel.fyMpa.value)
  const roundoff = 64 * Number.EPSILON * scale
  return {
    matchedWithinPrintedPrecision: Math.max(maxConcreteGapMpa, maxSteelGapMpa) <= roundoff,
    concretePointsChecked: concretePoints.length,
    rebarPointsChecked: rebarPoints.length,
    maxConcreteGapMpa: Math.max(0, maxConcreteGapMpa - roundoff),
    maxSteelGapMpa: Math.max(0, maxSteelGapMpa - roundoff),
    worstConcretePoint,
    worstSteelPoint,
    precisionBasis:
      'interval overlap after propagating printed strain-plane, coordinate, strain, modulus, strength, and partial-factor precision',
    concreteMechanics: equivalentBlock === null
      ? 'pointwise stress-strain integration'
      : 'equivalent rectangular block; source node stresses checked against the beta1 block boundary',
    steelModelScope: report.steel.curveLabel.includes('Strain-hardening')
      ? 'elastic-perfectly-plastic only where the printed AdSec strain/stress pairs overlap it; no global hardening-law equivalence claimed'
      : 'printed elastic-plastic law replayed directly'
  }
}

const sourceNominalAxial = (summary: Extract<ParsedAdsecReport['summaries'][number], { status: 'solved' }>) => {
  if (summary.strengthFactor === null) return summary.appliedAxial
  const factor = summary.strengthFactor
  return {
    raw: `${summary.appliedAxial.raw}/${factor.raw}`,
    value: summary.appliedAxial.value / factor.value,
    halfUnit:
      summary.appliedAxial.halfUnit / Math.abs(factor.value) +
      Math.abs(summary.appliedAxial.value) * factor.halfUnit / (factor.value * factor.value)
  }
}

const wrapAngle = (angle: number) => {
  let wrapped = angle
  while (wrapped <= -Math.PI) wrapped += 2 * Math.PI
  while (wrapped > Math.PI) wrapped -= 2 * Math.PI
  return wrapped
}

const finiteMaximum = (values: readonly number[]) => values.length === 0 ? null : Math.max(...values)

const auditReport = (entry: AdsecManifestEntry) => {
  const report = parseAdsecReport(entry, resolve(ROOT, entry.file))
  const geometry = geometryInput(report)
  const section = sectionGeometryFromGeometryInput(geometry)
  const rebars = geometryInputRebars(geometry)
  const materials = materialStore(report)
  const origin = { x: report.referencePoint.x.value, y: report.referencePoint.y.value }
  const blockSection = prepareBlockSection(section, rebars, origin)
  const usesEquivalentBlock = entry.route === 'aci' || entry.route === 'aci-2'
  const coarse = usesEquivalentBlock ? null : prepareAnalysis(section, rebars, materials, {}, origin)
  const fine = coarse === null
    ? null
    : prepareAnalysis(section, rebars, materials, { cellSize: coarse.mesh.report.cellSize / 2 }, origin)
  const compiledConcrete = usesEquivalentBlock ? null : compileConcreteMaterial(materials.concrete)
  const compiledSteel = compileSteelMaterial(materials.steel[0]!)
  const aciModel = usesEquivalentBlock ? createAci318Model({
    concreteStrength: report.concrete.fckMpa.value,
    steel: {
      '1': {
        elasticModulus: report.steel.elasticModulusMpa.value,
        yieldStress: report.steel.fyMpa.value,
        ultimateStrain: report.steel.epsU.value
      }
    },
    transverseReinforcement: 'tied'
  }) : null
  const exactArea = blockSection.grossArea
  const reinforcementArea = report.bars.reduce(
    (sum, bar) => sum + Math.PI * bar.diameter.value * bar.diameter.value / 4,
    0
  )
  const reinforcementAreaUncertainty = report.bars.reduce((sum, bar) => {
    const diameter = bar.diameter.value
    const uncertainty = bar.diameter.halfUnit
    return sum + Math.PI / 4 * (2 * Math.abs(diameter) * uncertainty + uncertainty * uncertainty)
  }, 0)
  const geometryEvidence = {
    sourceAreaMm2: report.sectionArea.value,
    reconstructedAreaMm2: exactArea,
    areaDeltaMm2: exactArea - report.sectionArea.value,
    areaMatchedWithinPrintedPrecision: sourceIntervalContains(report.sectionArea, exactArea),
    sourceReinforcementAreaMm2: report.reinforcementArea.value,
    reconstructedReinforcementAreaMm2: reinforcementArea,
    reinforcementAreaDeltaMm2: reinforcementArea - report.reinforcementArea.value,
    reinforcementAreaMatchedWithinPrintedPrecision: sourceIntervalContains(
      report.reinforcementArea,
      reinforcementArea,
      reinforcementAreaUncertainty
    ),
    sourceReferencePoint: { x: origin.x, y: origin.y },
    reconstructedNetConcreteCentroid: netConcreteCentroid(section),
    numericalMethod: coarse === null || fine === null
      ? {
          type: 'exact-equivalent-block-polygon-clipping',
          mesh: null
        }
      : {
          type: 'stress-strain-fibre-integration',
          mesh: {
            coarseCellSizeMm: coarse.mesh.report.cellSize,
            coarsePoints: coarse.mesh.report.points,
            fineCellSizeMm: fine.mesh.report.cellSize,
            finePoints: fine.mesh.report.points
          }
        }
  }
  const geometryMatched = geometryEvidence.areaMatchedWithinPrintedPrecision &&
    geometryEvidence.reinforcementAreaMatchedWithinPrintedPrecision
  const steelDesignPeak = report.steel.fyMpa.value / (report.steel.gammaS?.value ?? 1)
  const forceNormalizationKn = Math.max(
    1,
    (observedConcretePeak(report) * exactArea + steelDesignPeak * reinforcementArea) * KN
  )

  const cases = report.loads.map((load) => {
    const summary = byId(report.summaries, load.id, `${entry.id} summary`)
    if (summary.status === 'no-solution') {
      return {
        id: load.id,
        status: 'not-comparable' as const,
        reason: 'AdSec reports No Solution; no source strength state or P/Mnx/Mny value exists.',
        sourceState: null,
        source: null,
        engineAtSourceState: null,
        difference: null
      }
    }
    const plane = byId(report.planes, load.id, `${entry.id} strain plane`)
    const state: StrainState = { e0: plane.e0.value, kx: plane.kx.value, ky: plane.ky.value }
    const stateMatch = strainEvidence(report, load.id, plane)
    const blockEvaluation = aciModel === null ? null : evaluateAciAtPrintedPlane(blockSection, plane, aciModel)
    const blockState = blockEvaluation?.state ?? null
    const engineState = blockEvaluation === null ? state : blockStrainState(blockSection, blockEvaluation)
    const engineStateMatch = strainEvidence(report, load.id, plane, engineState)
    const localMaterialMatch = materialEvidence(
      report,
      load.id,
      plane,
      compiledSteel,
      compiledConcrete,
      blockEvaluation
    )
    const loadIdentityMatched = sourceIntervalContains(summary.appliedAxial, load.axial.value, load.axial.halfUnit)
    const fineResult = fine === null ? null : evaluatePreparedState(fine, state).total
    const coarseResult = coarse === null ? null : evaluatePreparedState(coarse, state).total
    const engineResult = blockEvaluation?.resultants ?? fineResult
    if (engineResult === null) throw new Error(`${entry.id} case ${load.id}: no forward evaluator is available`)
    const engine = { P: engineResult.P * KN, Mx: engineResult.Mx * KNM, My: engineResult.My * KNM }
    const coarseEngine = coarseResult === null
      ? null
      : { P: coarseResult.P * KN, Mx: coarseResult.Mx * KNM, My: coarseResult.My * KNM }
    const sourceP = sourceNominalAxial(summary)
    const directionNorm = Math.hypot(load.mx.value, load.my.value)
    if (!(directionNorm > 0)) throw new Error(`${entry.id} case ${load.id}: zero source moment direction`)
    const sourceMx = summary.capacityMoment.value * load.mx.value / directionNorm
    const sourceMy = summary.capacityMoment.value * load.my.value / directionNorm
    const sourceMomentScale = Math.max(1, summary.capacityMoment.value)
    const comparable = geometryMatched && loadIdentityMatched &&
      stateMatch.matchedWithinPrintedPrecision && engineStateMatch.matchedWithinPrintedPrecision &&
      localMaterialMatch.matchedWithinPrintedPrecision
    const reasons = [
      ...(!geometryMatched ? ['geometry/reinforcement reconstruction is outside source printed precision'] : []),
      ...(!loadIdentityMatched ? ['summary/load axial identities do not overlap within printed precision'] : []),
      ...(!stateMatch.matchedWithinPrintedPrecision ? ['printed strain plane does not reproduce the printed point strains'] : []),
      ...(!engineStateMatch.matchedWithinPrintedPrecision ? ['engine replay does not preserve the printed deformation state'] : []),
      ...(!localMaterialMatch.matchedWithinPrintedPrecision ? ['local material stress/strain pairs do not match the replay law'] : [])
    ]
    const difference = comparable ? {
      P: engine.P - sourceP.value,
      Mx: engine.Mx - sourceMx,
      My: engine.My - sourceMy,
      relativePOnForceScale: Math.abs(engine.P - sourceP.value) / forceNormalizationKn,
      relativeMxOnMomentScale: Math.abs(engine.Mx - sourceMx) / sourceMomentScale,
      relativeMyOnMomentScale: Math.abs(engine.My - sourceMy) / sourceMomentScale,
      relativeMomentVector: Math.hypot(engine.Mx - sourceMx, engine.My - sourceMy) / sourceMomentScale,
      momentDirectionDeltaDeg: wrapAngle(
        Math.atan2(engine.My, engine.Mx) - Math.atan2(sourceMy, sourceMx)
      ) * DEG,
      meshRelativeP: coarseEngine === null
        ? null
        : Math.abs(engine.P - coarseEngine.P) / forceNormalizationKn,
      meshRelativeMomentVector: coarseEngine === null
        ? null
        : Math.hypot(engine.Mx - coarseEngine.Mx, engine.My - coarseEngine.My) / sourceMomentScale
    } : null
    return {
      id: load.id,
      status: comparable ? 'compared' as const : 'not-comparable' as const,
      reason: comparable
        ? 'Same printed strain plane, axis map, local material ordinates, resistance level, and reconstructed input.'
        : reasons.join('; '),
      sourceState: {
        e0: plane.e0.value,
        kxPerMm: plane.kx.value,
        kyPerMm: plane.ky.value,
        equivalentBlockState: blockState === null ? null : {
          neutralAxisAngleRad: blockState.neutralAxisAngle,
          neutralAxisDepthMm: blockState.neutralAxisDepth,
          beta1: aciModel?.beta1 ?? null
        },
        evidence: stateMatch,
        engineReplayEvidence: engineStateMatch,
        localMaterialEvidence: localMaterialMatch
      },
      source: {
        level: summary.strengthFactor === null ? 'ULS/design-level material response' : 'nominal strength',
        P: sourceP.value,
        Mnx: sourceMx,
        Mny: sourceMy,
        momentMagnitude: summary.capacityMoment.value,
        strengthFactorForNominalRecovery: summary.strengthFactor?.value ?? null,
        componentDerivation: 'Mnx=capacityMagnitude*Myy/hypot(Myy,Mzz); Mny=capacityMagnitude*Mzz/hypot(Myy,Mzz)'
      },
      engineAtSourceState: {
        P: engine.P,
        Mx: engine.Mx,
        My: engine.My,
        momentMagnitude: Math.hypot(engine.Mx, engine.My),
        coarse: coarseEngine,
        mechanics: blockEvaluation === null
          ? 'stress-strain-fibre-integration'
          : 'exact-equivalent-rectangular-block-polygon-clipping'
      },
      difference
    }
  })

  const compared = cases.filter((item) => item.status === 'compared' && item.difference !== null)
  return {
    id: entry.id,
    source: entry.file,
    sourceSha256: report.sourceHash,
    family: entry.family,
    route: entry.route,
    standardText: report.standardText,
    sourceUnits: {
      moment: report.sourceMomentUnit,
      curvature: report.sourceCurvatureUnit,
      stress: report.sourceStressUnit
    },
    comparisonScope: {
      utilizationCompared: false,
      resultantsComparedOnlyAtSameStrainState: true,
      aciResistanceLevel: entry.route.startsWith('aci') ? 'nominal Pn/Mn recovered from P/phi and Mn' : null,
      concreteReplay: report.concrete.compressionCurve === 'parabolic-rectangular'
        ? 'shape and strains from the report; peak ordinate inferred from the maximum printed concrete stress'
        : report.concrete.compressionCurve === 'rectangular'
          ? 'ACI equivalent rectangular block using exact polygon clipping; the printed plane fixes the replay state'
          : 'directly from the printed explicit local stress ordinates'
    },
    geometry: geometryEvidence,
    materialReplay: {
      concreteCurve: report.concrete.compressionCurve,
      concretePeakMpa: observedConcretePeak(report),
      steelCurveReported: report.steel.curveLabel,
      steelReplay: 'elastic-perfectly-plastic, enabled only where every printed case strain/stress pair overlaps the replay law'
    },
    cases,
    summary: {
      sourceCases: cases.length,
      solvedSourceCases: report.summaries.filter((item) => item.status === 'solved').length,
      comparedCases: compared.length,
      notComparableCases: cases.length - compared.length,
      forceNormalizationKn,
      worstRelativePOnForceScale: finiteMaximum(compared.map((item) => item.difference!.relativePOnForceScale)),
      worstRelativeMxOnMomentScale: finiteMaximum(compared.map((item) => item.difference!.relativeMxOnMomentScale)),
      worstRelativeMyOnMomentScale: finiteMaximum(compared.map((item) => item.difference!.relativeMyOnMomentScale)),
      worstRelativeMomentVector: finiteMaximum(compared.map((item) => item.difference!.relativeMomentVector)),
      worstMeshRelativeP: finiteMaximum(compared.flatMap((item) =>
        item.difference!.meshRelativeP === null ? [] : [item.difference!.meshRelativeP]
      )),
      worstMeshRelativeMomentVector: finiteMaximum(compared.flatMap((item) =>
        item.difference!.meshRelativeMomentVector === null ? [] : [item.difference!.meshRelativeMomentVector]
      ))
    }
  }
}

const reports = ADSEC_MANIFEST.map(auditReport)
const npmVersion = /^npm\/([^\s]+)/u.exec(process.env.npm_config_user_agent ?? '')?.[1] ?? 'unknown'
const result = {
  schema: 'adsec-calculation-value-audit-v1',
  generatedAt: '2026-09-04',
  referenceRuntime: {
    node: process.version,
    npm: npmVersion,
    v8: process.versions.v8,
    platform: process.platform,
    architecture: process.arch
  },
  scope: {
    utilizationCompared: false,
    statement:
      'Only calculation values are compared. P/Mnx/Mny are compared only after the printed AdSec strain plane reproduces the printed concrete-node and reinforcement strains within propagated source precision.',
    axes: 'AdSec y->x, z->y, N->P, Myy->Mx/Mnx, Mzz->My/Mny.',
    normalization:
      '|Delta P| is normalized by reconstructed peak concrete force plus design-yield reinforcement force; moment-vector error is normalized by the source capacity-moment magnitude. Absolute values remain in every case row.',
    noSolution: 'Preserved as external evidence; never converted to zero or compared as a capacity result.',
    acceptance: 'Measured differential evidence only. No universal pass tolerance or design-code verification claim is assigned.'
  },
  reports,
  aggregate: {
    reports: reports.length,
    sourceCases: reports.reduce((sum, report) => sum + report.summary.sourceCases, 0),
    solvedSourceCases: reports.reduce((sum, report) => sum + report.summary.solvedSourceCases, 0),
    comparedCases: reports.reduce((sum, report) => sum + report.summary.comparedCases, 0),
    notComparableCases: reports.reduce((sum, report) => sum + report.summary.notComparableCases, 0),
    worstRelativePOnForceScale: finiteMaximum(reports.flatMap((report) =>
      report.summary.worstRelativePOnForceScale === null ? [] : [report.summary.worstRelativePOnForceScale]
    )),
    worstRelativeMomentVector: finiteMaximum(reports.flatMap((report) => report.summary.worstRelativeMomentVector === null ? [] : [report.summary.worstRelativeMomentVector])),
    worstMeshRelativeP: finiteMaximum(reports.flatMap((report) => report.summary.worstMeshRelativeP === null ? [] : [report.summary.worstMeshRelativeP])),
    worstMeshRelativeMomentVector: finiteMaximum(reports.flatMap((report) => report.summary.worstMeshRelativeMomentVector === null ? [] : [report.summary.worstMeshRelativeMomentVector]))
  }
}

const percent = (value: number | null) => value === null ? 'n/a' : `${(100 * value).toFixed(4)}%`
const number = (value: number | null) => value === null ? 'n/a' : value.toLocaleString('en-US', { maximumFractionDigits: 3 })

const markdownLines = [
  '# AdSec Calculation-Value Audit',
  '',
  'Status: **external differential evidence; preview only, not design-code verification**.',
  '',
  'This audit intentionally excludes utilization. `P/Mnx/Mny` are compared only at the exact AdSec',
  'strain plane after the complete printed concrete-node and reinforcement strain tables prove the',
  'axis/state mapping within propagated printed precision. AdSec `Myy -> Mnx/Mx` and',
  '`Mzz -> Mny/My`. ACI comparisons use nominal `Pn=P/φ` and `Mn`; `M/φMn` is not used.',
  'ACI concrete is replayed by exact equivalent-block polygon clipping, while its steel strain is',
  'kept on the central printed AdSec plane rather than moved to another deformation state.',
  '`|ΔP| / force scale` uses reconstructed peak concrete force plus design-yield reinforcement',
  'force; every source/engine value and absolute difference remains available in the JSON.',
  '',
  '| Report | Solved | Compared | Worst |ΔP| / force scale | Worst ΔM vector | Mesh ΔP | Mesh ΔM |',
  '|---|---:|---:|---:|---:|---:|---:|',
  ...reports.map((report) =>
    `| ${report.id} | ${report.summary.solvedSourceCases} | ${report.summary.comparedCases} | ${percent(report.summary.worstRelativePOnForceScale)} | ${percent(report.summary.worstRelativeMomentVector)} | ${percent(report.summary.worstMeshRelativeP)} | ${percent(report.summary.worstMeshRelativeMomentVector)} |`
  ),
  '',
  `Aggregate: ${result.aggregate.comparedCases}/${result.aggregate.solvedSourceCases} solved source states compared; ` +
    `${result.aggregate.notComparableCases} total case(s) not comparable, including AdSec No Solution rows.`,
  '',
  '## Per-case values',
  ''
]

for (const report of reports) {
  markdownLines.push(`### ${report.id}`, '')
  markdownLines.push(
    '| Case | Status | Source P (kN) | Engine P (kN) | Source Mnx (kN·m) | Engine Mx (kN·m) | Source Mny (kN·m) | Engine My (kN·m) | ΔM vector |',
    '|---:|---|---:|---:|---:|---:|---:|---:|---:|'
  )
  for (const item of report.cases) {
    if (item.source === null || item.engineAtSourceState === null || item.difference === null) {
      markdownLines.push(`| ${item.id} | ${item.status}: ${item.reason} | — | — | — | — | — | — | — |`)
      continue
    }
    markdownLines.push(
      `| ${item.id} | compared | ${number(item.source.P)} | ${number(item.engineAtSourceState.P)} | ` +
      `${number(item.source.Mnx)} | ${number(item.engineAtSourceState.Mx)} | ` +
      `${number(item.source.Mny)} | ${number(item.engineAtSourceState.My)} | ${percent(item.difference.relativeMomentVector)} |`
    )
  }
  markdownLines.push('')
}

markdownLines.push(
  '## Limitations',
  '',
  '- The reports are commercial-program evidence, not normative authority.',
  '- Parabolic-rectangular peak stress is reconstructed from the maximum printed AdSec concrete stress; this validates integration/resultants at the reported states, not independent design-code coefficients.',
  '- ACI reports label steel as strain-hardening. The replay is enabled only where all printed strain/stress pairs overlap the elastic-perfectly-plastic response; no hardening branch or ACI edition equivalence is claimed.',
  '- For stress-strain routes, one `h -> h/2` mesh difference is reported as an empirical solution-verification indicator, not Richardson extrapolation or a universal error bound. ACI equivalent-block rows use exact polygon clipping and therefore have no mesh-difference value.',
  '- The repository ACI adapter supplies the equivalent-block law. Agreement is differential evidence only; it does not prove edition equivalence with the source report.',
  '- No UR, adequacy verdict, nearest-angle capacity point, or differently deformed `Mnx/Mny` state is compared.',
  ''
)

const jsonText = `${JSON.stringify(result, null, 2)}\n`
const markdownText = `${markdownLines.join('\n')}\n`

if (UPDATE) {
  mkdirSync(dirname(JSON_OUT), { recursive: true })
  writeFileSync(JSON_OUT, jsonText, 'utf8')
  writeFileSync(MARKDOWN_OUT, markdownText, 'utf8')
  console.log(`updated ${JSON_OUT}`)
  console.log(`updated ${MARKDOWN_OUT}`)
} else if (CHECK) {
  const expectedJson = readFileSync(JSON_OUT, 'utf8')
  const expectedMarkdown = readFileSync(MARKDOWN_OUT, 'utf8')
  if (expectedJson !== jsonText || expectedMarkdown !== markdownText) {
    throw new Error('AdSec calculation-value audit artifacts are stale; review and run --update explicitly.')
  }
}

console.table(reports.map((report) => ({
  report: report.id,
  solved: report.summary.solvedSourceCases,
  compared: report.summary.comparedCases,
  worstPOnForceScale: percent(report.summary.worstRelativePOnForceScale),
  worstM: percent(report.summary.worstRelativeMomentVector)
})))
console.log(
  `AdSec calculation-value audit: ${result.aggregate.comparedCases}/${result.aggregate.solvedSourceCases} solved states compared; ` +
  `${result.aggregate.notComparableCases} total case(s) not comparable. Utilization was not evaluated.`
)
