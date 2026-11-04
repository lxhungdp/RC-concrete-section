/** Reproduce generator edits across panel unmounts; supply the installed Playwright runtime. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PM_PLAYWRIGHT_MODULE ?? 'playwright')
const browser = await chromium.launch({ channel: process.env.PM_BROWSER_CHANNEL ?? 'msedge', headless: true })
const out = 'outputs/units'
await mkdir(out, { recursive: true })
const evidence = []
try {
  for (const [name, file] of [
    ['stress-strain', 'docs/examples/realistic-sections/KDS-REAL-05-complex-stress-strain.pm-project.json'],
    ['equivalent-block', 'docs/examples/equivalent-block/ACI-EB-01-rectangle-8-bars.pm-project.json']
  ]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript(() => {
      window.__generatorAudit = { jobs: [], surfaces: [] }
      const OriginalWorker = window.Worker
      window.Worker = class extends OriginalWorker {
        constructor(...args) {
          super(...args)
          this.addEventListener('message', ({ data }) => {
            if (data.type === 'success' && data.requestType === 'buildSurface') window.__generatorAudit.surfaces.push(JSON.stringify(data.result))
          })
        }
        postMessage(message, ...rest) { window.__generatorAudit.jobs.push(message.type); return super.postMessage(message, ...rest) }
      }
    })
    await page.goto(process.env.PM_TEST_URL ?? 'http://127.0.0.1:3001', { waitUntil: 'networkidle' })
    const importProject = async () => {
      await page.getByRole('button', { name: 'Project menu' }).click()
      await page.getByLabel('Project file format').selectOption('json')
      const chooser = page.waitForEvent('filechooser')
      await page.getByRole('button', { name: 'Import project from JSON' }).click()
      await (await chooser).setFiles(file)
    }
    await importProject()
    await page.waitForFunction(() => window.__generatorAudit.surfaces.length > 0, null, { timeout: 60000 })
    const exportInputs = async () => {
      await page.getByRole('button', { name: 'Project menu' }).click()
      await page.getByLabel('Project file format').selectOption('json')
      const received = page.waitForEvent('download')
      await page.getByRole('button', { name: 'Export project to JSON' }).click()
      return JSON.parse(await readFile(await (await received).path(), 'utf8')).inputs
    }
    const rebar = async () => {
      await page.getByRole('button', { name: 'Section', exact: true }).click()
      await page.getByRole('tab', { name: 'Rebar', exact: true }).click()
    }
    const units = async preset => {
      await page.getByRole('button', { name: 'Options', exact: true }).click()
      await page.getByRole('tab', { name: 'Units', exact: true }).click()
      await page.getByRole('button', { name: preset === 'us' ? 'US' : 'Metric', exact: true }).click()
      await rebar()
    }
    const field = label => page.getByText(label, { exact: true }).locator('..').locator('input')
    const edit = async (label, text, key = 'Enter') => {
      const input = field(label)
      await input.focus()
      await input.fill(text)
      await input.press(key)
    }
    const originalInputs = await exportInputs()
    await units('us')
    await page.waitForTimeout(500)
    const originalAudit = await page.evaluate(() => structuredClone(window.__generatorAudit))
    // Exact user sequence: delete trailing characters instead of replacing the entire value.
    await field('Cover').focus()
    assert.equal(await field('Cover').inputValue(), '1.574803149606299')
    await field('Cover').press('End')
    while ((await field('Cover').inputValue()).length > 4) await field('Cover').press('Backspace')
    assert.equal(await field('Cover').inputValue(), '1.57')
    await field('Cover').press('Enter')
    await units('metric')
    assert.equal(await field('Cover').inputValue(), '39.878')
    await units('us')
    assert.equal(await field('Cover').inputValue(), '1.57')
    await field('Cover').focus()
    assert.equal(await field('Cover').inputValue(), '1.57')
    await field('Cover').press('Tab')
    // Direct blur during menu navigation also commits in the captured source unit.
    await field('Cover').focus()
    await field('Cover').fill('1.58')
    await units('metric')
    assert.equal(await field('Cover').inputValue(), '40.132')
    await units('us')
    await edit('Cover', '1.57')
    await edit('Cover', '1.50', 'Escape')
    await edit('Cover', '')
    assert.equal(await field('Cover').getAttribute('aria-invalid'), 'true')
    await field('Cover').press('Escape')
    assert.equal(await field('Cover').inputValue(), '1.57')
    await edit('Dia', '0.75')
    await edit('Count', '6')
    await page.getByRole('button', { name: 'Spacing', exact: true }).click()
    await edit('Spacing', '3.5')
    await page.getByLabel('Replace existing bars').uncheck()
    await units('metric')
    assert.equal(await field('Cover').inputValue(), '39.878')
    assert.equal(await field('Dia').inputValue(), '19.05')
    assert.equal(await field('Spacing').inputValue(), '88.9')
    assert.equal(await page.getByRole('button', { name: 'Spacing', exact: true }).getAttribute('aria-pressed'), 'true')
    assert.equal(await page.getByLabel('Replace existing bars').isChecked(), false)
    await page.getByRole('tab', { name: 'Concrete', exact: true }).click()
    await page.getByRole('tab', { name: 'Rebar', exact: true }).click()
    assert.equal(await field('Cover').inputValue(), '39.878')
    await page.getByRole('button', { name: 'Top / Bottom', exact: true }).click()
    assert.equal(await field('Count').inputValue(), '6')
    for (let cycle = 0; cycle < 3; cycle++) { await units('us'); await units('metric') }
    await page.getByRole('button', { name: 'Theme', exact: true }).click()
    await page.screenshot({ path: `${out}/${name}-retained-generator.png` })
    assert.deepEqual(await exportInputs(), originalInputs, 'generator edits remain proposals until Generate')
    const retainedAudit = await page.evaluate(() => structuredClone(window.__generatorAudit))
    assert.deepEqual(retainedAudit.surfaces, originalAudit.surfaces, 'the retained resistance surface is unchanged')
    const newJobs = retainedAudit.jobs.slice(originalAudit.jobs.length)
    // Opening Options remounts its existing mesh viewer; only that view request is expected.
    assert.deepEqual(newJobs.filter(type => type !== 'buildSectionMesh'), [], 'generator edits/navigation submit no resistance or demand calculations')
    let generatedBarCount = null
    if (name === 'equivalent-block') {
      await page.getByLabel('Replace existing bars').check()
      await page.getByRole('button', { name: 'Generate', exact: true }).click()
      const generated = await exportInputs()
      const bars = generated.geometry.rebars
      generatedBarCount = bars.length
      assert.equal(bars.length, 12)
      // Independent rectangle oracle: longitudinal centers are 39.878 mm from the faces.
      for (const bar of bars) {
        // Bound the source-unit ratio and multiplication by four binary64 rounding units.
        assert.ok(Math.abs(bar.dia - 19.05) <= 4 * Number.EPSILON * 19.05)
        assert.equal(Math.abs(bar.y), 210.122)
      }
      assert.equal(Math.min(...bars.map(bar => bar.x)), -160.122)
      assert.equal(Math.max(...bars.map(bar => bar.x)), 160.122)
      const expectedInputs = structuredClone(originalInputs)
      expectedInputs.geometry.rebars = bars
      assert.deepEqual(generated, expectedInputs, 'Generate changes only the proposed bars')
    }
    await importProject()
    await page.waitForTimeout(500)
    await rebar()
    assert.equal(await field('Cover').inputValue(), '40')
    assert.equal(await field('Dia').inputValue(), '20')
    assert.equal(await field('Count').inputValue(), '4')
    assert.equal(await page.getByLabel('Replace existing bars').isChecked(), true)
    assert.deepEqual(errors, [])
    evidence.push({ name, coverIn: 1.57, canonicalCoverMm: 39.878, directBlurMm: 40.132,
      diameterMm: 19.05, spacingMm: 88.9, count: 6, survivesPanelUnmount: true,
      noOpCancelInvalidPreserved: true, resistanceJobsBeforeGenerate: 0,
      meshViewRequests: newJobs.filter(type => type === 'buildSectionMesh').length, generatedBarCount,
      projectImportResetsTransientForm: true, consoleErrors: errors })
    await page.close()
  }
  await writeFile(`${out}/rebar-generator-evidence.json`, JSON.stringify(evidence, null, 2))
  console.log(JSON.stringify(evidence, null, 2))
} finally { await browser.close() }
