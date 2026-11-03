/** Production demand/NG charts: unchanged UR, correct field basis, coherent frames and NG tint. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { createAdaptiveEquivalentBlockAnalysisOptions, parseProjectDocument, serializeProjectDocument } from '@pm/project'
import { geometryInputRebars, sectionGeometryFromGeometryInput } from '@pm/geometry'
import { activeDesignSurfaceDataset, activeNominalSurfaceDataset, checkLoadcaseUtilizationFromSurface, strainGradientDirection } from '@pm/analysis'
import { fromCanonical, UNIT_PRESETS } from '@pm/units'

const require = createRequire(import.meta.url)
const { buildPreviewSurfaceFallback } = require('../../../apps/web/application/analysis/fallback.ts')
const { chromium } = require(process.env.PM_PLAYWRIGHT_MODULE ?? 'playwright')
const out = process.env.PM_EVIDENCE_DIR ?? 'outputs/demand-field-basis'
await mkdir(out, { recursive: true })
const browser = await chromium.launch({ channel: process.env.PM_BROWSER_CHANNEL ?? 'msedge', headless: true })
const evidence = []
let activePage
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
    const { surface } = buildPreviewSurfaceFallback({ section: sectionGeometryFromGeometryInput(geometry),
      rebars: geometryInputRebars(geometry), materialStore: materials, analysisOptions: analysis,
      designBasis: design, calculationProfileId })
    const seed = { id: 1, name: 'Seed', actionBasis: 'factoredULS', P: 2e6, Mx: 800e6, My: 350e6 }
    const crossing = checkLoadcaseUtilizationFromSurface(surface, seed).capacityPoint
    assert.ok(crossing)
    project.inputs.loadings.combinations = [0.5, 2, 5].map((scale, index) => ({ ...seed, id: index + 1,
      name: ['Inside', 'NG biaxial', 'NG extreme'][index], P: crossing.P * scale, Mx: crossing.Mx * scale, My: crossing.My * scale }))
    project.inputs.loadings.combinations.push({ ...seed, id: 4, name: 'NG axial', P: surface.bounds.P[1] * 2, Mx: 0, My: 0 },
      { ...seed, id: 5, name: 'Zero', P: 0, Mx: 0, My: 0 },
      { ...seed, id: 6, name: 'Inside smaller', P: crossing.P * 0.25, Mx: crossing.Mx * 0.25, My: crossing.My * 0.25 })
    const fixture = `${out}/${mechanics}.pm-project.json`
    await writeFile(fixture, serializeProjectDocument(project))
    const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } })
    page.setDefaultTimeout(30000)
    activePage = page
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('dialog', dialog => dialog.accept())
    await page.addInitScript(() => {
      window.__demandAudit = { results: {}, jobs: [], fieldStates: [], failures: [] }
      const OriginalWorker = window.Worker
      window.Worker = class extends OriginalWorker {
        constructor(...args) {
          super(...args)
          this.addEventListener('message', ({ data }) => {
            if (data.type === 'success' && data.requestType === 'buildSurface') window.__demandAudit.surface = data.result.surface
            if (data.type === 'error') window.__demandAudit.failures.push(data)
            if (data.type === 'success' && data.requestType === 'checkLoadcase') {
              window.__demandAudit.results[data.result.loadcaseId] = data.result
            }
          })
        }
        postMessage(message, ...rest) {
          window.__demandAudit.jobs.push(message.type)
          if (message.type === 'buildFieldMap') window.__demandAudit.fieldStates.push(structuredClone(message.payload.state))
          return super.postMessage(message, ...rest)
        }
      }
    })
    await page.goto(process.env.PM_TEST_URL ?? 'http://127.0.0.1:3211', { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: 'Project menu' }).click()
    await page.getByLabel('Project file format').selectOption('json')
    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'Import project from JSON' }).click()
    await (await chooser).setFiles(fixture)
    await page.getByRole('button', { name: 'Demand Check', exact: true }).click()
    const traceData = chart => page.locator(`[data-chart="${chart}"] .js-plotly-plot`).evaluate(el =>
      el.data.map(trace => ({ name: trace.name, x: Array.from(trace.x ?? []), y: Array.from(trace.y ?? []), z: Array.from(trace.z ?? []) })))
    const cases = []
    for (const demand of project.inputs.loadings.combinations) {
      console.log(`${mechanics}: ${demand.name}`)
      const row = page.getByRole('table', { name: 'Loadcase demand table' }).locator('tr')
        .filter({ has: page.getByLabel(`Loadcase ${demand.id} name`, { exact: true }) })
      await row.locator('td.pm-col-ur').click()
      await page.waitForFunction(id => window.__demandAudit.results[id], demand.id, { timeout: 60000 })
      await page.waitForFunction(() => document.querySelector('.pm-results-stage')?.getAttribute('aria-busy') === 'false')
      const result = await page.evaluate(id => window.__demandAudit.results[id], demand.id)
      const expected = checkLoadcaseUtilizationFromSurface(surface, demand)
      assert.equal(result.utilization, expected.utilization)
      assert.deepEqual(result.designCapacityPoint, expected.capacityPoint)
      const isNg = expected.adequacy === 'inadequate'
      const expectedField = isNg
        ? result.capacityField?.status === 'available' ? result.capacityField : null
        : mechanics === 'stress-strain' && result.ok && result.admissibility.evaluated ? result : null
      assert.equal(await page.locator('.pm-results-stage').getAttribute('data-field-basis'), isNg ? 'capacity' : 'demand')
      assert.equal(await page.locator('.pm-results-plot.is-ng').count(), isNg ? 3 : 0)
      const badge = page.locator('[data-chart="heatmap"] .pm-field-basis-label')
      assert.equal(await badge.innerText(), isNg ? 'Field at capacity' : 'Field at demand')
      const badgeStyle = await badge.evaluate(el => ({ border: getComputedStyle(el).borderStyle,
        background: getComputedStyle(el).backgroundColor }))
      assert.equal(badgeStyle.border, 'solid')
      assert.notEqual(badgeStyle.background, 'rgba(0, 0, 0, 0)', 'field basis must be prominent in both modes')
      const chartBackgrounds = await page.locator('.pm-results-plot').evaluateAll(elements =>
        elements.map(el => getComputedStyle(el).backgroundImage))
      assert.ok(chartBackgrounds.every(value => isNg ? value.includes('linear-gradient') : value === 'none'))
      assert.equal(await page.getByText('Inverse solution is unavailable.', { exact: true }).count(), 0)
      await page.getByText('Demand θ', { exact: true }).click()
      await page.waitForFunction(() => [...(document.querySelector('[data-chart="vertical"] .js-plotly-plot')?.data ?? [])]
        .some(trace => trace.name.startsWith('Design demand plane') && trace.x.length > 3))
      const theta = await traceData('vertical')
      assert.ok(theta.some(trace => trace.name === 'Proportional load path'))
      const boundaryMarker = theta.find(trace => trace.name === 'Design ray crossing')
      if (expected.capacityMultiplier !== null) {
        assert.ok(boundaryMarker)
        const boundaryX = boundaryMarker.x[0]
        const boundaryY = boundaryMarker.y[0]
        const designPaths = theta.filter(trace => trace.name.startsWith('Design demand plane'))
        const sx = Math.max(1, Math.abs(boundaryX), ...designPaths.flatMap(trace => trace.x.map(Math.abs)))
        const sy = Math.max(1, Math.abs(boundaryY), ...designPaths.flatMap(trace => trace.y.map(Math.abs)))
        let distance = Infinity
        for (const path of designPaths) for (let index = 1; index < path.x.length; index++) {
          const ax = (path.x[index - 1] - boundaryX) / sx
          const ay = (path.y[index - 1] - boundaryY) / sy
          const dx = (path.x[index] - path.x[index - 1]) / sx
          const dy = (path.y[index] - path.y[index - 1]) / sy
          const lengthSquared = dx * dx + dy * dy
          const t = lengthSquared ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSquared)) : 0
          distance = Math.min(distance, Math.hypot(ax + t * dx, ay + t * dy))
        }
        assert.ok(distance <= 1e-8, 'governing marker lies on the displayed Design curve')
      } else assert.equal(boundaryMarker, undefined, 'zero demand must not acquire a fabricated boundary crossing')
      const fixedP = await traceData('fixedP')
      assert.ok(fixedP.some(trace => trace.name === 'Demand point' && trace.x.length === 1))
      assert.ok(fixedP.some(trace => trace.name === 'Fixed-P moment ray (secondary)'))
      if (expectedField) {
        assert.deepEqual(await page.evaluate(() => window.__demandAudit.fieldStates.at(-1)), expectedField.state,
          'rendered field request uses the correct stored demand/capacity strain plane')
        assert.ok(await page.locator('[data-chart="heatmap"] canvas').count())
        const colouredPixels = await page.locator('[data-chart="heatmap"] canvas').evaluate(canvas => {
          const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
          let count = 0
          for (let index = 0; index < data.length; index += 4) {
            if (data[index + 3] && (data[index] !== data[index + 1] || data[index + 1] !== data[index + 2])) count++
          }
          return count
        })
        assert.ok(colouredPixels > 1000, 'the selected field is rendered rather than blank')
        if (mechanics === 'stress-strain' && [2, 3].includes(demand.id)) assert.equal(result.ok, false)
      } else {
        await page.getByRole('img', { name: 'Section geometry; section field unavailable' }).waitFor()
      }
      await page.getByText('Direct β', { exact: true }).click()
      await page.waitForFunction(() => [...(document.querySelector('[data-chart="vertical"] .js-plotly-plot')?.data ?? [])]
        .some(trace => trace.name.startsWith('Direct β =') && trace.x.length > 3))
      let beta = await traceData('vertical')
      assert.ok(beta.some(trace => trace.name === 'Projected proportional load path'))
      if (demand.id === 4) {
        const angle = page.getByRole('spinbutton', { name: 'Section-field strain-gradient direction, or selected inspection angle', exact: true })
        const fieldBeta = expectedField ? strainGradientDirection(expectedField.state) : null
        assert.equal(await angle.isEnabled(), fieldBeta === null)
        if (fieldBeta === null) {
          await angle.fill('17.5')
          await page.waitForFunction(() => [...(document.querySelector('[data-chart="vertical"] .js-plotly-plot')?.data ?? [])]
            .some(trace => trace.name === 'Direct β = 17.5°' && trace.x.length > 3))
          assert.equal(await angle.inputValue(), '17.5')
          beta = await traceData('vertical')
        }
      }
      cases.push({ name: demand.name, UR: result.utilization, inverseOk: result.ok,
        classification: expected.adequacy, fieldBasis: isNg ? 'capacity' : 'demand', fieldAvailable: !!expectedField,
        field: result.capacityField, thetaPoints: theta.filter(trace => trace.name.startsWith('Design demand plane')).map(trace => trace.x.length),
        betaPoints: beta.filter(trace => trace.name.startsWith('Direct β =')).map(trace => trace.x.length) })
      if (demand.id === 1 || demand.id === 2) {
        const modeName = demand.id === 1 ? 'demand' : 'ng'
        await page.screenshot({ path: `${out}/${mechanics}-${modeName}-direct-beta.png` })
        await page.getByText('Demand θ', { exact: true }).click()
        await page.screenshot({ path: `${out}/${mechanics}-${modeName}-light.png` })
        await page.getByRole('button', { name: 'Theme', exact: true }).click()
        await page.getByTitle('Stress field', { exact: true }).click()
        await page.screenshot({ path: `${out}/${mechanics}-${modeName}-stress.png` })
        await page.getByTitle('Strain field', { exact: true }).click()
        const darkBadgeStyle = await badge.evaluate(el => ({ border: getComputedStyle(el).borderStyle,
          background: getComputedStyle(el).backgroundColor }))
        assert.equal(darkBadgeStyle.border, 'solid')
        assert.notEqual(darkBadgeStyle.background, 'rgba(0, 0, 0, 0)')
        await page.screenshot({ path: `${out}/${mechanics}-${modeName}-dark.png` })
        await page.getByRole('button', { name: 'Theme', exact: true }).click()
      }
      if (demand.id === 4) assert.ok(await page.getByText('No Design contour exists at this Pu.', { exact: false }).count())
    }
    // A selection round trip cannot leave a previous case's field or failed-case placeholder behind.
    const ngRow = page.getByRole('table', { name: 'Loadcase demand table' }).locator('tr')
      .filter({ has: page.getByLabel('Loadcase 2 name', { exact: true }) })
    await ngRow.locator('td.pm-col-ur').click()
    await page.waitForFunction(() => document.querySelector('.pm-results-stage')?.getAttribute('aria-busy') === 'false')
    const beforeUnits = await page.evaluate(() => structuredClone(window.__demandAudit))
    await page.getByRole('button', { name: 'Options', exact: true }).click()
    await page.getByRole('tab', { name: 'Units', exact: true }).click()
    await page.getByLabel('Display unit preset').selectOption('us')
    await page.getByRole('button', { name: 'Demand Check', exact: true }).click()
    await page.waitForFunction(() => document.querySelector('.pm-results-stage')?.getAttribute('aria-busy') === 'false')
    assert.deepEqual(await page.evaluate(() => window.__demandAudit.results[2]), beforeUnits.results[2])
    assert.equal((await page.evaluate(() => window.__demandAudit.jobs)).filter(job => job === 'buildSurface').length,
      beforeUnits.jobs.filter(job => job === 'buildSurface').length)
    await page.getByRole('button', { name: 'Capacity', exact: true }).click()
    await page.waitForFunction(() => [...(document.querySelector('[data-chart="surface3d"] .js-plotly-plot')?.data ?? [])]
      .some(trace => trace.name === 'Design surface' && trace.x.length > 3))
    const surfaceTraces = await traceData('surface3d')
    const forbidden = ['Loadcases', 'Demand point', 'Proportional Design load path', 'Design ray crossing', 'Field point before Pmax cap']
    assert.ok(surfaceTraces.every(trace => !forbidden.includes(trace.name)), 'Capacity contains resistance geometry only')
    const mesh = surfaceTraces.find(trace => trace.name === 'Design surface')
    const displayedSurface = await page.evaluate(() => window.__demandAudit.surface)
    const designSurface = activeDesignSurfaceDataset(displayedSurface)
    assert.deepEqual(mesh.x, designSurface.points.map(point => fromCanonical('moment', point.Mx, UNIT_PRESETS.us)))
    assert.deepEqual(mesh.y, designSurface.points.map(point => fromCanonical('moment', point.My, UNIT_PRESETS.us)))
    assert.deepEqual(mesh.z, designSurface.points.map(point => fromCanonical('force', point.P, UNIT_PRESETS.us)))
    assert.ok(surfaceTraces.some(trace => trace.name === 'Direct β meridian'))
    assert.ok(surfaceTraces.some(trace => trace.name === 'Meridian and parallel grid'))
    const topology = await page.locator('[data-chart="surface3d"] .js-plotly-plot').evaluate(el => {
      const mesh = el.data.find(trace => trace.name === 'Design surface')
      return { i: Array.from(mesh.i), j: Array.from(mesh.j), k: Array.from(mesh.k) }
    })
    assert.deepEqual(topology.i, designSurface.triangles.map(triangle => triangle.a))
    assert.deepEqual(topology.j, designSurface.triangles.map(triangle => triangle.b))
    assert.deepEqual(topology.k, designSurface.triangles.map(triangle => triangle.c))
    await page.screenshot({ path: `${out}/${mechanics}-capacity-design-light.png` })
    const surfaceMode = page.getByRole('group', { name: '3D resistance surface', exact: true })
    await surfaceMode.getByText('Mn', { exact: true }).click()
    await page.waitForFunction(() => document.querySelector('[data-chart="surface3d"] .js-plotly-plot')?.data?.some(trace => trace.name === 'Nominal surface'))
    const nominalTraces = await traceData('surface3d')
    assert.ok(nominalTraces.every(trace => !forbidden.includes(trace.name)))
    const nominalMesh = nominalTraces.find(trace => trace.name === 'Nominal surface')
    const nominalSurface = activeNominalSurfaceDataset(displayedSurface)
    assert.deepEqual(nominalMesh.x, nominalSurface.points.map(point => fromCanonical('moment', point.Mx, UNIT_PRESETS.us)))
    assert.deepEqual(nominalMesh.y, nominalSurface.points.map(point => fromCanonical('moment', point.My, UNIT_PRESETS.us)))
    assert.deepEqual(nominalMesh.z, nominalSurface.points.map(point => fromCanonical('force', point.P, UNIT_PRESETS.us)))
    await page.screenshot({ path: `${out}/${mechanics}-capacity-nominal-light.png` })
    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    await page.screenshot({ path: `${out}/${mechanics}-capacity-nominal-dark.png` })
    await surfaceMode.getByText('Mr', { exact: true }).click()
    await page.waitForFunction(() => document.querySelector('[data-chart="surface3d"] .js-plotly-plot')?.data?.some(trace => trace.name === 'Design surface'))
    await page.screenshot({ path: `${out}/${mechanics}-capacity-design-dark.png` })
    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    // A different selected combination cannot add overlays or change the resistance geometry.
    await page.getByRole('button', { name: 'Demand Check', exact: true }).click()
    await page.getByRole('table', { name: 'Loadcase demand table' }).locator('tr')
      .filter({ has: page.getByLabel('Loadcase 5 name', { exact: true }) }).locator('td.pm-col-ur').click()
    await page.waitForFunction(() => document.querySelector('.pm-results-stage')?.getAttribute('aria-busy') === 'false')
    await page.getByRole('button', { name: 'Capacity', exact: true }).click()
    await page.waitForFunction(() => document.querySelector('[data-chart="surface3d"] .js-plotly-plot')?.data?.some(trace => trace.name === 'Design surface'))
    assert.deepEqual(await traceData('surface3d'), surfaceTraces, 'Capacity is independent of loadcase selection')
    await page.getByRole('button', { name: 'Demand Check', exact: true }).click()
    await ngRow.locator('td.pm-col-ur').click()
    await page.waitForFunction(() => document.querySelector('.pm-results-stage')?.getAttribute('aria-busy') === 'false')
    await page.setViewportSize({ width: 900, height: 900 })
    await page.screenshot({ path: `${out}/${mechanics}-ng-narrow.png` })
    await page.setViewportSize({ width: 360, height: 900 })
    for (const theme of ['light', 'dark']) {
      const panels = await page.locator('.pm-results-plot').evaluateAll(elements => elements.map(el => ({
        height: el.getBoundingClientRect().height,
        minCanvasHeight: el.querySelector('.pm-results-plot-canvas').getBoundingClientRect().height,
        ng: el.classList.contains('is-ng'), background: getComputedStyle(el).backgroundImage
      })))
      assert.equal(panels.length, 3)
      assert.ok(panels.every(panel => panel.height >= 420 && panel.minCanvasHeight >= 240 && panel.ng &&
        panel.background.includes('linear-gradient')), 'phone charts retain readable plot areas and NG backgrounds')
      const badge = page.locator('[data-chart="heatmap"] .pm-field-basis-label')
      assert.equal(await badge.innerText(), 'Field at capacity')
      await page.screenshot({ path: `${out}/${mechanics}-ng-phone-${theme}.png`, fullPage: true })
      await page.getByRole('button', { name: 'Theme', exact: true }).click()
    }
    assert.deepEqual(errors, [])
    assert.deepEqual(await page.evaluate(() => window.__demandAudit.failures), [])
    evidence.push({ mechanics, cases, storedURUnchanged: true, unitChangePreservesResults: true, capacityResistanceOnly: true, errors })
    await page.close()
  }
  await writeFile(`${out}/browser-evidence.json`, JSON.stringify(evidence, null, 2))
  const chunks = []
  const chunkRoot = `${process.env.PM_BUILD_ROOT ?? 'apps/web/.next'}/static/chunks`
  for (const name of await readdir(chunkRoot)) {
    if (name.endsWith('.js') && (await readFile(`${chunkRoot}/${name}`, 'utf8'))
      .includes('The compatible station domain is unavailable.')) chunks.push(name)
  }
  assert.ok(chunks.length, 'locate the actual lazy capacity-field chunk for transport fault injection')
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  let blocked = 0
  const transportErrors = []
  await context.route('**/_next/static/chunks/**', route => {
    const name = new URL(route.request().url()).pathname.split('/').pop()
    if (chunks.includes(name)) { blocked++; return route.abort('failed') }
    return route.continue()
  })
  const page = await context.newPage()
  activePage = page
  page.setDefaultTimeout(30000)
  page.on('pageerror', error => transportErrors.push(error.message))
  await page.addInitScript(() => {
    const OriginalWorker = window.Worker
    window.Worker = class extends OriginalWorker {
      constructor(...args) {
        super(...args)
        this.addEventListener('message', ({ data }) => {
          if (data.type === 'success' && data.requestType === 'checkLoadcase') window.__faultEvidence = data.result
        })
      }
    }
  })
  await page.goto(process.env.PM_TEST_URL ?? 'http://127.0.0.1:3211', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Project menu' }).click()
  await page.getByLabel('Project file format').selectOption('json')
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Import project from JSON' }).click()
  await (await chooser).setFiles(`${out}/stress-strain.pm-project.json`)
  await page.getByRole('button', { name: 'Demand Check', exact: true }).click()
  await page.getByRole('table', { name: 'Loadcase demand table' }).locator('tr')
    .filter({ has: page.getByLabel('Loadcase 2 name', { exact: true }) }).locator('td.pm-col-ur').click()
  await page.waitForFunction(() => window.__faultEvidence?.loadcaseId === 2, null, { timeout: 60000 })
  await page.waitForFunction(() => document.querySelector('.pm-results-stage')?.getAttribute('aria-busy') === 'false')
  const fault = await page.evaluate(() => window.__faultEvidence)
  assert.ok(blocked > 0)
  assert.equal(fault.capacityField.status, 'unavailable')
  assert.equal(fault.capacityField.reason, 'evaluation-error')
  assert.ok(Math.abs(fault.utilization - 2) < 1e-12)
  await page.getByRole('img', { name: 'Section geometry; section field unavailable' }).waitFor()
  await page.waitForFunction(() => [...(document.querySelector('[data-chart="vertical"] .js-plotly-plot')?.data ?? [])]
    .some(trace => trace.name === 'Design ray crossing' && trace.x.length === 1))
  assert.deepEqual(transportErrors, [])
  evidence.push({ scenario: 'capacity-field-chunk-failure', blocked, UR: fault.utilization,
    fieldReason: fault.capacityField.reason, geometricPlotsRetained: true, errors: transportErrors })
  await page.screenshot({ path: `${out}/capacity-field-chunk-failure.png` })
  await context.close()
  await writeFile(`${out}/browser-evidence.json`, JSON.stringify(evidence, null, 2))
  console.log(JSON.stringify(evidence, null, 2))
} catch (error) {
  if (activePage && !activePage.isClosed()) {
    await activePage.screenshot({ path: `${out}/failure.png` })
    console.error((await activePage.locator('body').innerText()).slice(-7000))
  }
  throw error
} finally { await browser.close() }
