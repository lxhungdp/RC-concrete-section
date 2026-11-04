/** Demand Check basis switching: chart path, table UR, calculation detail, persistence and restore. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createLoadCombination, createProjectDocument, parseProjectDocument, serializeProjectDocument } from '@pm/project'
import { geometryInputRebars, sectionGeometryFromGeometryInput } from '@pm/geometry'
import { checkLoadcaseUtilizationFromSurface } from '@pm/analysis'

const require = createRequire(import.meta.url)
const { buildPreviewSurfaceFallback } = require('../../../apps/web/application/analysis/fallback.ts')
const { chromium } = require(process.env.PM_PLAYWRIGHT_MODULE ?? 'playwright')
const out = process.env.PM_EVIDENCE_DIR ?? 'outputs/constant-p-check'
await mkdir(out, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const evidence = []
let activePage

const importProject = async (page, file) => {
  await page.getByRole('button', { name: 'Project menu' }).click()
  await page.getByLabel('Project file format').selectOption('json')
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Import project from JSON' }).click()
  await (await chooser).setFiles(file)
}
const exportProject = async (page, name) => {
  await page.getByRole('button', { name: 'Project menu' }).click()
  await page.getByLabel('Project file format').selectOption('json')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export project to JSON', exact: true }).click()
  await (await download).saveAs(`${out}/${name}.json`)
  await page.keyboard.press('Escape')
  return JSON.parse(await readFile(`${out}/${name}.json`, 'utf8'))
}
const tableCells = page => page.locator('.pm-loadcase-ur').evaluateAll(cells => cells.map(cell => cell.innerText.replace(/\s+/g, ' ').trim()))
const chartPath = (page, label) => page.evaluate((name) => {
  const trace = [...(document.querySelector('[data-chart="vertical"] .js-plotly-plot')?.data ?? [])].find(item => item.name === name)
  return trace ? { x: Array.from(trace.x), y: Array.from(trace.y) } : null
}, label)
const waitForPath = (page, label) => page.waitForFunction((name) =>
  [...(document.querySelector('[data-chart="vertical"] .js-plotly-plot')?.data ?? [])].some(item => item.name === name), label)
const setBasis = (page, value) => page.getByRole('radio', { name: value, exact: true }).check()
const waitForTable = (page, previous) => page.waitForFunction((before) => {
  const now = [...document.querySelectorAll('.pm-loadcase-ur')].map(cell => cell.innerText.replace(/\s+/g, ' ').trim())
  return now.length > 0 && now.join('|') !== before.join('|') && now.every(text => /OK|NG|CHECK/.test(text))
}, previous)

try {
  for (const [mechanics, file] of [
    ['stress-strain', 'docs/examples/realistic-sections/KDS-REAL-05-complex-stress-strain.pm-project.json'],
    ['equivalent-block', 'docs/examples/equivalent-block/ACI-EB-03-l-shape-8-bars.pm-project.json']
  ]) {
    const parsed = parseProjectDocument(await readFile(file, 'utf8')); assert.ok(parsed.ok)
    const project = createProjectDocument({ ...parsed.document.inputs, meta: parsed.document.meta })
    const { geometry, materials, analysis, design, calculationProfileId } = project.inputs
    const { surface } = buildPreviewSurfaceFallback({ section: sectionGeometryFromGeometryInput(geometry),
      rebars: geometryInputRebars(geometry), materialStore: materials, analysisOptions: analysis, designBasis: design, calculationProfileId })
    const P = surface.bounds.P[0] + 0.6 * (surface.bounds.P[1] - surface.bounds.P[0])
    const seed = checkLoadcaseUtilizationFromSurface(surface, createLoadCombination({ P, Mx: 3e6, My: 1e6 }), 'constantAxial').capacityPoint
    assert.ok(seed)
    const load = (id, name, scale) => createLoadCombination({ id, name, P, Mx: seed.Mx * scale, My: seed.My * scale })
    project.inputs.loadings.combinations = [load(1, 'Inside', 0.6), load(2, 'Outside', 1.4)]
    const expected = project.inputs.loadings.combinations.map(item => checkLoadcaseUtilizationFromSurface(surface, item, 'constantAxial'))
    const fixture = `${out}/${mechanics}.pm-project.json`
    await writeFile(fixture, serializeProjectDocument(project))

    const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } }); activePage = page
    page.setDefaultTimeout(60000)
    const errors = []; page.on('pageerror', error => errors.push(error.message))
    await page.goto(process.env.PM_TEST_URL ?? 'http://127.0.0.1:3001', { waitUntil: 'networkidle' })
    await importProject(page, fixture)
    await page.getByRole('button', { name: 'Demand Check', exact: true }).click()
    await page.getByRole('row', { name: /Inside/ }).click()
    await page.waitForFunction(() => [...document.querySelectorAll('.pm-loadcase-ur')].length === 2 &&
      [...document.querySelectorAll('.pm-loadcase-ur')].every(cell => /OK|NG|CHECK/.test(cell.innerText)))
    await waitForPath(page, 'Proportional load path')
    const defaultCells = await tableCells(page)
    const defaultPath = await chartPath(page, 'Proportional load path')
    assert.equal(defaultPath.y[0], 0, 'the default path starts at the origin')

    await setBasis(page, 'Constant P')
    await waitForTable(page, defaultCells)
    await waitForPath(page, 'Constant-P load path')
    const heldCells = await tableCells(page)
    expected.forEach((check, index) => {
      assert.ok(heldCells[index].includes(check.utilization.toFixed(2)) || heldCells[index].includes(check.utilization.toFixed(3)),
        `${heldCells[index]} versus ${check.utilization}`)
      const verdict = ['OK', 'NG'][index]
      assert.ok(heldCells[index].includes(verdict), `${heldCells[index]} versus ${verdict}`)
    })
    const heldPath = await chartPath(page, 'Constant-P load path')
    const axial = heldPath.y[0]
    assert.ok(heldPath.y.every(value => Math.abs(value - axial) <= 1e-9 * Math.max(1, Math.abs(axial))), 'the checked path is horizontal')
    assert.equal(heldPath.x[0], 0)
    await page.screenshot({ path: `${out}/${mechanics}-constant-p.png`, fullPage: true })

    await page.getByRole('button', { name: 'Detail calculation' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByText('Constant-P Design-surface check').first().waitFor()
    await dialog.getByText('Secondary proportional 3D ratio').first().waitFor()
    await page.screenshot({ path: `${out}/${mechanics}-detail.png` })
    await page.keyboard.press('Escape')

    const saved = await exportProject(page, `${mechanics}-exported`)
    assert.equal(saved.inputs.loadings.checkBasis, 'constantAxial')

    const basisGroup = page.getByRole('radiogroup', { name: 'Check basis' })
    const basisChoices = await basisGroup.getByRole('radio').count()
    assert.equal(basisChoices, 2)
    assert.equal(await page.getByRole('radio', { name: 'Constant P', exact: true }).isChecked(), true)
    for (const width of [900, 360]) {
      await page.setViewportSize({ width, height: 900 })
      const box = await basisGroup.boundingBox()
      assert.ok(box && box.width > 80 && box.x + box.width <= width + 1, `radios fit at ${width} px`)
      const clipped = await basisGroup.evaluate(element => element.scrollWidth > element.clientWidth + 1)
      assert.equal(clipped, false, `radio labels stay inside the group at ${width} px`)
    }
    await page.locator('button[title="Theme"]').click()
    await page.screenshot({ path: `${out}/${mechanics}-narrow-toggled-theme.png`, fullPage: true })
    await page.locator('button[title="Theme"]').click()
    await page.setViewportSize({ width: 1600, height: 1100 })

    await setBasis(page, '3D load ray')
    await waitForTable(page, heldCells)
    await waitForPath(page, 'Proportional load path')
    assert.deepEqual(await tableCells(page), defaultCells, 'switching back restores the default table exactly')
    assert.deepEqual(await chartPath(page, 'Proportional load path'), defaultPath, 'switching back restores the default path exactly')
    assert.deepEqual(errors, [])
    evidence.push({ mechanics, defaultCells, heldCells, axialDisplay: axial })
    await page.close()
  }
  await writeFile(`${out}/browser-evidence.json`, JSON.stringify(evidence, null, 2))
  console.log(JSON.stringify(evidence, null, 2))
} catch (error) {
  if (activePage && !activePage.isClosed()) await activePage.screenshot({ path: `${out}/failure.png` })
  throw error
} finally { await browser.close() }
