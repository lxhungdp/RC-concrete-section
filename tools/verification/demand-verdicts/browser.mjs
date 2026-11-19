/** Actual-worker verdict matrix; PM_PLAYWRIGHT_MODULE may point to an installed test runtime. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { createProjectDocument, serializeProjectDocument } from '@pm/project'
import { checkLoadcasesUtilizationFromSurface } from '@pm/analysis'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PM_PLAYWRIGHT_MODULE ?? 'playwright')
const { buildPreviewSurfaceFallback } = require('../../../apps/web/application/analysis/fallback.ts')
const { boundaryScaledLoads, routeName, verdictInput, verdictRoutes } = require('../../../apps/web/test/support/demand-verdicts.ts')
const out = process.env.PM_EVIDENCE_DIR ?? 'outputs/verdict-audit'
await mkdir(out, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const evidence = []
let activePage
const labels = { adequate: 'OK', inadequate: 'NG', indeterminate: 'CHECK' }

try {
  const cases = process.argv.includes('--failure-only') ? [] :
    verdictRoutes.flatMap(route => ['fixed', 'adaptive'].map(mode => ({ route, mode })))
  cases.push({ route: { profileId: 'kds-142020-equivalent-block', appendix: false, hardening: true }, mode: 'adaptive', shape: 'KDS-EB-01-rectangle-8-bars' })
  for (const { route, mode, shape } of cases) {
    const input = verdictInput(route, mode, shape)
    const { surface } = buildPreviewSurfaceFallback(input)
    const loadcases = ['proportional3D', 'constantAxial'].flatMap((basis, group) =>
      boundaryScaledLoads(surface, basis, [0.91, 1, 1.1]).map((load, index) =>
        ({ ...load, id: group * 3 + index + 1, name: `${basis} ${load.name}` })))
    const project = createProjectDocument({ calculationProfileId: input.calculationProfileId, geometry: input.geometry,
      materials: input.materialStore, design: input.designBasis, analysis: input.analysisOptions,
      loadings: { combinations: loadcases, checkBasis: 'proportional3D' } })
    const name = `${routeName(route).replaceAll('/', '-')}-${mode}${shape ? '-hollow' : ''}`
    const fixture = `${out}/${name}.pm-project.json`
    await writeFile(fixture, serializeProjectDocument(project))
    const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } })
    activePage = page
    page.setDefaultTimeout(90000)
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript(() => {
      window.__pmVerdict = { checks: [], surfaces: [] }
      const NativeWorker = window.Worker
      window.Worker = class extends NativeWorker {
        constructor(...args) {
          super(...args)
          this.addEventListener('message', ({ data }) => {
            if (data.type === 'success' && data.requestType === 'checkLoadcases') window.__pmVerdict.checks.push(data.result)
            if (data.type === 'success' && data.requestType === 'buildSurface') window.__pmVerdict.surfaces.push({
              profile: data.result.surface.calculationProfileId,
              direction: data.result.surface.directionError, station: data.result.surface.stationError
            })
          })
        }
      }
    })
    await page.goto(process.env.PM_TEST_URL ?? 'http://127.0.0.1:3001', { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: 'Project menu' }).click()
    await page.getByLabel('Project file format').selectOption('json')
    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'Import project from JSON' }).click()
    await (await chooser).setFiles(fixture)
    await page.getByRole('button', { name: 'Demand Check', exact: true }).click()
    const record = { route: routeName(route), mode, shape: shape ?? 'rectangle', bases: [] }
    for (const basis of ['proportional3D', 'constantAxial']) {
      if (basis === 'constantAxial') await page.getByRole('radio', { name: 'Constant P', exact: true }).check()
      const expected = checkLoadcasesUtilizationFromSurface(surface, loadcases, basis)
      const cells = expected.map(check => `${check.utilization === null ? '—' : check.utilization.toFixed(2)} ${labels[check.adequacy]}`)
      await page.waitForFunction(({ expectedCells, definition }) => {
        const actual = [...document.querySelectorAll('.pm-loadcase-ur')].map(cell => cell.innerText.replace(/\s+/g, ' ').trim())
        const batch = window.__pmVerdict.checks.findLast(batch => batch.length === expectedCells.length &&
          batch.every(check => check.utilizationDefinition === definition))
        return JSON.stringify(actual) === JSON.stringify(expectedCells) && !!batch
      }, { expectedCells: cells, definition: basis })
      const worker = await page.evaluate(definition => window.__pmVerdict.checks.findLast(batch =>
        batch.length === 6 && batch.every(check => check.utilizationDefinition === definition)), basis)
      assert.ok(worker, 'the actual worker must supply the batch; fallback alone is insufficient')
      worker.forEach((check, index) => {
        assert.equal(check.adequacy, expected[index].adequacy)
        assert.equal(check.utilizationInterval.evidence, expected[index].utilizationInterval.evidence)
        if (check.utilization !== null) assert.ok(Math.abs(check.utilization - expected[index].utilization) < 1e-9)
      })
      const titles = await page.locator('.pm-loadcase-ur').evaluateAll(nodes => nodes.map(node => node.title))
      worker.forEach((check, index) => assert.ok(titles[index].includes(check.message)))
      record.bases.push({ basis, cells, messages: worker.map(check => check.message) })
    }
    if (shape) {
      await page.locator('tbody tr').filter({ has: page.locator('.pm-loadcase-ur') }).first().click()
      await page.getByRole('button', { name: 'Detail calculation', exact: true }).click()
      const dialog = page.getByRole('dialog')
      await dialog.getByText(/steel-limit\/pole interval/).waitFor()
      assert.equal(await dialog.getByText(/interval crosses the decision boundary/).count(), 0)
      await dialog.getByText(/steel-limit\/pole interval/).scrollIntoViewIfNeeded()
      await page.screenshot({ path: `${out}/unconverged-adaptive-detail.png`, fullPage: true })
      await page.keyboard.press('Escape')
      await page.setViewportSize({ width: 360, height: 900 })
      await page.locator('button[title="Theme"]').click()
      await page.getByRole('button', { name: 'Detail calculation', exact: true }).click()
      await page.getByRole('dialog').getByText(/steel-limit\/pole interval/).scrollIntoViewIfNeeded()
      await page.screenshot({ path: `${out}/unconverged-adaptive-narrow-dark.png`, fullPage: true })
    }
    assert.deepEqual(errors, [])
    evidence.push(record)
    console.log(`${name}: both bases match worker and fallback`)
    await page.close()
  }
  await writeFile(`${out}/browser.json`, JSON.stringify(evidence, null, 2))
  console.log(`Verified ${evidence.length} profile/mode/shape configurations and ${evidence.length * 12} table verdicts through actual workers.`)
} catch (error) {
  if (activePage && !activePage.isClosed()) await activePage.screenshot({ path: `${out}/browser-failure.png`, fullPage: true })
  throw error
} finally { await browser.close() }
