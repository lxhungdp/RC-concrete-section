/** Presentation acceptance: exact centroidal axes, positive loops, themes and small viewports. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { parseProjectDocument, serializeProjectDocument } from '@pm/project'
import { netConcreteCentroid, sectionGeometryFromGeometryInput } from '@pm/geometry'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PM_PLAYWRIGHT_MODULE ?? 'playwright')
const out = 'outputs/demand-signs'
await mkdir(out, { recursive: true })
const browser = await chromium.launch({ channel: process.env.PM_BROWSER_CHANNEL ?? 'msedge', headless: true })
const evidence = []
let page
try {
  for (const [mechanics, source] of [
    ['equivalent-block', 'docs/examples/equivalent-block/ACI-EB-01-rectangle-8-bars.pm-project.json'],
    ['asymmetric-block', 'docs/examples/equivalent-block/ACI-EB-03-l-shape-8-bars.pm-project.json'],
    ['stress-strain', 'docs/examples/realistic-sections/KDS-REAL-05-complex-stress-strain.pm-project.json']
  ]) {
    const parsed = parseProjectDocument(await readFile(source, 'utf8'))
    assert.ok(parsed.ok)
    const document = parsed.document
    const expectedOrigin = netConcreteCentroid(sectionGeometryFromGeometryInput(document.inputs.geometry))
    if (mechanics === 'asymmetric-block') {
      const xs = sectionGeometryFromGeometryInput(document.inputs.geometry).solids.flatMap(solid => solid.outer.map(point => point.x))
      assert.notEqual(expectedOrigin.x, (Math.min(...xs) + Math.max(...xs)) / 2,
        'the asymmetric fixture must distinguish the exact centroid from the bounds centre')
    }
    const quadrants = [[1, 1], [1, -1], [-1, 1], [-1, -1], [0, 0]]
    document.inputs.loadings.combinations = quadrants.map(([mx, my], index) => ({
      id: index + 1, name: mx || my ? `Mux ${mx > 0 ? '+' : '−'} / Muy ${my > 0 ? '+' : '−'}` : 'Zero demand',
      actionBasis: 'factoredULS', P: mx || my ? 1e6 : 0, Mx: mx * 120e6, My: my * 80e6
    }))
    const fixture = `${out}/${mechanics}.pm-project.json`
    await writeFile(fixture, serializeProjectDocument(document))
    page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 1.25 })
    page.setDefaultTimeout(60000)
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('dialog', dialog => dialog.accept())
    await page.goto(process.env.PM_TEST_URL ?? 'http://127.0.0.1:3001', { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: 'Project menu' }).click()
    await page.getByLabel('Project file format').selectOption('json')
    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'Import project from JSON' }).click()
    await (await chooser).setFiles(fixture)
    await page.getByRole('button', { name: 'Demand Check', exact: true }).click()
    const chart = page.locator('[data-chart="heatmap"]')
    const axes = page.getByRole('img', { name: 'Centroidal X and Y axes with positive Mux and Muy rotation arrows', exact: true })
    for (const [index, [mx, my]] of quadrants.entries()) {
      const row = page.getByRole('table', { name: 'Loadcase demand table' }).locator('tr')
        .filter({ has: page.getByLabel(`Loadcase ${index + 1} name`, { exact: true }) })
      await row.locator('td.pm-col-ur').click()
      await page.waitForFunction(() => document.querySelector('.pm-results-stage')?.getAttribute('aria-busy') === 'false')
      await axes.waitFor()
      assert.equal(await page.locator('.pm-demand-signs').count(), 0, 'no separate sign cards')
      assert.ok(Math.abs(Number(await axes.getAttribute('data-origin-x')) - expectedOrigin.x) < 1e-10)
      assert.ok(Math.abs(Number(await axes.getAttribute('data-origin-y')) - expectedOrigin.y) < 1e-10)
      assert.deepEqual(await axes.locator('.pm-section-moment-loop text').allTextContents(), ['+Mux', '+Muy'])
      const crossing = await axes.evaluate(svg => {
        const origin = svg.querySelector('[data-axis-origin]')
        const x = Number(origin.getAttribute('cx'))
        const y = Number(origin.getAttribute('cy'))
        // Inspect authored coordinates: SVG getPointAtLength quantizes these to float32.
        const numbers = path => path.getAttribute('d').match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi).map(Number)
        const xAxis = numbers(svg.querySelector('[data-axis="X"]'))
        const yAxis = numbers(svg.querySelector('[data-axis="Y"]'))
        return Math.abs(xAxis[1] - y) + Math.abs(yAxis[0] - x)
      })
      assert.equal(crossing, 0, 'both axes pass through the analysis origin')
      if (index === 1) {
        await chart.screenshot({ path: `${out}/${mechanics}-field-light.png` })
        await page.screenshot({ path: `${out}/${mechanics}-workspace-light.png` })
        await page.getByRole('button', { name: 'Theme', exact: true }).click()
        await chart.screenshot({ path: `${out}/${mechanics}-field-dark.png` })
        await page.getByTitle('Stress field', { exact: true }).click()
        assert.equal(await axes.isVisible(), true)
        await chart.screenshot({ path: `${out}/${mechanics}-stress-dark.png` })
        await page.getByTitle('Strain field', { exact: true }).click()
        await page.getByTitle('Resultant', { exact: true }).click()
        assert.equal(await axes.isVisible(), true, 'reference axes do not depend on the resultant overlay')
        await page.getByTitle('Resultant', { exact: true }).click()
        await page.getByRole('button', { name: 'Theme', exact: true }).click()
      }
      if (index === 4) {
        if (mechanics !== 'stress-strain') {
          await page.getByRole('img', { name: 'Section geometry; section field unavailable' }).waitFor()
        }
        await chart.screenshot({ path: `${out}/${mechanics}-zero.png` })
      }
    }
    const mixedRow = page.getByRole('table', { name: 'Loadcase demand table' }).locator('tr')
      .filter({ has: page.getByLabel('Loadcase 2 name', { exact: true }) })
    await mixedRow.locator('td.pm-col-ur').click()
    await page.waitForFunction(() => document.querySelector('.pm-results-stage')?.getAttribute('aria-busy') === 'false')
    const layouts = []
    for (const width of [900, 560, 390]) {
      await page.setViewportSize({ width, height: 1000 })
      await axes.scrollIntoViewIfNeeded()
      const dimensions = await axes.evaluate(element => {
        const frame = element.getBoundingClientRect()
        return { fieldWidth: frame.width, fieldHeight: frame.height,
          labelsClipped: [...element.querySelectorAll('text')].some(text => {
            const box = text.getBoundingClientRect()
            return box.left < frame.left || box.right > frame.right || box.top < frame.top || box.bottom > frame.bottom
          }) }
      })
      assert.equal(dimensions.labelsClipped, false, `labels fit at ${width}px`)
      assert.ok(dimensions.fieldHeight >= 80, `field remains visible at ${width}px: ${JSON.stringify(dimensions)}`)
      await page.screenshot({ path: `${out}/${mechanics}-${width}.png` })
      layouts.push({ width, ...dimensions })
    }
    assert.deepEqual(errors, [])
    evidence.push({ mechanics, quadrants: 4, origin: expectedOrigin, axesCrossAtOrigin: true, zeroRetainsAxes: true,
      independentOfResultantToggle: true, lightAndDark: true, layouts, errors })
    await page.close()
  }
  await writeFile(`${out}/browser-evidence.json`, JSON.stringify(evidence, null, 2))
  console.log(JSON.stringify(evidence, null, 2))
} catch (error) {
  if (page && !page.isClosed()) {
    await page.screenshot({ path: `${out}/failure.png` })
    console.error((await page.locator('body').innerText()).slice(-2500))
  }
  throw error
} finally {
  await browser.close()
}
