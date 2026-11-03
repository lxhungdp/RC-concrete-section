import assert from 'node:assert/strict'
import test from 'node:test'
import ExcelJS from 'exceljs'
import { HyperFormula } from 'hyperformula'
import { geometryInputRebars, sectionGeometryFromGeometryInput, type GeometryInput } from '@pm/geometry'
import { compileSteelMaterial, createDefaultMaterialStore } from '@pm/materials'
import { buildResistanceMaterialSets, withSteelModelModification } from '@pm/design'
import { applyCalculationProfileToMaterials, createAnalysisOptionsForProfile, createDesignBasisForCalculationProfile } from '@pm/project'
import { buildSectionWorkbook } from '../src/excel/stress-strain'
import { buildEquivalentBlockWorkbook } from '../src/excel/equivalent-block'

const geometry: GeometryInput = {
  id: 1, name: 'Hardening workbook',
  outers: [{ id: 1, holes: [], points: [{ id: 1, x: -150, y: -200 }, { id: 2, x: 150, y: -200 }, { id: 3, x: 150, y: 200 }, { id: 4, x: -150, y: 200 }] }],
  rebars: [[-100, -150], [100, -150], [100, 150], [-100, 150], [0, -60], [0, 60]].map(([x, y], index) => ({ id: index + 1, x, y, dia: 20, steelMaterialId: index < 4 ? 1 : 2 }))
}
const section = sectionGeometryFromGeometryInput(geometry)
const rebars = geometryInputRebars(geometry)

const recalculate = (book: ExcelJS.Workbook) => {
  const sheets: Record<string, Array<Array<string | number | boolean | null>>> = {}
  for (const sheet of book.worksheets) {
    sheets[sheet.name] = Array.from({ length: sheet.rowCount }, (_, row) => Array.from({ length: sheet.columnCount }, (_, column) => {
      const cell = sheet.getCell(row + 1, column + 1)
      if (cell.formula) return `=${cell.formula}`
      const value = cell.value
      return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? value : null
    }))
  }
  const engine = HyperFormula.buildFromSheets(sheets, { licenseKey: 'gpl-v3', useArrayArithmetic: true, smartRounding: false })
  for (const entry of book.definedNames.model) for (const range of entry.ranges) engine.addNamedExpression(entry.name, `=${range}`)
  return {
    named: (name: string) => engine.getNamedExpressionValue(name),
    setNamed: (name: string, value: number) => {
      const range = book.definedNames.model.find((entry) => entry.name === name)?.ranges[0]
      assert.ok(range, `Missing named input ${name}.`)
      const [sheetName, address] = range.split('!')
      const sheet = book.getWorksheet(sheetName.replace(/^'|'$/g, ''))
      assert.ok(sheet)
      const cell = sheet.getCell(address.replaceAll('$', ''))
      const sheetId = engine.getSheetId(sheet.name)
      assert.notEqual(sheetId, undefined)
      if (sheetId === undefined) throw new Error('Missing calculation sheet.')
      engine.setCellContents({ sheet: sheetId, row: Number(cell.row) - 1, col: Number(cell.col) - 1 }, [[value]])
    },
    value: (sheet: string, row: number, col: number) => {
      const id = engine.getSheetId(sheet)
      if (id === undefined) throw new Error(`Missing sheet ${sheet}.`)
      return engine.getCellValue({ sheet: id, row: row - 1, col: col - 1 })
    },
    destroy: () => engine.destroy()
  }
}

test('a single-grade EN workbook independently recalculates the endpoint tangent after an input edit', async () => {
  const profileId = 'en-1992-1-1-2004-stress-strain'
  const materials = applyCalculationProfileToMaterials(createDefaultMaterialStore(), profileId)
  materials.steel[0] = { ...materials.steel[0], fy: 500,
    stressStrain: { type: 'linear-hardening', ultimateStrength: { type: 'ratio', ratio: 1.1 }, epsUk: 0.05, strainLimit: { type: 'factor', value: 0.9 } } }
  const options = createAnalysisOptionsForProfile(profileId)
  if (options.methodId !== 'strain-domain-surface-v1') throw new Error('Invalid fixture mechanics.')
  const book = await buildSectionWorkbook({ projectName: 'EN interpolation oracle', sectionName: section.name, section,
    rebars: rebars.map((bar) => ({ ...bar, steelMaterialId: 1 })), materialStore: materials,
    designBasis: createDesignBasisForCalculationProfile(profileId), analysisOptions: options,
    betaDeg: 0, fixedP: 0, loadcase: null, maxMeshPoints: 96 })
  const engine = recalculate(book)
  const fy = Number(engine.named('fy'))
  assert.ok(Math.abs(fy - 500 / 1.15) < 1e-10)
  assert.ok(Math.abs(Number(engine.named('steel_Eh')) - (550 / 1.15 - fy) / (0.05 - fy / 200000)) < 1e-9)
  engine.setNamed('steel_peak_ratio', 1.2)
  assert.ok(Math.abs(Number(engine.named('steel_Eh')) - (600 / 1.15 - fy) / (0.05 - fy / 200000)) < 1e-9)
  engine.destroy()
})

for (const profileId of ['kds-2024-stress-strain', 'kds-142020-equivalent-block', 'en-1992-1-1-2004-stress-strain'] as const) {
  test(`${profileId} mixed-grade workbook formulas use each bar's actual hardening law`, async () => {
    const materials = applyCalculationProfileToMaterials(createDefaultMaterialStore(), profileId)
    materials.steel = [400, 500].map((fy, index) => ({ ...materials.steel[0], id: index + 1, fy,
      limits: { epsY: fy / 200000 },
      stressStrain: { type: 'linear-hardening', ultimateStrength: { type: 'ratio', ratio: 1.1 + index * 0.05 }, epsUk: 0.05,
        strainLimit: { type: 'absolute', value: 0.04 - index * 0.01 } } }))
    const basis = withSteelModelModification(createDesignBasisForCalculationProfile(profileId), materials)
    const stageSteel = buildResistanceMaterialSets(materials, basis).stateMaterials.steel
    const options = createAnalysisOptionsForProfile(profileId)
    const common = { projectName: 'Hardening ledger', sectionName: section.name, section, rebars, materialStore: materials,
      designBasis: basis, betaDeg: 15, fixedP: 0, loadcase: null }
    const book = options.methodId === 'strain-domain-surface-v1'
      ? await buildSectionWorkbook({ ...common, analysisOptions: options, maxMeshPoints: 96 })
      : await buildEquivalentBlockWorkbook({ ...common, calculationProfileId: 'kds-142020-equivalent-block', thetaDeg: 15, analysisOptions: options })
    const engine = recalculate(book)
    const sheet = book.getWorksheet('Steel')
    assert.ok(sheet)
    let checked = 0
    const hardeningGrades = new Set<number>()
    if (options.methodId === 'strain-domain-surface-v1') {
      for (let index = 0; index < rebars.length; index += 1) {
        const material = stageSteel[index < 4 ? 0 : 1]
        const law = compileSteelMaterial(material)
        for (let column = 6; column + 6 <= sheet.columnCount; column += 7) {
          const strain = engine.value('Steel', index + 7, column)
          const stress = engine.value('Steel', index + 7, column + 1)
          if (strain === null) continue
          assert.equal(typeof strain, 'number', String(strain))
          assert.equal(typeof stress, 'number', String(stress))
          const expected = law.stress(Number(strain))
          if (Math.abs(Number(strain)) > material.fy / material.elasticModulus) hardeningGrades.add(material.id)
          assert.ok(Math.abs(Number(stress) - expected) < 1e-8, `${index}/${column}: ${stress} vs ${expected}`)
          checked += 1
        }
      }
    } else {
      for (let row = 6; row <= sheet.rowCount; row += 1) {
        const no = engine.value('Steel', row, 3)
        if (typeof no !== 'number' || no < 1 || no > rebars.length) continue
        const strain = engine.value('Steel', row, 7)
        const stress = engine.value('Steel', row, 9)
        const definition = stageSteel[no <= 4 ? 0 : 1]
        const expected = compileSteelMaterial(definition).stress(Number(strain))
        if (Math.abs(Number(strain)) > definition.fy / definition.elasticModulus) hardeningGrades.add(definition.id)
        assert.ok(typeof stress === 'number' && Math.abs(stress - expected) < 1e-8, `${row}: ${stress} vs ${expected}`)
        checked += 1
      }
    }
    assert.ok(checked > rebars.length, 'Every available bar/station row is recalculated, including collapsed material-limit stations.')
    assert.equal(hardeningGrades.size, 2, 'Both grades must exercise their post-yield branch in the workbook.')
    engine.destroy()
  })
}
