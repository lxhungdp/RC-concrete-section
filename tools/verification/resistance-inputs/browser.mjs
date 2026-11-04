/** UI ownership evidence; numerical definitions remain owned by @pm/design and the code profiles. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { applyCalculationProfileToMaterials, createAnalysisOptionsForProfile, createDesignBasisForCalculationProfile,
  parseProjectDocument, serializeProjectDocument } from '@pm/project'
import { createKdsAppendixDesignBasis } from '@pm/design'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PM_PLAYWRIGHT_MODULE ?? 'playwright')
const out = process.env.PM_EVIDENCE_DIR ?? 'outputs/resistance-inputs'
await mkdir(out, { recursive: true })
const browser = await chromium.launch({ channel: process.env.PM_BROWSER_CHANNEL ?? 'msedge', headless: true })
const evidence = []
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const cases = [
  ['kds-fibre', 'kds-2024-stress-strain'],
  ['kds-block', 'kds-142020-equivalent-block'],
  ['kds-appendix-fibre', 'kds-2024-stress-strain', true],
  ['kds-appendix-block', 'kds-142020-equivalent-block', true],
  ['aci', 'aci-318-19-22-equivalent-block'],
  ['en', 'en-1992-1-1-2004-stress-strain'],
  ['as', 'as-3600-2018-amd2-equivalent-block'],
  ['custom-fibre', 'custom-stress-strain'],
  ['custom-block', 'custom-equivalent-block']
]
let activePage
try {
  for (const [name, profile, appendix] of cases) {
    const source = JSON.parse(await readFile('docs/examples/equivalent-block/ACI-EB-01-rectangle-8-bars.pm-project.json', 'utf8'))
    source.inputs.calculationProfileId = profile
    source.inputs.materials = applyCalculationProfileToMaterials(source.inputs.materials, profile)
    source.inputs.analysis = createAnalysisOptionsForProfile(profile)
    source.inputs.design = appendix ? createKdsAppendixDesignBasis() : createDesignBasisForCalculationProfile(profile)
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
      window.__resistanceAudit = { surfaces: [], surfaceRequests: 0 }
      const Original = window.Worker
      window.Worker = class extends Original {
        constructor(...args) {
          super(...args)
          this.addEventListener('message', ({ data }) => {
            if (data.type === 'success' && data.requestType === 'buildSurface') window.__resistanceAudit.surfaces.push(JSON.stringify(data.result))
          })
        }
        postMessage(message, ...rest) {
          if (message.type === 'buildSurface') window.__resistanceAudit.surfaceRequests++
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
    await page.waitForFunction(() => window.__resistanceAudit.surfaces.length > 0, null, { timeout: 60000 })
    const inputs = async () => {
      await page.getByRole('button', { name: 'Project menu' }).click()
      await page.getByLabel('Project file format').selectOption('json')
      const downloading = page.waitForEvent('download')
      await page.getByRole('button', { name: 'Export project to JSON' }).click()
      return JSON.parse(await readFile(await (await downloading).path(), 'utf8')).inputs
    }
    const resistance = async () => {
      await page.getByRole('button', { name: 'Options', exact: true }).click()
      await page.getByRole('tab', { name: 'Resistance', exact: true }).click()
      await page.locator('.pm-design-panel').waitFor()
    }
    const materials = async () => {
      await page.getByRole('button', { name: 'Materials', exact: true }).click()
      await page.getByRole('tab', { name: 'Concrete', exact: true }).click()
    }
    const initial = await inputs()
    const originalAudit = await page.evaluate(() => structuredClone(window.__resistanceAudit))
    await resistance()
    const panel = page.locator('.pm-design-panel')
    const labels = await panel.locator('.pm-design-factor > span:first-child').allTextContents()
    const global = initial.design.format === 'globalResultantFactor'
    const as = name === 'as'
    const kdsTransition = global && initial.design.transition.type === 'fixed-or-yield-multiple'
    const expected = global ? as ? ['φo', 'φ · pure tension'] : ['φc · ties', 'φt',
      ...(kdsTransition ? ['εt,limit', 'fy threshold', 'High-strength εy multiplier'] : ['Δεt'])] :
      initial.design.minimumEccentricity ? ['e min · constant', 'e min · depth factor'] : []
    assert.deepEqual(labels, expected)
    assert.equal(await panel.getByLabel('Transverse reinforcement', { exact: true }).count(), 0)
    assert.equal(await panel.getByLabel('Column type').count(), 0)
    assert.equal(await panel.locator('input[type="checkbox"]').count(), 0)
    assert.equal(await panel.getByText('Design material strengths', { exact: true }).count(), 0)
    assert.equal(await panel.locator('button[title="Restore the selected profile defaults"]').count(), 0)
    assert.equal(await panel.getByLabel('AS compression-factor class').count(), as ? 1 : 0)
    await page.screenshot({ path: `${out}/${name}-light.png` })
    await materials()
    if (global && !as) assert.equal(await page.getByLabel('Column type').count(), 1)
    if (!global) assert.ok(await page.locator('.pm-material-parameters input[type="number"]').count() > 0)
    await resistance()
    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    await page.screenshot({ path: `${out}/${name}-dark.png` })
    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    assert.deepEqual(await inputs(), initial, 'opening Materials/Resistance and changing theme cannot mutate inputs')
    assert.deepEqual(await page.evaluate(() => window.__resistanceAudit), originalAudit,
      'presentation navigation cannot rebuild or replace the resistance surface')

    if (name === 'kds-fibre') {
      await materials()
      const cap = page.locator('.pm-material-axial-limit')
      await cap.getByLabel('Column type').selectOption('qualifying-spiral')
      await cap.locator('input[type="number"]').fill('0.81')
      const outsideReason = 'Project basis entered in Materials.'
      await cap.getByLabel('Reason for design modification', { exact: true }).fill(outsideReason)
      const outside = await inputs()
      assert.equal(outside.design.factors.axialCapSpiral, 0.81)
      assert.equal(outside.design.overrideReason, outsideReason)
      await resistance()
      assert.equal(await panel.getByLabel('φc · ties', { exact: true }).count(), 0)
      assert.equal(await panel.getByLabel('φc · spiral', { exact: true }).count(), 1)
      assert.equal(await panel.getByLabel('Reason for modification').count(), 0)
      await panel.getByLabel('φc · spiral', { exact: true }).fill('0.69')
      const changed = await inputs()
      const expected = structuredClone(outside)
      expected.design.factors.phiCompressionSpiral = 0.69
      assert.deepEqual(changed, expected, 'the active phi edit must preserve all outside and inactive values')
    }
    if (name === 'aci') {
      const pending = structuredClone(initial)
      await panel.getByLabel('φc · ties', { exact: true }).fill('0.64')
      await panel.getByText('A reason is required for a modified resistance profile.', { exact: true }).waitFor()
      assert.deepEqual(await inputs(), initial, 'a modified factor cannot publish before its required reason')
      const reason = panel.getByLabel('Reason for modification')
      await reason.fill('P')
      await reason.press('End')
      await reason.pressSequentially('roject basis entered in Resistance.')
      pending.design.factors.phiCompressionOther = 0.64
      pending.design.modified = true
      pending.design.verificationStatus = 'draft'
      pending.design.overrideReason = 'Project basis entered in Resistance.'
      assert.deepEqual(await inputs(), pending)
      await materials()
      assert.equal(await page.getByLabel('Reason for design modification', { exact: true }).inputValue(), pending.design.overrideReason)
      await resistance()
      assert.equal(await panel.getByLabel('Reason for modification').count(), 0)
      assert.deepEqual(await inputs(), pending, 'returning to Resistance must retain the outside reason without another editor')
    }
    if (as) {
      await panel.getByLabel('AS compression-factor class').selectOption('qualifying-spiral')
      assert.equal(await panel.getByLabel('φo', { exact: true }).inputValue(), String(initial.design.factors.phiCompressionSpiral))
      const changed = await inputs()
      const expected = structuredClone(initial)
      expected.design.transverseReinforcement = 'qualifying-spiral'
      expected.design.modified = true
      assert.deepEqual(changed, expected, 'AS class selection preserves both coefficients and the hidden transition')
    }
    await resistance()
    await page.setViewportSize({ width: 540, height: 850 })
    await page.screenshot({ path: `${out}/${name}-narrow.png` })
    assert.deepEqual(errors, [])
    evidence.push({ name, profile, labels, inputSha256: digest(initial), navigationSurfaceIdentity: true,
      navigationSurfaceJobs: 0, pageErrors: errors })
    console.log(`${name}: passed (${labels.length} independent numeric inputs)`)
    await page.close()
    activePage = null
  }
  await writeFile(`${out}/browser-evidence.json`, JSON.stringify(evidence, null, 2))
} catch (error) {
  if (activePage) await activePage.screenshot({ path: `${out}/failure.png` }).catch(() => {})
  throw error
} finally { await browser.close() }
