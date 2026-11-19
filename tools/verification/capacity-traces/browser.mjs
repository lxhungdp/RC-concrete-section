/** Production UI evidence only; source values and reconciliation remain owned by analysis DTOs. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { formatQuantity, quantityUnit, UNIT_PRESETS } from '@pm/units'
import { applyCalculationProfileToMaterials, createDesignBasisForCalculationProfile, createAdaptiveEquivalentBlockAnalysisOptions, parseProjectDocument, serializeProjectDocument } from '@pm/project'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PM_PLAYWRIGHT_MODULE ?? 'playwright')
const { buildChartTableRows, chartTableValue, chartValueLabel, resolveChartTableRowSelection } = require('../../../apps/web/features/section-editor/results/chart-data-table.ts')
const out = process.env.PM_EVIDENCE_DIR ?? 'outputs/capacity-value-traces'
await mkdir(out, { recursive: true })
const browser = await chromium.launch({ channel: process.env.PM_BROWSER_CHANNEL ?? 'msedge', headless: true })
const evidence = []
let activePage
try {
  for (const [mechanics, file] of [
    ['stress-strain', 'docs/examples/realistic-sections/KDS-REAL-05-complex-stress-strain.pm-project.json'],
    ['equivalent-block', 'docs/examples/equivalent-block/ACI-EB-01-rectangle-8-bars.pm-project.json'],
    ['as3600', 'docs/examples/equivalent-block/ACI-EB-01-rectangle-8-bars.pm-project.json'],
    ['en-material', 'docs/examples/realistic-sections/KDS-REAL-05-complex-stress-strain.pm-project.json']
  ]) {
    const parsed = parseProjectDocument(await readFile(file, 'utf8'))
    assert.ok(parsed.ok)
    const project = parsed.document
    if (mechanics === 'as3600' || mechanics === 'en-material') {
      const profile = mechanics === 'as3600' ? 'as-3600-2018-amd2-equivalent-block' : 'en-1992-1-1-2004-stress-strain'
      project.inputs.calculationProfileId = profile
      project.inputs.materials = applyCalculationProfileToMaterials(project.inputs.materials, profile)
      project.inputs.design = createDesignBasisForCalculationProfile(profile)
    }
    const stressMechanics = project.inputs.calculationProfileId.endsWith('stress-strain')
    if (!stressMechanics) project.inputs.analysis = createAdaptiveEquivalentBlockAnalysisOptions()
    const fixture = `${out}/${mechanics}.pm-project.json`
    await writeFile(fixture, serializeProjectDocument(project))
    const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } })
    activePage = page
    page.setDefaultTimeout(30000)
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('dialog', dialog => dialog.accept())
    await page.addInitScript(() => {
      window.__traceAudit = { jobs: [], responses: [], failures: [], delay: 0, corrupt: false, missingFactor: false }
      const OriginalWorker = window.Worker
      window.Worker = class extends OriginalWorker {
        constructor(...args) {
          super(...args)
          this.addEventListener('message', ({ data }) => {
            const log = window.__traceAudit
            if (data.type === 'error') log.failures.push(data)
            if (data.type !== 'success') return
            if (data.requestType === 'buildSurface') { log.surface = data.result.surface; log.exact = null }
            if (data.requestType === 'buildExactDirection') log.exact = data.result
            if (data.requestType === 'buildPointAudits') {
              if (log.corrupt) for (const item of data.result) {
                if (item.audit.kind !== 'unavailable') item.audit.reconciliation.ok = false
              }
              if (log.missingFactor) for (const item of data.result) {
                if (item.audit.kind === 'stress-strain' || item.audit.kind === 'equivalent-block') item.audit.resistanceFactorCalculation = null
              }
              log.responses.push(structuredClone(data.result))
            }
          })
        }
        postMessage(message, ...rest) {
          window.__traceAudit.jobs.push(structuredClone(message))
          if (message.type === 'buildPointAudits' && window.__traceAudit.delay) {
            setTimeout(() => super.postMessage(message, ...rest), window.__traceAudit.delay)
            return
          }
          return super.postMessage(message, ...rest)
        }
      }
    })
    await page.goto(process.env.PM_TEST_URL ?? 'http://127.0.0.1:3217', { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: 'Project menu' }).click()
    await page.getByLabel('Project file format').selectOption('json')
    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'Import project from JSON' }).click()
    await (await chooser).setFiles(fixture)
    await page.getByRole('button', { name: 'Capacity', exact: true }).click()
    await page.waitForFunction(() => window.__traceAudit.surface && document.querySelector('.pm-chart-data-table tbody tr'))
    const sourceData = await page.evaluate(() => ({ surface: window.__traceAudit.surface, exact: window.__traceAudit.exact }))
    const fixedP = (sourceData.surface.bounds.P[0] + sourceData.surface.bounds.P[1]) / 2
    const rowsFor = (source = 'vertical', resistanceStage = 'design') => buildChartTableRows({
      surface: sourceData.surface, exactDirectionCurve: source === 'vertical' ? sourceData.exact : null,
      source, resistanceStage, sliceAngleDeg: 0, fixedP
    })
    const table = page.locator('.pm-chart-data-table')
    const toolbar = page.locator('.pm-chart-data-toolbar')
    assert.deepEqual((await toolbar.getByRole('button').allTextContents()).map(x => x.trim()), ['Detail', 'Excel'],
      'one complete Detail action precedes Excel')
    assert.equal(await table.getByRole('button', { name: 'Detail', exact: true }).count(), 0)
    const toolbarDimensions = await toolbar.getByRole('button').evaluateAll(buttons => buttons.map(button => ({
      label: button.textContent.trim(), height: button.getBoundingClientRect().height
    })))
    assert.equal(toolbarDimensions[0].height, toolbarDimensions[1].height)
    await page.screenshot({ path: `${out}/${mechanics}-capacity-toolbar.png` })
    const beforeJobs = await page.evaluate(() => window.__traceAudit.jobs.length)
    await table.locator('tbody tr').nth(1).locator('td').nth(1).click()
    assert.equal(await page.getByRole('dialog').count(), 0, 'identification cells no longer open the inspector')
    assert.equal(await page.evaluate(() => window.__traceAudit.jobs.length), beforeJobs)

    const dialog = page.getByRole('dialog', { name: /CALCULATION TRACE/ })
    const checkValueType = async () => {
      await table.locator('.pm-chart-value-action').first().waitFor()
      const sizes = await table.locator('.pm-chart-value-action').evaluateAll(buttons => buttons.map(button => ({
        value: getComputedStyle(button.querySelector('.ws-num')).fontSize,
        cell: getComputedStyle(button.closest('td')).fontSize,
        height: button.getBoundingClientRect().height
      })))
      assert.ok(sizes.length && sizes.every(size => size.value === '12px' && size.value === size.cell && size.height === 22),
        'Capacity values use normal table type and preserve the compact hit target')
    }
    const checkModalType = async () => {
      const sizes = await dialog.locator('.pm-calc-fact > strong, .pm-calc-table-wrap td').evaluateAll(elements =>
        elements.map(el => getComputedStyle(el).fontSize))
      assert.ok(sizes.length && sizes.every(size => size === '11px'), 'modal text retains its previous type size')
    }
    const close = async action => {
      await page.keyboard.press('Escape')
      await dialog.waitFor({ state: 'hidden' })
      assert.ok(await action.evaluate(button => document.activeElement === button), 'closing restores initiating action focus')
    }
    const detail = toolbar.getByRole('button', { name: 'Detail', exact: true })
    await detail.focus()
    await page.keyboard.press('Enter')
    await dialog.getByRole('heading', { name: 'Basic inputs', exact: true }).waitFor()
    assert.ok(await dialog.getByRole('button', { name: 'Excel', exact: true }).count())
    assert.ok(await dialog.getByLabel('Calculation trace view').isEnabled())
    await dialog.getByLabel('Calculation trace criteria').selectOption(rowsFor()[1].key)
    await dialog.locator('.pm-calc-loading').waitFor({ state: 'hidden' })
    assert.equal(await dialog.getByRole('alert').count(), 0)
    await checkModalType()
    await page.screenshot({ path: `${out}/${mechanics}-complete-detail.png` })
    await close(detail)

    let presentation = UNIT_PRESETS.metric
    const checked = []
    const criterionKinds = new Set()
    let obliqueCurvatureCovered = false
    const factorBranches = new Set()
    const trace = async (row, component, { keyboard = false, leaveOpen = false, checkNarrow = false } = {}) => {
      const label = chartValueLabel(component, row.evidence.stage)
      console.log(`${mechanics}: ${quantityUnit('force', presentation)} ${row.kind} ${label} row ${row.index}`)
      await checkValueType()
      const action = table.getByRole('button', { name: `Trace ${label} for row ${row.index}`, exact: true })
      if (keyboard) { await action.focus(); await page.keyboard.press('Enter') } else await action.click()
      await dialog.waitFor()
      const final = dialog.locator(`[data-result-component="${component}"]`)
      await final.waitFor()
      assert.equal(await final.getAttribute('data-canonical-value'), String(chartTableValue(row, component)))
      if (row.kind === 'vertical' && component === 'M') {
        assert.equal(Number(await final.getAttribute('data-canonical-value')), Math.hypot(row.evidence.point.Mx, row.evidence.point.My),
          'M_R is the norm of the stored point components, independent of the selected beta')
      }
      assert.equal(await final.getAttribute('data-stage'), row.evidence.stage)
      const quantity = component === 'P' ? 'force' : 'moment'
      const expectedText = `${formatQuantity(quantity, chartTableValue(row, component), presentation, 2)} ${quantityUnit(quantity, presentation)}`
      assert.equal(await final.locator('strong').innerText(), expectedText, 'final value declares its actual display unit')
      const checkValueBounds = async () => {
        await final.scrollIntoViewIfNeeded()
        const bounds = await final.evaluate(el => {
          const container = el.getBoundingClientRect()
          const value = el.querySelector('strong')
          const label = el.querySelector('.pm-calc-fact > span')
          const rect = value.getBoundingClientRect()
          const labelRect = label.getBoundingClientRect()
          return { left: rect.left, right: rect.right, containerLeft: container.left, containerRight: container.right,
            height: rect.height, lineHeight: parseFloat(getComputedStyle(value).lineHeight), top: rect.top, labelTop: labelRect.top }
        })
        assert.ok(bounds.left >= bounds.containerLeft && bounds.right <= bounds.containerRight, 'the complete quantity fits inside its final-result block')
        assert.ok(bounds.height <= bounds.lineHeight * 1.2, 'number and unit occupy one line')
        assert.ok(Math.abs(bounds.top - bounds.labelTop) <= 2, 'label and quantity share one row')
      }
      await checkValueBounds()
      await checkModalType()
      if (checkNarrow) {
        await page.screenshot({ path: `${out}/${mechanics}-P-${quantityUnit('force', presentation)}-desktop.png` })
        await page.setViewportSize({ width: 360, height: 900 })
        await checkValueBounds()
        await checkModalType()
        await page.screenshot({ path: `${out}/${mechanics}-P-${quantityUnit('force', presentation)}-phone.png` })
        await page.setViewportSize({ width: 1600, height: 1100 })
      }
      assert.equal(await dialog.locator('.pm-calc-formula .pm-calc-math').count(), 0, 'focused authored formulas use the standard math renderer')
      const derivations = await dialog.locator('[data-strain-derivation]').evaluateAll(elements => elements.map(el => el.dataset.strainDerivation))
      const annotations = await dialog.locator('.katex-mathml annotation').allTextContents()
      const latestAudits = await page.evaluate(() => window.__traceAudit.responses.at(-1))
      const physicalSources = latestAudits.flatMap(({ audit }) => audit.kind === 'axial-cap'
        ? audit.preCap ? [audit.preCap.audit] : [] : audit.kind === 'unavailable' ? [] : [audit])
      const factorCalculations = dialog.locator('[data-factor-calculation]')
      assert.equal(await factorCalculations.count(), physicalSources.filter(audit => audit.resistanceFactorCalculation !== null).length)
      for (const audit of physicalSources) {
        const factor = audit.resistanceFactorCalculation
        if (factor) {
          factorBranches.add(factor.classification)
          assert.equal(factor.factor, audit.resistanceFactor)
          assert.ok(await factorCalculations.filter({ has: page.getByRole('heading', { name: 'Resistance factor φ', exact: true }) }).count())
          assert.ok(annotations.some(latex => latex.includes('\\phi')))
          if (factor.kind === 'strain-controlled' && factor.classification === 'transition') {
            assert.ok(await dialog.getByLabel('Resistance factor transition interpolation ratio', { exact: true }).count())
            assert.ok(await dialog.getByLabel('Transition resistance factor with values substituted', { exact: true }).count())
          }
          if (factor.kind === 'axial-bending') assert.ok(await dialog.getByLabel('AS bending factor expression and bounds', { exact: true }).count())
        }
      }
      assert.equal(await dialog.locator('[data-material-factor-calculation]').count(),
        row.evidence.stage === 'design' && project.inputs.design.format === 'designMaterialReevaluation' ? physicalSources.length : 0)
      for (const audit of physicalSources) {
        const displayCurvature = value => formatQuantity('curvature', value, presentation, 8).replace(/,/g, '{,}').replace(/e([+-]?\d+)/, (_, exponent) => `\\times 10^{${Number(exponent)}}`)
        if (audit.depthProfile.originStrainTrace.kind !== 'uniform-strain') {
          const components = annotations.some(latex => latex.includes('\\kappa_x&=')
            && latex.includes(displayCurvature(audit.state.kx)) && latex.includes(displayCurvature(audit.state.ky)))
          assert.ok(components,
            'curvature component values come from the same source audit')
          if (audit.state.kx !== 0 && audit.state.ky !== 0) obliqueCurvatureCovered = true
        }
      }

      if (derivations.length) {
        for (const kind of derivations) criterionKinds.add(kind)
        assert.ok(annotations.some(latex => latex.includes('\\varepsilon_0')), 'origin strain is traced with proper epsilon and subscript')
        assert.ok(annotations.some(latex => latex.includes('\\kappa_x')), 'curvature components use proper kappa and subscripts')
        if (derivations.some(kind => kind !== 'uniform-strain')) {
          assert.ok(await dialog.getByLabel('Origin strain derived from the selected criterion', { exact: true }).count())
          assert.ok(await dialog.getByLabel('X and Y curvature components derived from the stored strain gradient normal', { exact: true }).count())
        }
      }

      assert.equal(await dialog.locator('[data-result-component]').count(), 1)
      assert.equal(await dialog.getByRole('heading', { name: 'Basic inputs', exact: true }).count(), 0)
      assert.equal(await dialog.getByRole('button', { name: 'Excel', exact: true }).count(), 0)
      assert.equal(await dialog.getByRole('combobox').count(), 0, 'a clicked value has no selection controls')
      assert.equal(await dialog.getByLabel('Calculation document contents').count(), 0, 'a clicked value has no full-document navigation')
      assert.equal(await dialog.getByRole('alert').count(), 0)
      const terms = dialog.locator('summary[data-detail-label]').first()
      if (await terms.count()) {
        assert.equal(await terms.evaluate(el => getComputedStyle(el, '::after').content), '"Calculation terms"')
        await terms.click()
        assert.equal(await dialog.getByRole('alert').count(), 0, 'expanded reinforcement equations render correctly')
        assert.ok(await dialog.getByRole('columnheader', { name: /^As / }).count())
        await terms.click()
      }
      checked.push({ source: row.kind, row: row.index, component, stage: row.evidence.stage, value: chartTableValue(row, component) })
      if (!leaveOpen) await close(action)
      return action
    }
    const verticalRows = rowsFor()
    assert.equal(await table.locator('tbody tr').count(), verticalRows.length)
    const physical = verticalRows.find(row => row.evidence.point.surfaceRole !== 'axial-cap' && row.index > 1)
    assert.ok(physical)
    await trace(physical, 'P', { keyboard: true, checkNarrow: true })
    await trace(physical, 'M')
    if (project.inputs.design.format === 'globalResultantFactor') {
      const branches = mechanics === 'as3600'
        ? ['axial-compression-controlled', 'combined-compression', 'combined-tension']
        : ['compression-controlled', 'transition', 'tension-controlled']
      for (const branch of branches) {
        const factorRow = verticalRows.find(row => row.evidence.point.surfaceRole === 'physical-state'
          && row.evidence.point.resistance?.classification === branch)
        assert.ok(factorRow, `${mechanics}: ${branch}`)
        const factorAction = await trace(factorRow, 'P', { leaveOpen: true })
        await dialog.locator('[data-factor-calculation]').first().scrollIntoViewIfNeeded()
        await page.screenshot({ path: `${out}/${mechanics}-factor-${branch}.png` })
        await close(factorAction)
      }
      await page.evaluate(() => { window.__traceAudit.missingFactor = true })
      const missingAction = table.getByRole('button', { name: `Trace P for row ${physical.index}`, exact: true })
      await missingAction.click()
      await dialog.getByRole('alert').waitFor()
      assert.equal(await dialog.locator('[data-result-component]').count(), 0)
      await close(missingAction)
      await page.evaluate(() => { window.__traceAudit.missingFactor = false })
    }

    const barCriterion = verticalRows.find(row => row.evidence.station?.definition.kind === 'bar-tension-yield-ratio' && row.evidence.point.surfaceRole !== 'axial-cap')
    const pole = verticalRows.find(row => row.evidence.station?.definition.kind === 'pure-tension')
    assert.ok(barCriterion && pole)
    let criterionAction = await trace(barCriterion, 'P', { leaveOpen: true })
    await dialog.locator('[data-strain-derivation]').first().scrollIntoViewIfNeeded()
    await page.screenshot({ path: `${out}/${mechanics}-criterion-derivation.png` })
    await close(criterionAction)
    if (stressMechanics) await trace(pole, 'P')
    else {
      const poleAction = table.getByRole('button', { name: `Trace P for row ${pole.index}`, exact: true })
      await poleAction.click()
      await dialog.getByRole('alert').waitFor()
      assert.equal(await dialog.locator('[data-result-component]').count(), 0)
      assert.ok((await dialog.innerText()).includes('no unique neutral-axis depth'))
      const source = await page.evaluate(() => window.__traceAudit.responses.at(-1)[0].audit)
      assert.equal(source.kind, 'unavailable')
      assert.equal(source.reason, 'missing-physical-state')
      await close(poleAction)
    }

    const cap = verticalRows.find(row => row.evidence.point.surfaceRole === 'axial-cap')
    if (cap) {
      await trace(cap, 'P')
      await trace(cap, 'M')
    }
    // Closing during an audit and opening a different value cannot expose the previous result.
    await page.evaluate(() => { window.__traceAudit.delay = 450 })
    const other = verticalRows.find(row => row.index > physical.index && row.evidence.point.surfaceRole !== 'axial-cap')
    assert.ok(other)
    let action = table.getByRole('button', { name: `Trace M for row ${physical.index}`, exact: true })
    await action.click()
    await dialog.waitFor()
    assert.equal(await dialog.locator('[data-result-component]').count(), 0)
    await close(action)
    action = table.getByRole('button', { name: `Trace P for row ${other.index}`, exact: true })
    await action.click()
    assert.equal(await dialog.locator('[data-result-component]').count(), 0)
    await dialog.locator('[data-result-component="P"]').waitFor()
    assert.equal(await dialog.locator('[data-result-component="P"]').getAttribute('data-canonical-value'), String(chartTableValue(other, 'P')))
    await close(action)
    await page.evaluate(() => { window.__traceAudit.delay = 0 })
    await page.getByRole('group', { name: 'Table resistance stage' }).getByText('Nominal', { exact: true }).click()
    const nominalPhysical = resolveChartTableRowSelection(rowsFor('vertical', 'nominal'), physical)
    assert.ok(nominalPhysical)
    await trace(nominalPhysical, 'P')
    await trace(nominalPhysical, 'M')
    await page.getByRole('group', { name: 'Table resistance stage' }).getByText('Design', { exact: true }).click()
    await page.getByRole('group', { name: 'Chart source', exact: true }).getByText('Fixed-P', { exact: true }).click()
    const fixedRows = rowsFor('fixedP')
    assert.equal(await table.locator('tbody tr').count(), fixedRows.length)
    const interpolated = fixedRows.find(row => row.evidence.bracket && !row.evidence.bracket.exact
      && Math.abs(chartTableValue(row, 'My')) > 1e6
      && resolveChartTableRowSelection(rowsFor('fixedP', 'nominal'), row))
    assert.ok(interpolated)
    await trace(interpolated, 'Mx')
    action = await trace(interpolated, 'My', { leaveOpen: true })
    assert.ok((await dialog.innerText()).includes('No strain plane is assigned to the interpolated point.'))
    await page.screenshot({ path: `${out}/${mechanics}-value-trace-light.png` })
    await close(action)
    await page.getByRole('group', { name: 'Table resistance stage' }).getByText('Nominal', { exact: true }).click()
    const nominalFixed = resolveChartTableRowSelection(rowsFor('fixedP', 'nominal'), interpolated)
    assert.ok(nominalFixed)
    await trace(nominalFixed, 'Mx')
    await trace(nominalFixed, 'My')

    // Test-only damaged evidence must suppress the completed selected result.
    await page.evaluate(() => { window.__traceAudit.corrupt = true })
    action = table.getByRole('button', { name: `Trace Mny for row ${nominalFixed.index}`, exact: true })
    await action.click()
    await dialog.getByRole('alert').waitFor()
    assert.equal(await dialog.locator('[data-result-component]').count(), 0)
    await close(action)
    await page.evaluate(() => { window.__traceAudit.corrupt = false })

    const surfacesBefore = await page.evaluate(() => window.__traceAudit.jobs.filter(job => job.type === 'buildSurface').length)
    await page.getByRole('button', { name: 'Options', exact: true }).click()
    await page.getByRole('tab', { name: 'Units', exact: true }).click()
    await page.getByRole('button', { name: 'US', exact: true }).click()
    presentation = UNIT_PRESETS.us
    await page.getByRole('button', { name: 'Capacity', exact: true }).click()
    await trace(physical, 'P', { checkNarrow: true })
    await page.getByRole('group', { name: 'Chart source', exact: true }).getByText('Fixed-P', { exact: true }).click()
    await trace(interpolated, 'Mx')
    assert.equal(await page.evaluate(() => window.__traceAudit.jobs.filter(job => job.type === 'buildSurface').length), surfacesBefore)
    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    action = await trace(interpolated, 'My', { leaveOpen: true })
    await page.screenshot({ path: `${out}/${mechanics}-value-trace-dark.png` })
    await page.setViewportSize({ width: 360, height: 900 })
    const bounds = await dialog.evaluate(el => ({ width: el.getBoundingClientRect().width, scrollWidth: el.scrollWidth }))
    assert.ok(bounds.width <= 360 && bounds.scrollWidth <= bounds.width + 1, 'dialog keeps overflow inside its tables on a phone')
    await page.screenshot({ path: `${out}/${mechanics}-value-trace-phone.png`, fullPage: true })
    await close(action)
    assert.deepEqual(errors, [])
    assert.deepEqual(await page.evaluate(() => window.__traceAudit.failures), [])
    assert.deepEqual([...criterionKinds].sort(), stressMechanics
      ? ['controlling-bar-strain', 'neutral-axis-depth', 'uniform-strain'] : ['controlling-bar-strain', 'neutral-axis-depth'])
    assert.ok(obliqueCurvatureCovered)
    evidence.push({ mechanics, checked, criterionKinds: [...criterionKinds], factorBranches: [...factorBranches], factorEvidenceRequired: true, obliqueCurvatureCovered, blockPoleRemainsUnavailable: !stressMechanics, tableValuesUseNormalType: '12px', modalTypeUnchanged: true, finalQuantityBoundsAndUnits: true, capCovered: !!cap, toolbarDimensions, sameCanonicalValuesInUS: true,
      staleAuditSuppressed: true, unreconciledFinalSuppressed: true, errors })
    await writeFile(`${out}/browser-evidence.json`, JSON.stringify(evidence, null, 2))
    await page.close()
  }
} catch (error) {
  if (activePage && !activePage.isClosed()) {
    await activePage.screenshot({ path: `${out}/failure.png`, fullPage: true })
    await writeFile(`${out}/failure.txt`, `${error.stack}\n\n${await activePage.locator('body').innerText()}`)
  }
  throw error
} finally {
  await browser.close()
}
console.log(JSON.stringify(evidence, null, 2))
