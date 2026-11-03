import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { applyCalculationProfileToMaterials, createAnalysisOptionsForProfile, createDesignBasisForCalculationProfile, parseProjectDocument, serializeProjectDocument } from '@pm/project'
import { buildResistanceMaterialSets } from '@pm/design'
import { geometryInputRebars, rebarArea } from '@pm/geometry'

// Analytic uniform-tension resultant; allow only floating summation roundoff in worker comparison.
const tensionPole = (source, profile, peakRatio, cutoffFactor, physicalLimit) => {
  const materials = structuredClone(source.inputs.materials)
  materials.steel = materials.steel.map((steel) => ({ ...steel, stressStrain: {
    type: 'linear-hardening', ultimateStrength: { type: 'ratio', ratio: peakRatio }, epsUk: 0.05,
    strainLimit: { type: 'factor', value: cutoffFactor }
  } }))
  const basis = source.inputs.design
  const effective = buildResistanceMaterialSets(materials, basis).stateMaterials
  // Independent line interpolation; do not use the production steel compiler for this oracle.
  const laws = new Map(effective.steel.map((steel) => {
    const fy = steel.fy * (steel.factors?.resistanceScale ?? 1) / (steel.factors?.gammaS ?? 1)
    const epsY = fy / steel.elasticModulus
    return [steel.id, {
      limit: Math.min(0.05 * cutoffFactor, steel.limits?.epsU ?? Infinity, physicalLimit ?? Infinity),
      tensileStress: (strain) => strain <= epsY ? steel.elasticModulus * strain
        : fy * (1 + (peakRatio - 1) * (strain - epsY) / (0.05 - epsY))
    }]
  }))
  const bars = geometryInputRebars(source.inputs.geometry)
  const limit = Math.min(...bars.map((bar) => laws.get(bar.steelMaterialId ?? materials.defaults.steelMaterialId).limit))
  const route = profile.endsWith('equivalent-block') ? 'equivalent-block' : 'stress-strain'
  const P = bars.reduce((sum, bar) => sum - rebarArea(bar, route) * laws.get(bar.steelMaterialId ?? materials.defaults.steelMaterialId).tensileStress(limit), 0)
  return P * (basis.format === 'globalResultantFactor' ? basis.factors.phiTension : 1)
}
const waitForPole = (page, expected) => page.waitForFunction(({ expected, tolerance }) => {
  const value = window.__steelAudit.surface?.bounds.P[0]
  return value !== undefined && Math.abs(value - expected) <= tolerance
}, { expected, tolerance: 128 * Number.EPSILON * Math.max(1, Math.abs(expected)) }, { timeout: 120000 })
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) <= 256 * Number.EPSILON * Math.max(1, Math.abs(expected)), `${actual} versus ${expected}`)
const pathCoordinates = async (curve) => (await curve.locator('path').first().getAttribute('d')).match(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi).map(Number)
const samePath = async (curve, expected) => {
  const actual = await pathCoordinates(curve)
  assert.equal(actual.length, expected.length)
  actual.forEach((value, index) => near(value, expected[index]))
}
const curvePosition = (curve) => curve.evaluate((element) => {
  const rect = element.getBoundingClientRect()
  let top = rect.top
  for (let parent = element.parentElement; parent; parent = parent.parentElement) top += parent.scrollTop
  return { top, width: rect.width, height: rect.height }
})
const sameCurvePosition = async (curve, expected) => {
  const actual = await curvePosition(curve)
  for (const key of ['top', 'width', 'height']) near(actual[key], expected[key])
}
const verifyMaterialFields = async (page) => {
  const measured = await page.locator('.pm-material-param').evaluateAll((labels) => labels.map((label) => {
    const symbol = label.firstElementChild
    const field = label.querySelector(':scope > .ws-field-group, :scope > input')
    const range = document.createRange()
    range.selectNodeContents(symbol)
    const text = range.getBoundingClientRect()
    const rect = field.getBoundingClientRect()
    const compound = field.matches('.pm-material-strength-input')
    return { symbol: compound ? 'k / fuk' : symbol.textContent, compound,
      typeset: compound || symbol.querySelector('var') !== null,
      symbolStyle: [getComputedStyle(symbol).display, getComputedStyle(symbol).gap, getComputedStyle(symbol).font],
      grid: getComputedStyle(label).gridTemplateColumns, labelLeft: label.getBoundingClientRect().left,
      textRight: text.right, textMiddle: (text.top + text.bottom) / 2,
      left: rect.left, middle: (rect.top + rect.bottom) / 2, width: rect.width, height: rect.height }
  }))
  assert.ok(measured.length >= 2)
  for (const field of measured) {
    near(field.width, measured[0].width)
    near(field.height, measured[0].height)
    assert.ok(field.typeset, `${field.symbol} uses mathematical notation.`)
    if (!field.compound) {
      assert.ok(field.textRight <= field.left, `${field.symbol} stays beside its input without overlap: ${JSON.stringify(field)}`)
      assert.ok(Math.abs(field.textMiddle - field.middle) <= 4, `${field.symbol} stays on the input's row.`)
    }
  }
  for (const group of await page.locator('.pm-material-parameters').all()) {
    const fields = group.locator(':scope > .pm-material-param')
    if (await fields.count() >= 2) {
      const first = await fields.nth(0).boundingBox()
      const second = await fields.nth(1).boundingBox()
      near(first.y, second.y)
      assert.ok(second.x >= first.x + first.width, 'Each parameter row has two values.')
    }
  }
  return { count: measured.length, width: measured[0].width, height: measured[0].height }
}
const verifySteelLayout = async (page, curve) => {
  await verifyMaterialFields(page)
  const name = page.getByRole('textbox', { name: 'Name', exact: true })
  const nameRow = await name.locator('..').evaluate((label) => {
    const caption = label.querySelector('span').getBoundingClientRect()
    const field = label.querySelector('input').getBoundingClientRect()
    return { captionMiddle: (caption.top + caption.bottom) / 2, fieldMiddle: (field.top + field.bottom) / 2, captionRight: caption.right, fieldLeft: field.left }
  })
  near(nameRow.captionMiddle, nameRow.fieldMiddle)
  assert.ok(nameRow.captionRight <= nameRow.fieldLeft)
  assert.equal(await page.getByLabel('Strain view', { exact: true }).count(), 0)
  const yieldField = page.getByRole('spinbutton', { name: 'Yield strain εy', exact: true })
  assert.ok(await yieldField.getAttribute('readonly') !== null)
  assert.match(await yieldField.locator('..').locator('..').textContent(), /Stress–strain/)
  const yieldWidth = await yieldField.evaluate((element) => {
    const style = getComputedStyle(element)
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    context.font = style.font
    return { actual: element.clientWidth, required: context.measureText(element.value).width
      + Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight) + 20 }
  })
  assert.ok(yieldWidth.actual >= yieldWidth.required, 'Yield strain fits with padding and the native spinner.')
  const chart = await curve.boundingBox()
  const checkbox = await page.getByRole('checkbox', { name: 'Post-yield hardening', exact: true }).boundingBox()
  assert.ok(checkbox.y >= chart.y + chart.height, 'The hardening checkbox follows the chart.')
  const group = page.getByRole('group', { name: 'Hardening parameters', exact: true })
  if (await group.count()) {
    const options = page.getByRole('radiogroup', { name: 'Strength input', exact: true })
    const radio = await options.getByRole('radio').first().boundingBox()
    near(checkbox.y + checkbox.height / 2, radio.y + radio.height / 2)
    assert.ok(await options.evaluate((element) => element.parentElement.querySelector('input[type="checkbox"]') !== null))
    const radioLeft = await options.evaluate((element) => element.getBoundingClientRect().left + element.parentElement.scrollLeft)
    const strengthField = group.getByRole('group', { name: 'Ultimate strength k and fuk', exact: true })
    const strengthLeft = await strengthField.evaluate((element) => element.getBoundingClientRect().left)
    near(radioLeft, strengthLeft)
    assert.equal(await strengthField.locator('input').count(), 2)
    assert.equal(await strengthField.locator('input[readonly]').count(), 1, 'Exactly one strength value is derived.')
    const colors = await strengthField.locator('input').evaluateAll((inputs) => inputs.map((input) => ({
      readOnly: input.readOnly, color: getComputedStyle(input).color,
      muted: getComputedStyle(input).getPropertyValue('--foreground-muted').trim()
    })))
    assert.notEqual(colors[0].color, colors[1].color, 'The derived half is visually muted.')
    assert.equal(await strengthField.locator('var, sub, em').count(), 0, 'The split input contains values only.')
    const halves = await strengthField.locator('input').all()
    near((await halves[0].boundingBox()).width, (await halves[1].boundingBox()).width)
    const divider = await strengthField.evaluate((element) => ({
      position: Number.parseFloat(getComputedStyle(element, '::after').left) + Number.parseFloat(getComputedStyle(element).borderLeftWidth),
      middle: element.getBoundingClientRect().width / 2
    }))
    near(divider.position, divider.middle)
    const fields = await group.boundingBox()
    assert.ok(fields.y >= chart.y + chart.height, 'Conditional hardening inputs follow the chart.')
  }
}
const curveStyle = (curve) => curve.evaluate((element) => {
  const figure = element.closest('.pm-material-curve')
  const figureStyle = getComputedStyle(figure)
  const path = getComputedStyle(element.querySelector('path'))
  const axis = getComputedStyle(element.querySelector('[aria-label="Strain axis"]'))
  const text = getComputedStyle(element.querySelector('text'))
  const caption = getComputedStyle(figure.querySelector('p'))
  const rect = element.getBoundingClientRect()
  return {
    viewBox: element.getAttribute('viewBox'), size: [rect.width, rect.height],
    figure: [figureStyle.padding, figureStyle.borderWidth, figureStyle.backgroundColor, figureStyle.rowGap],
    path: [path.stroke, path.strokeWidth, path.strokeLinecap, path.strokeLinejoin],
    axis: [axis.stroke, axis.strokeWidth],
    text: [text.fontFamily, text.fontSize, text.fontWeight, text.fill],
    caption: [caption.fontFamily, caption.fontSize, caption.color, caption.lineHeight]
  }
})
const verifyStrainProjections = async (curve, epsUk, epsUd) => {
  const markers = curve.locator('g[aria-label="Ultimate strain axis markers"]')
  const separate = epsUd !== epsUk
  assert.equal(await markers.locator('line').count(), separate ? 2 : 1)
  const y0 = Number(await curve.locator('line').first().getAttribute('y1'))
  const x0 = Number(await curve.locator('line').nth(1).getAttribute('x1'))
  for (const line of await markers.locator('line').all()) {
    assert.equal(await line.getAttribute('x1'), await line.getAttribute('x2'))
    near(Number(await line.getAttribute('y2')), y0)
    assert.equal(await line.getAttribute('stroke-dasharray'), '3 4')
  }
  const xUd = Number(await markers.locator('circle').first().getAttribute('cx'))
  const xUk = separate ? Number(await markers.locator('circle').nth(1).getAttribute('cx')) : xUd
  assert.ok(xUd > x0 && xUk >= xUd, 'Steel shows positive tensile magnitudes only.')
  near(Math.abs((xUd - x0) / (xUk - x0)), epsUd / epsUk)
  for (const point of await markers.locator('circle').all()) near(Number(await point.getAttribute('cy')), y0)
  assert.match(await markers.textContent(), /εud/)
  assert.match(await markers.textContent(), /εuk/)
  const subscripts = await markers.locator('tspan[baseline-shift="sub"]').allTextContents()
  assert.ok(subscripts.includes('ud') && subscripts.includes('uk'), 'Axis symbols use SVG subscripts.')
}

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PM_PLAYWRIGHT_MODULE ?? 'playwright')
const out = process.env.PM_EVIDENCE_DIR ?? 'outputs/steel-hardening'
await mkdir(out, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const evidence = []
const concreteStylesByStroke = new Map()
let activePage = null
try {
  for (const profile of ['kds-2024-stress-strain', 'kds-142020-equivalent-block', 'en-1992-1-1-2004-stress-strain']) {
    const source = JSON.parse(await readFile('docs/examples/realistic-sections/KDS-REAL-05-complex-stress-strain.pm-project.json', 'utf8'))
    source.inputs.calculationProfileId = profile
    source.inputs.materials = applyCalculationProfileToMaterials(source.inputs.materials, profile)
    source.inputs.analysis = createAnalysisOptionsForProfile(profile)
    if (source.inputs.analysis.mesh) source.inputs.analysis.mesh.sizing = { type: 'automatic', seedDivisions: 8 }
    source.inputs.design = createDesignBasisForCalculationProfile(profile)
    source.inputs.materials.steel = source.inputs.materials.steel.map((steel) => ({ ...steel, stressStrain: {
      type: 'linear-hardening', ultimateStrength: { type: 'ratio', ratio: 1.1 }, epsUk: 0.05,
      strainLimit: { type: 'factor', value: profile.startsWith('en-') ? 0.9 : 0.8 }
    } }))
    const parsed = parseProjectDocument(source)
    assert.ok(parsed.ok, parsed.ok ? '' : parsed.error)
    const fixture = `${out}/${profile}.json`
    await writeFile(fixture, serializeProjectDocument(parsed.document))
    const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
    activePage = page
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('dialog', (dialog) => dialog.accept())
    await page.addInitScript(() => {
      window.__steelAudit = { surface: null, failures: [], expectedInputRejections: [] }
      const invalidJobs = new Set()
      const Original = window.Worker
      window.Worker = class extends Original {
        postMessage(request, transfer) {
          if (request.type === 'buildSurface' && request.payload.materialStore.steel.some((steel) => {
            const model = steel.stressStrain
            if (model.type !== 'linear-hardening') return false
            const fu = model.ultimateStrength.type === 'ratio' ? steel.fy * model.ultimateStrength.ratio : model.ultimateStrength.stress
            const cutoff = model.strainLimit.type === 'factor' ? model.epsUk * model.strainLimit.value : model.strainLimit.value
            const yieldStrain = steel.fy / steel.elasticModulus
            return ![fu, steel.fy, model.epsUk, cutoff, yieldStrain].every(Number.isFinite)
              || !(fu > steel.fy && cutoff > yieldStrain && cutoff <= model.epsUk && model.epsUk > yieldStrain)
          })) invalidJobs.add(request.jobId)
          return transfer === undefined ? super.postMessage(request) : super.postMessage(request, transfer)
        }
        constructor(...args) {
          super(...args)
          this.addEventListener('message', ({ data }) => {
            if (data.type === 'error') {
              if (invalidJobs.has(data.jobId) && /Steel hardening requires/.test(data.message)) window.__steelAudit.expectedInputRejections.push(data)
              else window.__steelAudit.failures.push(data)
            }
            if (data.type === 'success' && data.requestType === 'buildSurface') window.__steelAudit.surface = data.result.surface
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
    await page.getByRole('button', { name: 'Materials', exact: true }).click()
    await page.getByRole('tab', { name: 'Concrete', exact: true }).click()
    await page.screenshot({ path: `${out}/${profile}-concrete-inline.png` })
    await verifyMaterialFields(page)
    const concreteCurve = page.getByLabel('Stress strain curve', { exact: true })
    const concreteStyle = await concreteCurve.count() ? await curveStyle(concreteCurve) : null
    if (concreteStyle) {
      concreteStylesByStroke.set(concreteStyle.path[0], concreteStyle)
      await concreteCurve.screenshot({ path: `${out}/${profile}-concrete-reference.png` })
    }
    await page.getByRole('tab', { name: 'Steel', exact: true }).click()
    const hardening = page.getByRole('checkbox', { name: 'Post-yield hardening', exact: true })
    assert.ok(await hardening.isChecked())
    const endpoint = page.getByRole('group', { name: 'Hardening parameters', exact: true })
    const epsUk = endpoint.getByRole('spinbutton', { name: /endpoint/ })
    const strengthOptions = page.getByRole('radiogroup', { name: 'Strength input', exact: true })
    const strengthRatio = strengthOptions.getByRole('radio', { name: 'k = fuk / fy', exact: true })
    const strengthStress = strengthOptions.getByRole('radio', { name: 'fuk', exact: true })
    const ratio = endpoint.getByLabel('Strength ratio k', { exact: true })
    const fuk = endpoint.getByRole('textbox', { name: /^fuk \(/ })
    const percent = endpoint.getByLabel('αε (%)', { exact: true })
    const direct = endpoint.getByLabel('εud (ratio)', { exact: true })
    const curve = page.getByLabel('Steel stress strain curve', { exact: true })
    await verifySteelLayout(page, curve)
    const initialSteelStyle = await curveStyle(curve)
    // Equivalent-block Concrete has no stress-strain miniature; reuse the measured fibre reference for its theme.
    const referenceStyle = concreteStyle ?? concreteStylesByStroke.get(initialSteelStyle.path[0])
    assert.ok(referenceStyle, 'A rendered Concrete reference must exist for the current theme.')
    assert.deepEqual(initialSteelStyle, referenceStyle, 'Steel uses the rendered Concrete frame and shared style.')
    const initialFactor = profile.startsWith('en-') ? 0.9 : 0.8
    const defaultPercent = profile.startsWith('en-') ? 90 : 100
    assert.equal(await endpoint.locator('input:visible:not([type="radio"])').count(), 5, 'Five displayed values represent three independent inputs.')
    assert.ok(await fuk.getAttribute('readonly') !== null)
    near(Number(await fuk.inputValue()), source.inputs.materials.steel[0].fy * 1.1)
    assert.equal(await endpoint.locator('select').count(), 0)
    assert.equal(await page.locator('.pm-material-stress-box details').count(), 0)
    const toggleLabel = hardening.locator('..')
    const borderWidths = () => toggleLabel.evaluate((element) => {
      const style = getComputedStyle(element)
      return [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth]
    })
    assert.deepEqual(await borderWidths(), ['0px', '0px', '0px', '0px'])
    await toggleLabel.hover()
    assert.deepEqual(await borderWidths(), ['0px', '0px', '0px', '0px'])
    const choiceLabels = strengthOptions.locator(':scope > label')
    const divider = await choiceLabels.nth(1).evaluate((element) => ({
      width: getComputedStyle(element).borderInlineStartWidth,
      padding: Number.parseFloat(getComputedStyle(element).paddingInlineStart)
    }))
    assert.equal(divider.width, '1px')
    assert.ok(divider.padding > 0)
    assert.deepEqual(await choiceLabels.nth(0).locator('sub').allTextContents(), ['uk', 'y'])
    assert.equal(await endpoint.locator('label[for] sub').textContent(), 'uk')
    near(Number(await percent.inputValue()), initialFactor * 100)
    const importedPath = await pathCoordinates(curve)
    const preciseCutoff = await direct.getAttribute('title')
    assert.equal(Number(preciseCutoff), 0.05 * initialFactor)
    await direct.focus()
    await direct.fill(await direct.inputValue())
    await direct.press('Tab')
    assert.equal(await direct.getAttribute('title'), preciseCutoff, 'An unchanged edit preserves full model precision.')
    await samePath(curve, importedPath)
    await strengthStress.check()
    assert.ok(await ratio.getAttribute('readonly') !== null)
    assert.equal(await fuk.getAttribute('readonly'), null)
    assert.notEqual(await ratio.evaluate((input) => getComputedStyle(input).color), await fuk.evaluate((input) => getComputedStyle(input).color))
    near(Number(await fuk.inputValue()), source.inputs.materials.steel[0].fy * 1.1)
    await samePath(curve, importedPath)
    await fuk.evaluate((input) => {
      window.__strengthEditEvents = []
      for (const name of ['focus', 'input', 'change', 'blur']) input.addEventListener(name, () => window.__strengthEditEvents.push({ name, value: input.value, readOnly: input.readOnly }))
    })
    await fuk.focus()
    await fuk.fill(String(source.inputs.materials.steel[0].fy * 1.2))
    near(Number(await fuk.inputValue()), source.inputs.materials.steel[0].fy * 1.2)
    await fuk.press('Tab')
    await page.waitForFunction(() => Number(document.querySelector('[aria-label="Strength ratio k"]').value) === 1.2, undefined, { timeout: 5000 })
    near(Number(await ratio.inputValue()), 1.2)
    await fuk.fill(String(source.inputs.materials.steel[0].fy * 1.1))
    await fuk.press('Tab')
    await page.waitForFunction(() => Number(document.querySelector('[aria-label="Strength ratio k"]').value) === 1.1, undefined, { timeout: 5000 })
    await samePath(curve, importedPath)
    await direct.fill('0.03')
    await direct.fill(String(0.05 * initialFactor))
    near(Number(await direct.inputValue()), 0.05 * initialFactor)
    await samePath(curve, importedPath)
    await page.screenshot({ path: `${out}/${profile}-direct-inputs.png` })
    await page.getByRole('button', { name: 'Project menu' }).click()
    const exportDownload = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export project to JSON' }).click()
    const exportedPath = `${out}/${profile}-ui-inputs.json`
    await (await exportDownload).saveAs(exportedPath)
    const exported = JSON.parse(await readFile(exportedPath, 'utf8'))
    assert.ok(parseProjectDocument(exported).ok)
    assert.equal(exported.inputs.materials.steel[0].stressStrain.ultimateStrength.type, 'stress')
    assert.equal(exported.inputs.materials.steel[0].stressStrain.strainLimit.type, 'absolute')
    near(exported.inputs.materials.steel[0].stressStrain.strainLimit.value, 0.05 * initialFactor)
    await strengthRatio.check()
    assert.equal(await ratio.getAttribute('readonly'), null)
    assert.ok(await fuk.getAttribute('readonly') !== null)
    await ratio.fill('1.2')
    near(Number(await fuk.inputValue()), source.inputs.materials.steel[0].fy * 1.2)
    await ratio.fill('1')
    await curve.locator('path').first().waitFor({ state: 'detached', timeout: 5000 })
    await ratio.fill('1.1')
    await samePath(curve, importedPath)
    await percent.fill('100')
    await percent.fill(String(initialFactor * 100))
    await samePath(curve, importedPath)
    await verifyStrainProjections(curve, 0.05, 0.05 * initialFactor)
    await page.getByLabel('Steel stress strain curve').scrollIntoViewIfNeeded()
    await page.screenshot({ path: `${out}/${profile}-light.png` })
    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    await page.screenshot({ path: `${out}/${profile}-dark.png` })
    const alternateSteelStyle = await curveStyle(curve)
    await page.getByRole('tab', { name: 'Concrete', exact: true }).click()
    await verifyMaterialFields(page)
    if (await concreteCurve.count()) {
      const alternateConcreteStyle = await curveStyle(concreteCurve)
      concreteStylesByStroke.set(alternateConcreteStyle.path[0], alternateConcreteStyle)
      assert.deepEqual(alternateConcreteStyle, alternateSteelStyle, 'Style parity also holds in the other theme.')
      await concreteCurve.screenshot({ path: `${out}/${profile}-concrete-alternate-theme.png` })
    } else assert.deepEqual(alternateSteelStyle, concreteStylesByStroke.get(alternateSteelStyle.path[0]))
    await page.getByRole('tab', { name: 'Steel', exact: true }).click()
    await page.getByRole('button', { name: 'Capacity', exact: true }).click()
    await page.waitForFunction(() => window.__steelAudit.surface !== null, undefined, { timeout: 120000 })
    const on = await page.evaluate(() => ({ p: window.__steelAudit.surface.bounds.P[0], errors: window.__steelAudit.failures }))
    await page.getByRole('button', { name: 'Materials', exact: true }).click()
    await page.getByRole('tab', { name: 'Steel', exact: true }).click()
    await page.evaluate(() => { window.__steelAudit.surface = null })
    const fixedCurvePosition = await curvePosition(curve)
    await hardening.uncheck()
    assert.equal(await endpoint.count(), 0)
    assert.ok(await curve.isVisible(), 'Off retains the plateau chart.')
    await sameCurvePosition(curve, fixedCurvePosition)
    await verifySteelLayout(page, curve)
    const plateauPath = await curve.locator('path').first().getAttribute('d')
    await curve.screenshot({ path: `${out}/${profile}-off-curve.png` })
    await page.getByRole('button', { name: 'Capacity', exact: true }).click()
    await page.waitForFunction(() => window.__steelAudit.surface !== null, undefined, { timeout: 120000 })
    const off = await page.evaluate(() => window.__steelAudit.surface.bounds.P[0])
    assert.notEqual(on.p, off, 'The selected law must change the actual worker capacity.')
    await page.getByRole('button', { name: 'Materials', exact: true }).click()
    await page.getByRole('tab', { name: 'Steel', exact: true }).click()
    await page.evaluate(() => { window.__steelAudit.surface = null })
    await hardening.check()
    assert.equal(await endpoint.locator('input:visible:not([type="radio"])').count(), 5)
    assert.equal(Number(await epsUk.inputValue()), 0.05)
    assert.equal(Number(await ratio.inputValue()), 1.08)
    assert.equal(Number(await percent.inputValue()), defaultPercent)
    near(Number(await direct.inputValue()), 0.05 * defaultPercent / 100)
    assert.ok(await curve.isVisible(), 'On immediately retains the populated chart without manual input.')
    await sameCurvePosition(curve, fixedCurvePosition)
    await verifySteelLayout(page, curve)
    assert.ok(await curve.locator('path').count() > 0)
    assert.notEqual(await curve.locator('path').first().getAttribute('d'), plateauPath)
    await verifyStrainProjections(curve, 0.05, 0.05 * defaultPercent / 100)
    await page.screenshot({ path: `${out}/${profile}-auto-on.png` })
    await page.getByRole('button', { name: 'Capacity', exact: true }).click()
    await waitForPole(page, tensionPole(source, profile, 1.08, profile.startsWith('en-') ? 0.9 : 1))
    const autoOn = await page.evaluate(() => window.__steelAudit.surface.bounds.P[0])
    await page.getByRole('button', { name: 'Materials', exact: true }).click()
    await page.getByRole('tab', { name: 'Steel', exact: true }).click()
    const fy = page.getByRole('textbox', { name: /^fy \(/ })
    const initialFy = source.inputs.materials.steel[0].fy
    await fy.fill(String(initialFy + 100))
    await fy.press('Tab')
    await strengthStress.check()
    near(Number(await fuk.inputValue()), (initialFy + 100) * 1.08)
    await fy.fill(String(initialFy))
    await fy.press('Tab')
    near(Number(await fuk.inputValue()), (initialFy + 100) * 1.08)
    await strengthRatio.check()
    near(Number(await ratio.inputValue()), (initialFy + 100) * 1.08 / initialFy)
    await ratio.fill('1.08')
    await epsUk.fill('0.06')
    const heldCutoff = Number(await direct.inputValue())
    near(heldCutoff, 0.06 * defaultPercent / 100)
    await direct.fill('0.04')
    await direct.fill(String(heldCutoff))
    await epsUk.fill('0.07')
    assert.equal(Number(await direct.inputValue()), heldCutoff, 'Direct epsUd remains fixed when epsUk changes.')
    await epsUk.fill('0.06')
    await percent.fill(String(defaultPercent - 1))
    await percent.fill(String(defaultPercent))
    near(Number(await percent.inputValue()), defaultPercent)
    await epsUk.fill('0.05')
    await percent.fill('120')
    await curve.locator('path').first().waitFor({ state: 'detached', timeout: 5000 })
    assert.equal(await curve.locator('path').count(), 0, 'A cutoff beyond epsUk fails closed.')
    await percent.fill(String(defaultPercent))
    await epsUk.fill('')
    await curve.locator('path').first().waitFor({ state: 'detached', timeout: 5000 })
    assert.ok(await curve.isVisible(), 'An incomplete edit keeps chart axes visible.')
    assert.equal(await curve.locator('path').count(), 0, 'An invalid edit must not fabricate a stress curve.')
    assert.ok(await page.getByRole('status').filter({ hasText: /hardening requires/ }).isVisible())
    await curve.screenshot({ path: `${out}/${profile}-invalid-frame.png` })
    await epsUk.fill('0.05')
    await ratio.fill('1.1')
    await page.screenshot({ path: `${out}/${profile}-unified-dark.png` })
    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    await page.screenshot({ path: `${out}/${profile}-unified-light.png` })
    await page.getByRole('button', { name: 'Capacity', exact: true }).click()
    await waitForPole(page, tensionPole(source, profile, 1.1, profile.startsWith('en-') ? 0.9 : 1))
    const threeInputOn = await page.evaluate(() => window.__steelAudit.surface.bounds.P[0])
    await page.getByRole('button', { name: 'Materials', exact: true }).click()
    await page.getByRole('tab', { name: 'Steel', exact: true }).click()
    const tangentBefore = (await page.getByText(/· Eh =/).textContent()).split('· Eh =')[1]
    await percent.fill(String(initialFactor * 100))
    assert.equal((await page.getByText(/· Eh =/).textContent()).split('· Eh =')[1], tangentBefore)
    await direct.fill('0.001')
    await curve.locator('path').first().waitFor({ state: 'detached', timeout: 5000 })
    assert.equal(await curve.locator('path').count(), 0, 'A cutoff before yield fails closed.')
    await direct.fill(String(0.05 * initialFactor))
    await page.getByRole('button', { name: 'Capacity', exact: true }).click()
    await waitForPole(page, tensionPole(source, profile, 1.1, initialFactor))
    const directOn = await page.evaluate(() => window.__steelAudit.surface.bounds.P[0])
    near(directOn, on.p)
    await page.getByRole('button', { name: 'Materials', exact: true }).click()
    await page.getByRole('tab', { name: 'Steel', exact: true }).click()
    const physicalDocument = structuredClone(exported)
    physicalDocument.inputs.materials.steel[0].limits = { ...physicalDocument.inputs.materials.steel[0].limits, epsU: 0.02 }
    const physicalFixture = `${out}/${profile}-physical-inputs.json`
    await writeFile(physicalFixture, JSON.stringify(physicalDocument))
    await page.getByRole('button', { name: 'Project menu' }).click()
    const physicalChooser = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'Import project from JSON' }).click()
    await (await physicalChooser).setFiles(physicalFixture)
    await page.getByRole('button', { name: 'Materials', exact: true }).click()
    await page.getByRole('tab', { name: 'Steel', exact: true }).click()
    assert.ok(await page.getByText(/Active tensile limit = 0.020000/).isVisible())
    await curve.screenshot({ path: `${out}/${profile}-physical-curve.png` })
    await page.getByRole('button', { name: 'Capacity', exact: true }).click()
    await waitForPole(page, tensionPole(source, profile, 1.1, initialFactor, 0.02))
    const physicalOn = await page.evaluate(() => window.__steelAudit.surface.bounds.P[0])
    await page.getByRole('button', { name: 'Materials', exact: true }).click()
    await page.getByRole('tab', { name: 'Steel', exact: true }).click()
    await page.getByRole('button', { name: 'Clear physical bound', exact: true }).click()
    assert.equal(await page.getByText(/Physical εphys =/).count(), 0)
    await verifyStrainProjections(curve, 0.05, 0.05 * initialFactor)
    await percent.fill('99.99')
    await verifyStrainProjections(curve, 0.05, 0.05 * 0.9999)
    const closeLabels = curve.locator('g[aria-label="Ultimate strain axis markers"] text')
    assert.notEqual(await closeLabels.nth(0).getAttribute('y'), await closeLabels.nth(1).getAttribute('y'))
    await curve.screenshot({ path: `${out}/${profile}-close-axis-points.png` })
    await percent.fill(String(initialFactor * 100))
    await page.getByLabel('Curve stage', { exact: true }).selectOption('design')
    await page.getByLabel('Steel stress strain curve').scrollIntoViewIfNeeded()
    await page.setViewportSize({ width: 1000, height: 760 })
    await page.getByLabel('Steel stress strain curve').scrollIntoViewIfNeeded()
    await page.getByLabel('Steel stress strain curve').screenshot({ path: `${out}/${profile}-design-tension-curve.png` })
    await verifyStrainProjections(curve, 0.05, 0.05 * initialFactor)
    await verifySteelLayout(page, curve)
    await page.screenshot({ path: `${out}/${profile}-design-tension-narrow.png` })
    const resizer = page.getByRole('separator', { name: 'Resize side panel', exact: true })
    await resizer.focus()
    await resizer.press('Home')
    await curve.scrollIntoViewIfNeeded()
    await verifySteelLayout(page, curve)
    const minimumCurvePosition = await curvePosition(curve)
    await hardening.uncheck()
    await sameCurvePosition(curve, minimumCurvePosition)
    await hardening.check()
    await sameCurvePosition(curve, minimumCurvePosition)
    // Restore the fixture's law after checking minimum-width expansion/default initialization.
    await ratio.fill('1.1')
    await percent.fill(String(initialFactor * 100))
    await page.screenshot({ path: `${out}/${profile}-sidebar-minimum.png` })
    await resizer.press('Escape')
    await page.getByRole('button', { name: 'Capacity', exact: true }).click()
    await page.waitForFunction((expected) => {
      const value = window.__steelAudit.surface?.bounds.P[0]
      return value !== undefined && Math.abs(value - expected) < 1e-8
    }, on.p, { timeout: 120000 })
    const editedOn = await page.evaluate(() => window.__steelAudit.surface.bounds.P[0])
    assert.ok(Math.abs(editedOn - on.p) < 1e-8, 'Manual field entry must reproduce the imported law capacity.')
    assert.deepEqual(errors, [])
    assert.deepEqual(on.errors, [])
    assert.deepEqual(await page.evaluate(() => window.__steelAudit.failures), [])
    evidence.push({ profile, displayedHardeningValues: 5, independentHardeningValues: 3, hardeningTension: on.p, plateauTension: off,
      autoInitializedTension: autoOn, chartVisibleForOnAndOff: true, chartFrameVisibleWhileInvalid: true,
      defaultCutoffPercent: defaultPercent, strengthRadioPreservesCurve: true, linkedCutoffsSaved: true,
      noInputModeMenus: true, noAdvancedDisclosure: true, verticalStrainAxisProjections: true,
      concreteFrameAndStyleMatch: true,
      tensileViewOnly: true, yieldStrainBesideHeading: true, fixedChartAboveHardeningInputs: true,
      expectedInvalidInputRejections: await page.evaluate(() => window.__steelAudit.expectedInputRejections.length),
      threeInputEndpointTension: threeInputOn, directCutoffTension: directOn, physicalBoundTension: physicalOn,
      manuallyEnteredHardeningTension: editedOn, pageErrors: errors })
    await page.close()
    activePage = null
  }
  for (const profile of ['aci-318-19-22-equivalent-block', 'as-3600-2018-amd2-equivalent-block', 'custom-stress-strain', 'custom-equivalent-block']) {
    const source = JSON.parse(await readFile('docs/examples/realistic-sections/KDS-REAL-05-complex-stress-strain.pm-project.json', 'utf8'))
    source.inputs.calculationProfileId = profile
    source.inputs.materials = applyCalculationProfileToMaterials(source.inputs.materials, profile)
    source.inputs.analysis = createAnalysisOptionsForProfile(profile)
    source.inputs.design = createDesignBasisForCalculationProfile(profile)
    const parsed = parseProjectDocument(source)
    assert.ok(parsed.ok, parsed.ok ? '' : parsed.error)
    const fixture = `${out}/${profile}-inline.json`
    await writeFile(fixture, serializeProjectDocument(parsed.document))
    const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
    activePage = page
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('dialog', (dialog) => dialog.accept())
    await page.goto(process.env.PM_TEST_URL ?? 'http://127.0.0.1:3001', { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: 'Project menu' }).click()
    await page.getByLabel('Project file format').selectOption('json')
    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'Import project from JSON' }).click()
    await (await chooser).setFiles(fixture)
    await page.getByRole('button', { name: 'Materials', exact: true }).click()
    const sizes = []
    for (const tab of ['Concrete', 'Steel']) {
      await page.getByRole('tab', { name: tab, exact: true }).click()
      sizes.push(await verifyMaterialFields(page))
      await page.screenshot({ path: `${out}/${profile}-${tab.toLowerCase()}-inline.png` })
      await page.getByRole('button', { name: 'Theme', exact: true }).click()
      await verifyMaterialFields(page)
      await page.setViewportSize({ width: 1000, height: 760 })
      const resizer = page.getByRole('separator', { name: 'Resize side panel', exact: true })
      await resizer.focus()
      await resizer.press('Home')
      await verifyMaterialFields(page)
      await page.screenshot({ path: `${out}/${profile}-${tab.toLowerCase()}-inline-minimum.png` })
      await resizer.press('Escape')
      await page.setViewportSize({ width: 1500, height: 1000 })
      await resizer.press('End')
      await resizer.press('Escape')
      await page.getByRole('button', { name: 'Theme', exact: true }).click()
    }
    // Width depends on sidebar width; both tabs retain the same primitive height.
    near(sizes[0].height, sizes[1].height)
    assert.deepEqual(errors, [])
    evidence.push({ profile, inlineMaterialFields: true, twoValuesPerRow: true, mathematicalSymbols: true, pageErrors: errors })
    await page.close()
    activePage = null
  }
  await writeFile(`${out}/browser-evidence.json`, JSON.stringify(evidence, null, 2))
  console.log(JSON.stringify(evidence))
} catch (error) {
  if (activePage) console.error(await activePage.evaluate(() => window.__strengthEditEvents))
  if (activePage) console.error(await activePage.evaluate(() => [...document.querySelectorAll('[aria-label="Hardening parameters"] input')]
    .map((input) => ({ label: input.getAttribute('aria-label'), value: input.value, checked: input.checked,
      readOnly: input.readOnly, title: input.title, invalid: input.getAttribute('aria-invalid') }))))
  throw error
} finally {
  await browser.close()
}
