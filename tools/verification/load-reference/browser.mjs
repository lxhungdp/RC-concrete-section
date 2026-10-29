/** Production load-reference draft/Apply/Convert and centroidal-chart invariants. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createLoadCombination, createProjectDocument, parseProjectDocument, serializeProjectDocument } from '@pm/project'
import { geometryInputRebars, sectionGeometryFromGeometryInput } from '@pm/geometry'
import { checkLoadcaseUtilizationFromSurface } from '@pm/analysis'
import { editableQuantity, fromCanonical, toCanonical, UNIT_PRESETS } from '@pm/units'

const require = createRequire(import.meta.url)
const { buildPreviewSurfaceFallback } = require('../../../apps/web/application/analysis/fallback.ts')
const { chromium } = require(process.env.PM_PLAYWRIGHT_MODULE ?? 'playwright')
const out = 'outputs/load-reference'
await mkdir(out, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const evidence = []
let activePage
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) <= 16 * Number.EPSILON * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`)
const plots = page => page.evaluate(() => Object.fromEntries(['fixedP', 'vertical'].map(id => [id,
  [...(document.querySelector(`[data-chart="${id}"] .js-plotly-plot`)?.data ?? [])]
    .map(trace => ({ name: trace.name, x: Array.from(trace.x ?? []), y: Array.from(trace.y ?? []) }))])))
const exportProject = async (page, name) => {
  await page.getByRole('button', { name: 'Project menu' }).click()
  await page.getByLabel('Project file format').selectOption('json')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export project to JSON', exact: true }).click()
  const saved = await download
  await saved.saveAs(`${out}/${name}.json`)
  return JSON.parse(await readFile(`${out}/${name}.json`, 'utf8'))
}
const importProject = async (page, file) => {
  await page.getByRole('button', { name: 'Project menu' }).click()
  await page.getByLabel('Project file format').selectOption('json')
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Import project from JSON' }).click()
  await (await chooser).setFiles(file)
}
const settled = async page => {
  await page.waitForFunction(() => document.querySelector('.pm-results-stage')?.getAttribute('aria-busy') === 'false')
  await page.waitForFunction(() => document.querySelector('[data-chart="vertical"] .js-plotly-plot')?.data?.some(trace => trace.x?.length > 3))
}
const axes = page => page.locator('.pm-section-moment-axes').evaluate(el => ({ x: Number(el.dataset.originX), y: Number(el.dataset.originY) }))
try {
  for (const [mechanics, file] of [
    ['stress-strain', 'docs/examples/realistic-sections/KDS-REAL-05-complex-stress-strain.pm-project.json'],
    ['equivalent-block', 'docs/examples/equivalent-block/ACI-EB-01-rectangle-8-bars.pm-project.json']
  ]) {
    const parsed = parseProjectDocument(await readFile(file, 'utf8')); assert.ok(parsed.ok)
    const project = createProjectDocument({ ...parsed.document.inputs, meta: parsed.document.meta })
    const { geometry, materials, analysis, design, calculationProfileId } = project.inputs
    const { surface } = buildPreviewSurfaceFallback({ section: sectionGeometryFromGeometryInput(geometry),
      rebars: geometryInputRebars(geometry), materialStore: materials, analysisOptions: analysis, designBasis: design, calculationProfileId })
    const crossing = checkLoadcaseUtilizationFromSurface(surface, createLoadCombination({ P: 2e6, Mx: 800e6, My: 350e6 })).capacityPoint
    assert.ok(crossing)
    project.inputs.loadings.combinations = [0.5, 2].map((scale, index) => createLoadCombination({ id: index + 1,
      name: index ? 'NG biaxial' : 'Inside', P: crossing.P * scale, Mx: crossing.Mx * scale, My: crossing.My * scale }))
    const fixture = `${out}/${mechanics}.pm-project.json`
    await writeFile(fixture, serializeProjectDocument(project))
    const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } }); activePage = page
    page.setDefaultTimeout(30000)
    const errors = []; page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript(() => {
      window.__referenceAudit = { jobs: [], results: {}, failures: [] }
      const OriginalWorker = window.Worker
      window.Worker = class extends OriginalWorker {
        constructor(...args) { super(...args); this.addEventListener('message', ({ data }) => {
          if (data.type === 'error') window.__referenceAudit.failures.push(data)
          if (data.type === 'success' && data.requestType === 'checkLoadcase') window.__referenceAudit.results[data.result.loadcaseId] = data.result
        }) }
        postMessage(message, ...rest) { window.__referenceAudit.jobs.push(message.type); return super.postMessage(message, ...rest) }
      }
    })
    await page.goto(process.env.PM_TEST_URL ?? 'http://127.0.0.1:3212', { waitUntil: 'networkidle' })
    await importProject(page, fixture)
    console.log(`${mechanics}: project imported`)
    await page.getByRole('button', { name: 'Demand Check', exact: true }).click()
    await page.getByRole('table', { name: 'Loadcase demand table' }).locator('tr')
      .filter({ has: page.getByLabel('Loadcase 2 name', { exact: true }) }).locator('td').nth(5).click()
    await settled(page)
    await page.getByText('Direct β', { exact: true }).click(); await settled(page)
    const beforePlots = await plots(page)
    const origin = await axes(page)
    const beforeResult = await page.evaluate(() => window.__referenceAudit.results[2])
    assert.ok(beforeResult)
    const beforeJobs = await page.evaluate(() => window.__referenceAudit.jobs.length)
    const panel = page.getByRole('region', { name: 'Load reference', exact: true })
    const x = panel.getByLabel(/Load reference offset X/), y = panel.getByLabel(/Load reference offset Y/)
    const convert = panel.getByRole('checkbox', { name: 'Convert existing loadcases' })
    await convert.waitFor(); assert.equal(await convert.isChecked(), false)
    assert.equal(await x.getAttribute('type'), 'number'); assert.equal(await y.getAttribute('type'), 'number')
    await x.fill('125')
    console.log(`${mechanics}: offset draft ${await x.inputValue()}`)
    await page.waitForFunction(({ x, y }) => {
      const axes = document.querySelector('.pm-section-moment-axes')
      return axes && Number(axes.dataset.originX) === x && Number(axes.dataset.originY) === y
    }, { x: origin.x + 125, y: origin.y })
    // Click both native mouse spinner targets while the edit is still focused.
    const box = await x.boundingBox(); assert.ok(box)
    await page.mouse.click(box.x + box.width - 7, box.y + box.height * 0.25)
    assert.equal(Number(await x.inputValue()), 126)
    await page.mouse.click(box.x + box.width - 7, box.y + box.height * 0.75)
    assert.equal(Number(await x.inputValue()), 125)
    await y.fill('-75'); await y.press('Tab')
    assert.deepEqual(await plots(page), beforePlots, 'draft axes cannot alter centroidal curves')
    const draftSaved = await exportProject(page, `${mechanics}-draft`)
    assert.deepEqual(draftSaved.inputs.loadings, project.inputs.loadings, 'drafts are not applied or persisted')
    await convert.check(); await panel.getByRole('button', { name: 'Apply', exact: true }).click()
    await page.getByText('Axis preview — Apply to update the load reference.', { exact: true }).waitFor({ state: 'hidden' })
    const convertedSaved = await exportProject(page, `${mechanics}-converted`)
    console.log(`${mechanics}: Convert applied`)
    assert.deepEqual(convertedSaved.inputs.loadings.combinations, project.inputs.loadings.combinations)
    assert.deepEqual(convertedSaved.inputs.loadings.reference, { kind: 'centroid-offset', offsetX: 125, offsetY: -75 })
    assert.deepEqual(await plots(page), beforePlots, 'Apply + Convert cannot move centroidal Fixed-P/Direct plots')
    assert.deepEqual(await page.evaluate(() => window.__referenceAudit.results[2]), beforeResult)
    assert.ok(!(await page.evaluate(start => window.__referenceAudit.jobs.slice(start), beforeJobs)).includes('buildSurface'))
    const checkStyle = await convert.locator('..').evaluate(el => ({ border: getComputedStyle(el).borderTopWidth,
      height: el.getBoundingClientRect().height, buttonX: el.parentElement.querySelector('button').getBoundingClientRect().x,
      labelRight: el.getBoundingClientRect().right }))
    assert.equal(checkStyle.border, '0px'); assert.ok(checkStyle.buttonX >= checkStyle.labelRight)
    assert.deepEqual(await axes(page), { x: origin.x + 125, y: origin.y - 75 })
    await page.screenshot({ path: `${out}/${mechanics}-converted-light.png` })
    // Without Convert, the displayed old numbers acquire the new origin's lever arms.
    await x.fill('-40'); await x.press('Tab'); await y.fill('30'); await y.press('Tab')
    assert.equal(await convert.isChecked(), false)
    await panel.getByRole('button', { name: 'Apply', exact: true }).click()
    const reinterpreted = await exportProject(page, `${mechanics}-reinterpreted`)
    console.log(`${mechanics}: unchecked Apply`)
    const expected = project.inputs.loadings.combinations.map(load => ({ ...load,
      Mx: load.Mx + load.P * 105, My: load.My + load.P * -165 }))
    assert.deepEqual(reinterpreted.inputs.loadings.combinations, expected)
    await page.waitForFunction(load => window.__referenceAudit.results[2]?.demand.Mx === load.Mx &&
      window.__referenceAudit.results[2]?.demand.My === load.My, expected[1])
    await settled(page)
    assert.ok(Math.abs((await page.evaluate(() => window.__referenceAudit.results[2].utilization)) - beforeResult.utilization) > 1e-6)
    // A newly authored pure axial load is applied at the current input origin, not at C.
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await page.getByLabel(/Loadcase 3 Pu/).fill('1000'); await page.getByLabel(/Loadcase 3 Pu/).press('Tab')
    const added = await exportProject(page, `${mechanics}-new-load`)
    const newLoad = added.inputs.loadings.combinations.find(load => load.id === 3)
    assert.ok(newLoad); assert.deepEqual({ P: newLoad.P, Mx: newLoad.Mx, My: newLoad.My }, { P: 1e6, Mx: 30e6, My: -40e6 })
    await page.getByRole('table', { name: 'Loadcase demand table' }).locator('tr')
      .filter({ has: page.getByLabel('Loadcase 2 name', { exact: true }) }).locator('td').nth(5).click()
    await settled(page)
    const beforeUnitsPlots = await plots(page)
    const beforeUnitsResult = await page.evaluate(() => structuredClone(window.__referenceAudit.results[2]))
    await page.getByRole('button', { name: 'Options', exact: true }).click()
    await page.getByRole('tab', { name: 'Units', exact: true }).click()
    await page.getByLabel('Display unit preset').selectOption('us')
    await page.getByRole('button', { name: 'Demand Check', exact: true }).click(); await settled(page)
    const usFixed = (await plots(page)).fixedP.find(trace => trace.name === 'Demand point')
    assert.ok(usFixed)
    close(usFixed.x[0], fromCanonical('moment', expected[1].Mx, UNIT_PRESETS.us))
    close(usFixed.y[0], fromCanonical('moment', expected[1].My, UNIT_PRESETS.us))
    // Exercise the first native mouse step from a rounded inch readout, then cancel it.
    const usBox = await x.boundingBox(); assert.ok(usBox)
    await page.mouse.click(usBox.x + usBox.width - 7, usBox.y + usBox.height * 0.25)
    const stepped = Number(await x.inputValue())
    assert.notEqual(stepped, fromCanonical('length', -40, UNIT_PRESETS.us))
    await page.waitForFunction(expectedX => Number(document.querySelector('.pm-section-moment-axes')?.dataset.originX) === expectedX,
      origin.x + toCanonical('length', stepped, UNIT_PRESETS.us))
    await x.press('Escape')
    // Focus opens the full-precision editor before replacing the rounded resting text.
    await x.click()
    await page.waitForFunction(text => document.querySelector('[aria-label="Load reference offset X (in)"]')?.value === text,
      editableQuantity('length', -40, UNIT_PRESETS.us))
    await x.fill('5'); assert.equal(Number(await x.inputValue()), 5)
    await x.press('Tab'); console.log(`${mechanics}: US X committed ${await x.inputValue()}`)
    await y.click()
    await page.waitForFunction(text => document.querySelector('[aria-label="Load reference offset Y (in)"]')?.value === text,
      editableQuantity('length', 30, UNIT_PRESETS.us))
    await y.fill('2'); await y.press('Tab')
    await convert.check(); await panel.getByRole('button', { name: 'Apply', exact: true }).click()
    const inUS = await exportProject(page, `${mechanics}-us-converted`)
    assert.deepEqual(inUS.inputs.loadings.combinations, added.inputs.loadings.combinations)
    assert.deepEqual(inUS.inputs.loadings.reference, { kind: 'centroid-offset', offsetX: 127, offsetY: 50.8 })
    assert.deepEqual(await page.evaluate(() => window.__referenceAudit.results[2]), beforeUnitsResult)
    await page.getByRole('button', { name: 'Options', exact: true }).click()
    await page.getByRole('tab', { name: 'Units', exact: true }).click()
    await page.getByLabel('Display unit preset').selectOption('metric')
    await page.getByRole('button', { name: 'Demand Check', exact: true }).click(); await settled(page)
    assert.deepEqual(await plots(page), beforeUnitsPlots, 'unit round trip and Convert preserve centroidal curves')
    console.log(`${mechanics}: US offset input and unit round trip`)
    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    await page.screenshot({ path: `${out}/${mechanics}-dark.png` })
    await page.setViewportSize({ width: 360, height: 900 })
    await panel.scrollIntoViewIfNeeded()
    const narrow = await panel.evaluate(el => ({ width: el.clientWidth, scrollWidth: el.scrollWidth }))
    assert.ok(narrow.scrollWidth <= narrow.width + 1)
    await page.screenshot({ path: `${out}/${mechanics}-phone.png` })
    assert.deepEqual(errors, []); assert.deepEqual(await page.evaluate(() => window.__referenceAudit.failures), [])
    evidence.push({ mechanics, nativeMouseSpinners: true, draftOnlyPreview: true, convertPreservesCanonicalAndUR: true,
      centroidalCurvesUnchanged: true, uncheckedReinterpretsInputs: true, newLoadsUseAppliedOrigin: true,
      usOffsetInputs: true, nativeUSSpinner: true, unitRoundTripPreservesCanonicalAndCurves: true, checkStyle, narrow, errors })
    // The drawing preview also works before the first loadcase exists.
    await page.setViewportSize({ width: 1600, height: 1100 })
    project.inputs.loadings.combinations = []
    await writeFile(`${out}/${mechanics}-empty.json`, serializeProjectDocument(project))
    await importProject(page, `${out}/${mechanics}-empty.json`)
    await page.getByText('Load reference axes', { exact: true }).waitFor()
    assert.equal(await convert.isChecked(), false)
    const emptyOrigin = await axes(page)
    await x.fill('10')
    await page.waitForFunction(expectedX => Number(document.querySelector('.pm-section-moment-axes')?.dataset.originX) === expectedX, emptyOrigin.x + 10)
    await x.press('Escape')
    await page.waitForFunction(expectedX => Number(document.querySelector('.pm-section-moment-axes')?.dataset.originX) === expectedX, emptyOrigin.x)
    assert.equal(await panel.getByRole('button', { name: 'Apply', exact: true }).isDisabled(), true)
    evidence.at(-1).emptyProjectPreviewAndEscape = true
    await page.screenshot({ path: `${out}/${mechanics}-empty.png` })
    await page.close()
  }
  await writeFile(`${out}/browser-evidence.json`, JSON.stringify(evidence, null, 2))
  console.log(JSON.stringify(evidence, null, 2))
} catch (error) {
  if (activePage && !activePage.isClosed()) { await activePage.screenshot({ path: `${out}/failure.png` }); console.error((await activePage.locator('body').innerText()).slice(-6000)) }
  throw error
} finally { await browser.close() }
