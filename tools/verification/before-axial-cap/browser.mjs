/** Production UI evidence for Pmax overlays and separately qualified physical fields. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createAdaptiveEquivalentBlockAnalysisOptions, parseProjectDocument, serializeProjectDocument } from '@pm/project'
import { geometryInputRebars, sectionGeometryFromGeometryInput } from '@pm/geometry'
import { checkLoadcaseUtilizationFromSurface } from '@pm/analysis'
import { fromCanonical, UNIT_PRESETS } from '@pm/units'

const require = createRequire(import.meta.url)
const { buildPreviewSurfaceFallback } = require('../../../apps/web/application/analysis/fallback.ts')
const { chromium } = require(process.env.PM_PLAYWRIGHT_MODULE ?? 'playwright')
const out = process.env.PM_EVIDENCE_DIR ?? 'outputs/before-axial-cap'
await mkdir(out, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const evidence = []
let page
try {
  for (const [mechanics, file] of [
    ['stress-strain', 'docs/examples/realistic-sections/KDS-REAL-05-complex-stress-strain.pm-project.json'],
    ['equivalent-block', 'docs/examples/equivalent-block/ACI-EB-01-rectangle-8-bars.pm-project.json']
  ]) {
    const parsed = parseProjectDocument(await readFile(file, 'utf8'))
    assert.ok(parsed.ok)
    const project = parsed.document
    if (mechanics === 'equivalent-block') project.inputs.analysis = createAdaptiveEquivalentBlockAnalysisOptions()
    const { geometry, materials, analysis, design, calculationProfileId } = project.inputs
    const base = { section: sectionGeometryFromGeometryInput(geometry), rebars: geometryInputRebars(geometry),
      materialStore: materials, analysisOptions: analysis, designBasis: design, calculationProfileId }
    const { surface } = buildPreviewSurfaceFallback(base)
    const cap = surface.bounds.P[1]
    if (mechanics === 'equivalent-block') {
      const seed = { id: 1, name: 'Seed', actionBasis: 'factoredULS', P: 2e6, Mx: 800e6, My: 350e6 }
      const c = checkLoadcaseUtilizationFromSurface(surface, seed).capacityPoint
      assert.ok(c)
      project.inputs.loadings.combinations = [
        { ...seed, id: 1, name: 'NG physical boundary', P: 2 * c.P, Mx: 2 * c.Mx, My: 2 * c.My },
        { ...seed, id: 2, name: 'NG cap controlled', P: cap * 1.5, Mx: cap * 30, My: cap * 10 },
        { ...seed, id: 3, name: 'Inside', P: 0.5 * c.P, Mx: 0.5 * c.Mx, My: 0.5 * c.My }
      ]
    }
    const capDemand = project.inputs.loadings.combinations[1]
    const scale = cap * 1.05 / capDemand.P
    project.inputs.loadings.combinations.push({ ...capDemand, id: 4, name: 'NG cap plane',
      P: capDemand.P * scale, Mx: capDemand.Mx * scale, My: capDemand.My * scale },
      { ...capDemand, id: 5, name: 'Zero', P: 0, Mx: 0, My: 0 })
    const fixture = `${out}/${mechanics}.pm-project.json`
    await writeFile(fixture, serializeProjectDocument(project))
    page = await browser.newPage({ viewport: { width: 1600, height: 1100 } })
    page.setDefaultTimeout(30000)
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('dialog', dialog => dialog.accept())
    await page.addInitScript(() => {
      window.__capAudit = { results: {}, states: [], jobs: [], failures: [] }
      const OriginalWorker = window.Worker
      window.Worker = class extends OriginalWorker {
        constructor(...args) {
          super(...args)
          this.addEventListener('message', ({ data }) => {
            if (data.type === 'error') window.__capAudit.failures.push(data)
            if (data.type === 'success' && data.requestType === 'checkLoadcase') window.__capAudit.results[data.result.loadcaseId] = data.result
          })
        }
        postMessage(message, ...rest) {
          window.__capAudit.jobs.push(message.type)
          if (message.type === 'buildFieldMap') window.__capAudit.states.push(structuredClone(message.payload.state))
          return super.postMessage(message, ...rest)
        }
      }
    })
    await page.goto(process.env.PM_TEST_URL ?? 'http://127.0.0.1:3213', { waitUntil: 'networkidle' })
    const importFile = async file => {
      await page.getByRole('button', { name: 'Project menu' }).click()
      await page.getByLabel('Project file format').selectOption('json')
      const chooser = page.waitForEvent('filechooser')
      await page.getByRole('button', { name: 'Import project from JSON' }).click()
      await (await chooser).setFiles(file)
      await page.getByRole('button', { name: 'Demand Check', exact: true }).click()
    }
    await importFile(fixture)
    const traces = chart => page.locator(`[data-chart="${chart}"] .js-plotly-plot`).evaluate(el => el.data.map(t =>
      ({ name: t.name, x: Array.from(t.x ?? []), y: Array.from(t.y ?? []), z: Array.from(t.z ?? []), line: t.line, marker: t.marker })))
    const select = async id => {
      const row = page.getByRole('table', { name: 'Loadcase demand table' }).locator('tr')
        .filter({ has: page.getByLabel(`Loadcase ${id} name`, { exact: true }) })
      await row.locator('td.pm-col-ur').click()
      await page.waitForFunction(id => window.__capAudit.results[id], id, { timeout: 60000 })
      await page.waitForFunction(() => document.querySelector('.pm-results-stage')?.getAttribute('aria-busy') === 'false')
      return page.evaluate(id => window.__capAudit.results[id], id)
    }
    const metricUnits = UNIT_PRESETS.metric
    const force = value => fromCanonical('force', value, metricUnits)
    const cases = []
    for (const demand of project.inputs.loadings.combinations) {
      console.log(`${mechanics}: ${demand.name}`)
      const result = await select(demand.id)
      const expected = checkLoadcaseUtilizationFromSurface(surface, demand)
      assert.equal(result.utilization, expected.utilization)
      assert.deepEqual(result.designCapacityPoint, expected.capacityPoint)
      const isNg = expected.adequacy === 'inadequate'
      const field = isNg ? result.capacityField?.status === 'available' ? result.capacityField : null
        : mechanics === 'stress-strain' && result.ok ? result : null
      const beforeCap = isNg && field?.boundary?.kind === 'before-axial-cap'
      assert.equal(await page.locator('[data-chart="heatmap"] .pm-field-basis-label').innerText(),
        isNg ? 'Field at capacity' : 'Field at demand')
      assert.equal(await page.locator('[data-before-cap-note]').count(), beforeCap ? 1 : 0)
      assert.equal(await page.locator('.pm-results-plot.is-ng').count(), isNg ? 3 : 0)
      if (field) {
        assert.deepEqual(await page.evaluate(() => window.__capAudit.states.at(-1)), field.state)
        await page.locator('[data-chart="heatmap"] canvas').waitFor()
      } else await page.getByRole('img', { name: 'Section geometry; section field unavailable' }).waitFor()
      await page.getByText('Demand θ', { exact: true }).click()
      await page.waitForFunction(() => [...(document.querySelector('[data-chart="vertical"] .js-plotly-plot')?.data ?? [])]
        .some(t => t.name.startsWith('Design demand plane') && t.x.length > 3))
      const checkVertical = async (direct = false) => {
        const data = await traces('vertical')
        const solid = data.find(t => t.name.startsWith(direct ? 'Direct β =' : 'Design demand plane'))
        const dashed = data.filter(t => t.name === 'Design before Pmax cap')
        assert.ok(dashed.length > 0)
        assert.ok(dashed.every(t => t.line.dash === 'dot' && t.line.color === solid.line.color && t.y.every(p => p >= force(cap))))
        const cuts = data.find(t => t.name === 'Pmax edge intersections')
        assert.ok(cuts?.x.length)
        assert.equal(cuts.marker.symbol,'circle')
        assert.equal(cuts.marker.size,data.find(t=>t.name==='Stations').marker.size)
        const solidPaths = data.filter(t=>t.name.startsWith(direct ? 'Direct β =' : 'Design demand plane'))
        for(let k=0;k<cuts.x.length;k++) {
          assert.equal(cuts.y[k],force(cap))
          let distance=Infinity
          for(const path of solidPaths) for(let i=1;i<path.x.length;i++) {
            const sx=Math.max(1,Math.abs(cuts.x[k]),...path.x.map(Math.abs))
            const sy=Math.max(1,Math.abs(cuts.y[k]),...path.y.map(Math.abs))
            const ax=(path.x[i-1]-cuts.x[k])/sx; const ay=(path.y[i-1]-cuts.y[k])/sy
            const dx=(path.x[i]-path.x[i-1])/sx; const dy=(path.y[i]-path.y[i-1])/sy
            const denominator=dx*dx+dy*dy
            const t=denominator?Math.max(0,Math.min(1,-(ax*dx+ay*dy)/denominator)):0
            distance=Math.min(distance,Math.hypot(ax+t*dx,ay+t*dy))
          }
          if (!(distance<=1e-10)) await writeFile(`${out}/continuity-failure.json`,JSON.stringify({mechanics,demand,direct,k,distance,cuts,solidPaths},null,2))
          assert.ok(distance<=1e-10,`the dotted endpoint is on the unchanged solid source-edge portion (${mechanics}, loadcase ${demand.id}, direct ${direct}, cut ${k}, distance ${distance})`)
        }
        const crossing = data.find(t => t.name === 'Design ray crossing')
        if (expected.capacityMultiplier !== null) assert.equal(crossing.y[0], force(expected.capacityPoint.P))
        else assert.equal(crossing, undefined)
        const fieldMarker = data.find(t => t.name === 'Field point before Pmax cap')
        if (beforeCap) {
          assert.ok(fieldMarker)
          assert.equal(fieldMarker.y[0], force(field.response.P))
          assert.ok(fieldMarker.y[0] > crossing.y[0])
          assert.notEqual(fieldMarker.marker.symbol, crossing.marker.symbol)
          assert.equal(fieldMarker.marker.symbol, 'circle')
          assert.equal(fieldMarker.marker.size, data.find(t => t.name === 'Demand point').marker.size)
          assert.equal(fieldMarker.marker.color, solid.line.color)
        } else assert.equal(fieldMarker, undefined)
        return { dashedPoints: dashed.reduce((sum, t) => sum + t.x.length, 0), crossing: crossing?.y[0], field: fieldMarker?.y[0] }
      }
      const theta = await checkVertical()
      const fixed = await traces('fixedP')
      if (demand.id === 4) {
        const dashed = fixed.find(t => t.name === 'Design before Pmax cap')
        assert.ok(dashed?.x.length > 3)
        assert.equal(dashed.line.dash, 'dot')
        assert.ok(await page.getByText('No Design contour exists at this Pu.', { exact: false }).count())
      }
      if (demand.id === 2) {
        assert.equal(beforeCap, true)
        if (mechanics === 'stress-strain') assert.equal(result.utilization, 1.4115695666188057)
        for (const theme of ['light', 'dark']) {
          await page.screenshot({ path: `${out}/${mechanics}-theta-${theme}.png` })
          await page.getByTitle('Stress field', { exact: true }).click()
          await page.screenshot({ path: `${out}/${mechanics}-stress-${theme}.png` })
          await page.getByTitle('Strain field', { exact: true }).click()
          await page.getByRole('button', { name: 'Theme', exact: true }).click()
        }
      }
      await page.getByText('Direct β', { exact: true }).click()
      await page.waitForFunction(() => [...(document.querySelector('[data-chart="vertical"] .js-plotly-plot')?.data ?? [])]
        .some(t => t.name.startsWith('Direct β =') && t.x.length > 3))
      const direct = await checkVertical(true)
      cases.push({ name: demand.name, UR: result.utilization, boundary: field?.boundary, theta, direct })
    }
    const capResult = await select(2)
    await page.getByText('Demand θ', { exact: true }).click()
    await page.getByRole('button', { name: 'Options', exact: true }).click()
    await page.getByRole('tab', { name: 'Units', exact: true }).click()
    const beforeUnits = await page.evaluate(() => structuredClone(window.__capAudit))
    await page.getByLabel('Display unit preset').selectOption('us')
    await page.getByRole('button', { name: 'Demand Check', exact: true }).click()
    await page.waitForFunction(() => document.querySelector('.pm-results-stage')?.getAttribute('aria-busy') === 'false')
    assert.deepEqual(await page.evaluate(() => window.__capAudit.results[2]), capResult)
    assert.equal((await page.evaluate(() => window.__capAudit.jobs)).filter(t => t === 'buildSurface').length,
      beforeUnits.jobs.filter(t => t === 'buildSurface').length)
    const usData = await traces('vertical')
    assert.equal(usData.find(t => t.name === 'Design ray crossing').y[0], fromCanonical('force', capResult.designCapacityPoint.P, UNIT_PRESETS.us))
    await page.getByRole('button', { name: 'Capacity', exact: true }).click()
    await page.waitForFunction(() => [...(document.querySelector('[data-chart="surface3d"] .js-plotly-plot')?.data ?? [])]
      .some(t => t.name === 'Design grid before Pmax cap' && t.x.length > 3))
    const three = await traces('surface3d')
    const grid = three.find(t => t.name === 'Design grid before Pmax cap')
    assert.equal(grid.line.color, three.find(t => t.name === 'Meridian and parallel grid').line.color)
    assert.equal(grid.line.dash, 'dot')
    assert.ok(grid.z.every(z => z === null || z >= fromCanonical('force', cap, UNIT_PRESETS.us)))
    assert.equal(three.find(t => t.name === 'Direct β before Pmax cap').line.color, three.find(t => t.name === 'Direct β meridian').line.color)
    assert.equal(three.find(t => t.name === 'Design ray crossing').z[0], fromCanonical('force', capResult.designCapacityPoint.P, UNIT_PRESETS.us))
    await page.screenshot({ path: `${out}/${mechanics}-3d.png` })
    await page.locator('[data-chart="vertical"]').screenshot({ path:`${out}/${mechanics}-capacity-cut.png` })
    await page.getByRole('row').filter({ hasText: 'Pmax intersection' }).first().waitFor()
    const auditDownload = page.waitForEvent('download')
    await page.getByTitle('Export a formula-driven project audit workbook').click()
    const downloadedAudit = await auditDownload
    const auditFile = `${out}/${mechanics}-vertical-audit.xlsx`
    await downloadedAudit.saveAs(auditFile)
    const auditBytes = await readFile(auditFile)
    assert.equal(auditBytes.subarray(0,2).toString(),'PK','the browser exports a real Excel archive')
    await page.getByRole('button', { name: 'Demand Check', exact: true }).click()
    await page.setViewportSize({ width: 900, height: 900 })
    await page.screenshot({ path: `${out}/${mechanics}-narrow.png` })
    await page.setViewportSize({ width: 360, height: 900 })
    for (const theme of ['light', 'dark']) {
      const panels = await page.locator('.pm-results-plot').evaluateAll(elements => elements.map(el => ({
        height: el.getBoundingClientRect().height, canvas: el.querySelector('.pm-results-plot-canvas').getBoundingClientRect().height
      })))
      assert.ok(panels.every(p => p.height >= 420 && p.canvas >= 240))
      assert.equal(await page.locator('[data-before-cap-note]').count(), 1)
      assert.equal(await page.locator('.pm-field-basis-label').evaluate(el => getComputedStyle(el).whiteSpace), 'normal',
        'the full before-Pmax qualifier must wrap instead of disappearing behind an ellipsis')
      await page.screenshot({ path: `${out}/${mechanics}-phone-${theme}.png`, fullPage: true })
      await page.getByRole('button', { name: 'Theme', exact: true }).click()
    }
    // Reimport the same fixture with the cap explicitly disabled: no stale note/overlay may survive.
    await page.setViewportSize({ width: 1600, height: 1100 })
    project.inputs.design.axialCapEnabled = false
    const uncappedFixture = `${out}/${mechanics}-uncapped.pm-project.json`
    await writeFile(uncappedFixture, serializeProjectDocument(project))
    await page.evaluate(() => { window.__capAudit.results = {} })
    await importFile(uncappedFixture)
    await select(2)
    await page.getByText('Demand θ', { exact: true }).click()
    await page.waitForFunction(() => [...(document.querySelector('[data-chart="vertical"] .js-plotly-plot')?.data ?? [])]
      .some(t => t.name.startsWith('Design demand plane') && t.x.length > 3))
    assert.equal((await traces('vertical')).filter(t => t.name === 'Design before Pmax cap').length, 0)
    assert.equal(await page.locator('[data-before-cap-note]').count(), 0)
    assert.equal(await page.locator('[data-chart="heatmap"] .pm-field-basis-label').innerText(), 'Field at capacity')
    assert.deepEqual(errors, [])
    assert.deepEqual(await page.evaluate(() => window.__capAudit.failures), [])
    evidence.push({ mechanics, cases, capDisabledClearsOverlay: true, unitsPreserveResults: true, errors })
    await page.close()
  }
  await writeFile(`${out}/browser-evidence.json`, JSON.stringify(evidence, null, 2))
  console.log('Before-cap browser evidence passed.')
} catch (error) {
  if (page && !page.isClosed()) {
    await page.screenshot({ path: `${out}/failure.png`, fullPage: true })
    console.error((await page.locator('body').innerText()).slice(-6500))
  }
  throw error
} finally { await browser.close() }
