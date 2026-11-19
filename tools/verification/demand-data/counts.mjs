/** Compare exported coordinates with both the input traces and the rendered SVG paths/markers. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const { chromium } = createRequire(import.meta.url)(process.env.PM_PLAYWRIGHT_MODULE ?? 'playwright')
const out = process.env.PM_EVIDENCE_DIR ?? 'outputs/demand-point-counts'
await mkdir(out, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } })
page.setDefaultTimeout(60000)
const evidence = []
const errors = []
page.on('pageerror', error => errors.push(error.message))
await page.addInitScript(() => {
  window.__pmPlotJobs = 0
  const original = Worker.prototype.postMessage
  Worker.prototype.postMessage = function (...args) { window.__pmPlotJobs++; return original.apply(this, args) }
})
const settled = () => page.waitForFunction(() => {
  const stage = document.querySelector('.pm-results-stage')
  return stage?.getAttribute('aria-busy') === 'false' && stage.dataset.fieldFrame === 'current' &&
    ['fixedP', 'vertical'].every(id => {
      const plot = document.querySelector(`[data-chart="${id}"] .js-plotly-plot`)
      return plot?.data?.length && !plot.classList.contains('is-updating')
    })
})
const capture = async (label, checkData = true) => {
  await page.waitForFunction(() => ['fixedP', 'vertical'].every(id => {
    const plot = document.querySelector(`[data-chart="${id}"] .js-plotly-plot`)
    return plot?.data?.length && !plot.classList.contains('is-updating')
  }))
  for (const chart of ['fixedP', 'vertical']) {
    const panel = page.locator(`[data-chart="${chart}"]`)
    const traces = await panel.locator('.js-plotly-plot').evaluate(plot => plot.data.map((trace, index) => {
      const svg = [...plot.querySelectorAll('.scatterlayer .trace')].find(node =>
        node.__data__?.[0]?.trace?.uid === plot._fullData[index]?.uid)
      const pairs = Array.from({ length: Math.min(trace.x?.length ?? 0, trace.y?.length ?? 0) }, (_, i) => i)
        .filter(i => Number.isFinite(trace.x[i]) && Number.isFinite(trace.y[i]))
        .map(i => [i + 1, Object.is(trace.x[i], -0) ? '-0' : String(trace.x[i]),
          Object.is(trace.y[i], -0) ? '-0' : String(trace.y[i])])
      return { series: index + 1, name: trace.name, mode: trace.mode, pairs, meta: trace.meta,
        customdata: trace.customdata, dash: trace.line?.dash,
        lineVertices: [...(svg?.querySelectorAll('path.js-line') ?? [])].map(path =>
          (path.getAttribute('d').match(/[MLHV]/g) ?? []).length),
        markers: svg?.querySelectorAll('path.point').length ?? 0 }
    }))
    for (const trace of traces) {
      if (trace.mode === 'lines' && /^(Nominal|Design|Direct β|Load-angle θ)/u.test(trace.name)) {
        assert.equal(trace.lineVertices.reduce((sum, count) => sum + count, 0), trace.pairs.length,
          trace.name + ' uses every exported coordinate in its rendered SVG path')
      }
      if (trace.meta?.momentCoordinate?.startsWith('M_R = hypot')) {
        for (const [i, x] of trace.pairs) {
          const components = trace.customdata[i - 1]
          const expected = Math.hypot(components[0], components[1])
          const signIndex = trace.meta.customDataFields.indexOf('branchSign')
          const magnitudeIndex = trace.meta.customDataFields.indexOf('M_R')
          const sign = signIndex >= 0 ? components[signIndex] : 1
          assert.ok(Math.abs(Number(x) - sign * expected) <= 8 * Number.EPSILON * Math.max(1, expected))
          if (magnitudeIndex >= 0) assert.ok(components[magnitudeIndex] >= 0 &&
            Math.abs(components[magnitudeIndex] - expected) <= 8 * Number.EPSILON * Math.max(1, expected))
        }
      }
      if (trace.mode?.includes('markers')) {
        assert.equal(trace.markers, trace.pairs.length, trace.name + ' retains every plotted marker')
      }
    }
    if (checkData && (!label.startsWith('capacity') || chart === 'vertical')) {
      const jobs = await page.evaluate(() => window.__pmPlotJobs)
      await panel.locator('[data-chart-text-open]').click()
      const content = await page.getByRole('textbox', { name: 'Chart data' }).inputValue()
      await writeFile(`${out}/${label}-${chart}.txt`, content)
      const actual = new Map()
      let series = 0
      for (const line of content.split('\n')) {
        const cells = line.split('\t')
        if (cells[0] === 'Series') { series = Number(cells[1]); actual.set(series, []) }
        else if (/^\d+\t\d+\t/u.test(line)) actual.get(series).push([Number(cells[0]), cells[2], cells[3]])
      }
      for (const trace of traces) if (trace.pairs.length) assert.deepEqual(actual.get(trace.series), trace.pairs)
      if (label.startsWith('capacity')) {
        assert.ok(content.includes('Capacity —') && content.includes('M_R (kN·m)'))
        assert.ok(!content.includes('Loadcase\t') && !content.includes('Design check\t'))
        await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true,
          value: { writeText: async value => { window.__capacityCopy = value } } }))
        const dialog = page.getByRole('dialog')
        await dialog.getByRole('button', { name: 'Copy all', exact: true }).click()
        assert.equal(await page.evaluate(() => window.__capacityCopy), content)
        await page.evaluate(() => Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined }))
        const pendingDownload = page.waitForEvent('download')
        await dialog.getByRole('button', { name: 'Save as…', exact: true }).click()
        const download = await pendingDownload, target = `${out}/${label}-saved.txt`
        await download.saveAs(target)
        assert.equal(await readFile(target, 'utf8'), content)
      }
      await page.keyboard.press('Escape')
      assert.equal(await page.evaluate(() => window.__pmPlotJobs), jobs, 'Data/copy/save starts no analysis')
    }
    evidence.push({ label, chart, traces })
    console.log(label, chart, JSON.stringify(traces.map(t => ({
      name: t.name, mode: t.mode, coordinates: t.pairs.length, svgVertices: t.lineVertices, svgMarkers: t.markers
    }))))
  }
}
try {
  await page.goto(process.env.PM_TEST_URL ?? 'http://127.0.0.1:3001', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Project menu', exact: true }).click()
  await page.getByText('Example files', { exact: true }).click()
  await page.locator('.pm-project-menu__example').first().click()
  await page.getByRole('button', { name: 'Demand Check', exact: true }).click()
  await settled()
  assert.equal(await page.getByLabel('Load-angle section θ', { exact: true }).isChecked(), false)
  await capture('demand-beta')
  const before = await page.locator('.pm-loadcase-ur').evaluateAll(nodes => nodes.map(node => [node.textContent, node.title]))
  const jobs = await page.evaluate(() => window.__pmPlotJobs)
  await page.getByLabel('Load-angle section θ', { exact: true }).check()
  await page.waitForFunction(() => document.querySelector('[data-chart="vertical"] .js-plotly-plot')?.data?.some(t => t.name === 'Load-angle θ · Design'))
  await settled()
  await capture('demand-theta')
  assert.deepEqual(await page.locator('.pm-loadcase-ur').evaluateAll(nodes => nodes.map(node => [node.textContent, node.title])), before)
  assert.equal(await page.evaluate(() => window.__pmPlotJobs), jobs, 'Layer toggle and Data queries start no analysis')
  await page.getByRole('button', { name: 'Capacity', exact: true }).click()
  await page.waitForSelector('[data-chart="surface3d"] .js-plotly-plot')
  await page.waitForFunction(() => document.querySelector('[data-chart="vertical"] .js-plotly-plot')?.data?.some(t => t.name?.startsWith('Direct β')))
  await capture('capacity-beta')
  const opposite = page.getByRole('checkbox', { name: 'β + 180°', exact: true })
  await opposite.check()
  await page.waitForFunction(() => document.querySelector('[data-chart="vertical"] .js-plotly-plot')?.data?.some(t => t.name === 'Direct β = 180°' && t.x.some(value => value < 0)))
  await capture('capacity-opposite')
  await page.screenshot({ path: out + '/capacity-two-sided-light.png', fullPage: true })
  const slider = page.getByRole('slider', { name: 'Strain-gradient direction; type an exact β and press Enter', exact: true })
  await slider.focus()
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight')
  await page.waitForFunction(() => document.querySelector('[data-chart="vertical"] .js-plotly-plot')?.data?.some(t => t.name === 'Direct β = 30°'))
  await capture('capacity-oblique')
  await opposite.uncheck()
  const angle = page.getByRole('spinbutton', { name: 'Strain-gradient direction; type an exact β and press Enter', exact: true })
  await angle.fill('17.35'); await angle.press('Enter')
  await page.waitForFunction(() => {
    const plot = document.querySelector('[data-chart="vertical"] .js-plotly-plot')
    return !plot?.classList.contains('is-updating') && plot?.data?.some(t => t.name === 'Direct β = 17.35°')
  })
  assert.equal(await opposite.isDisabled(), true, 'an exact result contains its single requested beta')
  await capture('capacity-exact')
  await page.locator('[data-chart="vertical"]').getByRole('checkbox', { name: 'Mr', exact: true }).uncheck()
  await page.waitForFunction(() => document.querySelector('[data-chart="vertical"] .js-plotly-plot')?.data?.every(t => !t.name?.startsWith('Direct β =')))
  await capture('capacity-nominal')
  await page.screenshot({ path: out + '/capacity-light.png', fullPage: true })
  await page.locator('button[title="Theme"]').click()
  await capture('capacity-dark')
  await angle.fill('30'); await angle.press('Enter')
  await page.waitForFunction(() => document.querySelector('[data-chart="vertical"] .js-plotly-plot')?.data?.some(t =>
    t.name === 'Nominal reference' && t.customdata?.some(point => Math.abs(point[2] - 30) < 1e-9)))
  await page.locator('[data-chart="vertical"]').getByRole('checkbox', { name: 'Mr', exact: true }).check()
  await opposite.check()
  await page.waitForFunction(() => document.querySelector('[data-chart="vertical"] .js-plotly-plot')?.data?.some(t => t.name === 'Direct β = 210°' && t.x.some(value => value < 0)))
  await page.setViewportSize({ width: 390, height: 1000 })
  await page.locator('[data-chart="vertical"]').scrollIntoViewIfNeeded()
  await capture('capacity-narrow')
  await page.screenshot({ path: out + '/capacity-narrow-dark.png', fullPage: true })
  await writeFile(out + '/counts.json', JSON.stringify({ evidence, errors }, null, 2))
  assert.deepEqual(errors, [])
} finally { await browser.close() }
