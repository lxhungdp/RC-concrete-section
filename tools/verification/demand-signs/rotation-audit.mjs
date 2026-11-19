/** ENG-LOAD-001: compare actual pure-bending compression fields with the rendered icon arrows. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { parseProjectDocument, serializeProjectDocument, createAnalysisOptionsForProfile } from '@pm/project'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PM_PLAYWRIGHT_MODULE ?? 'playwright')
const out = 'outputs/demand-signs/rotation-audit'
await mkdir(out, { recursive: true })
const browser = await chromium.launch({ channel: process.env.PM_BROWSER_CHANNEL ?? 'msedge', headless: true })
const evidence = []
const concreteEdgeFindings = []
let page
try {
  for (const profile of ['kds-142020-equivalent-block', 'kds-2024-stress-strain']) {
    const parsed = parseProjectDocument(await readFile('docs/examples/equivalent-block/KDS-EB-01-rectangle-8-bars.pm-project.json', 'utf8'))
    assert.ok(parsed.ok)
    const document = parsed.document
    document.inputs.calculationProfileId = profile
    document.inputs.analysis = createAnalysisOptionsForProfile(profile)
    document.inputs.loadings.combinations = [
      { id: 1, name: '+Mux only', actionBasis: 'factoredULS', P: 0, Mx: 120e6, My: 0 },
      { id: 2, name: '−Mux only', actionBasis: 'factoredULS', P: 0, Mx: -120e6, My: 0 },
      { id: 3, name: '+Muy only', actionBasis: 'factoredULS', P: 0, Mx: 0, My: 120e6 },
      { id: 4, name: '−Muy only', actionBasis: 'factoredULS', P: 0, Mx: 0, My: -120e6 }
    ]
    const fixture = `${out}/${profile}.pm-project.json`
    await writeFile(fixture, serializeProjectDocument(document))
    page = await browser.newPage({ viewport: { width: 1450, height: 1000 } })
    page.setDefaultTimeout(60000)
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('dialog', dialog => dialog.accept())
    await page.addInitScript(() => {
      window.__momentAudit = { checks: {}, map: null }
      const OriginalWorker = window.Worker
      window.Worker = class extends OriginalWorker {
        constructor(...args) {
          super(...args)
          this.addEventListener('message', ({ data }) => {
            if (data.type === 'success' && data.requestType === 'checkLoadcase') {
              window.__momentAudit.checks[data.result.demand.id] = data.result
            }
            if (data.type === 'success' && data.requestType === 'buildFieldMap') window.__momentAudit.map = data.result
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
    const cases = []
    for (const demand of document.inputs.loadings.combinations) {
      const axis = demand.Mx ? 'y' : 'x'
      const positive = (demand.Mx || demand.My) > 0
      const row = page.getByRole('table', { name: 'Loadcase demand table' }).locator('tr')
        .filter({ has: page.getByLabel(`Loadcase ${demand.id} name`, { exact: true }) })
      await page.evaluate(() => { window.__momentAudit.map = null })
      await row.locator('td.pm-col-ur').click()
      await page.waitForFunction(id => window.__momentAudit.checks[id] && window.__momentAudit.map &&
        document.querySelector('.pm-results-stage')?.getAttribute('aria-busy') === 'false', demand.id)
      const { check, map } = await page.evaluate(id => ({ check: window.__momentAudit.checks[id], map: window.__momentAudit.map }), demand.id)
      assert.equal(check.capacityField?.status, 'available')
      const coordinates = map.rebars.map(bar => bar[axis])
      const compressionCoordinate = positive ? Math.max(...coordinates) : Math.min(...coordinates)
      const tensionCoordinate = positive ? Math.min(...coordinates) : Math.max(...coordinates)
      const compressed = map.rebars.filter(bar => bar[axis] === compressionCoordinate)
      const tensioned = map.rebars.filter(bar => bar[axis] === tensionCoordinate)
      assert.ok(compressed.length && tensioned.length)
      assert.ok(compressed.every(bar => bar.strain > 0 && bar.stress > 0), `${demand.name}: expected edge must be compressed`)
      assert.ok(tensioned.every(bar => bar.strain < 0 && bar.stress < 0), `${demand.name}: opposite edge must be tensioned`)
      const maximum = axis === 'y' ? map.bounds.maxY : map.bounds.maxX
      const minimum = axis === 'y' ? map.bounds.minY : map.bounds.minX
      const compressedConcreteEdge = positive ? maximum : minimum
      const oppositeConcreteEdge = positive ? minimum : maximum
      let concrete
      if (map.equivalentBlock) {
        const points = map.equivalentBlock.geometry.flatMap(solid => solid.outer)
        assert.ok(map.equivalentBlock.compressionStress > 0)
        assert.ok(points.some(point => point[axis] === compressedConcreteEdge), 'the positive concrete block reaches the expected compressed edge')
        assert.ok(points.every(point => point[axis] !== oppositeConcreteEdge), 'the opposite edge is outside the compression block')
        concrete = { compressedEdge: compressedConcreteEdge, stress: map.equivalentBlock.compressionStress,
          oppositeEdgeOutsideBlock: true }
      } else {
        const vertices = map.triangles.flatMap(triangle => [
          { x: triangle.ax, y: triangle.ay, strain: triangle.strainA, stress: triangle.stressA },
          { x: triangle.bx, y: triangle.by, strain: triangle.strainB, stress: triangle.stressB },
          { x: triangle.cx, y: triangle.cy, strain: triangle.strainC, stress: triangle.stressC }
        ])
        const compressedVertices = vertices.filter(point => point[axis] === compressedConcreteEdge)
        const oppositeVertices = vertices.filter(point => point[axis] === oppositeConcreteEdge)
        assert.ok(compressedVertices.length && oppositeVertices.length, 'the field contains both exact rectangle edges')
        const unexpectedCompressedEdge = compressedVertices.filter(point => !(point.strain > 0 && point.stress > 0))
        // Keep this strict gate. Collect its failure so every direction can still be audited.
        if (unexpectedCompressedEdge.length) concreteEdgeFindings.push({ id: 'MOM-FIELD-002', profile,
          demand, state: check.capacityField.state,
          declaredConcreteLimit: document.inputs.materials.concrete.limits.epsCu,
          unexpectedCompressedEdge })
        assert.ok(oppositeVertices.every(point => point.strain < 0 && point.stress <= 0))
        concrete = { compressedEdge: compressedConcreteEdge, stress: compressedVertices[0].stress,
          oppositeEdgeNonCompressive: true }
      }
      const arrows = await page.locator('.pm-section-moment-loop').evaluateAll(loops => loops.map(loop => {
        const arrow = loop.querySelector('.pm-section-moment-arrow')
        const tip = arrow.getPointAtLength(0)
        const box = arrow.getBBox()
        const heading = { x: tip.x - (box.x + box.width / 2), y: tip.y - (box.y + box.height / 2) }
        const front = [...loop.querySelectorAll('path')].find(path => !path.hasAttribute('stroke-dasharray') && path !== arrow)
        const half = front.getTotalLength() / 2
        const a = front.getPointAtLength(half - 1)
        const b = front.getPointAtLength(half + 1)
        return { label: loop.querySelector('text').textContent, heading,
          tangentDotHeading: (b.x - a.x) * heading.x + (b.y - a.y) * heading.y }
      }))
      cases.push({ demand, concrete, compressed: compressed.map(({ x, y, strain, stress }) => ({ x, y, strain, stress })),
        tensioned: tensioned.map(({ x, y, strain, stress }) => ({ x, y, strain, stress })), arrows })
      await writeFile(`${out}/${profile}-evidence.json`, JSON.stringify(cases, null, 2))
      await page.getByTitle('Stress field', { exact: true }).click()
      await page.locator('[data-chart="heatmap"]').screenshot({ path: `${out}/${profile}-${demand.id}.png` })
      for (const arrow of arrows) {
        if (arrow.label === '+Mux') assert.ok(arrow.heading.y < 0, '+Mux visible arrow must point toward the +Y compression side')
        else assert.ok(arrow.heading.x > 0, '+Muy visible arrow must point toward the +X compression side')
        assert.ok(arrow.tangentDotHeading > 0, `${arrow.label}: loop path must follow its arrowhead`)
      }
    }
    assert.deepEqual(errors, [])
    evidence.push({ profile, cases: cases.length, arrowDirectionChecksPassed: true,
      steelCompressionAndTensionSides: true,
      concreteExactEdgeGatePassed: !concreteEdgeFindings.some(finding => finding.profile === profile), errors })
    await page.close()
  }
  const summary = { directionEvidence: evidence, concreteEdgeFindings }
  await writeFile(`${out}/summary.json`, JSON.stringify(summary, null, 2))
  console.log(JSON.stringify(summary, null, 2))
  assert.deepEqual(concreteEdgeFindings, [], 'MOM-FIELD-002: exact compressed-edge stress verification remains open')
} catch (error) {
  if (page && !page.isClosed()) await page.screenshot({ path: `${out}/failure.png` })
  throw error
} finally { await browser.close() }
