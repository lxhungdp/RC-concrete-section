/** Real-menu regression for Demand Check -> Capacity -> Demand Check. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PM_PLAYWRIGHT_MODULE ?? 'playwright')
const out = process.env.PM_EVIDENCE_DIR ?? 'outputs/demand-navigation'
await mkdir(out, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } })
const errors = []
page.on('pageerror', error => errors.push(error.message))
page.setDefaultTimeout(90000)
await page.addInitScript(() => {
  window.__navigation = { jobs: [], failures: [], results: [] }
  const NativeWorker = window.Worker
  window.Worker = class extends NativeWorker {
    constructor(...args) {
      super(...args)
      this.addEventListener('message', ({ data }) => {
        if (data.type === 'error') window.__navigation.failures.push(data)
        if (data.type === 'success') window.__navigation.results.push({
          type: data.requestType, count: data.result?.points?.length,
          beta: data.result?.beta, loadcaseId: data.result?.loadcaseId
        })
      })
    }
    postMessage(data, ...rest) {
      window.__navigation.jobs.push({ type: data.type, beta: data.payload?.beta })
      return super.postMessage(data, ...rest)
    }
  }
})
const settled = () => page.waitForFunction(() => {
  const stage = document.querySelector('.pm-results-stage')
  const plot = document.querySelector('[data-chart="vertical"] .js-plotly-plot')
  return stage?.getAttribute('aria-busy') === 'false' && stage.dataset.fieldFrame === 'current' &&
    plot?.data?.length > 0 && !plot.classList.contains('is-updating')
})
const snapshot = () => page.locator('[data-chart="vertical"]').evaluate(el => ({
  header: el.querySelector('.pm-chart-header')?.textContent,
  traces: [...(el.querySelector('.js-plotly-plot')?.data ?? [])].map(t => ({
    name: t.name, visible: t.visible, x: [...(t.x ?? [])], y: [...(t.y ?? [])]
  })),
  drawingPaths: el.querySelectorAll('.scatterlayer .trace path.js-line').length,
  axes: {
    x: [...el.querySelector('.js-plotly-plot')._fullLayout.xaxis.range],
    y: [...el.querySelector('.js-plotly-plot')._fullLayout.yaxis.range]
  },
  frame: document.querySelector('.pm-results-stage')?.dataset.fieldFrame
}))
const roundTrip = async () => {
  await page.getByRole('button', { name: 'Capacity', exact: true }).click()
  await page.waitForSelector('[data-chart="surface3d"] .js-plotly-plot')
  await page.getByRole('button', { name: 'Demand Check', exact: true }).click()
  await settled()
}
const assertSameChart = (after, before) => {
  assert.deepEqual(after.traces, before.traces, 'All P-M data survive the menu round trip')
  assert.deepEqual(after.axes, before.axes, 'The P-M viewport still contains the resistance curves')
  assert.equal(after.drawingPaths, before.drawingPaths, 'The resistance paths remain drawn')
}
try {
  await page.goto(process.env.PM_TEST_URL ?? 'http://127.0.0.1:3001', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Project menu', exact: true }).click()
  await page.getByText('Example files', { exact: true }).click()
  await page.locator('.pm-project-menu__example').first().click()
  await page.getByRole('button', { name: 'Demand Check', exact: true }).click()
  await settled()
  const before = await snapshot()
  await page.screenshot({ path: out + '/before.png' })
  await roundTrip()
  const after = await snapshot()
  await page.screenshot({ path: out + '/after.png' })
  const jobs = await page.evaluate(() => window.__navigation)
  await writeFile(out + '/navigation.json', JSON.stringify({ before, after, jobs, errors }, null, 2))
  console.log(JSON.stringify({ before: before.traces.map(t => [t.name,t.x.length]), after: after.traces.map(t => [t.name,t.x.length]),
    axes: [before.axes,after.axes], paths: [before.drawingPaths,after.drawingPaths], errors, failures: jobs.failures }))
  assertSameChart(after, before)
  const scenarios = []
  if (!process.argv.includes('--repro-only')) {
    for (const theme of ['light', 'dark']) {
      if (theme === 'dark') await page.locator('button[title="Theme"]').click()
      for (const basis of ['3D load ray', 'Constant P']) {
        await page.getByRole('radio', { name: basis, exact: true }).check()
        await settled()
        for (const mode of ['Demand θ', 'Direct β']) {
          await page.getByLabel('Load-angle section θ', { exact: true }).setChecked(mode === 'Demand θ')
          await settled()
          await page.locator('[data-chart="vertical"] [data-title="Autoscale"]').click()
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
          const expected = await snapshot()
          await roundTrip()
          assertSameChart(await snapshot(), expected)
          await roundTrip()
          assertSameChart(await snapshot(), expected)
          scenarios.push({ theme, basis, mode, roundTrips: 2 })
        }
      }
    }
    await page.setViewportSize({ width: 390, height: 1000 })
    await settled()
    await page.locator('[data-chart="vertical"] [data-title="Autoscale"]').click()
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    const expected = await snapshot()
    await roundTrip()
    assertSameChart(await snapshot(), expected)
    await page.screenshot({ path: out + '/narrow-dark.png', fullPage: true })
    scenarios.push({ theme: 'dark', width: 390, roundTrips: 1 })
  }
  await writeFile(out + '/scenarios.json', JSON.stringify({ scenarios, errors,
    jobs: await page.evaluate(() => window.__navigation) }, null, 2))
  assert.deepEqual(errors, [])
} finally {
  await browser.close()
}
