import assert from 'node:assert/strict'
import test from 'node:test'
import ExcelJS from 'exceljs'
import { HyperFormula } from 'hyperformula'
import { activeDesignSurfaceDataset, activeNominalSurfaceDataset, buildDesignPreviewSurface } from '@pm/analysis'
import { buildEquivalentBlockPreviewSurface } from '@pm/analysis-equivalent-block'
import { buildResistanceMaterialSets, createKdsAppendixDesignBasis, withSteelModelModification } from '@pm/design'
import { geometryInputRebars, sectionGeometryFromGeometryInput, type GeometryInput } from '@pm/geometry'
import { createDefaultMaterialStore, type SteelMaterial } from '@pm/materials'
import {
  analysisMeshKernelOptions,
  applyCalculationProfileToMaterials,
  createAnalysisOptionsForProfile,
  createDesignBasisForCalculationProfile,
  createLoadCombination
} from '@pm/project'
import { buildChartAuditWorkbook } from '../src/excel/chart-audit'
import { buildCalculationTraceAuditWorkbook } from '../src/excel/calculation-trace-audit'
import { buildDemandCheckWorkbook } from '../src/excel/demand-check'
import { buildEquivalentBlockWorkbook } from '../src/excel/equivalent-block'

const geometry: GeometryInput = {
  id: 1,
  name: 'Mixed hardening exports',
  outers: [{
    id: 1,
    holes: [],
    points: [{ id: 1, x: -150, y: -200 }, { id: 2, x: 150, y: -200 }, { id: 3, x: 150, y: 200 }, { id: 4, x: -150, y: 200 }]
  }],
  rebars: [[-100, -150], [100, -150], [100, 150], [-100, 150], [0, -60], [0, 60]].map(([x, y], i) => ({
    id: i + 1,
    x,
    y,
    dia: 20,
    steelMaterialId: i < 4 ? 1 : 2
  }))
}
const section = sectionGeometryFromGeometryInput(geometry)
const rebars = geometryInputRebars(geometry)

type HardeningProfile = 'kds-2024-stress-strain' | 'en-1992-1-1-2004-stress-strain' | 'kds-142020-equivalent-block'

const fixture = (profile: HardeningProfile, appendix = false, plateau = false) => {
  const materials = applyCalculationProfileToMaterials(createDefaultMaterialStore(), profile)
  materials.steel = [400, 500].map((fy, i): SteelMaterial => ({
    ...materials.steel[0],
    id: i + 1,
    fy,
    limits: { epsY: fy / 200000 },
    stressStrain: {
      type: 'linear-hardening',
      epsUk: i === 0 ? 0.05 : 0.04,
      ultimateStrength: i === 0 ? { type: 'ratio', ratio: 1.1 } : { type: 'stress', stress: 575 },
      strainLimit: { type: 'factor', value: 0.9 }
    }
  }))
  if (plateau) materials.steel[0].stressStrain = { type: 'elastic-perfectly-plastic' }
  const basis = withSteelModelModification(
    appendix ? createKdsAppendixDesignBasis() : createDesignBasisForCalculationProfile(profile),
    materials
  )
  const options = createAnalysisOptionsForProfile(profile)
  const common = {
    projectName: 'Hardening export regression',
    sectionName: section.name,
    section,
    rebars,
    materialStore: materials,
    designBasis: basis
  }
  if (options.methodId === 'strain-domain-surface-v1') {
    options.mesh.sizing = { type: 'automatic', seedDivisions: 8 }
    options.directions.seed = { type: 'explicit', anglesDeg: [0, 90, 180, 270] }
  } else {
    options.directions.seedCount = 4
  }
  const surface = options.methodId === 'strain-domain-surface-v1'
    ? buildDesignPreviewSurface(section, rebars, materials, basis, analysisMeshKernelOptions(options), options)
    : buildEquivalentBlockPreviewSurface(profile, section, rebars, materials, basis, options)
  return { ...common, profile, analysisOptions: options, surface }
}

const near = (a: number, b: number, scale = 1) => {
  assert.ok(Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b), scale), `${a} versus ${b}`)
}

const stageScale = (material: SteelMaterial) => (material.factors?.resistanceScale ?? 1) / (material.factors?.gammaS ?? 1)

/** Serialize, reload and recalculate every formula independently of the stored engine results. */
const recalculate = async (book: ExcelJS.Workbook) => {
  const loaded = new ExcelJS.Workbook()
  await loaded.xlsx.load(await book.xlsx.writeBuffer() as unknown as ArrayBuffer)
  const grids: Record<string, Array<Array<string | number | boolean | null>>> = {}
  for (const sheet of loaded.worksheets) {
    grids[sheet.name] = Array.from({ length: sheet.rowCount }, (_, r) =>
      Array.from({ length: sheet.columnCount }, (_, c) => {
        const cell = sheet.getCell(r + 1, c + 1)
        if (cell.formula) return `=${cell.formula}`
        return typeof cell.value === 'string' || typeof cell.value === 'number' || typeof cell.value === 'boolean'
          ? cell.value
          : null
      }))
  }
  const engine = HyperFormula.buildFromSheets(grids, { licenseKey: 'gpl-v3', useArrayArithmetic: true, smartRounding: false })
  for (const name of loaded.definedNames.model) {
    for (const range of name.ranges) engine.addNamedExpression(name.name, `=${range}`)
  }
  const value = (sheet: string, address: string) =>
    engine.getCellValue(engine.simpleCellAddressFromString(address, engine.getSheetId(sheet)!)!)
  try {
    for (const sheet of loaded.worksheets) {
      sheet.eachRow((row) => row.eachCell((cell) => {
        if (!cell.formula) return
        const actual = value(sheet.name, cell.address)
        assert.ok(actual === null || typeof actual !== 'object', `${sheet.name}!${cell.address}: ${JSON.stringify(actual)}`)
        if (typeof actual !== 'number' || typeof cell.result !== 'number') return
        // Block ray residual caches are ideal zeros. Normalise cancellation by the demand,
        // in the same units as the residual, rather than treating an ideal zero as a load scale.
        let scale = 1
        if (String(sheet.getCell(row.number, 1).value).startsWith('Residual Δ')) {
          const target = cell.formula.match(/-([A-Za-z_][A-Za-z_0-9]*)$/)?.[1]
          assert.ok(target)
          const demand = engine.getNamedExpressionValue(target)
          assert.equal(typeof demand, 'number')
          scale = Math.abs(Number(demand))
        }
        try {
          near(actual, cell.result, scale)
        } catch (error) {
          throw new Error(`${sheet.name}!${cell.address}: ${cell.formula}`, { cause: error })
        }
      }))
    }
  } catch (error) {
    engine.destroy()
    throw error
  }
  return { loaded, engine, value }
}

for (const profile of ['kds-2024-stress-strain', 'en-1992-1-1-2004-stress-strain', 'kds-142020-equivalent-block'] as const) {
  for (const source of ['vertical', 'fixedP'] as const) {
    test(`${profile} ${source} hardening workbook independently recalculates and retains per-grade inputs`, async () => {
      const f = fixture(profile)
      const book = await buildChartAuditWorkbook({ ...f, source, resistanceStage: 'design', sliceAngleDeg: 0, fixedP: 0, loadcases: [] })
      const checked = await recalculate(book)
      try {
        const names = book.definedNames.model.map((n) => n.name)
        assert.ok(names.includes('S_1_steel_Eh') && names.includes('S_2_steel_Eh'))
        const sets = buildResistanceMaterialSets(f.materialStore, f.designBasis)
        const grade = sets.designMaterials.steel[0]
        const fy = grade.fy * stageScale(grade)
        checked.engine.changeNamedExpression('S_1_steel_peak_ratio', 1.2)
        near(Number(checked.engine.getNamedExpressionValue('S_1_steel_Eh')), (fy * 1.2 - fy) / (0.05 - fy / 200000))
        const otherBefore = checked.engine.getNamedExpressionValue('S_2_steel_Eh')
        checked.engine.changeNamedExpression('S_1_steel_eps_uk', 0.06)
        near(Number(checked.engine.getNamedExpressionValue('S_1_steel_Eh')), (fy * 1.2 - fy) / (0.06 - fy / 200000))
        assert.equal(checked.engine.getNamedExpressionValue('S_2_steel_Eh'), otherBefore)
        const second = sets.designMaterials.steel[1]
        const secondScale = stageScale(second)
        const secondFy = second.fy * secondScale
        checked.engine.changeNamedExpression('S_2_steel_fu_input', 600)
        near(
          Number(checked.engine.getNamedExpressionValue('S_2_steel_Eh')),
          (600 * secondScale - secondFy) / (0.04 - secondFy / second.elasticModulus)
        )
        checked.engine.changeNamedExpression('S_1_steel_limit_input', 0.8)
        near(Number(checked.engine.getNamedExpressionValue('S_1_steel_eps_limit')), 0.8 * 0.06)
      } finally {
        checked.engine.destroy()
      }
    })
  }

  for (const stage of ['nominal', 'design'] as const) {
    test(`${profile} ${stage} point trace uses grade-specific endpoint interpolation`, async () => {
      const f = fixture(profile)
      const dataset = stage === 'design' ? activeDesignSurfaceDataset(f.surface) : activeNominalSurfaceDataset(f.surface)
      const point = dataset.points.filter((p) => p.surfaceRole === 'physical-state' && p.stationId !== null).sort((a, b) => a.P - b.P)[0]
      assert.ok(point)
      const station = dataset.stations.find((s) => s.id === point.stationId)!
      const book = await buildCalculationTraceAuditWorkbook({
        ...f,
        calculationProfileId: profile,
        stage,
        selection: { kind: 'vertical', rowIndex: 1, criterion: station.label, angleDeg: point.beta * 180 / Math.PI },
        states: [{ key: 'selected', label: 'Hardening point', point, stationDefinition: station.definition }]
      })
      const checked = await recalculate(book)
      try {
        const sets = buildResistanceMaterialSets(f.materialStore, f.designBasis)
        const materials = stage === 'design' ? sets.designMaterials : sets.referenceMaterials
        rebars.forEach((bar, i) => {
          const m = materials.steel.find((s) => s.id === bar.steelMaterialId)!
          if (m.stressStrain.type !== 'linear-hardening') throw Error('Invalid fixture')
          const scale = stageScale(m)
          const fy = m.fy * scale
          const fu = (m.stressStrain.ultimateStrength.type === 'ratio'
            ? m.fy * m.stressStrain.ultimateStrength.ratio
            : m.stressStrain.ultimateStrength.stress) * scale
          const eps = Number(checked.value('Steel', `H${11 + i}`))
          const ey = fy / m.elasticModulus
          const expected = Math.abs(eps) <= ey
            ? m.elasticModulus * eps
            : Math.sign(eps) * (fy + (fu - fy) * (Math.abs(eps) - ey) / (m.stressStrain.epsUk - ey))
          near(Number(checked.value('Steel', `I${11 + i}`)), expected)
        })
        const directStrength = materials.steel[1]
        const scale = stageScale(directStrength)
        const fy = directStrength.fy * scale
        const ey = fy / directStrength.elasticModulus
        const yielded = rebars.findIndex((bar, i) =>
          bar.steelMaterialId === 2 && Math.abs(Number(checked.value('Steel', `H${11 + i}`))) > ey)
        assert.ok(yielded >= 0, 'The independent edit check needs a yielded bar of the direct-strength grade.')
        checked.engine.changeNamedExpression('stl_2_steel_fu_input', 600)
        const eps = Number(checked.value('Steel', `H${11 + yielded}`))
        near(
          Number(checked.value('Steel', `I${11 + yielded}`)),
          Math.sign(eps) * (fy + (600 * scale - fy) * (Math.abs(eps) - ey) / (0.04 - ey))
        )
      } finally {
        checked.engine.destroy()
      }
    })
  }
}

for (const profile of ['en-1992-1-1-2004-stress-strain', 'kds-142020-equivalent-block'] as const) {
  test(`${profile} Demand Check shared hardening formulas recalculate`, async () => {
    const f = fixture(profile)
    const loadcase = createLoadCombination({ id: 1, name: 'Mixed hardening', P: 100000, Mx: 3e7, My: 1e6 })
    const book = await buildDemandCheckWorkbook({
      ...f,
      calculationProfileId: f.profile,
      loadcases: [loadcase],
      detailLoadcaseIds: [1]
    })
    const checked = await recalculate(book)
    checked.engine.destroy()
  })
}

test('Appendix block trace uses reduced per-grade strengths exactly once', async () => {
  const f = fixture('kds-142020-equivalent-block', true)
  const dataset = activeDesignSurfaceDataset(f.surface)
  const point = dataset.points.filter((p) => p.surfaceRole === 'physical-state' && p.stationId !== null).sort((a, b) => a.P - b.P)[0]
  const station = dataset.stations.find((s) => s.id === point.stationId)!
  const book = await buildCalculationTraceAuditWorkbook({
    ...f,
    calculationProfileId: f.profile,
    stage: 'design',
    selection: { kind: 'vertical', rowIndex: 1, criterion: station.label, angleDeg: point.beta * 180 / Math.PI },
    states: [{ key: 'selected', label: 'Appendix hardening', point, stationDefinition: station.definition }]
  })
  const checked = await recalculate(book)
  try {
    near(Number(checked.engine.getNamedExpressionValue('stl_1_fy')), 360)
  } finally {
    checked.engine.destroy()
  }
})

test('mixed plateau and hardening export does not require a tangent for the plateau grade', async () => {
  const f = fixture('kds-2024-stress-strain', false, true)
  const book = await buildChartAuditWorkbook({ ...f, source: 'vertical', resistanceStage: 'design', sliceAngleDeg: 0, fixedP: 0, loadcases: [] })
  const checked = await recalculate(book)
  try {
    assert.ok(!book.definedNames.model.some((n) => n.name === 'S_1_steel_Eh'))
    assert.ok(book.definedNames.model.some((n) => n.name === 'S_2_steel_Eh'))
  } finally {
    checked.engine.destroy()
  }
})

for (const physical of [undefined, 0.02]) {
  test(`block workbook distinguishes design and physical bounds (${physical})`, async () => {
    const f = fixture('kds-142020-equivalent-block')
    if (f.analysisOptions.methodId !== 'equivalent-block-surface-v1') throw Error('Invalid fixture')
    f.materialStore.steel[0].limits = { ...f.materialStore.steel[0].limits, epsU: physical }
    const book = await buildEquivalentBlockWorkbook({
      ...f,
      calculationProfileId: 'kds-142020-equivalent-block',
      analysisOptions: f.analysisOptions,
      thetaDeg: 90,
      fixedP: 0,
      loadcase: null
    })
    const checked = await recalculate(book)
    try {
      const sheet = book.getWorksheet('Input')!
      const row = Array.from({ length: sheet.rowCount }, (_, i) => i + 1)
        .find((r) => sheet.getCell(r, 2).value === 'Active tensile strain limit')!
      assert.ok(row)
      near(Number(checked.value('Input', `C${row}`)), physical ?? 0.045)
      assert.ok(!JSON.stringify(sheet.model).includes('rupture is not enforced'))
    } finally {
      checked.engine.destroy()
    }
  })
}
