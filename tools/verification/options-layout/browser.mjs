/** Presentation-only row checks; option values and numerical behavior stay with their existing owners. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { applyCalculationProfileToMaterials, createAnalysisOptionsForProfile, createDesignBasisForCalculationProfile,
  createAdaptiveAnalysisOptions, createAdaptiveEquivalentBlockAnalysisOptions, createSteelHardeningDefinition, parseProjectDocument, serializeProjectDocument } from '@pm/project'
import { buildResistanceMaterialSets, withSteelModelModification } from '@pm/design'
import { compileSteelMaterial } from '@pm/materials'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PM_PLAYWRIGHT_MODULE ?? 'playwright')
const out = process.env.PM_EVIDENCE_DIR ?? 'outputs/options-layout'
await mkdir(out, { recursive: true })
const browser = await chromium.launch({ channel: process.env.PM_BROWSER_CHANNEL ?? 'msedge', headless: true })
const evidence = []
const cases = [
  ['fibre-fixed', 'kds-2024-stress-strain', 'fixed'],
  ['fibre-adaptive', 'kds-2024-stress-strain', 'adaptive'],
  ['fibre-explicit', 'kds-2024-stress-strain', 'explicit'],
  ['fibre-fixed-mesh', 'kds-2024-stress-strain', 'fixed-mesh'],
  ['block-fixed', 'aci-318-19-22-equivalent-block', 'fixed'],
  ['block-adaptive', 'aci-318-19-22-equivalent-block', 'adaptive'],
  ['as-choice', 'as-3600-2018-amd2-equivalent-block', 'resistance'],
  ['custom-choice', 'custom-equivalent-block', 'resistance'],
  ['fibre-column', 'kds-2024-stress-strain', 'materials'],
  ['block-column', 'aci-318-19-22-equivalent-block', 'materials'],
  ['fibre-curve', 'kds-2024-stress-strain', 'steel'],
  ['block-curve', 'kds-142020-equivalent-block', 'steel'],
  ['en-curve', 'en-1992-1-1-2004-stress-strain', 'steel']
]
let activePage
try {
  for (const [name, profile, variant] of cases) {
    if (process.env.PM_LAYOUT_FILTER && !name.includes(process.env.PM_LAYOUT_FILTER)) continue
    const source = JSON.parse(await readFile('docs/examples/equivalent-block/ACI-EB-01-rectangle-8-bars.pm-project.json', 'utf8'))
    source.inputs.calculationProfileId = profile
    source.inputs.materials = applyCalculationProfileToMaterials(source.inputs.materials, profile)
    source.inputs.design = createDesignBasisForCalculationProfile(profile)
    if (variant === 'steel') {
      source.inputs.materials.steel = source.inputs.materials.steel.map(material => ({ ...material,
        stressStrain: createSteelHardeningDefinition(profile, material, source.inputs.design) }))
      source.inputs.design = withSteelModelModification(source.inputs.design, source.inputs.materials)
    }
    if (name === 'block-column') {
      source.inputs.design.transverseReinforcement = 'qualifying-spiral'
      source.inputs.design.modified = true
    }
    const fibre = profile.endsWith('stress-strain')
    source.inputs.analysis = variant === 'adaptive'
      ? fibre ? createAdaptiveAnalysisOptions() : createAdaptiveEquivalentBlockAnalysisOptions()
      : createAnalysisOptionsForProfile(profile)
    if (variant === 'explicit') source.inputs.analysis.directions.seed = { type: 'explicit', anglesDeg: [0, 90, 180, 270] }
    if (variant === 'fixed-mesh') source.inputs.analysis.mesh.sizing = { type: 'fixed', cellSize: 10 }
    const parsed = parseProjectDocument(source)
    assert.ok(parsed.ok, parsed.ok ? '' : parsed.error)
    const fixture = `${out}/${name}.json`
    await writeFile(fixture, serializeProjectDocument(parsed.document))
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    activePage = page
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('dialog', dialog => dialog.accept())
    await page.addInitScript(() => {
      window.__optionsAudit = { requests: 0, surfaces: [] }
      const Original = window.Worker
      window.Worker = class extends Original {
        constructor(...args) {
          super(...args)
          this.addEventListener('message', ({ data }) => {
            if (data.type === 'success' && data.requestType === 'buildSurface') window.__optionsAudit.surfaces.push(JSON.stringify(data.result))
          })
        }
        postMessage(message, ...rest) {
          if (message.type === 'buildSurface') window.__optionsAudit.requests++
          return super.postMessage(message, ...rest)
        }
      }
    })
    await page.goto(process.env.PM_TEST_URL ?? 'http://127.0.0.1:3002', { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: 'Project menu' }).click()
    await page.getByLabel('Project file format').selectOption('json')
    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'Import project from JSON' }).click()
    await (await chooser).setFiles(fixture)
    await page.waitForFunction(() => window.__optionsAudit.surfaces.length > 0, null, { timeout: 60000 })
    const inputs = async () => {
      await page.getByRole('button', { name: 'Project menu' }).click()
      await page.getByLabel('Project file format').selectOption('json')
      const receiving = page.waitForEvent('download')
      await page.getByRole('button', { name: 'Export project to JSON' }).click()
      return JSON.parse(await readFile(await (await receiving).path(), 'utf8')).inputs
    }
    const before = await inputs()
    const audit = await page.evaluate(() => structuredClone(window.__optionsAudit))
    await page.getByRole('button', { name: variant === 'materials' || variant === 'steel' ? 'Materials' : 'Options', exact: true }).click()
    let dark = false
    const snapshots = []
    for (const width of ['desktop', 'minimum', 'mobile']) {
      if (width === 'minimum') await page.getByRole('separator', { name: 'Resize side panel' }).press('Home')
      if (width === 'mobile') await page.setViewportSize({ width: 540, height: 850 })
      for (const theme of ['light', 'dark']) {
        if (dark !== (theme === 'dark')) { await page.getByRole('button', { name: 'Theme', exact: true }).click(); dark = !dark }
        for (const tab of variant === 'steel' ? ['Steel'] : variant === 'materials' ? ['Concrete'] : variant === 'resistance' ? ['Resistance'] : ['Points', fibre ? 'Mesh' : 'Block']) {
          await page.getByRole('tab', { name: tab, exact: true }).click()
          await page.locator('.pm-panel-section h2').waitFor()
          const rows = page.locator(variant === 'steel' ? '.pm-material-param' : '.pm-option-field')
          if (variant === 'materials') await rows.last().scrollIntoViewIfNeeded()
          if (variant === 'steel') await page.getByLabel('Steel stress strain curve', { exact: true }).scrollIntoViewIfNeeded()
          const measured = await rows.evaluateAll(elements => elements.map(row => {
            const label = row.firstElementChild
            const input = row.querySelector('select, input')
            const box = row.querySelector('.ws-field-group') ?? input
            const labelBox = label.getBoundingClientRect()
            const field = box.getBoundingClientRect()
            const bounds = row.getBoundingClientRect()
            const range = document.createRange()
            range.selectNodeContents(label)
            const text = range.getBoundingClientRect()
            const style = getComputedStyle(input)
            const context = document.createElement('canvas').getContext('2d')
            context.font = style.font
            const values = input.tagName === 'SELECT' ? [...input.options].map(option => option.textContent) : [input.value || input.placeholder || '']
            const required = Math.max(...values.map(value => context.measureText(value).width)) +
              parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth)
            return { label: label.textContent, labelRight: text.right, fieldLeft: field.left, fieldRight: field.right,
              rowRight: bounds.right, labelCentre: labelBox.y + labelBox.height / 2, fieldCentre: field.y + field.height / 2,
              rowHeight: bounds.height, fieldHeight: field.height, inputWidth: input.getBoundingClientRect().width, required }
          }))
          if (tab !== 'Block') assert.ok(measured.length > 0)
          for (const row of measured) {
            assert.ok(Math.abs(row.labelCentre - row.fieldCentre) < 1, `${name}/${tab}/${width}: stacked ${row.label}`)
            assert.ok(row.labelRight < row.fieldLeft, `${name}/${tab}/${width}: label overlap ${JSON.stringify(row)}`)
            assert.ok(row.fieldRight <= row.rowRight + 1, `${name}/${tab}/${width}: field overflow ${row.label}`)
            assert.ok(row.rowHeight <= row.fieldHeight + 1, `${name}/${tab}/${width}: wrapped row ${row.label}`)
            assert.ok(row.inputWidth + 1 >= row.required, `${name}/${tab}/${width}: clipped value ${JSON.stringify(row)}`)
          }
          let materialFieldWidths
          if (variant === 'steel') {
            assert.equal(await page.getByLabel('Curve stage', { exact: true }).count(), 0)
            const designSteel = buildResistanceMaterialSets(parsed.document.inputs.materials, parsed.document.inputs.design).designMaterials.steel[0]
            const designYield = compileSteelMaterial(designSteel).limits.epsYield
            assert.ok(Number.isFinite(designYield))
            assert.ok((await page.locator('.pm-material-curve > p').first().innerText()).includes(designYield.toPrecision(5)), `${name}: the curve uses the Design material`)
            materialFieldWidths = await page.locator('.pm-material-param > input, .pm-material-param > .ws-field-group')
              .evaluateAll(elements => elements.map(element => element.getBoundingClientRect().width))
            assert.ok(materialFieldWidths.length >= 3)
            assert.ok(materialFieldWidths.every(value => Math.abs(value - materialFieldWidths[0]) < 1), `${name}/${width}: material value frames stay equal`)
          }
          snapshots.push({ width, theme, tab, measured, materialFieldWidths })
          await page.screenshot({ path: `${out}/${name}-${tab}-${width}-${theme}.png` })
        }
      }
    }
    const numeric = page.locator('.pm-option-field input').first()
    if (await numeric.count()) { await numeric.focus(); await numeric.press('Enter') }
    assert.deepEqual(await inputs(), before, 'layout navigation and no-op edits retain canonical inputs')
    assert.deepEqual(await page.evaluate(() => window.__optionsAudit), audit, 'presentation navigation cannot rebuild the surface')
    assert.deepEqual(errors, [])
    evidence.push({ name, profile, snapshots, canonicalInputPreserved: true, retainedSurfacePreserved: true, pageErrors: errors })
    console.log(`${name}: passed (${snapshots.length} layout snapshots)`)
    await page.close()
    activePage = null
  }
  await writeFile(`${out}/browser-evidence.json`, JSON.stringify(evidence, null, 2))
} catch (error) {
  if (activePage) await activePage.screenshot({ path: `${out}/failure.png` }).catch(() => {})
  throw error
} finally { await browser.close() }
