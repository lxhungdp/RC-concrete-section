import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { checkLoadcaseUtilizationFromSurface, buildDesignPreviewSurface } from '@pm/analysis'
import { buildEquivalentBlockPreviewSurface } from '@pm/analysis-equivalent-block'
import { geometryInputRebars, sectionGeometryFromGeometryInput } from '@pm/geometry'
import {
  analysisMeshKernelOptions,
  createDefaultProjectInformation,
  createLoadCombination,
  parseProjectDocument,
  type EquivalentBlockProfileId
} from '@pm/project'
import { buildDemandCheckWorkbook } from '../src/excel/demand-check'
import { buildEquivalentBlockWorkbook } from '../src/excel/equivalent-block'
import { buildColumnReportModel } from '../src/model/report-model'
import { renderColumnReport } from '../src/pdf/column-report'
import { near, recalculate } from './support/recalculate'

const fixture = (file: string) => {
  const parsed = parseProjectDocument(readFileSync(file, 'utf8'))
  assert.ok(parsed.ok)
  const { geometry, materials, analysis, design, calculationProfileId } = parsed.document.inputs
  const section = sectionGeometryFromGeometryInput(geometry)
  const rebars = geometryInputRebars(geometry)
  const surface = analysis.methodId === 'strain-domain-surface-v1'
    ? buildDesignPreviewSurface(section, rebars, materials, design, analysisMeshKernelOptions(analysis), analysis)
    : buildEquivalentBlockPreviewSurface(calculationProfileId as EquivalentBlockProfileId, section, rebars, materials, design, analysis)
  const P = surface.bounds.P[0] + 0.6 * (surface.bounds.P[1] - surface.bounds.P[0])
  const held = checkLoadcaseUtilizationFromSurface(surface, createLoadCombination({ id: 1, name: 'Seed', P, Mx: 3e6, My: 1e6 }), 'constantAxial')
  assert.ok(held.capacityPoint)
  const loadcase = createLoadCombination({ id: 1, name: 'Constant P', P, Mx: held.capacityPoint.Mx * 0.7, My: held.capacityPoint.My * 0.7 })
  return { projectName: 'Constant-P report', projectInformation: createDefaultProjectInformation(), sectionName: section.name,
    calculationProfileId, section, rebars, materialStore: materials, designBasis: design, analysisOptions: analysis, surface,
    loadcases: [loadcase], detailLoadcaseIds: [1], P, expected: checkLoadcaseUtilizationFromSurface(surface, loadcase, 'constantAxial') }
}

for (const checkBasis of ['constantAxial', 'proportional3D'] as const) {
  test(`ENG-REP-002 CP-A03: standalone block equilibrium reconciles under ${checkBasis}`, async () => {
    const f = fixture('docs/examples/equivalent-block/ACI-EB-03-l-shape-8-bars.pm-project.json')
    assert.equal(f.analysisOptions.methodId, 'equivalent-block-surface-v1')
    if (f.analysisOptions.methodId !== 'equivalent-block-surface-v1') throw Error('Invalid fixture')
    const book = await buildEquivalentBlockWorkbook({ ...f, calculationProfileId: f.calculationProfileId as EquivalentBlockProfileId,
      analysisOptions: f.analysisOptions, loadcase: f.loadcases[0], thetaDeg: 0, fixedP: f.P, checkBasis })
    const checked = await recalculate(book)
    try {
      const sheet = checked.loaded.getWorksheet('Equilibrium')!
      const rowFor = (label: string) => {
        const row = Array.from({ length: sheet.rowCount }, (_, i) => i + 1).find(r => sheet.getCell(r, 2).value === label)
        assert.ok(row, label); return row
      }
      const pRow = rowFor('P capacity residual'), relative = rowFor('relative residual')
      if (checkBasis === 'constantAxial') assert.ok(!sheet.getCell(pRow, 3).formula.includes('*Pu'))
      assert.ok(Math.abs(Number(checked.value('Equilibrium', `C${pRow}`))) < 1e-5)
      assert.ok(Number(checked.value('Equilibrium', `C${relative}`)) <= 1e-8)
      assert.ok(!String(checked.value('Equilibrium', `E${relative}`)).startsWith('CHECK'))
    } finally { checked.engine.destroy() }
  })
}

for (const file of [
  'docs/examples/realistic-sections/KDS-REAL-05-complex-stress-strain.pm-project.json',
  'docs/examples/equivalent-block/ACI-EB-03-l-shape-8-bars.pm-project.json'
]) {
  test(`ENG-REP-002: the demand workbook states the basis and recalculates independently: ${file}`, async () => {
    const f = fixture(file)
    const book = await buildDemandCheckWorkbook({ ...f, checkBasis: 'constantAxial' })
    const checked = await recalculate(book)
    try {
      const cells = book.worksheets.flatMap((sheet) => {
        const values: unknown[] = []
        sheet.eachRow((row) => row.eachCell((cell) => { values.push(cell.value) }))
        return values
      })
      assert.ok(cells.includes('Constant P'))
      assert.ok(cells.includes(f.expected.utilization))
    } finally {
      checked.engine.destroy()
    }
  })

  test(`ENG-REP-001: the report model publishes the selected ratio at Pu: ${file}`, () => {
    const f = fixture(file)
    const model = buildColumnReportModel({ ...f, checkBasis: 'constantAxial' })
    assert.equal(model.checkBasis, 'constantAxial')
    const [row] = model.combinations
    assert.equal(row.checkBasis, 'constantAxial')
    assert.equal(row.utilization, f.expected.utilization)
    assert.equal(row.proportionalUtilization, f.expected.proportionalUtilization)
    const [detail] = model.details
    assert.equal(detail.interaction.loadPath, 'constant-axial')
    assert.ok(detail.interaction.capacity)
    near(detail.interaction.capacity.p, detail.interaction.demand.p)
    const pdf = Buffer.from(renderColumnReport(model, { unicodeFontBytes: new Uint8Array(readFileSync('apps/web/public/fonts/PMReportUnicode-Regular.ttf')) }))
    assert.equal(pdf.subarray(0, 5).toString('latin1'), '%PDF-')
  })

  test(`ENG-REP-001: the default report keeps its proportional wording: ${file}`, () => {
    const f = fixture(file)
    const model = buildColumnReportModel(f)
    assert.equal(model.checkBasis, 'proportional3D')
    assert.equal(model.combinations[0].checkBasis, 'proportional3D')
    assert.equal(model.combinations[0].utilization, f.expected.proportionalUtilization)
    assert.equal(model.details[0].interaction.loadPath, 'proportional')
  })
}
