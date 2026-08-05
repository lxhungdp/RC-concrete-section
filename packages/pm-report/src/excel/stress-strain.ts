/**
 * Excel export of the nominal section calculation, laid out after
 * `docs/examples/reference-case/source/PM-advanced (7) 2D.xlsx`.
 *
 * Contract: constants are limited to input data and values the engine must own — clipped-cell mesh,
 * resolved nonlinear material inverses, configured/refined strain planes, and their integrated
 * resultants. The detailed beta ledger, contour, ray query, plane cut, equilibrium residual, and
 * every algebraically representable material response remain formulas. Engine constants are shaded
 * and identified in the provenance table rather than disguised as live spreadsheet mechanics.
 *
 * Two angles are kept strictly apart (`docs/engineering/02`):
 *   `beta`    strain-gradient sampling direction that generates the boundary states;
 *   `theta_L` demand moment direction, `ATAN2(Mux, Muy)`, used only to query the finished surface.
 * They are not interchangeable, so `beta` is an input and `theta_L` is derived from the demand.
 * In a physical section view, compare the N.A. line with the line perpendicular to the in-section
 * bending direction `(Muy,Mux)`; never compare either line angle directly with `theta_L`.
 *
 * Sheets
 *   Input         materials, reference origin, demand, named ranges
 *   Geometry      rings and bars about the analysis origin, area/centroid by shoelace formula
 *   Mesh          quadrature points from the engine — the only geometric constants
 *   Concrete      per-fibre strain + stress for the configured stations, selected-station ledger
 *   Steel         per-bar strain, stress, displaced concrete and moments for every station
 *   PM_Angle      configured strain-domain row at beta, concrete/steel split
 *   MxMy_FixedP   configured/refined directions at P = Pu, contour and demand-ray query
 *   PM_Theta      vertical P-Mtheta section of the surface through the demand direction
 */
import {
  buildConcreteMesh,
  netConcreteCentroid,
  type GeometryInputRebarView,
  type SectionGeometry
} from '@pm/geometry'
import type { MaterialStore } from '@pm/materials'
import {
  buildResistanceMaterialSets,
  createDefaultDesignBasis,
  designBasisRequiresOverrideReason,
  type DesignBasis
} from '@pm/design'
import {
  cloneAnalysisOptions,
  type AnalysisOptions,
  type LoadCombination
} from '@pm/project'
import {
  buildDesignPreviewSurfaceFromPrepared,
  buildPreviewSurfaceFromPrepared,
  checkLoadcaseUtilizationFromSurface,
  intersectFixedPContourWithMomentRay,
  prepareAnalysisFromMesh,
  sliceFixedPContour,
  stationDefinitionLabel,
  type StationDefinition,
  type StrainState
} from '@pm/analysis'
import {
  col,
  concreteLaw,
  concreteAlphaSource,
  concreteModelParameters,
  createDefineName,
  createWorkbook,
  ExcelExportError,
  sectionHeading,
  steelDesignFy,
  steelLaw,
  title,
  CONST_FILL,
  GROUP_FILL,
  HEADER_FILL,
  INPUT_FILL,
  TITLE_FILL,
  type MaterialLaw
} from './workbook-common'

export { ExcelExportError, invalidDefinedNameReason, type LawSample } from './workbook-common'

export type ExcelExportInput = {
  projectName: string
  sectionName: string
  section: SectionGeometry
  rebars: GeometryInputRebarView[]
  materialStore: MaterialStore
  /** Exact resistance profile snapshot used by the governing ULS check. */
  designBasis?: DesignBasis
  analysisOptions: AnalysisOptions
  /**
   * Strain-gradient sampling direction for the detailed station sheets, degrees. The corresponding
   * neutral-axis line is `alphaNA = (180° - beta) mod 180°`; beta is not the N.A. line angle.
   */
  betaDeg: number
  /** Axial level for the Mx-My contour sheet, N. */
  fixedP: number
  loadcase: LoadCombination | null
  /**
   * Converged strain plane of the inverse solution, if the app has one. Newton and its tangent
   * modulus stay in the program: a general material law has no closed-form derivative, so the
   * workbook verifies the converged state instead of re-deriving it.
   */
  equilibrium?: StrainState | null
  /** Cap on exported quadrature rows; the mesh is coarsened until it fits. */
  maxMeshPoints?: number
}

const DEFAULT_MAX_MESH_POINTS = 1500

/** Coarsen the export mesh until it fits `maxPoints`, keeping the engine's seed rule otherwise. */
const exportMesh = (section: SectionGeometry, maxPoints: number) => {
  let mesh = buildConcreteMesh(section)
  let cellSize = mesh.report.cellSize
  let guard = 0
  while (mesh.points.length > maxPoints && guard++ < 12) {
    cellSize *= Math.max(1.25, Math.sqrt(mesh.points.length / maxPoints))
    mesh = buildConcreteMesh(section, { cellSize })
  }
  return mesh
}

const stationSchedule = (station: StationDefinition) => ({
  cOverC1: station.kind === 'neutral-axis-ratio' ? station.cOverC1 : null,
  fsRatio:
    station.kind === 'steel-stress-ratio'
      ? station.ratio
      : station.kind === 'steel-strain' && Math.abs(station.strain) < 1e-12
        ? 0
        : null,
  /** Tabulated as a positive tensile strain, as in the workbook `Summary` sheet. */
  epsS: station.kind === 'steel-strain' && Math.abs(station.strain) > 1e-12 ? Math.abs(station.strain) : null
})

// ---------------------------------------------------------------------------
// Workbook
// ---------------------------------------------------------------------------

export const buildSectionWorkbook = async (input: ExcelExportInput) => {
  const workbook = await createWorkbook()
  const defineName = createDefineName(workbook)

  const { section, rebars } = input
  const designBasis = input.designBasis ?? createDefaultDesignBasis(input.materialStore)
  const resistanceMaterials = buildResistanceMaterialSets(input.materialStore, designBasis)
  // Detailed fibre ledgers audit the constitutive stage. A global-resultant factor is recorded
  // separately on Design_Check; design-material formats are reevaluated directly.
  const materialStore =
    designBasis.format === 'globalResultantFactor'
      ? resistanceMaterials.referenceMaterials
      : resistanceMaterials.designMaterials
  const concrete = materialStore.concrete
  const steel =
    materialStore.steel.find((item) => item.id === materialStore.defaults.steelMaterialId) ?? materialStore.steel[0]
  if (!steel) throw new ExcelExportError('No steel material is defined.')
  if (rebars.length === 0) throw new ExcelExportError('The section has no reinforcement to report.')

  const cLaw = concreteLaw(concrete)
  const sLaw = steelLaw(steel)
  const params = concreteModelParameters(concrete)
  const fyModel = steelDesignFy(steel)
  const epsY = steel.limits?.epsY ?? fyModel / steel.elasticModulus
  const origin = netConcreteCentroid(section)
  const mesh = exportMesh(section, input.maxMeshPoints ?? DEFAULT_MAX_MESH_POINTS)
  const prepared = prepareAnalysisFromMesh(
    section,
    rebars,
    resistanceMaterials.stateMaterials,
    mesh,
    origin
  )
  const beta = (input.betaDeg * Math.PI) / 180

  // Geometry about the analysis origin — the frame every formula in the workbook uses.
  const outerVertices = section.solids.flatMap((solid, solidIndex) =>
    solid.outer.map((point) => ({ solid: solidIndex + 1, x: point.x - origin.x, y: point.y - origin.y }))
  )
  const holeVertices = section.solids.flatMap((solid, solidIndex) =>
    solid.holes.flatMap((hole, holeIndex) =>
      hole.map((point) => ({ solid: solidIndex + 1, hole: holeIndex + 1, x: point.x - origin.x, y: point.y - origin.y }))
    )
  )
  const bars = rebars.map((bar, index) => ({
    no: index + 1,
    dia: bar.dia,
    x: bar.x - origin.x,
    y: bar.y - origin.y,
    area: (Math.PI * bar.dia * bar.dia) / 4
  }))
  const fibers = mesh.points.map((point, index) => ({
    no: index + 1,
    x: point.x - origin.x,
    y: point.y - origin.y,
    area: point.area
  }))

  // The engine slices a triangulated surface; the workbook can only slice the sampled grid it
  // carries. Both are valid readings of the same samples, so the workbook reports the engine value
  // alongside its own and shows the spread instead of pretending they are identical.
  const demandP = input.loadcase ? input.loadcase.P : input.fixedP
  const thetaLoad = input.loadcase ? Math.atan2(input.loadcase.My, input.loadcase.Mx) : 0
  const engineSurface = buildPreviewSurfaceFromPrepared(prepared, input.analysisOptions, designBasis)
  const designSurface = buildDesignPreviewSurfaceFromPrepared(
    prepared,
    input.materialStore,
    designBasis,
    input.analysisOptions
  )
  const stationLabels = engineSurface.stations.map((station) => station.label)
  const stationDefinitions = engineSurface.stations.map((station) => station.definition)
  const directionBetas = engineSurface.directions
  const directionCount = directionBetas.length
  const betaDegNormalized = ((input.betaDeg % 360) + 360) % 360
  const auditOptions = cloneAnalysisOptions(input.analysisOptions)
  const auditAngles = [0, 90, 180, 270]
    .map((offset) => (betaDegNormalized + offset) % 360)
    .sort((a, b) => a - b)
  auditOptions.directions.seed = { type: 'explicit', anglesDeg: auditAngles }
  auditOptions.directions.refinement = { type: 'fixed', probe: { stationIds: [] } }
  const auditSurface = buildPreviewSurfaceFromPrepared(prepared, auditOptions, designBasis)
  const auditBeta = (betaDegNormalized * Math.PI) / 180
  const engineStations = auditSurface.points
    .filter((point) => Math.abs(point.beta - auditBeta) <= 1e-12)
    .sort((a, b) => a.station - b.station)
    .map((point) => ({ state: point.state, ledger: point.ledger }))

  // Indexed direction x station grid of the engine surface, keyed the same way MxMy_FixedP lays it out.
  const surfaceAt = new Map<string, { P: number; Mx: number; My: number; e0: number; kx: number; ky: number }>()
  for (const point of engineSurface.points) {
    const direction = directionBetas.findIndex((beta) => Math.abs(beta - point.beta) <= 1e-12)
    surfaceAt.set(`${direction}:${point.station}`, {
      P: point.P,
      Mx: point.Mx,
      My: point.My,
      e0: point.state.e0,
      kx: point.state.kx,
      ky: point.state.ky
    })
  }
  // Per-direction support extremes, computed here so the sheet needs no array formula for them.
  const outerXY = outerVertices.map((v) => ({ x: v.x, y: v.y }))
  const directionSupport = (angleIndex: number) => {
    const beta = directionBetas[angleIndex % directionCount]
    const c = Math.cos(beta)
    const sn = Math.sin(beta)
    const uMax = Math.max(...outerXY.map((v) => v.y * c + v.x * sn))
    const uBar = Math.min(...bars.map((b) => b.y * c + b.x * sn))
    return { uMax, uBar, c1: uMax - uBar }
  }
  const engineContour = sliceFixedPContour(engineSurface.points, demandP)
  const engineBoundary = intersectFixedPContourWithMomentRay(engineContour, thetaLoad)
  const engineMb = engineBoundary ? engineBoundary.M / 1e6 : null
  const designCheck = input.loadcase
    ? checkLoadcaseUtilizationFromSurface(designSurface, input.loadcase)
    : null

  const stationCount = stationDefinitions.length

  // ==========================================================================
  // Input
  // ==========================================================================
  const inputSheet = workbook.addWorksheet('Input', { views: [{ showGridLines: false }] })
  inputSheet.columns = [
    { width: 4 },
    { width: 26 },
    { width: 18 },
    { width: 10 },
    { width: 62 }
  ]

  title(inputSheet, 1, 'P–M–M SECTION CALCULATION — DESIGN RESISTANCE', 4)
  inputSheet.getCell('B2').value = 'Project'
  inputSheet.getCell('C2').value = input.projectName
  inputSheet.getCell('B3').value = 'Section'
  inputSheet.getCell('C3').value = input.sectionName
  inputSheet.getCell('B4').value = 'Generated'
  inputSheet.getCell('C4').value = new Date().toISOString().slice(0, 19).replace('T', ' ')
  inputSheet.getCell('E2').value =
    'Every value on a shaded input cell drives live formulas on the other sheets. Only the Mesh, Geometry and bar tables hold engine-computed constants.'
  inputSheet.getCell('E2').alignment = { wrapText: true, vertical: 'top' }
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
  sectionHeading(inputSheet, row, 'Concrete', 4)
  row += 1
  const appliesConcreteGamma = concrete.factors?.gammaC !== undefined
  const concreteGammaC = concrete.factors?.gammaC ?? 1
  const concreteAlpha = concreteAlphaSource(concrete)
  const concreteInputs: NamedInput[] = [
    { row: row++, label: 'standard', value: concrete.standard, unit: '', note: concrete.name },
    { row: row++, label: 'fck', value: concrete.fck, unit: 'MPa', name: 'fck', note: 'characteristic/input strength' },
    { row: row++, label: 'α source', value: concreteAlpha, unit: '-', name: 'alpha_source', note: 'α_cc for EN 1992, α₁/block factor for other families' },
    { row: row++, label: 'γc', value: concreteGammaC, unit: '-', name: 'gamma_c', note: concrete.factors?.gammaC === undefined ? 'not applied by this material family' : 'material partial factor' },
    { row: row++, label: 'α_eff', value: params.alpha, unit: '-', name: 'alpha', note: appliesConcreteGamma ? 'stress multiplier used by formulas: α_source / γc' : 'stress multiplier used by formulas', formula: appliesConcreteGamma ? 'alpha_source/gamma_c' : 'alpha_source' },
    { row: row++, label: 'fcd = α_eff·fck', value: params.alpha * concrete.fck, unit: 'MPa', name: 'fcd', formula: 'alpha*fck' },
    { row: row++, label: 'εco', value: params.eps0, unit: '-', name: 'eco' },
    { row: row++, label: 'εcu', value: params.epsCu, unit: '-', name: 'ecu' },
    { row: row++, label: 'n', value: params.n, unit: '-', name: 'n' },
    { row: row++, label: 'law', value: cLaw.description, unit: '', note: '' }
  ]

  row += 1
  sectionHeading(inputSheet, row, 'Reinforcement', 4)
  row += 1
  const appliesSteelGamma = steel.factors?.gammaS !== undefined
  const steelGammaS = steel.factors?.gammaS ?? 1
  const steelInputs: NamedInput[] = [
    { row: row++, label: 'standard', value: steel.standard, unit: '', note: steel.name },
    { row: row++, label: 'Es', value: steel.elasticModulus, unit: 'MPa', name: 'Es' },
    { row: row++, label: 'fy (characteristic)', value: steel.fy, unit: 'MPa', name: 'fy_char' },
    { row: row++, label: 'γs', value: steelGammaS, unit: '-', name: 'gamma_s', note: steel.factors?.gammaS === undefined ? 'not applied by this material family' : 'material partial factor' },
    { row: row++, label: 'fy (model) / fyd', value: fyModel, unit: 'MPa', name: 'fy', note: 'yield stress used by formulas', formula: appliesSteelGamma ? 'fy_char/gamma_s' : 'fy_char' },
    { row: row++, label: 'εy = fyd/Es', value: epsY, unit: '-', note: 'used by the fₛ/fyd stations', formula: 'fy/Es' },
    { row: row++, label: 'law', value: sLaw.description, unit: '', note: '' }
  ]

  row += 1
  sectionHeading(inputSheet, row, 'Analysis', 4)
  row += 1
  const analysisInputs: NamedInput[] = [
    { row: row++, label: 'β (strain direction)', value: input.betaDeg, unit: 'deg', name: 'beta', note: 'strain-gradient direction of the audited states; not the N.A. line angle; drives Geometry, PM_Angle, Concrete, Steel' },
    { row: row++, label: 'εtu', value: -0.05, unit: '-', name: 'etu', note: 'uniform strain used for station P18' },
    { row: row++, label: 'xc', value: origin.x, unit: 'mm', name: 'xc', note: 'analysis origin = net concrete centroid' },
    { row: row++, label: 'yc', value: origin.y, unit: 'mm', name: 'yc', note: 'all X, Y below are measured from it' },
    { row: row++, label: 'mesh cell size', value: mesh.report.cellSize, unit: 'mm', note: 'clipped-cell grid, docs/02 §5' },
    { row: row++, label: 'mesh points', value: fibers.length, unit: '-', note: '3-point degree-2 rule per clipped triangle' }
  ]

  row += 1
  sectionHeading(inputSheet, row, 'Demand', 4)
  row += 1
  const demandInputs: NamedInput[] = [
    { row: row++, label: 'Pu', value: input.loadcase ? input.loadcase.P / 1e3 : input.fixedP / 1e3, unit: 'kN', name: 'Pu', note: input.loadcase?.name ?? 'fixed-P slider value' },
    { row: row++, label: 'Mux', value: input.loadcase ? input.loadcase.Mx / 1e6 : 0, unit: 'kN·m', name: 'Mux' },
    { row: row++, label: 'Muy', value: input.loadcase ? input.loadcase.My / 1e6 : 0, unit: 'kN·m', name: 'Muy' }
  ]

  for (const entry of [...concreteInputs, ...steelInputs, ...analysisInputs, ...demandInputs]) {
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
    if (entry.note) {
      inputSheet.getCell(entry.row, 5).value = entry.note
      inputSheet.getCell(entry.row, 5).font = { italic: true, color: { argb: 'FF6B7280' } }
    }
    if (entry.name) defineName(`Input!$C$${entry.row}`, entry.name)
  }

  // theta_L is a property of the demand vector, so it is a formula, not an input.
  const thetaRow = row + 1
  inputSheet.getCell(thetaRow, 2).value = 'θ_L (demand direction)'
  inputSheet.getCell(thetaRow, 3).value = {
    formula: 'IF(AND(Mux=0,Muy=0),0,DEGREES(ATAN2(Mux,Muy)))'
  }
  inputSheet.getCell(thetaRow, 3).numFmt = '#,##0.0000'
  inputSheet.getCell(thetaRow, 3).font = { bold: true }
  inputSheet.getCell(thetaRow, 4).value = 'deg'
  inputSheet.getCell(thetaRow, 5).value =
    'atan2 of the demand moment vector. Used only to query the finished surface (MxMy_FixedP, PM_Theta). It is not the strain-plane angle β above.'
  inputSheet.getCell(thetaRow, 5).font = { italic: true, color: { argb: 'FF6B7280' } }
  inputSheet.getCell(thetaRow, 5).alignment = { wrapText: true }
  defineName(`Input!$C$${thetaRow}`, 'theta_L')

  const muRow = thetaRow + 1
  inputSheet.getCell(muRow, 2).value = 'Mu resultant'
  inputSheet.getCell(muRow, 3).value = { formula: 'SQRT(Mux^2+Muy^2)' }
  inputSheet.getCell(muRow, 3).numFmt = '#,##0.00'
  inputSheet.getCell(muRow, 4).value = 'kN·m'
  defineName(`Input!$C$${muRow}`, 'Mu')

  const naAxisRow = muRow + 1
  inputSheet.getCell(naAxisRow, 2).value = 'αNA (N.A. axis in section x-y)'
  inputSheet.getCell(naAxisRow, 3).value = { formula: 'MOD(180-beta,180)' }
  inputSheet.getCell(naAxisRow, 3).numFmt = '#,##0.0000'
  inputSheet.getCell(naAxisRow, 4).value = 'deg'
  inputSheet.getCell(naAxisRow, 5).value =
    'Undirected ε = 0 line angle, CCW from section +x. This is the line angle corresponding to β.'
  inputSheet.getCell(naAxisRow, 5).font = { italic: true, color: { argb: 'FF6B7280' } }
  inputSheet.getCell(naAxisRow, 5).alignment = { wrapText: true }

  const perpendicularAxisRow = naAxisRow + 1
  inputSheet.getCell(perpendicularAxisRow, 2).value = 'α⊥ (axis perpendicular to Rₘ)'
  inputSheet.getCell(perpendicularAxisRow, 3).value = {
    formula: 'IF(AND(Mux=0,Muy=0),0,MOD(DEGREES(ATAN2(-Mux,Muy)),180))'
  }
  inputSheet.getCell(perpendicularAxisRow, 3).numFmt = '#,##0.0000'
  inputSheet.getCell(perpendicularAxisRow, 4).value = 'deg'
  inputSheet.getCell(perpendicularAxisRow, 5).value =
    'Reference line perpendicular to the in-section bending direction Rₘ = (Muy,Mux).'
  inputSheet.getCell(perpendicularAxisRow, 5).font = { italic: true, color: { argb: 'FF6B7280' } }
  inputSheet.getCell(perpendicularAxisRow, 5).alignment = { wrapText: true }

  const deltaRow = perpendicularAxisRow + 1
  inputSheet.getCell(deltaRow, 2).value = 'Δα = angle(N.A., ⊥Rₘ)'
  inputSheet.getCell(deltaRow, 3).value = {
    formula: `MIN(ABS(C${naAxisRow}-C${perpendicularAxisRow}),180-ABS(C${naAxisRow}-C${perpendicularAxisRow}))`
  }
  inputSheet.getCell(deltaRow, 3).numFmt = '#,##0.0000'
  inputSheet.getCell(deltaRow, 4).value = 'deg'
  inputSheet.getCell(deltaRow, 5).value =
    'Smallest angle between two undirected section lines. This is the valid N.A. comparison.'
  inputSheet.getCell(deltaRow, 5).font = { italic: true, color: { argb: 'FF6B7280' } }
  inputSheet.getCell(deltaRow, 5).alignment = { wrapText: true }

  const netAreaRow = deltaRow + 2
  inputSheet.getCell(netAreaRow, 2).value = 'Net concrete area (from mesh)'
  inputSheet.getCell(netAreaRow, 3).value = { formula: 'SUM(Mesh_A)' }
  inputSheet.getCell(netAreaRow, 3).numFmt = '#,##0.0'
  inputSheet.getCell(netAreaRow, 4).value = 'mm²'
  inputSheet.getCell(netAreaRow, 5).value = { formula: 'IF(ABS(C' + netAreaRow + '-Geom_Area)<=0.000001*Geom_Area,"OK - matches the exact polygon area","CHECK - mesh and polygon areas differ")' }
  inputSheet.getCell(netAreaRow, 5).font = { italic: true, color: { argb: 'FF6B7280' } }

  // ---- provenance: say plainly which cells are engine values ----------------
  const provRow = netAreaRow + 2
  sectionHeading(inputSheet, provRow, 'What is a formula and what is an engine value', 4)
  const provenance: Array<[string, string, string]> = [
    ['Mesh No, X, Y, A', 'engine value', 'polygon clipping and quadrature cannot be written as spreadsheet formulas'],
    ['Geometry vertices, bar schedule', 'engine value', 'input data'],
    [
      'Material law',
      cLaw.kind === 'closed-form' && sLaw.kind === 'closed-form' ? 'formula' : 'curve points are engine values',
      cLaw.kind === 'closed-form' && sLaw.kind === 'closed-form'
        ? 'algebra over the named inputs, so fck and fy stay live'
        : 'a law given only as points is published on the Materials sheet and interpolated by formula'
    ],
    [
      'Station strain planes',
      'formula plus resolved material inverses at β; engine values on direction grid',
      'PM_Angle exposes geometric schedule algebra; fₛ/fyd inversion and MxMy_FixedP states come from the compiled material engine'
    ],
    ['Fibre and bar ledger (Concrete, Steel)', 'formula', 'the audit trail a reviewer follows term by term'],
    [
      'Station totals at β (PM_Angle)',
      cLaw.array ? 'formula' : 'engine value for concrete',
      cLaw.array
        ? 'SUMPRODUCT of the law over the mesh'
        : 'a lookup law cannot be applied elementwise inside SUMPRODUCT'
    ],
    [
      `${directionCount} x ${stationCount} surface integrals (MxMy_FixedP)`,
      'engine value',
      `${directionCount * stationCount * 3} resultant values avoid mesh-wide array formulas; two sentinels flag a stale import`
    ],
    ['Contour, ray query, plane cut, interpolation', 'formula', 'this is the logic under audit, so it stays visible'],
    [
      'Converged strain plane (Equilibrium)',
      'engine value',
      'Newton needs d(σ)/d(ε), which a tabulated law does not have in closed form'
    ],
    ['Equilibrium residual', 'formula', 'the workbook proves the stored plane balances the demand']
  ]
  provenance.forEach(([what, kind, why], index) => {
    const r = provRow + 1 + index
    inputSheet.getCell(r, 2).value = what
    const kindCell = inputSheet.getCell(r, 3)
    kindCell.value = kind
    kindCell.font = { bold: kind !== 'formula', color: { argb: kind === 'formula' ? 'FF1F3864' : 'FF92400E' } }
    kindCell.alignment = { horizontal: 'left' }
    if (kind !== 'formula') {
      kindCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CONST_FILL } }
    }
    inputSheet.getCell(r, 5).value = why
    inputSheet.getCell(r, 5).font = { italic: true, color: { argb: 'FF6B7280' } }
  })

  // ==========================================================================
  // Design_Check — governing code profile and factored ULS assessment
  // ==========================================================================
  const designSheet = workbook.addWorksheet('Design_Check', { views: [{ showGridLines: false }] })
  designSheet.columns = [
    { width: 4 },
    { width: 30 },
    { width: 23 },
    { width: 14 },
    { width: 68 }
  ]
  title(designSheet, 1, 'GOVERNING DESIGN-RESISTANCE CHECK', 4)
  designSheet.getCell('B2').value =
    'The design surface is authoritative for acceptance. Nominal/reference results remain available for audit and are never compared directly with factored ULS demand.'
  designSheet.getCell('B2').alignment = { wrapText: true, vertical: 'top' }
  designSheet.mergeCells('B2:E3')
  designSheet.getRow(2).height = 30

  let designRow = 5
  sectionHeading(designSheet, designRow, 'Profile identity', 4)
  const profileRows: Array<[string, string | number, string, string]> = [
    ['Organization', designBasis.identity.organization, '', 'Profile publisher'],
    ['Document', designBasis.identity.document, '', 'Exact code document selected in the project'],
    ['Edition', designBasis.identity.edition, '', designBasis.identity.amendment ?? ''],
    ['Method ID', designBasis.identity.methodId, '', `Profile ${designBasis.identity.profileVersion}`],
    ['Resistance format', designBasis.format, '', 'Determines whether factors act on resultants or material strengths'],
    ['Profile status', designBasis.verificationStatus, '', designBasis.modified ? 'MODIFIED — independent review required' : 'Unmodified profile snapshot'],
    ['Concrete model basis', designBasis.materialModelModified ? 'User-defined / modified' : 'Code-default', '', designBasis.materialModelModified ? 'The selected concrete model replaces the profile default' : 'Resolved by the calculation profile'],
    [
      'Override reason',
      designBasis.overrideReason || 'None',
      '',
      designBasisRequiresOverrideReason(designBasis)
        ? 'Required project audit trail'
        : designBasis.format === 'globalResultantFactor' && !designBasis.axialCapEnabled
          ? 'Not required when only the optional axial limit is disabled'
          : ''
    ]
  ]
  profileRows.forEach(([label, value, unit, note], index) => {
    const r = designRow + 1 + index
    designSheet.getCell(r, 2).value = label
    designSheet.getCell(r, 3).value = value
    designSheet.getCell(r, 4).value = unit
    designSheet.getCell(r, 5).value = note
  })

  designRow += profileRows.length + 2
  sectionHeading(designSheet, designRow, 'Resistance factors', 4)
  const factorRows: Array<[string, number | string, string, string]> =
    designBasis.format === 'globalResultantFactor'
      ? [
          ['φ compression · ties/other', designBasis.factors.phiCompressionOther, '-', 'Global factor on Pn, Mnx and Mny'],
          ['φ compression · spiral', designBasis.factors.phiCompressionSpiral, '-', 'Used only for qualifying spiral classification'],
          ['φ tension-controlled', designBasis.factors.phiTension, '-', 'Global factor on the complete resultant ledger'],
          [
            designBasis.transition.type === 'yield-plus-strain' ? 'Transition strain increment' : 'Transition fixed strain limit',
            designBasis.transition.type === 'yield-plus-strain'
              ? designBasis.transition.extraStrain
              : designBasis.transition.fixedStrainLimit,
            '-',
            designBasis.transition.type === 'yield-plus-strain'
              ? 'Tension-controlled limit = eps_y + increment'
              : `Fixed through fy = ${designBasis.transition.yieldStressThreshold} MPa; above: ${designBasis.transition.highStrengthYieldMultiple} eps_y`
          ],
          ['Maximum axial ratio · ties/other', designBasis.factors.axialCapOther, '-', 'Applied after φ'],
          ['Maximum axial ratio · spiral', designBasis.factors.axialCapSpiral, '-', 'Applied after φ'],
          ['Transverse reinforcement', designBasis.transverseReinforcement, '', 'Project classification'],
          ['Axial cap', designBasis.axialCapEnabled ? 'Enabled' : 'Disabled', '', 'Project setting']
        ]
      : [
          ['αcc', designBasis.factors.alphaCc, '-', 'Concrete design-strength coefficient'],
          ['γc', designBasis.factors.gammaC, '-', 'Concrete material partial factor'],
          ['γs', designBasis.factors.gammaS, '-', 'Reinforcement material partial factor']
        ]
  factorRows.forEach(([label, value, unit, note], index) => {
    const r = designRow + 1 + index
    designSheet.getCell(r, 2).value = label
    const valueCell = designSheet.getCell(r, 3)
    valueCell.value = value
    valueCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CONST_FILL } }
    if (typeof value === 'number') valueCell.numFmt = '0.000000'
    designSheet.getCell(r, 4).value = unit
    designSheet.getCell(r, 5).value = note
  })

  designRow += factorRows.length + 2
  sectionHeading(designSheet, designRow, 'Factored ULS demand versus design surface', 4)
  const checkRows: Array<[string, number | string, string, string]> = [
    ['Action basis', input.loadcase?.actionBasis ?? 'factoredULS', '', 'Only factored ULS actions are supported by this check'],
    ['Loadcase', input.loadcase?.name ?? 'None', '', ''],
    ['3D proportional UR', designCheck?.proportionalUtilization ?? 'n/a', '-', 'Governing reported section utilization'],
    ['Fixed-P UR', designCheck?.fixedPUtilization ?? 'n/a', '-', 'Secondary diagnostic at Pu'],
    ['Verdict', designCheck?.adequate == null ? 'n/a' : designCheck.adequate ? 'ADEQUATE' : 'NOT ADEQUATE', '', 'ADEQUATE requires 3D UR ≤ 1.0'],
    ['Capacity P', designCheck?.capacityPoint ? designCheck.capacityPoint.P / 1e3 : 'n/a', 'kN', 'Demand-ray intersection'],
    ['Capacity Mx', designCheck?.capacityPoint ? designCheck.capacityPoint.Mx / 1e6 : 'n/a', 'kN·m', 'Demand-ray intersection'],
    ['Capacity My', designCheck?.capacityPoint ? designCheck.capacityPoint.My / 1e6 : 'n/a', 'kN·m', 'Demand-ray intersection'],
    ['Controlling factor', designCheck?.resistance?.factor ?? 'material reevaluation', '-', designCheck?.resistance?.classification ?? ''],
    ['εt,control', designCheck?.resistance?.controllingTensileStrain ?? 'n/a', '-', 'Recorded when a global factor is state-dependent']
  ]
  checkRows.forEach(([label, value, unit, note], index) => {
    const r = designRow + 1 + index
    designSheet.getCell(r, 2).value = label
    const valueCell = designSheet.getCell(r, 3)
    valueCell.value = value
    valueCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CONST_FILL } }
    if (typeof value === 'number') valueCell.numFmt = '0.000000'
    designSheet.getCell(r, 4).value = unit
    designSheet.getCell(r, 5).value = note
  })
  designSheet.getCell(designRow + 1, 5).value =
    'Pipeline: factored ULS demand → 3D demand ray → design-resistance surface → UR = 1/λ.'

  // ==========================================================================
  // Materials — sampled curves for laws that have no spreadsheet form
  // ==========================================================================
  const tabulated: Array<{ prefix: string; title: string; law: MaterialLaw }> = []
  if (cLaw.kind === 'tabulated') tabulated.push({ prefix: 'Cnc', title: `Concrete — ${concrete.name}`, law: cLaw })
  if (sLaw.kind === 'tabulated') tabulated.push({ prefix: 'Stl', title: `Reinforcement — ${steel.name}`, law: sLaw })

  if (tabulated.length > 0) {
    const matSheet = workbook.addWorksheet('Materials', { views: [{ state: 'frozen', ySplit: 6 }] })
    matSheet.columns = [{ width: 4 }, { width: 8 }, { width: 16 }, { width: 16 }, { width: 6 }, { width: 8 }, { width: 16 }, { width: 16 }]
    title(matSheet, 1, 'SAMPLED STRESS-STRAIN CURVES — ENGINE VALUES', 7)
    matSheet.getCell('B2').value =
      'These laws have no closed spreadsheet form. The curve points below are the definition itself, sorted ascending; every use of them elsewhere is a MATCH/INDEX interpolation formula that reproduces the engine exactly, including the clamp to the end stresses.'
    matSheet.getCell('B2').alignment = { wrapText: true, vertical: 'top' }
    matSheet.mergeCells('B2:H3')
    matSheet.getRow(2).height = 30

    tabulated.forEach((entry, blockIndex) => {
      const baseCol = 2 + blockIndex * 5
      const samples = entry.law.samples ?? []
      const headRow = 5
      const firstRow = 6
      const blockTitle = matSheet.getCell(4, baseCol)
      blockTitle.value = entry.title
      blockTitle.font = { bold: true, size: 11, color: { argb: 'FF1F3864' } }
      blockTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GROUP_FILL } }
      matSheet.mergeCells(4, baseCol, 4, baseCol + 2)
      ;['i', 'ε', 'σ (MPa)'].forEach((text, index) => {
        const cell = matSheet.getCell(headRow, baseCol + index)
        cell.value = text
        cell.font = { bold: true, size: 10 }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
        cell.alignment = { horizontal: 'center' }
        cell.border = { bottom: { style: 'thin' } }
      })
      samples.forEach((sample, index) => {
        const r = firstRow + index
        matSheet.getCell(r, baseCol).value = index + 1
        matSheet.getCell(r, baseCol + 1).value = sample.strain
        matSheet.getCell(r, baseCol + 2).value = sample.stress
        matSheet.getCell(r, baseCol + 1).numFmt = '0.00000000'
        matSheet.getCell(r, baseCol + 2).numFmt = '#,##0.0000'
      })
      const lastRow = firstRow + samples.length - 1
      defineName(`Materials!$${col(baseCol + 1)}$${firstRow}:$${col(baseCol + 1)}$${lastRow}`, `${entry.prefix}_eps`)
      defineName(`Materials!$${col(baseCol + 2)}$${firstRow}:$${col(baseCol + 2)}$${lastRow}`, `${entry.prefix}_sig`)
      const countRow = lastRow + 2
      matSheet.getCell(countRow, baseCol).value = 'point count'
      matSheet.getCell(countRow, baseCol + 2).value = samples.length
      matSheet.getCell(countRow, baseCol + 2).numFmt = '0'
      matSheet.getCell(countRow, baseCol + 2).font = { bold: true }
      defineName(`Materials!$${col(baseCol + 2)}$${countRow}`, `${entry.prefix}_n`)
      matSheet.getCell(countRow + 1, baseCol).value = 'law'
      matSheet.getCell(countRow + 1, baseCol + 1).value = entry.law.description
      matSheet.getCell(countRow + 1, baseCol + 1).font = { italic: true, color: { argb: 'FF6B7280' } }
    })
  }

  // ==========================================================================
  // Geometry
  // ==========================================================================
  const geomSheet = workbook.addWorksheet('Geometry', { views: [{ showGridLines: false }] })
  geomSheet.columns = [{ width: 4 }, { width: 10 }, { width: 8 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 16 }, { width: 16 }, { width: 46 }]

  title(geomSheet, 1, 'GEOMETRY ABOUT THE ANALYSIS ORIGIN', 7)
  geomSheet.getCell('B2').value = 'Coordinates are engine constants, already translated by (xc, yc). Everything else on this sheet is a formula.'
  geomSheet.getCell('B2').font = { italic: true, color: { argb: 'FF6B7280' } }

  const writeVertexTable = (
    startRow: number,
    heading: string,
    rows: Array<{ label: string; x: number; y: number }>
  ) => {
    sectionHeading(geomSheet, startRow, heading, 7)
    const head = startRow + 1
    const headers = ['No.', 'Ring', 'X (mm)', 'Y (mm)', 'D_i', 'u = Y·cosθ + X·sinθ']
    headers.forEach((text, index) => {
      const cell = geomSheet.getCell(head, 2 + index)
      cell.value = text
      cell.font = { bold: true, size: 10 }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
      cell.alignment = { horizontal: 'center', wrapText: true }
      cell.border = { bottom: { style: 'thin' } }
    })
    rows.forEach((entry, index) => {
      const r = head + 1 + index
      const next = head + 1 + ((index + 1) % rows.length)
      geomSheet.getCell(r, 2).value = index + 1
      geomSheet.getCell(r, 3).value = entry.label
      geomSheet.getCell(r, 4).value = entry.x
      geomSheet.getCell(r, 5).value = entry.y
      geomSheet.getCell(r, 4).numFmt = '#,##0.000'
      geomSheet.getCell(r, 5).numFmt = '#,##0.000'
      for (const c of [4, 5]) {
        geomSheet.getCell(r, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CONST_FILL } }
      }
      // Shoelace term, wrapping to the first vertex of the same ring is handled by grouping below.
      geomSheet.getCell(r, 6).value = { formula: `D${r}*E${next}-D${next}*E${r}` }
      geomSheet.getCell(r, 6).numFmt = '#,##0'
      geomSheet.getCell(r, 7).value = { formula: `E${r}*COS(RADIANS(beta))+D${r}*SIN(RADIANS(beta))` }
      geomSheet.getCell(r, 7).numFmt = '#,##0.000'
    })
    return { firstDataRow: head + 1, lastDataRow: head + rows.length }
  }

  // Rings are written per ring so the shoelace wrap stays inside its own ring.
  let geomRow = 4
  const ringBlocks: Array<{ first: number; last: number; sign: 1 | -1; label: string }> = []
  const ringSources: Array<{ label: string; sign: 1 | -1; points: Array<{ x: number; y: number }> }> = []
  section.solids.forEach((solid, solidIndex) => {
    ringSources.push({
      label: `Solid ${solidIndex + 1} outer`,
      sign: 1,
      points: solid.outer.map((p) => ({ x: p.x - origin.x, y: p.y - origin.y }))
    })
    solid.holes.forEach((hole, holeIndex) => {
      ringSources.push({
        label: `Solid ${solidIndex + 1} hole ${holeIndex + 1}`,
        sign: -1,
        points: hole.map((p) => ({ x: p.x - origin.x, y: p.y - origin.y }))
      })
    })
  })

  for (const ring of ringSources) {
    const block = writeVertexTable(
      geomRow,
      ring.label,
      ring.points.map((p) => ({ label: ring.label, x: p.x, y: p.y }))
    )
    ringBlocks.push({ first: block.firstDataRow, last: block.lastDataRow, sign: ring.sign, label: ring.label })
    const areaRow = block.lastDataRow + 1
    geomSheet.getCell(areaRow, 3).value = 'Area = ½·Σ D_i'
    geomSheet.getCell(areaRow, 6).value = { formula: `SUM(F${block.firstDataRow}:F${block.lastDataRow})/2` }
    geomSheet.getCell(areaRow, 6).numFmt = '#,##0.0'
    geomSheet.getCell(areaRow, 6).font = { bold: true }
    geomRow = areaRow + 2
  }

  const outerRingBlocks = ringBlocks.filter((block) => block.sign === 1)
  const areaFormula = ringBlocks
    .map((block) => `${block.sign === 1 ? '' : '-'}ABS(SUM(F${block.first}:F${block.last})/2)`)
    .join('+')

  sectionHeading(geomSheet, geomRow, 'Reinforcement', 7)
  const barHead = geomRow + 1
  ;['No.', 'Dia (mm)', 'X (mm)', 'Y (mm)', 'As (mm²)', 'u = Y·cosθ + X·sinθ'].forEach((text, index) => {
    const cell = geomSheet.getCell(barHead, 2 + index)
    cell.value = text
    cell.font = { bold: true, size: 10 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
    cell.alignment = { horizontal: 'center', wrapText: true }
    cell.border = { bottom: { style: 'thin' } }
  })
  bars.forEach((bar, index) => {
    const r = barHead + 1 + index
    geomSheet.getCell(r, 2).value = bar.no
    geomSheet.getCell(r, 3).value = bar.dia
    geomSheet.getCell(r, 4).value = bar.x
    geomSheet.getCell(r, 5).value = bar.y
    for (const c of [3, 4, 5]) {
      geomSheet.getCell(r, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CONST_FILL } }
      geomSheet.getCell(r, c).numFmt = '#,##0.000'
    }
    geomSheet.getCell(r, 6).value = { formula: `PI()*C${r}^2/4` }
    geomSheet.getCell(r, 6).numFmt = '#,##0.000'
    geomSheet.getCell(r, 7).value = { formula: `E${r}*COS(RADIANS(beta))+D${r}*SIN(RADIANS(beta))` }
    geomSheet.getCell(r, 7).numFmt = '#,##0.000'
  })
  const barFirst = barHead + 1
  const barLast = barHead + bars.length

  const propRow = barLast + 2
  sectionHeading(geomSheet, propRow, 'Derived properties (all formulas)', 7)
  // Column G of each ring block already holds the per-vertex projection u = Y*cos+X*sin, so the
  // extremes are a plain MAX/MIN over those cells. MAX(range) takes a range natively in Excel;
  // SUMPRODUCT(MAX(array)) does not force array evaluation and fails with #VALUE! in real Excel.
  const outerProjRanges = outerRingBlocks.map((block) => `G${block.first}:G${block.last}`)
  const uMaxFormula = `MAX(${outerProjRanges.join(',')})`
  const uMinFormula = `MIN(${outerProjRanges.join(',')})`

  const props: Array<{ label: string; formula: string; unit: string; name?: string; fmt: string; note?: string }> = [
    { label: 'Net area A', formula: areaFormula, unit: 'mm²', name: 'Geom_Area', fmt: '#,##0.0', note: 'shoelace over every ring' },
    { label: 'u_max', formula: uMaxFormula, unit: 'mm', name: 'u_max', fmt: '#,##0.000', note: 'extreme compression fibre, outer rings only' },
    { label: 'u_min', formula: uMinFormula, unit: 'mm', name: 'u_min', fmt: '#,##0.000' },
    { label: 'u_s,tension', formula: `MIN(G${barFirst}:G${barLast})`, unit: 'mm', name: 'u_bar', fmt: '#,##0.000', note: 'farthest tension bar' },
    { label: 'C1 = u_max − u_s,tension', formula: 'u_max-u_bar', unit: 'mm', name: 'u_C1', fmt: '#,##0.000' },
    { label: 'Depth h = u_max − u_min', formula: 'u_max-u_min', unit: 'mm', fmt: '#,##0.000' },
    { label: 'Total As', formula: `SUM(F${barFirst}:F${barLast})`, unit: 'mm²', name: 'As_tot', fmt: '#,##0.0' }
  ]
  props.forEach((prop, index) => {
    const r = propRow + 1 + index
    geomSheet.getCell(r, 2).value = prop.label
    geomSheet.getCell(r, 4).value = { formula: prop.formula }
    geomSheet.getCell(r, 4).numFmt = prop.fmt
    geomSheet.getCell(r, 4).font = { bold: true }
    geomSheet.getCell(r, 5).value = prop.unit
    if (prop.note) {
      geomSheet.getCell(r, 7).value = prop.note
      geomSheet.getCell(r, 7).font = { italic: true, color: { argb: 'FF6B7280' } }
    }
    if (prop.name) defineName(`Geometry!$D$${r}`, prop.name)
  })

  // ==========================================================================
  // Mesh
  // ==========================================================================
  const meshSheet = workbook.addWorksheet('Mesh', { views: [{ state: 'frozen', ySplit: 4 }] })
  meshSheet.columns = [{ width: 10 }, { width: 14 }, { width: 14 }, { width: 14 }]
  meshSheet.getCell('A1').value = 'CONCRETE INTEGRATION MESH — ENGINE CONSTANTS'
  meshSheet.getCell('A1').font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } }
  meshSheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TITLE_FILL } }
  meshSheet.mergeCells('A1:D1')
  meshSheet.getCell('A2').value =
    'Quadrature points of the clipped-cell mesh (docs/02 §5). X, Y are measured from the analysis origin; A is the tributary area. These four columns are the only geometric constants the workbook needs.'
  meshSheet.getCell('A2').alignment = { wrapText: true, vertical: 'top' }
  meshSheet.mergeCells('A2:D2')
  meshSheet.getRow(2).height = 30
  ;['No.', 'X (mm)', 'Y (mm)', 'A (mm²)'].forEach((text, index) => {
    const cell = meshSheet.getCell(4, index + 1)
    cell.value = text
    cell.font = { bold: true, size: 10 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
    cell.alignment = { horizontal: 'center' }
    cell.border = { bottom: { style: 'thin' } }
  })
  const meshFirst = 5
  fibers.forEach((fiber, index) => {
    const r = meshFirst + index
    meshSheet.getCell(r, 1).value = fiber.no
    meshSheet.getCell(r, 2).value = fiber.x
    meshSheet.getCell(r, 3).value = fiber.y
    meshSheet.getCell(r, 4).value = fiber.area
    meshSheet.getCell(r, 2).numFmt = '#,##0.0000'
    meshSheet.getCell(r, 3).numFmt = '#,##0.0000'
    meshSheet.getCell(r, 4).numFmt = '#,##0.0000'
  })
  const meshLast = meshFirst + fibers.length - 1
  defineName(`Mesh!$B$${meshFirst}:$B$${meshLast}`, 'Mesh_X')
  defineName(`Mesh!$C$${meshFirst}:$C$${meshLast}`, 'Mesh_Y')
  defineName(`Mesh!$D$${meshFirst}:$D$${meshLast}`, 'Mesh_A')

  // ==========================================================================
  // PM_Angle — station parameters and the configured envelope
  // ==========================================================================
  const pmSheet = workbook.addWorksheet('PM_Angle', { views: [{ state: 'frozen', ySplit: 7, xSplit: 2 }] })
  title(pmSheet, 1, `P–M ENVELOPE AT β (STRAIN DIRECTION) — ${stationCount} STATIONS, NOMINAL`, 20)
  pmSheet.getCell('B2').value =
    `Strain-plane sampling angle β = ${input.betaDeg.toFixed(2)} deg. This is a resistance sampling row, ` +
    'not the demand-direction diagram — see PM_Theta for that. Shaded cells are the station schedule.'
  pmSheet.getCell('B2').font = { italic: true, color: { argb: 'FF6B7280' } }

  const PM_HEAD = 5
  const PM_FIRST = 7
  const pmGroups: Array<{ label: string; span: number }> = [
    { label: 'Station definition', span: 4 },
    { label: 'Strain plane (formula)', span: 7 },
    { label: 'Concrete', span: 3 },
    { label: 'Steel', span: 3 },
    { label: 'Total (nominal)', span: 4 },
    { label: 'Engine check', span: 2 }
  ]
  const pmHeaders = [
    'Point', 'C/C1', 'fₛ/fyd', 'εs',
    'u_ctrl (mm)', 'ε_ctrl', 'c (mm)', 'κ (1/mm)', 'ε₀', 'κx (1/mm)', 'κy (1/mm)',
    'P (kN)', 'Mx (kN·m)', 'My (kN·m)',
    'P (kN)', 'Mx (kN·m)', 'My (kN·m)',
    'P (kN)', 'Mx (kN·m)', 'My (kN·m)', '|M| (kN·m)',
    'P engine (kN)', 'Δ P (%)'
  ]
  let groupCol = 2
  for (const group of pmGroups) {
    const cell = pmSheet.getCell(PM_HEAD - 1, groupCol)
    cell.value = group.label
    cell.font = { bold: true, size: 10, color: { argb: 'FF1F3864' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GROUP_FILL } }
    cell.alignment = { horizontal: 'center' }
    pmSheet.mergeCells(PM_HEAD - 1, groupCol, PM_HEAD - 1, groupCol + group.span - 1)
    groupCol += group.span
  }
  pmHeaders.forEach((text, index) => {
    const cell = pmSheet.getCell(PM_HEAD, 2 + index)
    cell.value = text
    cell.font = { bold: true, size: 10 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
    cell.alignment = { horizontal: 'center', wrapText: true }
    cell.border = { bottom: { style: 'thin' } }
  })
  pmSheet.getRow(PM_HEAD).height = 30
  pmSheet.getColumn(2).width = 8

  // Column map on PM_Angle
  const PM = {
    point: 2, cRatio: 3, fsRatio: 4, epsS: 5,
    uCtrl: 6, epsCtrl: 7, c: 8, kappa: 9, e0: 10, kx: 11, ky: 12,
    concP: 13, concMx: 14, concMy: 15,
    steelP: 16, steelMx: 17, steelMy: 18,
    totP: 19, totMx: 20, totMy: 21, totM: 22,
    engP: 23, delta: 24
  }

  for (let c = 3; c <= PM.delta; c++) pmSheet.getColumn(c).width = 13

  // Per-station strain-plane formulas live here; the Concrete/Steel sheets read them.
  const stationRow = (index: number) => PM_FIRST + index
  const kxCol = PM.kx
  const kyCol = PM.ky
  const auditUBar = Math.min(...bars.map((bar) => bar.y * Math.cos(beta) + bar.x * Math.sin(beta)))

  stationDefinitions.forEach((station, index) => {
    const r = stationRow(index)
    const schedule = stationSchedule(station)
    pmSheet.getCell(r, PM.point).value = `P${index}`
    pmSheet.getCell(r, PM.point).note = stationLabels[index]
    pmSheet.getCell(r, PM.point).font = { bold: true }
    pmSheet.getCell(r, PM.cRatio).value = schedule.cOverC1
    pmSheet.getCell(r, PM.fsRatio).value = schedule.fsRatio
    pmSheet.getCell(r, PM.epsS).value = schedule.epsS
    for (const c of [PM.cRatio, PM.fsRatio, PM.epsS]) {
      pmSheet.getCell(r, c).numFmt = '0.####'
      pmSheet.getCell(r, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INPUT_FILL } }
      pmSheet.getCell(r, c).alignment = { horizontal: 'center' }
    }

    const uCtrl = `${col(PM.uCtrl)}${r}`
    const epsCtrl = `${col(PM.epsCtrl)}${r}`
    const kappa = `${col(PM.kappa)}${r}`
    const e0 = `${col(PM.e0)}${r}`

    if (station.kind === 'pure-compression') {
      pmSheet.getCell(r, PM.uCtrl).value = '—'
      pmSheet.getCell(r, PM.epsCtrl).value = { formula: 'ecu' }
      pmSheet.getCell(r, PM.c).value = 'n/a'
      pmSheet.getCell(r, PM.kappa).value = 0
      pmSheet.getCell(r, PM.e0).value = { formula: 'ecu' }
    } else if (station.kind === 'pure-tension') {
      pmSheet.getCell(r, PM.uCtrl).value = '—'
      pmSheet.getCell(r, PM.epsCtrl).value = { formula: 'etu' }
      pmSheet.getCell(r, PM.c).value = 'n/a'
      pmSheet.getCell(r, PM.kappa).value = 0
      pmSheet.getCell(r, PM.e0).value = { formula: 'etu' }
    } else {
      // Control point: neutral-axis stations sit at zero strain a fixed multiple of C1 below the
      // compression fibre; the remaining stations are driven by the farthest tension bar.
      pmSheet.getCell(r, PM.uCtrl).value = {
        formula: station.kind === 'neutral-axis-ratio' ? `u_max-${col(PM.cRatio)}${r}*u_C1` : 'u_bar'
      }
      if (
        station.kind === 'steel-stress-ratio' ||
        station.kind === 'strength-reduction-transition-ratio' ||
        station.kind === 'strength-reduction-post-transition'
      ) {
        const state = engineStations[index].state
        const resolved = state.e0 + Math.hypot(state.kx, state.ky) * auditUBar
        pmSheet.getCell(r, PM.epsCtrl).value = resolved
        pmSheet.getCell(r, PM.epsCtrl).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: CONST_FILL }
        }
        pmSheet.getCell(r, PM.epsCtrl).note = station.kind === 'steel-stress-ratio'
          ? 'Engine-resolved inverse of the controlling bar material law at the requested fs/fyd.'
          : 'Engine-resolved code-aware tensile strain landmark from the selected resistance profile.'
      } else {
        pmSheet.getCell(r, PM.epsCtrl).value = {
          formula: station.kind === 'neutral-axis-ratio' ? 'ROUND(0,0)' : `-${col(PM.epsS)}${r}`
        }
      }
      pmSheet.getCell(r, PM.kappa).value = { formula: `(ecu-${epsCtrl})/(u_max-${uCtrl})` }
      pmSheet.getCell(r, PM.c).value = { formula: `ecu/${kappa}` }
      pmSheet.getCell(r, PM.e0).value = { formula: `ecu-${kappa}*u_max` }
    }

    pmSheet.getCell(r, kxCol).value = { formula: `${kappa}*COS(RADIANS(beta))` }
    pmSheet.getCell(r, kyCol).value = { formula: `${kappa}*SIN(RADIANS(beta))` }

    pmSheet.getCell(r, PM.uCtrl).numFmt = '#,##0.000'
    pmSheet.getCell(r, PM.epsCtrl).numFmt = '0.000000'
    pmSheet.getCell(r, PM.c).numFmt = '#,##0.0'
    pmSheet.getCell(r, PM.kappa).numFmt = '0.000E+00'
    pmSheet.getCell(r, PM.e0).numFmt = '0.000000'
    pmSheet.getCell(r, kxCol).numFmt = '0.000E+00'
    pmSheet.getCell(r, kyCol).numFmt = '0.000E+00'
  })
  defineName(`PM_Angle!$${col(PM.e0)}$${PM_FIRST}:$${col(PM.e0)}$${stationRow(stationCount - 1)}`, 'St_e0')
  defineName(`PM_Angle!$${col(kxCol)}$${PM_FIRST}:$${col(kxCol)}$${stationRow(stationCount - 1)}`, 'St_kx')
  defineName(`PM_Angle!$${col(kyCol)}$${PM_FIRST}:$${col(kyCol)}$${stationRow(stationCount - 1)}`, 'St_ky')

  // ==========================================================================
  // Concrete — per fibre strain and stress for every station
  // ==========================================================================
  const concSheet = workbook.addWorksheet('Concrete', { views: [{ state: 'frozen', ySplit: 8, xSplit: 4 }] })
  concSheet.getCell('A1').value = 'CONCRETE — FIBRE STRAIN AND STRESS PER STATION'
  concSheet.getCell('A1').font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } }
  concSheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TITLE_FILL } }
  concSheet.mergeCells('A1:I1')
  concSheet.getCell('A2').value = `ε = ε₀ + κx·Y + κy·X    |    fc = ${cLaw.description}`
  concSheet.getCell('A2').font = { italic: true, color: { argb: 'FF6B7280' } }
  concSheet.getCell('A3').value =
    `Columns A-D mirror the Mesh sheet. Columns E-I expand the full force/moment ledger for the station chosen in cell C4. The ${stationCount} station totals on PM_Angle integrate the same law over the same mesh without materialising ${stationCount} more column blocks.`
  concSheet.getCell('A3').alignment = { wrapText: true, vertical: 'top' }
  concSheet.mergeCells('A3:I3')
  concSheet.getRow(3).height = 28
  concSheet.getCell('A4').value = `Detail station (0…${stationCount - 1})`
  concSheet.getCell('C4').value = Math.min(5, stationCount - 1)
  concSheet.getCell('C4').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INPUT_FILL } }
  concSheet.getCell('C4').font = { bold: true }
  concSheet.getCell('C4').alignment = { horizontal: 'center' }
  concSheet.getCell('D4').value = { formula: '"detail shown for station P"&C4' }
  concSheet.getCell('D4').font = { italic: true, color: { argb: 'FF6B7280' } }
  defineName('Concrete!$C$4', 'Det')

  const CONC_HEAD = 6
  const CONC_SUM = 7
  const CONC_FIRST = 8
  const detailHeaders = ['No.', 'X (mm)', 'Y (mm)', 'A (mm²)', 'ε', 'fc (MPa)', 'Fc (N)', 'Mcx (N·mm)', 'Mcy (N·mm)']
  detailHeaders.forEach((text, index) => {
    const cell = concSheet.getCell(CONC_HEAD, index + 1)
    cell.value = text
    cell.font = { bold: true, size: 10 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
    cell.alignment = { horizontal: 'center', wrapText: true }
    cell.border = { bottom: { style: 'thin' } }
  })
  if (input.equilibrium) {
    const head = concSheet.getCell(CONC_HEAD - 1, 11)
    head.value = 'At the converged equilibrium state'
    head.font = { bold: true, size: 10, color: { argb: 'FF1F3864' } }
    head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GROUP_FILL } }
    head.alignment = { horizontal: 'center' }
    concSheet.mergeCells(CONC_HEAD - 1, 11, CONC_HEAD - 1, 12)
    ;['ε', 'fc (MPa)'].forEach((text, index) => {
      const cell = concSheet.getCell(CONC_HEAD, 11 + index)
      cell.value = text
      cell.font = { bold: true, size: 10 }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
      cell.alignment = { horizontal: 'center' }
      cell.border = { bottom: { style: 'thin' } }
      concSheet.getColumn(11 + index).width = 13
    })
  }
  concSheet.getCell(CONC_SUM, 1).value = 'SUM'
  concSheet.getCell(CONC_SUM, 1).font = { bold: true }
  const equilibrium = input.equilibrium ?? null
  const concLastRow = CONC_FIRST + fibers.length - 1
  for (const c of [4, 7, 8, 9]) {
    concSheet.getCell(CONC_SUM, c).value = { formula: `SUM(${col(c)}${CONC_FIRST}:${col(c)}${concLastRow})` }
    concSheet.getCell(CONC_SUM, c).font = { bold: true }
    concSheet.getCell(CONC_SUM, c).numFmt = '#,##0'
  }
  for (let index = 0; index < 4; index++) concSheet.getColumn(index + 1).width = 12
  for (let index = 5; index <= 9; index++) concSheet.getColumn(index).width = 15

  fibers.forEach((fiber, index) => {
    const r = CONC_FIRST + index
    const meshRow = meshFirst + index
    concSheet.getCell(r, 1).value = { formula: `Mesh!A${meshRow}` }
    concSheet.getCell(r, 2).value = { formula: `Mesh!B${meshRow}` }
    concSheet.getCell(r, 3).value = { formula: `Mesh!C${meshRow}` }
    concSheet.getCell(r, 4).value = { formula: `Mesh!D${meshRow}` }
    concSheet.getCell(r, 2).numFmt = '#,##0.000'
    concSheet.getCell(r, 3).numFmt = '#,##0.000'
    concSheet.getCell(r, 4).numFmt = '#,##0.000'

    // Detail block for the selected station.
    concSheet.getCell(r, 5).value = {
      formula: `INDEX(St_e0,Det+1)+INDEX(St_kx,Det+1)*C${r}+INDEX(St_ky,Det+1)*B${r}`
    }
    concSheet.getCell(r, 6).value = { formula: cLaw.scalar(`E${r}`) }
    concSheet.getCell(r, 7).value = { formula: `F${r}*D${r}` }
    concSheet.getCell(r, 8).value = { formula: `G${r}*C${r}` }
    concSheet.getCell(r, 9).value = { formula: `G${r}*B${r}` }
    concSheet.getCell(r, 5).numFmt = '0.000000'
    concSheet.getCell(r, 6).numFmt = '#,##0.000'
    concSheet.getCell(r, 7).numFmt = '#,##0'
    concSheet.getCell(r, 8).numFmt = '#,##0'
    concSheet.getCell(r, 9).numFmt = '#,##0'

    if (equilibrium) {
      concSheet.getCell(r, 11).value = { formula: `Eq_e0+Eq_kx*$C${r}+Eq_ky*$B${r}` }
      concSheet.getCell(r, 12).value = { formula: cLaw.scalar(`K${r}`) }
      concSheet.getCell(r, 11).numFmt = '0.000000'
      concSheet.getCell(r, 12).numFmt = '#,##0.000'
    }
  })

  // ==========================================================================
  // Steel — per bar, every station
  // ==========================================================================
  const steelSheet = workbook.addWorksheet('Steel', { views: [{ state: 'frozen', ySplit: 6, xSplit: 5 }] })
  steelSheet.getCell('A1').value = `REINFORCEMENT — PER BAR, ALL ${stationCount} STATIONS`
  steelSheet.getCell('A1').font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } }
  steelSheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TITLE_FILL } }
  steelSheet.mergeCells('A1:L1')
  steelSheet.getCell('A2').value =
    `fs = ${sLaw.description}. The bar force uses fs,eff = fs − fc so the concrete displaced by the bar is not counted twice (docs/11 §3.3).`
  steelSheet.getCell('A2').font = { italic: true, color: { argb: 'FF6B7280' } }
  steelSheet.mergeCells('A2:L2')

  const STEEL_HEAD = 5
  const STEEL_SUM = 6
  const STEEL_FIRST = 7
  ;['No.', 'Dia (mm)', 'X (mm)', 'Y (mm)', 'As (mm²)'].forEach((text, index) => {
    const cell = steelSheet.getCell(STEEL_HEAD, index + 1)
    cell.value = text
    cell.font = { bold: true, size: 10 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
    cell.alignment = { horizontal: 'center', wrapText: true }
    cell.border = { bottom: { style: 'thin' } }
    steelSheet.getColumn(index + 1).width = 11
  })
  const steelBlockCol = (stationIndex: number) => 6 + stationIndex * 7
  const steelSubHeaders = ['εs', 'fs (MPa)', 'fc (MPa)', 'fs,eff (MPa)', 'Fs (N)', 'Msx (N·mm)', 'Msy (N·mm)']
  stationDefinitions.forEach((_, index) => {
    const base = steelBlockCol(index)
    const group = steelSheet.getCell(STEEL_HEAD - 1, base)
    group.value = `P${index}`
    group.font = { bold: true, size: 10, color: { argb: 'FF1F3864' } }
    group.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GROUP_FILL } }
    group.alignment = { horizontal: 'center' }
    steelSheet.mergeCells(STEEL_HEAD - 1, base, STEEL_HEAD - 1, base + 6)
    steelSubHeaders.forEach((text, offset) => {
      const cell = steelSheet.getCell(STEEL_HEAD, base + offset)
      cell.value = text
      cell.font = { bold: true, size: 10 }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
      cell.alignment = { horizontal: 'center', wrapText: true }
      cell.border = { bottom: { style: 'thin' } }
      steelSheet.getColumn(base + offset).width = 13
    })
  })
  steelSheet.getRow(STEEL_HEAD).height = 28
  steelSheet.getCell(STEEL_SUM, 1).value = 'SUM'
  steelSheet.getCell(STEEL_SUM, 1).font = { bold: true }
  const steelLastRow = STEEL_FIRST + bars.length - 1
  steelSheet.getCell(STEEL_SUM, 5).value = { formula: `SUM(E${STEEL_FIRST}:E${steelLastRow})` }
  steelSheet.getCell(STEEL_SUM, 5).numFmt = '#,##0.0'
  steelSheet.getCell(STEEL_SUM, 5).font = { bold: true }

  bars.forEach((bar, index) => {
    const r = STEEL_FIRST + index
    const geomRowForBar = barFirst + index
    steelSheet.getCell(r, 1).value = bar.no
    steelSheet.getCell(r, 2).value = { formula: `Geometry!C${geomRowForBar}` }
    steelSheet.getCell(r, 3).value = { formula: `Geometry!D${geomRowForBar}` }
    steelSheet.getCell(r, 4).value = { formula: `Geometry!E${geomRowForBar}` }
    steelSheet.getCell(r, 5).value = { formula: `Geometry!F${geomRowForBar}` }
    for (const c of [2, 3, 4, 5]) steelSheet.getCell(r, c).numFmt = '#,##0.000'

    stationDefinitions.forEach((_, stationIndex) => {
      const base = steelBlockCol(stationIndex)
      const sRow = stationRow(stationIndex)
      const eps = `${col(base)}${r}`
      const fs = `${col(base + 1)}${r}`
      const fc = `${col(base + 2)}${r}`
      const fsEff = `${col(base + 3)}${r}`
      const force = `${col(base + 4)}${r}`
      steelSheet.getCell(r, base).value = {
        formula: `PM_Angle!$${col(PM.e0)}$${sRow}+PM_Angle!$${col(kxCol)}$${sRow}*$D${r}+PM_Angle!$${col(kyCol)}$${sRow}*$C${r}`
      }
      steelSheet.getCell(r, base + 1).value = { formula: sLaw.scalar(eps) }
      steelSheet.getCell(r, base + 2).value = { formula: cLaw.scalar(eps) }
      steelSheet.getCell(r, base + 3).value = { formula: `${fs}-${fc}` }
      steelSheet.getCell(r, base + 4).value = { formula: `${fsEff}*$E${r}` }
      steelSheet.getCell(r, base + 5).value = { formula: `${force}*$D${r}` }
      steelSheet.getCell(r, base + 6).value = { formula: `${force}*$C${r}` }
      steelSheet.getCell(r, base).numFmt = '0.000000'
      for (const offset of [1, 2, 3]) steelSheet.getCell(r, base + offset).numFmt = '#,##0.000'
      for (const offset of [4, 5, 6]) steelSheet.getCell(r, base + offset).numFmt = '#,##0'
    })
  })

  stationDefinitions.forEach((_, stationIndex) => {
    const base = steelBlockCol(stationIndex)
    for (const offset of [4, 5, 6]) {
      const c = base + offset
      steelSheet.getCell(STEEL_SUM, c).value = { formula: `SUM(${col(c)}${STEEL_FIRST}:${col(c)}${steelLastRow})` }
      steelSheet.getCell(STEEL_SUM, c).font = { bold: true }
      steelSheet.getCell(STEEL_SUM, c).numFmt = '#,##0'
    }
  })

  const EQ_STEEL_COL = steelBlockCol(stationCount)
  if (equilibrium) {
    const head = steelSheet.getCell(STEEL_HEAD - 1, EQ_STEEL_COL)
    head.value = 'At the converged equilibrium state'
    head.font = { bold: true, size: 10, color: { argb: 'FF1F3864' } }
    head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GROUP_FILL } }
    head.alignment = { horizontal: 'center' }
    steelSheet.mergeCells(STEEL_HEAD - 1, EQ_STEEL_COL, STEEL_HEAD - 1, EQ_STEEL_COL + 6)
    steelSubHeaders.forEach((text, offset) => {
      const cell = steelSheet.getCell(STEEL_HEAD, EQ_STEEL_COL + offset)
      cell.value = text
      cell.font = { bold: true, size: 10 }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
      cell.alignment = { horizontal: 'center', wrapText: true }
      cell.border = { bottom: { style: 'thin' } }
      steelSheet.getColumn(EQ_STEEL_COL + offset).width = 13
    })
    bars.forEach((_bar, index) => {
      const r = STEEL_FIRST + index
      const eps = `${col(EQ_STEEL_COL)}${r}`
      const fs = `${col(EQ_STEEL_COL + 1)}${r}`
      const fc = `${col(EQ_STEEL_COL + 2)}${r}`
      const fsEff = `${col(EQ_STEEL_COL + 3)}${r}`
      const force = `${col(EQ_STEEL_COL + 4)}${r}`
      steelSheet.getCell(r, EQ_STEEL_COL).value = { formula: `Eq_e0+Eq_kx*$D${r}+Eq_ky*$C${r}` }
      steelSheet.getCell(r, EQ_STEEL_COL + 1).value = { formula: sLaw.scalar(eps) }
      steelSheet.getCell(r, EQ_STEEL_COL + 2).value = { formula: cLaw.scalar(eps) }
      steelSheet.getCell(r, EQ_STEEL_COL + 3).value = { formula: `${fs}-${fc}` }
      steelSheet.getCell(r, EQ_STEEL_COL + 4).value = { formula: `${fsEff}*$E${r}` }
      steelSheet.getCell(r, EQ_STEEL_COL + 5).value = { formula: `${force}*$D${r}` }
      steelSheet.getCell(r, EQ_STEEL_COL + 6).value = { formula: `${force}*$C${r}` }
      steelSheet.getCell(r, EQ_STEEL_COL).numFmt = '0.000000'
      for (const offset of [1, 2, 3]) steelSheet.getCell(r, EQ_STEEL_COL + offset).numFmt = '#,##0.000'
      for (const offset of [4, 5, 6]) steelSheet.getCell(r, EQ_STEEL_COL + offset).numFmt = '#,##0'
    })
    for (const offset of [4, 5, 6]) {
      const c = EQ_STEEL_COL + offset
      steelSheet.getCell(STEEL_SUM, c).value = { formula: `SUM(${col(c)}${STEEL_FIRST}:${col(c)}${steelLastRow})` }
      steelSheet.getCell(STEEL_SUM, c).font = { bold: true }
      steelSheet.getCell(STEEL_SUM, c).numFmt = '#,##0'
    }
  }

  // ==========================================================================
  // PM_Angle totals — integrate the Concrete/Steel sheets
  // ==========================================================================
  stationDefinitions.forEach((station, index) => {
    const r = stationRow(index)
    const sRow = stationRow(index)
    const steelBase = steelBlockCol(index)
    const fibreEps = `(PM_Angle!$${col(PM.e0)}$${sRow}+PM_Angle!$${col(kxCol)}$${sRow}*Mesh_Y+PM_Angle!$${col(
      kyCol
    )}$${sRow}*Mesh_X)`

    if (cLaw.array) {
      const fc = cLaw.array(fibreEps)
      pmSheet.getCell(r, PM.concP).value = { formula: `SUMPRODUCT(${fc},Mesh_A)/1000` }
      pmSheet.getCell(r, PM.concMx).value = { formula: `SUMPRODUCT(${fc},Mesh_A,Mesh_Y)/1000000` }
      pmSheet.getCell(r, PM.concMy).value = { formula: `SUMPRODUCT(${fc},Mesh_A,Mesh_X)/1000000` }
    } else {
      // A tabulated law cannot be applied elementwise inside SUMPRODUCT, so the integral arrives
      // as an engine value. The fibre block on `Concrete` still shows it term by term.
      pmSheet.getCell(r, PM.concP).value = engineStations[index].ledger.concrete.P / 1e3
      pmSheet.getCell(r, PM.concMx).value = engineStations[index].ledger.concrete.Mx / 1e6
      pmSheet.getCell(r, PM.concMy).value = engineStations[index].ledger.concrete.My / 1e6
      for (const c of [PM.concP, PM.concMx, PM.concMy]) {
        pmSheet.getCell(r, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CONST_FILL } }
      }
    }
    pmSheet.getCell(r, PM.steelP).value = { formula: `Steel!${col(steelBase + 4)}${STEEL_SUM}/1000` }
    pmSheet.getCell(r, PM.steelMx).value = { formula: `Steel!${col(steelBase + 5)}${STEEL_SUM}/1000000` }
    pmSheet.getCell(r, PM.steelMy).value = { formula: `Steel!${col(steelBase + 6)}${STEEL_SUM}/1000000` }
    pmSheet.getCell(r, PM.totP).value = { formula: `${col(PM.concP)}${r}+${col(PM.steelP)}${r}` }
    pmSheet.getCell(r, PM.totMx).value = { formula: `${col(PM.concMx)}${r}+${col(PM.steelMx)}${r}` }
    pmSheet.getCell(r, PM.totMy).value = { formula: `${col(PM.concMy)}${r}+${col(PM.steelMy)}${r}` }
    pmSheet.getCell(r, PM.totM).value = { formula: `SQRT(${col(PM.totMx)}${r}^2+${col(PM.totMy)}${r}^2)` }
    pmSheet.getCell(r, PM.engP).value = engineStations[index].ledger.total.P / 1e3
    pmSheet.getCell(r, PM.delta).value = {
      formula: `IF(ABS(${col(PM.engP)}${r})<0.000000001,0,(${col(PM.totP)}${r}-${col(PM.engP)}${r})/${col(PM.engP)}${r}*100)`
    }
    for (const c of [PM.concP, PM.concMx, PM.concMy, PM.steelP, PM.steelMx, PM.steelMy, PM.totP, PM.totMx, PM.totMy, PM.totM, PM.engP]) {
      pmSheet.getCell(r, c).numFmt = '#,##0.00'
    }
    pmSheet.getCell(r, PM.delta).numFmt = '0.0000"%"'
    for (const c of [PM.totP, PM.totMx, PM.totMy]) pmSheet.getCell(r, c).font = { bold: true }
    if (station.kind === 'pure-compression' || station.kind === 'pure-tension') {
      for (let c = PM.point; c <= PM.delta; c++) {
        pmSheet.getCell(r, c).border = { top: { style: 'hair' }, bottom: { style: 'hair' } }
      }
    }
  })

  const pmLastRow = stationRow(stationCount - 1)
  defineName(`PM_Angle!$${col(PM.totP)}$${PM_FIRST}:$${col(PM.totP)}$${pmLastRow}`, 'St_P')
  defineName(`PM_Angle!$${col(PM.totMx)}$${PM_FIRST}:$${col(PM.totMx)}$${pmLastRow}`, 'St_Mx')
  defineName(`PM_Angle!$${col(PM.totMy)}$${PM_FIRST}:$${col(PM.totMy)}$${pmLastRow}`, 'St_My')

  // The demand check does not belong here: this sheet is a strain-domain row at beta, and the
  // capacity in the demand direction is a query on the finished surface. See MxMy_FixedP (ray at
  // theta_L on the P = Pu contour) and PM_Theta (vertical section through theta_L).
  const noteRow = pmLastRow + 2
  sectionHeading(pmSheet, noteRow, 'Where the demand check lives', 10)
  pmSheet.getCell(noteRow + 1, PM.cRatio).value =
    'This table is the resistance sampled at β. The moment direction of each row is atan2(My, Mx) of that row, which is generally not β.'
  pmSheet.getCell(noteRow + 1, PM.cRatio).font = { italic: true, color: { argb: 'FF6B7280' } }
  pmSheet.getCell(noteRow + 2, PM.cRatio).value =
    'Capacity against the demand: MxMy_FixedP intersects the P = Pu contour with the ray at θ_L; PM_Theta cuts the surface with the plane Mx·sin(θ_L) − My·cos(θ_L) = 0.'
  pmSheet.getCell(noteRow + 2, PM.cRatio).font = { italic: true, color: { argb: 'FF6B7280' } }
  pmSheet.getCell(noteRow + 3, PM.cRatio).value = 'β of this sheet vs θ_L of the demand (deg)'
  pmSheet.getCell(noteRow + 3, PM.point).value = { formula: 'beta' }
  pmSheet.getCell(noteRow + 3, PM.point).numFmt = '#,##0.0000'
  pmSheet.getCell(noteRow + 3, PM.fsRatio).value = { formula: 'theta_L' }
  pmSheet.getCell(noteRow + 3, PM.fsRatio).numFmt = '#,##0.0000'

  // ==========================================================================
  // MxMy_FixedP — every direction solved at P = Pu
  // ==========================================================================
  const mmSheet = workbook.addWorksheet('MxMy_FixedP', { views: [{ state: 'frozen', ySplit: 8, xSplit: 1 }] })
  title(mmSheet, 1, 'Mx–My INTERACTION CONTOUR AT P = Pu', 12)
  mmSheet.getCell('B2').value =
    `Each of the ${directionCount} directions repeats the ${stationCount}-station schedule. The strain planes and P, Mx, My mesh integrals are engine values (shaded grey); contour, ray query and interpolation remain formulas.`
  mmSheet.getCell('B2').alignment = { wrapText: true, vertical: 'top' }
  mmSheet.mergeCells('B2:N3')
  mmSheet.getRow(2).height = 26

  const MM_HEAD = 7
  const MM_FIRST = 8
  const MM_PARAM_COL = 2 // beta, u_max, u_bar, C1
  const MM_PLANE_COL = MM_PARAM_COL + 4
  const MM_P_COL = MM_PLANE_COL + stationCount * 3
  const MM_MX_COL = MM_P_COL + stationCount
  const MM_MY_COL = MM_MX_COL + stationCount
  const MM_RESULT_COL = MM_MY_COL + stationCount // k, t, Mx, My, |M|

  const mmHeaderCell = (rowIndex: number, colIndex: number, text: string, fill = HEADER_FILL) => {
    const cell = mmSheet.getCell(rowIndex, colIndex)
    cell.value = text
    cell.font = { bold: true, size: 10 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } }
    cell.alignment = { horizontal: 'center', wrapText: true }
    cell.border = { bottom: { style: 'thin' } }
    mmSheet.getColumn(colIndex).width = 12
  }

  const mmGroup = (colIndex: number, span: number, text: string) => {
    const cell = mmSheet.getCell(MM_HEAD - 1, colIndex)
    cell.value = text
    cell.font = { bold: true, size: 10, color: { argb: 'FF1F3864' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GROUP_FILL } }
    cell.alignment = { horizontal: 'center' }
    if (span > 1) mmSheet.mergeCells(MM_HEAD - 1, colIndex, MM_HEAD - 1, colIndex + span - 1)
  }

  mmGroup(MM_PARAM_COL, 4, 'Direction')
  const mmParamHeaders = ['β (deg)', 'u_max (mm)', 'u_bar (mm)', 'C1 (mm)']
  mmParamHeaders.forEach((text, index) => mmHeaderCell(MM_HEAD, MM_PARAM_COL + index, text))
  stationDefinitions.forEach((_, index) => {
    const base = MM_PLANE_COL + index * 3
    mmGroup(base, 3, `P${index} plane`)
    const planeHeaders = ['ε₀', 'κx', 'κy']
    planeHeaders.forEach((text, offset) => mmHeaderCell(MM_HEAD, base + offset, text))
    mmHeaderCell(MM_HEAD, MM_P_COL + index, `P${index}`)
    mmHeaderCell(MM_HEAD, MM_MX_COL + index, `P${index}`)
    mmHeaderCell(MM_HEAD, MM_MY_COL + index, `P${index}`)
  })
  mmGroup(MM_P_COL, stationCount, 'Station P (kN)')
  mmGroup(MM_MX_COL, stationCount, 'Station Mx (kN·m)')
  mmGroup(MM_MY_COL, stationCount, 'Station My (kN·m)')
  mmGroup(MM_RESULT_COL, 5, 'Contour at P = Pu')
  const mmResultHeaders = ['k', 't', 'Mx (kN·m)', 'My (kN·m)', '|M| (kN·m)']
  mmResultHeaders.forEach((text, index) => mmHeaderCell(MM_HEAD, MM_RESULT_COL + index, text, GROUP_FILL))
  mmSheet.getRow(MM_HEAD).height = 26
  mmSheet.getColumn(1).width = 6

  // One extra wrap direction (beta + 360) closes every ring, so edge ranges stay contiguous.
  for (let angleIndex = 0; angleIndex <= directionCount; angleIndex++) {
    const r = MM_FIRST + angleIndex
    mmSheet.getCell(r, 1).value = angleIndex + 1
    const betaCell = `$${col(MM_PARAM_COL)}${r}`
    const directionIndex = angleIndex % directionCount
    const directionDeg =
      angleIndex === directionCount
        ? (directionBetas[0] * 180) / Math.PI + 360
        : (directionBetas[directionIndex] * 180) / Math.PI
    mmSheet.getCell(r, MM_PARAM_COL).value = directionDeg
    mmSheet.getCell(r, MM_PARAM_COL).numFmt = '0.########'
    mmSheet.getCell(r, MM_PARAM_COL).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INPUT_FILL } }

    // Support extremes and strain planes are engine values: computing them per direction with a
    // formula needs MAX/MIN over an array expression, which real Excel will not evaluate in a
    // plain cell. Nothing downstream reads these as formulas, so they are recorded for the audit.
    const support = directionSupport(directionIndex)
    mmSheet.getCell(r, MM_PARAM_COL + 1).value = support.uMax
    mmSheet.getCell(r, MM_PARAM_COL + 2).value = support.uBar
    mmSheet.getCell(r, MM_PARAM_COL + 3).value = support.c1
    for (let c = MM_PARAM_COL + 1; c <= MM_PARAM_COL + 3; c++) {
      mmSheet.getCell(r, c).numFmt = '#,##0.000'
      mmSheet.getCell(r, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CONST_FILL } }
    }

    stationDefinitions.forEach((_station, stationIndex) => {
      const base = MM_PLANE_COL + stationIndex * 3
      const sample = surfaceAt.get(`${directionIndex}:${stationIndex}`)
      mmSheet.getCell(r, base).value = sample?.e0 ?? 0
      mmSheet.getCell(r, base + 1).value = sample?.kx ?? 0
      mmSheet.getCell(r, base + 2).value = sample?.ky ?? 0
      // The direction-by-station mesh integrals arrive as engine values; everything derived from
      // them below remains a formula.
      mmSheet.getCell(r, MM_P_COL + stationIndex).value = (sample?.P ?? 0) / 1e3
      mmSheet.getCell(r, MM_MX_COL + stationIndex).value = (sample?.Mx ?? 0) / 1e6
      mmSheet.getCell(r, MM_MY_COL + stationIndex).value = (sample?.My ?? 0) / 1e6
      const importedCells = [base, base + 1, base + 2, MM_P_COL + stationIndex, MM_MX_COL + stationIndex, MM_MY_COL + stationIndex]
      for (const c of [MM_P_COL + stationIndex, MM_MX_COL + stationIndex, MM_MY_COL + stationIndex]) {
        mmSheet.getCell(r, c).numFmt = '#,##0.00'
      }
      for (const c of importedCells) {
        mmSheet.getCell(r, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CONST_FILL } }
      }
    })

    // P falls with station index, so k counts the stations still at or above Pu.
    const pRange = `$${col(MM_P_COL)}${r}:$${col(MM_P_COL + stationCount - 1)}${r}`
    const mxRange = `$${col(MM_MX_COL)}${r}:$${col(MM_MX_COL + stationCount - 1)}${r}`
    const myRange = `$${col(MM_MY_COL)}${r}:$${col(MM_MY_COL + stationCount - 1)}${r}`
    const kCell = `$${col(MM_RESULT_COL)}${r}`
    const tCell = `$${col(MM_RESULT_COL + 1)}${r}`

    mmSheet.getCell(r, MM_RESULT_COL).value = {
      formula: `MAX(1,MIN(${stationCount - 1},SUMPRODUCT(--(${pRange}>=Pu))))`
    }
    mmSheet.getCell(r, MM_RESULT_COL + 1).value = {
      formula: `(Pu-INDEX(${pRange},1,${kCell}))/(INDEX(${pRange},1,${kCell}+1)-INDEX(${pRange},1,${kCell}))`
    }
    mmSheet.getCell(r, MM_RESULT_COL + 2).value = {
      formula: `INDEX(${mxRange},1,${kCell})+${tCell}*(INDEX(${mxRange},1,${kCell}+1)-INDEX(${mxRange},1,${kCell}))`
    }
    mmSheet.getCell(r, MM_RESULT_COL + 3).value = {
      formula: `INDEX(${myRange},1,${kCell})+${tCell}*(INDEX(${myRange},1,${kCell}+1)-INDEX(${myRange},1,${kCell}))`
    }
    mmSheet.getCell(r, MM_RESULT_COL + 4).value = {
      formula: `SQRT(${col(MM_RESULT_COL + 2)}${r}^2+${col(MM_RESULT_COL + 3)}${r}^2)`
    }
    mmSheet.getCell(r, MM_RESULT_COL).numFmt = '0'
    mmSheet.getCell(r, MM_RESULT_COL + 1).numFmt = '0.0000'
    for (const offset of [2, 3, 4]) {
      mmSheet.getCell(r, MM_RESULT_COL + offset).numFmt = '#,##0.00'
      mmSheet.getCell(r, MM_RESULT_COL + offset).font = { bold: true }
    }
  }

  const MM_LAST = MM_FIRST + directionCount // inclusive of the wrap row
  const MM_EDGE_LAST = MM_LAST - 1
  mmSheet.getCell(MM_LAST, 1).value = 'wrap'
  mmSheet.getCell(MM_LAST, MM_PARAM_COL).note = 'Same direction as the first row, repeated so ring ranges are contiguous.'

  // ---- demand ray query on the P = Pu contour ------------------------------
  const MM_RAY_COL = MM_RESULT_COL + 5
  mmGroup(MM_RAY_COL, 6, 'Ray at θ_L (demand direction)')
  const rayHeaders = ['edge dx', 'edge dy', 'cross(e,d)', 'q', 'M on ray', 'admissible M']
  rayHeaders.forEach((text, index) => mmHeaderCell(MM_HEAD, MM_RAY_COL + index, text, GROUP_FILL))

  const cTheta = 'COS(RADIANS(theta_L))'
  const sTheta = 'SIN(RADIANS(theta_L))'
  for (let angleIndex = 0; angleIndex < directionCount; angleIndex++) {
    const r = MM_FIRST + angleIndex
    const ax = `${col(MM_RESULT_COL + 2)}${r}`
    const ay = `${col(MM_RESULT_COL + 3)}${r}`
    const bx = `${col(MM_RESULT_COL + 2)}${r + 1}`
    const by = `${col(MM_RESULT_COL + 3)}${r + 1}`
    const ex = `${col(MM_RAY_COL)}${r}`
    const ey = `${col(MM_RAY_COL + 1)}${r}`
    const den = `${col(MM_RAY_COL + 2)}${r}`
    const q = `${col(MM_RAY_COL + 3)}${r}`
    const m = `${col(MM_RAY_COL + 4)}${r}`

    mmSheet.getCell(r, MM_RAY_COL).value = { formula: `${bx}-${ax}` }
    mmSheet.getCell(r, MM_RAY_COL + 1).value = { formula: `${by}-${ay}` }
    // cross(edge, d) with d = (cos theta_L, sin theta_L)
    mmSheet.getCell(r, MM_RAY_COL + 2).value = { formula: `${ex}*${sTheta}-${ey}*${cTheta}` }
    // a + q*e parallel to d  =>  q = -cross(a, d) / cross(e, d)
    mmSheet.getCell(r, MM_RAY_COL + 3).value = {
      formula: `IF(${den}=0,"",-(${ax}*${sTheta}-${ay}*${cTheta})/${den})`
    }
    mmSheet.getCell(r, MM_RAY_COL + 4).value = {
      formula: `IF(${q}="","",(${ax}+${q}*${ex})*${cTheta}+(${ay}+${q}*${ey})*${sTheta})`
    }
    // Only forward crossings that actually lie on the edge count.
    mmSheet.getCell(r, MM_RAY_COL + 5).value = {
      formula: `IF(OR(${q}="",${q}<0,${q}>1,${m}<0),"",${m})`
    }
    for (const offset of [0, 1, 2, 4, 5]) mmSheet.getCell(r, MM_RAY_COL + offset).numFmt = '#,##0.000'
    mmSheet.getCell(r, MM_RAY_COL + 3).numFmt = '0.0000'
  }

  // The imported grid must still agree with the live PM_Angle column. Pure compression and pure
  // tension are direction-independent, so they detect any edit to the material inputs that would
  // make the imported surface stale.
  const sentinelRow = MM_LAST + 2
  sectionHeading(mmSheet, sentinelRow, 'Imported-surface consistency', 8)
  const sentinels: Array<[string, number, string]> = [
    ['P0 pure compression: grid vs PM_Angle', 0, `${col(MM_P_COL)}${MM_FIRST}`],
    ['P18 pure tension: grid vs PM_Angle', stationCount - 1, `${col(MM_P_COL + stationCount - 1)}${MM_FIRST}`]
  ]
  sentinels.forEach(([label, stationIndex, gridCell], index) => {
    const r = sentinelRow + 1 + index
    mmSheet.getCell(r, MM_PARAM_COL).value = label
    mmSheet.getCell(r, MM_PARAM_COL + 3).value = { formula: gridCell }
    mmSheet.getCell(r, MM_PARAM_COL + 4).value = {
      formula: `PM_Angle!$${col(PM.totP)}$${stationRow(stationIndex)}`
    }
    mmSheet.getCell(r, MM_PARAM_COL + 5).value = {
      formula:
        `IF(ABS(${col(MM_PARAM_COL + 3)}${r}-${col(MM_PARAM_COL + 4)}${r})<=0.000001*MAX(ABS(${col(
          MM_PARAM_COL + 4
        )}${r}),1),"ok - imported surface matches the live calculation",` +
        `"STALE - material or geometry inputs changed; re-export from the app")`
    }
    for (const offset of [3, 4]) mmSheet.getCell(r, MM_PARAM_COL + offset).numFmt = '#,##0.00'
    mmSheet.getCell(r, MM_PARAM_COL + 5).font = { bold: true }
  })

  const admissible = `${col(MM_RAY_COL + 5)}${MM_FIRST}:${col(MM_RAY_COL + 5)}${MM_EDGE_LAST}`
  const summaryRow = sentinelRow + 4
  sectionHeading(mmSheet, summaryRow, 'Capacity in the demand direction at P = Pu', 8)
  const summary: Array<[string, string, string, string?]> = [
    ['θ_L (deg)', 'theta_L', '#,##0.0000'],
    ['crossings found', `COUNT(${admissible})`, '0'],
    ['Mb (kN·m)', `IF(COUNT(${admissible})=0,"no crossing",MIN(${admissible}))`, '#,##0.00', 'Mb'],
    ['Mbx = Mb·cos(θ_L)', `IF(ISNUMBER(Mb),Mb*${cTheta},"n/a")`, '#,##0.00'],
    ['Mby = Mb·sin(θ_L)', `IF(ISNUMBER(Mb),Mb*${sTheta},"n/a")`, '#,##0.00'],
    ['Mu (kN·m)', 'Mu', '#,##0.00'],
    ['Mu / Mb  (fixed-axial moment ratio)', `IF(ISNUMBER(Mb),IF(Mb<=0,"n/a",Mu/Mb),"n/a")`, '0.0000']
  ]
  summary.forEach(([label, formula, numberFormat, name], index) => {
    const r = summaryRow + 1 + index
    mmSheet.getCell(r, MM_PARAM_COL).value = label
    const cell = mmSheet.getCell(r, MM_PARAM_COL + 3)
    cell.value = { formula }
    cell.numFmt = numberFormat
    cell.font = { bold: index === summary.length - 1 }
    if (name) defineName(`MxMy_FixedP!$${col(MM_PARAM_COL + 3)}$${r}`, name)
  })
  mmSheet.getCell(summaryRow + summary.length + 1, MM_PARAM_COL).value =
    'Mu / Mb is the secondary fixed-axial metric of docs/engineering/05. It is not total utilisation and is undefined for a pure axial demand.'
  mmSheet.getCell(summaryRow + summary.length + 1, MM_PARAM_COL).font = { italic: true, color: { argb: 'FF6B7280' } }

  const mmDemandRow = MM_LAST + 1
  mmSheet.getCell(mmDemandRow, MM_RESULT_COL + 1).value = 'Demand'
  mmSheet.getCell(mmDemandRow, MM_RESULT_COL + 1).font = { bold: true }
  mmSheet.getCell(mmDemandRow, MM_RESULT_COL + 2).value = { formula: 'Mux' }
  mmSheet.getCell(mmDemandRow, MM_RESULT_COL + 3).value = { formula: 'Muy' }
  mmSheet.getCell(mmDemandRow, MM_RESULT_COL + 4).value = { formula: 'Mu' }
  for (const offset of [2, 3, 4]) {
    mmSheet.getCell(mmDemandRow, MM_RESULT_COL + offset).numFmt = '#,##0.00'
    mmSheet.getCell(mmDemandRow, MM_RESULT_COL + offset).font = { bold: true, color: { argb: 'FFB91C1C' } }
  }

  // ==========================================================================
  // PM_Theta — vertical section of the surface through the demand direction
  // ==========================================================================
  const ptSheet = workbook.addWorksheet('PM_Theta', { views: [{ state: 'frozen', ySplit: 10, xSplit: 2 }] })
  title(ptSheet, 1, 'VERTICAL P–Mθ SECTION THROUGH THE DEMAND DIRECTION', 12)
  ptSheet.getCell('B2').value =
    'Intersection of the P-Mx-My surface with the plane Mx·sin(θ_L) − My·cos(θ_L) = 0. Each station ring is cut twice, giving the +M and −M branches of the P-M diagram in the demand direction.'
  ptSheet.getCell('B2').alignment = { wrapText: true, vertical: 'top' }
  ptSheet.mergeCells('B2:M3')
  ptSheet.getRow(2).height = 28
  ptSheet.getCell('B5').value = 'θ_L (deg)'
  ptSheet.getCell('C5').value = { formula: 'theta_L' }
  ptSheet.getCell('C5').numFmt = '#,##0.0000'
  ptSheet.getCell('B6').value = 'β of the detail sheets (deg)'
  ptSheet.getCell('C6').value = { formula: 'beta' }
  ptSheet.getCell('C6').numFmt = '#,##0.0000'
  ptSheet.getCell('D6').value =
    'Different angles by construction: β orients the strain plane, θ_L orients the moment vector.'
  ptSheet.getCell('D6').font = { italic: true, color: { argb: 'FF6B7280' } }
  ptSheet.getCell('B7').value = 'moment tolerance'
  const mxBlock = `MxMy_FixedP!$${col(MM_MX_COL)}$${MM_FIRST}:$${col(MM_MX_COL + stationCount - 1)}$${MM_LAST}`
  const myBlock = `MxMy_FixedP!$${col(MM_MY_COL)}$${MM_FIRST}:$${col(MM_MY_COL + stationCount - 1)}$${MM_LAST}`
  // Largest moment magnitude in the whole table, as MAX(max, -min) over each block. MAX and MIN
  // take a rectangular range natively; no array entry, so it evaluates in real Excel.
  ptSheet.getCell('C7').value = {
    formula: `0.000000001*MAX(MAX(${mxBlock}),-MIN(${mxBlock}),MAX(${myBlock}),-MIN(${myBlock}))`
  }
  ptSheet.getCell('C7').numFmt = '0.00E+00'
  ptSheet.getCell('D7').value =
    'A station whose whole ring is below this radius is a pole: it lies in every vertical plane, so its section point is (P, Mθ = 0).'
  ptSheet.getCell('D7').font = { italic: true, color: { argb: 'FF6B7280' } }
  defineName('PM_Theta!$C$7', 'Mtol')

  const PT_HEAD = 9
  const PT_FIRST = 10
  const ptGroups: Array<[string, number]> = [
    ['Station', 2],
    ['+M branch (demand side)', 3],
    ['-M branch (opposite)', 3],
    ['Check', 1]
  ]
  let ptCol = 2
  for (const [label, span] of ptGroups) {
    const cell = ptSheet.getCell(PT_HEAD - 1, ptCol)
    cell.value = label
    cell.font = { bold: true, size: 10, color: { argb: 'FF1F3864' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GROUP_FILL } }
    cell.alignment = { horizontal: 'center' }
    ptSheet.mergeCells(PT_HEAD - 1, ptCol, PT_HEAD - 1, ptCol + span - 1)
    ptCol += span
  }
  const ptHeaders = ['Point', 'definition', 'cuts', 'P (kN)', 'Mθ (kN·m)', 'cuts', 'P (kN)', 'Mθ (kN·m)', 'ring closes']
  ptHeaders.forEach((text, index) => {
    const cell = ptSheet.getCell(PT_HEAD, 2 + index)
    cell.value = text
    cell.font = { bold: true, size: 10 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
    cell.alignment = { horizontal: 'center', wrapText: true }
    cell.border = { bottom: { style: 'thin' } }
  })
  ptSheet.getColumn(2).width = 9
  ptSheet.getColumn(3).width = 22
  for (let c = 4; c <= 10; c++) ptSheet.getColumn(c).width = 14
  ptSheet.getRow(PT_HEAD).height = 26

  // Ring of one station across all directions, plus the wrap row.
  const ring = (colIndex: number) => `MxMy_FixedP!$${col(colIndex)}$${MM_FIRST}:$${col(colIndex)}$${MM_EDGE_LAST}`
  const ringNext = (colIndex: number) => `MxMy_FixedP!$${col(colIndex)}$${MM_FIRST + 1}:$${col(colIndex)}$${MM_LAST}`

  stationDefinitions.forEach((station, index) => {
    const r = PT_FIRST + index
    const Xa = ring(MM_MX_COL + index)
    const Xb = ringNext(MM_MX_COL + index)
    const Ya = ring(MM_MY_COL + index)
    const Yb = ringNext(MM_MY_COL + index)
    const Pa = ring(MM_P_COL + index)
    const Pb = ringNext(MM_P_COL + index)

    // Signed distance of each ring vertex to the demand plane.
    const f1 = `((${Xa})*${sTheta}-(${Ya})*${cTheta})`
    const f2 = `((${Xb})*${sTheta}-(${Yb})*${cTheta})`
    // +1 when the two vertices coincide keeps the division finite; the cut flag discards it anyway.
    const q = `(${f1}/((${f1})-(${f2})+((${f1})=(${f2}))))`
    const cut = `((${f1})*(${f2})<=0)*((${f1})<>(${f2}))`
    const mq = `(((${Xa})+${q}*((${Xb})-(${Xa})))*${cTheta}+((${Ya})+${q}*((${Yb})-(${Ya})))*${sTheta})`
    const pq = `((${Pa})+${q}*((${Pb})-(${Pa})))`
    const plus = `${cut}*(${mq}>0)`
    const minus = `${cut}*(${mq}<0)`

    ptSheet.getCell(r, 2).value = `P${index}`
    ptSheet.getCell(r, 2).font = { bold: true }
    ptSheet.getCell(r, 3).value = stationLabels[index] || stationDefinitionLabel(station)
    ptSheet.getCell(r, 3).font = { size: 9, color: { argb: 'FF6B7280' } }
    // A pole ring carries no moment in any direction, so the plane contains it entirely. Its
    // largest radius over all configured directions is written as an engine value in column K; the pole
    // test is then a scalar comparison against Mtol (no MAX(SQRT(array)), which Excel rejects).
    const ringRmax = Math.max(
      ...Array.from({ length: directionCount }, (_unused, direction) => {
        const sample = surfaceAt.get(`${direction}:${index}`)
        return sample ? Math.hypot(sample.Mx, sample.My) / 1e6 : 0
      })
    )
    ptSheet.getCell(r, 11).value = ringRmax
    ptSheet.getCell(r, 11).numFmt = '#,##0.000'
    ptSheet.getCell(r, 11).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CONST_FILL } }
    const poleP = `MxMy_FixedP!$${col(MM_P_COL + index)}$${MM_FIRST}`
    const isPole = `$K${r}<=Mtol`

    ptSheet.getCell(r, 4).value = { formula: `IF(${isPole},0,SUMPRODUCT(${plus}))` }
    ptSheet.getCell(r, 5).value = {
      formula: `IF(${isPole},${poleP},IF(D${r}=0,"",SUMPRODUCT(${plus},${pq})/D${r}))`
    }
    ptSheet.getCell(r, 6).value = {
      formula: `IF(${isPole},0,IF(D${r}=0,"",SUMPRODUCT(${plus},${mq})/D${r}))`
    }
    ptSheet.getCell(r, 7).value = { formula: `IF(${isPole},0,SUMPRODUCT(${minus}))` }
    ptSheet.getCell(r, 8).value = {
      formula: `IF(${isPole},${poleP},IF(G${r}=0,"",SUMPRODUCT(${minus},${pq})/G${r}))`
    }
    ptSheet.getCell(r, 9).value = {
      formula: `IF(${isPole},0,IF(G${r}=0,"",SUMPRODUCT(${minus},${mq})/G${r}))`
    }
    ptSheet.getCell(r, 10).value = {
      formula: `IF(${isPole},"pole",IF(AND(D${r}>=1,G${r}>=1),"ok","CHECK: "&D${r}&"/"&G${r}&" cuts"))`
    }
    ptSheet.getCell(r, 4).numFmt = '0'
    ptSheet.getCell(r, 7).numFmt = '0'
    for (const c of [5, 6, 8, 9]) ptSheet.getCell(r, c).numFmt = '#,##0.00'
  })

  const ptLast = PT_FIRST + stationCount - 1
  const ptP = `$E$${PT_FIRST}:$E$${ptLast}`
  const ptM = `$F$${PT_FIRST}:$F$${ptLast}`
  const ptDemand = ptLast + 2
  sectionHeading(ptSheet, ptDemand, 'Demand on the +M branch', 8)
  const kRow = ptDemand + 3
  const tRow = ptDemand + 4
  const mbRow = ptDemand + 5
  const denom = `(INDEX(${ptP},C${kRow}+1,1)-INDEX(${ptP},C${kRow},1))`
  const ptRows: Array<[string, string, string]> = [
    ['Pu (kN)', 'Pu', '#,##0.00'],
    ['Mu in the θ_L direction (kN·m)', 'Mu', '#,##0.00'],
    ['bracketing station k', `MAX(1,MIN(${stationCount - 1},SUMPRODUCT(--(${ptP}>=Pu))))`, '0'],
    // Consecutive stations can share the same P (the two poles, or a compression plateau), which
    // would make the chord vertical. Fall back to the lower station instead of dividing by zero.
    ['t', `IF(${denom}=0,0,(Pu-INDEX(${ptP},C${kRow},1))/${denom})`, '0.0000'],
    [
      'Mb from this section (kN·m)',
      `INDEX(${ptM},C${kRow},1)+C${tRow}*(INDEX(${ptM},C${kRow}+1,1)-INDEX(${ptM},C${kRow},1))`,
      '#,##0.00'
    ],
    ['Mb from the fixed-P ray query (kN·m)', 'Mb', '#,##0.00'],
    ['Mb from the engine triangle mesh (kN·m)', engineMb === null ? '"no crossing"' : String(engineMb), '#,##0.00'],
    [
      'spread over the three routes (%)',
      `IF(NOT(ISNUMBER(Mb)),"n/a",(MAX(C${mbRow},Mb,C${mbRow + 2})-MIN(C${mbRow},Mb,C${mbRow + 2}))/MAX(C${mbRow},Mb,C${mbRow + 2})*100)`,
      '0.0000'
    ],
    [
      'verdict',
      `IF(NOT(ISNUMBER(C${mbRow + 3})),"n/a",IF(C${mbRow + 3}<=0.5,"ok - within the configured direction-grid spread","CHECK - routes disagree beyond the sampling spread"))`,
      '@'
    ],
    ['Mu / Mb  (fixed-axial moment ratio)', `IF(C${mbRow}<=0,"n/a",Mu/C${mbRow})`, '0.0000']
  ]
  ptRows.forEach(([label, formula, numberFormat], index) => {
    const r = ptDemand + 1 + index
    ptSheet.getCell(r, 2).value = label
    const cell = ptSheet.getCell(r, 3)
    cell.value = { formula }
    cell.numFmt = numberFormat
    cell.font = { bold: index >= ptRows.length - 2 }
  })
  ptSheet.getCell(ptDemand + ptRows.length + 2, 2).value =
    `Three independent readings of the same ${directionCount}x${stationCount} samples: the plane cut of the station rings, the ray on the P = Pu contour, and the engine triangle mesh. Their spread is direction-sampling error, not formula error.`
  ptSheet.getCell(ptDemand + ptRows.length + 2, 2).font = { italic: true, color: { argb: 'FF6B7280' } }
  ptSheet.mergeCells(ptDemand + ptRows.length + 2, 2, ptDemand + ptRows.length + 2, 10)

  // ==========================================================================
  // Equilibrium — verify the converged inverse state, do not re-solve it
  // ==========================================================================
  if (equilibrium) {
    const eqSheet = workbook.addWorksheet('Equilibrium', { views: [{ showGridLines: false }] })
    eqSheet.columns = [{ width: 4 }, { width: 34 }, { width: 18 }, { width: 12 }, { width: 66 }]
    title(eqSheet, 1, 'EQUILIBRIUM CHECK OF THE CONVERGED STRAIN PLANE', 4)
    eqSheet.getCell('B2').value =
      'Newton-Raphson needs the tangent modulus d(σ)/d(ε). A material given only as points has no closed-form derivative, so the iteration and its Jacobian belong to the program. The workbook does the part a reviewer actually needs: take the converged plane as given and prove by formula that it is in equilibrium with the demand.'
    eqSheet.getCell('B2').alignment = { wrapText: true, vertical: 'top' }
    eqSheet.mergeCells('B2:E4')
    eqSheet.getRow(2).height = 16

    let eqRow = 6
    sectionHeading(eqSheet, eqRow, 'Converged strain plane — engine values', 4)
    const eqInputs: Array<[string, number, string, string, string]> = [
      ['ε₀', equilibrium.e0, '-', 'Eq_e0', 'strain at the analysis origin'],
      ['κx', equilibrium.kx, '1/mm', 'Eq_kx', 'curvature about x'],
      ['κy', equilibrium.ky, '1/mm', 'Eq_ky', 'curvature about y']
    ]
    eqInputs.forEach(([label, value, unit, name, note], index) => {
      const r = eqRow + 1 + index
      eqSheet.getCell(r, 2).value = label
      const cell = eqSheet.getCell(r, 3)
      cell.value = value
      cell.numFmt = '0.000000000E+00'
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CONST_FILL } }
      cell.border = { top: { style: 'hair' }, left: { style: 'hair' }, bottom: { style: 'hair' }, right: { style: 'hair' } }
      eqSheet.getCell(r, 4).value = unit
      eqSheet.getCell(r, 5).value = note
      eqSheet.getCell(r, 5).font = { italic: true, color: { argb: 'FF6B7280' } }
      defineName(`Equilibrium!$C$${r}`, name)
    })
    eqRow += 5
    const equilibriumBetaRow = eqRow
    eqSheet.getCell(equilibriumBetaRow, 2).value = 'strain direction βeq = atan2(κy, κx)'
    eqSheet.getCell(equilibriumBetaRow, 3).value = {
      formula: 'MOD(DEGREES(ATAN2(Eq_kx,Eq_ky)),360)'
    }
    eqSheet.getCell(equilibriumBetaRow, 3).numFmt = '#,##0.0000'
    eqSheet.getCell(equilibriumBetaRow, 4).value = 'deg'
    eqSheet.getCell(equilibriumBetaRow, 5).value = {
      formula: '"β on Input is "&TEXT(beta,"0.0000")&" deg — the detail sheets audit this strain direction"'
    }
    eqSheet.getCell(equilibriumBetaRow, 5).font = {
      italic: true,
      color: { argb: 'FF6B7280' }
    }

    const equilibriumNaRow = equilibriumBetaRow + 1
    eqSheet.getCell(equilibriumNaRow, 2).value = 'N.A. axis αNA (section x-y)'
    eqSheet.getCell(equilibriumNaRow, 3).value = {
      formula: 'MOD(DEGREES(ATAN2(-Eq_kx,Eq_ky)),180)'
    }
    eqSheet.getCell(equilibriumNaRow, 3).numFmt = '#,##0.0000'
    eqSheet.getCell(equilibriumNaRow, 4).value = 'deg'
    eqSheet.getCell(equilibriumNaRow, 5).value = 'tangent (-κx,κy) to the actual ε = 0 line'
    eqSheet.getCell(equilibriumNaRow, 5).font = { italic: true, color: { argb: 'FF6B7280' } }

    const equilibriumPerpendicularRow = equilibriumNaRow + 1
    eqSheet.getCell(equilibriumPerpendicularRow, 2).value = 'reference axis α⊥ = ⊥Rₘ'
    eqSheet.getCell(equilibriumPerpendicularRow, 3).value = {
      formula: 'IF(AND(Mux=0,Muy=0),0,MOD(DEGREES(ATAN2(-Mux,Muy)),180))'
    }
    eqSheet.getCell(equilibriumPerpendicularRow, 3).numFmt = '#,##0.0000'
    eqSheet.getCell(equilibriumPerpendicularRow, 4).value = 'deg'
    eqSheet.getCell(equilibriumPerpendicularRow, 5).value =
      'reference tangent (-Mux,Muy), perpendicular to Rₘ = (Muy,Mux)'
    eqSheet.getCell(equilibriumPerpendicularRow, 5).font = {
      italic: true,
      color: { argb: 'FF6B7280' }
    }

    const equilibriumDeltaRow = equilibriumPerpendicularRow + 1
    eqSheet.getCell(equilibriumDeltaRow, 2).value = 'angular deviation Δα'
    eqSheet.getCell(equilibriumDeltaRow, 3).value = {
      formula:
        `MIN(ABS(C${equilibriumNaRow}-C${equilibriumPerpendicularRow}),` +
        `180-ABS(C${equilibriumNaRow}-C${equilibriumPerpendicularRow}))`
    }
    eqSheet.getCell(equilibriumDeltaRow, 3).numFmt = '#,##0.0000'
    eqSheet.getCell(equilibriumDeltaRow, 4).value = 'deg'
    eqSheet.getCell(equilibriumDeltaRow, 5).value =
      'smallest angle between the actual N.A. and the perpendicular reference axis'
    eqSheet.getCell(equilibriumDeltaRow, 5).font = {
      italic: true,
      color: { argb: 'FF6B7280' }
    }

    eqRow = equilibriumDeltaRow + 2
    sectionHeading(eqSheet, eqRow, 'Section response at that plane — formulas', 4)
    const concEqSig = `Concrete!$L$${CONC_FIRST}:$L$${concLastRow}`
    const responses: Array<[string, string, string]> = [
      ['Concrete P (kN)', `SUMPRODUCT(${concEqSig},Mesh_A)/1000`, '#,##0.00'],
      ['Concrete Mx (kN·m)', `SUMPRODUCT(${concEqSig},Mesh_A,Mesh_Y)/1000000`, '#,##0.00'],
      ['Concrete My (kN·m)', `SUMPRODUCT(${concEqSig},Mesh_A,Mesh_X)/1000000`, '#,##0.00'],
      ['Steel P (kN)', `Steel!${col(EQ_STEEL_COL + 4)}${STEEL_SUM}/1000`, '#,##0.00'],
      ['Steel Mx (kN·m)', `Steel!${col(EQ_STEEL_COL + 5)}${STEEL_SUM}/1000000`, '#,##0.00'],
      ['Steel My (kN·m)', `Steel!${col(EQ_STEEL_COL + 6)}${STEEL_SUM}/1000000`, '#,##0.00']
    ]
    const responseFirst = eqRow + 1
    responses.forEach(([label, formula, numberFormat], index) => {
      const r = responseFirst + index
      eqSheet.getCell(r, 2).value = label
      eqSheet.getCell(r, 3).value = { formula }
      eqSheet.getCell(r, 3).numFmt = numberFormat
    })

    eqRow = responseFirst + responses.length + 1
    sectionHeading(eqSheet, eqRow, 'Residual against the demand', 4)
    const totals: Array<[string, string, string]> = [
      ['P total (kN)', `C${responseFirst}+C${responseFirst + 3}`, '#,##0.00'],
      ['Mx total (kN·m)', `C${responseFirst + 1}+C${responseFirst + 4}`, '#,##0.00'],
      ['My total (kN·m)', `C${responseFirst + 2}+C${responseFirst + 5}`, '#,##0.00'],
      ['Pu demand (kN)', 'Pu', '#,##0.00'],
      ['Mux demand (kN·m)', 'Mux', '#,##0.00'],
      ['Muy demand (kN·m)', 'Muy', '#,##0.00']
    ]
    const totalFirst = eqRow + 1
    totals.forEach(([label, formula, numberFormat], index) => {
      const r = totalFirst + index
      eqSheet.getCell(r, 2).value = label
      eqSheet.getCell(r, 3).value = { formula }
      eqSheet.getCell(r, 3).numFmt = numberFormat
      eqSheet.getCell(r, 3).font = { bold: index < 3 }
    })
    const residualFirst = totalFirst + totals.length + 1
    const residuals: Array<[string, string]> = [
      ['residual P (kN)', `C${totalFirst}-C${totalFirst + 3}`],
      ['residual Mx (kN·m)', `C${totalFirst + 1}-C${totalFirst + 4}`],
      ['residual My (kN·m)', `C${totalFirst + 2}-C${totalFirst + 5}`]
    ]
    residuals.forEach(([label, formula], index) => {
      const r = residualFirst + index
      eqSheet.getCell(r, 2).value = label
      eqSheet.getCell(r, 3).value = { formula }
      eqSheet.getCell(r, 3).numFmt = '#,##0.0000'
    })
    const normRow = residualFirst + residuals.length
    eqSheet.getCell(normRow, 2).value = 'relative residual'
    eqSheet.getCell(normRow, 3).value = {
      formula:
        `MAX(ABS(C${residualFirst})/MAX(ABS(Pu),1),ABS(C${residualFirst + 1})/MAX(ABS(Mux),1),` +
        `ABS(C${residualFirst + 2})/MAX(ABS(Muy),1))`
    }
    eqSheet.getCell(normRow, 3).numFmt = '0.00E+00'
    eqSheet.getCell(normRow + 1, 2).value = 'verdict'
    eqSheet.getCell(normRow + 1, 3).value = {
      formula: `IF(C${normRow}<=0.0001,"in equilibrium","CHECK - the stored plane does not balance the demand")`
    }
    eqSheet.getCell(normRow + 1, 3).font = { bold: true }
    eqSheet.getCell(normRow + 1, 5).value =
      'The fibre and bar columns behind these sums are on Concrete (K, L) and Steel (right-hand block), so the residual can be traced term by term for any material law.'
    eqSheet.getCell(normRow + 1, 5).font = { italic: true, color: { argb: 'FF6B7280' } }
  }

  return workbook
}

export const exportSectionWorkbook = async (input: ExcelExportInput) => {
  const workbook = await buildSectionWorkbook(input)
  const buffer = await workbook.xlsx.writeBuffer()
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  })
}

export const sectionWorkbookFileName = (input: Pick<ExcelExportInput, 'projectName' | 'betaDeg' | 'loadcase'>) => {
  const stem =
    (input.projectName || 'pm-section')
      .trim()
      .replace(/[^\w]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48) || 'pm-section'
  const loadcase = input.loadcase ? `-LC${input.loadcase.id}` : ''
  return `${stem}${loadcase}-beta${Math.round(input.betaDeg)}.xlsx`
}

