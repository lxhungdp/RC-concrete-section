/** Real Demand Data modals; isolated clipboard/picker adapters never overwrite the OS clipboard. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PM_PLAYWRIGHT_MODULE ?? 'playwright')
const out = process.env.PM_EVIDENCE_DIR ?? 'outputs/demand-data'
await mkdir(out, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } })
page.setDefaultTimeout(30000)
const errors = [], evidence = [], windowGeometry = []
page.on('pageerror', error => errors.push(error.message))
await page.addInitScript(() => {
  window.__dataJobs = 0
  const original = Worker.prototype.postMessage
  window.__pausedField = []
  Worker.prototype.postMessage = function (...args) {
    window.__dataJobs++
    if (window.__pauseField && ['buildFieldMap', 'buildExactDirection'].includes(args[0]?.type)) {
      window.__pausedField.push(() => original.apply(this, args)); return
    }
    return original.apply(this, args)
  }
})
const clean = value => value.replace(/\s+/gu, ' ').trim()
const plottedPoints = panel => panel.locator('.js-plotly-plot').evaluate(el => ['nominal','design'].flatMap(stage => el.data.flatMap(trace => {
  if (trace.visible === false || trace.visible === 'legendonly' || trace.meta?.resistanceStage !== stage) return []
  const columns=trace.meta.resultantColumns
  const rows=Array.from({length:Math.min(trace.x?.length??0,trace.y?.length??0)},(_,i)=>i)
    .filter(i=>Number.isFinite(trace.x[i])&&Number.isFinite(trace.y[i]))
    .map(i=>[String(i+1), String(typeof columns.Criteria==='number'?trace.customdata[i][columns.Criteria]:trace.meta.criteriaLabel??'—').replace(/\s+/gu,' ').trim(), ...['Mx','My','MR','P'].map(key=>{
      const source=columns[key],value=source==='x'?trace.x[i]:source==='y'?trace.y[i]:trace.customdata[i][source]
      return Object.is(value,-0)?'-0':String(value)
    })])
  return rows
})))
const assertPoints = (text, expected) => {
  const actual=text.split('\n').map(line=>line.split('\t').map(cell=>cell.trimEnd())).filter(cells=>cells.length===6&&Number.isInteger(Number(cells[0]))&&cells.slice(2).every(value=>value!==''&&Number.isFinite(Number(value))))
  assert.deepEqual(actual,expected)
  assert.doesNotMatch(text,/Custom data|JSON|Series\t|Mode\t|Index\t/)
  return actual.length
}
try {
  await page.goto(process.env.PM_TEST_URL ?? 'http://127.0.0.1:3001', { waitUntil: 'networkidle' })
  for (const [route, path] of [
    ['stress-strain', 'docs/examples/realistic-sections/KDS-REAL-05-complex-stress-strain.pm-project.json'],
    ['equivalent-block', 'docs/examples/equivalent-block/KDS-EB-01-rectangle-8-bars.pm-project.json']
  ]) {
    const fixture = JSON.parse(await readFile(path, 'utf8'))
    fixture.meta.name = 'Kiểm tra <b>literal</b> — Demand Data'
    const file = `${out}/${route}.pm-project.json`
    await writeFile(file, JSON.stringify(fixture))
    await page.getByRole('button', { name: 'Project menu', exact: true }).click()
    await page.getByLabel('Project file format').selectOption('json')
    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'Import project from JSON' }).click()
    await (await chooser).setFiles(file)
    await page.getByRole('button', { name: 'Demand Check', exact: true }).click()
    await page.waitForFunction(method => {
      const stage = document.querySelector('.pm-results-stage')
      return stage?.getAttribute('aria-busy') === 'false' && stage.dataset.fieldFrame === 'current' &&
        document.querySelector('.pm-section-field-footer')?.dataset.mechanics === method &&
        !!document.querySelector('.pm-loadcase-ur') && !document.querySelector('.pm-loadcase-ur.is-pending')
    }, fixture.inputs.analysis.methodId)
    console.log(`${route}: imported and settled`)
    for (const scenario of ['heatmap', 'fixedP', 'vertical', 'vertical-direct']) {
      const chart = scenario === 'vertical-direct' ? 'vertical' : scenario
      if (chart === 'vertical') {
        await page.getByLabel('Load-angle section θ', { exact: true }).setChecked(scenario !== 'vertical-direct')
        await page.waitForFunction(direct => {
          const plot = document.querySelector('[data-chart="vertical"] .js-plotly-plot')
          return !plot?.classList.contains('is-updating') && plot?.data?.some(trace => trace.name === 'Direct β · Design') &&
            plot.data.some(trace => trace.name === 'Load-angle θ · Design') === !direct
        }, scenario === 'vertical-direct')
      }
      const panel = page.locator(`[data-chart="${chart}"]`)
      const expectedPoints = chart === 'heatmap' ? null : await plottedPoints(panel)
      const values = await panel.locator('[data-text-group]').evaluateAll(cards => cards.flatMap(card =>
        [...card.querySelectorAll('.pm-field-metric-rows > div')].map(row => [
          row.querySelector('span')?.textContent ?? '', row.querySelector('strong')?.textContent ?? ''
        ])))
      const jobs = await page.evaluate(() => window.__dataJobs)
      const pages = browser.contexts()[0].pages().length
      const trigger = panel.locator('[data-chart-text-open]')
      assert.equal(await trigger.innerText(), 'Data')
      const border = await trigger.evaluate(node => ({ style: getComputedStyle(node).borderTopStyle,
        width: getComputedStyle(node).borderTopWidth, color: getComputedStyle(node).borderTopColor }))
      assert.equal(border.style, 'solid'); assert.equal(border.width, '1px')
      assert.ok(!['transparent', 'rgba(0, 0, 0, 0)'].includes(border.color))
      await trigger.click()
      const dialog = page.getByRole('dialog'), area = dialog.getByRole('textbox', { name: 'Chart data' })
      await dialog.waitFor()
      assert.equal(await dialog.locator('h2').count(), 1, 'One clear title remains with the action buttons')
      assert.equal(await dialog.locator('p').count(), 0, 'No repeated filename or footer')
      assert.equal(await dialog.locator('[role="status"]').textContent(), '', 'No permanent instructions outside the text')
      const text = await area.inputValue()
      const pointCount = expectedPoints ? assertPoints(text, expectedPoints) : 0
      if (chart !== 'heatmap') assert.match(text, /(?:Mrx|Mnx) \(kN·m\)\s+(?:Mry|Mny) \(kN·m\)\s+(?:Mr|Mn) \(kN·m\)\s+P \(kN\)/)
      if (chart !== 'heatmap') {
        assert.match(text,/N#\s+Criteria/)
        await page.screenshot({path:`${out}/${route}-${scenario}-point-table.png`})
      }
      if (chart === 'heatmap') await page.screenshot({ path: `${out}/${route}-wide-light.png` })
      if (route === 'stress-strain' && chart === 'heatmap') {
        const titleBar = dialog.locator('header'), initial = await dialog.boundingBox()
        const titleBox = await dialog.locator('h2').boundingBox()
        const copyBox = await dialog.getByRole('button', { name: 'Copy all', exact: true }).boundingBox()
        assert.ok(Math.abs(titleBox.y + titleBox.height / 2 - copyBox.y - copyBox.height / 2) < 2)
        await page.mouse.move(initial.x + 36, initial.y + 18)
        await page.mouse.down(); await page.mouse.move(initial.x + 116, initial.y + 58, { steps: 8 }); await page.mouse.up()
        const moved = await dialog.boundingBox()
        assert.ok(Math.abs(moved.x - initial.x - 80) < 2 && Math.abs(moved.y - initial.y - 40) < 2)
        await page.mouse.move(moved.x + moved.width - 3, moved.y + moved.height - 3)
        await page.mouse.down(); await page.mouse.move(moved.x + moved.width - 123, moved.y + moved.height - 103, { steps: 8 }); await page.mouse.up()
        const resized = await dialog.boundingBox()
        assert.ok(resized.width < moved.width - 80 && resized.height < moved.height - 60, 'Corner grip resizes the modal')
        await titleBar.focus(); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('Shift+ArrowRight')
        const keyboard = await dialog.boundingBox()
        assert.ok(Math.abs(keyboard.x - resized.x + 10) < 2 && keyboard.width >= resized.width + 8)
        await page.setViewportSize({ width: 390, height: 900 })
        await page.waitForFunction(() => {
          const rect = document.querySelector('.pm-data-dialog').getBoundingClientRect()
          return rect.x >= 0 && rect.y >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight
        })
        const clamped = await dialog.boundingBox()
        assert.equal(await area.inputValue(), text)
        windowGeometry.push({ initial, moved, resized, keyboard, clamped })
        await page.screenshot({ path: `${out}/moved-resized-clamped.png` })
        await page.setViewportSize({ width: 1600, height: 1100 })
      }
      assert.ok(text.includes('PREVIEW'))
      if (chart === 'heatmap') assert.ok(text.includes('Kiểm tra <b>literal</b>'))
      for (const [label, value] of values) assert.ok(text.includes(clean(label)) && text.includes(clean(value)), label + ': ' + value)
      assert.equal(browser.contexts()[0].pages().length, pages, 'Data must not open another tab')
      assert.equal(await area.getAttribute('readonly'), '')
      assert.equal(await dialog.locator('script, b').count(), 0, 'User labels remain literal text')
      await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true,
        value: { writeText: async text => { window.__copiedData = text } } }))
      await dialog.getByRole('button', { name: 'Copy all', exact: true }).click()
      await dialog.getByRole('status').filter({ hasText: 'Copied.' }).waitFor()
      assert.equal(await page.evaluate(() => window.__copiedData), text)
      await page.evaluate(() => Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined }))
      const pendingDownload = page.waitForEvent('download')
      await dialog.getByRole('button', { name: 'Save as…', exact: true }).click()
      const download = await pendingDownload
      assert.ok(download.suggestedFilename().endsWith('.txt'))
      assert.equal(/[<>:"/\\|?*]/u.test(download.suggestedFilename()), false)
      const saved = `${out}/${route}-${scenario}.txt`
      await download.saveAs(saved)
      assert.equal(await readFile(saved, 'utf8'), text)
      assert.equal(await page.evaluate(() => window.__dataJobs), jobs, 'Opening/copying/saving starts no analysis')
      await page.keyboard.press('Escape')
      await dialog.waitFor({ state: 'detached' })
      assert.equal(await trigger.evaluate(node => document.activeElement === node), true)
      evidence.push({ route, chart: scenario, pointCount, metricRows: values.length, bytes: Buffer.byteLength(text) })
      console.log(`${route}/${scenario}: ${pointCount} points, copy, UTF-8 download and focus passed`)
    }
    await page.getByRole('button', { name: 'Capacity', exact: true }).click()
    await page.waitForFunction(() => {
      const plot=document.querySelector('[data-chart="vertical"] .js-plotly-plot')
      return plot && !plot.classList.contains('is-updating') && plot.data?.some(trace => trace.name === 'Nominal reference' && trace.meta?.resistanceStage)
    })
    const capacity = page.locator('[data-chart="vertical"]')
    const expected = await plottedPoints(capacity)
    await capacity.locator('[data-chart-text-open]').click()
    const capacityText = await page.getByRole('textbox', { name: 'Chart data', exact: true }).inputValue()
    const capacityCount = assertPoints(capacityText, expected)
    assert.ok(capacityCount > 0)
    assert.match(capacityText, /N#\s+Criteria/)
    await writeFile(`${out}/${route}-capacity.txt`, capacityText)
    await page.screenshot({ path: `${out}/${route}-capacity-points.png` })
    await page.getByRole('button', { name: 'Close chart data', exact: true }).click()
    await page.getByRole('button', { name: 'Demand Check', exact: true }).click()
    evidence.push({ route, chart: 'capacity', pointCount: capacityCount })
  }
  await page.setViewportSize({ width: 390, height: 900 })
  await page.locator('button[title="Theme"]').click()
  for (const chart of ['heatmap', 'fixedP', 'vertical']) {
    const trigger = page.locator(`[data-chart="${chart}"] [data-chart-text-open]`)
    await trigger.scrollIntoViewIfNeeded()
    const position = await trigger.boundingBox()
    assert.ok(position.x >= 0 && position.x + position.width <= 391)
    await trigger.click()
    const dialog = page.getByRole('dialog')
    const box = await dialog.boundingBox()
    assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= 391 && box.y + box.height <= 901)
    await page.screenshot({ path: `${out}/${chart}-narrow-dark.png` })
    await page.keyboard.press('Escape')
  }
  await page.locator('[data-chart="heatmap"] [data-chart-text-open]').click()
  const dialog = page.getByRole('dialog'), area = dialog.getByRole('textbox', { name: 'Chart data' })
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true,
    value: { writeText: async () => { throw new Error('Denied') } } }))
  await dialog.getByRole('button', { name: 'Copy all' }).click()
  await dialog.getByRole('status').filter({ hasText: 'Text selected.' }).waitFor()
  assert.equal(await area.evaluate(node => node.selectionEnd - node.selectionStart), (await area.inputValue()).length)
  await page.evaluate(() => Object.defineProperty(window, 'showSaveFilePicker', { configurable: true,
    value: async () => { throw new DOMException('Cancelled', 'AbortError') } }))
  const status = await dialog.getByRole('status').innerText()
  await dialog.getByRole('button', { name: 'Save as…' }).click()
  await page.waitForFunction(() => !document.querySelector('.pm-data-dialog button[disabled]'))
  assert.equal(await dialog.getByRole('status').innerText(), status)
  await page.keyboard.press('Escape')
  await page.evaluate(() => { window.__pauseField = true })
  await page.locator('tbody tr').filter({ has: page.locator('.pm-loadcase-ur') }).nth(1).click()
  await page.waitForFunction(() => document.querySelector('.pm-results-stage')?.dataset.fieldFrame === 'previous')
  await page.locator('[data-chart="heatmap"] [data-chart-text-open]').click()
  const previous = page.getByRole('dialog').getByRole('textbox', { name: 'Chart data' })
  const previousText = await previous.inputValue()
  assert.ok(previousText.includes('Previous completed result — updating'))
  assert.ok(previousText.includes('Requested loadcase'))
  await page.getByRole('button', { name: 'Close chart data', exact: true }).click()
  await page.evaluate(() => { window.__pauseField = false; window.__pausedField.splice(0).forEach(run => run()) })
  assert.deepEqual(errors, [])
  await writeFile(`${out}/browser.json`, JSON.stringify({ evidence, windowGeometry, checks: ['modal-only', 'all-field-rows', 'literal-Unicode', 'copy-adapter',
    'UTF8-download', 'no-analysis-jobs', 'Escape-focus', 'narrow-dark', 'clipboard-fallback', 'save-cancel', 'previous-frame',
    'pointer-move', 'corner-resize', 'keyboard-move-resize', 'viewport-clamp', 'single-title-row'], errors }, null, 2))
  console.log(`Passed ${evidence.length} populated Demand Data modals, downloads, focus, narrow/dark and failure boundaries.`)
} catch (error) {
  await page.screenshot({ path: `${out}/failure.png` })
  throw error
} finally { await browser.close() }
