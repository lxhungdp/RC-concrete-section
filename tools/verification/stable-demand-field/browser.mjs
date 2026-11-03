/** Stable demand CAD layout and coherent outgoing frames under delayed worker requests. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { parseProjectDocument, serializeProjectDocument } from '@pm/project'
import { geometryInputRebars, sectionGeometryFromGeometryInput } from '@pm/geometry'
import { checkLoadcaseUtilizationFromSurface, resolveLoadcaseField } from '@pm/analysis'

const require = createRequire(import.meta.url)
const { buildPreviewSurfaceFallback } = require('../../../apps/web/application/analysis/fallback.ts')
const { chromium } = require(process.env.PM_PLAYWRIGHT_MODULE ?? 'playwright')
const out = 'outputs/stable-demand-field'
await mkdir(out, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const evidence = []
let activePage
const rect = box => Object.fromEntries(['x', 'y', 'width', 'height'].map(key => [key, Math.round(box[key] * 100) / 100]))
const layout = page => page.locator('[data-chart="heatmap"]').evaluate(el => ({
  panel: el.getBoundingClientRect().toJSON(),
  drawing: el.querySelector('.pm-section-field-host').getBoundingClientRect().toJSON(),
  footer: el.querySelector('.pm-section-field-footer').getBoundingClientRect().toJSON(),
  axes: [...el.querySelectorAll('[data-axis]')].map(path => path.getAttribute('d')),
  cards: el.querySelectorAll('.pm-field-metric-card').length
}))
const sameLayout = (actual, expected, message) => {
  for (const key of ['panel', 'drawing', 'footer']) assert.deepEqual(rect(actual[key]), rect(expected[key]), `${message}: ${key}`)
  assert.equal(actual.cards, 4)
  assert.deepEqual(actual.axes, expected.axes, `${message}: geometry placement`)
}
const settled = async (page, id) => {
  await page.waitForFunction(id => {
    const stage = document.querySelector('.pm-results-stage')
    return stage?.getAttribute('aria-busy') === 'false' && stage.dataset.fieldFrame === 'current' && Number(stage.dataset.displayedLoadcase) === id
  }, id, { timeout: 90000 })
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
}
const select = (page, id) => page.getByRole('table', { name: 'Loadcase demand table' }).locator('tr')
  .filter({ has: page.getByLabel(`Loadcase ${id} name`, { exact: true }) }).locator('td.pm-col-ur').click()
const monitor = async page => page.evaluate(() => {
  const el = document.querySelector('[data-chart="heatmap"]')
  window.__watch = { renderer: el.querySelector('canvas, .pm-section-field-canvas'), canvas: el.querySelector('canvas'), source: el.querySelector('canvas')?.toDataURL(), samples: [], running: true }
  const sample = () => {
    const stage = document.querySelector('.pm-results-stage')
    const host = document.querySelector('[data-chart="heatmap"] .pm-section-field-host')
    window.__watch.samples.push({ frame: stage?.dataset.fieldFrame, requested: stage?.dataset.requestedLoadcase,
      displayed: stage?.dataset.displayedLoadcase, busy: stage?.getAttribute('aria-busy'), rect: host?.getBoundingClientRect().toJSON(),
      labelled: document.querySelector('.pm-section-field-status')?.textContent.includes('previous completed result'),
      mounted: window.__watch.renderer?.isConnected === true })
    if (window.__watch.running) requestAnimationFrame(sample)
  }
  requestAnimationFrame(sample)
})
const monitored = page => page.evaluate(() => { window.__watch.running = false; return window.__watch.samples })
const exportProject = async (page, name) => {
  await page.getByRole('button', { name: 'Project menu' }).click()
  await page.getByLabel('Project file format').selectOption('json')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export project to JSON', exact: true }).click()
  await (await download).saveAs(`${out}/${name}.json`)
  return JSON.parse(await readFile(`${out}/${name}.json`, 'utf8'))
}
try {
  for (const [mechanics, file] of [
    ['stress-strain', 'docs/examples/realistic-sections/KDS-REAL-05-complex-stress-strain.pm-project.json'],
    ['equivalent-block', 'docs/examples/equivalent-block/ACI-EB-01-rectangle-8-bars.pm-project.json']
  ]) {
    if (process.env.PM_MECHANICS && mechanics !== process.env.PM_MECHANICS) continue
    const parsed = parseProjectDocument(await readFile(file, 'utf8')); assert.ok(parsed.ok)
    const project = parsed.document
    const { geometry, materials, analysis, design, calculationProfileId } = project.inputs
    const { surface } = buildPreviewSurfaceFallback({ section: sectionGeometryFromGeometryInput(geometry), rebars: geometryInputRebars(geometry),
      materialStore: materials, analysisOptions: analysis, designBasis: design, calculationProfileId })
    const seed = { id: 1, name: 'Seed', actionBasis: 'factoredULS', P: 2e6, Mx: 800e6, My: 350e6 }
    const crossing = checkLoadcaseUtilizationFromSurface(surface, seed).capacityPoint; assert.ok(crossing)
    const combinations = [0.5, 2, 5].map((scale, i) => ({ ...seed, id: i + 1, name: ['Inside', 'NG', 'Large NG'][i],
      P: crossing.P * scale, Mx: crossing.Mx * scale, My: crossing.My * scale }))
    combinations.push({ ...seed, id: 4, name: 'Above Pmax', P: surface.bounds.P[1] * 2, Mx: 0, My: 0 },
      { ...seed, id: 5, name: 'Zero', P: 0, Mx: 0, My: 0 })
    project.inputs.loadings.combinations = combinations
    await writeFile(`${out}/${mechanics}.json`, serializeProjectDocument(project))
    const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } }); activePage = page
    const errors = []; page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript(() => {
      window.__stableAudit = { delay: 0, jobs: [], results: {}, failures: [] }
      const OriginalWorker = window.Worker
      window.Worker = class extends OriginalWorker {
        constructor(...args) { super(...args); this.addEventListener('message', ({ data }) => {
          if (data.type === 'success' && data.requestType === 'checkLoadcase') window.__stableAudit.results[data.result.loadcaseId] = data.result
          if (data.type === 'error') window.__stableAudit.failures.push(data)
        }) }
        postMessage(message, ...rest) {
          window.__stableAudit.jobs.push(message.type)
          if (window.__stableAudit.delay && ['buildFieldMap', 'buildExactDirection', 'checkLoadcase'].includes(message.type)) {
            setTimeout(() => super.postMessage(message, ...rest), window.__stableAudit.delay)
          } else super.postMessage(message, ...rest)
        }
      }
    })
    await page.goto(process.env.PM_TEST_URL ?? 'http://127.0.0.1:3213', { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: 'Project menu' }).click()
    await page.getByLabel('Project file format').selectOption('json')
    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'Import project from JSON' }).click()
    await (await chooser).setFiles(`${out}/${mechanics}.json`)
    await page.getByRole('button', { name: 'Demand Check', exact: true }).click()
    await page.waitForFunction(() => document.querySelector('[aria-label="Loadcase 2 name"]')?.value === 'NG')
    console.log(`${mechanics}: imported`)
    await select(page, 2); await settled(page, 2)
    const baseline = await layout(page)
    await page.evaluate(() => window.__stableAudit.delay = 650)
    const cases = []
    for (const id of [3, 4, 5, 1, 2]) {
      console.log(`${mechanics}: switching to ${id}`)
      await monitor(page)
      await select(page, id)
      await page.waitForFunction(() => document.querySelector('.pm-results-stage')?.dataset.fieldFrame === 'previous')
      assert.ok(await page.evaluate(() => document.querySelector('.pm-section-field-status').textContent.includes('previous completed result')))
      await settled(page, id)
      const samples = await monitored(page)
      assert.ok(samples.some(sample => sample.frame === 'previous' && sample.labelled))
      for (const sample of samples) {
        assert.ok(sample.rect, 'the CAD host remains mounted')
        assert.deepEqual(rect(sample.rect), rect(baseline.drawing), 'CAD box remains fixed during transition')
        if (sample.frame === 'previous') assert.ok(sample.mounted && sample.labelled)
        if (sample.frame === 'current') assert.equal(sample.requested, sample.displayed)
      }
      sameLayout(await layout(page), baseline, `${mechanics} load ${id}`)
      const result = await page.evaluate(id => window.__stableAudit.results[id], id)
      assert.equal(result.utilization, checkLoadcaseUtilizationFromSurface(surface, combinations[id - 1]).utilization)
      if (id === 4) {
        const field = resolveLoadcaseField(result, analysis.methodId)
        assert.equal(await page.locator('[data-before-cap-note]').count(),
          field.status === 'available' && field.basis === 'capacity' && field.boundary.kind === 'before-axial-cap' ? 1 : 0)
        await page.screenshot({ path: `${out}/${mechanics}-pmax-light.png` })
      }
      cases.push({ id, samples: samples.length, previous: samples.filter(s => s.frame === 'previous').length })
    }
    // Rapid selections must never promote a late cancelled frame.
    await monitor(page)
    await select(page, 3); await select(page, 4); await select(page, 2); await settled(page, 2)
    for (const sample of await monitored(page)) if (sample.frame === 'current') assert.equal(sample.displayed, sample.requested)
    const panel = page.getByRole('region', { name: 'Load reference', exact: true })
    const x = panel.getByLabel(/Load reference offset X/), y = panel.getByLabel(/Load reference offset Y/)
    const convert = panel.getByRole('checkbox', { name: 'Convert existing loadcases' })
    const originalResult = await page.evaluate(() => structuredClone(window.__stableAudit.results[2]))
    await x.click(); await x.fill('1600'); await x.press('Tab')
    await y.click(); await y.fill('-900'); await y.press('Tab')
    await page.waitForFunction(() => document.querySelector('.pm-section-moment-axes')?.dataset.originX !== '0')
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    const preview = await layout(page)
    await convert.check(); await monitor(page)
    const jobsBeforeConvert = await page.evaluate(() => window.__stableAudit.jobs.length)
    await panel.getByRole('button', { name: 'Apply', exact: true }).click(); await settled(page, 2)
    sameLayout(await layout(page), preview, 'Convert applies an already displayed origin')
    assert.ok(await page.evaluate(() => window.__watch.renderer === document.querySelector('[data-chart="heatmap"] canvas, [data-chart="heatmap"] .pm-section-field-canvas')))
    assert.deepEqual(await page.evaluate(() => window.__stableAudit.results[2]), originalResult)
    assert.equal(await page.evaluate(() => window.__stableAudit.jobs.length), jobsBeforeConvert)
    await monitored(page)
    const converted = await exportProject(page, `${mechanics}-converted`)
    assert.deepEqual(converted.inputs.loadings.combinations, combinations)
    // Move back inside the section: dropping the old, far-away applied origin must not refit on Apply.
    await x.click(); await x.fill('0'); await x.press('Tab')
    await y.click(); await y.fill('0'); await y.press('Tab')
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    const nextPreview = await layout(page)
    await monitor(page)
    await panel.getByRole('button', { name: 'Apply', exact: true }).click()
    await page.waitForFunction(() => document.querySelector('.pm-results-stage')?.dataset.fieldFrame === 'previous')
    assert.ok(await page.evaluate(() => window.__watch.renderer === document.querySelector('[data-chart="heatmap"] canvas, [data-chart="heatmap"] .pm-section-field-canvas')))
    assert.ok(await page.evaluate(() => !window.__watch.canvas || window.__watch.source === window.__watch.canvas.toDataURL()), 'previous image remains intact')
    await settled(page, 2)
    const applySamples = await monitored(page)
    for (const sample of applySamples) {
      assert.deepEqual(rect(sample.rect), rect(nextPreview.drawing))
      if (sample.frame === 'previous') assert.ok(sample.mounted && sample.labelled)
    }
    sameLayout(await layout(page), nextPreview, 'unchecked Apply keeps the preview fit and CAD box')
    const changed = await exportProject(page, `${mechanics}-reinterpreted`)
    const expected = combinations.map(load => ({ ...load, Mx: load.Mx + load.P * 900, My: load.My - load.P * 1600 }))
    assert.deepEqual(changed.inputs.loadings.combinations, expected)
    assert.equal(await page.evaluate(() => window.__stableAudit.results[2].utilization), checkLoadcaseUtilizationFromSurface(surface, expected[1]).utilization)
    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    await page.screenshot({ path: `${out}/${mechanics}-apply-dark.png` })
    for (const viewport of [{ width: 1600, height: 1100 }, { width: 360, height: 900 }]) {
      await page.setViewportSize(viewport); await settled(page, 2)
      const before = await layout(page)
      await select(page, 4); await settled(page, 4)
      sameLayout(await layout(page), before, 'responsive/theme Pmax layout')
      await select(page, 2); await settled(page, 2)
      await page.screenshot({ path: `${out}/${mechanics}-${viewport.width}.png` })
    }
    await page.setViewportSize({ width: 1600, height: 1100 }); await settled(page, 2)
    await page.locator('[data-chart="fixedP"]').getByTitle('Make this the large chart').click()
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    const secondary = await layout(page)
    await select(page, 4); await settled(page, 4)
    sameLayout(await layout(page), secondary, 'secondary CAD layout')
    await page.locator('[data-chart="heatmap"]').getByTitle('Hide chart', { exact: true }).click()
    await select(page, 3)
    await page.locator('.pm-results-frame-status').first().waitFor()
    await settled(page, 3)
    await page.getByRole('button', { name: 'Field', exact: true }).click()
    await settled(page, 3)
    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    await page.screenshot({ path: `${out}/${mechanics}-secondary-light.png` })
    assert.deepEqual(errors, [])
    assert.deepEqual(await page.evaluate(() => window.__stableAudit.failures), [])
    evidence.push({ mechanics, cases, applySamples: applySamples.length, unchangedCanonicalAndURWithConvert: true,
      changedDemandUsesExistingCheck: true, stableGeometryFit: true, rapidSelection: true, mobileAndDark: true, errors })
    await writeFile(`${out}/${mechanics}-evidence.json`, JSON.stringify(evidence.at(-1), null, 2))
    console.log(JSON.stringify(evidence.at(-1)))
    await page.close()
  }
  await writeFile(`${out}/browser-evidence.json`, JSON.stringify(evidence, null, 2))
} catch (error) {
  if (activePage && !activePage.isClosed()) {
    await activePage.screenshot({ path: `${out}/failure.png` })
    console.error((await activePage.locator('body').innerText()).slice(-6000))
  }
  throw error
} finally { await browser.close() }
