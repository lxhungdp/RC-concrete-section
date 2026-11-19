import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import ExcelJS from 'exceljs'
import { HyperFormula } from 'hyperformula'
import { geometryInputRebars, sectionGeometryFromGeometryInput } from '@pm/geometry'
import { applyCalculationProfileToMaterials, createAnalysisOptionsForProfile, createDesignBasisForCalculationProfile,
  parseProjectDocument, type AnalysisOptions, type EquivalentBlockAnalysisOptions } from '@pm/project'
import { prepareAnalysis, buildDesignPreviewSurfaceFromPrepared } from '@pm/analysis'
import { buildEquivalentBlockPreviewSurface } from '@pm/analysis-equivalent-block'
import { buildColumnReportModel } from '../src/model/report-model'
import { buildSectionWorkbook } from '../src/excel/stress-strain'
import { buildEquivalentBlockWorkbook } from '../src/excel/equivalent-block'

for (const profile of ['kds-2024-stress-strain', 'aci-318-19-22-equivalent-block'] as const) {
  test(`REBAR-AS-001/003: ${profile} report and independently recalculated workbook retain authored As`, async () => {
    const parsed = parseProjectDocument(readFileSync('docs/examples/equivalent-block/ACI-EB-01-rectangle-8-bars.pm-project.json', 'utf8'))
    assert.ok(parsed.ok)
    const inputs = parsed.document.inputs
    const section = sectionGeometryFromGeometryInput(inputs.geometry)
    const rebars = geometryInputRebars(inputs.geometry).map((bar, i) => ({ ...bar, area: 300 + i * 10,
      areaSource: { type: 'manual' as const } }))
    const materialStore = applyCalculationProfileToMaterials(inputs.materials, profile)
    const designBasis = createDesignBasisForCalculationProfile(profile)
    const options = createAnalysisOptionsForProfile(profile)
    const isBlock = profile === 'aci-318-19-22-equivalent-block'
    const common = { projectName: 'Stored-area oracle', projectInformation: parsed.document.meta.information,
      sectionName: section.name, section, rebars, materialStore, designBasis,
      fixedP: 0, loadcase: null }
    const workbook = isBlock
      ? await buildEquivalentBlockWorkbook({ ...common, calculationProfileId: profile,
          analysisOptions: options as EquivalentBlockAnalysisOptions, thetaDeg: 15 })
      : await buildSectionWorkbook({ ...common, analysisOptions: options as AnalysisOptions, betaDeg: 15 })
    const readBack = new ExcelJS.Workbook()
    await readBack.xlsx.load(new Uint8Array(await workbook.xlsx.writeBuffer()).buffer)
    const geometry = readBack.getWorksheet('Geometry')!
    const areaColumn = isBlock ? 7 : 6
    const areaRows: number[] = []
    geometry.eachRow((row, index) => {
      if (row.getCell(isBlock ? 9 : 8).text === 'Manual') {
        areaRows.push(index)
        assert.equal(row.getCell(areaColumn).value, rebars[areaRows.length - 1].area, 'As is an input constant, never a diameter formula')
      }
    })
    assert.equal(areaRows.length, rebars.length)
    const sheets: Record<string, Array<Array<string | number | boolean | null>>> = {}
    for (const sheet of readBack.worksheets) {
      sheets[sheet.name] = Array.from({ length: sheet.rowCount }, (_, r) =>
        Array.from({ length: sheet.columnCount }, (_, c) => {
          const value = sheet.getCell(r + 1, c + 1).value
          if (value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value ?? null
          return 'formula' in value ? `=${value.formula}` : null
        }))
    }
    const engine = HyperFormula.buildFromSheets(sheets, { licenseKey: 'gpl-v3', useArrayArithmetic: true, smartRounding: false })
    try {
      for (const entry of readBack.definedNames.model) for (const range of entry.ranges) engine.addNamedExpression(entry.name, `=${range}`)
      const id = engine.getSheetId('PM_Angle')!
      const pm = readBack.getWorksheet('PM_Angle')!
      const headerColumns: number[] = []
      pm.getRow(5).eachCell((cell, col) => { if (cell.text === 'P (kN)') headerColumns.push(col) })
      // The standard workbook checks cover every station. Here an independent pure-tension
      // pole checks the new stored-area path without borrowing a kernel resultant.
      if (isBlock) {
        const steelId = engine.getSheetId('Steel')!
        const saturatedTension = engine.getSheetValues(steelId).slice(5).filter(row =>
          row[2] === 1 && row[8] === -materialStore.steel[0].fy && row[10] === 0)
        assert.ok(saturatedTension.length > 0)
        for (const row of saturatedTension) assert.equal(row[12], -materialStore.steel[0].fy * rebars[0].area / 1000)
      } else {
        const expected = -rebars.reduce((sum, bar) => sum + materialStore.steel[0].fy * bar.area, 0) / 1000
        const totalColumn = headerColumns[2]
        assert.ok(totalColumn > 0)
        const forces = engine.getSheetValues(id).slice(6).map(row => row[totalColumn - 1]).filter((v): v is number => typeof v === 'number')
        assert.ok(forces.some(value => Math.abs(value - expected) <= 1e-9 * Math.max(1, Math.abs(expected))), 'tension pole equals -sum(fy*stored As)')
      }
    } finally { engine.destroy() }
    const surface = isBlock
      ? buildEquivalentBlockPreviewSurface(profile, section, rebars, materialStore, designBasis, options as EquivalentBlockAnalysisOptions)
      : buildDesignPreviewSurfaceFromPrepared(prepareAnalysis(section, rebars, materialStore), materialStore, designBasis, options as AnalysisOptions)
    const model = buildColumnReportModel({ ...common, calculationProfileId: profile, analysisOptions: options,
      surface, loadcases: [], detailLoadcaseIds: [] })
    assert.deepEqual(model.barSchedule.map(row => Number(row[5])), rebars.map(bar => bar.area))
    assert.ok(model.barSchedule.every(row => row[7] === 'Manual'))
    assert.deepEqual(model.drawing.bars.map(bar => bar.dia), rebars.map(bar => bar.dia))
  })
}
