import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import ExcelJS from 'exceljs'
import { geometryInputRebars, sectionGeometryFromGeometryInput } from '@pm/geometry'
import { activeDesignSurfaceDataset, checkLoadcaseUtilizationFromSurface, sliceFixedPContour, sliceMomentPlane } from '@pm/analysis'
import { applyLoadReference, CENTROID_LOAD_REFERENCE, createLoadCombination, createProjectDocument, parseProjectDocument,
  resultantAtLoadReference, type LoadCombination, type LoadReference } from '@pm/project'
import { UNIT_PRESETS } from '@pm/units'
import { buildPreviewSurfaceFallback, checkLoadcaseFallback } from '../application/analysis/fallback'
import { buildLoadcaseWorkbook, importLoadcaseWorkbook } from '../features/section-editor/loadings/loadcase-xlsx'
import { buildProjectWorkbook, importProjectWorkbook } from '../features/section-editor/project/project-xlsx'
import { appendPresentationSummary } from '../../../packages/pm-report/src/excel/presentation-summary'
import { buildColumnReportModel } from '@pm/report/report-model'

const reference: LoadReference = { kind: 'centroid-offset', offsetX: 125, offsetY: -75 }
const files = ['docs/examples/realistic-sections/KDS-REAL-05-complex-stress-strain.pm-project.json',
  'docs/examples/equivalent-block/ACI-EB-01-rectangle-8-bars.pm-project.json']
for (const file of files) test(`ENG-AN-003: Convert preserves both-mechanics checks and fields exactly: ${file}`, async () => {
  const parsed = parseProjectDocument(readFileSync(file, 'utf8'))
  assert.ok(parsed.ok)
  const { geometry, materials, analysis, design, calculationProfileId } = parsed.document.inputs
  const input = { section: sectionGeometryFromGeometryInput(geometry), rebars: geometryInputRebars(geometry),
    materialStore: materials, analysisOptions: analysis, designBasis: design, calculationProfileId }
  const { surface } = buildPreviewSurfaceFallback(input)
  const seed = createLoadCombination({ P: 2e6, Mx: 800e6, My: 350e6 })
  const hit = checkLoadcaseUtilizationFromSurface(surface, seed).capacityPoint
  assert.ok(hit)
  for (const scale of [0.5, 2, 5]) {
    const load: LoadCombination = { ...seed, P: hit.P * scale, Mx: hit.Mx * scale, My: hit.My * scale }
    const before = await checkLoadcaseFallback({ ...input, surface, checkBasis: 'proportional3D', loadcase: load })
    const dataset = activeDesignSurfaceDataset(surface)
    const curvesBefore = { fixedP: sliceFixedPContour(dataset.points, load.P, dataset.triangles),
      vertical: sliceMomentPlane(dataset.points, Math.atan2(load.My, load.Mx), dataset.triangles) }
    const converted = applyLoadReference({ combinations: [load] }, reference, true)
    const after = await checkLoadcaseFallback({ ...input, surface, checkBasis: 'proportional3D', loadcase: converted.combinations[0] })
    assert.deepEqual(after, before, 'canonical inverse, capacity field, UR and classification are unchanged')
    const sameLoad = converted.combinations[0]
    assert.deepEqual({ fixedP: sliceFixedPContour(dataset.points, sameLoad.P, dataset.triangles),
      vertical: sliceMomentPlane(dataset.points, Math.atan2(sameLoad.My, sameLoad.Mx), dataset.triangles) }, curvesBefore,
      'fixed-P and demand-direction charts remain centroidal and identical')
  }
})

test('ENG-LOAD-001: input workbooks declare the origin and round-trip offset input values in Metric and US units', async () => {
  const parsed = parseProjectDocument(readFileSync(files[0], 'utf8'))
  assert.ok(parsed.ok)
  const project = createProjectDocument(parsed.document.inputs)
  project.inputs.loadings = applyLoadReference(project.inputs.loadings, reference, true)
  for (const units of [UNIT_PRESETS.metric, UNIT_PRESETS.us]) {
    const bytes = await buildProjectWorkbook(project, units)
    const imported = await importProjectWorkbook(new Uint8Array(bytes).buffer)
    assert.ok(imported.ok, imported.ok ? '' : imported.error)
    assert.deepEqual(imported.document.inputs.loadings.reference, reference)
    const standalone = await importLoadcaseWorkbook(new Uint8Array(await buildLoadcaseWorkbook(project.inputs.loadings.combinations, units, reference)).buffer)
    for (const actual of [imported.document.inputs.loadings.combinations, standalone]) actual.forEach((load, index) => {
      const expected = project.inputs.loadings.combinations[index]
      for (const key of ['P', 'Mx', 'My'] as const) assert.ok(Math.abs(load[key] - expected[key]) <= 8 * Number.EPSILON * Math.max(1, Math.abs(expected[key])))
    })
    const book = new ExcelJS.Workbook()
    await book.xlsx.load(new Uint8Array(bytes).buffer)
    book.removeWorksheet('Load reference')
    assert.equal((await importProjectWorkbook(new Uint8Array(await book.xlsx.writeBuffer()).buffer)).ok, false,
      'new workbooks cannot silently discard the reference declaration')
  }
})

test('ENG-REP-002: reference evidence retains separate input-origin and centroidal moments', () => {
  const book = new ExcelJS.Workbook()
  const load = createLoadCombination({ name: 'Pure axial at C', P: 1e6, Mx: 0, My: 0 })
  appendPresentationSummary(book, { loadReference: { ...reference, offsetY: 50 }, section: { id: 1, name: '', solids: [] }, rebars: [], loadcases: [load] })
  const sheet = book.getWorksheet('Load reference')!
  assert.deepEqual((sheet.getRow(7).values as unknown[]).slice(1), [load.name, 1e6, 0, 0, -50e6, -125e6])
  assert.deepEqual(CENTROID_LOAD_REFERENCE, { kind: 'centroid-offset', offsetX: 0, offsetY: 0 })
})

test('ENG-REP-002: report origin evidence cannot change centroidal curves, fields or decisions', () => {
  const parsed = parseProjectDocument(readFileSync(files[0], 'utf8'))
  assert.ok(parsed.ok)
  const { geometry, materials, analysis, design, calculationProfileId, loadings } = parsed.document.inputs
  const input = { section: sectionGeometryFromGeometryInput(geometry), rebars: geometryInputRebars(geometry),
    materialStore: materials, analysisOptions: analysis, designBasis: design, calculationProfileId }
  const { surface } = buildPreviewSurfaceFallback(input)
  const reportInput = { ...input, surface, projectName: 'Reference oracle', sectionName: geometry.name,
    projectInformation: parsed.document.meta.information, loadcases: loadings.combinations, detailLoadcaseIds: [loadings.combinations[0].id] }
  const original = buildColumnReportModel(reportInput)
  const referenced = buildColumnReportModel({ ...reportInput, loadReference: reference })
  assert.deepEqual({ ...referenced, identity: [] }, { ...original, identity: [] })
  assert.ok(referenced.identity.some(([label, value]) => label === 'Load reference offsets' && value.includes('about the centroid')))
  assert.equal(referenced.identity.filter(([label]) => label.startsWith('Input at O')).length, loadings.combinations.length)
})
