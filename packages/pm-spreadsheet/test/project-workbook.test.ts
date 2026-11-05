import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import ExcelJS from 'exceljs'
import { applyCalculationProfileToMaterials, CALCULATION_PROFILE_IDS, createAdaptiveAnalysisOptions, createAdaptiveEquivalentBlockAnalysisOptions,
  createEmptyProjectDocument, createProjectDocument, parseProjectDocument, type PmProjectDocument } from '@pm/project'
import { UNIT_PRESETS, type UnitContext } from '@pm/units'
import { createKdsAppendixDesignBasis } from '@pm/design'
import { buildProjectWorkbook, importProjectWorkbook, projectWorkbookFileName } from '../src/project-xlsx'

const buffer = (bytes: Uint8Array) => new Uint8Array(bytes).buffer
const canonical = (raw: unknown): PmProjectDocument => {
  const parsed = parseProjectDocument(raw)
  assert.ok(parsed.ok, parsed.ok ? '' : parsed.error)
  return parsed.document
}
const example = () => canonical(JSON.parse(readFileSync('docs/examples/realistic-sections/KDS-REAL-05-complex-stress-strain.pm-project.json', 'utf8')))
const readBook = async (project = example(), units?: UnitContext) => {
  const book = new ExcelJS.Workbook()
  await book.xlsx.load(buffer(await buildProjectWorkbook(project, units)))
  return book
}
const importBook = async (book: ExcelJS.Workbook) => importProjectWorkbook(buffer(new Uint8Array(await book.xlsx.writeBuffer())))
const imported = async (book: ExcelJS.Workbook) => {
  const parsed = await importBook(book)
  assert.ok(parsed.ok, parsed.ok ? '' : parsed.error)
  return parsed.document
}
const field = (book: ExcelJS.Workbook, sheet: string, label: string) => {
  const ws = book.getWorksheet(sheet)!
  for (let r = 1; r <= ws.rowCount; r++) if (ws.getCell(r, 1).value === label) return ws.getCell(r, 2)
  throw Error(`Missing ${sheet}: ${label}`)
}
const marker = (book: ExcelJS.Workbook, sheet: string, title: string, id?: number) => {
  const ws = book.getWorksheet(sheet)!
  for (let r = 1; r <= ws.rowCount; r++) if (ws.getCell(r, 1).value === title && (id === undefined || ws.getCell(r, 2).value === id)) return r
  throw Error(`Missing ${sheet}: ${title}`)
}
const removeField = (book: ExcelJS.Workbook, sheet: string, label: string) => {
  const cell = field(book, sheet, label); cell.worksheet.spliceRows(Number(cell.row), 1)
}

test('Project workbook v1 contains plain human input sheets, Greek labels and dark-blue inputs without fills or bold', async () => {
  const p = example()
  p.inputs.materials.steel[0].stressStrain = { type: 'linear-hardening', ultimateStrength: { type: 'ratio', ratio: 1.08 }, epsUk: .05, strainLimit: { type: 'factor', value: 1 } }
  const book = await readBook(canonical(p))
  assert.equal(book.subject, 'P-M project inputs / 1')
  assert.deepEqual(book.worksheets.map(ws => ws.name), ['Project', 'Section', 'Rebar', 'Material', 'Loadings', 'Load reference', 'Options', 'Resistance', 'Units'])
  assert.ok(book.worksheets.every(ws => ws.state === 'visible'))
  assert.equal(book.getWorksheet('Analysis'), undefined)
  assert.equal(field(book, 'Material', 'Peak input').value, 'k = fu/fy')
  for (const [sheet, name] of [['Material', 'fck (MPa)'], ['Material', 'εuk (1)'], ['Material', 'αε (1)'], ['Options', 'Mode'], ['Project', 'Check basis'], ['Units', 'Force']]) {
    const input = field(book, sheet, name)
    assert.equal(input.font.color?.argb, 'FF00008B')
  }
  for (const ws of [...book.worksheets]) {
    assert.deepEqual(ws.getTables(), [])
    ws.eachRow(row => row.eachCell(cell => {
      assert.notEqual(cell.type, ExcelJS.ValueType.Formula)
      assert.equal(cell.isMerged, false)
      assert.notEqual(cell.font?.bold, true)
      assert.ok(!cell.fill || cell.fill.type === 'pattern' && cell.fill.pattern === 'none')
      if (typeof cell.value === 'string') assert.doesNotMatch(cell.value, /stressStrain\.|workbookFormat|workbookVersion|optionsVersion|basisVersion|verificationStatus|PROJECT_METADATA|SECTION_METADATA/)
    }))
  }
})

test('every canonical JSON fixture round-trips exactly through the first format in canonical and US units', async () => {
  for (const root of ['docs/examples/equivalent-block', 'docs/examples/realistic-sections', 'docs/examples/reference-case/projects']) {
    for (const name of readdirSync(root).filter(name => name.endsWith('.pm-project.json'))) {
      const project = canonical(JSON.parse(readFileSync(join(root, name), 'utf8')))
      for (const units of [undefined, UNIT_PRESETS.us]) {
        const result = await importProjectWorkbook(buffer(await buildProjectWorkbook(project, units)))
        assert.ok(result.ok, result.ok ? '' : `${name}: ${result.error}`)
        assert.deepEqual(result.document, project, name)
      }
    }
  }
})

test('all seven profiles, empty inputs, Unicode, adaptive modes and optional references retain complete inputs', async () => {
  const base = example()
  const empty = createEmptyProjectDocument({ name: '' }); empty.meta.information.company = '구조 설계 — Công ty Á Châu'; empty.meta.information.date = ''
  const cases = [canonical(empty)]
  for (const profile of CALCULATION_PROFILE_IDS) cases.push(canonical(createProjectDocument({ calculationProfileId: profile,
    geometry: base.inputs.geometry, materials: applyCalculationProfileToMaterials(base.inputs.materials, profile) })))
  const fibre = example(); fibre.inputs.analysis = createAdaptiveAnalysisOptions(); cases.push(canonical(fibre))
  const block = structuredClone(cases.find(p => p.inputs.analysis.methodId === 'equivalent-block-surface-v1')!)
  block.inputs.analysis = createAdaptiveEquivalentBlockAnalysisOptions(); cases.push(canonical(block))
  const optional = example(); delete optional.inputs.geometry.rebars[0].steelMaterialId; cases.push(canonical(optional))
  for (const project of cases) assert.deepEqual(await imported(await readBook(project)), project)
  assert.equal(projectWorkbookFileName(empty), 'pm-project.xlsx')
})

test('hardening ratio/stress and factor/absolute cutoff inputs are meaningful and retain their selected representation', async () => {
  for (const peak of [{ type: 'ratio', ratio: 1.08 }, { type: 'stress', stress: 550 }] as const) {
    for (const cutoff of [{ type: 'factor', value: .9 }, { type: 'absolute', value: .04 }] as const) {
      const p = example(); p.inputs.materials.steel[0].stressStrain = { type: 'linear-hardening', ultimateStrength: peak, epsUk: .05, strainLimit: cutoff }
      const project = canonical(p), book = await readBook(project, UNIT_PRESETS.us)
      assert.equal(field(book, 'Material', 'Peak input').value, peak.type === 'ratio' ? 'k = fu/fy' : 'fu')
      assert.equal(field(book, 'Material', 'Cutoff input').value, cutoff.type === 'factor' ? 'αε · εuk' : 'εud')
      assert.deepEqual(await imported(book), project)
    }
  }
})

test('readonly compatibility data survives without appearing as an editable material input', async () => {
  const p = example(); p.inputs.materials.concrete.mc = 2412.1234567890123; p.inputs.materials.concrete.elasticModulus = 31234.567890123
  const project = canonical(p), book = await readBook(project, UNIT_PRESETS.us)
  const labels = book.getWorksheet('Material')!.getColumn(1).values
  assert.ok(!labels.some(value => typeof value === 'string' && /^(mc|Ec|elasticModulus|standard|strainSign)/.test(value)))
  assert.deepEqual(await imported(book), project)
  const metadata = JSON.parse(book.description)
  assert.ok(metadata.groups.flatMap((group: { stored: unknown[] }) => group.stored).length > 0)
  assert.ok(metadata.groups.every((group: { paths: string[]; stored: Array<{ path: string }> }) => group.stored.every(value => !group.paths.includes(value.path))))
})

test('custom stress-strain curves retain independent controls and editable points', async () => {
  const base = example()
  const p = createProjectDocument({ calculationProfileId: 'custom-stress-strain', geometry: base.inputs.geometry,
    materials: applyCalculationProfileToMaterials(base.inputs.materials, 'custom-stress-strain') })
  p.inputs.materials.concrete.stressStrain = { type: 'user-curve', points: [{ strain: 0, stress: 0 }, { strain: .002, stress: 30 }, { strain: .0033, stress: 30 }], interpolation: 'linear', extrapolation: 'clamp', zeroTension: true }
  p.inputs.materials.steel[0].stressStrain = { type: 'user-curve', points: [{ strain: -.05, stress: -420 }, { strain: -.002, stress: -400 }, { strain: 0, stress: 0 }, { strain: .002, stress: 400 }, { strain: .05, stress: 420 }], interpolation: 'linear', extrapolation: 'clamp' }
  const project = canonical(p), book = await readBook(project, UNIT_PRESETS.us)
  assert.deepEqual(await imported(book), project)
  const table = book.getWorksheet('Material')!, start = marker(book, 'Material', 'Concrete curve')
  table.getCell(start + 3, 2).value = 4.5
  const changed = await imported(book)
  assert.equal(changed.inputs.materials.concrete.stressStrain.type, 'user-curve')
  if (changed.inputs.materials.concrete.stressStrain.type === 'user-curve') assert.notEqual(changed.inputs.materials.concrete.stressStrain.points[1].stress, 30)
  assert.deepEqual(changed.inputs.materials.steel, project.inputs.materials.steel)
})

test('clearing an optional physical steel cap removes it; required strains cannot be blank', async () => {
  const p = example(); p.inputs.materials.steel[0].limits = { ...p.inputs.materials.steel[0].limits, epsU: .05 }
  const book = await readBook(canonical(p))
  field(book, 'Material', 'εs,phys (1)').value = null
  assert.equal((await imported(book)).inputs.materials.steel[0].limits?.epsU, undefined)
  field(book, 'Material', 'εcu (1)').value = null
  assert.equal((await importBook(book)).ok, false)
})

test('equal law/boundary strains have one editable source; distinct active bounds stay independent', async () => {
  const p = example(), book = await readBook(p)
  field(book, 'Material', 'εc0 (1)').value = .0022
  const changed = await imported(book)
  assert.equal(changed.inputs.materials.concrete.limits.eps0, .0022)
  assert.equal(changed.inputs.materials.concrete.stressStrain.type, 'kds-parabolic')
  if (changed.inputs.materials.concrete.stressStrain.type === 'kds-parabolic') assert.equal(changed.inputs.materials.concrete.stressStrain.eps0, .0022)
  const distinct = example(); distinct.inputs.materials.concrete.limits.epsCu = .0032
  const project = canonical(distinct), separated = await readBook(project)
  assert.equal(field(separated, 'Material', 'εcu,lim (1)').value, .0032)
  assert.deepEqual(await imported(separated), project)
})

test('editing fy and Es refreshes only the derived yield snapshot through the material owner', async () => {
  const p = example(), book = await readBook(p)
  field(book, 'Material', 'fy (MPa)').value = 500
  field(book, 'Material', 'Es (MPa)').value = 210000
  const q = await imported(book)
  assert.equal(q.inputs.materials.steel[0].fy, 500)
  assert.equal(q.inputs.materials.steel[0].elasticModulus, 210000)
  assert.equal(q.inputs.materials.steel[0].limits?.epsY, 500 / 210000)
  assert.deepEqual(q.inputs.materials.concrete, p.inputs.materials.concrete)
  book.getWorksheet('Material')!.spliceRows(marker(book, 'Material', 'Steel') + 2, 0, ['εs,phys (1)', .0022])
  assert.equal((await importBook(book)).ok, false)
})

test('coefficient overrides require an authored reason and retain modified draft evidence', async () => {
  const book = await readBook()
  field(book, 'Resistance', 'φt').value = .8
  assert.equal((await importBook(book)).ok, false)
  field(book, 'Resistance', 'Reason').value = 'Project input override for review'
  const q = await imported(book)
  assert.equal(q.inputs.design.modified, true)
  assert.equal(q.inputs.design.verificationStatus, 'draft')
  if (q.inputs.design.format === 'globalResultantFactor') assert.equal(q.inputs.design.factors.phiTension, .8)
})

test('Appendix eccentricity inputs are complete, editable and never overwritten by profile defaults', async () => {
  const base = example(), design = createKdsAppendixDesignBasis()
  const p = canonical(createProjectDocument({ calculationProfileId: base.inputs.calculationProfileId,
    geometry: base.inputs.geometry, materials: base.inputs.materials, design }))
  const book = await readBook(p)
  field(book, 'Resistance', 'emin (mm)').value = 23.5
  field(book, 'Resistance', 'e/D').value = .04
  field(book, 'Resistance', 'Reason').value = 'Project eccentricity inputs for review'
  const q = await imported(book)
  assert.equal(q.inputs.design.format, 'designMaterialReevaluation')
  if (q.inputs.design.format === 'designMaterialReevaluation') assert.deepEqual(q.inputs.design.minimumEccentricity, {
    ...design.minimumEccentricity, constantMm: 23.5, depthFactor: .04
  })
  assert.deepEqual(await imported(await readBook(q, UNIT_PRESETS.us)), q)
})

test('geometry, stored As, loading and scalar input edits remain authoritative and do not derive unrelated material data', async () => {
  const p = example(), book = await readBook(p)
  field(book, 'Project', 'Client').value = 'Edited client'
  field(book, 'Material', 'fck (MPa)').value = 35
  const section = book.getWorksheet('Section')!, bars = book.getWorksheet('Rebar')!, loads = book.getWorksheet('Loadings')!
  section.getCell(marker(book, 'Section', 'Outer') + 2, 1).value = -560
  bars.getCell(marker(book, 'Rebar', 'Rebars') + 2, 1).value = 25
  bars.addRow([16, 100, 530, null, null, 200])
  loads.addRow(['New load', 1000, -2000000, 3000000])
  const q = await imported(book)
  assert.equal(q.meta.information.client, 'Edited client')
  assert.equal(q.inputs.materials.concrete.fck, 35)
  assert.equal(q.inputs.materials.concrete.elasticModulus, p.inputs.materials.concrete.elasticModulus)
  assert.equal(q.inputs.geometry.outers[0].points[0].x, -560)
  assert.equal(q.inputs.geometry.rebars[0].area, p.inputs.geometry.rebars[0].area)
  assert.equal(q.inputs.geometry.rebars.at(-1)!.area, 200)
  assert.equal(q.inputs.loadings.combinations.at(-1)!.Mx, -2000000)
  assert.equal(new Set(q.inputs.loadings.combinations.map(load => load.id)).size, q.inputs.loadings.combinations.length)
})

test('copied outer/hole/steel blocks and optional technical IDs retain explicit identity semantics', async () => {
  const p = example(), book = await readBook(p), section = book.getWorksheet('Section')!, materials = book.getWorksheet('Material')!
  section.addRows([[], ['Outer', 2], ['x (mm)', 'y (mm)'], [2000, 0], [2600, 0], [2600, 600], [2000, 600],
    [], ['Hole', 3], ['x (mm)', 'y (mm)'], [2200, 200], [2200, 400], [2400, 400], [2400, 200]])
  const start = marker(book, 'Material', 'Steel'), sourceRows = []
  // Native Excel can save an ordinary note as multiple formatted text runs.
  materials.getCell(start, 1).note = { texts: [{ text: 'Input template: ' }, { text: 'STEEL:1', font: { name: 'Arial' } }] }
  for (let n = start; n <= materials.rowCount; n++) sourceRows.push({ values: materials.getRow(n).values, notes: [materials.getCell(n, 1).note, materials.getCell(n, 2).note] })
  materials.addRow([])
  const copied = materials.rowCount + 1
  sourceRows.forEach(source => { const r = materials.addRow(source.values); source.notes.forEach((note, i) => { if (note) r.getCell(i + 1).note = note }) })
  materials.getCell(copied, 2).value = 2
  const q = await imported(book)
  assert.equal(q.inputs.geometry.outers.length, 2)
  assert.equal(q.inputs.geometry.outers[1].holes[0].id, 3)
  assert.equal(q.inputs.materials.steel.length, 2)
  assert.equal(q.inputs.materials.steel[1].id, 2)
  assert.equal(new Set(q.inputs.geometry.outers.flatMap(outer => [...outer.points, ...outer.holes.flatMap(hole => hole.points)]).map(point => point.id)).size,
    q.inputs.geometry.outers.flatMap(outer => [...outer.points, ...outer.holes.flatMap(hole => hole.points)]).length)
})

test('blank rows, moved tables and reordered columns retain cells and their exact unit provenance', async () => {
  const p = example(), book = await readBook(p, UNIT_PRESETS.us)
  for (const ws of book.worksheets) {
    const rows: Array<{ values: ExcelJS.CellValue[]; notes: Array<ExcelJS.Cell['note'] | undefined> }> = []
    ws.eachRow(row => rows.push({ values: (row.values as ExcelJS.CellValue[]).slice(1), notes: Array.from({ length: row.cellCount }, (_, i) => row.getCell(i + 1).note) }))
    const name = ws.name
    book.removeWorksheet(ws.id)
    const moved = book.addWorksheet(name)
    moved.addRow(['# Custom note'])
    for (const source of rows) {
      // Unit and loading columns are identified by their headers, not their positions.
      const order = name === 'Units' && source.values.length === 2 ? [1, 0]
        : name === 'Loadings' && source.values.length > 2 ? [2, 0, 3, 1, 4] : source.values.map((_, i) => i)
      moved.addRow([])
      const r = moved.addRow([null, null, ...order.map(i => source.values[i])])
      order.forEach((index, i) => { const note = source.notes[index]; if (note) r.getCell(i + 3).note = note })
    }
  }
  assert.deepEqual(await imported(book), p)
})

test('deleted Mesh or check-basis fields fail instead of silently selecting JSON defaults', async () => {
  const p = example(); p.inputs.loadings.checkBasis = 'constantAxial'
  for (const [sheet, name] of [['Project', 'Check basis'], ['Options', 'Mesh sizing'], ['Options', 'Divisions'], ['Options', 'Cell limit'], ['Options', 'Subdivision limit']]) {
    const book = await readBook(p); removeField(book, sheet, name)
    const result = await importBook(book)
    assert.equal(result.ok, false, name)
    if (!result.ok) assert.match(result.error, /missing/i)
  }
  for (const kind of ['mesh', 'basis']) {
    const book = await readBook(p), metadata = JSON.parse(book.description)
    if (kind === 'mesh') {
      const group = metadata.groups.find((group: { keyword: string }) => group.keyword === 'ANALYSIS')
      group.paths = group.paths.filter((path: string) => !path.startsWith('mesh.'))
      for (const name of ['Mesh sizing', 'Divisions', 'Cell limit', 'Subdivision limit']) removeField(book, 'Options', name)
    } else {
      const group = metadata.groups.find((group: { keyword: string }) => group.keyword === 'PROJECT_METADATA')
      group.paths = group.paths.filter((path: string) => path !== 'inputs.loadCheckBasis')
      metadata.checkBasisPresent = false
      removeField(book, 'Project', 'Check basis')
    }
    book.description = JSON.stringify(metadata)
    assert.equal((await importBook(book)).ok, false, `${kind}: metadata cannot authorize a missing v1 control`)
  }
})

test('unit headers must agree with the one Units declaration', async () => {
  const book = await readBook()
  field(book, 'Units', 'Force').value = 'kN'
  const result = await importBook(book)
  assert.equal(result.ok, false)
  if (!result.ok) assert.match(result.error, /unit|header/i)
})

test('explicitly edited option branches and indexed directions use only their newly authored cells', async () => {
  const p = example()
  p.inputs.materials.steel[0].stressStrain = { type: 'linear-hardening', ultimateStrength: { type: 'ratio', ratio: 1.08 }, epsUk: .05, strainLimit: { type: 'factor', value: .9 } }
  const book = await readBook(canonical(p))
  field(book, 'Material', 'Peak input').value = 'fu'
  const strength = field(book, 'Material', 'k = fu/fy (1)')
  strength.worksheet.getCell(Number(strength.row), 1).value = 'fu (MPa)'
  strength.value = 550
  field(book, 'Material', 'Cutoff input').value = 'εud'
  const cutoff = field(book, 'Material', 'αε (1)')
  cutoff.worksheet.getCell(Number(cutoff.row), 1).value = 'εud (1)'
  cutoff.value = .04
  field(book, 'Options', 'Mesh sizing').value = 'Fixed h'
  const divisions = field(book, 'Options', 'Divisions')
  divisions.worksheet.getCell(Number(divisions.row), 1).value = 'h (mm)'
  divisions.value = 20
  const q = await imported(book)
  assert.deepEqual(q.inputs.materials.steel[0].stressStrain, { type: 'linear-hardening', ultimateStrength: { type: 'stress', stress: 550 }, epsUk: .05, strainLimit: { type: 'absolute', value: .04 } })
  if (q.inputs.analysis.methodId === 'strain-domain-surface-v1') assert.deepEqual(q.inputs.analysis.mesh.sizing, { type: 'fixed', cellSize: 20 })
  const explicit = example()
  assert.equal(explicit.inputs.analysis.methodId, 'strain-domain-surface-v1')
  if (explicit.inputs.analysis.methodId === 'strain-domain-surface-v1') explicit.inputs.analysis.directions.seed = { type: 'explicit', anglesDeg: [0, 90, 180, 270] }
  const angles = await readBook(canonical(explicit)), options = angles.getWorksheet('Options')!
  options.spliceRows(Number(field(angles, 'Options', 'β4 (deg)').row), 1)
  options.spliceRows(marker(angles, 'Options', 'Points'), 0, ['β4 (deg)', 210], ['β5 (deg)', 300])
  const edited = await imported(angles)
  if (edited.inputs.analysis.methodId === 'strain-domain-surface-v1') assert.deepEqual(edited.inputs.analysis.directions.seed, { type: 'explicit', anglesDeg: [0, 90, 180, 210, 300] })
})

test('metadata cannot shadow input values or grant reviewed/verified status', async () => {
  for (const kind of ['shadow', 'status'] as const) {
    const book = await readBook(), metadata = JSON.parse(book.description)
    if (kind === 'shadow') metadata.groups.find((group: { keyword: string }) => group.keyword === 'CONCRETE').stored.push({ path: 'fck', value: 99 })
    else metadata.groups.find((group: { keyword: string }) => group.keyword === 'RESISTANCE').stored.find((field: { path: string }) => field.path === 'verificationStatus').value = 'verified'
    book.description = JSON.stringify(metadata)
    assert.equal((await importBook(book)).ok, false, kind)
  }
})

test('inactive or mismatched model/format fields are rejected instead of silently discarded', async () => {
  const cases: Array<[string, string, number]> = [['Material', 'Hardening ratio', .02], ['Resistance', 'emin (mm)', 25], ['Options', 'Points tolerance', .01]]
  for (const [sheet, label, value] of cases) {
    const book = await readBook()
    if (sheet === 'Options') book.getWorksheet(sheet)!.spliceRows(marker(book, sheet, 'Points'), 0, [label, value])
    else book.getWorksheet(sheet)!.addRow([label, value])
    assert.equal((await importBook(book)).ok, false, label)
  }
  const p = example(), profileId = 'en-1992-1-1-2004-stress-strain'
  const book = await readBook(canonical(createProjectDocument({ calculationProfileId: profileId,
    geometry: p.inputs.geometry, materials: applyCalculationProfileToMaterials(p.inputs.materials, profileId) })))
  book.getWorksheet('Resistance')!.addRow(['φt', .8])
  assert.equal((await importBook(book)).ok, false)
})

test('an explicitly complete Adaptive input block can replace Fixed controls without hidden defaults', async () => {
  const fixed = await readBook(), p = example()
  p.inputs.analysis = createAdaptiveAnalysisOptions()
  const adaptive = await readBook(canonical(p)), source = adaptive.getWorksheet('Options')!, target = fixed.getWorksheet('Options')!
  for (let index = marker(adaptive, 'Options', 'Sampling') + 2; index < marker(adaptive, 'Options', 'Points'); index++) {
    const row = source.getRow(index), label = row.getCell(1).value
    if (typeof label !== 'string') continue
    const existing = target.getRows(1, marker(fixed, 'Options', 'Points') - 1)!.find(row => row.getCell(1).value === label)
    if (existing) existing.getCell(2).value = row.getCell(2).value
    else target.spliceRows(marker(fixed, 'Options', 'Points'), 0, [label, row.getCell(2).value])
  }
  field(fixed, 'Options', 'Point set').value = 'Custom'
  const changed = await imported(fixed)
  assert.equal(changed.inputs.analysis.samplingMode, 'adaptive')
  assert.equal(changed.inputs.analysis.methodId, 'strain-domain-surface-v1')
  if (changed.inputs.analysis.methodId === 'strain-domain-surface-v1') {
    assert.deepEqual(changed.inputs.analysis.stations.refinement, p.inputs.analysis.stations.refinement)
    assert.deepEqual(changed.inputs.analysis.directions, p.inputs.analysis.directions)
  }
})

test('unknown format, missing metadata/units, duplicate inputs, formulas and broken references fail without mutating the source', async () => {
  const p = example(), before = JSON.stringify(p)
  const cases: Array<(book: ExcelJS.Workbook) => void> = [
    book => { book.subject = 'Unrecognized workbook' }, book => { book.description = '' },
    book => { book.removeWorksheet('Units') }, book => { book.removeWorksheet('Options') }, book => { book.removeWorksheet('Resistance') },
    book => { book.getWorksheet('Material')!.addRow(['fy (MPa)', 999]) },
    book => { field(book, 'Material', 'fck (MPa)').value = { formula: '20+10', result: 30 } },
    book => { field(book, 'Material', 'Default steel').value = -1 },
    book => { book.getWorksheet('Units')!.addRow(['Force', 'N']) },
    book => { book.getWorksheet('Section')!.addRows([['Outer', 1], ['x (mm)', 'y (mm)']]) },
    book => { book.addWorksheet('Project copy').addRow(['conflicting source']) }
  ]
  for (const mutate of cases) { const book = await readBook(p); mutate(book); assert.equal((await importBook(book)).ok, false) }
  assert.equal(JSON.stringify(p), before)
  assert.equal((await importProjectWorkbook(new ArrayBuffer(10 * 1024 * 1024 + 1))).ok, false)
  assert.equal((await importProjectWorkbook(new Uint8Array([1, 2, 3]).buffer)).ok, false)
})
