/**
 * Format-neutral report model.
 *
 * `docs/development/00-README.md` §3 puts `ReportModel` between the result view model and the
 * output format, and that separation is the point of this file: nothing here imports a PDF, an
 * Excel writer or a plotting library, so the same model can drive a second format later without
 * either format becoming a second calculation.
 *
 * The rule the model enforces on itself: **it formats, it does not decide**. Every number below is
 * either copied from a kernel result or is a presentation-only derivation (a polyline sampled from
 * a surface the kernel already produced, a drawing-only clip of the compression zone). No factor,
 * rounding rule, interpolation or adequacy test is introduced here — that is
 * `docs/engineering/05` §6, and it is what keeps a report from disagreeing with the software that
 * produced it.
 */
import {
  applyDesignCheckToInverse,
  buildExactDirectionCurveFromPrepared,
  checkLoadcaseUtilizationFromSurface,
  codeAdjustedDemandOfCheck,
  evaluatePreparedState,
  intersectSurfaceWithDemandRay,
  prepareAnalysis,
  sliceMomentPlane,
  solveInversePreviewFromPrepared,
  sliceFixedDesignPContour,
  strainGradientDirection,
  type ExactDirectionCurve,
  type InversePreviewResult,
  type PreviewSurface,
  type StrainState
} from '@pm/analysis'
import {
  buildEquivalentBlockExactDirectionCurveFromPrepared,
  prepareBlockAnalysis,
  solveEquivalentBlockDemandsFromPrepared
} from '@pm/analysis-equivalent-block'
import {
  clipPreparedSectionToHalfPlane,
  prepareEquivalentBlockSection,
  projectedOuterExtents,
  type NominalBlockEvaluation,
  type PreparedEquivalentBlockSection
} from '@pm/equivalent-block'
import {
  buildResistanceMaterialSets,
  designBasisRequiresOverrideReason,
  resolveTensionControlledStrainLimit,
  type DesignBasis
} from '@pm/design'
import {
  netConcreteCentroid,
  summarizeSection,
  type GeometryInputRebarView,
  type SectionGeometry
} from '@pm/geometry'
import {
  compileConcreteMaterial,
  compileSteelMaterial,
  userBlockCompressionStress,
  type MaterialStore
} from '@pm/materials'
import {
  analysisMeshKernelOptions,
  calculationProfile,
  isEquivalentBlockProfileId,
  type AnalysisOptions,
  type CalculationAnalysisOptions,
  type CalculationProfileId,
  type EquivalentBlockAnalysisOptions,
  type LoadCombination
} from '@pm/project'
import { ExcelExportError } from '../excel/workbook-common'

export type ReportInput = {
  projectName: string
  sectionName: string
  calculationProfileId: CalculationProfileId
  section: SectionGeometry
  rebars: GeometryInputRebarView[]
  materialStore: MaterialStore
  designBasis: DesignBasis
  analysisOptions: CalculationAnalysisOptions
  /** Governing surface already built by the app. Exact demand meridians reuse these settings. */
  surface: PreviewSurface
  loadcases: readonly LoadCombination[]
  /**
   * Combinations the user asked to see worked through. May be empty (summary-only report), a
   * subset, or all of them.
   */
  detailLoadcaseIds: readonly number[]
  /** Omit for byte-identical output; supply to stamp a generation time. */
  generatedAt?: Date
}

export type LabelledValue = readonly [string, string]

/**
 * A plain coordinate.
 *
 * Deliberately not `@pm/geometry`'s `XY`: that carries an editor id, and a report model has no
 * business round-tripping editor identity into a drawing.
 */
export type XY = { x: number; y: number }

export type SectionDrawing = {
  solids: ReadonlyArray<{ outer: XY[]; holes: XY[][] }>
  bars: ReadonlyArray<{ id: string; x: number; y: number; dia: number; steel: string }>
  bounds: { minX: number; maxX: number; minY: number; maxY: number }
  origin: XY
}

export type InteractionCurve = {
  kind: 'moment-plane' | 'direct-beta'
  thetaDeg: number
  /** Signed moment about the θ direction, kN·m, against axial force in kN. */
  nominal: ReadonlyArray<{ m: number; p: number }>
  design: ReadonlyArray<{ m: number; p: number }>
}

export type CombinationRow = {
  id: number
  name: string
  pKn: number
  mxKnm: number
  myKnm: number
  thetaDeg: number
  utilization: number | null
  fixedPUtilization: number | null
  phi: number | null
  classification: string
  verdict: 'adequate' | 'inadequate' | 'not-checked'
  note: string
}

export type BarState = {
  id: string
  x: number
  y: number
  dia: number
  area: number
  /** Depth from the extreme compression fibre along the neutral-axis normal, mm. */
  depth: number
  strain: number
  stressMpa: number
  forceKn: number
  insideBlock: boolean | null
}

export type CompressionZone = {
  /** `block` is the code's `a = β1·c` region; `fibre` is simply where the strain is compressive. */
  kind: 'block' | 'fibre'
  polygons: ReadonlyArray<{ outer: XY[]; holes: XY[][] }>
  label: string
}

export type DepthProfile = {
  /** Section depth measured along the neutral-axis normal, mm. */
  projectedDepth: number
  neutralAxisDepth: number
  blockDepth: number | null
  extremeCompressionStrain: number
  /** Strain at the extreme tension fibre; negative in tension. */
  extremeTensionStrain: number
  blockStressMpa: number | null
  /** Sampled concrete stress against depth from the compression edge, for the fibre route. */
  stressSamples: ReadonlyArray<{ depth: number; stressMpa: number }>
}

export type CombinationDetail = {
  row: CombinationRow
  converged: boolean
  admissible: boolean
  message: string
  /** Neutral-axis line direction in section coordinates, degrees CCW from +x. */
  neutralAxisAngleDeg: number
  neutralAxisLine: readonly [XY, XY] | null
  compressionZone: CompressionZone | null
  depthProfile: DepthProfile | null
  bars: readonly BarState[]
  concrete: LabelledValue[]
  resultants: LabelledValue[]
  evidence: LabelledValue[]
  /** Exact direct-β meridian when equilibrium defines β; otherwise a labelled fixed-plane diagnostic. */
  interaction: InteractionCurve & {
    demand: { m: number; p: number }
    capacity: { m: number; p: number } | null
  }
}

export type ColumnReportModel = {
  identity: LabelledValue[]
  status: string
  watermark?: string
  scopeStatements: readonly string[]
  warnings: readonly string[]
  drawing: SectionDrawing
  sectionProperties: LabelledValue[]
  concreteMaterial: LabelledValue[]
  steelMaterial: LabelledValue[]
  resistanceBasis: LabelledValue[]
  sampling: LabelledValue[]
  barSchedule: ReadonlyArray<readonly string[]>
  curves: readonly InteractionCurve[]
  axialCapKn: number | null
  combinations: readonly CombinationRow[]
  details: readonly CombinationDetail[]
  generated: string
}

const KN = 1e3
const KNM = 1e6

const fmt = (value: number, digits = 2) =>
  Number.isFinite(value)
    ? value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
    : '—'

const sci = (value: number, digits = 3) =>
  Number.isFinite(value) ? value.toExponential(digits) : '—'

const deg = (radians: number) => (radians * 180) / Math.PI

/**
 * Curve directions to publish.
 *
 * The principal planes are what a reviewer checks first; the demand directions are what the project
 * is actually loaded in. Publishing both means the diagram a reader compares a combination against
 * is the plane that combination lies in, not the nearest principal one.
 */
const curveAngles = (loadcases: readonly LoadCombination[]) => {
  const angles = new Set<number>([0, 90])
  for (const loadcase of loadcases) {
    if (Math.abs(loadcase.Mx) < 1e-9 && Math.abs(loadcase.My) < 1e-9) continue
    angles.add(Math.round(deg(Math.atan2(loadcase.My, loadcase.Mx)) * 100) / 100)
  }
  return [...angles].sort((a, b) => a - b)
}

/**
 * Sample a vertical plane cut as a single polyline.
 *
 * `sliceMomentPlane` returns closed paths in the (Mθ, P) plane. The report draws them as-is: it
 * does not re-order, re-close or smooth them, because the topology of that cut — whether it closes,
 * where the axial cap flattens it — is result evidence.
 */
const planeCurve = (
  points: PreviewSurface['points'],
  triangles: PreviewSurface['triangles'],
  thetaRad: number
) => {
  const paths = sliceMomentPlane(points, thetaRad, triangles)
  const best = paths.reduce<{ length: number; path: (typeof paths)[number] } | null>((current, path) => {
    return !current || path.points.length > current.length ? { length: path.points.length, path } : current
  }, null)
  if (!best) return []
  return best.path.points.map((point) => ({ m: point.M / KNM, p: point.P / KN }))
}

const fixedDesignDataset = (surface: PreviewSurface) => ({
  points: surface.designFixed?.points ?? surface.points,
  triangles: surface.designFixed?.triangles ?? surface.triangles
})

const fixedNominalDataset = (surface: PreviewSurface) => ({
  points: surface.nominalFixed?.points ?? surface.nominalPoints ?? surface.points,
  triangles: surface.nominalFixed?.triangles ?? surface.nominalTriangles ?? surface.triangles
})

const buildCurves = (surface: PreviewSurface, loadcases: readonly LoadCombination[]): InteractionCurve[] =>
  curveAngles(loadcases).map((thetaDeg) => {
    const thetaRad = (thetaDeg * Math.PI) / 180
    const design = fixedDesignDataset(surface)
    const nominal = fixedNominalDataset(surface)
    return {
      kind: 'moment-plane',
      thetaDeg,
      design: planeCurve(design.points, design.triangles, thetaRad),
      nominal: planeCurve(nominal.points, nominal.triangles, thetaRad)
    }
  })

const directMeridianCurve = (curve: ExactDirectionCurve): InteractionCurve => {
  const project = (point: ExactDirectionCurve['designAdaptive'][number]) => ({
    m: (point.Mx * Math.cos(curve.beta) + point.My * Math.sin(curve.beta)) / KNM,
    p: point.P / KN
  })
  return {
    kind: 'direct-beta',
    thetaDeg: deg(curve.beta),
    design: curve.designAdaptive.map(project),
    nominal: curve.nominalFixed.map(project)
  }
}

const verdictOf = (utilization: number | null, converged: boolean, admissible: boolean): CombinationRow['verdict'] => {
  if (!converged || utilization === null) return 'not-checked'
  if (!admissible) return 'not-checked'
  return utilization <= 1 ? 'adequate' : 'inadequate'
}

const combinationRow = (loadcase: LoadCombination, result: InversePreviewResult | null): CombinationRow => {
  const converged = result?.converged ?? false
  const admissible = result ? result.admissibility.evaluated === false || result.admissibility.ok : false
  return {
    id: loadcase.id,
    name: loadcase.name,
    pKn: loadcase.P / KN,
    mxKnm: loadcase.Mx / KNM,
    myKnm: loadcase.My / KNM,
    thetaDeg:
      Math.abs(loadcase.Mx) < 1e-9 && Math.abs(loadcase.My) < 1e-9
        ? 0
        : deg(Math.atan2(loadcase.My, loadcase.Mx)),
    utilization: result?.utilization ?? null,
    fixedPUtilization: result?.fixedPUtilization ?? null,
    phi: result?.resistance?.factor ?? null,
    classification: result?.resistance?.classification ?? '—',
    verdict: verdictOf(result?.utilization ?? null, converged, admissible),
    note: result?.message ?? 'Not solved.'
  }
}

/** Neutral-axis line, long enough to cross the whole section, for the cross-section drawing. */
const neutralAxisLine = (
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
  origin: XY,
  normalX: number,
  normalY: number,
  offset: number
): readonly [XY, XY] => {
  const span = Math.hypot(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY)
  // A point on the line, then walk along its direction (the normal rotated 90°).
  const baseX = normalX * offset
  const baseY = normalY * offset
  const dirX = -normalY
  const dirY = normalX
  void origin
  return [
    { x: baseX - dirX * span, y: baseY - dirY * span },
    { x: baseX + dirX * span, y: baseY + dirY * span }
  ]
}

const drawingOf = (
  section: SectionGeometry,
  rebars: GeometryInputRebarView[],
  materialStore: MaterialStore,
  origin: XY
): SectionDrawing => {
  const solids = section.solids.map((solid) => ({
    outer: solid.outer.map((point) => ({ x: point.x - origin.x, y: point.y - origin.y })),
    holes: solid.holes.map((hole) => hole.map((point) => ({ x: point.x - origin.x, y: point.y - origin.y })))
  }))
  const steelName = (id: number | undefined) =>
    materialStore.steel.find((item) => item.id === (id ?? materialStore.defaults.steelMaterialId))?.name ?? '—'
  const bars = rebars.map((bar) => ({
    id: String(bar.id),
    x: bar.x - origin.x,
    y: bar.y - origin.y,
    dia: bar.dia,
    steel: steelName(bar.steelMaterialId)
  }))
  const xs = solids.flatMap((solid) => solid.outer.map((point) => point.x))
  const ys = solids.flatMap((solid) => solid.outer.map((point) => point.y))
  return {
    solids,
    bars,
    origin,
    bounds: {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys)
    }
  }
}

/**
 * Compression zone for the drawing.
 *
 * For the block route this *is* the region the kernel integrated. For the fibre route no such
 * polygon exists in the calculation, so the shading is the strain-sign half-plane clipped to the
 * section — a drawing aid, labelled as one, that never re-enters a resultant.
 */
const clipCompressionZone = (
  prepared: PreparedEquivalentBlockSection,
  normalX: number,
  normalY: number,
  offset: number,
  origin: XY
) =>
  clipPreparedSectionToHalfPlane(prepared, normalX, normalY, offset).geometry.map((solid) => ({
    outer: solid.outer.map((point) => ({ x: point.x - origin.x, y: point.y - origin.y })),
    holes: solid.holes.map((hole) => hole.map((point) => ({ x: point.x - origin.x, y: point.y - origin.y })))
  }))

const interactionFor = (
  surface: PreviewSurface,
  loadcase: LoadCombination,
  curves: readonly InteractionCurve[],
  exactCurve: ExactDirectionCurve | null
) => {
  const demandTheta =
    Math.abs(loadcase.Mx) < 1e-9 && Math.abs(loadcase.My) < 1e-9 ? 0 : Math.atan2(loadcase.My, loadcase.Mx)
  const demandThetaDeg = deg(demandTheta)
  const displayDesign = fixedDesignDataset(surface)
  const displayNominal = fixedNominalDataset(surface)
  const existing = curves.find((curve) =>
    curve.kind === 'moment-plane' && Math.abs(curve.thetaDeg - demandThetaDeg) < 1e-6
  )
  const curve: InteractionCurve = exactCurve
    ? directMeridianCurve(exactCurve)
    : existing ?? {
        kind: 'moment-plane',
        thetaDeg: demandThetaDeg,
        design: planeCurve(displayDesign.points, displayDesign.triangles, demandTheta),
        nominal: planeCurve(displayNominal.points, displayNominal.triangles, demandTheta)
      }
  const projectionAngle = exactCurve?.beta ?? demandTheta
  const ray = intersectSurfaceWithDemandRay(surface, loadcase)
  return {
    ...curve,
    demand: {
      m: (loadcase.Mx * Math.cos(projectionAngle) + loadcase.My * Math.sin(projectionAngle)) / KNM,
      p: loadcase.P / KN
    },
    capacity: ray
      ? {
          m: (ray.point.Mx * Math.cos(projectionAngle) + ray.point.My * Math.sin(projectionAngle)) / KNM,
          p: ray.point.P / KN
        }
      : null
  }
}

export const buildColumnReportModel = (input: ReportInput): ColumnReportModel => {
  const profile = calculationProfile(input.calculationProfileId)
  const basis = input.designBasis
  const { section, rebars, materialStore } = input
  if (rebars.length === 0) throw new ExcelExportError('The section has no reinforcement to report.')
  const origin = netConcreteCentroid(section)
  const summary = summarizeSection(section)
  const steelArea = rebars.reduce((sum, bar) => sum + (Math.PI * bar.dia * bar.dia) / 4, 0)
  const concrete = materialStore.concrete
  const steel =
    materialStore.steel.find((item) => item.id === materialStore.defaults.steelMaterialId) ?? materialStore.steel[0]
  if (!steel) throw new ExcelExportError('No steel material is defined.')

  const isBlock = isEquivalentBlockProfileId(input.calculationProfileId)
  const drawing = drawingOf(section, rebars, materialStore, origin)
  const bounds = drawing.bounds
  const curves = buildCurves(input.surface, input.loadcases)

  // One prepared block section for drawing-only clipping, whichever mechanics is in use.
  const drawingSection = prepareEquivalentBlockSection({
    solids: section.solids.map((solid) => ({
      outer: solid.outer.map(({ x, y }) => ({ x, y })),
      holes: solid.holes.map((hole) => hole.map(({ x, y }) => ({ x, y })))
    })),
    rebars: rebars.map((bar) => ({
      id: String(bar.id),
      x: bar.x,
      y: bar.y,
      area: (Math.PI * bar.dia * bar.dia) / 4,
      steelLawId: String(bar.steelMaterialId ?? materialStore.defaults.steelMaterialId)
    })),
    referencePoint: origin,
    units: 'N-mm-MPa',
    signConvention: 'compression-positive'
  })

  const results = new Map<number, InversePreviewResult>()
  const detail: CombinationDetail[] = []
  const wanted = new Set(input.detailLoadcaseIds)

  if (isBlock) {
    const prepared = prepareBlockAnalysis(
      input.calculationProfileId,
      section,
      rebars,
      materialStore,
      basis
    )
    const options = input.analysisOptions as EquivalentBlockAnalysisOptions
    const solved = solveEquivalentBlockDemandsFromPrepared(prepared, options, input.loadcases)
    for (let index = 0; index < input.loadcases.length; index += 1) {
      const loadcase = input.loadcases[index]
      const result = solved[index]
      results.set(loadcase.id, result)
      if (!wanted.has(loadcase.id)) continue
      const beta = result.ok && result.admissibility.evaluated
        ? strainGradientDirection(result.state)
        : null
      const exactCurve = beta === null
        ? null
        : buildEquivalentBlockExactDirectionCurveFromPrepared(prepared, options, beta)
      detail.push(
        blockDetail(prepared, drawingSection, origin, loadcase, result, input.surface, curves, exactCurve)
      )
    }
  } else {
    const options = input.analysisOptions as AnalysisOptions
    const stateMaterials = buildResistanceMaterialSets(materialStore, basis).stateMaterials
    const prepared = prepareAnalysis(section, rebars, stateMaterials, analysisMeshKernelOptions(options))
    for (const loadcase of input.loadcases) {
      const contour = sliceFixedDesignPContour(input.surface, loadcase.P)
      // The inverse gives the equilibrium state; adequacy is the design-surface ray. Both, composed
      // exactly as the application composes them.
      const designCheck = checkLoadcaseUtilizationFromSurface(input.surface, loadcase)
      const result = applyDesignCheckToInverse(
        solveInversePreviewFromPrepared(
          prepared,
          loadcase,
          contour,
          codeAdjustedDemandOfCheck(designCheck)
        ),
        designCheck
      )
      results.set(loadcase.id, result)
      if (!wanted.has(loadcase.id)) continue
      const beta = result.ok && result.admissibility.evaluated
        ? strainGradientDirection(result.state)
        : null
      const exactCurve = beta === null
        ? null
        : buildExactDirectionCurveFromPrepared(
            prepared,
            materialStore,
            basis,
            options,
            beta
          )
      detail.push(
        fibreDetail(
          prepared,
          drawingSection,
          origin,
          materialStore,
          loadcase,
          result,
          input.surface,
          curves,
          exactCurve
        )
      )
    }
  }

  const combinations = input.loadcases.map((loadcase) =>
    combinationRow(loadcase, results.get(loadcase.id) ?? null)
  )
  const axialCapPoint = fixedDesignDataset(input.surface).points
    .filter((point) => point.surfaceRole === 'axial-cap')
    .reduce<number | null>((current, point) => (current === null ? point.P : Math.max(current, point.P)), null)

  const epsY = steel.limits?.epsY ?? steel.fy / steel.elasticModulus
  const tensionLimit =
    basis.format === 'globalResultantFactor'
      ? resolveTensionControlledStrainLimit(basis, epsY, steel.fy)
      : null

  return {
    status:
      basis.verificationStatus === 'user-defined'
        ? 'PREVIEW — user-defined profile, not a code check'
        : 'PREVIEW — not an accepted design result',
    watermark: 'PREVIEW',
    generated: input.generatedAt
      ? input.generatedAt.toISOString().slice(0, 19).replace('T', ' ')
      : 'not stamped (deterministic output)',
    identity: [
      ['Project', input.projectName],
      ['Section', input.sectionName],
      ['Calculation profile', profile.label],
      ['Mechanics', profile.mechanics === 'equivalent-rectangular-block' ? 'Equivalent rectangular stress block' : 'Stress-strain integration'],
      ['Resistance profile', basis.identity.document],
      ['Profile edition', basis.identity.edition],
      ['Verification status', basis.verificationStatus],
      ['Concrete model basis', basis.materialModelModified ? 'User-defined / modified' : 'Code-default'],
      ['Method id', basis.identity.methodId],
      ['Units', 'mm · N · MPa; forces reported in kN, moments in kN·m'],
      ['Sign convention', 'Compression positive; Mx = ΣF·(y−yc); My = ΣF·(x−xc)']
    ],
    scopeStatements: [
      'This document reports a preview calculation. It is not an accepted design result and must not be released as a design report.',
      `Resistance is reported in two stages: Nominal is the reference before the resistance treatment, Design is the usable resistance. Only the Design surface is compared with factored ULS demand.`,
      profile.mechanics === 'equivalent-rectangular-block'
        ? profile.code === 'AS'
          ? "Concrete compression uses the AS 3600 equivalent block σc = α₂·f'c over a = γ·c, obtained by exact polygon clipping. There is no concrete integration mesh, and stress is zero outside the compression block."
          : 'Concrete compression is the code-equivalent rectangular block over a = β1·c, obtained by exact polygon clipping. There is no concrete integration mesh, and the stress between a and c is zero.'
        : 'Concrete compression is integrated from the material stress-strain law over a verified triangle/quadrature mesh of the section.',
      ...(profile.code === 'EN'
        ? ['EN 1992 preview uses recommended material factors without a National Annex. The tension-controlled surface boundary is not yet a complete EC2 strain-domain implementation.']
        : []),
      ...(profile.code === 'AS'
        ? [
            'AS 3600 preview assumes a general prismatic stress block. Circular/narrowing-width modifiers, minimum eccentricity, slenderness, second-order effects and independent clause verification are outside this section report.'
          ]
        : []),
      ...(basis.verificationStatus === 'user-defined'
        ? ['The resistance rules and material parameters in this report were declared by the project. They carry no clause traceability, and this software makes no claim that they satisfy any design standard.']
        : []),
      ...(designBasisRequiresOverrideReason(basis) && basis.overrideReason.trim().length > 0
        ? [`Modified resistance profile. Stated basis: ${basis.overrideReason}`]
        : []),
      'Overview interaction diagrams are geometric plane cuts of the fixed 22-station, 10° direction grid. Adaptive design points are reserved for governing resistance checks and exact demand meridians.'
    ],
    warnings: input.surface.warnings ?? [],
    drawing,
    sectionProperties: [
      ['Gross concrete area Ag', `${fmt(summary.area, 0)} mm²`],
      ['Reinforcement area As', `${fmt(steelArea, 0)} mm²`],
      ['Reinforcement ratio ρ', `${fmt((steelArea / Math.max(1, summary.area)) * 100, 3)} %`],
      ['Bar count', String(rebars.length)],
      ['Net centroid', `(${fmt(origin.x, 1)}, ${fmt(origin.y, 1)}) mm`],
      ['Bounding box', `${fmt(bounds.maxX - bounds.minX, 1)} × ${fmt(bounds.maxY - bounds.minY, 1)} mm`],
      ['Solids / holes', `${section.solids.length} / ${section.solids.reduce((sum, solid) => sum + solid.holes.length, 0)}`],
      ['Perimeter', `${fmt(summary.perimeter, 1)} mm`]
    ],
    concreteMaterial: [
      ['Name', concrete.name],
      ['Standard', concrete.standard],
      ['fck', `${fmt(concrete.fck, 1)} MPa`],
      ['Model', concrete.stressStrain.type],
      ['εcu', fmt(concrete.limits.epsCu, 5)],
      ...(concrete.limits.eps0 !== undefined ? [['εc0', fmt(concrete.limits.eps0, 5)] as LabelledValue] : []),
      ...('alpha' in concrete.stressStrain ? [['α', fmt(concrete.stressStrain.alpha, 4)] as LabelledValue] : []),
      ...(concrete.stressStrain.type === 'user-block'
        ? ([
            ['β1', fmt(concrete.stressStrain.beta1, 4)],
            ['σblock', `${fmt(userBlockCompressionStress(concrete), 3)} MPa`]
          ] as LabelledValue[])
        : []),
      ...(concrete.stressStrain.type === 'as3600-equivalent-block'
        ? ([
            ['alpha2', fmt(concrete.stressStrain.alpha2, 4)],
            ['gamma', fmt(concrete.stressStrain.gamma, 4)],
            ["sigma_block", `${fmt(concrete.stressStrain.alpha2 * concrete.fck, 3)} MPa`]
          ] as LabelledValue[])
        : []),
      ...(concrete.elasticModulus !== undefined ? [['Ec', `${fmt(concrete.elasticModulus, 0)} MPa`] as LabelledValue] : []),
      ['Tension', concrete.limits.ignoreTension ? 'ignored' : 'included']
    ],
    steelMaterial: [
      ['Name', steel.name],
      ['Standard', steel.standard],
      ['fy', `${fmt(steel.fy, 1)} MPa`],
      ['Es', `${fmt(steel.elasticModulus, 0)} MPa`],
      ['Model', steel.stressStrain.type],
      ['εy', fmt(epsY, 6)],
      ['εu', steel.limits?.epsU === undefined ? 'not declared' : fmt(steel.limits.epsU, 5)],
      ['Grades used', String(new Set(rebars.map((bar) => bar.steelMaterialId ?? materialStore.defaults.steelMaterialId)).size)]
    ],
    resistanceBasis:
      basis.format === 'globalResultantFactor'
        ? profile.code === 'AS'
          ? [
              ['Format', 'AS 3600 action/state-dependent capacity factor'],
              ['Compression-factor class', basis.transverseReinforcement === 'qualifying-spiral'
                ? 'short column with Q/G >= 0.25'
                : 'ordinary column'],
              ['phi_o ordinary', fmt(basis.factors.phiCompressionOther, 3)],
              ['phi_o short column Q/G >= 0.25', fmt(basis.factors.phiCompressionSpiral, 3)],
              ['phi bending range', `${fmt(basis.factors.phiCompressionSpiral, 3)} to ${fmt(basis.factors.phiTension, 3)}`],
              ['phi tension', fmt(basis.factors.phiTension, 3)],
              ['Axial cap', 'not applied; phi_o governs the compression pole']
            ]
          : [
            ['Format', 'Global resultant strength-reduction factor'],
            ['Transverse reinforcement', basis.transverseReinforcement],
            ['φ compression (ties)', fmt(basis.factors.phiCompressionOther, 3)],
            ['φ compression (spiral)', fmt(basis.factors.phiCompressionSpiral, 3)],
            ['φ tension', fmt(basis.factors.phiTension, 3)],
            ['εt,limit', tensionLimit === null ? '—' : fmt(tensionLimit, 5)],
            ['Transition rule', basis.transition.type],
            ['Axial cap', basis.axialCapEnabled
              ? `${fmt(basis.transverseReinforcement === 'qualifying-spiral' ? basis.factors.axialCapSpiral : basis.factors.axialCapOther, 3)} × factored compression pole`
              : 'not applied']
            ]
        : [
            ['Format', 'Design material reevaluation'],
            ...basis.factors.concrete.components.map((component) => [
              `${component.symbol} · concrete`,
              `${fmt(component.value, 3)} (${component.operation})`
            ] as LabelledValue),
            ...basis.factors.reinforcement.components.map((component) => [
              `${component.symbol} · reinforcement`,
              `${fmt(component.value, 3)} (${component.operation})`
            ] as LabelledValue),
            ['Compression endpoint', basis.compressionEndpoint],
            ['Minimum eccentricity', basis.minimumEccentricity
              ? `${basis.minimumEccentricity.constantMm} + ${basis.minimumEccentricity.depthFactor}h mm`
              : 'not prescribed by this profile']
          ],
    sampling: [
      ['Governing adaptive points', String(input.surface.points.length)],
      ['Adaptive directions', String(input.surface.directions.length)],
      ['Adaptive stations', String(input.surface.stations.length)],
      ['Fixed display points', String(fixedDesignDataset(input.surface).points.length)],
      ['Fixed display directions', String(input.surface.designFixed?.directions.length ?? input.surface.directions.length)],
      ['Fixed stations', String(input.surface.designFixed?.stations.length ?? input.surface.stations.length)],
      ['Direction tolerance', fmt(input.surface.directionError.tolerance * 100, 3) + ' %'],
      ['Worst interpolation error', fmt(Math.max(input.surface.directionError.maxRelativeP, input.surface.directionError.maxRelativeMoment) * 100, 4) + ' %'],
      ['Tolerance reached', input.surface.directionError.withinTolerance ? 'yes' : 'NO'],
      ['Concrete discretization', isBlock ? 'exact polygon clipping' : `${input.surface.mesh.cells} cells / ${input.surface.mesh.points} points`],
      ['Strain domain', input.surface.strainDomain]
    ],
    barSchedule: rebars.map((bar, index) => [
      String(index + 1),
      String(bar.id),
      fmt(bar.dia, 1),
      fmt(bar.x - origin.x, 1),
      fmt(bar.y - origin.y, 1),
      fmt((Math.PI * bar.dia * bar.dia) / 4, 1),
      materialStore.steel.find((item) => item.id === (bar.steelMaterialId ?? materialStore.defaults.steelMaterialId))?.name ?? '—'
    ]),
    curves,
    axialCapKn: axialCapPoint === null ? null : axialCapPoint / KN,
    combinations,
    details: detail
  }
}

// ---------------------------------------------------------------------------
// Per-combination detail, one builder per mechanics
// ---------------------------------------------------------------------------

const blockDetail = (
  prepared: ReturnType<typeof prepareBlockAnalysis>,
  drawingSection: PreparedEquivalentBlockSection,
  origin: XY,
  loadcase: LoadCombination,
  result: InversePreviewResult,
  surface: PreviewSurface,
  curves: readonly InteractionCurve[],
  exactCurve: ExactDirectionCurve | null
): CombinationDetail => {
  const row = combinationRow(loadcase, result)
  const trace = result.equivalentBlock
  const base = {
    row,
    converged: result.converged,
    admissible: result.admissibility.evaluated === false || result.admissibility.ok,
    message: result.message,
    interaction: interactionFor(surface, loadcase, curves, exactCurve)
  }
  if (!trace) {
    return {
      ...base,
      neutralAxisAngleDeg: 0,
      neutralAxisLine: null,
      compressionZone: null,
      depthProfile: null,
      bars: [],
      concrete: [],
      resultants: [],
      evidence: [['Solver', result.message]]
    }
  }
  const state = { neutralAxisAngle: trace.neutralAxisAngle, neutralAxisDepth: trace.neutralAxisDepth }
  const nominal = prepared.model.bindNominalEvaluator(prepared.section)(state).source as NominalBlockEvaluation
  const normalX = Math.cos(trace.neutralAxisAngle)
  const normalY = Math.sin(trace.neutralAxisAngle)
  const extents = projectedOuterExtents(drawingSection, normalX, normalY)
  const originProjection = normalX * origin.x + normalY * origin.y
  const neutralOffsetWorld = extents.maximum - trace.neutralAxisDepth
  const neutralOffsetLocal = neutralOffsetWorld - originProjection
  const blockOffset = extents.maximum - trace.blockDepth

  return {
    ...base,
    // The drawn line is the ε = 0 line, which is at depth c, not at the block boundary.
    neutralAxisAngleDeg: deg(trace.neutralAxisAngle) + 90,
    neutralAxisLine: neutralAxisLine(
      { minX: drawingSection.bounds.minX, maxX: drawingSection.bounds.maxX, minY: drawingSection.bounds.minY, maxY: drawingSection.bounds.maxY },
      origin,
      normalX,
      normalY,
      neutralOffsetLocal
    ),
    compressionZone: {
      kind: 'block',
      polygons: clipCompressionZone(drawingSection, normalX, normalY, blockOffset, origin),
      label: `Equivalent block, a = β1·c = ${fmt(trace.blockDepth, 1)} mm`
    },
    depthProfile: {
      projectedDepth: trace.projectedSectionDepth,
      neutralAxisDepth: trace.neutralAxisDepth,
      blockDepth: trace.blockDepth,
      extremeCompressionStrain: prepared.model.blockLaw.extremeCompressionStrain,
      extremeTensionStrain:
        prepared.model.blockLaw.extremeCompressionStrain *
        (1 - trace.projectedSectionDepth / trace.neutralAxisDepth),
      blockStressMpa: trace.compressionStress,
      stressSamples: []
    },
    bars: nominal.bars.map((bar) => ({
      id: bar.id,
      x: bar.x - origin.x,
      y: bar.y - origin.y,
      dia: 2 * Math.sqrt(bar.area / Math.PI),
      area: bar.area,
      depth: bar.projectedDepth,
      strain: bar.strain,
      stressMpa: bar.steelStress,
      forceKn: bar.force / KN,
      insideBlock: bar.insideBlock
    })),
    concrete: [
      ['Block area Ac,blk', `${fmt(nominal.concrete.area, 1)} mm²`],
      ['Block centroid', `(${fmt(nominal.concrete.centroid.x - origin.x, 1)}, ${fmt(nominal.concrete.centroid.y - origin.y, 1)}) mm`],
      ['Block stress σblock', `${fmt(nominal.concrete.stress, 3)} MPa`],
      ['Concrete force Cc', `${fmt(nominal.concrete.force / KN, 1)} kN`],
      ['Concrete Mcx', `${fmt(nominal.concrete.Mx / KNM, 1)} kN·m`],
      ['Concrete Mcy', `${fmt(nominal.concrete.My / KNM, 1)} kN·m`]
    ],
    resultants: [
      ['Nominal Pn', `${fmt(nominal.resultants.P / KN, 1)} kN`],
      ['Nominal Mnx', `${fmt(nominal.resultants.Mx / KNM, 1)} kN·m`],
      ['Nominal Mny', `${fmt(nominal.resultants.My / KNM, 1)} kN·m`],
      ['φ', row.phi === null ? '—' : fmt(row.phi, 4)],
      ['Design φPn', row.phi === null ? '—' : `${fmt((nominal.resultants.P * row.phi) / KN, 1)} kN`],
      ['Design φMnx', row.phi === null ? '—' : `${fmt((nominal.resultants.Mx * row.phi) / KNM, 1)} kN·m`],
      ['Design φMny', row.phi === null ? '—' : `${fmt((nominal.resultants.My * row.phi) / KNM, 1)} kN·m`]
    ],
    evidence: [
      ['Neutral-axis angle θ', `${fmt(deg(trace.neutralAxisAngle), 4)}°`],
      ['Neutral-axis depth c', `${fmt(trace.neutralAxisDepth, 3)} mm`],
      ['Block depth a', `${fmt(trace.blockDepth, 3)} mm`],
      ['β1', fmt(trace.beta1, 4)],
      ['Projected depth Dθ', `${fmt(trace.projectedSectionDepth, 2)} mm`],
      ['Controlling εt', trace.controllingTensileStrain === undefined ? '—' : fmt(trace.controllingTensileStrain, 6)],
      ['Controlling bar', trace.controllingBarId ?? '—'],
      ['Classification', row.classification],
      ['Axial cap governs', result.resistance?.axialCapApplied ? 'yes' : 'no'],
      ['Component residual', trace.componentForceResidual === undefined ? '—' : sci(trace.componentForceResidual, 2)],
      ['Strain admissibility', result.admissibility.evaluated === false ? 'not evaluated (cap face)' : result.admissibility.ok ? 'admissible' : 'INADMISSIBLE'],
      ['Governing utilization', row.utilization === null ? '—' : fmt(row.utilization, 4)]
    ]
  }
}

const fibreDetail = (
  prepared: ReturnType<typeof prepareAnalysis>,
  drawingSection: PreparedEquivalentBlockSection,
  origin: XY,
  materialStore: MaterialStore,
  loadcase: LoadCombination,
  result: InversePreviewResult,
  surface: PreviewSurface,
  curves: readonly InteractionCurve[],
  exactCurve: ExactDirectionCurve | null
): CombinationDetail => {
  const row = combinationRow(loadcase, result)
  const base = {
    row,
    converged: result.converged,
    admissible: result.admissibility.evaluated === false || result.admissibility.ok,
    message: result.message,
    interaction: interactionFor(surface, loadcase, curves, exactCurve)
  }
  const state: StrainState = result.state
  const curvature = Math.hypot(state.kx, state.ky)
  if (!result.converged || curvature < 1e-14) {
    return {
      ...base,
      neutralAxisAngleDeg: 0,
      neutralAxisLine: null,
      compressionZone: null,
      depthProfile: null,
      bars: [],
      concrete: [],
      resultants: [
        ['Response P', `${fmt(result.response.P / KN, 1)} kN`],
        ['Response Mx', `${fmt(result.response.Mx / KNM, 1)} kN·m`],
        ['Response My', `${fmt(result.response.My / KNM, 1)} kN·m`]
      ],
      evidence: [['Solver', result.message]]
    }
  }

  // eps(x, y) = e0 + kx·y + ky·x, so the strain gradient direction is (ky, kx) and the
  // compression half-plane is the side of the eps = 0 line the gradient points to.
  const normalX = state.ky / curvature
  const normalY = state.kx / curvature
  const extents = projectedOuterExtents(drawingSection, normalX, normalY)
  const originProjection = normalX * origin.x + normalY * origin.y
  const zeroStrainOffsetLocal = -state.e0 / curvature
  const zeroStrainOffsetWorld = originProjection + zeroStrainOffsetLocal
  const compressionDepth = extents.maximum - zeroStrainOffsetWorld

  // The report never re-solves: it re-evaluates the plane the solver converged on, so the ledger it
  // publishes is that state's own decomposition rather than a second calculation of it.
  const ledger = evaluatePreparedState(prepared, state)
  const compiledSteel = new Map(
    materialStore.steel.map((item) => [String(item.id), compileSteelMaterial(item)])
  )
  const strainAt = (x: number, y: number) => state.e0 + state.kx * (y - origin.y) + state.ky * (x - origin.x)
  const bars = drawingSection.rebars.map((bar) => {
    const strain = strainAt(bar.x, bar.y)
    const law = compiledSteel.get(bar.steelLawId) ?? [...compiledSteel.values()][0]
    const stress = law ? law.stress(strain) : 0
    return {
      id: bar.id,
      x: bar.x - origin.x,
      y: bar.y - origin.y,
      dia: 2 * Math.sqrt(bar.area / Math.PI),
      area: bar.area,
      depth: extents.maximum - (normalX * bar.x + normalY * bar.y),
      strain,
      stressMpa: stress,
      forceKn: (stress * bar.area) / KN,
      insideBlock: null
    }
  })

  return {
    ...base,
    neutralAxisAngleDeg: deg(Math.atan2(normalY, normalX)) + 90,
    neutralAxisLine: neutralAxisLine(
      { minX: drawingSection.bounds.minX, maxX: drawingSection.bounds.maxX, minY: drawingSection.bounds.minY, maxY: drawingSection.bounds.maxY },
      origin,
      normalX,
      normalY,
      zeroStrainOffsetLocal
    ),
    compressionZone: {
      kind: 'fibre',
      polygons: clipCompressionZone(drawingSection, normalX, normalY, zeroStrainOffsetWorld, origin),
      label: 'Compression zone, ε > 0 (drawing aid; the kernel integrates the mesh, not this polygon)'
    },
    depthProfile: {
      projectedDepth: extents.depth,
      neutralAxisDepth: compressionDepth,
      blockDepth: null,
      extremeCompressionStrain: strainAtProjection(state, origin, normalX, normalY, extents.maximum),
      extremeTensionStrain: strainAtProjection(state, origin, normalX, normalY, extents.minimum),
      blockStressMpa: null,
      stressSamples: sampleFibreStress(materialStore, state, origin, normalX, normalY, extents)
    },
    bars,
    concrete: [
      ['Concrete force', `${fmt(ledger.concrete.P / KN, 1)} kN`],
      ['Concrete Mx', `${fmt(ledger.concrete.Mx / KNM, 1)} kN·m`],
      ['Concrete My', `${fmt(ledger.concrete.My / KNM, 1)} kN·m`],
      ['Steel force (gross)', `${fmt(ledger.steelGross.P / KN, 1)} kN`],
      ['Displaced concrete', `${fmt(ledger.displacedConcrete.P / KN, 1)} kN`],
      ['Steel net', `${fmt(ledger.steel.P / KN, 1)} kN`]
    ],
    resultants: [
      ['Response P', `${fmt(result.response.P / KN, 1)} kN`],
      ['Response Mx', `${fmt(result.response.Mx / KNM, 1)} kN·m`],
      ['Response My', `${fmt(result.response.My / KNM, 1)} kN·m`],
      ['Residual |ΔP|', `${sci(Math.abs(result.residual.P), 2)} N`],
      ['Residual |ΔMx|', `${sci(Math.abs(result.residual.Mx), 2)} N·mm`],
      ['Residual |ΔMy|', `${sci(Math.abs(result.residual.My), 2)} N·mm`]
    ],
    evidence: [
      ['Strain plane ε0', sci(state.e0, 4)],
      ['Curvature kx', sci(state.kx, 4)],
      ['Curvature ky', sci(state.ky, 4)],
      ['Neutral-axis line', `${fmt(deg(Math.atan2(normalY, normalX)) + 90, 4)}°`],
      ['Compression depth c', `${fmt(compressionDepth, 3)} mm`],
      ['Iterations', String(result.iterations)],
      ['Relative residual', sci(result.residualNorm, 3)],
      ['Max concrete compression', fmt(result.admissibility.maxConcreteCompression, 6)],
      ['Concrete limit', fmt(result.admissibility.concreteLimit, 6)],
      ['Max steel tension', fmt(result.admissibility.maxSteelTension, 6)],
      ['Steel limit', result.admissibility.steelTensionLimit === null ? 'not declared' : fmt(result.admissibility.steelTensionLimit, 6)],
      ['Strain admissibility', result.admissibility.ok ? 'admissible' : 'INADMISSIBLE'],
      ['Governing utilization', row.utilization === null ? '—' : fmt(row.utilization, 4)]
    ]
  }
}

const strainAtProjection = (
  state: StrainState,
  origin: XY,
  normalX: number,
  normalY: number,
  projection: number
) => {
  // Every point at the same projection has the same strain, so one representative point suffices.
  const x = normalX * projection
  const y = normalY * projection
  return state.e0 + state.kx * (y - origin.y) + state.ky * (x - origin.x)
}

/** Concrete stress against depth for the elevation diagram; presentation only. */
const sampleFibreStress = (
  materialStore: MaterialStore,
  state: StrainState,
  origin: XY,
  normalX: number,
  normalY: number,
  extents: { minimum: number; maximum: number }
) => {
  // The same compiler the kernel integrates with, so the drawn curve is that law rather than a
  // second approximation of it.
  const law = compileConcreteMaterial(materialStore.concrete)
  const samples: Array<{ depth: number; stressMpa: number }> = []
  const steps = 40
  for (let index = 0; index <= steps; index += 1) {
    const projection = extents.maximum - ((extents.maximum - extents.minimum) * index) / steps
    const strain = strainAtProjection(state, origin, normalX, normalY, projection)
    samples.push({ depth: extents.maximum - projection, stressMpa: law.stress(strain) })
  }
  return samples
}
