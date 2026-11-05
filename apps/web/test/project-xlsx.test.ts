import assert from 'node:assert/strict'
import test from 'node:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import ExcelJS from 'exceljs'
import {
  applyCalculationProfileToMaterials, createAnalysisOptionsForProfile, createEmptyProjectDocument,
  createAdaptiveAnalysisOptions, createAdaptiveEquivalentBlockAnalysisOptions,
  createProjectDocument, parseProjectDocument, type PmProjectDocument
} from '@pm/project'
import { createDefaultMaterialStore } from '@pm/materials'
import { createEmptyGeometryInput } from '@pm/geometry'
import { UNIT_PRESETS } from '@pm/units'
import { buildProjectWorkbook, importProjectWorkbook, projectWorkbookFileName } from '../features/section-editor/project/project-xlsx'

const buffer = (bytes: Uint8Array) => new Uint8Array(bytes).buffer
const canonical = (raw: unknown): PmProjectDocument => {
  const result = parseProjectDocument(raw)
  assert.ok(result.ok, result.ok ? '' : result.error)
  return result.document
}
const readBook = async (project: PmProjectDocument) => {
  const book = new ExcelJS.Workbook()
  await book.xlsx.load(buffer(await buildProjectWorkbook(project)))
  return book
}
const importBook = async (book: ExcelJS.Workbook) => importProjectWorkbook(buffer(new Uint8Array(await book.xlsx.writeBuffer())))
const example = () => canonical(JSON.parse(readFileSync('docs/examples/realistic-sections/KDS-REAL-05-complex-stress-strain.pm-project.json', 'utf8')))
const marker = (book: ExcelJS.Workbook, sheetName: string, keyword: string, id?: number) => {
  const ws = book.getWorksheet(sheetName)!
  for (let row = 1; row <= ws.rowCount; row++) {
    const value = ws.getCell(row, 1).value
    if (['OUTER', 'HOLE'].includes(keyword)) {
      if (typeof value === 'string' && (id === undefined ? value.toUpperCase().startsWith(`${keyword} #`) : value.toUpperCase() === `${keyword} #${id}`)) return row
    } else if (value === keyword && (id === undefined || ws.getCell(row, 2).value === id)) return row
  }
  throw new Error(`${sheetName}: missing ${keyword} ${id ?? ''}`)
}
const field = (book: ExcelJS.Workbook, sheetName: string, key: string, keyword?: string, id?: number) => {
  const ws = book.getWorksheet(sheetName)!
  const start = keyword ? marker(book, sheetName, keyword, id) + 2 : 1
  for (let i = start; i <= ws.rowCount; i++) {
    if (ws.getCell(i, 1).value === key) return ws.getCell(i, 2)
    if (keyword && i > start && ['CONCRETE', 'STEEL', 'CONCRETE_CURVE', 'STEEL_CURVE'].includes(String(ws.getCell(i, 1).value))) break
  }
  throw new Error(`${sheetName}: missing ${key}`)
}
const dataCell = (book: ExcelJS.Workbook, sheetName: string, keyword: string, column: number, offset = 0) =>
  book.getWorksheet(sheetName)!.getCell(marker(book, sheetName, keyword) + 2 + offset, column)
const assertImported = async (book: ExcelJS.Workbook) => {
  const result = await importBook(book)
  assert.ok(result.ok, result.ok ? '' : `${result.code}: ${result.error}`)
  return result.document
}

test('hardening strength, cutoff and KDS modification round-trip in metric and US input workbooks', async () => {
  const project = example()
  project.inputs.materials.steel[0].stressStrain = {
    type: 'linear-hardening', ultimateStrength: { type: 'stress', stress: 550 }, epsUk: 0.05,
    strainLimit: { type: 'absolute', value: 0.04 }
  }
  const canonicalProject = canonical(project)
  for (const units of [UNIT_PRESETS.metric, UNIT_PRESETS.us]) {
    const bytes = await buildProjectWorkbook(canonicalProject, units)
    const imported = await importProjectWorkbook(buffer(bytes))
    assert.ok(imported.ok, imported.ok ? '' : imported.error)
    if (!imported.ok) continue
    assert.deepEqual(imported.document.inputs.materials.steel[0].stressStrain, canonicalProject.inputs.materials.steel[0].stressStrain)
    assert.equal(imported.document.inputs.design.steelModelModified, true)
  }
})

test('development/02 §10: every canonical JSON example is the independent exact input round-trip oracle', async () => {
  const roots = ['docs/examples/equivalent-block', 'docs/examples/realistic-sections', 'docs/examples/reference-case/projects']
  for (const root of roots) {
    for (const name of readdirSync(root).filter((name) => name.endsWith('.pm-project.json'))) {
      const project = canonical(JSON.parse(readFileSync(join(root, name), 'utf8')))
      const imported = await importProjectWorkbook(buffer(await buildProjectWorkbook(project)))
      assert.ok(imported.ok, imported.ok ? '' : `${name}: ${imported.error}`)
      assert.deepEqual(imported.document, project, name)
    }
  }
})

test('development/02 §10: a declared check basis survives the workbook exactly, and an unknown one fails', async () => {
  const seed = createEmptyProjectDocument({ name: 'Basis' })
  seed.inputs.loadings.checkBasis = 'constantAxial'
  const project = canonical(JSON.parse(JSON.stringify(seed)))
  const workbook = await readBook(project)
  const imported = await importBook(workbook)
  assert.ok(imported.ok, imported.ok ? '' : imported.error)
  assert.equal(imported.document.inputs.loadings.checkBasis, 'constantAxial')
  assert.deepEqual(imported.document, project)
  field(workbook, 'Analysis', 'inputs.loadCheckBasis').value = 'nearest-angle'
  assert.equal((await importBook(workbook)).ok, false)
})

test('all profile families, empty inputs, optional bar references, Unicode and blank metadata retain their contracts', async () => {
  const empty = createEmptyProjectDocument({ name: '' })
  empty.meta.information.company = '구조 설계 – Công ty Á Châu'
  empty.meta.information.date = ''
  const asId = 'as-3600-2018-amd2-equivalent-block'
  const asProject = createProjectDocument({ calculationProfileId: asId, geometry: createEmptyGeometryInput(),
    materials: applyCalculationProfileToMaterials(createDefaultMaterialStore(), asId) })
  const optionalReference = example()
  delete optionalReference.inputs.geometry.rebars[0].steelMaterialId
  const customBlockId = 'custom-equivalent-block'
  const customBlock = createProjectDocument({ calculationProfileId: customBlockId, geometry: createEmptyGeometryInput(),
    materials: applyCalculationProfileToMaterials(createDefaultMaterialStore(), customBlockId) })
  const adaptiveFibre = example()
  adaptiveFibre.inputs.analysis = createAdaptiveAnalysisOptions()
  const adaptiveBlock = structuredClone(asProject)
  adaptiveBlock.inputs.analysis = createAdaptiveEquivalentBlockAnalysisOptions()
  for (const project of [empty, asProject, optionalReference, customBlock, adaptiveFibre, adaptiveBlock]) {
    const imported = await importProjectWorkbook(buffer(await buildProjectWorkbook(project)))
    assert.ok(imported.ok, imported.ok ? '' : imported.error)
    assert.deepEqual(imported.document, canonical(project))
  }
  assert.equal(projectWorkbookFileName(empty), 'pm-project.xlsx')
})



test('compact v5 hides advanced sheets/technical IDs and shows concise project/demand inputs', async () => {
  const project = example()
  project.meta.name = '=SUM(A1:A2)'
  project.inputs.loadings.combinations[0].name = '# literal loading name'
  project.inputs.loadings.combinations[1].name = 'LOADINGS'
  const book = await readBook(project)
  assert.deepEqual(book.worksheets.filter((s) => s.state === 'visible').map((s) => s.name), ['Project', 'Section', 'Rebar', 'Material', 'Loadings', 'Load reference'])
  assert.equal(book.getWorksheet('Analysis')!.state, 'hidden')
  assert.equal(book.getWorksheet('Resistance')!.state, 'hidden')
  assert.equal(book.getWorksheet('Section')!.getColumn(3).hidden, true)
  assert.equal(book.getWorksheet('Rebar')!.getColumn(4).hidden, true)
  assert.equal(book.getWorksheet('Rebar')!.getColumn(5).hidden, true)
  assert.equal(book.getWorksheet('Loadings')!.getColumn(5).hidden, true)
  const projectSheet = book.getWorksheet('Project')!
  assert.equal(projectSheet.rowCount, 10)
  assert.equal(field(book, 'Project', 'Name').value, '=SUM(A1:A2)')
  assert.equal(field(book, 'Analysis', 'workbookVersion').value, 8)
  assert.equal(book.getWorksheet('Section')!.getCell(marker(book, 'Section', 'OUTER'), 1).value, 'outer #1')
  assert.equal(book.getWorksheet('Section')!.getCell(marker(book, 'Section', 'HOLE'), 1).value, 'hole #1')
  const loadHeader = book.getWorksheet('Loadings')!.getRow(marker(book, 'Loadings', 'LOADINGS') + 1)
  assert.deepEqual([1, 2, 3, 4].map((c) => loadHeader.getCell(c).value), ['Name', 'P', 'Mx', 'My'])
  assert.equal(book.getWorksheet('Section')!.getCell(1, 1).value, '# Units: mm. Hole belongs to outer above.')
  assert.equal(book.getWorksheet('Rebar')!.getCell(1, 1).value, '# Diameter: mm; As: mm²; coordinates: mm. Blank material uses the default steel.')
  assert.equal(book.getWorksheet('Loadings')!.getCell(1, 1).value, '# P: N; Mx, My: N·mm. Factored ULS; P compression positive.')
  assert.equal(field(book, 'Material', 'strainSign').worksheet.getRow(Number(field(book, 'Material', 'strainSign').row)).hidden, true)
  assert.equal(book.getWorksheet('Material')!.getRow(Number(field(book, 'Material', 'fck (MPa)').row)).hidden, false)
  assert.equal(book.getWorksheet('Material')!.getRow(Number(field(book, 'Material', 'limits.epsCu (1)').row)).hidden, true)
  assert.equal(book.getWorksheet('Material')!.getRow(Number(field(book, 'Material', 'stressStrain.alpha').row)).hidden, true)
  for (const ws of book.worksheets) {
    assert.deepEqual(ws.getTables(), [])
    assert.equal(ws.autoFilter, undefined)
    ws.eachRow((row) => row.eachCell((cell) => {
      assert.notEqual(cell.type, ExcelJS.ValueType.Formula)
      assert.equal(cell.isMerged, false)
      assert.equal(cell.fill?.type === 'pattern' && cell.fill.pattern !== 'none', false)
      assert.notEqual(cell.value, 'Action basis')
    }))
  }
  assert.deepEqual(await assertImported(book), project)
})

test('visible value edits and new rows need no technical ID or demand-basis input', async () => {
  const project = example()
  const book = await readBook(project)
  field(book, 'Project', 'Client').value = 'Edited client'
  field(book, 'Material', 'fck (MPa)').value = 35
  dataCell(book, 'Section', 'OUTER', 1).value = -560
  dataCell(book, 'Rebar', 'REBAR', 1).value = 25
  book.getWorksheet('Rebar')!.addRow([16, 100, 530, null, null, 200])
  dataCell(book, 'Loadings', 'LOADINGS', 2).value = -1234567.891234567
  const loads = book.getWorksheet('Loadings')!
  loads.spliceRows(marker(book, 'Loadings', 'LOADINGS') + 3, 1)
  loads.addRow(['', 0, -40000000, 50000000])
  const imported = await assertImported(book)
  assert.equal(imported.meta.information.client, 'Edited client')
  assert.equal(imported.inputs.materials.concrete.fck, 35)
  assert.equal(imported.inputs.materials.concrete.elasticModulus, project.inputs.materials.concrete.elasticModulus)
  assert.equal(imported.inputs.geometry.outers[0].points[0].x, -560)
  assert.equal(imported.inputs.geometry.rebars[0].dia, 25)
  assert.equal(imported.inputs.geometry.rebars[0].area, project.inputs.geometry.rebars[0].area)
  assert.equal(imported.inputs.geometry.rebars.at(-1)!.dia, 16)
  assert.equal(imported.inputs.geometry.rebars.at(-1)!.area, 200)
  assert.equal(imported.inputs.geometry.rebars.at(-1)!.steelMaterialId, undefined)
  assert.equal(imported.inputs.loadings.combinations[0].P, -1234567.891234567)
  assert.equal(imported.inputs.loadings.combinations.length, 3)
  assert.equal(imported.inputs.loadings.combinations.at(-1)!.name, '')
  assert.ok(imported.inputs.loadings.combinations.every((l) => l.actionBasis === 'factoredULS'))
  assert.equal(new Set(imported.inputs.loadings.combinations.map((l) => l.id)).size, 3)
  assert.deepEqual(imported.inputs.analysis, project.inputs.analysis)
  assert.deepEqual(imported.inputs.design, project.inputs.design)
})

const userCurveProject = () => {
  const id = 'custom-stress-strain'
  const materials = applyCalculationProfileToMaterials(createDefaultMaterialStore(), id)
  materials.concrete.stressStrain = { type: 'user-curve', interpolation: 'linear', extrapolation: 'clamp', zeroTension: true,
    points: [{ strain: 0, stress: 0 }, { strain: 0.002, stress: 30 }, { strain: 0.0033, stress: 25 }] }
  materials.steel[0].stressStrain = { type: 'user-curve', interpolation: 'linear', extrapolation: 'clamp',
    points: [{ strain: -0.01, stress: -400 }, { strain: 0, stress: 0 }, { strain: 0.01, stress: 400 }] }
  materials.steel.push({ ...structuredClone(materials.steel[0]), id: 3, name: 'Second grade' })
  const analysis = createAnalysisOptionsForProfile(id)
  assert.equal(analysis.methodId, 'strain-domain-surface-v1')
  if (analysis.methodId === 'strain-domain-surface-v1') {
    analysis.directions.seed = { type: 'explicit', anglesDeg: [0, 20, 95, 180, 270] }
    analysis.directions.refinement.probe = { stationIds: [1, 2] }
  }
  return canonical(createProjectDocument({ calculationProfileId: id, geometry: example().inputs.geometry, materials, analysis }))
}


test('blank rows, relocated tables/columns, repeated headers and hidden-sheet unhide preserve inputs', async () => {
  const project = userCurveProject()
  const book = await readBook(project)
  assert.equal(book.getWorksheet('Rebar')!.getColumn(4).hidden, false)
  assert.equal(book.getWorksheet('Material')!.getRow(Number(field(book, 'Material', 'stressStrain.interpolation').row)).hidden, true)
  for (const ws of book.worksheets) {
    const original = Array.from({ length: ws.rowCount }, (_, i) => ws.getRow(i + 1).values as ExcelJS.CellValue[])
    ws.eachRow((row) => { row.values = [] })
    ws.addRow(['# Custom notes'])
    for (const values of original) {
      ws.addRow([])
      const row = ws.addRow([null, null, ...values.slice(1)])
      if (typeof row.getCell(3).value === 'string' && /^[A-Z_]+$/.test(String(row.getCell(3).value))) row.getCell(3).value = `  ${String(row.getCell(3).value).toLowerCase()}  `
      if (typeof row.getCell(3).value === 'string' && /^(outer|hole) #/.test(String(row.getCell(3).value))) row.getCell(3).value = `  ${String(row.getCell(3).value).toUpperCase()}  `
    }
  }
  book.getWorksheet('Analysis')!.state = 'visible'
  book.getWorksheet('Resistance')!.state = 'visible'
  assert.deepEqual(await assertImported(book), project)
  const plain = await readBook(project)
  for (const ws of [plain.getWorksheet('Rebar')!, plain.getWorksheet('Loadings')!]) {
    const start = marker(plain, ws.name, ws.name === 'Rebar' ? 'REBAR' : 'LOADINGS')
    ws.spliceRows(start + 3, 0, ws.getRow(start + 1).values as ExcelJS.CellValue[])
    for (let r = start + 1; r <= ws.rowCount; r++) {
      const values = (ws.getRow(r).values as ExcelJS.CellValue[]).slice(1)
      const first = values.shift()!
      ws.getRow(r).values = [...values, first]
    }
  }
  assert.deepEqual(await assertImported(plain), project)
})

test('new short outer/hole markers, copied IDs and inserted/deleted vertices work without manual IDs', async () => {
  const project = example()
  const book = await readBook(project)
  const section = book.getWorksheet('Section')!
  const outerPoints = [[2000, 0], [2600, 0], [2600, 600], [2000, 600]]
  const holePoints = [[2200, 200], [2200, 400], [2400, 400], [2400, 200]]
  section.addRows([[], ['outer #2'], ['X', 'Y', 'ID'], ...outerPoints.map((p, i) => [...p, i + 1]),
    [], ['hole #3'], ['X', 'Y'], ...holePoints])
  const originalOuterRow = marker(book, 'Section', 'OUTER', 1)
  const [p0, p1] = project.inputs.geometry.outers[0].points
  section.spliceRows(originalOuterRow + 3, 0, [(p0.x + p1.x) / 2, (p0.y + p1.y) / 2])
  const result = await importBook(book)
  assert.ok(result.ok, result.ok ? '' : result.error)
  assert.ok(result.warnings.some((w) => /copied row/.test(w)))
  const imported = result.document
  assert.equal(imported.inputs.geometry.outers.length, 2)
  assert.deepEqual(imported.inputs.geometry.outers[1].points.map((p) => [p.x, p.y]), outerPoints)
  assert.deepEqual(imported.inputs.geometry.outers[1].holes[0].points.map((p) => [p.x, p.y]), holePoints)
  assert.equal(imported.inputs.geometry.outers[1].holes[0].id, 3)
  assert.equal(imported.inputs.geometry.outers[0].holes.length, 2)
  const points = imported.inputs.geometry.outers.flatMap((o) => [...o.points, ...o.holes.flatMap((h) => h.points)])
  assert.equal(new Set(points.map((p) => p.id)).size, points.length)
  assert.equal(imported.inputs.geometry.outers[0].points[0].id, p0.id)
  section.spliceRows(originalOuterRow + 3, 1)
  assert.deepEqual((await assertImported(book)).inputs.geometry.outers[0], project.inputs.geometry.outers[0])
})

test('optional ID columns can be omitted; copied bar/load IDs are reallocated and demand values stay authoritative', async () => {
  const book = await readBook(example())
  const section = book.getWorksheet('Section')!
  section.eachRow((r) => { r.getCell(3).value = null })
  const loads = book.getWorksheet('Loadings')!
  const firstLoad = loads.getRow(marker(book, 'Loadings', 'LOADINGS') + 2).values
  loads.addRow(firstLoad)
  const bars = book.getWorksheet('Rebar')!
  const firstBar = bars.getRow(marker(book, 'Rebar', 'REBAR') + 2).values
  const copiedBar = bars.addRow(firstBar)
  copiedBar.getCell(2).value = 100
  const copied = await importBook(book)
  assert.ok(copied.ok, copied.ok ? '' : copied.error)
  assert.ok(copied.warnings.some((w) => w.startsWith('Loadings:')))
  assert.ok(copied.warnings.some((w) => w.startsWith('Rebar:')))
  assert.equal(copied.document.inputs.loadings.combinations.at(-1)!.P, example().inputs.loadings.combinations[0].P)
  for (const ws of [bars, loads]) ws.eachRow((r) => { r.getCell(5).value = null })
  const absent = await assertImported(book)
  assert.equal(new Set(absent.inputs.geometry.rebars.map((b) => b.id)).size, absent.inputs.geometry.rebars.length)
  assert.ok(absent.inputs.loadings.combinations.every((l) => l.actionBasis === 'factoredULS'))
  const service = example()
  Reflect.set(service.inputs.loadings.combinations[0], 'actionBasis', 'service')
  await assert.rejects(buildProjectWorkbook(service), /only factoredULS/)
})

test('copied material fields and separate custom curve tables preserve all independent parameters', async () => {
  const project = userCurveProject()
  const book = await readBook(project)
  const ws = book.getWorksheet('Material')!
  const curve = marker(book, 'Material', 'STEEL_CURVE', 3)
  ws.getCell(curve + 4, 2).value = 410
  const edited = await assertImported(book)
  const model = edited.inputs.materials.steel[1].stressStrain
  assert.equal(model.type, 'user-curve')
  if (model.type === 'user-curve') assert.equal(model.points.at(-1)!.stress, 410)
  const first = ws.getRow(curve + 2).values
  ws.getRow(curve + 2).values = ws.getRow(curve + 4).values
  ws.getRow(curve + 4).values = first
  const reordered = await importBook(book)
  assert.equal(reordered.ok, false)
  if (!reordered.ok) assert.equal(reordered.code, 'PROJECT_INPUT')
  const gradeBook = await readBook(example())
  const material = gradeBook.getWorksheet('Material')!
  const start = marker(gradeBook, 'Material', 'STEEL', 1)
  const copy = Array.from({ length: material.rowCount - start + 1 }, (_, i) => material.getRow(start + i).values as ExcelJS.CellValue[])
  copy[0][2] = 3
  material.addRow([])
  material.addRows(copy)
  field(gradeBook, 'Material', 'name', 'STEEL', 3).value = 'Copied grade'
  gradeBook.getWorksheet('Rebar')!.addRow([20, 100, 530, 3, null, 300])
  const grade = await assertImported(gradeBook)
  assert.equal(grade.inputs.materials.steel[1].name, 'Copied grade')
  assert.equal(grade.inputs.geometry.rebars.at(-1)!.steelMaterialId, 3)
  assert.equal(grade.inputs.geometry.rebars.at(-1)!.area, 300)
})

test('hidden advanced settings remain editable and cannot grant verification status', async () => {
  const project = example()
  const book = await readBook(project)
  field(book, 'Analysis', 'stations.basedOn').value = 'custom'
  dataCell(book, 'Analysis', 'STATIONS', 4).value = 3.125
  field(book, 'Resistance', 'axialCapEnabled').value = 'FALSE'
  const imported = await assertImported(book)
  if (imported.inputs.analysis.methodId === 'strain-domain-surface-v1') assert.deepEqual(imported.inputs.analysis.stations.intermediate[0].criterion, { type: 'depth-ratio', ratio: 3.125 })
  if (imported.inputs.design.format === 'globalResultantFactor') assert.equal(imported.inputs.design.axialCapEnabled, false)
  field(book, 'Resistance', 'verificationStatus').value = 'verified'
  assert.equal((await importBook(book)).ok, false)
})

test('malformed keywords/cells/references and missing hidden settings fail closed', async () => {
  const cases: Array<[string, (book: ExcelJS.Workbook) => void, string]> = [
    ['blank coordinate', (b) => { dataCell(b, 'Section', 'OUTER', 1).value = null }, 'WORKBOOK_CELL'],
    ['cached formula', (b) => { dataCell(b, 'Rebar', 'REBAR', 1).value = { formula: '10+10', result: 20 } }, 'WORKBOOK_CELL'],
    ['missing material', (b) => { b.removeWorksheet(b.getWorksheet('Material')!.id) }, 'WORKBOOK_FORMAT'],
    ['missing hidden analysis', (b) => { b.removeWorksheet(b.getWorksheet('Analysis')!.id) }, 'WORKBOOK_FORMAT'],
    ['missing hidden resistance', (b) => { b.removeWorksheet(b.getWorksheet('Resistance')!.id) }, 'WORKBOOK_FORMAT'],
    ['changed units', (b) => { b.getWorksheet('Loadings')!.getCell(marker(b, 'Loadings', 'LOADINGS') + 1, 2).value = 'P (kN)' }, 'WORKBOOK_FORMAT'],
    ['unknown keyword', (b) => { b.getWorksheet('Rebar')!.getCell(marker(b, 'Rebar', 'REBAR'), 1).value = 'BARS' }, 'WORKBOOK_FORMAT'],
    ['missing header', (b) => { b.getWorksheet('Section')!.spliceRows(marker(b, 'Section', 'OUTER') + 1, 1) }, 'WORKBOOK_FORMAT'],
    ['duplicate outer', (b) => { b.getWorksheet('Section')!.addRows([['outer #1'], ['X', 'Y']]) }, 'WORKBOOK_CELL'],
    ['duplicate hole', (b) => { b.getWorksheet('Section')!.addRows([['hole #1'], ['X', 'Y']]) }, 'WORKBOOK_CELL'],
    ['hole before outer', (b) => { b.getWorksheet('Section')!.getCell(marker(b, 'Section', 'OUTER'), 1).value = 'hole #100' }, 'WORKBOOK_CELL'],
    ['old long marker', (b) => { b.getWorksheet('Section')!.getRow(marker(b, 'Section', 'OUTER')).values = ['OUTER', 1] }, 'WORKBOOK_FORMAT'],
    ['partial row', (b) => { b.getWorksheet('Rebar')!.addRow([20, 0]) }, 'WORKBOOK_CELL'],
    ['missing stored As', (b) => { b.getWorksheet('Rebar')!.addRow([16, 100, 530]) }, 'PROJECT_INPUT'],
    ['malformed technical ID', (b) => { dataCell(b, 'Rebar', 'REBAR', 5).value = -1 }, 'WORKBOOK_CELL'],
    ['extra column', (b) => { dataCell(b, 'Rebar', 'REBAR', 8).value = 'unowned input' }, 'WORKBOOK_FORMAT'],
    ['duplicate field', (b) => { b.getWorksheet('Material')!.spliceRows(marker(b, 'Material', 'CONCRETE') + 2, 0, ['fck (MPa)', 35]) }, 'WORKBOOK_CELL'],
    ['prototype key', (b) => { b.getWorksheet('Material')!.addRow(['constructor.bad', 'x']) }, 'WORKBOOK_CELL'],
    ['invalid strength', (b) => { field(b, 'Material', 'fck (MPa)').value = -30 }, 'PROJECT_INPUT'],
    ['unknown steel', (b) => { dataCell(b, 'Rebar', 'REBAR', 4).value = 999 }, 'WORKBOOK_CELL'],
    ['shadow input', (b) => { b.getWorksheet('Project')!.addRow(['inputs.loadings.combinations', '[]']) }, 'WORKBOOK_CELL'],
    ['shadow project name', (b) => { b.getWorksheet('Analysis')!.spliceRows(marker(b, 'Analysis', 'PROJECT_METADATA') + 2, 0, ['meta.name', 'shadow']) }, 'WORKBOOK_FORMAT'],
    ['unknown profile', (b) => { field(b, 'Analysis', 'inputs.calculationProfileId').value = 'unknown' }, 'PROJECT_INPUT'],
    ['changed standard station', (b) => { dataCell(b, 'Analysis', 'STATIONS', 4).value = 3.125 }, 'PROJECT_INPUT'],
    ['orphan curve', (b) => { b.getWorksheet('Material')!.addRows([['STEEL_CURVE', 999], ['Strain (1)', 'Stress (MPa)'], [0, 0]]) }, 'WORKBOOK_CELL'],
    ['duplicate project', (b) => { b.getWorksheet('Project')!.addRows([['PROJECT'], ['Field', 'Value']]) }, 'WORKBOOK_FORMAT'],
    ['duplicate steel', (b) => { b.getWorksheet('Material')!.addRows([['STEEL', 1], ['Field', 'Value']]) }, 'WORKBOOK_CELL'],
    ['old version', (b) => { field(b, 'Analysis', 'workbookVersion').value = 2 }, 'WORKBOOK_FORMAT']
  ]
  for (const [label, mutate, code] of cases) {
    const book = await readBook(example())
    mutate(book)
    const result = await importBook(book)
    assert.equal(result.ok, false, label)
    if (!result.ok) assert.equal(result.code, code, `${label}: ${result.error}`)
  }
  const oversized = await importProjectWorkbook(new ArrayBuffer(10 * 1024 * 1024 + 1))
  assert.equal(oversized.ok, false)
  if (!oversized.ok) assert.equal(oversized.code, 'WORKBOOK_RESOURCE_LIMIT')
  const invalidZip = await importProjectWorkbook(new Uint8Array([1, 2, 3]).buffer)
  assert.equal(invalidZip.ok, false)
  if (!invalidZip.ok) assert.equal(invalidZip.code, 'WORKBOOK_FORMAT')
  const curveBook = await readBook(userCurveProject())
  curveBook.getWorksheet('Material')!.addRows([['STEEL_CURVE', 3], ['Strain (1)', 'Stress (MPa)'], [0, 0]])
  assert.equal((await importBook(curveBook)).ok, false)
  const arrayBook = await readBook(userCurveProject())
  arrayBook.getWorksheet('Analysis')!.spliceRows(Number(field(arrayBook, 'Analysis', 'directions.seed.anglesDeg.1 (deg)').row), 1)
  assert.equal((await importBook(arrayBook)).ok, false)
})
