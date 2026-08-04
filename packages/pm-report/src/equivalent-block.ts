/**
 * Excel export of the equivalent rectangular stress-block section calculation.
 *
 * It is the block counterpart of `./index.ts`, laid out so the two workbooks can be opened side by
 * side on the same project: the same Input / Design_Check / Geometry / Steel / PM_Angle /
 * MxMy_FixedP / PM_Theta / Equilibrium spine, the same named inputs where the two mechanics share a
 * quantity, and the same rule about what may be a constant.
 *
 * It is deliberately **not** the fibre workbook with different numbers. The block kernel has no
 * integration mesh, so `Mesh` and `Concrete` are replaced by:
 *
 *   Block       one row per neutral-axis station at the audited direction: c, a = β1·c, the clipped
 *               compression area and its first moments, and the concrete resultants as formulas
 *   Block_Clip  the clipped compression polygon of every station, with area and first moments
 *               recomputed by shoelace formula and reconciled against the values `Block` uses
 *
 * Constants are limited to what a spreadsheet cannot express: exact polygon clipping against the
 * half-plane `u ≥ u_max − a`, and the surface grid the solver produced. Every strain, stress,
 * force, moment, φ, contour interpolation and residual stays a formula.
 *
 * Two angles are kept strictly apart, as in the fibre workbook:
 *   `theta`   block-normal direction that generates the boundary states;
 *   `theta_L` demand moment direction, `ATAN2(Mux, Muy)`, used only to query the finished surface.
 *
 * Sign convention note: this backend computes `My = −Σ F·x` while the fibre backend computes
 * `My = +Σ F·x` (`docs/12` §1). The workbook publishes the block convention it actually used and
 * says so on `Input`, so a reader comparing the two workbooks is not left to guess.
 */
import type { GeometryInputRebarView, SectionGeometry } from '@pm/geometry'
import type { MaterialStore, SteelMaterial } from '@pm/materials'
import {
  designBasisRequiresOverrideReason,
  resolveTensionControlledStrainLimit,
  type DesignBasis,
  type GlobalStrengthReductionBasis
} from '@pm/design'
import {
  calculationProfile,
  type EquivalentBlockAnalysisOptions,
  type EquivalentBlockProfileId,
  type LoadCombination
} from '@pm/project'
import {
  buildEquivalentBlockDesignSurfaceFromPrepared,
  buildEquivalentBlockPreviewSurfaceFromPrepared,
  prepareBlockAnalysis,
  solveEquivalentBlockDemandFromPrepared
} from '@pm/analysis-equivalent-block'
import type { NominalBlockEvaluation } from '@pm/equivalent-block'
import {
  intersectFixedPContourWithMomentRay,
  sliceFixedPContour,
  sliceMomentPlane
} from '@pm/analysis'
import {
  createDefineName,
  createWorkbook,
  ExcelExportError,
  headerRow,
  noteCell,
  orderedCurve,
  sectionHeading,
  steelDesignFy,
  steelLaw,
  title,
  CONST_FILL,
  INPUT_FILL
} from './workbook-common'

export type EquivalentBlockExcelInput = {
  projectName: string
  sectionName: string
  calculationProfileId: EquivalentBlockProfileId
  section: SectionGeometry
  rebars: GeometryInputRebarView[]
  materialStore: MaterialStore
  designBasis: DesignBasis
  analysisOptions: EquivalentBlockAnalysisOptions
  /**
   * Block-normal direction of the audited station ledger, degrees. It is snapped to the nearest
   * direction the solver actually sampled, so the exported rows are engine states rather than a
   * second, unverified schedule.
   */
  thetaDeg: number
  /** Axial level for the Mx-My contour sheet, N. */
  fixedP: number
  loadcase: LoadCombination | null
}

const TAU = 2 * Math.PI
const wrap = (angle: number) => ((angle % TAU) + TAU) % TAU
const deg = (radians: number) => (radians * 180) / Math.PI

const assertBlockBasis = (basis: DesignBasis): GlobalStrengthReductionBasis => {
  if (basis.format !== 'globalResultantFactor') {
    throw new ExcelExportError(
      'The equivalent-block workbook requires a global resultant strength-reduction basis; this project uses design-material reevaluation.'
    )
  }
  return basis
}

/** Smallest signed difference between two directions on the circle. */
const angularDistance = (a: number, b: number) => {
  const raw = wrap(a - b)
  return Math.min(raw, TAU - raw)
}

export const equivalentBlockWorkbookFileName = (
  input: Pick<EquivalentBlockExcelInput, 'projectName' | 'thetaDeg' | 'loadcase'>
) => {
  const safe = (input.projectName || 'project').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  const theta = Math.round(((input.thetaDeg % 360) + 360) % 360)
  const suffix = input.loadcase ? `LC${input.loadcase.id}` : 'fixedP'
  return `${safe || 'project'}-equivalent-block-${suffix}-theta${theta}.xlsx`
}

export const buildEquivalentBlockWorkbook = async (input: EquivalentBlockExcelInput) => {
  const { section, rebars, materialStore } = input
  if (rebars.length === 0) throw new ExcelExportError('The section has no reinforcement to report.')
  const basis = assertBlockBasis(input.designBasis)
  const profile = calculationProfile(input.calculationProfileId)

  const prepared = prepareBlockAnalysis(
    input.calculationProfileId,
    section,
    rebars,
    materialStore,
    basis
  )
  const origin = prepared.section.referencePoint
  const blockLaw = prepared.model.blockLaw
  const steel =
    materialStore.steel.find((item) => item.id === materialStore.defaults.steelMaterialId) ?? materialStore.steel[0]
  if (!steel) throw new ExcelExportError('No steel material is defined.')

  /**
   * Every bar must share one steel law for the workbook's single `fy`/`Es` named pair to be
   * honest. A mixed-grade section is a valid analysis input, so this fails closed instead of
   * exporting one grade's algebra over another grade's bars.
   */
  const usedSteelIds = new Set(
    rebars.map((bar) => String(bar.steelMaterialId ?? materialStore.defaults.steelMaterialId))
  )
  if (usedSteelIds.size > 1) {
    throw new ExcelExportError(
      'The equivalent-block workbook publishes one steel law as named inputs; this section uses more than one steel grade. Export a single-grade section, or compare grades in separate runs.'
    )
  }
  const barSteelId = [...usedSteelIds][0]
  const barSteel = materialStore.steel.find((item) => String(item.id) === barSteelId) ?? steel
  const sLaw = steelLaw(barSteel)
  const fyModel = steelDesignFy(barSteel)
  const epsY = barSteel.limits?.epsY ?? fyModel / barSteel.elasticModulus
  const epsU = barSteel.limits?.epsU

  const designSurfaceCore = buildEquivalentBlockDesignSurfaceFromPrepared(prepared, input.analysisOptions)
  const surface = buildEquivalentBlockPreviewSurfaceFromPrepared(prepared, input.analysisOptions, designSurfaceCore)
  const nominalEvaluator = prepared.model.bindNominalEvaluator(prepared.section)
  const designEvaluator = prepared.model.bindDesignEvaluator(prepared.section)

  // ---- audited direction: snap to a direction the solver actually sampled -----------------
  const sampledDirections = [...new Set(designSurfaceCore.directions.map(wrap))].sort((a, b) => a - b)
  if (sampledDirections.length === 0) throw new ExcelExportError('The block surface carries no sampled direction.')
  const requestedTheta = wrap((input.thetaDeg * Math.PI) / 180)
  const theta = sampledDirections.reduce((best, candidate) =>
    angularDistance(candidate, requestedTheta) < angularDistance(best, requestedTheta) ? candidate : best
  )
  const thetaDeg = deg(theta)

  const auditedDepths = [...new Set(
    designSurfaceCore.points
      .filter((point) => point.kind === 'state' && point.state && angularDistance(wrap(point.state.neutralAxisAngle), theta) <= 1e-9)
      .map((point) => point.state!.neutralAxisDepth)
  )].sort((a, b) => b - a)
  if (auditedDepths.length === 0) {
    throw new ExcelExportError('The audited direction carries no neutral-axis state to report.')
  }

  type AuditedStation = {
    index: number
    c: number
    nominal: NominalBlockEvaluation
    phi: number
    classification: string
  }
  const stations: AuditedStation[] = auditedDepths.map((c, index) => {
    const state = { neutralAxisAngle: theta, neutralAxisDepth: c }
    const nominal = nominalEvaluator(state).source as NominalBlockEvaluation
    const design = designEvaluator(state)
    return {
      index: index + 1,
      c,
      nominal,
      phi: typeof design.metadata?.phi === 'number' ? design.metadata.phi : 1,
      classification: String(design.metadata?.classification ?? 'compression-controlled')
    }
  })

  const compressionEdge = stations[0].nominal.diagnostics.compressionEdgeProjection
  const projectedDepth = stations[0].nominal.diagnostics.projectedSectionDepth

  const bars = rebars.map((bar, index) => ({
    no: index + 1,
    id: String(bar.id),
    dia: bar.dia,
    x: bar.x - origin.x,
    y: bar.y - origin.y,
    absX: bar.x,
    absY: bar.y,
    area: (Math.PI * bar.dia * bar.dia) / 4
  }))

  const demandP = input.loadcase ? input.loadcase.P : input.fixedP
  const thetaLoad = input.loadcase ? Math.atan2(input.loadcase.My, input.loadcase.Mx) : 0
  const engineContour = sliceFixedPContour(surface.points, demandP, surface.triangles)
  const engineBoundary = intersectFixedPContourWithMomentRay(engineContour, thetaLoad)
  const demand = input.loadcase
    ? solveEquivalentBlockDemandFromPrepared(prepared, input.analysisOptions, input.loadcase, designSurfaceCore)
    : null

  const workbook = await createWorkbook()
  const defineName = createDefineName(workbook)

  // ==========================================================================
  // Input
  // ==========================================================================
  const inputSheet = workbook.addWorksheet('Input', { views: [{ showGridLines: false }] })
  inputSheet.columns = [{ width: 4 }, { width: 30 }, { width: 20 }, { width: 10 }, { width: 66 }]
  title(inputSheet, 1, 'EQUIVALENT RECTANGULAR STRESS BLOCK — SECTION CALCULATION', 4)
  inputSheet.getCell('B2').value = 'Project'
  inputSheet.getCell('C2').value = input.projectName
  inputSheet.getCell('B3').value = 'Section'
  inputSheet.getCell('C3').value = input.sectionName
  inputSheet.getCell('B4').value = 'Generated'
  inputSheet.getCell('C4').value = new Date().toISOString().slice(0, 19).replace('T', ' ')
  noteCell(inputSheet, 2, 5,
    'Every shaded cell drives live formulas on the other sheets. Only the clipped-polygon geometry and the sampled surface grid are engine values; the ledger, φ, contour and residual are formulas.')
  inputSheet.mergeCells('E2:E4')

  type NamedInput = {
    row: number
    label: string
    value: number | string
    unit: string
    name?: string
    note?: string
    formula?: string
  }

  let row = 6
  sectionHeading(inputSheet, row, 'Calculation profile', 4)
  row += 1
  const profileInputs: NamedInput[] = [
    { row: row++, label: 'profile', value: profile.label, unit: '', note: `method ${profile.mechanics}` },
    { row: row++, label: 'resistance profile', value: basis.identity.document, unit: '', note: basis.identity.edition },
    { row: row++, label: 'verification status', value: basis.verificationStatus, unit: '', note: 'not an engineering approval; see docs/00-README §4' },
    { row: row++, label: 'modified from defaults', value: basis.modified ? 'yes' : 'no', unit: '', note: basis.overrideReason || (designBasisRequiresOverrideReason(basis) ? 'a reason is required and missing' : '') }
  ]

  row += 1
  sectionHeading(inputSheet, row, 'Concrete — equivalent block', 4)
  row += 1
  const blockStressFactor = blockLaw.compressionStress / materialStore.concrete.fck
  const concreteInputs: NamedInput[] = [
    { row: row++, label: 'standard', value: materialStore.concrete.standard, unit: '', note: materialStore.concrete.name },
    { row: row++, label: 'fck', value: materialStore.concrete.fck, unit: 'MPa', name: 'fck', note: 'characteristic/input strength' },
    { row: row++, label: 'α (σblock/fck)', value: blockStressFactor, unit: '-', name: 'alpha', note: 'resolved by the code adapter; KDS writes it as η·0.85, ACI as 0.85' },
    { row: row++, label: 'σblock = α·fck', value: blockLaw.compressionStress, unit: 'MPa', name: 'sig_blk', formula: 'alpha*fck' },
    { row: row++, label: 'β1', value: blockLaw.depthFactor, unit: '-', name: 'beta_1', note: 'block depth a = β1·c' },
    { row: row++, label: 'εcu', value: blockLaw.extremeCompressionStrain, unit: '-', name: 'ecu', note: 'extreme compression fibre strain' },
    { row: row++, label: 'displaced concrete deducted', value: blockLaw.subtractDisplacedConcrete ? 'yes' : 'no', unit: '', note: 'bars inside the block carry σs − σblock' }
  ]

  row += 1
  sectionHeading(inputSheet, row, 'Reinforcement', 4)
  row += 1
  const appliesSteelGamma = barSteel.factors?.gammaS !== undefined
  const steelInputs: NamedInput[] = [
    { row: row++, label: 'standard', value: barSteel.standard, unit: '', note: barSteel.name },
    { row: row++, label: 'Es', value: barSteel.elasticModulus, unit: 'MPa', name: 'Es' },
    { row: row++, label: 'fy (characteristic)', value: barSteel.fy, unit: 'MPa', name: 'fy_char' },
    { row: row++, label: 'γs', value: barSteel.factors?.gammaS ?? 1, unit: '-', name: 'gamma_s', note: appliesSteelGamma ? 'material partial factor' : 'not applied by this material family' },
    { row: row++, label: 'fy (model)', value: fyModel, unit: 'MPa', name: 'fy', formula: appliesSteelGamma ? 'fy_char/gamma_s' : 'fy_char' },
    { row: row++, label: 'εy = fy/Es', value: epsY, unit: '-', name: 'epsy', formula: 'fy/Es' },
    { row: row++, label: 'εu (declared)', value: epsU ?? 'not declared', unit: '-', name: epsU === undefined ? undefined : 'epsu', note: epsU === undefined ? 'rupture is not enforced' : 'tensile rupture limit enforced by the solver' },
    { row: row++, label: 'law', value: sLaw.description, unit: '', note: '' }
  ]

  row += 1
  sectionHeading(inputSheet, row, 'Strength reduction and axial cap', 4)
  row += 1
  const compressionPhi = basis.transverseReinforcement === 'qualifying-spiral'
    ? basis.factors.phiCompressionSpiral
    : basis.factors.phiCompressionOther
  const capRatio = basis.transverseReinforcement === 'qualifying-spiral'
    ? basis.factors.axialCapSpiral
    : basis.factors.axialCapOther
  const tensionLimit = resolveTensionControlledStrainLimit(basis, epsY, barSteel.fy)
  const resistanceInputs: NamedInput[] = [
    { row: row++, label: 'transverse reinforcement', value: basis.transverseReinforcement, unit: '', note: 'selects the compression-controlled φ and the cap ratio' },
    { row: row++, label: 'φ compression (active)', value: compressionPhi, unit: '-', name: 'phi_c' },
    { row: row++, label: 'φ tension', value: basis.factors.phiTension, unit: '-', name: 'phi_t' },
    { row: row++, label: 'εt,limit', value: tensionLimit, unit: '-', name: 'ept_lim', note: basis.transition.type === 'yield-plus-strain' ? `εy + ${basis.transition.extraStrain}` : `fixed ${basis.transition.fixedStrainLimit} at or below fy = ${basis.transition.yieldStressThreshold} MPa, else ${basis.transition.highStrengthYieldMultiple}·εy` },
    { row: row++, label: 'axial cap ratio', value: capRatio, unit: '-', name: 'cap_r' },
    { row: row++, label: 'axial cap applied', value: basis.axialCapEnabled ? 'yes' : 'no', unit: '', note: 'clips the design surface at cap ratio × the factored compression pole' }
  ]

  row += 1
  sectionHeading(inputSheet, row, 'Analysis', 4)
  row += 1
  const analysisInputs: NamedInput[] = [
    { row: row++, label: 'θ (block-normal direction)', value: thetaDeg, unit: 'deg', name: 'theta', note: `audited direction; snapped from the requested ${input.thetaDeg.toFixed(4)}° to the nearest sampled direction` },
    { row: row++, label: 'u_max (compression edge)', value: compressionEdge, unit: 'mm', name: 'u_max', note: 'max of n·(x,y) over the outer boundary at θ; an engine value because it needs the polygon' },
    { row: row++, label: 'Dθ (projected depth)', value: projectedDepth, unit: 'mm', name: 'd_theta' },
    {
      row: row++,
      label: 'block-boundary tolerance',
      value: 1e-10 * prepared.section.characteristicLength,
      unit: 'mm',
      name: 'blk_tol',
      note: 'the kernel\'s own 1e-10 · characteristic length; a bar within it counts as inside the block'
    },
    { row: row++, label: 'xc', value: origin.x, unit: 'mm', name: 'xc', note: 'analysis origin = net concrete centroid' },
    { row: row++, label: 'yc', value: origin.y, unit: 'mm', name: 'yc', note: 'all X, Y below are measured from it' },
    { row: row++, label: 'stations at θ', value: stations.length, unit: '-', note: 'baseline depth schedule plus solved bar/code events' },
    { row: row++, label: 'sampled directions', value: sampledDirections.length, unit: '-', note: `seed ${input.analysisOptions.directions.seedCount}` },
    { row: row++, label: 'direction interpolation error', value: designSurfaceCore.maxDirectionalInterpolationError, unit: '-', note: designSurfaceCore.directionRefinementConverged ? 'within the requested tolerance' : 'TOLERANCE NOT REACHED' },
    { row: row++, label: 'station interpolation error', value: designSurfaceCore.maxStationInterpolationError, unit: '-', note: designSurfaceCore.stationRefinementConverged ? 'within the requested tolerance' : 'TOLERANCE NOT REACHED' },
    { row: row++, label: 'surface closed', value: designSurfaceCore.topology.closed ? 'yes' : 'no', unit: '', note: `${designSurfaceCore.topology.boundaryEdges} boundary edges` }
  ]

  row += 1
  sectionHeading(inputSheet, row, 'Demand (factored ULS)', 4)
  row += 1
  const demandInputs: NamedInput[] = [
    { row: row++, label: 'Pu', value: demandP / 1e3, unit: 'kN', name: 'Pu', note: input.loadcase?.name ?? 'fixed-P slider value' },
    { row: row++, label: 'Mux', value: input.loadcase ? input.loadcase.Mx / 1e6 : 0, unit: 'kN·m', name: 'Mux' },
    { row: row++, label: 'Muy', value: input.loadcase ? input.loadcase.My / 1e6 : 0, unit: 'kN·m', name: 'Muy' }
  ]

  for (const entry of [...profileInputs, ...concreteInputs, ...steelInputs, ...resistanceInputs, ...analysisInputs, ...demandInputs]) {
    inputSheet.getCell(entry.row, 2).value = entry.label
    const valueCell = inputSheet.getCell(entry.row, 3)
    valueCell.value = entry.formula ? { formula: entry.formula, result: entry.value } : entry.value
    valueCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INPUT_FILL } }
    valueCell.border = { top: { style: 'hair' }, left: { style: 'hair' }, bottom: { style: 'hair' }, right: { style: 'hair' } }
    if (typeof entry.value === 'number') {
      valueCell.numFmt = Math.abs(entry.value) < 0.01 && entry.value !== 0 ? '0.000000' : '#,##0.000'
    } else {
      valueCell.alignment = { horizontal: 'left' }
    }
    inputSheet.getCell(entry.row, 4).value = entry.unit
    if (entry.note) noteCell(inputSheet, entry.row, 5, entry.note)
    if (entry.name) defineName(`Input!$C$${entry.row}`, entry.name)
  }

  const thetaLoadRow = row + 1
  inputSheet.getCell(thetaLoadRow, 2).value = 'θ_L (demand direction)'
  inputSheet.getCell(thetaLoadRow, 3).value = { formula: 'IF(AND(Mux=0,Muy=0),0,DEGREES(ATAN2(Mux,Muy)))' }
  inputSheet.getCell(thetaLoadRow, 3).numFmt = '#,##0.0000'
  inputSheet.getCell(thetaLoadRow, 3).font = { bold: true }
  inputSheet.getCell(thetaLoadRow, 4).value = 'deg'
  noteCell(inputSheet, thetaLoadRow, 5,
    'atan2 of the demand moment vector. Used only to query the finished surface. It is not the block-normal direction θ above.')
  defineName(`Input!$C$${thetaLoadRow}`, 'theta_L')

  const muRow = thetaLoadRow + 1
  inputSheet.getCell(muRow, 2).value = 'Mu resultant'
  inputSheet.getCell(muRow, 3).value = { formula: 'SQRT(Mux^2+Muy^2)' }
  inputSheet.getCell(muRow, 3).numFmt = '#,##0.00'
  inputSheet.getCell(muRow, 4).value = 'kN·m'
  defineName(`Input!$C$${muRow}`, 'Mu')

  const signRow = muRow + 2
  sectionHeading(inputSheet, signRow, 'Sign convention used by this workbook', 4)
  inputSheet.getCell(signRow + 1, 2).value = 'Mx'
  inputSheet.getCell(signRow + 1, 3).value = '+Σ F·(y−yc)'
  inputSheet.getCell(signRow + 2, 2).value = 'My'
  inputSheet.getCell(signRow + 2, 3).value = '−Σ F·(x−xc)'
  noteCell(inputSheet, signRow + 2, 5,
    'The equivalent-block backend negates My; the stress-strain backend does not. docs/12 §1 records this as an open cross-model boundary, so a nonzero-My result must not be compared directly with the fibre workbook.')

  const provRow = signRow + 4
  sectionHeading(inputSheet, provRow, 'What is a formula and what is an engine value', 4)
  const provenance: Array<[string, string, string]> = [
    ['Geometry vertices, bar schedule', 'engine value', 'input data'],
    ['Clipped block polygon (Block_Clip)', 'engine value', 'half-plane clipping of a multiply connected polygon is not a spreadsheet operation'],
    ['Block area and first moments', 'formula', 'shoelace over the clipped polygon, reconciled against the value the ledger uses'],
    ['u_max, Dθ', 'engine value', 'support extremum over the boundary at θ'],
    ['Station depths c', 'engine value', 'solved so a bar sits exactly at a code/rupture strain'],
    ['Strain, stress, force, moment ledger', 'formula', 'the audit trail a reviewer follows term by term'],
    ['φ and design resultants', 'formula', 'the transition rule is algebra over εt, εy and the named φ factors'],
    [`${sampledDirections.length} x station surface grid (MxMy_FixedP)`, 'engine value', 'avoids re-solving every state in the sheet; two sentinels flag a stale import'],
    ['Contour, ray query, plane cut', 'formula', 'this is the logic under audit, so it stays visible'],
    ['Converged capacity-ray state (Equilibrium)', 'engine value', 'bracketed scalar solve on the design-surface boundary; the workbook verifies the state instead of re-deriving it'],
    ['Capacity-state residual', 'formula', 'the workbook proves the stored state balances the scaled demand ray at capacity']
  ]
  provenance.forEach(([what, kind, why], index) => {
    const r = provRow + 1 + index
    inputSheet.getCell(r, 2).value = what
    const kindCell = inputSheet.getCell(r, 3)
    kindCell.value = kind
    kindCell.font = { bold: kind !== 'formula', color: { argb: kind === 'formula' ? 'FF1F3864' : 'FF92400E' } }
    kindCell.alignment = { horizontal: 'left' }
    if (kind !== 'formula') kindCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CONST_FILL } }
    noteCell(inputSheet, r, 5, why)
  })

  // ==========================================================================
  // Materials — published curve for a tabulated steel law
  // ==========================================================================
  if (sLaw.kind === 'tabulated') {
    const samples = orderedCurve((barSteel.stressStrain as Extract<SteelMaterial['stressStrain'], { type: 'user-curve' }>).points)
    const matSheet = workbook.addWorksheet('Materials', { views: [{ state: 'frozen', ySplit: 4 }] })
    matSheet.columns = [{ width: 4 }, { width: 8 }, { width: 16 }, { width: 16 }, { width: 60 }]
    title(matSheet, 1, 'TABULATED STEEL LAW', 4)
    noteCell(matSheet, 2, 2,
      'A law given only as points cannot be written as algebra, so it is published here and every stress cell interpolates it with INDEX/MATCH — the same clamp-and-interpolate rule the engine uses.')
    matSheet.mergeCells('B2:E2')
    headerRow(matSheet, 4, ['#', 'ε', 'σ (MPa)'])
    samples.forEach((sample, index) => {
      const r = 5 + index
      matSheet.getCell(r, 2).value = index + 1
      matSheet.getCell(r, 3).value = sample.strain
      matSheet.getCell(r, 3).numFmt = '0.000000'
      matSheet.getCell(r, 4).value = sample.stress
      matSheet.getCell(r, 4).numFmt = '#,##0.000'
    })
    defineName(`Materials!$C$5:$C$${4 + samples.length}`, 'Stl_eps')
    defineName(`Materials!$D$5:$D$${4 + samples.length}`, 'Stl_sig')
    const countRow = 6 + samples.length
    matSheet.getCell(countRow, 2).value = 'points'
    matSheet.getCell(countRow, 3).value = samples.length
    defineName(`Materials!$C$${countRow}`, 'Stl_n')
  }

  // ==========================================================================
  // Geometry
  // ==========================================================================
  const geomSheet = workbook.addWorksheet('Geometry', { views: [{ state: 'frozen', ySplit: 4 }] })
  geomSheet.columns = [
    { width: 4 }, { width: 8 }, { width: 8 }, { width: 8 },
    { width: 14 }, { width: 14 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 40 }
  ]
  title(geomSheet, 1, 'SECTION GEOMETRY ABOUT THE ANALYSIS ORIGIN', 8)
  noteCell(geomSheet, 2, 2,
    'Ring vertices are input data. Area and first moments are recomputed here by the shoelace formula so the origin used by every other sheet is verifiable.')
  geomSheet.mergeCells('B2:J2')

  headerRow(geomSheet, 4, ['#', 'solid', 'ring', 'X (mm)', 'Y (mm)', 'X·Ynext − Xnext·Y', '(X+Xnext)·cross', '(Y+Ynext)·cross'])
  const rings: Array<{ solid: number; ring: number; sign: 1 | -1; points: Array<{ x: number; y: number }> }> = [
    ...section.solids.map((solid, index) => ({
      solid: index + 1,
      ring: 0,
      sign: 1 as const,
      points: solid.outer.map((point) => ({ x: point.x - origin.x, y: point.y - origin.y }))
    })),
    ...section.solids.flatMap((solid, index) =>
      solid.holes.map((hole, holeIndex) => ({
        solid: index + 1,
        ring: holeIndex + 1,
        sign: -1 as const,
        points: hole.map((point) => ({ x: point.x - origin.x, y: point.y - origin.y }))
      }))
    )
  ]
  let geomRow = 5
  const ringTotals: Array<{ sign: number; areaRow: number }> = []
  for (const ring of rings) {
    const first = geomRow
    ring.points.forEach((point, index) => {
      const next = first + ((index + 1) % ring.points.length)
      const r = first + index
      geomSheet.getCell(r, 2).value = index + 1
      geomSheet.getCell(r, 3).value = ring.solid
      geomSheet.getCell(r, 4).value = ring.ring === 0 ? 'outer' : `hole ${ring.ring}`
      geomSheet.getCell(r, 5).value = point.x
      geomSheet.getCell(r, 6).value = point.y
      geomSheet.getCell(r, 5).numFmt = '#,##0.000'
      geomSheet.getCell(r, 6).numFmt = '#,##0.000'
      geomSheet.getCell(r, 7).value = { formula: `E${r}*F${next}-E${next}*F${r}` }
      geomSheet.getCell(r, 8).value = { formula: `(E${r}+E${next})*G${r}` }
      geomSheet.getCell(r, 9).value = { formula: `(F${r}+F${next})*G${r}` }
      for (const c of [7, 8, 9]) geomSheet.getCell(r, c).numFmt = '#,##0.000'
    })
    const last = first + ring.points.length - 1
    const totalRow = last + 1
    geomSheet.getCell(totalRow, 4).value = 'ring total'
    geomSheet.getCell(totalRow, 4).font = { bold: true }
    geomSheet.getCell(totalRow, 7).value = { formula: `SUM(G${first}:G${last})/2` }
    geomSheet.getCell(totalRow, 8).value = { formula: `SUM(H${first}:H${last})/6` }
    geomSheet.getCell(totalRow, 9).value = { formula: `SUM(I${first}:I${last})/6` }
    for (const c of [7, 8, 9]) {
      geomSheet.getCell(totalRow, c).numFmt = '#,##0.000'
      geomSheet.getCell(totalRow, c).font = { bold: true }
    }
    geomSheet.getCell(totalRow, 10).value = ring.ring === 0 ? 'signed area, Sx, Sy of this ring' : 'subtracted as a hole'
    geomSheet.getCell(totalRow, 10).font = { italic: true, color: { argb: 'FF6B7280' } }
    ringTotals.push({ sign: ring.sign, areaRow: totalRow })
    geomRow = totalRow + 2
  }
  const netRow = geomRow
  geomSheet.getCell(netRow, 4).value = 'NET'
  geomSheet.getCell(netRow, 4).font = { bold: true }
  /**
   * Combine rings without assuming an input winding order.
   *
   * The shoelace area is orientation-signed, and so are its first moments — they flip together. So
   * the area can be normalised with `ABS`, but a first moment must be normalised by the *area's*
   * sign instead: taking its own absolute value would discard the side of the origin the ring sits
   * on, which is the whole content of a first moment for an asymmetric section.
   */
  const netAreaFormula = ringTotals
    .map((total) => `${total.sign < 0 ? '-' : '+'}ABS(G${total.areaRow})`)
    .join('')
    .replace(/^\+/, '')
  const netMomentFormula = (column: string) =>
    ringTotals
      .map((total) => `${total.sign < 0 ? '-' : '+'}SIGN(G${total.areaRow})*${column}${total.areaRow}`)
      .join('')
      .replace(/^\+/, '')
  geomSheet.getCell(netRow, 7).value = { formula: netAreaFormula }
  geomSheet.getCell(netRow, 8).value = { formula: netMomentFormula('H') }
  geomSheet.getCell(netRow, 9).value = { formula: netMomentFormula('I') }
  for (const c of [7, 8, 9]) {
    geomSheet.getCell(netRow, c).numFmt = '#,##0.000'
    geomSheet.getCell(netRow, c).font = { bold: true }
  }
  defineName(`Geometry!$G$${netRow}`, 'Geom_Area')
  geomSheet.getCell(netRow, 10).value = {
    formula: `IF(ABS(H${netRow})+ABS(I${netRow})<=0.000001*ABS(G${netRow})*${Math.max(1, prepared.section.characteristicLength).toFixed(6)},"OK - the origin is the net centroid","CHECK - first moments about the origin are not zero")`
  }
  geomSheet.getCell(netRow, 10).font = { italic: true, color: { argb: 'FF6B7280' } }

  const barHeaderRow = netRow + 3
  sectionHeading(geomSheet, barHeaderRow - 1, 'Reinforcement schedule', 8)
  headerRow(geomSheet, barHeaderRow, ['#', 'id', 'Ø (mm)', 'X (mm)', 'Y (mm)', 'As (mm²)', 'n·(X,Y) (mm)'])
  bars.forEach((bar, index) => {
    const r = barHeaderRow + 1 + index
    geomSheet.getCell(r, 2).value = bar.no
    geomSheet.getCell(r, 3).value = bar.id
    geomSheet.getCell(r, 4).value = bar.dia
    geomSheet.getCell(r, 5).value = bar.x
    geomSheet.getCell(r, 6).value = bar.y
    geomSheet.getCell(r, 7).value = { formula: `PI()*D${r}^2/4` }
    geomSheet.getCell(r, 8).value = { formula: `COS(RADIANS(theta))*(E${r}+xc)+SIN(RADIANS(theta))*(F${r}+yc)` }
    for (const c of [5, 6, 7, 8]) geomSheet.getCell(r, c).numFmt = '#,##0.000'
  })
  const barFirst = barHeaderRow + 1
  const barLast = barHeaderRow + bars.length
  defineName(`Geometry!$B$${barFirst}:$B$${barLast}`, 'Bar_No')
  defineName(`Geometry!$E$${barFirst}:$E$${barLast}`, 'Bar_X')
  defineName(`Geometry!$F$${barFirst}:$F$${barLast}`, 'Bar_Y')
  defineName(`Geometry!$G$${barFirst}:$G$${barLast}`, 'Bar_As')
  defineName(`Geometry!$H$${barFirst}:$H$${barLast}`, 'Bar_U')
  const asTotalRow = barLast + 1
  geomSheet.getCell(asTotalRow, 3).value = 'ΣAs'
  geomSheet.getCell(asTotalRow, 3).font = { bold: true }
  geomSheet.getCell(asTotalRow, 7).value = { formula: `SUM(G${barFirst}:G${barLast})` }
  geomSheet.getCell(asTotalRow, 7).numFmt = '#,##0.0'
  geomSheet.getCell(asTotalRow, 7).font = { bold: true }
  noteCell(geomSheet, asTotalRow, 10,
    'n·(X,Y) is the bar projection on the block normal, computed from the absolute coordinates the kernel uses.')

  // ==========================================================================
  // Block_Clip — the clipped compression polygon of every audited station
  // ==========================================================================
  const clipSheet = workbook.addWorksheet('Block_Clip', { views: [{ state: 'frozen', ySplit: 4 }] })
  clipSheet.columns = [
    { width: 4 }, { width: 10 }, { width: 8 }, { width: 8 }, { width: 14 }, { width: 14 },
    { width: 18 }, { width: 18 }, { width: 18 }
  ]
  title(clipSheet, 1, 'CLIPPED COMPRESSION POLYGON, u ≥ u_max − β1·c', 8)
  noteCell(clipSheet, 2, 2,
    'The clipping itself is an engine value. Its area and first moments are recomputed here by shoelace so the numbers the Block ledger multiplies by σblock are independently verifiable.')
  clipSheet.mergeCells('B2:I2')
  headerRow(clipSheet, 4, ['station', 'ring', 'sign', 'X (mm)', 'Y (mm)', 'cross', '(X+Xn)·cross', '(Y+Yn)·cross'])

  let clipRow = 5
  const clipTotals = new Map<number, { areaRow: number; sxRow: number; syRow: number }>()
  for (const station of stations) {
    const ringRows: Array<{ sign: number; row: number }> = []
    const clipRings: Array<{ sign: 1 | -1; points: Array<{ x: number; y: number }> }> = station.nominal.concrete.geometry
      .flatMap((solid) => [
        { sign: 1 as const, points: solid.outer },
        ...solid.holes.map((hole) => ({ sign: -1 as const, points: hole }))
      ])
    if (clipRings.length === 0) {
      const r = clipRow
      clipSheet.getCell(r, 2).value = station.index
      clipSheet.getCell(r, 3).value = 'empty'
      clipSheet.getCell(r, 7).value = 0
      clipSheet.getCell(r, 8).value = 0
      clipSheet.getCell(r, 9).value = 0
      clipTotals.set(station.index, { areaRow: r, sxRow: r, syRow: r })
      clipRow = r + 1
      continue
    }
    for (const [ringIndex, ring] of clipRings.entries()) {
      const first = clipRow
      ring.points.forEach((point, index) => {
        const next = first + ((index + 1) % ring.points.length)
        const r = first + index
        clipSheet.getCell(r, 2).value = station.index
        clipSheet.getCell(r, 3).value = ringIndex === 0 ? 'outer' : `hole ${ringIndex}`
        clipSheet.getCell(r, 4).value = ring.sign
        clipSheet.getCell(r, 5).value = point.x
        clipSheet.getCell(r, 6).value = point.y
        clipSheet.getCell(r, 5).numFmt = '#,##0.0000'
        clipSheet.getCell(r, 6).numFmt = '#,##0.0000'
        clipSheet.getCell(r, 7).value = { formula: `E${r}*F${next}-E${next}*F${r}` }
        clipSheet.getCell(r, 8).value = { formula: `(E${r}+E${next})*G${r}` }
        clipSheet.getCell(r, 9).value = { formula: `(F${r}+F${next})*G${r}` }
      })
      const last = first + ring.points.length - 1
      const totalRow = last + 1
      clipSheet.getCell(totalRow, 3).value = 'ring Σ'
      clipSheet.getCell(totalRow, 2).value = station.index
      clipSheet.getCell(totalRow, 7).value = { formula: `D${first}*ABS(SUM(G${first}:G${last})/2)` }
      clipSheet.getCell(totalRow, 8).value = { formula: `D${first}*SIGN(SUM(G${first}:G${last}))*SUM(H${first}:H${last})/6` }
      clipSheet.getCell(totalRow, 9).value = { formula: `D${first}*SIGN(SUM(G${first}:G${last}))*SUM(I${first}:I${last})/6` }
      for (const c of [7, 8, 9]) clipSheet.getCell(totalRow, c).font = { bold: true }
      ringRows.push({ sign: ring.sign, row: totalRow })
      clipRow = totalRow + 1
    }
    const stationTotalRow = clipRow
    clipSheet.getCell(stationTotalRow, 2).value = station.index
    clipSheet.getCell(stationTotalRow, 3).value = 'station Σ'
    clipSheet.getCell(stationTotalRow, 3).font = { bold: true }
    const sum = (column: string) => ringRows.map((entry) => `${column}${entry.row}`).join('+')
    clipSheet.getCell(stationTotalRow, 7).value = { formula: sum('G') }
    clipSheet.getCell(stationTotalRow, 8).value = { formula: sum('H') }
    clipSheet.getCell(stationTotalRow, 9).value = { formula: sum('I') }
    for (const c of [7, 8, 9]) {
      clipSheet.getCell(stationTotalRow, c).numFmt = '#,##0.000'
      clipSheet.getCell(stationTotalRow, c).font = { bold: true }
    }
    clipTotals.set(station.index, { areaRow: stationTotalRow, sxRow: stationTotalRow, syRow: stationTotalRow })
    clipRow = stationTotalRow + 2
  }

  // ==========================================================================
  // Block — per-station concrete ledger at the audited direction
  // ==========================================================================
  const blockSheet = workbook.addWorksheet('Block', { views: [{ state: 'frozen', ySplit: 5, xSplit: 2 }] })
  blockSheet.columns = [
    { width: 4 }, { width: 8 }, { width: 14 }, { width: 14 }, { width: 16 }, { width: 16 }, { width: 16 },
    { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 18 }
  ]
  title(blockSheet, 1, 'CONCRETE BLOCK LEDGER AT θ', 11)
  noteCell(blockSheet, 2, 2,
    'One row per neutral-axis state at the audited direction. Cc, Mcx and Mcy are formulas over σblock and the clipped moments recomputed on Block_Clip, so changing fck or α on Input propagates through the whole ledger.')
  blockSheet.mergeCells('B2:M3')
  blockSheet.getRow(2).height = 28
  headerRow(blockSheet, 5, [
    'st', 'c (mm)', 'a = β1·c', 'A_blk (mm²)', 'Sx (mm³)', 'Sy (mm³)',
    'x̄ (mm)', 'ȳ (mm)', 'Cc (kN)', 'Mcx (kN·m)', 'Mcy (kN·m)', 'A engine (mm²)'
  ])
  const blockFirst = 6
  stations.forEach((station, index) => {
    const r = blockFirst + index
    const totals = clipTotals.get(station.index)!
    blockSheet.getCell(r, 2).value = station.index
    blockSheet.getCell(r, 3).value = station.c
    blockSheet.getCell(r, 3).numFmt = '#,##0.0000'
    blockSheet.getCell(r, 4).value = { formula: `beta_1*C${r}` }
    blockSheet.getCell(r, 5).value = { formula: `Block_Clip!G${totals.areaRow}` }
    blockSheet.getCell(r, 6).value = { formula: `Block_Clip!H${totals.sxRow}` }
    blockSheet.getCell(r, 7).value = { formula: `Block_Clip!I${totals.syRow}` }
    blockSheet.getCell(r, 8).value = { formula: `IF(E${r}=0,0,F${r}/E${r})` }
    blockSheet.getCell(r, 9).value = { formula: `IF(E${r}=0,0,G${r}/E${r})` }
    blockSheet.getCell(r, 10).value = { formula: `sig_blk*E${r}/1000` }
    blockSheet.getCell(r, 11).value = { formula: `sig_blk*(G${r}-yc*E${r})/1000000` }
    blockSheet.getCell(r, 12).value = { formula: `-sig_blk*(F${r}-xc*E${r})/1000000` }
    const engineArea = blockSheet.getCell(r, 13)
    engineArea.value = station.nominal.concrete.area
    engineArea.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CONST_FILL } }
    for (const c of [4, 5, 6, 7, 8, 9, 13]) blockSheet.getCell(r, c).numFmt = '#,##0.000'
    for (const c of [10, 11, 12]) blockSheet.getCell(r, c).numFmt = '#,##0.000'
  })
  const blockLast = blockFirst + stations.length - 1
  defineName(`Block!$B$${blockFirst}:$B$${blockLast}`, 'Blk_St')
  defineName(`Block!$C$${blockFirst}:$C$${blockLast}`, 'Blk_c')
  defineName(`Block!$J$${blockFirst}:$J$${blockLast}`, 'Blk_Cc')
  defineName(`Block!$K$${blockFirst}:$K$${blockLast}`, 'Blk_Mcx')
  defineName(`Block!$L$${blockFirst}:$L$${blockLast}`, 'Blk_Mcy')

  const clipCheckRow = blockLast + 2
  blockSheet.getCell(clipCheckRow, 2).value = 'shoelace vs engine'
  blockSheet.getCell(clipCheckRow, 2).font = { bold: true }
  blockSheet.getCell(clipCheckRow, 5).value = {
    formula: `MAX(ABS(E${blockFirst}:E${blockLast}-M${blockFirst}:M${blockLast}))`
  }
  blockSheet.getCell(clipCheckRow, 5).numFmt = '0.000000'
  blockSheet.getCell(clipCheckRow, 6).value = {
    formula: `IF(E${clipCheckRow}<=0.000001*MAX(M${blockFirst}:M${blockLast}),"OK - the clipped polygon reproduces the area used by the kernel","CHECK - clipped area disagrees")`
  }
  noteCell(blockSheet, clipCheckRow, 8,
    'Array comparison; on older Excel builds confirm with Ctrl+Shift+Enter.')

  // ==========================================================================
  // Steel — per bar, per station
  // ==========================================================================
  const steelSheet = workbook.addWorksheet('Steel', { views: [{ state: 'frozen', ySplit: 5, xSplit: 3 }] })
  steelSheet.columns = [
    { width: 4 }, { width: 8 }, { width: 8 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 },
    { width: 12 }, { width: 14 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 14 }, { width: 14 }, { width: 14 }
  ]
  title(steelSheet, 1, 'REINFORCEMENT LEDGER — EVERY BAR AT EVERY STATION', 13)
  noteCell(steelSheet, 2, 2,
    'ε = εcu·(1 − depth/c) with depth measured from the compression edge along the block normal. A bar inside the block carries σs − σblock, because the block already counted the concrete it displaces.')
  steelSheet.mergeCells('B2:P3')
  steelSheet.getRow(2).height = 28
  headerRow(steelSheet, 5, [
    'st', 'bar', 'c (mm)', 'u (mm)', 'depth (mm)', 'ε', 'εt', 'σs (MPa)',
    'in block', 'σdisp', 'σnet', 'F (kN)', 'Mx (kN·m)', 'My (kN·m)'
  ])
  let steelRow = 6
  const steelFirst = steelRow
  const stationRowRanges = new Map<number, { first: number; last: number }>()
  for (const station of stations) {
    const first = steelRow
    bars.forEach((bar) => {
      const r = steelRow
      steelSheet.getCell(r, 2).value = station.index
      steelSheet.getCell(r, 3).value = bar.no
      steelSheet.getCell(r, 4).value = { formula: `INDEX(Blk_c,MATCH(B${r},Blk_St,0))` }
      steelSheet.getCell(r, 5).value = { formula: `INDEX(Bar_U,MATCH(C${r},Bar_No,0))` }
      steelSheet.getCell(r, 6).value = { formula: `u_max-E${r}` }
      steelSheet.getCell(r, 7).value = { formula: `ecu*(1-F${r}/D${r})` }
      steelSheet.getCell(r, 8).value = { formula: `MAX(0,-G${r})` }
      steelSheet.getCell(r, 9).value = { formula: sLaw.scalar(`G${r}`) }
      steelSheet.getCell(r, 10).value = { formula: `IF(E${r}>=u_max-beta_1*D${r}-blk_tol,1,0)` }
      steelSheet.getCell(r, 11).value = { formula: blockLaw.subtractDisplacedConcrete ? `J${r}*sig_blk` : '0' }
      steelSheet.getCell(r, 12).value = { formula: `I${r}-K${r}` }
      steelSheet.getCell(r, 13).value = { formula: `INDEX(Bar_As,MATCH(C${r},Bar_No,0))*L${r}/1000` }
      steelSheet.getCell(r, 14).value = { formula: `M${r}*INDEX(Bar_Y,MATCH(C${r},Bar_No,0))/1000` }
      steelSheet.getCell(r, 15).value = { formula: `-M${r}*INDEX(Bar_X,MATCH(C${r},Bar_No,0))/1000` }
      for (const c of [4, 5, 6, 9, 11, 12, 13, 14, 15]) steelSheet.getCell(r, c).numFmt = '#,##0.0000'
      for (const c of [7, 8]) steelSheet.getCell(r, c).numFmt = '0.0000000'
      steelRow += 1
    })
    stationRowRanges.set(station.index, { first, last: steelRow - 1 })
  }
  const steelLast = steelRow - 1
  defineName(`Steel!$B$${steelFirst}:$B$${steelLast}`, 'Stl_St')
  defineName(`Steel!$H$${steelFirst}:$H$${steelLast}`, 'Stl_Ept')
  defineName(`Steel!$M$${steelFirst}:$M$${steelLast}`, 'Stl_F')
  defineName(`Steel!$N$${steelFirst}:$N$${steelLast}`, 'Stl_Mx')
  defineName(`Steel!$O$${steelFirst}:$O$${steelLast}`, 'Stl_My')

  // ==========================================================================
  // PM_Angle — station totals, phi and design resultants at the audited direction
  // ==========================================================================
  const pmSheet = workbook.addWorksheet('PM_Angle', { views: [{ state: 'frozen', ySplit: 6, xSplit: 2 }] })
  pmSheet.columns = [
    { width: 4 }, { width: 8 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 },
    { width: 14 }, { width: 14 }, { width: 12 }, { width: 12 }, { width: 14 }, { width: 14 }, { width: 14 },
    { width: 14 }, { width: 24 }
  ]
  title(pmSheet, 1, 'NOMINAL AND DESIGN RESULTANTS AT θ', 14)
  noteCell(pmSheet, 2, 2,
    'P = Cc + ΣFs. φ interpolates linearly between φc at εy and φt at εt,limit on the controlling (most tensile) bar — the same rule the adapter applies, written out. The engine columns are the solver\'s own design resultants; the Δ column is the reconciliation.')
  pmSheet.mergeCells('B2:Q4')
  pmSheet.getRow(2).height = 34
  headerRow(pmSheet, 6, [
    'st', 'c (mm)', 'Cc (kN)', 'ΣFs (kN)', 'Pn (kN)', 'Mnx (kN·m)', 'Mny (kN·m)',
    'εt,ctrl', 'φ', 'class', 'φPn (kN)', 'φMnx (kN·m)', 'φMny (kN·m)',
    'engine φPn', 'Δ (kN)'
  ])
  const pmFirst = 7
  stations.forEach((station, index) => {
    const r = pmFirst + index
    const blockRow = blockFirst + index
    const range = stationRowRanges.get(station.index)!
    const designEval = designEvaluator({ neutralAxisAngle: theta, neutralAxisDepth: station.c })
    pmSheet.getCell(r, 2).value = station.index
    pmSheet.getCell(r, 3).value = { formula: `Block!C${blockRow}` }
    pmSheet.getCell(r, 4).value = { formula: `Block!J${blockRow}` }
    pmSheet.getCell(r, 5).value = { formula: `SUM(Steel!M${range.first}:M${range.last})` }
    pmSheet.getCell(r, 6).value = { formula: `D${r}+E${r}` }
    pmSheet.getCell(r, 7).value = { formula: `Block!K${blockRow}+SUM(Steel!N${range.first}:N${range.last})` }
    pmSheet.getCell(r, 8).value = { formula: `Block!L${blockRow}+SUM(Steel!O${range.first}:O${range.last})` }
    pmSheet.getCell(r, 9).value = { formula: `MAX(Steel!H${range.first}:H${range.last})` }
    pmSheet.getCell(r, 10).value = {
      formula: `IF(I${r}<=epsy,phi_c,IF(I${r}>=ept_lim,phi_t,phi_c+(phi_t-phi_c)*(I${r}-epsy)/(ept_lim-epsy)))`
    }
    pmSheet.getCell(r, 11).value = {
      formula: `IF(I${r}<=epsy,"compression",IF(I${r}>=ept_lim,"tension","transition"))`
    }
    pmSheet.getCell(r, 12).value = { formula: `J${r}*F${r}` }
    pmSheet.getCell(r, 13).value = { formula: `J${r}*G${r}` }
    pmSheet.getCell(r, 14).value = { formula: `J${r}*H${r}` }
    const enginePhiP = pmSheet.getCell(r, 15)
    enginePhiP.value = designEval.resultants.P / 1e3
    enginePhiP.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CONST_FILL } }
    pmSheet.getCell(r, 16).value = { formula: `L${r}-O${r}` }
    for (const c of [3, 4, 5, 6, 7, 8, 12, 13, 14, 15]) pmSheet.getCell(r, c).numFmt = '#,##0.000'
    pmSheet.getCell(r, 9).numFmt = '0.0000000'
    pmSheet.getCell(r, 10).numFmt = '0.0000'
    pmSheet.getCell(r, 16).numFmt = '0.000000'
  })
  const pmLast = pmFirst + stations.length - 1
  const pmCheckRow = pmLast + 2
  pmSheet.getCell(pmCheckRow, 2).value = 'worst |Δ|'
  pmSheet.getCell(pmCheckRow, 2).font = { bold: true }
  pmSheet.getCell(pmCheckRow, 16).value = { formula: `MAX(ABS(P${pmFirst}:P${pmLast}))` }
  pmSheet.getCell(pmCheckRow, 16).numFmt = '0.000000'
  pmSheet.getCell(pmCheckRow, 12).value = {
    formula: `IF(P${pmCheckRow}<=0.000001*MAX(ABS(O${pmFirst}:O${pmLast})),"OK - the sheet reproduces the design resultants","CHECK - the sheet and the solver disagree")`
  }

  // ==========================================================================
  // MxMy_FixedP — sampled surface grid, contour at Pu and the demand-ray query
  // ==========================================================================
  const mmSheet = workbook.addWorksheet('MxMy_FixedP', { views: [{ state: 'frozen', ySplit: 7, xSplit: 1 }] })
  mmSheet.columns = [{ width: 4 }, { width: 10 }, { width: 12 }, ...Array.from({ length: 12 }, () => ({ width: 14 }))]
  title(mmSheet, 1, 'DESIGN SURFACE AT P = Pu, AND THE DEMAND-RAY QUERY', 13)
  noteCell(mmSheet, 2, 2,
    'The grid is the solver\'s design surface, sampled direction by direction. Everything after it — the P-interval bracket, the linear interpolation to Pu, and the ray query at θ_L — is a formula, because that logic is what a reviewer needs to see.')
  mmSheet.mergeCells('B2:N4')
  mmSheet.getRow(2).height = 30

  const gridDirections = sampledDirections
  const gridByDirection = gridDirections.map((direction) => {
    const points = designSurfaceCore.points
      .filter((point) => point.kind === 'state' && point.state && angularDistance(wrap(point.state.neutralAxisAngle), direction) <= 1e-9)
      .sort((a, b) => (b.state!.neutralAxisDepth - a.state!.neutralAxisDepth))
    return { direction, points }
  })
  headerRow(mmSheet, 7, ['dir', 'θ (deg)', 'row', 'P (kN)', 'Mx (kN·m)', 'My (kN·m)', 'P next', 'Mx next', 'My next', 'brackets Pu', 't', 'Mx @ Pu', 'My @ Pu'])
  let mmRow = 8
  const contourRows: number[] = []
  gridByDirection.forEach((entry, directionIndex) => {
    const first = mmRow
    entry.points.forEach((point, index) => {
      const r = mmRow
      const isLast = index === entry.points.length - 1
      mmSheet.getCell(r, 2).value = directionIndex + 1
      mmSheet.getCell(r, 3).value = deg(entry.direction)
      mmSheet.getCell(r, 4).value = index + 1
      for (const [offset, value] of [[0, point.resultants.P / 1e3], [1, point.resultants.Mx / 1e6], [2, point.resultants.My / 1e6]] as const) {
        const cell = mmSheet.getCell(r, 5 + offset)
        cell.value = value
        cell.numFmt = '#,##0.000'
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CONST_FILL } }
      }
      if (!isLast) {
        mmSheet.getCell(r, 8).value = { formula: `E${r + 1}` }
        mmSheet.getCell(r, 9).value = { formula: `F${r + 1}` }
        mmSheet.getCell(r, 10).value = { formula: `G${r + 1}` }
        mmSheet.getCell(r, 11).value = { formula: `IF(AND(Pu>=MIN(E${r},H${r}),Pu<=MAX(E${r},H${r}),E${r}<>H${r}),1,0)` }
        mmSheet.getCell(r, 12).value = { formula: `IF(K${r}=1,(Pu-E${r})/(H${r}-E${r}),"")` }
        mmSheet.getCell(r, 13).value = { formula: `IF(K${r}=1,F${r}+L${r}*(I${r}-F${r}),"")` }
        mmSheet.getCell(r, 14).value = { formula: `IF(K${r}=1,G${r}+L${r}*(J${r}-G${r}),"")` }
        for (const c of [8, 9, 10, 13, 14]) mmSheet.getCell(r, c).numFmt = '#,##0.000'
        contourRows.push(r)
      }
      mmRow += 1
    })
    void first
    mmRow += 1
  })
  const gridFirst = 8
  const gridLast = mmRow - 1

  const rayRow = mmRow + 1
  sectionHeading(mmSheet, rayRow, 'Demand-ray query at θ_L', 12)
  const queryRows: Array<[string, string, string]> = [
    ['contour crossings at Pu', `SUMPRODUCT(--(K${gridFirst}:K${gridLast}=1))`, 'number of grid edges the P = Pu plane cuts'],
    ['M(θ) on the contour', `IFERROR(SUMPRODUCT((K${gridFirst}:K${gridLast}=1)*(ABS(MOD(DEGREES(ATAN2(IF(M${gridFirst}:M${gridLast}="",1,M${gridFirst}:M${gridLast}),IF(N${gridFirst}:N${gridLast}="",0,N${gridFirst}:N${gridLast})))-theta_L+180,360)-180)<=6)*SQRT(IF(M${gridFirst}:M${gridLast}="",0,M${gridFirst}:M${gridLast})^2+IF(N${gridFirst}:N${gridLast}="",0,N${gridFirst}:N${gridLast})^2))/MAX(1,SUMPRODUCT((K${gridFirst}:K${gridLast}=1)*(ABS(MOD(DEGREES(ATAN2(IF(M${gridFirst}:M${gridLast}="",1,M${gridFirst}:M${gridLast}),IF(N${gridFirst}:N${gridLast}="",0,N${gridFirst}:N${gridLast})))-theta_L+180,360)-180)<=6))),"")`, 'mean radius of the contour points within 6° of the demand direction'],
    ['Mu demand', 'Mu', 'from Input'],
    ['fixed-P utilization', `IFERROR(Mu/C${rayRow + 2},"")`, 'Mu / M(θ) — a diagnostic, not the governing check']
  ]
  queryRows.forEach(([label, formula, why], index) => {
    const r = rayRow + 1 + index
    mmSheet.getCell(r, 2).value = label
    mmSheet.getCell(r, 3).value = { formula }
    mmSheet.getCell(r, 3).numFmt = '#,##0.0000'
    noteCell(mmSheet, r, 5, why)
  })
  const engineMbRow = rayRow + 6
  mmSheet.getCell(engineMbRow, 2).value = 'engine M(θ) on the triangulated surface'
  const engineMbCell = mmSheet.getCell(engineMbRow, 3)
  engineMbCell.value = engineBoundary ? engineBoundary.M / 1e6 : 'no intersection'
  engineMbCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CONST_FILL } }
  if (engineBoundary) engineMbCell.numFmt = '#,##0.0000'
  noteCell(mmSheet, engineMbRow, 5,
    'The engine cuts a triangulated surface; this sheet can only interpolate the sampled grid it carries. Both readings are reported instead of pretending they are identical.')

  // ==========================================================================
  // PM_Theta — vertical plane cut through the demand direction
  // ==========================================================================
  const ptSheet = workbook.addWorksheet('PM_Theta', { views: [{ state: 'frozen', ySplit: 6 }] })
  ptSheet.columns = [{ width: 4 }, { width: 10 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 46 }]
  title(ptSheet, 1, 'VERTICAL P–Mθ SECTION THROUGH THE DEMAND DIRECTION', 5)
  noteCell(ptSheet, 2, 2,
    'A true plane cut of the design surface at θ_L, produced by the same slicer the Results plot uses. Mθ is the signed projection of (Mx, My) onto the demand direction, so a pole sits at Mθ = 0.')
  ptSheet.mergeCells('B2:G3')
  const planePaths = sliceMomentPlane(surface.points, thetaLoad, surface.triangles)
  headerRow(ptSheet, 6, ['#', 'path', 'P (kN)', 'Mθ (kN·m)', 'Mx (kN·m)', 'My (kN·m)'])
  let ptRow = 7
  planePaths.forEach((path, pathIndex) => {
    path.points.forEach((point, index) => {
      const r = ptRow
      ptSheet.getCell(r, 2).value = index + 1
      ptSheet.getCell(r, 3).value = pathIndex + 1
      for (const [offset, value] of [[0, point.P / 1e3], [1, point.M / 1e6], [2, point.Mx / 1e6], [3, point.My / 1e6]] as const) {
        const cell = ptSheet.getCell(r, 4 + offset)
        cell.value = value
        cell.numFmt = '#,##0.000'
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CONST_FILL } }
      }
      ptRow += 1
    })
    ptRow += 1
  })
  if (planePaths.length === 0) {
    ptSheet.getCell(7, 2).value = 'The demand direction does not cut the design surface.'
  }

  // ==========================================================================
  // Equilibrium — the converged inverse state, verified by formula
  // ==========================================================================
  const eqSheet = workbook.addWorksheet('Equilibrium', { views: [{ showGridLines: false }] })
  eqSheet.columns = [{ width: 4 }, { width: 34 }, { width: 20 }, { width: 12 }, { width: 66 }]
  title(eqSheet, 1, 'CONVERGED EQUIVALENT-BLOCK CAPACITY STATE ON THE DEMAND RAY', 4)
  if (!demand || !demand.equivalentBlock) {
    eqSheet.getCell(3, 2).value = input.loadcase
      ? 'The solver did not converge on an equilibrium state for this demand.'
      : 'No load combination was selected, so there is no inverse state to verify.'
    eqSheet.getCell(3, 2).font = { bold: true }
    if (demand) noteCell(eqSheet, 4, 2, demand.message)
  } else {
    const trace = demand.equivalentBlock
    const state = { neutralAxisAngle: trace.neutralAxisAngle, neutralAxisDepth: trace.neutralAxisDepth }
    const nominal = nominalEvaluator(state).source as NominalBlockEvaluation
    const designEval = designEvaluator(state)
    const phi = typeof designEval.metadata?.phi === 'number' ? designEval.metadata.phi : 1
    let eqRow = 3
    const entries: Array<[string, number | string, string, string?]> = [
      ['θ* (block normal)', deg(trace.neutralAxisAngle), 'deg', 'solved direction; not the demand moment direction'],
      ['c*', trace.neutralAxisDepth, 'mm', 'solved neutral-axis depth'],
      ['a* = β1·c*', trace.blockDepth, 'mm'],
      ['A_blk*', nominal.concrete.area, 'mm²', 'exact clipping at the solved state'],
      ['Cc*', nominal.concrete.force / 1e3, 'kN'],
      ['ΣFs*', (nominal.resultants.P - nominal.concrete.force) / 1e3, 'kN'],
      ['Pn*', nominal.resultants.P / 1e3, 'kN'],
      ['Mnx*', nominal.resultants.Mx / 1e6, 'kN·m'],
      ['Mny*', nominal.resultants.My / 1e6, 'kN·m'],
      ['εt,ctrl', nominal.controllingTensileStrain, '-', `controlling bar ${nominal.controllingBarId ?? 'n/a'}`],
      ['φ*', phi, '-', String(designEval.metadata?.classification ?? '')],
      ['utilization (governing ray)', demand.utilization ?? 'not found', '-', 'factored demand against the design surface'],
      [
        'capacity load factor λ',
        demand.utilization !== null && demand.utilization > 0 ? 1 / demand.utilization : 'not found',
        '-',
        'boundary capacity = λ × factored demand; utilization = 1/λ'
      ],
      ['axial cap governed', demand.resistance?.axialCapApplied ? 'yes' : 'no', '']
    ]
    const rowOf = new Map<string, number>()
    for (const [label, value, unit, note] of entries) {
      eqSheet.getCell(eqRow, 2).value = label
      const cell = eqSheet.getCell(eqRow, 3)
      cell.value = value
      if (typeof value === 'number') {
        cell.numFmt = Math.abs(value) < 0.01 && value !== 0 ? '0.00000000' : '#,##0.0000'
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CONST_FILL } }
      }
      eqSheet.getCell(eqRow, 4).value = unit
      if (note) noteCell(eqSheet, eqRow, 5, note)
      rowOf.set(label, eqRow)
      eqRow += 1
    }
    eqRow += 1
    sectionHeading(eqSheet, eqRow, 'Residual against the scaled demand ray at capacity', 4)
    eqRow += 1
    const phiRow = rowOf.get('φ*')!
    const lambdaRow = rowOf.get('capacity load factor λ')!
    const residuals: Array<[string, string, string]> = [
      ['P capacity residual', `C${phiRow}*C${rowOf.get('Pn*')!}-C${lambdaRow}*Pu`, 'kN'],
      ['Mx capacity residual', `C${phiRow}*C${rowOf.get('Mnx*')!}-C${lambdaRow}*Mux`, 'kN·m'],
      ['My capacity residual', `C${phiRow}*C${rowOf.get('Mny*')!}-C${lambdaRow}*Muy`, 'kN·m']
    ]
    const residualRows: number[] = []
    for (const [label, formula, unit] of residuals) {
      eqSheet.getCell(eqRow, 2).value = label
      eqSheet.getCell(eqRow, 3).value = { formula }
      eqSheet.getCell(eqRow, 3).numFmt = '0.000000'
      eqSheet.getCell(eqRow, 4).value = unit
      residualRows.push(eqRow)
      eqRow += 1
    }
    eqSheet.getCell(eqRow, 2).value = 'relative residual'
    eqSheet.getCell(eqRow, 2).font = { bold: true }
    const designRows = [rowOf.get('Pn*')!, rowOf.get('Mnx*')!, rowOf.get('Mny*')!]
    const demandNames = ['Pu', 'Mux', 'Muy']
    eqSheet.getCell(eqRow, 3).value = {
      formula: `SQRT(${residualRows.map((r, index) => `(C${r}/MAX(1,ABS(C${phiRow}*C${designRows[index]}),ABS(C${lambdaRow}*${demandNames[index]})))^2`).join('+')})`
    }
    eqSheet.getCell(eqRow, 3).numFmt = '0.000E+00'
    eqSheet.getCell(eqRow, 5).value = {
      formula: `IF(C${eqRow}<=0.0001,"capacity state reconciled with the scaled demand ray","CHECK - the stored state does not balance the scaled demand ray")`
    }
    eqSheet.getCell(eqRow, 5).font = { italic: true, color: { argb: 'FF6B7280' } }
    noteCell(eqSheet, eqRow + 2, 2,
      'A general demand does not lie on the design surface. The proportional solver scales it by λ to the boundary; this residual verifies that boundary state. It is not an independent check of the surface.')
  }

  // ==========================================================================
  // Design_Check — governing assessment, written last so it can cite the sheets
  // ==========================================================================
  const checkSheet = workbook.addWorksheet('Design_Check', { views: [{ showGridLines: false }] })
  checkSheet.columns = [{ width: 4 }, { width: 34 }, { width: 22 }, { width: 12 }, { width: 70 }]
  title(checkSheet, 1, 'GOVERNING DESIGN-RESISTANCE CHECK', 4)
  noteCell(checkSheet, 2, 2,
    'The design surface is authoritative for acceptance. Nominal resultants stay available for audit and are never compared directly with factored ULS demand.')
  checkSheet.mergeCells('B2:E3')
  checkSheet.getRow(2).height = 28

  let checkRow = 5
  const checkEntries: Array<[string, number | string, string, string?]> = [
    ['calculation profile', profile.label, ''],
    ['resistance profile', basis.identity.document, '', basis.identity.methodId],
    ['verification status', basis.verificationStatus, '', 'preview status only; not an engineering approval'],
    ['resistance format', 'global resultant factor', '', 'one φ scales the complete P-Mx-My resultant'],
    ['transverse reinforcement', basis.transverseReinforcement, ''],
    ['axial cap', basis.axialCapEnabled ? `${capRatio} × factored compression pole` : 'not applied', ''],
    ['demand basis', input.loadcase?.actionBasis ?? 'none selected', '', 'the governing check accepts factored ULS only']
  ]
  for (const [label, value, unit, note] of checkEntries) {
    checkSheet.getCell(checkRow, 2).value = label
    checkSheet.getCell(checkRow, 3).value = value
    checkSheet.getCell(checkRow, 3).alignment = { horizontal: 'left' }
    checkSheet.getCell(checkRow, 4).value = unit
    if (note) noteCell(checkSheet, checkRow, 5, note)
    checkRow += 1
  }
  checkRow += 1
  sectionHeading(checkSheet, checkRow, 'Factored ULS assessment', 4)
  checkRow += 1
  if (!input.loadcase) {
    checkSheet.getCell(checkRow, 2).value = 'No load combination selected.'
  } else {
    const utilizationRow = checkRow + 3
    const convergenceRow = utilizationRow + 2
    const admissibilityRow = utilizationRow + 3
    const rows: Array<[string, number | string, string, string?]> = [
      ['Pu', input.loadcase.P / 1e3, 'kN'],
      ['Mux', input.loadcase.Mx / 1e6, 'kN·m'],
      ['Muy', input.loadcase.My / 1e6, 'kN·m'],
      ['governing utilization', demand?.utilization ?? 'no intersection', '-', 'proportional 3D ray against the design surface'],
      ['fixed-P utilization', demand?.fixedPUtilization ?? 'n/a', '-', 'secondary diagnostic at constant axial force'],
      ['solver converged', demand?.converged ? 'yes' : 'no', ''],
      [
        'strain admissible',
        demand?.admissibility?.evaluated === false ? 'not evaluated' : demand?.admissibility?.ok ? 'yes' : 'no',
        '',
        demand?.admissibility?.evaluated === false
          ? 'A code-envelope face has no unique material strain state, so admissibility cannot be evaluated there.'
          : demand?.admissibility?.violations
              .map((violation) => `${violation.code}: ${violation.value} exceeds ${violation.limit}`)
              .join('; ') ?? ''
      ],
      ['message', demand?.message ?? '', '']
    ]
    for (const [label, value, unit, note] of rows) {
      checkSheet.getCell(checkRow, 2).value = label
      const cell = checkSheet.getCell(checkRow, 3)
      cell.value = value
      if (typeof value === 'number') cell.numFmt = '#,##0.0000'
      else cell.alignment = { horizontal: 'left', wrapText: true }
      checkSheet.getCell(checkRow, 4).value = unit
      if (note) noteCell(checkSheet, checkRow, 5, note)
      checkRow += 1
    }
    checkSheet.getCell(checkRow + 1, 2).value = 'verdict'
    checkSheet.getCell(checkRow + 1, 2).font = { bold: true }
    checkSheet.getCell(checkRow + 1, 3).value = {
      formula: `IF(C${convergenceRow}<>"yes","NOT CHECKED - solver did not converge",IF(C${admissibilityRow}<>"yes","NOT CHECKED - strain state is not admissible",IF(NOT(ISNUMBER(C${utilizationRow})),"NOT CHECKED - no intersection",IF(C${utilizationRow}<=1,"ADEQUATE - factored demand is inside the design surface","INADEQUATE - factored demand exceeds the design surface"))))`
    }
    checkSheet.getCell(checkRow + 1, 3).font = { bold: true }
    noteCell(checkSheet, checkRow + 3, 2,
      'Preview output. It is not an accepted design result and must not be released as a design report.')
    checkSheet.mergeCells(checkRow + 3, 2, checkRow + 3, 5)
  }

  return workbook
}

export const exportEquivalentBlockWorkbook = async (input: EquivalentBlockExcelInput) => {
  const workbook = await buildEquivalentBlockWorkbook(input)
  const buffer = await workbook.xlsx.writeBuffer()
  return new Blob([buffer as ArrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  })
}
